import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useDocumentMeta } from "@/hooks/use-meta";
import { Spinner } from "@/components/ui";
import { PublicShell } from "./PublicShell";
import { FlowPage, SecureBadge } from "./FlowChrome";
import { SiteState } from "./SiteChrome";
import { orderParam, useOrder } from "./buyingFlow";
import type { OrderPayload, PublicSiteResponse } from "./types";

type Access = "upload" | "self";

/** `/intake?order=` — the three-minute intake (Buying Flow screen 4). */
export function IntakePage() {
  return <PublicShell>{(site) => <IntakeBody site={site} />}</PublicShell>;
}

function IntakeBody({ site }: { site: PublicSiteResponse }) {
  const publicId = orderParam();
  const q = useOrder(publicId);
  const qc = useQueryClient();
  const brand = site.site.content.brand;
  const [form, setForm] = useState({ name: "", phone: "", linkedin: "", knownFor: "", audience: "", access: "upload" as Access });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<OrderPayload | null>(null);
  useDocumentMeta({ title: `Intake — ${brand.companyName}`, robots: "noindex, nofollow" });

  useEffect(() => {
    if (!q.data) return;
    const i = q.data.intake;
    setForm((f) => ({ ...f, name: f.name || q.data!.order.customerName, phone: f.phone || i.phone || "", linkedin: f.linkedin || i.linkedin || q.data!.linkedin || "", knownFor: f.knownFor || i.knownFor || "", audience: f.audience || i.audience || "", access: i.access ?? f.access }));
  }, [q.data]);

  if (!publicId) return <SiteState title="That page needs an order" body="Follow the link from your receipt." />;
  if (q.isError) return <SiteState title="We couldn't find that order" body="Check the link in your receipt." />;
  if (!q.data) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#F4F8FE" }}>
        <Spinner />
      </div>
    );
  }
  const d = done ?? q.data;
  if (d.order.status !== "paid") return <SiteState title="This order isn't paid yet" body="Finish checkout first, then come back to the intake." />;
  const owner = d.company.ownerFirst;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.linkedin.trim()) errs.linkedin = "Your LinkedIn URL is required.";
    else if (!/linkedin\.com\/(in|pub)\//i.test(form.linkedin.trim())) errs.linkedin = "Use a linkedin.com/in/… profile URL.";
    if (form.knownFor.trim().length < 10) errs.knownFor = "A sentence or two is plenty.";
    if (form.name.trim().length < 2) errs.name = "Please tell us your name.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      document.getElementById(`in-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const r = await api<OrderPayload>(`/public/orders/${encodeURIComponent(publicId)}/intake`, { method: "POST", json: form });
      setDone(r);
      void qc.invalidateQueries({ queryKey: ["public-order", publicId] });
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const portal = `/client/login?email=${encodeURIComponent(done.order.customerEmail)}`;
    return (
      <FlowPage logoUrl={brand.logoUrl} companyName={brand.companyName} right={<SecureBadge />} maxWidth={720}>
        <div style={{ background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 22, padding: "44px 32px", textAlign: "center" }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--pale)", color: "var(--blue-deep)", fontSize: 28, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>✓</div>
          <h1 className="cs-display" style={{ fontWeight: 700, fontSize: 26, color: "var(--navy)", margin: "22px 0 0", letterSpacing: "-0.02em" }}>
            Sent to {owner}.
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "#425973", margin: "12px 0 0" }}>{owner} reads it before your interview. Everything else — your booking, files and payments — lives in your portal.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 24 }}>
            <Link href={portal} className="cs-btn cs-btn--primary" style={{ fontSize: 15, padding: "14px 24px", boxShadow: "none" }}>
              Open my portal →
            </Link>
            {!done.booking && (
              <Link href={`/book?order=${encodeURIComponent(publicId)}`} className="cs-btn cs-btn--secondary" style={{ fontSize: 15, padding: "14px 24px" }}>
                Book the interview
              </Link>
            )}
          </div>
        </div>
      </FlowPage>
    );
  }

  const field = (key: keyof typeof form, label: string, input: React.ReactNode) => (
    <div className="cs-field" style={{ gap: 6 }}>
      <label htmlFor={`in-${key}`} style={{ fontSize: 13, fontWeight: 700, color: "#16283D" }}>
        {label}
      </label>
      {input}
      {errors[key] && (
        <div role="alert" className="cs-error">
          {errors[key]}
        </div>
      )}
    </div>
  );
  const inputStyle = { padding: "12px 13px", fontSize: 15, borderRadius: 10 } as const;
  const accessStyle = (on: boolean) => ({ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 14px", border: `1px solid ${on ? "var(--blue)" : "#DDE8F7"}`, background: on ? "var(--pale)" : "#FFFFFF", borderRadius: 12, cursor: "pointer" }) as const;

  return (
    <FlowPage logoUrl={brand.logoUrl} companyName={brand.companyName} right={<SecureBadge />} maxWidth={720}>
      <div className="cs-eyebrow">Step 2 of 2 · 3 minutes</div>
      <h1 className="cs-display" style={{ fontWeight: 700, fontSize: "clamp(26px,3vw,36px)", lineHeight: 1.1, letterSpacing: "-0.02em", margin: "14px 0 0", color: "var(--navy)" }}>
        Tell {owner} what {owner === "us" ? "we're" : "he's"} walking into
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.65, color: "#3D556F", margin: "14px 0 0" }}>{owner} reads this before your interview so the 90 minutes go to the right places.</p>
      <form onSubmit={submit} noValidate style={{ marginTop: 28, background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(220px,100%),1fr))", gap: 14 }}>
          {field("name", "Name", <input id="in-name" className={`cs-input${errors.name ? " cs-input--error" : ""}`} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />)}
          {field("phone", "Phone", <input id="in-phone" type="tel" className="cs-input" style={inputStyle} placeholder="(555) 214-8890" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />)}
        </div>
        {field("linkedin", "Your LinkedIn profile URL", <input id="in-linkedin" type="url" className={`cs-input${errors.linkedin ? " cs-input--error" : ""}`} style={inputStyle} placeholder="linkedin.com/in/yourname" value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} />)}
        {field("knownFor", "What do you want to be known for?", <textarea id="in-knownFor" rows={3} className={`cs-input${errors.knownFor ? " cs-input--error" : ""}`} style={{ ...inputStyle, lineHeight: 1.55, resize: "vertical" }} placeholder="One or two sentences — the niche, the problem you solve, the people you solve it for." value={form.knownFor} onChange={(e) => setForm({ ...form, knownFor: e.target.value })} />)}
        {field("audience", "Who should be finding you?", <input id="in-audience" className="cs-input" style={inputStyle} placeholder="e.g. COOs at mid-market manufacturers; event programmers; literary agents" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />)}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#16283D" }}>How should we publish the finished profile?</div>
          <label style={accessStyle(form.access === "upload")}>
            <input type="radio" name="access" checked={form.access === "upload"} onChange={() => setForm({ ...form, access: "upload" })} style={{ marginTop: 3, accentColor: "var(--blue)" }} />
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>You upload it for me</div>
              <div style={{ fontSize: 13, color: "#5A718C", lineHeight: 1.5, marginTop: 2 }}>We'll schedule a 15-minute screen-share; you stay logged in, we paste. No password shared.</div>
            </div>
          </label>
          <label style={accessStyle(form.access === "self")}>
            <input type="radio" name="access" checked={form.access === "self"} onChange={() => setForm({ ...form, access: "self" })} style={{ marginTop: 3, accentColor: "var(--blue)" }} />
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>I'll paste it myself</div>
              <div style={{ fontSize: 13, color: "#5A718C", lineHeight: 1.5, marginTop: 2 }}>You get a section-by-section document with a short video walkthrough.</div>
            </div>
          </label>
        </div>
        {errors.form && (
          <div role="alert" className="cs-error">
            {errors.form}
          </div>
        )}
        <button type="submit" className="cs-submit" disabled={busy} style={{ marginTop: 4, fontSize: 15.5, padding: 15 }}>
          {busy ? "Sending…" : `Send to ${owner}`}
        </button>
      </form>
    </FlowPage>
  );
}
