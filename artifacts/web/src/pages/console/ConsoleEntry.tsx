import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Alert, Button, Card, Eyebrow, Spinner } from "@/components/ui";

interface Summary {
  company: { id: number; name: string; slug: string; plan: string; status: string };
  plan: { key: string; name: string };
  publicUrl: string;
  viewer: { role: string; isSuperAdmin: boolean };
}

/**
 * The company console shell. When the super admin enters a company this shows
 * the Advisor Platform identity and a "Viewing company: X" banner; the full
 * console (leads, pipeline, CMS, reviews, settings) lands in Phase 3.
 */
export function ConsoleEntry() {
  const { user, logout } = useAuth();
  const params = useParams<{ companyId?: string }>();
  const companyId = params.companyId ? Number(params.companyId) : (user?.companyId ?? null);
  const q = useQuery<Summary>({ queryKey: ["company", companyId, "summary"], queryFn: () => api(`/companies/${companyId}/summary`), enabled: Boolean(companyId) });

  if (!companyId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page px-6">
        <Card className="max-w-[520px] p-8">
          <Eyebrow>Company console</Eyebrow>
          <h1 className="mt-2 font-display text-[22px] font-bold text-navy">No company selected</h1>
          <p className="mt-2 text-body">Pick a company from Platform Admin to open its dashboard.</p>
          <Link href="/admin" className="mt-5 inline-block">
            <Button variant="secondary">Back to Platform Admin</Button>
          </Link>
        </Card>
      </main>
    );
  }
  if (!q.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        {q.isError ? <Alert tone="danger">You don't have access to this company.</Alert> : <Spinner />}
      </div>
    );
  }
  const s = q.data;
  const viewingAsSuper = s.viewer.isSuperAdmin;
  return (
    <div className="min-h-screen bg-page">
      {viewingAsSuper && (
        <div className="flex items-center justify-between gap-3 bg-navy px-5 py-2.5 text-[13px] font-semibold text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-blue font-display text-[12px] font-bold">AP</span>
            <span>
              Viewing company: <strong>{s.company.name}</strong> · {s.plan.name} plan
            </span>
          </div>
          <Link href="/admin" className="inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-3 py-1.5 font-bold hover:bg-white/20">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Platform Admin
          </Link>
        </div>
      )}
      <main className="flex min-h-[80vh] items-center justify-center px-6">
        <Card className="w-full max-w-[560px] p-8">
          <Eyebrow>Company console</Eyebrow>
          <h1 className="mt-2 font-display text-[24px] font-bold tracking-[-0.02em] text-navy">{s.company.name}</h1>
          <p className="mt-2 text-[14.5px] text-body">Leads, pipeline, website CMS, reviews, Profile Grader and company settings arrive in Phase 3.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={s.publicUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                View website ↗
              </Button>
            </a>
            {!viewingAsSuper && (
              <Button variant="ghost" size="sm" className="border border-line" onClick={logout}>
                Sign out
              </Button>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
