import { useState, type FormEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AuthShell } from "@/components/AuthShell";
import { Alert, Button, Field, Input } from "@/components/ui";
import { useAuth, type SessionResponse } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { api, errorMessage } from "@/lib/api";

export function ForgotPassword() {
  const tenant = useTenant();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ message: string; devLink?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSent(await api("/auth/forgot", { method: "POST", json: { email } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      intro="Enter the email on your account and we'll send a single-use link."
      footer={
        <Link href="/staff/login" className="font-bold underline-offset-2 hover:underline">
          Back to sign-in
        </Link>
      }
    >
      {sent ? (
        <div className="grid gap-4">
          <Alert tone="success">{sent.message}</Alert>
          {sent.devLink && (
            <Alert tone="warn">
              Email isn't configured yet, so here is your link for development:{" "}
              <a className="break-all underline" href={sent.devLink}>
                {sent.devLink}
              </a>
            </Alert>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <Button type="submit" variant={tenant.kind === "platform" ? "ap" : "primary"} size="lg" loading={busy} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const { acceptSession } = useAuth();
  const tenant = useTenant();
  const [, navigate] = useLocation();
  const token = new URLSearchParams(useSearch()).get("token") ?? "";
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
      const session = await api<SessionResponse>("/auth/reset", { method: "POST", json: { token, password } });
      acceptSession(session);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Missing link">
        <Alert tone="danger">This reset link is incomplete.</Alert>
        <Button className="mt-4" onClick={() => navigate("/forgot-password")}>
          Request a new one
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" intro="At least 10 characters. You'll be signed in straight away.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="New password" htmlFor="password">
          <Input id="password" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        <Button type="submit" variant={tenant.kind === "platform" ? "ap" : "primary"} size="lg" loading={busy} className="w-full">
          Save and sign in
        </Button>
      </form>
    </AuthShell>
  );
}
