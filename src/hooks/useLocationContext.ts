// SiteTrack Pro — Location Context Hook (VNEXT-005 / P1.4).
//
// Provides the current spatial location within a project's hierarchy and
// enables location-scoped data operations for offline-first workflows.
//
// Hierarchy: site → building → floor → zone → room.
// Every record can carry a `location_id` linking it to this hierarchy
// (e.g. attendance.location_id, stamped via the P1.4 migration 209).
//
// P1.4: this hook is now a REAL consumer of the spatial engine:
//   - loads the project's actual hierarchy via `loadProjectHierarchy`
//     (correct table names, real names — no "Site {id}" placeholders);
//   - exposes a flat `options` list + a resolved `currentPath` breadcrumb;
//   - removed the pre-existing setState-during-render anti-pattern (the
//     module gate is now purely derived, and the hierarchy loads in an
//     effect).
//
// Consumers:
//   - DetailView.tsx: header location selector (options + breadcrumb + Reset).
//   - AttendanceTab.tsx: stamps the selected location on new attendance rows.
//
// Callers pass the projectId; when the `space` module is disabled (or no
// projectId is supplied) the hook stays inert (no network, empty selection).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useModules } from "@/modules";
import {
  loadProjectHierarchy,
  locationOptions,
  hierarchyPath,
  type SpatialHierarchy,
  type SpatialLevel,
} from "@/app/queries/spaceQueries";

export interface LocationContext {
  /** Whether the space module is enabled for the active org. */
  spaceEnabled: boolean;
  /** Hierarchy loading state (only meaningful when spaceEnabled + projectId). */
  loading: boolean;
  error: string | null;
  /** Loaded hierarchy for the project (null before load / when disabled). */
  hierarchy: SpatialHierarchy | null;
  /** Flat, stable option list (site → building → floor → zone → room). */
  options: Array<{ id: string; label: string; level: SpatialLevel }>;
  /** Currently selected location id ("" = none). */
  currentLocationId: string;
  locationLevel: SpatialLevel;
  /** Resolved ancestor→location breadcrumb (real names). */
  currentPath: Array<{ id: string; name: string; level: SpatialLevel }>;
  /** Leaf label of the current selection (null when none selected). */
  currentLabel: string | null;
  setLocationId: (id: string, level?: SpatialLevel) => void;
  resetLocation: () => void;
}

export function useLocationContext(projectId?: string): LocationContext {
  const { isEnabled } = useModules();
  const spaceEnabled = isEnabled("space");

  const [selection, setSelection] = useState<{ id: string; level: SpatialLevel }>({ id: "", level: "site" });
  const [hierarchy, setHierarchy] = useState<SpatialHierarchy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spaceEnabled || !projectId) {
      setHierarchy(null);
      setSelection({ id: "", level: "site" });
      setError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      // Dynamic import mirrors useProject.ts (avoids importing lib/supabase
      // at module load so the auth layer stays dependency-free).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import("../lib/supabase/supabase");
      const client = await mod.getSupabaseClient();
      if (cancelled) return;
      if (!client) { setLoading(false); setError("Backend not configured."); return; }
      const res = await loadProjectHierarchy(client, projectId);
      if (cancelled) return;
      if (!res.ok) { setLoading(false); setError(res.error); return; }
      setHierarchy(res.data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [spaceEnabled, projectId]);

  // Reset the selection whenever the hierarchy changes (project switch).
  useEffect(() => {
    setSelection(s => (s.id === "" ? s : { id: "", level: "site" }));
  }, [hierarchy?.projectId]);

  const options = useMemo(() => (hierarchy ? locationOptions(hierarchy) : []), [hierarchy]);
  const currentPath = useMemo(
    () => (hierarchy ? hierarchyPath(hierarchy, selection.id) : []),
    [hierarchy, selection.id],
  );
  const currentLabel = currentPath.length === 0 ? null : currentPath[currentPath.length - 1].name;

  const setLocationId = useCallback((id: string, level?: SpatialLevel) => {
    if (!id) {
      setSelection({ id: "", level: level ?? "site" });
      return;
    }
    const opt = options.find(o => o.id === id);
    setSelection({ id, level: level ?? opt?.level ?? "site" });
  }, [options]);

  const resetLocation = useCallback(() => {
    setSelection({ id: "", level: "site" });
  }, []);

  return {
    spaceEnabled,
    loading,
    error,
    hierarchy,
    options,
    currentLocationId: selection.id,
    locationLevel: selection.level,
    currentPath,
    currentLabel,
    setLocationId,
    resetLocation,
  };
}
