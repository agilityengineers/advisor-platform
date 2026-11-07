import { useAuth } from "@/hooks/use-auth";
import { Button, Card, Eyebrow } from "@/components/ui";

/** Temporary landing spots for the consoles built in Phases 2, 3 and 5. */
function Shell({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  const { user, logout } = useAuth();
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-6">
      <Card className="w-full max-w-[560px] p-8">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-2 font-display text-[24px] font-bold tracking-[-0.02em] text-navy">{title}</h1>
        <p className="mt-2 text-[14.5px] text-body">{body}</p>
        {user && (
          <div className="mt-6 flex items-center justify-between rounded-card border border-line bg-page px-4 py-3 text-[13.5px]">
            <div>
              <div className="font-bold text-navy">{user.name}</div>
              <div className="text-muted">
                {user.email} · {user.role.replace("_", " ")}
                {user.company ? ` · ${user.company.name}` : ""}
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        )}
      </Card>
    </main>
  );
}

export const ClientPortalPlaceholder = () => <Shell eyebrow="Client portal" title="Your portal is on its way" body="Your 7-stage tracker, payments, files and team arrive in Phase 5." />;
