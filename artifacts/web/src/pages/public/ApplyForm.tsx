import { useState, type FormEvent } from "react";
import type { SiteContent } from "@workspace/shared";
import { api, ApiError } from "@/lib/api";
import { siteVoice } from "./usePublicSite";
import type { LeadSubmitResponse } from "./types";

type Field = "name" | "email" | "phone" | "category" | "linkedin" | "goal";
type Form = Record<Field, string>;
const EMPTY: Form = { name: "", email: "", phone: "", category: "", linkedin: "", goal: "" };
const CATEGORIES = [
  { value: "Consultant", label: "Consultant" },
  { value: "Author", label: "Author" },
  { value: "Professional writer", label: "Professional writer" },
  { value: "Other", label: "Other" },
];

function validate(f: Form): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  if (!f.name.trim()) e.name = "Please tell me your name.";
  if (!f.email.trim()) e.email = "An email is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(f.email.trim())) e.email = "That email doesn't look right.";
  if (!f.phone.trim()) e.phone = "A phone number is required for follow-up.";
  else if (f.phone.replace(/[^0-9]/g, "").length < 10) e.phone = "Please include the full number with area code.";
  if (!f.category) e.category = "Pick the closest category.";
  if (!f.linkedin.trim()) e.linkedin = "Your LinkedIn URL is required.";
  else if (!/linkedin\.com\/(in|pub)\//i.test(f.linkedin.trim())) e.linkedin = "Use a linkedin.com/in/… profile URL.";
  if (f.goal.trim().length < 10) e.goal = "A sentence or two is plenty.";
  return e;
}

/** The six-field audit request. Posts to the company's pipeline; success offers a prefilled Calendly link. */
export function ApplyForm({ content, calendlyUrl }: { content: SiteContent; calendlyUrl: string | null }) {
  const { first } = siteVoice(content);
  const [form, setForm] = useState<Form>(EMPTY);
  const [hp, setHp] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [result, setResult] = useState<LeadSubmitResponse | null>(null);

  const set = (field: Field, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[field];
      return next;
    });
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) {
      setErrors(errs);
      document.getElementById(`mtc-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setErrors({});
    setStatus("submitting");
    try {
      const r = await api<LeadSubmitResponse>("/public/leads", { method: "POST", json: { ...form, website: hp } });
      setResult(r);
      setStatus("success");
    } catch (err) {
      const field = err instanceof ApiError && typeof err.data?.field === "string" ? (err.data.field as Field) : "goal";
      setErrors({ [field]: err instanceof ApiError && err.status === 400 ? err.message : "Something went wrong sending that. Please try again." });
      setStatus("idle");
    }
  };

  if (status === "success") {
    const bookUrl = result?.calendlyUrl ?? calendlyUrl;
    return (
      <div role="status" style={{ background: "#FFFFFF", borderRadius: 22, padding: "44px 32px", textAlign: "center", boxShadow: "0 30px 70px rgba(0,0,0,0.28)", color: "var(--navy)" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--pale)", color: "var(--blue-deep)", fontSize: 28, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>✓</div>
        <h3 className="cs-display" style={{ fontWeight: 700, fontSize: 24, color: "var(--navy)", margin: "22px 0 0" }}>
          Request received.
        </h3>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "#425973", margin: "12px 0 0" }}>
          {first} will review your profile against the 22-section framework and reply personally within two business days.
        </p>
        {bookUrl && (
          <>
            <a href={bookUrl} target="_blank" rel="noopener noreferrer" className="cs-btn cs-btn--primary" style={{ marginTop: 22, padding: "15px 26px", boxShadow: "0 12px 26px rgba(var(--blue-rgb),0.3)" }}>
              Grab a time on {first}'s calendar →
            </a>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#7C93AD", marginTop: 12 }}>Opens Calendly, already prefilled with your details.</div>
          </>
        )}
      </div>
    );
  }

  const field = (key: Field, label: string, input: React.ReactNode) => (
    <div className="cs-field">
      <label htmlFor={`mtc-${key}`} className="cs-label">
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
  const cls = (key: Field) => `cs-input${errors[key] ? " cs-input--error" : ""}`;

  return (
    <form noValidate onSubmit={submit} className="cs-form">
      <div>
        <h3 className="cs-display" style={{ fontWeight: 700, fontSize: 21, color: "var(--navy)", margin: 0 }}>
          Request your profile audit
        </h3>
        <p style={{ fontSize: 14.5, color: "#5A718C", margin: "6px 0 0", fontWeight: 600 }}>Six fields. Two business days.</p>
      </div>
      {field("name", "Full name", <input id="mtc-name" name="name" type="text" autoComplete="name" placeholder="Jane Whitfield" value={form.name} onChange={(e) => set("name", e.target.value)} className={cls("name")} />)}
      {field("email", "Email", <input id="mtc-email" name="email" type="email" autoComplete="email" placeholder="jane@consultancy.com" value={form.email} onChange={(e) => set("email", e.target.value)} className={cls("email")} />)}
      {field("phone", "Phone", <input id="mtc-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(555) 214-8890" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={cls("phone")} />)}
      {field(
        "category",
        "I am a…",
        <select id="mtc-category" name="category" value={form.category} onChange={(e) => set("category", e.target.value)} className={cls("category")}>
          <option value="">Select one</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>,
      )}
      {field("linkedin", "Current LinkedIn URL", <input id="mtc-linkedin" name="linkedin" type="url" inputMode="url" placeholder="linkedin.com/in/yourname" value={form.linkedin} onChange={(e) => set("linkedin", e.target.value)} className={cls("linkedin")} />)}
      {field("goal", "Primary goal", <textarea id="mtc-goal" name="goal" rows={3} placeholder="What do you want to be known for — and what should the profile bring in?" value={form.goal} onChange={(e) => set("goal", e.target.value)} className={cls("goal")} style={{ resize: "vertical", minHeight: 88 }} />)}
      <div className="cs-hp" aria-hidden="true">
        <label htmlFor="mtc-website">Website</label>
        <input id="mtc-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
      </div>
      <button type="submit" className="cs-submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Request my profile audit"}
      </button>
      <div style={{ fontSize: 12.5, color: "#7C93AD", fontWeight: 600, textAlign: "center" }}>Your details go to {first} only. No lists, no forwarding.</div>
    </form>
  );
}
