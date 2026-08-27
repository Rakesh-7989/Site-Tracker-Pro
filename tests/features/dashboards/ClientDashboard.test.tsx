import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ClientDashboard } from "@/features/dashboards/ClientDashboard";
import { listClientProjects } from "@/app/queries/clientPortalQueries";
import { getClient } from "@/lib/supabase/supabase";

vi.mock("@/auth", () => ({
  useAuth: () => ({
    session: {
      user: { email: "client@example.com" },
    },
  }),
}));

vi.mock("@/components/ui/atoms", () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Spinner: () => <div role="spinner">Spinner</div>,
  Alert: ({ children }: any) => <div>{children}</div>,
  Icon: () => <span>icon</span>,
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock("@/components/ui/forms", () => ({
  Input: ({ placeholder, ...props }: any) => <input placeholder={placeholder} {...props} />,
  Textarea: ({ placeholder, ...props }: any) => <textarea placeholder={placeholder} {...props} />,
  Select: ({ options, ...props }: any) => (
    <select {...props}>{options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select>
  ),
}));

vi.mock("@/app/clientPortalQueries", () => ({
  listClientProjects: vi.fn(),
  listClientNotifications: vi.fn(),
}));

vi.mock("@/lib/supabase/supabase", () => ({
  getClient: vi.fn(),
}));

describe("ClientDashboard", () => {
  it("renders client dashboard with project list", async () => {
    vi.mocked(getClient).mockResolvedValue({} as never);
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

    render(
      <MemoryRouter>
        <ClientDashboard />
      </MemoryRouter>
    );

    expect(await screen.findByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByText("Skyline Tower")).toBeInTheDocument();
    expect(screen.getByText("Ocean View Apartments")).toBeInTheDocument();
    expect(screen.getByText("Client Portal")).toBeInTheDocument();
    expect(screen.getByText("Daily Reports")).toBeInTheDocument();
    expect(screen.getByText("Handover Packet")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    vi.mocked(getClient).mockImplementation(() => new Promise(() => {}));

    render(
      <MemoryRouter>
        <ClientDashboard />
      </MemoryRouter>
    );

    expect(screen.getByRole("spinner")).toBeInTheDocument();
  });

  it("shows error message when backend is not configured", async () => {
    vi.mocked(getClient).mockResolvedValue(null);

    render(
      <MemoryRouter>
        <ClientDashboard />
      </MemoryRouter>
    );

    expect(await screen.findByText("Backend not configured.")).toBeInTheDocument();
  });
});
