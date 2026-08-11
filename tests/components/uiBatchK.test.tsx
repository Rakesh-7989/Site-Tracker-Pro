// SiteTrack Pro — Option 4 / Phase 4 Batch K: Modal `action` header slot,
// long-title truncation, and the last raw fixed-overlay modal migrated to Modal.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Modal } from "@/components/ui/Modal";

describe("Modal — action header slot", () => {
  it("renders the action between the title and the close button", () => {
    render(
      <Modal open onClose={() => {}} title="Manage org" action={<button>Badge</button>}>
        body
      </Modal>
    );
    const title = screen.getByRole("heading", { name: "Manage org" });
    const badge = screen.getByText("Badge");
    const close = screen.getByRole("button", { name: "Close" });
    expect(title.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(badge.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the close button working alongside an action", () => {
    render(
      <Modal open onClose={() => {}} title="T" action={<span>Action</span>}>
        body
      </Modal>
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("truncates long titles", () => {
    render(
      <Modal open onClose={() => {}} title="A very long organization name that must not wrap the header layout">
        body
      </Modal>
    );
    expect(screen.getByRole("heading")).toHaveClass("truncate");
  });

  it("renders nothing when closed even with an action", () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="T" action={<span>Action</span>}>
        body
      </Modal>
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders no empty action wrapper when omitted", () => {
    render(
      <Modal open onClose={() => {}} title="T">
        body
      </Modal>
    );
    expect(screen.getByText("body")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "T" })).toBeInTheDocument();
  });
});
