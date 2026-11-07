import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { initials } from "@/lib/utils";
import { Alert, Button, Drawer, Input, Select, Spinner, Textarea } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { fmtWhen, type LeadDetail, type StageView } from "./types";

interface Props {
  companyId: number;
  leadId: number;
  stages: StageView[];
  rubricVersion: number | null;
  canMoveStages: boolean;
  canEmail: boolean;
  sendgridConnected: boolean;
  onClose: () => void;
}

export function LeadDrawer({ companyId, leadId, stages, rubricVersion, canMoveStages, canEmail, sendgridConnected, onClose }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = ["company", companyId, "lead", leadId];
  const q = useQuery<LeadDetail>({ queryKey: key, queryFn: () => api(`/companies/${companyId}/leads/${leadId}`) });
  const [templateKey, setTemplateKey] = useState("ready");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["company", companyId, "leads"] });
  };
  const setStage = useMutation({
    mutationFn: (stageId: number) => api(`/companies/${companyId}/leads/${leadId}`, { method: "PATCH", json: { stageId } }),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const send = useMutation({
    mutationFn: () => api<{ subject: string }>(`/companies/${companyId}/leads/${leadId}/email`, { method: "POST", json: { templateKey, note } }),
    onSuccess: (r) => {
      setSent(r.subject);
      setNote("");
      refresh();
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  const d = q.data;
  return (
    <Drawer onClose={onClose} label="Lead detail" width={460}>
      {!d ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-[1] flex items-start gap-3.5 border-b border-line-soft bg-white px-6 py-[22px]">
            <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-pale text-[15px] font-bold text-blue-hover">{initials(d.lead.name)}</div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[19px] font-bold text-navy">{d.lead.name}</div>
              <div className="text-[13px] font-semibold text-muted">
                {d.lead.category || "Lead"} · received {fmtWhen(d.lead.createdAt)}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-line bg-page text-[15px] font-bold text-body-2 hover:bg-pale">
              ×
            </button>
          </div>
          <div className="flex flex-col gap-[22px] p-6">
            <div className="flex flex-col gap-2.5">
              <Fact label="EMAIL" value={d.lead.email} action={{ href: `mailto:${d.lead.email}`, label: "Email →" }} />
              <Fact label="PHONE" value={d.lead.phone || "—"} action={d.lead.phone ? { href: `tel:${d.lead.phone.replace(/[^0-9+]/g, "")}`, label: "Call →" } : undefined} />
              <Fact label="LINKEDIN" value={d.lead.linkedin || "—"} action={d.lead.linkedin ? { href: `https://${d.lead.linkedin}`, label: "Open ↗", external: true } : undefined} />
            </div>
            <div>
              <div className="text-[11.5px] font-bold tracking-[0.08em] text-muted-2">PRIMARY GOAL</div>
              <p className="mt-[9px] text-[15px] leading-[1.62] text-body">{d.lead.goal || "No goal given."}</p>
            </div>
            <GradeCard companyId={companyId} leadId={leadId} detail={d} canWrite={canEmail || canMoveStages} rubricVersion={rubricVersion} onChanged={refresh} />
            <div className="rounded-[12px] border border-line-soft bg-[#F7FBFF] p-[15px]">
              <div className="text-[11.5px] font-bold tracking-[0.08em] text-muted-2">CALENDLY</div>
              <div className="mt-1.5 text-[14.5px] font-bold text-[#16283D]">{d.booking?.startAt ? `Intro call booked — ${fmtWhen(d.booking.startAt)}` : "No call booked yet"}</div>
              {d.calendly.prefillUrl ? (
                <a href={d.calendly.prefillUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-pill border border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue-hover hover:border-brand hover:bg-pale">
                  Send booking link →
                </a>
              ) : (
                <div className="mt-2 text-[12.5px] font-semibold text-muted">Connect Calendly in Company settings to prefill a booking link.</div>
              )}
            </div>
            <div>
              <label htmlFor="lead-status" className="text-[11.5px] font-bold tracking-[0.08em] text-muted-2">
                STATUS
              </label>
              <Select id="lead-status" className="mt-[9px] h-12 bg-[#F7FBFF] text-[14.5px] font-semibold" value={d.lead.stageId ?? ""} disabled={!canMoveStages || setStage.isPending} onChange={(e) => setStage.mutate(Number(e.target.value))}>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <div className="text-[11.5px] font-bold tracking-[0.08em] text-muted-2">ACTIVITY</div>
              <div className="mt-3 flex flex-col">
                {d.activity.map((a) => (
                  <div key={a.id} className="flex items-start gap-[13px] pb-4">
                    <div className="mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full bg-brand" />
                    <div className="min-w-0">
                      <div className="text-[14px] font-bold text-[#16283D]">{a.body}</div>
                      <div className="text-[12.5px] font-semibold text-muted-2">{fmtWhen(a.createdAt)}</div>
                    </div>
                  </div>
                ))}
                {d.activity.length === 0 && <div className="text-[13px] font-semibold text-muted">No activity yet.</div>}
              </div>
            </div>
            {canEmail && (
              <div className="rounded-card bg-navy p-5 text-white">
                <div className="text-[11.5px] font-bold tracking-[0.09em] text-[#7FB6FF]">SEND VIA SENDGRID</div>
                {!sendgridConnected && <Alert tone="warn" className="mt-3">Connect SendGrid in Company settings → Integrations to send from your own domain.</Alert>}
                <label htmlFor="lead-template" className="mt-3.5 block text-[13px] font-bold text-[#DCE7F4]">
                  Template
                </label>
                <Select id="lead-template" className="mt-2 border-white text-[14px] font-semibold" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
                  {d.templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                <div className="mt-1.5 text-[12px] text-[#B9CBE0]">Subject: {d.templates.find((t) => t.key === templateKey)?.subject}</div>
                <label htmlFor="lead-note" className="mt-3.5 block text-[13px] font-bold text-[#DCE7F4]">
                  Personal note
                </label>
                <Textarea id="lead-note" rows={3} className="mt-2 min-h-[78px] border-white text-[14px]" placeholder="One line that shows you read their profile…" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button className="mt-3.5 w-full" size="lg" disabled={!sendgridConnected} loading={send.isPending} onClick={() => send.mutate()}>
                  {sent ? "Sent ✓ — send another" : "Send email"}
                </Button>
                {sent && <div className="mt-2.5 text-[12px] font-semibold text-[#8FA6BF]">Queued in SendGrid: “{sent}”</div>}
              </div>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}

const GRADE_STATUS: Record<string, string> = { pending: "Queued", fetching: "Fetching the profile…", retrying: "Retrying the fetch…", scored: "Scored", failed: "Failed" };

/** The Profile Grade card: run / re-run the audit, open the report, email it, unlock it, re-score on a newer rubric. */
function GradeCard({ companyId, leadId, detail, canWrite, rubricVersion, onChanged }: { companyId: number; leadId: number; detail: LeadDetail; canWrite: boolean; rubricVersion: number | null; onChanged: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const latest = detail.assessments[0] ?? null;
  const [linkedin, setLinkedin] = useState("");
  const [notify, setNotify] = useState(true);
  const running = latest && (latest.status === "pending" || latest.status === "fetching" || latest.status === "retrying");
  const currentRubric = detail.grader.rubricVersion ?? rubricVersion ?? 1;
  const key = ["company", companyId, "lead", leadId];

  // While a fetch is in flight, keep the drawer fresh.
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => void qc.invalidateQueries({ queryKey: key }), 2500);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, companyId, leadId]);

  const run = useMutation({
    mutationFn: () => api<{ assessment: { status: string } }>(`/companies/${companyId}/leads/${leadId}/grade`, { method: "POST", json: { notify, linkedin: linkedin.trim() || undefined } }),
    onSuccess: (r) => {
      onChanged();
      toast(r.assessment.status === "scored" ? "Graded" : "Audit started — the grade lands in a minute or two", "info");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "rescore" | "unlock" | "send" }) => api(`/companies/${companyId}/assessments/${id}/${action}`, { method: "POST" }),
    onSuccess: (_r, v) => {
      onChanged();
      toast(v.action === "send" ? "Report emailed to the lead" : v.action === "unlock" ? "Full report unlocked for the lead" : "Re-scored on the current rubric");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  const needsUrl = !detail.lead.linkedin && !linkedin.trim();
  return (
    <div className="rounded-[12px] bg-navy p-[15px] text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11.5px] font-bold tracking-[0.08em] text-[#7FB6FF]">PROFILE GRADE{detail.grader.mode === "demo" ? " · DEMO DATA" : ""}</div>
          {latest ? (
            <>
              <div className="mt-[5px] text-[14.5px] font-bold">
                {latest.status === "scored" ? `Graded ${latest.grade} · ${latest.pctTotal}% · rubric v${latest.rubricVersion}` : GRADE_STATUS[latest.status] ?? latest.status}
                {latest.status === "scored" && latest.rubricVersion !== null && latest.rubricVersion < currentRubric && <span className="ml-2 rounded-pill bg-[#FFF8F0] px-2 py-[2px] text-[10.5px] font-bold tracking-[0.06em] text-warn-deep">RUBRIC v{currentRubric} AVAILABLE</span>}
              </div>
              <div className="mt-[2px] text-[12px] font-semibold text-[#B9CBE0]">
                {latest.status === "scored" ? `Strongest: ${latest.strongest ?? "—"} · Biggest gap: ${latest.biggestGap ?? "—"} · ${latest.unlocked ? "Full report unlocked" : "Lead sees the summary"}` : latest.status === "failed" ? (latest.errorMessage ?? "The fetch failed") : `Attempt ${latest.attempt} · Bright Data`}
              </div>
            </>
          ) : (
            <>
              <div className="mt-[5px] truncate text-[14.5px] font-bold">{detail.lead.linkedin ? `Run the audit on ${detail.lead.linkedin}` : "Add a LinkedIn URL to grade"}</div>
              <div className="mt-[2px] text-[12px] font-semibold text-[#B9CBE0]">Fetches the profile, scores it on rubric v{currentRubric}, and can email the summary.</div>
            </>
          )}
        </div>
        {latest?.status === "scored" && latest.reportUrl && (
          <a href={latest.reportUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-pill bg-white px-3.5 py-2 text-[13px] font-bold text-navy hover:bg-pale">
            Open report ↗
          </a>
        )}
      </div>
      {canWrite && (
        <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
          {!detail.lead.linkedin && <Input className="h-9 border-white/20 bg-white/10 text-[13px] text-white placeholder:text-[#8FA6BF]" placeholder="linkedin.com/in/…" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={Boolean(running) || needsUrl} loading={run.isPending} onClick={() => run.mutate()}>
              {latest ? "Re-run audit" : "Run audit"}
            </Button>
            {latest?.status === "scored" && (
              <>
                <Button size="sm" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" loading={act.isPending} onClick={() => act.mutate({ id: latest.id, action: "send" })}>
                  Email report
                </Button>
                {!latest.unlocked && (
                  <Button size="sm" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" loading={act.isPending} onClick={() => window.confirm("Unlock every finding and the plan for this lead?") && act.mutate({ id: latest.id, action: "unlock" })}>
                    Unlock for lead
                  </Button>
                )}
                {latest.rubricVersion !== null && latest.rubricVersion < currentRubric && (
                  <Button size="sm" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" loading={act.isPending} onClick={() => act.mutate({ id: latest.id, action: "rescore" })}>
                    Re-score on v{currentRubric}
                  </Button>
                )}
              </>
            )}
            <label className="ml-auto flex items-center gap-1.5 text-[12px] font-semibold text-[#DCE7F4]">
              <input type="checkbox" className="accent-blue" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email the lead when graded
            </label>
          </div>
          {detail.grader.mode === "off" && <div className="text-[12px] font-bold text-warn">Bright Data isn't configured on the platform — grading is unavailable.</div>}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, action }: { label: string; value: string; action?: { href: string; label: string; external?: boolean } }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-line-soft bg-[#F7FBFF] px-3.5 py-[13px]">
      <div className="min-w-0">
        <div className="text-[11.5px] font-bold tracking-[0.08em] text-muted-2">{label}</div>
        <div className="break-all text-[14.5px] font-bold text-[#16283D]">{value}</div>
      </div>
      {action && (
        <a href={action.href} target={action.external ? "_blank" : undefined} rel={action.external ? "noopener noreferrer" : undefined} className="whitespace-nowrap text-[13px] font-bold text-blue-hover">
          {action.label}
        </a>
      )}
    </div>
  );
}
