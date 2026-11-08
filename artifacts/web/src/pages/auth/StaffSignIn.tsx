import { useState, type FormEvent } from "react";
import { Link, useSearch } from "wouter";
import { AuthShell } from "@/components/AuthShell";
import { Alert, Button, Field, Input } from "@/components/ui";
import { useAuth, type SessionResponse } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { api, errorMessage } from "@/lib/api";
import { rememberDoor } from "@/lib/session";

export function StaffSignIn() {
  const { acceptSession } = useAuth();
  const tenant = useTenant();
  const params = new URLSearchParams(useSearch());
  const next = params.get("next");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isPlatform = tenant.kind === "platform";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await api<SessionResponse>("/auth/login", { method: "POST", json: { identifier, password } });
      rememberDoor("/staff/login");
      acceptSession(session, next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={isPlatform ? "Staff sign-in" : "Sign in to your console"}
      intro={isPlatform ? "Company admins, managers and advisors, and the platform owner." : "Admins, managers and client advisors."}
      footer={
        <>
          Are you a client? <Link href="/client/login" className="font-bold underline-offset-2 hover:underline">Use the client door</Link>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label={isPlatform ? "Email or username" : "Email"} htmlFor="identifier">
          <Input id="identifier" name="identifier" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" variant={isPlatform ? "ap" : "primary"} size="lg" loading={busy} className="mt-1 w-full">
          Sign in
        </Button>
        <div className="text-center text-[13.5px]">
          <Link href="/forgot-password" className="font-semibold opacity-80 hover:opacity-100">
            Forgot your password?
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
