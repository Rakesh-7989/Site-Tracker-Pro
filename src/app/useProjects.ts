import type { ProjectType } from "@/auth";
import { useSupabaseQuery, useSupabaseMutation } from "./useSupabaseQuery";
import { listProjectsForOrg, createProject, getProject, listProjectMembers } from "./queries";

export function useProjects(orgId: string | undefined) {
  return useSupabaseQuery(
    ["projects", orgId],
    (client) => listProjectsForOrg(client, orgId!),
    { enabled: !!orgId },
  );
}

export function useProject(projectId: string | undefined) {
  return useSupabaseQuery(
    ["project", projectId],
    (client) => getProject(client, projectId!),
    { enabled: !!projectId },
  );
}

export function useCreateProject() {
  return useSupabaseMutation(
    (client, vars: { orgId: string; name: string; type: ProjectType; location?: string }) => createProject(client, vars),
    {},
    [["projects"]],
  );
}

export function useProjectMembers(projectId: string | undefined) {
  return useSupabaseQuery(
    ["projectMembers", projectId],
    (client) => listProjectMembers(client, projectId!),
    { enabled: !!projectId },
  );
}
