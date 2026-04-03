import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { SyncEngine } from "./SyncEngine.js";

const SyncContext = createContext(null);

/**
 * SyncProvider — wraps the app to provide cloud sync state and controls.
 *
 * Props:
 *   apiBaseUrl  — cloud API base URL (default: http://localhost:3001)
 *   autoStart   — start auto-sync on mount when online (default: true)
 *   intervalMs  — auto-sync polling interval in ms (default: 30000)
 */
export function SyncProvider({
  children,
  apiBaseUrl = "http://localhost:3001",
  autoStart = true,
  intervalMs = 30000,
}) {
  const engineRef = useRef(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState(null);

  // Create engine once
  if (!engineRef.current) {
    engineRef.current = new SyncEngine(apiBaseUrl);
  }
  const engine = engineRef.current;

  // Subscribe to engine status changes
  useEffect(() => {
    const unsub = engine.onStatusChange((status) => {
      if (status.isSyncing !== undefined) setIsSyncing(status.isSyncing);
      if (status.lastSyncAt !== undefined) setLastSyncAt(status.lastSyncAt);
      if (status.error !== undefined) setError(status.error);
    });
    return unsub;
  }, [engine]);

  // Online/offline listeners
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Auto-start sync when online
  useEffect(() => {
    if (autoStart && isOnline && engine.token) {
      engine.startAutoSync(intervalMs);
    }
    if (!isOnline) {
      engine.stopAutoSync();
    }
    return () => engine.stopAutoSync();
  }, [autoStart, isOnline, intervalMs, engine]);

  // Refresh pending count periodically
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const count = await engine.getPendingCount();
        if (!cancelled) setPendingCount(count);
      } catch {
        // silent
      }
    };
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [engine, lastSyncAt]);

  // Exposed actions

  const login = useCallback(async (outletId, pin) => {
    const result = await engine.login(outletId, pin);
    // After login, kick off auto-sync if online
    if (isOnline && autoStart) {
      engine.startAutoSync(intervalMs);
    }
    return result;
  }, [engine, isOnline, autoStart, intervalMs]);

  const sync = useCallback(() => engine.sync(), [engine]);

  const startAutoSync = useCallback(
    (ms) => engine.startAutoSync(ms || intervalMs),
    [engine, intervalMs],
  );

  const stopAutoSync = useCallback(() => engine.stopAutoSync(), [engine]);

  const value = {
    isOnline,
    isSyncing,
    lastSyncAt,
    pendingCount,
    error,
    login,
    sync,
    startAutoSync,
    stopAutoSync,
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be inside SyncProvider");
  return ctx;
}
