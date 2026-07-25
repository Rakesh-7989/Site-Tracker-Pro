import { useCallback, useState } from "react";
import { getClient } from "@/lib/supabase";

type ActionFn = (c: unknown) => Promise<{ ok: boolean; error?: string }>;

export interface UseActionOptions {
  backendError?: string;
  actionFailed?: string;
}

export interface OptimisticConfig {
  apply: () => void;
  rollback?: () => void;
}

export interface UseActionReturn {
  busy: string | null;
  run: (key: string, fn: ActionFn, optimistic?: OptimisticConfig) => Promise<void>;
}

export function useAction(
  reload: () => Promise<void>,
  setError: (err: string | null) => void,
  options?: UseActionOptions,
): UseActionReturn {
  const [busy, setBusy] = useState<string | null>(null);

  const beMsg = options?.backendError ?? "Backend not configured.";
  const afMsg = options?.actionFailed ?? "Action failed.";

  const run = useCallback(
    async (key: string, fn: ActionFn, optimistic?: OptimisticConfig) => {
      setBusy(key);
      setError(null);

      optimistic?.apply();

      const client = await getClient();
      if (!client) {
        setError(beMsg);
        optimistic?.rollback?.();
        setBusy(null);
        return;
      }
      const res = await fn(client);
      if (!res.ok) {
        setError(res.error ?? afMsg);
        optimistic?.rollback?.();
      }
      await reload();
      setBusy(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reload, setError, beMsg, afMsg],
  );

  return { busy, run };
}
