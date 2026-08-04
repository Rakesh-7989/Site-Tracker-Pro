"use client";

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientDashboard } from "./ClientDashboard";

// Mock the dependencies
vi.mock("@/auth", () => ({
  useAuth: () => ({
    session: {
      user: { email: "client@example.com" },
    },
  }),
}));

vi.mock("@/components/ui/atoms", () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Spinner: () => <div>Spinner</div>,
  Alert: ({ variant, children }: any) => <div>{children}</div>,
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
  listClientProjects: () => Promise.resolve({ ok: true, data: [] }),
  listClientNotifications: () => Promise.resolve({ ok: true, data: [] }),
}));

vi.mock("@/lib/supabase", () => ({
  getClient: () => Promise.resolve(null),
}));

describe("ClientDashboard", () => {
  it("renders client dashboard with project list", async () => {
    const TestComponent = () => {
      const { useEffect } = require("react");
      useEffect(() => {
        // Mock successful project data
        vi.mocked(require("@/app/clientPortalQueries")).listClientProjects.mockResolvedValue(
          Promise.resolve({
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
          })
        );
      }, []);

      return <ClientDashboard />;
    };

    const { container } = render(<TestComponent />);
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByText("Client Portal")).toBeInTheDocument();
    expect(screen.getByText("Daily Reports")).toBeInTheDocument();
    expect(screen.getByText("Handover Packet")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    const TestComponent = () => {
      const { useEffect } = require("react");
      useEffect(() => {
        // Keep the mock unresolved to test loading state
      }, []);

      return <ClientDashboard />;
    };

    const { container } = render(<TestComponent />);
    expect(screen.getByRole("spinner") || container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows error message when backend is not configured", async () => {
    const TestComponent = () => {
      const { useEffect } = require("react");
      useEffect(() => {
        vi.mocked(require("@/lib/supabase")).getClient.mockResolvedValue(null);
      }, []);

      return <ClientDashboard />;
    };

    const { container } = render(<TestComponent />);
    expect(screen.getByText("Backend not configured.")).toBeInTheDocument();
  });
});
