// SiteTrack Pro â€” OrgRegisterView component tests (i18n-wired register view).
// Renders via renderToStaticMarkup inside I18nProvider + MemoryRouter so
// useT()/useSearchParams resolve; locale defaults to en in Node.

import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { I18nProvider } from "@/i18n/I18nProvider";
import { OrgRegisterView } from "@/features/auth/OrgRegisterView";

vi.mock("react-router-dom", async () => {
  const actual = await import("react-router-dom");
  return {
    ...actual,
    Navigate: () => <div>NAVIGATE</div>,
  };
});

vi.mock("@/auth", () => ({
  useAuth: () => ({ session: null, status: "unauthenticated", error: null, refresh: vi.fn(), setActiveOrgId: vi.fn() }),
}));

vi.mock("@/components/ui/atoms", () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Button: ({ children, className }: any) => <button className={className}>{children}</button>,
  Icon: ({ name }: any) => <span data-icon={name}>icon</span>,
  Spinner: () => <span>spinner</span>,
  Alert: ({ children, variant }: any) => <div data-variant={variant}>{children}</div>,
}));

vi.mock("@/components/ui/forms", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <span data-testid="lang">en</span>,
}));

vi.mock("@/app/orgRegisterQueries", () => ({
  registerOrg: vi.fn(),
  resendConfirmation: vi.fn(),
}));

vi.mock("@/features/marketing/legalContent", () => ({
  CONSENT_VERSION: "v1",
}));

vi.mock("@/features/marketing/plans", () => ({
  PLANS: [],
  type: {},
}));

describe("OrgRegisterView", () => {
  const render = (query = ""): string =>
    renderToStaticMarkup(
      <I18nProvider>
        <MemoryRouter initialEntries={[`/register${query}`]}>
          <OrgRegisterView />
        </MemoryRouter>
      </I18nProvider>,
    );

  it("renders the i18n-wired register title + trial subtitle", () => {
    const out = render();
    expect(out).toContain("Create your workspace");
    expect(out).toContain("Start your 14-day Pro free trial");
    expect(out).toContain("Work email");
    expect(out).toContain("Confirm password");
    expect(out).toContain("At least 8 characters");
    expect(out).toContain("Create workspace");
  });

  it("renders the localized consent sentence with Terms + Privacy links", () => {
    const out = render();
    expect(out).toContain("I agree to the");
    expect(out).toContain("Terms of Service");
    expect(out).toContain("Privacy Policy");
    expect(out).toMatch(/href="\/terms"/);
    expect(out).toMatch(/href="\/privacy"/);
  });

  it("renders the already-have-an-account sign-in footer", () => {
    const out = render();
    expect(out).toContain("Already have an account?");
    expect(out).toContain("Sign in");
  });

  it("accepts a deep-link plan/billing query without rendering it", () => {
    const out = render("?plan=business&billing=annual");
    expect(out).toContain("Create your workspace");
    expect(out).not.toContain("business");
  });
});
