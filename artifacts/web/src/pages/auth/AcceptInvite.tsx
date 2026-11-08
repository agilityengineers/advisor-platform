import { useState, type FormEvent } from "react";
import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AuthShell } from "@/components/AuthShell";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { useAuth, type SessionResponse } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { api, errorMessage } from "@/lib/api";
import { rememberDoor } from "@/lib/session";

interface InvitePreview {
  state: "pending" | "accepted" | "expired" | "revoked";
  email: string;
  name: string;
  role: string;
  company: { id: number; name: string; slug: string } | null;
}

const ROLE_LABEL: Record<string, string> = { admin: "Admin · Company owner", manager: "Manager", advisor: "Client advisor" };

export function AcceptInvite() {
  const { acceptSession } = useAuth();
  const tenant = useTenant();
  const token = new URLSearchParams(useSearch()).get("token") ?? "";
  const preview = useQuery<InvitePreview>({ queryKey: ["invite", token], queryFn: () => api(`/auth/invites/${encodeURIComponent(token)}`), enabled: Boolean(token), retry: false });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await api<SessionResponse>("/auth/invites/accept", { method: "POST", json: { token, name: name || preview.data?.name || "", password } });
      rememberDoor("/staff/login");
      acceptSession(session);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token || preview.isError) {
    return (
      <AuthShell title="Invitation not found">
        <Alert tone="danger">{preview.error ? errorMessage(preview.error) : "This invitation link is incomplete."}</Alert>
      </AuthShell>
    );
  }
  if (preview.isLoading || !preview.data) {
    return (
      <AuthShell title="Checking your invitation…">
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </AuthShell>
    );
  }
  const inv = preview.data;
  if (inv.state !== "pending") {
    const copy = { accepted: "This invitation has already been used. Sign in instead.", expired: "This invitation has expired. Ask your Admin for a new one.", revoked: "This invitation was revoked." }[inv.state];
    return (
      <AuthShell
        title="Invitation unavailable"
        footer={
          <Link href="/staff/login" className="font-bold underline-offset-2 hover:underline">
            Go to sign-in
          </Link>
        }
      >
        <Alert tone="warn">{copy}</Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Join ${inv.company?.name ?? "the team"}`} intro={`You're joining as ${ROLE_LABEL[inv.role] ?? inv.role} with ${inv.email}. Choose a password to finish.`}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Your name" htmlFor="name">
          <Input id="name" autoComplete="name" value={name || inv.name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Password" hint="At least 10 characters." htmlFor="password">
          <Input id="password" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        <Button type="submit" variant={tenant.kind === "platform" ? "ap" : "primary"} size="lg" loading={busy} className="w-full">
          Accept and sign in
        </Button>
      </form>
    </AuthShell>
  );
}
