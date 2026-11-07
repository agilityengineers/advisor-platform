import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, companiesTable } from "@workspace/db";
import { ownerFirstName } from "@workspace/shared";
import { authMiddleware, requireRole } from "../lib/auth";
import { clientForUser, leadForClient, loadClientBundle, progressOf, stageViews } from "../lib/portal";
import { orderLinks, installmentsFor } from "../lib/orders";
import { calendlyUrlFor } from "../lib/integrations";
import { publicCompanyPayload } from "./tenant";
import { publishedContent } from "./siteContent";

const router: IRouter = Router();

/** Everything the client portal shows (Buying Flow.dc.html, screen 6). A client sees their own record only. */
router.get("/portal", authMiddleware, requireRole("client"), async (req, res) => {
  const client = await clientForUser(req.user!.userId);
  if (!client) {
    res.json({ client: null });
    return;
  }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, client.companyId)).limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const [bundle, publicCompany, published, calendlyUrl] = await Promise.all([loadClientBundle(client), publicCompanyPayload(company), publishedContent(company), calendlyUrlFor(company.id)]);
  const brand = published.content.brand;
  const ownerFirst = ownerFirstName(brand) || company.ownerName.split(/\s+/)[0] || company.name;
  const stages = stageViews(bundle, ownerFirst);
  const paid = bundle.orders.find((o) => o.status === "paid") ?? bundle.orders[0] ?? null;
  const lead = await leadForClient(client);
  const links = paid ? await orderLinks(company, paid, lead) : null;
  res.json({
    client: { id: client.id, publicId: client.publicId, name: client.name, email: client.email, phone: client.phone, linkedin: client.linkedin, createdAt: client.createdAt.toISOString() },
    company: { ...publicCompany, ownerFirst, ownerFullName: brand.ownerFullName || company.ownerName, ownerPhoto: brand.ownerPhoto, ownerTitle: brand.ownerTitle, ownerEmail: brand.ownerEmail || company.ownerEmail },
    stages,
    progress: progressOf(stages),
    files: bundle.files.map((f) => ({ id: f.id, name: f.name, url: f.url, stageKey: f.stageKey, createdAt: f.createdAt.toISOString() })),
    orders: await Promise.all(
      bundle.orders.map(async (o) => ({
        publicId: o.publicId,
        offerName: o.offerName,
        status: o.status,
        amountCents: o.amountCents,
        plan: o.paymentMode,
        installments: o.installments,
        paidAt: o.paidAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
        schedule: (await installmentsFor(o.id)).map((i) => ({ seq: i.seq, amountCents: i.amountCents, dueAt: i.dueAt?.toISOString() ?? null, status: i.status, paidAt: i.paidAt?.toISOString() ?? null })),
      })),
    ),
    booking: (() => {
      const b = bundle.bookings.find((x) => x.status === "scheduled") ?? null;
      return b ? { startAt: b.startAt?.toISOString() ?? null, confirmed: b.confirmed } : null;
    })(),
    intake: { completedAt: bundle.intake?.completedAt?.toISOString() ?? null, data: bundle.intake?.data ?? {} },
    links: links ? { book: links.book, intake: links.intake, calendly: links.calendly } : null,
    calendlyUrl,
    currentOrder: paid?.publicId ?? null,
  });
});

export default router;
