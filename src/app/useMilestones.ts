import { useSupabaseQuery, useSupabaseMutation } from "./useSupabaseQuery";
import { listMilestones, createMilestone, setMilestoneStatus, deleteMilestone } from "./milestoneQueries";
import type { MilestoneStatus } from "./milestoneQueries";

export function useMilestones(projectId: string | undefined) {
  return useSupabaseQuery(
    ["milestones", projectId],
    (client) => listMilestones(client, projectId!),
    { enabled: !!projectId },
  );
}

export function useCreateMilestone() {
  return useSupabaseMutation(
    (client, vars: { projectId: string; title: string; dueDate?: string | null; sortOrder?: number }) =>
      createMilestone(client, vars),
    {},
    [["milestones"]],
  );
}

export function useSetMilestoneStatus() {
  return useSupabaseMutation(
    (client, vars: { id: string; status: MilestoneStatus }) =>
      setMilestoneStatus(client, vars.id, vars.status),
    {},
    [["milestones"]],
  );
}

export function useDeleteMilestone() {
  return useSupabaseMutation(
    (client, id: string) => deleteMilestone(client, id),
    {},
    [["milestones"]],
  );
}
