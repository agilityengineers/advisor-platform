import { and, asc, desc, eq } from "drizzle-orm";
import { db, clientsTable, clientStagesTable, clientFilesTable, intakesTable, ordersTable, orderInstallmentsTable, bookingsTable, usersTable, leadsTable, type Client, type ClientStage, type Company, type Order, type OrderInstallment, type Intake, type Booking, type ClientFile } from "@workspace/db";
import { PORTAL_STAGES, cents, type IntakeData, type PortalStageKey } from "@workspace/shared";
import { newPublicId } from "./tokens";
import { logger } from "./logger";

/** Find or create the paying client behind an order, plus their portal login. */
export async function ensureClient(company: Company, input: { name: string; email: string; phone?: string; linkedin?: string; leadId?: number | null }): Promise<Client> {
  const email = input.email.toLowerCase();
  const [existing] = await db.select().from(clientsTable).where(and(eq(clientsTable.companyId, company.id), eq(clientsTable.email, email))).limit(1);
  let client = existing ?? null;
  if (!client) {
    [client] = await db
      .insert(clientsTable)
      .values({ publicId: newPublicId("cl_"), companyId: company.id, leadId: input.leadId ?? null, name: input.name, email, phone: input.phone ?? "", linkedin: input.linkedin ?? "" })
      .returning();
  } else {
    const patch: Partial<typeof clientsTable.$inferInsert> = { updatedAt: new Date() };
    if (!client.leadId && input.leadId) patch.leadId = input.leadId;
    if (!client.phone && input.phone) patch.phone = input.phone;
    if (!client.linkedin && input.linkedin) patch.linkedin = input.linkedin;
    [client] = await db.update(clientsTable).set(patch).where(eq(clientsTable.id, client.id)).returning();
  }
  if (!client.userId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user) {
      const [created] = await db.insert(usersTable).values({ name: input.name, email, role: "client", companyId: company.id, perms: {}, phone: input.phone || null }).returning();
      [client] = await db.update(clientsTable).set({ userId: created.id }).where(eq(clientsTable.id, client.id)).returning();
    } else if (user.role === "client" && user.companyId === company.id) {
      [client] = await db.update(clientsTable).set({ userId: user.id }).where(eq(clientsTable.id, client.id)).returning();
    } else {
      // The address already belongs to a staff login or another company's client; the record exists, the portal login does not.
      logger.warn({ companyId: company.id, clientId: client.id }, "Client email already has a non-client login; portal access not linked");
    }
  }
  return client;
}

export async function seedClientStages(client: Client): Promise<ClientStage[]> {
  const existing = await db.select().from(clientStagesTable).where(eq(clientStagesTable.clientId, client.id)).orderBy(asc(clientStagesTable.sort));
  if (existing.length) return existing;
  return db
    .insert(clientStagesTable)
    .values(PORTAL_STAGES.map((s, i) => ({ clientId: client.id, key: s.key, label: s.label, status: s.key === "payment" ? ("done" as const) : s.key === "intake" ? ("current" as const) : ("pending" as const), sort: i, completedAt: s.key === "payment" ? new Date() : null })))
    .returning();
}

export async function setStageStatus(clientId: number, key: PortalStageKey, status: ClientStage["status"], opts: { note?: string; onlyIfNotDone?: boolean } = {}): Promise<void> {
  const [stage] = await db.select().from(clientStagesTable).where(and(eq(clientStagesTable.clientId, clientId), eq(clientStagesTable.key, key))).limit(1);
  if (!stage) return;
  if (opts.onlyIfNotDone && stage.status === "done") return;
  await db
    .update(clientStagesTable)
    .set({ status, note: opts.note ?? stage.note, completedAt: status === "done" ? (stage.completedAt ?? new Date()) : status === "pending" ? null : stage.completedAt })
    .where(eq(clientStagesTable.id, stage.id));
  // The first pending stage after a completed one becomes current.
  if (status === "done") {
    const all = await db.select().from(clientStagesTable).where(eq(clientStagesTable.clientId, clientId)).orderBy(asc(clientStagesTable.sort));
    const next = all.find((s) => s.sort > stage.sort && s.status === "pending");
    if (next && !all.some((s) => s.status === "current")) await db.update(clientStagesTable).set({ status: "current" }).where(eq(clientStagesTable.id, next.id));
  }
}

export interface ClientBundle {
  client: Client;
  stages: ClientStage[];
  files: ClientFile[];
  orders: (Order & { schedule: OrderInstallment[] })[];
  bookings: Booking[];
  intake: Intake | null;
  login: { id: number; email: string; lastLoginAt: string | null } | null;
}

export async function loadClientBundle(client: Client): Promise<ClientBundle> {
  const [stages, files, orders, bookings, intakes, login] = await Promise.all([
    db.select().from(clientStagesTable).where(eq(clientStagesTable.clientId, client.id)).orderBy(asc(clientStagesTable.sort)),
    db.select().from(clientFilesTable).where(eq(clientFilesTable.clientId, client.id)).orderBy(desc(clientFilesTable.createdAt)),
    db.select().from(ordersTable).where(eq(ordersTable.clientId, client.id)).orderBy(desc(ordersTable.createdAt)),
    client.leadId ? db.select().from(bookingsTable).where(eq(bookingsTable.leadId, client.leadId)).orderBy(desc(bookingsTable.createdAt)) : Promise.resolve([] as Booking[]),
    db.select().from(intakesTable).where(eq(intakesTable.clientId, client.id)).orderBy(desc(intakesTable.createdAt)).limit(1),
    client.userId ? db.select({ id: usersTable.id, email: usersTable.email, lastLoginAt: usersTable.lastLoginAt }).from(usersTable).where(eq(usersTable.id, client.userId)).limit(1) : Promise.resolve([]),
  ]);
  const orderIds = orders.map((o) => o.id);
  const installments = orderIds.length ? await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.orderId, orderIds[0])).orderBy(asc(orderInstallmentsTable.seq)) : [];
  const allInstallments = orderIds.length > 1 ? await Promise.all(orderIds.map((id) => db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.orderId, id)).orderBy(asc(orderInstallmentsTable.seq)))) : [installments];
  return {
    client,
    stages,
    files,
    orders: orders.map((o, i) => ({ ...o, schedule: allInstallments[i] ?? [] })),
    bookings,
    intake: intakes[0] ?? null,
    login: login[0] ? { id: login[0].id, email: login[0].email, lastLoginAt: login[0].lastLoginAt?.toISOString() ?? null } : null,
  };
}

const fmtDay = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const fmtWhen = (d: Date | null | undefined) => (d ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export interface StageView {
  id: number;
  key: string;
  label: string;
  status: ClientStage["status"];
  meta: string;
  note: string;
  completedAt: string | null;
  /** A thing the client can do about it right now. */
  action: "intake" | "book" | "reschedule" | null;
}

/** Stage rows with the meta line the portal shows (Buying Flow.dc.html stageDefs). */
export function stageViews(b: ClientBundle, ownerFirst: string): StageView[] {
  const order = b.orders.find((o) => o.status === "paid") ?? b.orders[0] ?? null;
  const booking = b.bookings.find((x) => x.status === "scheduled") ?? null;
  const intakeData = (b.intake?.data ?? {}) as Partial<IntakeData>;
  return b.stages.map((s) => {
    let meta = PORTAL_STAGES.find((d) => d.key === s.key)?.meta.replace(/\{ownerFirst\}/g, ownerFirst) ?? "";
    let action: StageView["action"] = null;
    switch (s.key) {
      case "payment":
        if (order) meta = `${cents(order.amountCents)} · ${fmtDay(order.paidAt ?? order.createdAt)} · ${order.stripePaymentIntentId ? "Stripe" : order.status === "paid" ? "Recorded" : "Pending"}`;
        break;
      case "intake":
        meta = b.intake?.completedAt ? `Received — ${ownerFirst} has it` : meta;
        if (!b.intake?.completedAt) action = "intake";
        break;
      case "interview":
        if (booking) {
          meta = booking.startAt ? `Scheduled · ${fmtWhen(booking.startAt)}` : "Scheduled via Calendly";
          if (s.status !== "done") action = "reschedule";
        } else if (s.status !== "done") action = "book";
        break;
      case "published":
        meta = intakeData.access === "self" ? "Doc + video walkthrough" : meta;
        break;
    }
    if (s.note) meta = s.note;
    return { id: s.id, key: s.key, label: s.label, status: s.key === "interview" && booking && s.status !== "done" ? "scheduled" : s.status, meta, note: s.note, completedAt: s.completedAt?.toISOString() ?? null, action: s.status === "done" ? null : action };
  });
}

export function progressOf(stages: StageView[]): { done: number; total: number; pct: number } {
  const done = stages.filter((s) => s.status === "done" || s.status === "scheduled").length;
  return { done, total: stages.length, pct: stages.length ? Math.round((done / stages.length) * 100) : 0 };
}

export async function clientForUser(userId: number): Promise<Client | null> {
  const [c] = await db.select().from(clientsTable).where(eq(clientsTable.userId, userId)).orderBy(desc(clientsTable.createdAt)).limit(1);
  return c ?? null;
}

export async function clientByLead(companyId: number, leadId: number): Promise<Client | null> {
  const [c] = await db.select().from(clientsTable).where(and(eq(clientsTable.companyId, companyId), eq(clientsTable.leadId, leadId))).limit(1);
  return c ?? null;
}

export async function leadForClient(client: Client) {
  if (!client.leadId) return null;
  const [l] = await db.select().from(leadsTable).where(eq(leadsTable.id, client.leadId)).limit(1);
  return l ?? null;
}
