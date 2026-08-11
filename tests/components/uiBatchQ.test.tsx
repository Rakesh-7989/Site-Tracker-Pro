// SiteTrack Pro — Option 4 / Phase 4 Batch Q: Alert `title` prop + StatCard
// ReactNode icon (props-parity with Button leftIcon).

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Alert, StatCard } from "@/components/ui/atoms";

describe("Alert — title prop", () => {
  it("renders a bold title line above the message", () => {
    const { container } = render(
      <Alert variant="warning" title="Enable two-factor authentication">Use a mobile authenticator app.</Alert>
    );
    expect(screen.getByText("Enable two-factor authentication")).toBeInTheDocument();
    expect(screen.getByText("Use a mobile authenticator app.")).toBeInTheDocument();
    const title = container.querySelector(".font-semibold");
    expect(title).not.toBeNull();
    expect(title!.textContent).toBe("Enable two-factor authentication");
  });

  it("renders no title line when title is omitted", () => {
    const { container } = render(<Alert>Plain message</Alert>);
    expect(container.querySelector(".font-semibold")).toBeNull();
    expect(screen.getByText("Plain message")).toBeInTheDocument();
  });

  it("keeps action and dismiss alongside the title", () => {
    render(
      <Alert
        title="Sync failed"
        action={<button type="button">Retry</button>}
        onDismiss={() => {}}
      >
        Try again later.
      </Alert>
    );
    expect(screen.getByText("Sync failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });
});

describe("StatCard — icon accepts string or ReactNode", () => {
  it("renders a built-in icon from a string name", () => {
    const { container } = render(<StatCard icon="users" label="Members" value={5} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders a custom ReactNode icon", () => {
    const { container } = render(
      <StatCard icon={<span data-testid="custom-icon">★</span>} label="Rating" value="4.8" />
    );
    expect(container.querySelector("[data-testid='custom-icon']")).not.toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders no icon tile when icon is omitted", () => {
    const { container } = render(<StatCard label="Projects" value={3} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
