// SiteTrack Pro — VerifyEmailView tests (first-run resend flow).
// Renders via renderToStaticMarkup inside I18nProvider + MemoryRouter so
// useT()/useSearchParams resolve; locale defaults to en in Node.

import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { InputHTMLAttributes, ReactNode } from "react";

import { I18nProvider } from "@/i18n/I18nProvider";
import { VerifyEmailView } from "@/features/auth/VerifyEmailView";

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

type MockAtomProps = {
  children?: ReactNode;
  className?: string;
  variant?: string;
  disabled?: boolean;
  onClick?: () => void;
  [key: string]: unknown;
};

vi.mock("@/components/ui/atoms", () => ({
  Card: ({ children, className }: MockAtomProps) => <div className={className}>{children}</div>,
  Button: ({ children, className, disabled, onClick }: MockAtomProps) => <button className={className} disabled={disabled} onClick={onClick}>{children}</button>,
  Icon: ({ name }: { name?: string; [key: string]: unknown }) => <span data-icon={name}>icon</span>,
  Spinner: () => <span>spinner</span>,
  Alert: ({ children, variant }: MockAtomProps) => <div data-variant={variant}>{children}</div>,
}));

vi.mock("@/components/ui/forms", () => ({
  Input: ({ ...props }: InputHTMLAttributes<HTMLInputElement> & Record<string, unknown>) => (
    <input {...props} />
  ),
}));

vi.mock("@/app/queries/orgRegisterQueries", () => ({
  resendConfirmation: vi.fn(),
}));

describe("VerifyEmailView", () => {
  const render = (query = ""): string =>
    renderToStaticMarkup(
      <I18nProvider>
        <MemoryRouter initialEntries={[`/verify-email${query}`]}>
          <VerifyEmailView />
        </MemoryRouter>
      </I18nProvider>,
    );

  it("shows the pending address carried via ?email=", () => {
    const out = render("?email=founder%40buildco.in");
    expect(out).toContain("Check your inbox");
    expect(out).toContain("founder@buildco.in");
  });

  it("renders a real resend button + editable email field (no fake handler)", () => {
    const out = render("?email=a%40b.in");
    expect(out).toContain("Resend confirmation email");
    expect(out).toContain('type="email"');
    expect(out).not.toContain("javascript:void(0)");
  });

  it("never navigates during render for anonymous users", () => {
    const out = render();
    expect(out).not.toContain("NAVIGATE");
  });
});
