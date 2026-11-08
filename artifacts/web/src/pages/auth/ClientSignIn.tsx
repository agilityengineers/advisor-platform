import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AuthShell } from "@/components/AuthShell";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { useAuth, type SessionResponse } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { api, errorMessage } from "@/lib/api";
import { rememberDoor } from "@/lib/session";

export function ClientSignIn() {
  const tenant = useTenant();
  const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get("email") ?? "");
  const [sent, setSent] = useState<{ message: string; devLink?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isPlatform = tenant.kind === "platform";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ message: string; devLink?: string }>("/auth/magic-link", { method: "POST", json: { email } });
      rememberDoor("/client/login");
      setSent(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Client sign-in"
      intro={isPlatform ? "Clients sign in on their advisor's own site. Enter the email you used and we'll send a secure link." : "Enter your email and we'll send you a secure one-tap link to your portal. No password needed."}
      footer={
        <>
          Company staff? <Link href="/staff/login" className="font-bold underline-offset-2 hover:underline">Sign in here</Link>
        </>
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
          <Button variant="secondary" onClick={() => setSent(null)}>
            Use a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <Button type="submit" variant={isPlatform ? "ap" : "primary"} size="lg" loading={busy} className="mt-1 w-full">
            Email me a sign-in link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

/** Landing page for the magic link. Spends the token and enters the portal. */
export function ClientVerify() {
  const { acceptSession } = useAuth();
  const params = new URLSearchParams(useSearch());
  const token = params.get("token");
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("This link is missing its token.");
      return;
    }
    let cancelled = false;
    api<SessionResponse>("/auth/magic-link/verify", { method: "POST", json: { token } })
      .then((session) => {
        if (!cancelled) acceptSession(session);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token, acceptSession, navigate]);

  return (
    <AuthShell title={error ? "That link didn't work" : "Signing you in…"}>
      {error ? (
        <div className="grid gap-4">
          <Alert tone="danger">{error}</Alert>
          <Button onClick={() => navigate("/client/login")}>Request a new link</Button>
        </div>
      ) : (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
    </AuthShell>
  );
}
