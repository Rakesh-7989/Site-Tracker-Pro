// useConnectionStatus — pendingOps must reflect the REAL offline queue
// (offlineQueue's IndexedDB engine), locking the offline-consolidation
// regression where the pill read a dead localStorage counter and always
// showed 0 while DPRs sat queued.

import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const queueDepth = vi.fn(async () => ({ total: 4, by_kind: { dpr: 4 }, by_status: { pending: 4 } }));
const onConnectivityChange = vi.fn(() => () => {});

vi.mock("@/lib/offlineQueue", () => ({
  queueDepth: queueDepth,
}));
vi.mock("@/lib/offline", () => ({
  isOnline: () => true,
  onConnectivityChange: onConnectivityChange,
}));

import { useConnectionStatus } from "@/lib/platform/useConnectionStatus";

describe("useConnectionStatus pendingOps source", () => {
  it("seeds pendingOps from the real queue depth", async () => {
    const { result } = renderHook(() => useConnectionStatus());
    await waitFor(() => expect(result.current.pendingOps).toBe(4));
    expect(result.current.online).toBe(true);
    expect(onConnectivityChange).toHaveBeenCalled();
  });

  it("stays at zero when the queue backend is unavailable (no IndexedDB)", async () => {
    queueDepth.mockRejectedValueOnce(new Error("IndexedDB not available"));
    const { result } = renderHook(() => useConnectionStatus());
    await waitFor(() => expect(queueDepth).toHaveBeenCalled());
    expect(result.current.pendingOps).toBe(0);
  });
});
