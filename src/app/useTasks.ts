import { useSupabaseQuery, useSupabaseMutation } from "./useSupabaseQuery";
import { listTasks, createTask, setTaskStatus, deleteTask } from "./taskQueries";
import type { TaskStatus, TaskPriority } from "./taskQueries";

export function useTasks(projectId: string | undefined) {
  return useSupabaseQuery(
    ["tasks", projectId],
    (client) => listTasks(client, projectId!),
    { enabled: !!projectId },
  );
}

export function useCreateTask() {
  return useSupabaseMutation(
    (client, vars: { projectId: string; title: string; assigneeName?: string; dueDate?: string | null; priority?: TaskPriority }) =>
      createTask(client, vars),
    {},
    [["tasks"]],
  );
}

export function useSetTaskStatus() {
  return useSupabaseMutation(
    (client, vars: { id: string; status: TaskStatus }) =>
      setTaskStatus(client, vars.id, vars.status),
    {},
    [["tasks"]],
  );
}

export function useDeleteTask() {
  return useSupabaseMutation(
    (client, id: string) => deleteTask(client, id),
    {},
    [["tasks"]],
  );
}
