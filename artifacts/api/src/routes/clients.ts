import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, clientsTable, clientStagesTable, clientFilesTable, ordersTable, orderInstallmentsTable, usersTable, intakesTable, bookingsTable, companiesTable, type Client } from "@workspace/db";
import { ClientStageUpdateBody, ClientFileBody, InstallmentActionBody, ownerFirstName, cents } from "@workspace/shared";
import { authMiddleware, requireCompany, requirePermission } from "../lib/auth";
import { loadClientBundle, progressOf, stageViews, leadForClient } from "../lib/portal";
import { chargeInstallment, installmentsFor, orderLinks } from "../lib/orders";
import { issueMagicLink } from "../lib/magicLink";
import { sendCompanyMail } from "../lib/companyMail";
import { heading, paragraph, button, escapeHtml } from "../lib/email";
import { publishedContent } from "./siteContent";
import { logActivity } from "../lib/leads";
import { audit } from "../lib/audit";
import { checkoutMode } from "../lib/stripe";

const router: IRouter = Router();
const base = [authMiddleware, requireCompany] as const;

async function loadClient(companyId: number, id: string): Promise<Client | null> {
  const clientId = Number(id);
  if (!Number.isInteger(clientId)) return null;
  const [c] = await db.select().from(clientsTable).where(and(eq(clientsTable.companyId, companyId), eq(clientsTable.id, clientId))).limit(1);
  return c ?? null;
}

async function ownerFirst(companyId: number, fallback: string) {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company) return fallback;
  const brand = (await publishedContent(company)).content.brand;
  return ownerFirstName(brand) || company.ownerName.split(/\s+/)[0] || fallback;
}

const installmentView = (i: Awaited<ReturnType<typeof installmentsFor>>[number]) => ({ id: i.id, seq: i.seq, amountCents: i.amountCents, dueAt: i.dueAt?.toISOString() ?? null, status: i.status, paidAt: i.paidAt?.toISOString() ?? null, attempts: i.attempts, lastError: i.lastError });

/** Every paying client with where they are. */
router.get("/companies/:companyId/clients", ...base, requirePermission("clients", "read"), async (req, res) => {
  const company = req.company!;
  const clients = await db.select().from(clientsTable).where(eq(clientsTable.companyId, company.id)).orderBy(desc(clientsTable.createdAt));
  const ids = clients.map((c) => c.id);
  const [stages, orders, intakes, logins] = ids.length
    ? await Promise.all([
        db.select().from(clientStagesTable).where(inArray(clientStagesTable.clientId, ids)),
        db.select().from(ordersTable).where(inArray(ordersTable.clientId, ids)).orderBy(desc(ordersTable.createdAt)),
        db.select().from(intakesTable).where(inArray(intakesTable.clientId, ids)),
        db.select({ id: usersTable.id, lastLoginAt: usersTable.lastLoginAt }).from(usersTable).where(inArray(usersTable.id, clients.map((c) => c.userId ?? -1))),
      ])
    : [[], [], [], []];
  const leadIds = clients.map((c) => c.leadId).filter((x): x is number => x != null);
  const bookings = leadIds.length ? await db.select().from(bookingsTable).where(and(inArray(bookingsTable.leadId, leadIds), eq(bookingsTable.status, "scheduled"))) : [];
  const orderIds = orders.map((o) => o.id);
  const installments = orderIds.length ? await db.select().from(orderInstallmentsTable).where(inArray(orderInstallmentsTable.orderId, orderIds)) : [];
  res.json({
    clients: clients.map((c) => {
      const mine = stages.filter((s) => s.clientId === c.id).sort((a, b) => a.sort - b.sort);
      const myOrders = orders.filter((o) => o.clientId === c.id);
      const paid = myOrders.find((o) => o.status === "paid") ?? myOrders[0] ?? null;
      const booking = c.leadId ? bookings.find((b) => b.leadId === c.leadId) ?? null : null;
      const done = mine.filter((s) => s.status === "done" || (s.key === "interview" && booking)).length;
      const current = mine.find((s) => s.status === "current") ?? mine.find((s) => s.status !== "done") ?? null;
      const outstanding = installments.filter((i) => myOrders.some((o) => o.id === i.orderId) && i.status !== "paid" && i.status !== "canceled" && i.status !== "refunded");
      return {
        id: c.id,
        publicId: c.publicId,
        name: c.name,
        email: c.email,
        phone: c.phone,
        linkedin: c.linkedin,
        leadId: c.leadId,
        createdAt: c.createdAt.toISOString(),
        offerName: paid?.offerName ?? null,
        orderStatus: paid?.status ?? null,
        // Net of partial refunds; fully refunded charges drop out by status.
        paidCents: myOrders.filter((o) => o.status === "paid").reduce((s, o) => s + o.amountCents - o.refundedCents, 0) + installments.filter((i) => myOrders.some((o) => o.id === i.orderId) && i.status === "paid").reduce((s, i) => s + i.amountCents - i.refundedCents, 0),
        outstandingCents: outstanding.reduce((s, i) => s + i.amountCents, 0),
        failedInstallments: outstanding.filter((i) => i.status === "failed").length,
        progress: { done, total: mine.length, pct: mine.length ? Math.round((done / mine.length) * 100) : 0 },
        currentStage: current ? { key: current.key, label: current.label } : null,
        intakeDone: intakes.some((i) => i.clientId === c.id && i.completedAt),
        bookedAt: booking?.startAt?.toISOString() ?? (booking ? "scheduled" : null),
        lastLoginAt: logins.find((l) => l.id === c.userId)?.lastLoginAt?.toISOString() ?? null,
        hasPortalLogin: Boolean(c.userId),
      };
    }),
    checkoutMode: checkoutMode(),
  });
});

router.get("/companies/:companyId/clients/:clientId", ...base, requirePermission("clients", "read"), async (req, res) => {
  const company = req.company!;
  const client = await loadClient(company.id, String(req.params.clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  const bundle = await loadClientBundle(client);
  const first = await ownerFirst(company.id, company.name);
  const stages = stageViews(bundle, first);
  const lead = await leadForClient(client);
  const paid = bundle.orders.find((o) => o.status === "paid") ?? bundle.orders[0] ?? null;
  res.json({
    client: { id: client.id, publicId: client.publicId, name: client.name, email: client.email, phone: client.phone, linkedin: client.linkedin, leadId: client.leadId, createdAt: client.createdAt.toISOString() },
    stages,
    progress: progressOf(stages),
    files: bundle.files.map((f) => ({ id: f.id, name: f.name, url: f.url, stageKey: f.stageKey, createdAt: f.createdAt.toISOString() })),
    orders: bundle.orders.map((o) => ({ id: o.id, publicId: o.publicId, offerKey: o.offerKey, offerName: o.offerName, status: o.status, plan: o.paymentMode, installmentsCount: o.installments, amountCents: o.amountCents, bumps: o.bumps, paidAt: o.paidAt?.toISOString() ?? null, refundedAt: o.refundedAt?.toISOString() ?? null, refundedCents: o.refundedCents, stripePaymentIntentId: o.stripePaymentIntentId, createdAt: o.createdAt.toISOString(), installments: o.schedule.map(installmentView) })),
    bookings: bundle.bookings.map((b) => ({ id: b.id, startAt: b.startAt?.toISOString() ?? null, status: b.status, confirmed: b.confirmed, eventUri: b.eventUri })),
    intake: bundle.intake ? { completedAt: bundle.intake.completedAt?.toISOString() ?? null, data: bundle.intake.data } : null,
    login: bundle.login,
    links: paid ? await orderLinks(company, paid, lead) : null,
    checkoutMode: checkoutMode(),
  });
});

router.patch("/companies/:companyId/clients/:clientId/stages/:stageId", ...base, requirePermission("clients", "write"), async (req, res) => {
  const company = req.company!;
  const client = await loadClient(company.id, String(req.params.clientId));
  const parsed = ClientStageUpdateBody.safeParse(req.body);
  if (!client || !parsed.success) {
    res.status(client ? 400 : 404).json({ error: client ? (parsed.success ? "Invalid" : parsed.error.issues[0]?.message) : "Client not found" });
    return;
  }
  const stageId = Number(req.params.stageId);
  const [stage] = await db.select().from(clientStagesTable).where(and(eq(clientStagesTable.clientId, client.id), eq(clientStagesTable.id, stageId))).limit(1);
  if (!stage) {
    res.status(404).json({ error: "Stage not found" });
    return;
  }
  const { status, note, notify } = parsed.data;
  await db.update(clientStagesTable).set({ status, note: note ?? stage.note, completedAt: status === "done" ? (stage.completedAt ?? new Date()) : status === "pending" ? null : stage.completedAt }).where(eq(clientStagesTable.id, stage.id));
  if (status === "done") {
    const all = await db.select().from(clientStagesTable).where(eq(clientStagesTable.clientId, client.id));
    const next = all.filter((s) => s.sort > stage.sort && s.status === "pending").sort((a, b) => a.sort - b.sort)[0];
    if (next && !all.some((s) => s.status === "current")) await db.update(clientStagesTable).set({ status: "current" }).where(eq(clientStagesTable.id, next.id));
  }
  const lead = await leadForClient(client);
  if (lead) await logActivity(lead, "system", `${stage.label} → ${status}${note ? ` · ${note}` : ""}`, { actorUserId: req.user!.userId, meta: { clientId: client.id, stageKey: stage.key } });
  let notified = false;
  if (notify && status === "done" && stage.key !== "payment") {
    const first = await ownerFirst(company.id, company.name);
    const paid = (await db.select().from(ordersTable).where(and(eq(ordersTable.clientId, client.id), eq(ordersTable.status, "paid"))).limit(1))[0] ?? null;
    const links = paid ? await orderLinks(company, paid, lead) : null;
    const r = await sendCompanyMail(company, {
      to: client.email,
      subject: `${stage.label} · an update on your profile`,
      template: "stage_update",
      body: heading(`${stage.label} — done`) + paragraph(note ? escapeHtml(note) : `${escapeHtml(first)} just moved your profile forward. ${stage.key === "draft" ? "Your draft is ready for review." : stage.key === "blueprint" ? "Your Brand Voice Blueprint is ready." : "Open your portal to see where things stand."}`) + (links ? button(links.portal, "Open my portal", "#1668F0") : ""),
      metadata: { clientId: client.id, stageKey: stage.key },
    });
    notified = r.success;
  }
  await audit(req, { action: "client_stage_updated", resourceType: "client", resourceId: client.id, companyId: company.id, details: { stage: stage.key, status, notified } });
  const bundle = await loadClientBundle(client);
  const views = stageViews(bundle, await ownerFirst(company.id, company.name));
  res.json({ stages: views, progress: progressOf(views), notified });
});

router.post("/companies/:companyId/clients/:clientId/files", ...base, requirePermission("clients", "write"), async (req, res) => {
  const company = req.company!;
  const client = await loadClient(company.id, String(req.params.clientId));
  const parsed = ClientFileBody.safeParse(req.body);
  if (!client || !parsed.success) {
    res.status(client ? 400 : 404).json({ error: client ? (parsed.success ? "Invalid" : parsed.error.issues[0]?.message) : "Client not found" });
    return;
  }
  const { name, url, stageKey, notify } = parsed.data;
  const [file] = await db.insert(clientFilesTable).values({ clientId: client.id, name, url, stageKey, uploadedBy: req.user!.userId }).returning();
  let notified = false;
  if (notify) {
    const r = await sendCompanyMail(company, { to: client.email, subject: `A new file is ready: ${name}`, template: "client_file", body: heading("A new file in your portal") + paragraph(`${escapeHtml(name)} is ready for you.`) + button(url, "Open the file", "#1668F0"), metadata: { clientId: client.id, fileId: file.id } });
    notified = r.success;
  }
  res.status(201).json({ file: { id: file.id, name: file.name, url: file.url, stageKey: file.stageKey, createdAt: file.createdAt.toISOString() }, notified });
});

router.delete("/companies/:companyId/clients/:clientId/files/:fileId", ...base, requirePermission("clients", "write"), async (req, res) => {
  const company = req.company!;
  const client = await loadClient(company.id, String(req.params.clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  await db.delete(clientFilesTable).where(and(eq(clientFilesTable.clientId, client.id), eq(clientFilesTable.id, Number(req.params.fileId))));
  res.json({ ok: true });
});

/** Email the client a fresh one-tap portal link. */
router.post("/companies/:companyId/clients/:clientId/portal-link", ...base, requirePermission("clients", "write"), async (req, res) => {
  const company = req.company!;
  const client = await loadClient(company.id, String(req.params.clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  if (!client.userId) {
    res.status(409).json({ error: "This client has no portal login (their email already belongs to another account)." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, client.userId)).limit(1);
  if (!user || user.deactivatedAt) {
    res.status(409).json({ error: "This client's login is deactivated." });
    return;
  }
  const r = await issueMagicLink(user, req.ip ?? null);
  res.json({ ok: true, sent: r.sent, devLink: r.devLink ?? null });
});

/** Settle an installment: charge the saved card now, record money taken elsewhere, or cancel it. */
router.post("/companies/:companyId/orders/:orderId/installments/:installmentId", ...base, requirePermission("billing", "write"), async (req, res) => {
  const company = req.company!;
  const parsed = InstallmentActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pick an action" });
    return;
  }
  const [order] = await db.select().from(ordersTable).where(and(eq(ordersTable.companyId, company.id), eq(ordersTable.id, Number(req.params.orderId)))).limit(1);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const [inst] = await db.select().from(orderInstallmentsTable).where(and(eq(orderInstallmentsTable.orderId, order.id), eq(orderInstallmentsTable.id, Number(req.params.installmentId)))).limit(1);
  if (!inst) {
    res.status(404).json({ error: "Installment not found" });
    return;
  }
  if (inst.status === "paid") {
    res.status(409).json({ error: "Already paid" });
    return;
  }
  if (parsed.data.action === "cancel") {
    // Only an installment nobody is collecting right now can be canceled (a "processing" one may already be charged).
    const [updated] = await db.update(orderInstallmentsTable).set({ status: "canceled", updatedAt: new Date() }).where(and(eq(orderInstallmentsTable.id, inst.id), inArray(orderInstallmentsTable.status, ["scheduled", "failed"]))).returning();
    if (!updated) {
      res.status(409).json({ error: `This installment is ${inst.status} and can't be canceled` });
      return;
    }
    await audit(req, { action: "installment_canceled", resourceType: "order", resourceId: order.id, companyId: company.id, details: { seq: inst.seq } });
    res.json({ ok: true, installment: installmentView(updated) });
    return;
  }
  const r = await chargeInstallment(inst, { manual: parsed.data.action === "mark_paid" });
  await audit(req, { action: parsed.data.action === "charge" ? "installment_charged" : "installment_marked_paid", resourceType: "order", resourceId: order.id, companyId: company.id, details: { seq: inst.seq, ok: r.ok, error: r.error, amount: cents(inst.amountCents) } });
  if (!r.ok) {
    res.status(r.pending ? 202 : r.error?.includes("already being processed") ? 409 : 402).json({ error: r.error ?? "Charge failed", pending: Boolean(r.pending), installment: installmentView(r.installment) });
    return;
  }
  res.json({ ok: true, installment: installmentView(r.installment) });
});

export default router;
