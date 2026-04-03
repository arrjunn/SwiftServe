/**
 * Branded loading screen with animated spinner.
 * Used for app startup, lazy screen transitions, and data loading.
 *
 * Props:
 *   message  — text below spinner (default: "Loading...")
 *   compact  — if true, renders inline (no full-screen) for use inside panels
 */
export default function LoadingScreen({ message = "Loading...", compact = false }) {
  if (compact) {
    return (
      <div style={S.compact}>
        <div style={S.spinner}>
          <div style={S.ring} />
        </div>
        <span style={S.compactText}>{message}</span>
      </div>
    );
  }

  return (
    <div style={S.fullscreen}>
      <div style={S.card}>
        <div style={S.logoRow}>
          <span style={S.logoText}>SwiftServe</span>
          <span style={S.logoBadge}>POS</span>
        </div>
        <div style={S.spinnerLarge}>
          <div style={S.ringLarge} />
        </div>
        <div style={S.message}>{message}</div>
        <div style={S.sub}>Please wait</div>
      </div>

      {/* CSS keyframes injected inline */}
      <style>{`
        @keyframes ss-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes ss-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const S = {
  fullscreen: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--bg-primary)",
    zIndex: 10000,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 20,
    padding: 40,
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  logoText: {
    fontSize: 28,
    fontWeight: 800,
    color: "var(--text-primary)",
    letterSpacing: "-0.02em",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  logoBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: "#3b82f6",
    backgroundColor: "rgba(59,130,246,0.15)",
    padding: "3px 8px",
    borderRadius: 6,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  spinnerLarge: {
    width: 48,
    height: 48,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ringLarge: {
    width: 40,
    height: 40,
    border: "3px solid var(--border)",
    borderTopColor: "#3b82f6",
    borderRadius: "50%",
    animation: "ss-spin 0.8s linear infinite",
  },
  message: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-muted)",
    animation: "ss-pulse 1.5s ease-in-out infinite",
  },
  sub: {
    fontSize: 12,
    color: "var(--text-dim)",
    letterSpacing: 0.3,
  },

  // Compact (inline) variant
  compact: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  spinner: {
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: 28,
    height: 28,
    border: "3px solid var(--border)",
    borderTopColor: "#3b82f6",
    borderRadius: "50%",
    animation: "ss-spin 0.8s linear infinite",
  },
  compactText: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-muted)",
  },
};
