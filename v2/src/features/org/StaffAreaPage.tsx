import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { getClient } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import { useT } from "@/i18n";
import { reviewSignupRequest } from "./staffQueries";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonPage } from "@/components/ui/Skeleton";

interface OrgRow {
  id: string;
  name: string | null;
  plan: string | null;
  created_at: string | null;
}

interface PendingSignup {
  id: string;
  email: string | null;
  org_name: string | null;
  requested_at: string | null;
}

export function StaffAreaPage() {
  const { session } = useAuth();
  const t = useT();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  async function act(requestId: string, action: "approve" | "reject") {
    setBusyId(requestId);
    setReviewError(null);
    const res = await reviewSignupRequest(getClient(), { requestId, action });
    setBusyId(null);
    if (res.ok) void qc.invalidateQueries({ queryKey: ["staff-signups"] });
    else setReviewError(res.error);
  }

  const orgs = useQuery({
    queryKey: ["staff-orgs"],
    queryFn: async () => {
      const [{ data, error }, counts] = await Promise.all([
        getClient()
          .from("organizations")
          .select("id, name, plan, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        getClient().from("profiles").select("id", { count: "exact", head: true }),
      ]);
      if (error) throw new Error(`orgs-failed:${error.message}`);
      return {
        rows: (data ?? []) as unknown as OrgRow[],
        totalUsers: counts.count ?? 0,
      };
    },
    enabled: session?.user.role === "superadmin",
  });

  const signups = useQuery({
    queryKey: ["staff-signups"],
    queryFn: async () => {
      const { data, error } = await getClient()
        .from("signup_requests")
        .select("id, email, org_name, requested_at")
        .eq("status", "pending")
        .order("requested_at", { ascending: false })
        .limit(25);
      if (error) throw new Error(`signups-failed:${error.message}`);
      return ((data ?? []) as unknown as PendingSignup[]).map((r) => ({
        id: r.id,
        email: r.email,
        orgName: r.org_name,
        requestedAt: r.requested_at,
      }));
    },
    enabled: session?.user.role === "superadmin",
  });

  if (session && session.user.role !== "superadmin") return <Navigate to="/dashboard" replace />;
  if (!session || orgs.isLoading) return <SkeletonPage rows={5} />;
  if (orgs.isError) return <Alert variant="error">{String(orgs.error)}</Alert>;

  const rows = orgs.data?.rows ?? [];
  const planMix = rows.reduce<Record<string, number>>((acc, o) => {
    const key = o.plan || "none";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-fg-primary">{t("staff.title")}</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={t("staff.orgsStat")} value={rows.length} />
        <StatCard label={t("staff.usersStat")} value={orgs.data?.totalUsers ?? "—"} />
        <StatCard
          label={t("staff.pendingStat")}
          value={signups.isError ? "—" : (signups.data?.length ?? 0)}
        />
      </div>

      <Card title={t("staff.planMix")} padding="md">
        <div className="flex flex-wrap gap-2">
          {Object.entries(planMix).map(([plan, n]) => (
            <Badge key={plan} tone={plan === "pro" ? "accent" : "neutral"}>
              {plan} · {n}
            </Badge>
          ))}
          {rows.length === 0 && <span className="text-sm text-fg-tertiary">No orgs yet.</span>}
        </div>
      </Card>

      <Card title={`${t("staff.orgsCard")} (${rows.length})`} padding="none">
        <ul className="divide-y divide-[var(--st-border)]">
          {rows.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-fg-primary">{o.name}</div>
                <div className="text-xs text-fg-tertiary">
                  {o.created_at ? o.created_at.slice(0, 10) : ""}
                </div>
              </div>
              <Badge tone="info">{o.plan || "none"}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t("staff.queueCard")} padding="none">
        {signups.isError ? (
          <div className="p-4"><Alert variant="warning">{String(signups.error)}</Alert></div>
        ) : (signups.data ?? []).length === 0 ? (
          <p className="px-4 py-4 text-sm text-fg-tertiary">{t("staff.queueEmpty")}</p>
        ) : (
          <ul className="divide-y divide-[var(--st-border)]">
            {(signups.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm text-fg-primary">{s.orgName || s.email}</div>
                  <div className="text-xs text-fg-tertiary">
                    {s.email} · {s.requestedAt?.slice(0, 10)}
                  </div>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => void act(s.id, "approve")}
                    className="h-8 rounded-[var(--st-radius-md)] bg-success-tint px-3 text-xs font-medium text-success focus-ring disabled:opacity-50"
                  >
                    {t("staff.approve")}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => void act(s.id, "reject")}
                    className="h-8 rounded-[var(--st-radius-md)] bg-error-tint px-3 text-xs font-medium text-error focus-ring disabled:opacity-50"
                  >
                    {t("staff.reject")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {reviewError && (
          <div className="px-4 pb-3"><Alert variant="error">{reviewError}</Alert></div>
        )}
      </Card>
    </div>
  );
}
