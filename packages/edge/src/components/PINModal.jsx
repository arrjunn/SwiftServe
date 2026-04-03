import React from "react";

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: "var(--bg-secondary)",
    borderRadius: 16,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  desc: {
    margin: 0,
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center",
  },
  pinInput: {
    width: "100%",
    padding: "14px 16px",
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--text-primary)",
    fontSize: 24,
    fontWeight: 700,
    fontFamily: "monospace",
    textAlign: "center",
    outline: "none",
    boxSizing: "border-box",
    letterSpacing: 8,
  },
  error: {
    fontSize: 13,
    color: "#fca5a5",
    textAlign: "center",
    padding: "4px 0",
  },
  verifyBtn: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#22c55e",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  cancelBtn: {
    padding: "6px 0",
    border: "none",
    backgroundColor: "transparent",
    color: "var(--text-dim)",
    fontSize: 13,
    cursor: "pointer",
    textDecoration: "underline",
  },
};

/**
 * Reusable PIN modal for owner authorization.
 * Used with usePINChallenge hook.
 *
 * Props: { show, title, description, pinInput, setPinInput, pinError, onSubmit, onCancel }
 */
export default function PINModal({
  show,
  title = "Owner PIN Required",
  description = "This action requires owner authorization",
  pinInput,
  setPinInput,
  pinError,
  onSubmit,
  onCancel,
}) {
  if (!show) return null;

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>{title}</h3>
        <p style={styles.desc}>{description}</p>
        <input
          style={styles.pinInput}
          type="password"
          inputMode="numeric"
          placeholder="Enter PIN"
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        />
        {pinError && <div style={styles.error}>{pinError}</div>}
        <button style={styles.verifyBtn} onClick={onSubmit}>Verify</button>
        <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
