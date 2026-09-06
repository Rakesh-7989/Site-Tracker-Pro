// SiteTrack Pro — shared public site shell (header + footer + mobile drawer).
//
// Renders the marketing navigation chrome around every public sub-page and
// exposes <Outlet/> for the routed page. Authenticated users see "Open app"
// CTAs that route to their dashboard lane instead of signup.

import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { postLoginPathForSession, readStoredLoginLane, useAuth } from "@/auth";
import { Icon } from "@/components/ui/atoms";
import { cn } from "@/lib/utils/cn";
import { SITE_NAV, type SiteLink } from "./content";

function SiteLogo(): JSX.Element {
  return (
    <Link to="/" className="flex items-center flex-shrink-0" aria-label="SiteTrack Pro home">
      <img src="/logo-horizontal.png" alt="" className="h-7 w-auto" />
    </Link>
  );
}

const DIRECT_LINKS: { label: string; to: string }[] = [
  { label: "Product", to: "/product" },
  { label: "Features", to: "/features" },
  { label: "Pricing", to: "/pricing" },
];

function DropdownPanel({ title, items }: { title: string; items: SiteLink[] }): JSX.Element {
  return (
    <div className="pt-1.5 pb-1">
      <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-fg-tertiary">{title}</div>
      {items.map((item) => (
        <Link key={item.to} to={item.to} className="block px-3 py-2 rounded-lg text-sm text-fg-primary hover:bg-bg-secondary">
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function SiteShell(): JSX.Element {
  const { session, status } = useAuth();
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  const authed = status === "ready" && !!session;
  const appPath = authed && session ? postLoginPathForSession(session, readStoredLoginLane()) : "/dashboard";

  useEffect(() => {
    setMobileOpen(false);
    setOpenMenu(null);
  }, [location.pathname]);

  useEffect(() => {
    function onDocPointer(e: MouseEvent): void {
      if (openMenu && headerRef.current && !headerRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    function onDocKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onDocKey);
    };
  }, [openMenu]);

  function toggleMenu(id: string): void {
    setOpenMenu((current) => (current === id ? null : id));
  }

  const dropdowns: { id: string; label: string; items: SiteLink[] }[] = [
    { id: "solutions", label: "Solutions", items: SITE_NAV.solutions },
    { id: "resources", label: "Resources", items: SITE_NAV.resources },
    { id: "company", label: "Company", items: SITE_NAV.company },
  ];

  const AllLinks = (): JSX.Element => (
    <div className="px-4 py-2 space-y-1">
      <div className="pt-1 pb-1 text-[11px] font-bold uppercase tracking-wide text-fg-tertiary">Menu</div>
      {DIRECT_LINKS.map((link) => (
        <Link key={link.to} to={link.to} className="block px-2 py-2 rounded-lg text-sm font-medium hover:bg-bg-secondary">
          {link.label}
        </Link>
      ))}
      {dropdowns.map((group) => (
        <div key={group.id}>
          <div className="pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-fg-tertiary">{group.label}</div>
          {group.items.map((item) => (
            <Link key={item.to} to={item.to} className="block px-2 py-2 rounded-lg text-sm text-fg-secondary hover:bg-bg-secondary">
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header ref={headerRef} className="sticky top-0 z-40 border-b border-default bg-panel backdrop-blur">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-4">
          <SiteLogo />

          <nav className="hidden xl:flex items-center gap-1 flex-1 min-w-0" aria-label="Site">
            {DIRECT_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "px-3 py-2 rounded-lg text-sm font-medium text-fg-secondary hover:text-fg-primary hover:bg-bg-secondary transition",
                    isActive && "text-accent bg-accent-tint"
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
            {dropdowns.map((group) => (
              <div key={group.id} className="relative">
                <button
                  type="button"
                  onClick={() => toggleMenu(group.id)}
                  aria-expanded={openMenu === group.id}
                  className={cn(
                    "flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-fg-secondary hover:text-fg-primary hover:bg-bg-secondary transition",
                    openMenu === group.id && "text-accent bg-accent-tint"
                  )}
                >
                  {group.label}
                  <Icon name="chevron" size={13} className={cn("transition-transform", openMenu === group.id && "rotate-180")} />
                </button>
                {openMenu === group.id && (
                  <div className="absolute top-full left-0 mt-2 w-60 rounded-xl border border-default bg-panel shadow-editorial p-1.5">
                    <DropdownPanel title={group.label} items={group.items} />
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <Link
              to={authed ? appPath : "/login"}
              className="hidden sm:inline-flex text-sm font-semibold text-fg-primary hover:bg-elevated px-4 py-2 rounded-xl transition"
            >
              {authed ? "Open app" : "Log in"}
            </Link>
            <Link
              to={authed ? appPath : "/signup"}
              className="inline-flex text-sm font-semibold text-white bg-accent hover:bg-accent-2 px-4 py-2 rounded-xl transition items-center gap-1.5"
            >
              Get Started <Icon name="arrow" size={14} className="rotate-180" />
            </Link>
            <button
              type="button"
              className="xl:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border border-default text-fg-primary hover:bg-bg-secondary"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              <Icon name={mobileOpen ? "x" : "menu"} size={20} />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="xl:hidden border-t border-default bg-panel">
            <AllLinks />
            <div className="px-6 py-4 flex items-center gap-3 border-t border-default">
              <Link
                to={authed ? appPath : "/signup"}
                className="flex-1 text-center text-sm font-semibold text-white bg-accent hover:bg-accent-2 px-4 py-2.5 rounded-xl transition"
              >
                Get Started
              </Link>
              <Link
                to={authed ? appPath : "/login"}
                className="flex-1 text-center text-sm font-semibold text-fg-primary px-4 py-2.5 rounded-xl border border-default transition"
              >
                {authed ? "Open app" : "Log in"}
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Suspense fallback={<div role="status" aria-label="Loading page" className="max-w-6xl mx-auto px-5 py-16 space-y-3" aria-busy="true"><div className="h-8 bg-elevated rounded animate-pulse w-1/3" /><div className="h-4 bg-elevated rounded animate-pulse w-2/3" /><div className="h-4 bg-elevated rounded animate-pulse w-1/2" /></div>}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-default bg-panel">
        <div className="max-w-6xl mx-auto px-5 py-12 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link to="/" className="inline-flex items-center" aria-label="SiteTrack Pro home">
              <img src="/logo-horizontal.png" alt="" className="h-7 w-auto" />
            </Link>
            <p className="mt-3 text-sm text-fg-secondary max-w-xs">
              SiteTrack Pro is a construction &amp; AEC project OS — field operations, finance,
              drawings, labour and collaboration for Indian sites.
            </p>
            <p className="mt-3 text-sm text-fg-secondary">
              Built in Hyderabad, Telangana.{" "}
              <a href="mailto:boyapatirakesh7777@gmail.com" className="text-fg-primary hover:text-accent transition">
                boyapatirakesh7777@gmail.com
              </a>
            </p>
          </div>
          <FooterColumn title="Product" links={SITE_NAV.product} />
          <FooterColumn title="Solutions" links={SITE_NAV.solutions} />
          <FooterColumn title="Company" links={SITE_NAV.company} />
        </div>
        <div className="border-t border-default">
          <div className="max-w-6xl mx-auto px-5 py-5 flex flex-col sm:flex-row gap-2 justify-between text-xs text-fg-tertiary">
            <span>© {new Date().getFullYear()} SiteTrack Pro. Built in Hyderabad, India.</span>
            <span>Made for construction teams, by construction technologists.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({ title, links }: { title: string; links: SiteLink[] }): JSX.Element {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-fg-tertiary">{title}</div>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="text-sm text-fg-secondary hover:text-fg-primary transition">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}