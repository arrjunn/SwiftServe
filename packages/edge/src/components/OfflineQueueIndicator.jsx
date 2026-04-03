import { useState, useEffect, useRef } from "react";
import { db } from "../db/index.js";

/**
 * Shows sync status badge with pending count and progress feedback.
 * - Green dot + "Synced" when all caught up
 * - Yellow dot + "Syncing 23" when pushing data
 * - Red dot + "Offline 23" when no internet
 * - Hidden when online + 0 pending
 */
export default function OfflineQueueIndicator() {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [prevPending, setPrevPending] = useState(0);
  const pendingRef = useRef(0);

  useEffect(() => {
    async function countPending() {
      try {
        const tables = ["orders", "payments", "invoices", "order_items"];
        let total = 0;
        for (const t of tables) {
          const count = await db.table(t).filter((r) => !r.synced_at).count();
          total += count;
        }
        setPrevPending(pendingRef.current);
        pendingRef.current = total;
        setPending(total);
      } catch {
        // Ignore — tables may not exist yet
      }
    }

    countPending();
    const interval = setInterval(countPending, 15000);

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Determine state
  const isSyncing = online && pending > 0;
  const isSynced = online && pending === 0;
  const isOffline = !online;
  const justSynced = prevPending > 0 && pending === 0 && online;

  // Show briefly after sync completes, then hide
  const [showSynced, setShowSynced] = useState(false);
  useEffect(() => {
    if (justSynced) {
      setShowSynced(true);
      const t = setTimeout(() => setShowSynced(false), 3000);
      return () => clearTimeout(t);
    }
  }, [justSynced]);

  if (isSynced && !showSynced) return null;

  const dotColor = isOffline ? "#f87171" : isSynced ? "#22c55e" : "#facc15";
  const label = isOffline ? "Offline" : isSynced ? "Synced" : "Syncing";

  return (
    <div style={styles.container} role="status" aria-live="polite">
      <span style={{ ...styles.dot, backgroundColor: dotColor }} />
      <span style={styles.text}>{label}</span>
      {pending > 0 && (
        <span style={styles.badge}>{pending > 99 ? "99+" : pending}</span>
      )}
      {isSyncing && <span style={styles.spinnerDot} />}

      <style>{`
        @keyframes ss-sync-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    position: "fixed",
    bottom: 20,
    right: 20,
    zIndex: 9998,
    display: "flex",
    alignItems: "center",
    gap: 6,
    height: 32,
    padding: "0 12px",
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.75)",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.1)",
    transition: "all 0.3s ease",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
    transition: "background-color 0.3s",
  },
  text: {
    fontSize: 11,
    fontWeight: 600,
    color: "#e2e8f0",
    letterSpacing: 0.3,
  },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    color: "#fff",
    backgroundColor: "#ef4444",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px",
  },
  spinnerDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: "#facc15",
    animation: "ss-sync-pulse 1s ease-in-out infinite",
  },
};
