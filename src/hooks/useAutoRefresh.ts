import { useCallback, useEffect, useRef, useState } from "react";

type UseAutoRefreshOptions = {
  intervalMs?: number;
  pauseWhenHidden?: boolean;
};

export type UseAutoRefreshResult = {
  lastRefreshedAt: Date;
  isRefreshing: boolean;
  isOnline: boolean;
  refresh: () => Promise<void>;
};

export function useAutoRefresh(
  fn: () => Promise<void>,
  { intervalMs = 0, pauseWhenHidden = true }: UseAutoRefreshOptions = {}
): UseAutoRefreshResult {
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(() => new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  // Always call the latest version of fn without making it a dep of refresh.
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; }, [fn]);

  // runningRef guards against concurrent invocations without adding isRefreshing
  // to the dependency list (which would recreate refresh on every state change).
  const runningRef = useRef(false);

  const refresh = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRefreshing(true);
    try {
      await fnRef.current();
      setLastRefreshedAt(new Date());
    } catch {
      // On failure: keep existing data, don't update lastRefreshedAt.
    } finally {
      runningRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      void refresh();
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refresh]);

  useEffect(() => {
    if (!pauseWhenHidden) return;
    function handleVisibility() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [pauseWhenHidden, refresh]);

  useEffect(() => {
    if (!intervalMs) return;
    const id = window.setInterval(() => {
      if (pauseWhenHidden && document.visibilityState !== "visible") return;
      void refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, pauseWhenHidden, refresh]);

  return { lastRefreshedAt, isRefreshing, isOnline, refresh };
}
