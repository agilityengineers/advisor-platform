import { OUTREACH_TEMPLATES, INTEGRATION_PROVIDERS, type IntegrationProvider } from "@workspace/shared";
import { INT_STATUS, type Summary } from "./types";

const INT_LINE: Record<IntegrationProvider, string> = {
  sendgrid: "Transactional email · outreach templates and receipts",
  twilio: "Reminders to clients · new-lead alerts to you",
  stripe: "Checkout, payment plans and receipts",
  calendly: "invitee.created → status “Call booked”",
};

export function SideCards({ summary }: { summary: Summary }) {
  return (
    <div id="pipeline" className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
      <div id="outreach" className="rounded-[18px] border border-line bg-white p-6">
        <div className="text-[12px] font-bold tracking-[0.1em] text-blue-hover">SENDGRID TEMPLATES</div>
        <h2 className="mt-3 font-display text-[19px] font-bold text-navy">Follow-up sequence</h2>
        <div className="mt-4 flex flex-col gap-2.5">
          {OUTREACH_TEMPLATES.map((t) => (
            <div key={t.key} className="flex items-center gap-3 rounded-[12px] border border-line-soft bg-[#F7FBFF] px-3.5 py-[13px]">
              <div className="min-w-0 flex-1 text-[14px] font-bold text-[#16283D]">{t.label}</div>
              <div className={t.timing === "DRAFT" ? "rounded-pill bg-[#FFF8F0] px-[9px] py-[5px] text-[11.5px] font-bold text-warn-deep" : "rounded-pill bg-pale px-[9px] py-[5px] text-[11.5px] font-bold text-blue-hover"}>{t.timing}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[12.5px] font-semibold text-muted-2">Sent from the lead drawer with a personal note, through your own SendGrid.</div>
      </div>
      <div id="integrations" className="rounded-[18px] border border-line bg-white p-6">
        <div className="text-[12px] font-bold tracking-[0.1em] text-blue-hover">INTEGRATIONS</div>
        <h2 className="mt-3 font-display text-[19px] font-bold text-navy">Where the data goes</h2>
        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded-[12px] border border-line-soft bg-[#F7FBFF] p-3.5">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-success" />
              <div className="text-[14px] font-bold text-[#16283D]">Landing form → pipeline</div>
            </div>
            <div className="mt-[7px] break-all text-[12.5px] font-semibold text-muted">POST {summary.publicUrl.replace(/^https?:\/\//, "")}/api/public/leads · direct, no Zapier</div>
          </div>
          {INTEGRATION_PROVIDERS.map((p) => {
            const st = INT_STATUS[summary.integrations[p] ?? "not_connected"];
            return (
              <div key={p} className="rounded-[12px] border border-line-soft bg-[#F7FBFF] p-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: st.dot === "rgba(255,255,255,0.25)" ? "#D8E5F5" : st.dot }} />
                  <div className="text-[14px] font-bold capitalize text-[#16283D]">
                    {p === "sendgrid" ? "SendGrid" : p} — {st.label.toLowerCase()}
                  </div>
                </div>
                <div className="mt-[7px] text-[12.5px] font-semibold text-muted">{INT_LINE[p]}</div>
              </div>
            );
          })}
          <div className="text-[12.5px] font-semibold leading-[1.55] text-muted-2">Payload fields: name, email, phone, category, linkedin, goal, source, submittedAt.</div>
        </div>
      </div>
    </div>
  );
}
