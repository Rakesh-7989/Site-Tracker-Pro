import { useCallback, useEffect, useState } from "react";

type QueryResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface UseDataListOptions {
  pageSize?: number;
  enabled?: boolean;
}

export interface UseDataListReturn<T> {
  rows: T[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  page: number;
  setPage: (n: number) => void;
  hasNext: boolean;
  hasPrev: boolean;
  pageSize: number;
}

export function useDataList<T>(
  fetcher: () => Promise<QueryResult<T[]>>,
  deps: React.DependencyList,
  options: UseDataListOptions = {},
): UseDataListReturn<T> {
  const { pageSize = 25, enabled = true } = options;
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher();
      if (res.ok) {
        setRows(res.data);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (enabled) {
      void reload();
    }
     
  }, [reload, enabled]);

  const hasNext = rows.length >= pageSize;
  const hasPrev = page > 0;

  return {
    rows,
    loading,
    error,
    reload,
    page,
    setPage,
    hasNext,
    hasPrev,
    pageSize,
  };
}
