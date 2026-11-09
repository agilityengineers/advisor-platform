import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, companiesTable, usersTable, clientsTable, orderInstallmentsTable, webhookEventsTable, pool } from "@workspace/db";
import { startTestServer, type TestServer } from "../test/harness";
import { MTC_ADMIN_EMAIL, MTC_SLUG } from "../lib/seed";
import { verifyCalendlySignature } from "../lib/calendly";
import { createHmac } from "node:crypto";

let server: TestServer;
let adminToken = "";
let mtcId = 0;
const HOST = `${MTC_SLUG}.advisor-platform.com`;
const email = `buyer-${Date.now()}@example.com`;
let orderId = "";

interface OrderPayload {
  order: { publicId: string; status: string; plan: string; installments: number; amountCents: number; totalCents: number; laterCents: number; firstName: string; schedule: { seq: number; amountCents: number; status: string }[] };
  links: { book: string; intake: string; portal: string; calendly: string | null };
  company: { ownerFirst: string };
  intakeDone: boolean;
  booking: { startAt: string | null; confirmed: boolean } | null;
  stages: { key: string; status: string; action: string | null; meta: string }[];
  checkoutMode: string;
}

beforeAll(async () => {
  server = await startTestServer();
  const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
  mtcId = mtc.id;
  adminToken = (await server.api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: process.env.MTC_ADMIN_PASSWORD }) })).body.token;
});
afterAll(async () => {
  // Leave MTC's Calendly as the other suites expect it (not connected).
  await server.api(`/api/companies/${mtcId}/settings/integrations/calendly/disconnect`, { method: "POST", token: adminToken });
  await server.close();
  await pool.end();
});

describe("checkout (demo mode)", () => {
  it("advertises checkout readiness on the public payload", async () => {
    const r = await server.api<{ company: { checkout: { ready: boolean; mode: string } } }>("/api/public/site", { host: HOST });
    expect(r.body.company.checkout).toEqual({ ready: true, mode: "demo" });
  });

  it("creates a pending order with the prototype's arithmetic and pays it in demo mode", async () => {
    const start = await server.api<{ mode: string; orderId: string; dueTodayCents: number; thanksUrl: string }>("/api/public/checkout", { method: "POST", host: HOST, body: JSON.stringify({ offer: "voice", plan: "split", bumps: { banner: true, rush: true }, name: "Dana Whitfield", email, phone: "(415) 220-8841" }) });
    expect(start.status).toBe(201);
    expect(start.body.mode).toBe("demo");
    expect(start.body.dueTodayCents).toBe(49900 + 15000 + 29900);
    expect(start.body.thanksUrl).toContain(`/thanks?order=${start.body.orderId}`);
    orderId = start.body.orderId;

    const pending = await server.api<OrderPayload>(`/api/public/orders/${orderId}`, { host: HOST });
    expect(pending.body.order.status).toBe("pending");
    expect(pending.body.stages).toEqual([]);

    expect((await server.api("/api/public/checkout", { method: "POST", host: HOST, body: JSON.stringify({ offer: "voice", name: "Bot", email: "b@example.com", website: "x" }) })).status).toBe(202);
    expect((await server.api("/api/public/checkout", { method: "POST", host: "advisor-platform.com", body: JSON.stringify({ offer: "voice", name: "Nobody", email: "n@example.com" }) })).status).toBe(404);

    const paid = await server.api<OrderPayload>(`/api/public/orders/${orderId}/demo-pay`, { method: "POST", host: HOST });
    expect(paid.status).toBe(200);
    expect(paid.body.order.status).toBe("paid");
    expect(paid.body.order.schedule).toEqual([{ seq: 2, amountCents: 49900, status: "scheduled" }].map((s) => expect.objectContaining(s)));
    expect(paid.body.stages.map((s) => `${s.key}:${s.status}`)).toEqual(["payment:done", "intake:current", "interview:pending", "blueprint:pending", "draft:pending", "revisions:pending", "published:pending"]);
    expect(paid.body.stages.find((s) => s.key === "intake")?.action).toBe("intake");
    expect(paid.body.links.intake).toContain(`/intake?order=${orderId}`);
    expect(paid.body.company.ownerFirst).toBe("Brian");

    // Paying twice is a no-op.
    const again = await server.api<OrderPayload>(`/api/public/orders/${orderId}/demo-pay`, { method: "POST", host: HOST });
    expect(again.body.order.status).toBe("paid");
    const installments = await db.select().from(orderInstallmentsTable);
    expect(installments.filter((i) => i.amountCents === 49900).length).toBeGreaterThanOrEqual(1);
  });

  it("turned the buyer into a client with a portal login and moved the lead to Client", async () => {
    const [client] = await db.select().from(clientsTable).where(and(eq(clientsTable.companyId, mtcId), eq(clientsTable.email, email)));
    expect(client).toBeTruthy();
    expect(client.userId).not.toBeNull();
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, client.userId!));
    expect(user.role).toBe("client");
    expect(user.companyId).toBe(mtcId);
    const leads = await server.api<{ leads: { email: string; stage: { kind: string } }[] }>(`/api/companies/${mtcId}/leads`, { token: adminToken });
    expect(leads.body.leads.find((l) => l.email === email)?.stage.kind).toBe("won");
  });

  it("accepts the intake, records a provisional booking, and shows both in the staff client view", async () => {
    const bad = await server.api<{ field: string }>(`/api/public/orders/${orderId}/intake`, { method: "POST", host: HOST, body: JSON.stringify({ name: "Dana Whitfield", linkedin: "", knownFor: "short" }) });
    expect(bad.status).toBe(400);
    const ok = await server.api<OrderPayload>(`/api/public/orders/${orderId}/intake`, { method: "POST", host: HOST, body: JSON.stringify({ name: "Dana Whitfield", phone: "(415) 220-8841", linkedin: "https://www.linkedin.com/in/danawhitfield/", knownFor: "Post-merger operations for mid-market manufacturers.", audience: "COOs", access: "self" }) });
    expect(ok.status).toBe(200);
    expect(ok.body.intakeDone).toBe(true);
    expect(ok.body.stages.find((s) => s.key === "intake")).toMatchObject({ status: "done", action: null });
    expect(ok.body.stages.find((s) => s.key === "interview")).toMatchObject({ status: "current", action: "book" });
    expect(ok.body.stages.find((s) => s.key === "published")?.meta).toBe("Doc + video walkthrough");

    const booked = await server.api<OrderPayload>(`/api/public/orders/${orderId}/booked`, { method: "POST", host: HOST, body: JSON.stringify({ eventUri: "https://api.calendly.com/scheduled_events/EV1", inviteeUri: "https://api.calendly.com/scheduled_events/EV1/invitees/IN1" }) });
    expect(booked.body.booking).toMatchObject({ confirmed: false });
    expect(booked.body.stages.find((s) => s.key === "interview")).toMatchObject({ status: "scheduled", action: "reschedule" });

    const list = await server.api<{ clients: { email: string; progress: { done: number; total: number }; intakeDone: boolean; offerName: string; outstandingCents: number; hasPortalLogin: boolean }[] }>(`/api/companies/${mtcId}/clients`, { token: adminToken });
    const mine = list.body.clients.find((c) => c.email === email)!;
    expect(mine).toMatchObject({ intakeDone: true, offerName: "Voice-Built Profile", outstandingCents: 49900, hasPortalLogin: true });
    expect(mine.progress).toMatchObject({ done: 3, total: 7 });
    expect((await server.api(`/api/companies/${mtcId}/clients`)).status).toBe(401);
  });

  it("lets staff advance stages, add files, settle installments and send a portal link; the client sees it all in the portal", async () => {
    const list = await server.api<{ clients: { id: number; email: string }[] }>(`/api/companies/${mtcId}/clients`, { token: adminToken });
    const clientId = list.body.clients.find((c) => c.email === email)!.id;
    const detail = await server.api<{ stages: { id: number; key: string }[]; orders: { id: number; installments: { id: number; seq: number; status: string }[] }[]; login: { id: number } | null }>(`/api/companies/${mtcId}/clients/${clientId}`, { token: adminToken });
    expect(detail.status).toBe(200);
    const interview = detail.body.stages.find((s) => s.key === "interview")!;
    const advanced = await server.api<{ stages: { key: string; status: string }[]; notified: boolean }>(`/api/companies/${mtcId}/clients/${clientId}/stages/${interview.id}`, { method: "PATCH", token: adminToken, body: JSON.stringify({ status: "done", note: "Great session.", notify: true }) });
    expect(advanced.status).toBe(200);
    expect(advanced.body.stages.find((s) => s.key === "interview")?.status).toBe("done");
    expect(advanced.body.stages.find((s) => s.key === "blueprint")?.status).toBe("current");

    const file = await server.api<{ file: { id: number; name: string } }>(`/api/companies/${mtcId}/clients/${clientId}/files`, { method: "POST", token: adminToken, body: JSON.stringify({ name: "Brand Voice Blueprint.pdf", url: "https://files.example.com/blueprint.pdf", stageKey: "blueprint" }) });
    expect(file.status).toBe(201);

    const order = detail.body.orders[0];
    const inst = order.installments.find((i) => i.seq === 2)!;
    const settled = await server.api<{ installment: { status: string } }>(`/api/companies/${mtcId}/orders/${order.id}/installments/${inst.id}`, { method: "POST", token: adminToken, body: JSON.stringify({ action: "mark_paid" }) });
    expect(settled.status).toBe(200);
    expect(settled.body.installment.status).toBe("paid");
    expect((await server.api(`/api/companies/${mtcId}/orders/${order.id}/installments/${inst.id}`, { method: "POST", token: adminToken, body: JSON.stringify({ action: "charge" }) })).status).toBe(409);

    const link = await server.api<{ ok: boolean; devLink: string | null }>(`/api/companies/${mtcId}/clients/${clientId}/portal-link`, { method: "POST", token: adminToken });
    expect(link.body.ok).toBe(true);
    expect(link.body.devLink).toContain("/client/verify?token=");
    const token = new URL(link.body.devLink!).searchParams.get("token")!;
    const session = await server.api<{ token: string; user: { role: string } }>("/api/auth/magic-link/verify", { method: "POST", host: HOST, body: JSON.stringify({ token }) });
    expect(session.status).toBe(200);
    expect(session.body.user.role).toBe("client");

    const portal = await server.api<{ client: { email: string }; stages: { key: string; status: string }[]; progress: { done: number }; files: { name: string }[]; orders: { schedule: { seq: number; status: string }[] }[]; intake: { completedAt: string | null }; links: { intake: string } | null }>("/api/portal", { token: session.body.token, host: HOST });
    expect(portal.status).toBe(200);
    expect(portal.body.client.email).toBe(email);
    expect(portal.body.files.map((f) => f.name)).toEqual(["Brand Voice Blueprint.pdf"]);
    expect(portal.body.orders[0].schedule).toEqual([expect.objectContaining({ seq: 2, status: "paid" })]);
    expect(portal.body.intake.completedAt).not.toBeNull();
    expect(portal.body.progress.done).toBe(3);
    // Staff cannot read the portal; a client cannot read the console.
    expect((await server.api("/api/portal", { token: adminToken })).status).toBe(403);
    expect((await server.api(`/api/companies/${mtcId}/clients`, { token: session.body.token })).status).toBe(403);
  });
});

describe("webhooks", () => {
  it("rejects an unsigned Stripe delivery and a Calendly delivery nobody holds a key for", async () => {
    expect((await server.api("/api/webhooks/stripe", { method: "POST", body: JSON.stringify({ id: "evt_1", type: "checkout.session.completed" }) })).status).toBe(400);
    expect((await server.api("/api/webhooks/calendly", { method: "POST", body: JSON.stringify({ event: "invitee.created", payload: {} }) })).status).toBe(401);
  });

  it("verifies Calendly signatures and confirms a booking from invitee.created, idempotently", async () => {
    const reg = await server.api<{ ok: boolean }>(`/api/companies/${mtcId}/settings/integrations/calendly/webhook`, { method: "POST", token: adminToken });
    // Needs a token + organization first.
    expect(reg.status).toBe(400);
    await server.api(`/api/companies/${mtcId}/settings/integrations/calendly`, { method: "PUT", token: adminToken, body: JSON.stringify({ config: { url: "https://calendly.com/briantraichel/intro-call" }, secrets: { token: "cal_test_token" } }) });
    const reg2 = await server.api<{ ok: boolean }>(`/api/companies/${mtcId}/settings/integrations/calendly/webhook`, { method: "POST", token: adminToken });
    expect(reg2.status).toBe(200);

    const body = JSON.stringify({ event: "invitee.created", payload: { uri: "https://api.calendly.com/scheduled_events/EV2/invitees/IN2", event: "https://api.calendly.com/scheduled_events/EV2", email, name: "Dana Whitfield", scheduled_event: { uri: "https://api.calendly.com/scheduled_events/EV2", start_time: "2026-12-01T17:00:00.000Z", end_time: "2026-12-01T18:30:00.000Z" }, tracking: { utm_content: orderId } } });
    const t = String(Math.floor(Date.now() / 1000));
    const sig = `t=${t},v1=${createHmac("sha256", "test-signing-key").update(`${t}.${body}`).digest("hex")}`;
    expect(verifyCalendlySignature(body, sig, "test-signing-key")).toBe(true);
    expect(verifyCalendlySignature(body, sig, "wrong")).toBe(false);
    const hit = await server.api<{ received: boolean; duplicate?: boolean }>("/api/webhooks/calendly", { method: "POST", headers: { "calendly-webhook-signature": sig }, body });
    expect(hit.status).toBe(200);
    const dup = await server.api<{ duplicate?: boolean }>("/api/webhooks/calendly", { method: "POST", headers: { "calendly-webhook-signature": sig }, body });
    expect(dup.body.duplicate).toBe(true);
    const order = await server.api<OrderPayload>(`/api/public/orders/${orderId}`, { host: HOST });
    expect(order.body.booking).toMatchObject({ startAt: "2026-12-01T17:00:00.000Z", confirmed: true });
    const events = await db.select().from(webhookEventsTable).where(eq(webhookEventsTable.provider, "calendly"));
    expect(events.some((e) => e.status === "processed")).toBe(true);
  });
});
