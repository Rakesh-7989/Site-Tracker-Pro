import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

import { I18nProvider } from "@/i18n/I18nProvider";
import { ClientDashboard } from "@/features/dashboards/ClientDashboard";
import { listClientProjects } from "@/app/queries/clientPortalQueries";
import { getTypedClient } from "@/lib/supabase/db";

vi.mock("@/auth", () => ({
  useAuth: () => ({
    session: {
      user: {
        email: "client@example.com",
        name: "Rakesh Kumar",
        identityRole: "client",
        isStaff: false,
      },
    },
  }),
  ROLE_LABEL: { client: "Client" },
}));

type MockAtomProps = {
  children?: ReactNode;
  className?: string;
  status?: string;
  value?: string | number;
  label?: string;
  [key: string]: unknown;
};

vi.mock("@/components/ui/atoms", () => ({
  Card: ({ children, className, ...props }: MockAtomProps) => <div className={className} {...props}>{children}</div>,
  Spinner: () => <div role="spinner">Spinner</div>,
  Alert: ({ children }: MockAtomProps) => <div>{children}</div>,
  Icon: () => <span>icon</span>,
  Badge: ({ children, ...props }: MockAtomProps) => <span {...props}>{children}</span>,
  StatusBadge: ({ status }: MockAtomProps) => <span data-status={status}>{status}</span>,
  ProgressBar: ({ value }: MockAtomProps) => <span data-progress={value}>{value}</span>,
  StatCard: ({ label, value }: MockAtomProps) => (
    <div data-stat>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
}));

type MockSelectProps = {
  options?: Array<{ value: string | number; label: string }>;
  [key: string]: unknown;
};

vi.mock("@/components/ui/forms", () => ({
  Input: ({ placeholder, ...props }: InputHTMLAttributes<HTMLInputElement> & Record<string, unknown>) => <input placeholder={placeholder} {...props} />,
  Textarea: ({ placeholder, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & Record<string, unknown>) => <textarea placeholder={placeholder} {...props} />,
  Select: ({ options, ...props }: MockSelectProps) => (
    <select {...props}>{options?.map((opt) => (<option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>))}</select>
  ),
}));

vi.mock("@/app/queries/clientPortalQueries", () => ({
  listClientProjects: vi.fn(),
  listClientNotifications: vi.fn(),
}));

vi.mock("@/lib/supabase/db", () => ({
  getTypedClient: vi.fn(),
}));

function renderDashboard() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <ClientDashboard />
      </MemoryRouter>
    </I18nProvider>
  );
}

describe("ClientDashboard", () => {
  it("renders client dashboard with project list", async () => {
    vi.mocked(getTypedClient).mockResolvedValue({} as never);
    vi.mocked(listClientProjects).mockResolvedValue({
      ok: true,
      data: [
        {
          id: "project1",
          name: "Skyline Tower",
          location: "New York, NY",
          status: "active",
          progress: 75,
          type: "construction",
          client_email: "client@example.com",
        },
        {
          id: "project2",
          name: "Ocean View Apartments",
          location: null,
          status: "completed",
          progress: 100,
          type: "interior",
          client_email: "client@example.com",
        },
      ],
    });

    renderDashboard();

    expect(await screen.findByText("Welcome, Rakesh")).toBeInTheDocument();
    expect(screen.getByText("Skyline Tower")).toBeInTheDocument();
    expect(screen.getByText("Ocean View Apartments")).toBeInTheDocument();
    expect(screen.getByText("Client Portal")).toBeInTheDocument();
    expect(screen.getByText("Daily Reports")).toBeInTheDocument();
    expect(screen.getByText("Handover Packet")).toBeInTheDocument();
    expect(screen.getByText("Your projects")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Updates")).toBeInTheDocument();
    expect(screen.getByText("Active projects")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    vi.mocked(getTypedClient).mockImplementation(() => new Promise(() => {}));

    renderDashboard();

    expect(screen.getByRole("spinner")).toBeInTheDocument();
  });

  it("shows error message when backend is not configured", async () => {
    vi.mocked(getTypedClient).mockResolvedValue(null);

    renderDashboard();

    expect(await screen.findByText("Backend not configured.")).toBeInTheDocument();
  });
});