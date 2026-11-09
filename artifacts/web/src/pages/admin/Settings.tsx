import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Alert, Button, Card, Input, PageTitle, Pill, SectionLabel, Select, Spinner } from "@/components/ui";

interface SettingsResponse {
  superAdmin: { name: string; email: string; username: string };
  domains: { host: string; tag: string; role: "marketing" | "primary" | "seo" | "legacy" }[];
  subdomainBase: string;
  keys: { sendgrid: boolean; brightdata: boolean; stripe: boolean; stripeWebhook: boolean; encryptionKeyFromEnv: boolean };
  platformFrom: { email: string; name: string };
}

interface EmailStatus {
  configured: boolean;
  ready: boolean;
  from: { email: string; name: string };
  webhookUrl: string;
  checks: { key: string; label: string; state: "ok" | "warn" | "fail" | "skipped"; detail: string }[];
  checkedAt: string;
}

const STATE_PILL = { ok: { tone: "green", label: "OK" }, warn: { tone: "amber", label: "Check" }, fail: { tone: "red", label: "Failing" }, skipped: { tone: "grey", label: "Skipped" } } as const;
const TEST_KINDS = [
  { value: "plain", label: "Plain delivery test" },
  { value: "invite", label: "Invitation" },
  { value: "password_reset", label: "Password reset" },
  { value: "magic_link", label: "Client magic link" },
  { value: "receipt", label: "Purchase receipt" },
] as const;

function PlatformEmailCard({ defaultTo }: { defaultTo: string }) {
  const status = useQuery<EmailStatus>({ queryKey: ["admin", "email-status"], queryFn: () => api("/admin/email/status") });
  const [to, setTo] = useState(defaultTo);
  const [kind, setKind] = useState<string>("plain");
  const send = useMutation<{ to: string }, Error>({ mutationFn: () => api("/admin/email/test", { method: "POST", json: { to, kind } }) });
  const s = status.data;
  return (
    <Card className="p-[22px] shadow-none">
      <SectionLabel right={<Button size="sm" variant="secondary" loading={status.isFetching} onClick={() => status.refetch()}>Re-check</Button>}>PLATFORM EMAIL</SectionLabel>
      {!s ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : (
        <>
          <div className="mt-2 text-[13.5px] leading-[1.6] text-body-2">
            Sends as <span className="font-bold text-navy">{s.from.name} &lt;{s.from.email}&gt;</span>. Event Webhook URL for SendGrid: <span className="break-all font-mono text-[12.5px]">{s.webhookUrl}</span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {s.checks.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-3 rounded-[12px] border border-line-soft bg-[#F7FBFF] px-3.5 py-3">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold text-navy">{c.label}</div>
                  <div className="text-[12px] font-semibold text-muted">{c.detail}</div>
                </div>
                <Pill tone={STATE_PILL[c.state].tone}>{STATE_PILL[c.state].label}</Pill>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Input className="min-w-[220px] flex-1" type="email" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Send test to" />
            <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Test message">
              {TEST_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
            <Button size="sm" loading={send.isPending} disabled={!s.configured || !to} onClick={() => send.mutate()}>Send test</Button>
          </div>
          {send.isSuccess && <Alert tone="success" className="mt-3">Handed to SendGrid for {send.data.to}. Check the inbox (and spam folder); the delivery status appears in the email log once the Event Webhook reports it.</Alert>}
          {send.isError && <Alert tone="danger" className="mt-3">{send.error.message}</Alert>}
        </>
      )}
    </Card>
  );
}

const TAG_TONE = { marketing: "grey", primary: "blue", seo: "amber", legacy: "grey" } as const;


export function SettingsPage() {
  const q = useQuery<SettingsResponse>({ queryKey: ["admin", "settings"], queryFn: () => api("/admin/settings") });
  if (!q.data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  const s = q.data;
  const keyRows: { label: string; ok: boolean; note: string }[] = [
    { label: "SendGrid (platform sender)", ok: s.keys.sendgrid, note: `Invites, resets and partner mail from ${s.platformFrom.email}` },
    { label: "Bright Data (Profile Grader)", ok: s.keys.brightdata, note: "Platform-level key; never per company" },
    { label: "Stripe (platform billing)", ok: s.keys.stripe, note: "Plan billing and Connect application fees" },
    { label: "Stripe webhook secret", ok: s.keys.stripeWebhook, note: "Verifies /api/webhooks/stripe" },
    { label: "Encryption key from Secrets", ok: s.keys.encryptionKeyFromEnv, note: s.keys.encryptionKeyFromEnv ? "PLATFORM_ENCRYPTION_KEY is set" : "Auto-generated and stored in platform_config — set the secret explicitly" },
  ];
  return (
    <div className="max-w-[820px]">
      <PageTitle title="Platform settings" />
      <div className="mt-[22px] flex flex-col gap-4">
        <Card className="p-[22px] shadow-none">
          <SectionLabel>SUPER ADMIN</SectionLabel>
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
            {[
              ["Name", s.superAdmin.name],
              ["Email", s.superAdmin.email],
              ["Username", s.superAdmin.username],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-[12px] font-bold text-muted">{k}</div>
                <div className="mt-[3px] break-all text-[15px] font-bold text-navy">{v}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-[22px] shadow-none">
          <SectionLabel>PLATFORM DOMAINS</SectionLabel>
          <div className="mt-2 text-[13.5px] leading-[1.6] text-body-2">All of these resolve to this platform. Company subdomains hang off the primary; the Authority Desk domain carries the SEO-optimized public surface. The legacy alias keeps older links and company CNAMEs working.</div>
          <div className="mt-3 flex flex-col gap-2">
            {s.domains.map((d) => (
              <div key={d.host} className="flex flex-wrap items-center justify-between gap-2.5 rounded-[12px] border border-line-soft bg-[#F7FBFF] px-3.5 py-3">
                <div className="break-all text-[14px] font-bold text-navy">{d.host}</div>
                <Pill tone={TAG_TONE[d.role]} className="text-[11.5px]">
                  {d.tag}
                </Pill>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[12.5px] font-semibold text-muted">
            Company subdomains: <span className="font-mono">{"<slug>"}.{s.subdomainBase}</span>
          </div>
        </Card>
        <Card className="p-[22px] shadow-none">
          <SectionLabel>PLATFORM-LEVEL KEYS</SectionLabel>
          <div className="mt-2 text-[13.5px] leading-[1.6] text-body-2">Companies bring their own SendGrid, Twilio, and Stripe. The platform holds only what it needs to run itself: Stripe (platform billing for plans), Bright Data for the grader, the platform sender, and the secrets encryption key. Values live in Replit Secrets and are never shown here.</div>
          <div className="mt-3 flex flex-col gap-2">
            {keyRows.map((k) => (
              <div key={k.label} className="flex items-center justify-between gap-3 rounded-[12px] border border-line-soft bg-[#F7FBFF] px-3.5 py-3">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold text-navy">{k.label}</div>
                  <div className="text-[12px] font-semibold text-muted">{k.note}</div>
                </div>
                <Pill tone={k.ok ? "green" : "amber"}>{k.ok ? "Configured" : "Not set"}</Pill>
              </div>
            ))}
          </div>
        </Card>
        <PlatformEmailCard defaultTo={s.superAdmin.email} />
      </div>
    </div>
  );
}
