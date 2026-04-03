import { useCallback } from "react";

/**
 * KioskWelcomeScreen — Full-screen customer-facing kiosk welcome.
 * Supports light/dark theme via CSS variables. Green (#22c55e) accent.
 *
 * Props:
 *   onStart()    — called when customer taps "Start Order"
 *   outletName   — display name of the outlet
 */
export default function KioskWelcomeScreen({ onStart, outletName }) {
  const handleStart = useCallback(() => {
    if (onStart) onStart();
  }, [onStart]);

  return (
    <div style={styles.container} onClick={handleStart}>
      {/* Top spacer */}
      <div style={{ flex: 1 }} />

      {/* Outlet name */}
      <h1 style={styles.outletName}>{outletName || "Welcome"}</h1>

      {/* Tagline */}
      <p style={styles.tagline}>Fresh food, made your way</p>

      {/* Start Order button */}
      <button
        style={styles.startButton}
        onClick={(e) => {
          e.stopPropagation();
          handleStart();
        }}
        aria-label="Start Order"
      >
        Start Order
      </button>

      {/* Helper text */}
      <p style={styles.helperText}>Touch to begin your order</p>

      {/* Bottom spacer */}
      <div style={{ flex: 1.5 }} />

      {/* Footer */}
      <p style={styles.footer}>Powered by SwiftServe</p>
    </div>
  );
}

const styles = {
  container: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    background: "linear-gradient(180deg, var(--bg-primary) 0%, #f0fdf4 100%)",
    padding: 32,
    boxSizing: "border-box",
    cursor: "pointer",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  },
  outletName: {
    fontSize: 48,
    fontWeight: 800,
    color: "var(--text-primary)",
    textAlign: "center",
    margin: 0,
    letterSpacing: "-0.5px",
    lineHeight: 1.2,
  },
  tagline: {
    fontSize: 20,
    color: "var(--text-muted)",
    textAlign: "center",
    margin: "12px 0 48px 0",
    fontWeight: 400,
  },
  startButton: {
    width: "100%",
    maxWidth: 400,
    height: 72,
    minHeight: 64,
    background: "#22c55e",
    color: "#ffffff",
    fontSize: 26,
    fontWeight: 700,
    border: "none",
    borderRadius: 16,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(34, 197, 94, 0.35)",
    transition: "transform 0.1s, box-shadow 0.1s",
    letterSpacing: "0.3px",
    touchAction: "manipulation",
  },
  helperText: {
    fontSize: 16,
    color: "var(--text-dim)",
    textAlign: "center",
    marginTop: 20,
    fontWeight: 400,
    animation: "kioskPulse 2s ease-in-out infinite",
  },
  footer: {
    fontSize: 13,
    color: "var(--border)",
    textAlign: "center",
    margin: 0,
    paddingBottom: 16,
    fontWeight: 500,
    letterSpacing: "0.5px",
  },
};
