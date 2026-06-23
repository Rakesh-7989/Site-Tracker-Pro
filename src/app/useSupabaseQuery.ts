import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

type QueryResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Lazy-load the Supabase client (same pattern as existing code).
async function getClient(): Promise<SupabaseClient> {
  const mod = await import("../lib/supabase.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod as any).getSupabaseClient() as SupabaseClient;
}

interface QueryOptions {
  enabled?: boolean;
  staleTime?: number;
  retry?: number;
}

/**
 * React Query wrapper for Supabase SELECT / RPC queries.
 * Uses the same dynamic client import as the existing codebase.
 */
export function useSupabaseQuery<T>(
  queryKey: QueryKey,
  queryFn: (client: SupabaseClient) => Promise<QueryResult<T>>,
  options: QueryOptions = {},
) {
  return useQuery<QueryResult<T>>({
    queryKey,
    queryFn: async () => {
      const client = await getClient();
      return queryFn(client);
    },
    staleTime: options.staleTime ?? 30_000,
    retry: options.retry ?? 1,
    enabled: options.enabled,
  });
}

/**
 * React Query wrapper for Supabase INSERT / UPDATE / DELETE mutations.
 */
export function useSupabaseMutation<TVar, TRes>(
  mutationFn: (client: SupabaseClient, vars: TVar) => Promise<QueryResult<TRes>>,
  options: { onSuccess?: (data: TRes) => void; onError?: (err: Error) => void } = {},
  invalidateKeys?: QueryKey[],
) {
  const queryClient = useQueryClient();

  return useMutation<QueryResult<TRes>, Error, TVar>({
    mutationFn: async (vars) => {
      const client = await getClient();
      return mutationFn(client, vars);
    },
    onSuccess: (data) => {
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
      if (options.onSuccess && data.ok) {
        options.onSuccess(data.data);
      }
    },
    onError: options.onError,
  });
}
