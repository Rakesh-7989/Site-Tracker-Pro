// SiteTrack Pro — useProject hook (Phase 6).
//
// Fetches a project + its members for the detail view. Pure data-loading;
// capability resolution happens in the DetailView using the auth layer.

import { useEffect, useState } from "react";

import { getProject, listProjectMembers, type ProjectDetail, type ProjectMemberRow } from "@/app/queries/queries";

export type ProjectLoad =
  | { kind: "loading" }
  | { kind: "ready"; project: ProjectDetail; members: ProjectMemberRow[] }
  | { kind: "error"; message: string };

export function useProject(projectId: string | undefined): { state: ProjectLoad; reload: () => void } {
  const [state, setState] = useState<ProjectLoad>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!projectId) { setState({ kind: "error", message: "No project id." }); return; }
      setState({ kind: "loading" });
      const mod = await import("../../lib/supabase/supabase");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = await (mod as any).getSupabaseClient();
      if (!client) { setState({ kind: "error", message: "Backend not configured." }); return; }
      const [p, m] = await Promise.all([
        getProject(client, projectId),
        listProjectMembers(client, projectId),
      ]);
      if (cancelled) return;
      if (!p.ok) { setState({ kind: "error", message: p.error }); return; }
      setState({ kind: "ready", project: p.data, members: m.ok ? m.data : [] });
    })();
    return () => { cancelled = true; };
  }, [projectId, nonce]);

  return { state, reload: () => setNonce(n => n + 1) };
}
