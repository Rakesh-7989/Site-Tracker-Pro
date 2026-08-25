import { Suspense } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useT } from "@/i18n";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Button } from "@/components/ui/Button";
import { SkeletonPage } from "@/components/ui/Skeleton";
import { PwaUpdateChip } from "./PwaUpdateChip";

const NAV_KEYS = [
  { to: "/dashboard", key: "nav.dashboard" },
  { to: "/projects", key: "nav.projects" },
  { to: "/dpr", key: "nav.todaysDpr" },
] as const;

export function AppShell() {
  const { session, signOut } = useAuth();
  const t = useT();
  const navigate = useNavigate();

  if (!session) return <SkeletonPage rows={6} />;
  const activeOrg =
    session.memberships.find((m) => m.orgId === session.activeOrgId) ?? null;
  const extraNav = [
    ...(session.capabilities.has("org:members:manage")
      ? [{ to: "/org/members", key: "nav.members" }]
      : []),
    ...(session.user.role === "superadmin" ? [{ to: "/staff", key: "nav.staff" }] : []),
  ];

  return (
    <div className="min-h-screen bg-bg-primary flex">
      <aside className="hidden sm:flex w-56 flex-shrink-0 flex-col border-r border-default bg-panel">
        <div className="px-4 py-4 border-b border-default">
          <div className="text-sm font-semibold text-fg-primary">SiteTrack Pro</div>
          <div className="mt-0.5 text-xs text-fg-tertiary truncate">
            {activeOrg?.orgName || "—"}
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-2" aria-label="Primary">
          {[...NAV_KEYS, ...extraNav].map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `rounded-[var(--st-radius-md)] px-3 py-2 text-sm ${
                  isActive
                    ? "bg-accent-tint text-accent font-medium"
                    : "text-fg-secondary hover:bg-elevated"
                }`
              }
            >
              {t(n.key)}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-default bg-panel px-4 py-3">
          <div className="min-w-0 text-sm text-fg-secondary truncate">
            {session.user.name || session.user.email}
            {activeOrg && (
              <span className="ml-2 rounded-full bg-accent-tint px-2 py-0.5 text-[11px] text-accent">
                {session.user.role}
              </span>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <LanguageSwitcher />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void signOut().then(() => navigate("/login", { replace: true }));
              }}
            >
              {t("shell.signOut")}
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16">
                <span
                  role="status"
                  aria-label="Loading"
                  className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent text-fg-tertiary"
                />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
        <PwaUpdateChip />
      </div>
    </div>
  );
}
