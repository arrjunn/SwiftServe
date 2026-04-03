import { useState, useCallback } from "react";

/**
 * KioskPhoneScreen — Customer phone number entry with numpad.
 * Matching Rasoi-style layout. Always light theme with green accent.
 *
 * Props:
 *   onConfirm(phone) — called with 10-digit phone string
 *   onSkip()         — called when customer taps "Skip"
 */
export default function KioskPhoneScreen({ onConfirm, onSkip }) {
  const [digits, setDigits] = useState("");

  const isValid = digits.length === 10;

  const formatPhone = useCallback((raw) => {
    // Format as: XXXXX XXXXX
    if (raw.length <= 5) return raw;
    return raw.slice(0, 5) + " " + raw.slice(5);
  }, []);

  const handleDigit = useCallback((d) => {
    setDigits((prev) => {
      if (prev.length >= 10) return prev;
      return prev + d;
    });
  }, []);

  const handleBackspace = useCallback(() => {
    setDigits((prev) => prev.slice(0, -1));
  }, []);

  const handleConfirm = useCallback(() => {
    if (digits.length === 10 && onConfirm) {
      onConfirm(digits);
    }
  }, [digits, onConfirm]);

  const handleSkip = useCallback(() => {
    if (onSkip) onSkip();
  }, [onSkip]);

  const numpadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

  return (
    <div style={styles.container}>
      {/* Skip link — top right */}
      <button style={styles.skipButton} onClick={handleSkip} aria-label="Skip">
        Skip
      </button>

      {/* Title */}
      <h1 style={styles.title}>Enter your Mobile Number</h1>

      {/* Subtitle */}
      <p style={styles.subtitle}>
        We'll send your receipt and a 10% discount code for your next visit
      </p>

      {/* Phone display */}
      <div style={styles.phoneDisplay}>
        <span style={styles.countryCode}>+91</span>
        <span style={styles.phoneDigits}>
          {digits.length > 0 ? formatPhone(digits) : "XXXXX XXXXX"}
        </span>
      </div>
      {digits.length > 0 && digits.length < 10 && (
        <p style={styles.validationHint}>{10 - digits.length} more digits needed</p>
      )}

      {/* Numpad */}
      <div style={styles.numpad}>
        {numpadKeys.map((key, idx) => {
          if (key === "") {
            return <div key={idx} style={styles.numpadEmpty} />;
          }
          if (key === "back") {
            return (
              <button
                key={idx}
                style={{
                  ...styles.numpadButton,
                  ...(digits.length === 0 ? styles.numpadButtonDisabled : {}),
                }}
                onClick={handleBackspace}
                disabled={digits.length === 0}
                aria-label="Backspace"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              </button>
            );
          }
          return (
            <button
              key={idx}
              style={{
                ...styles.numpadButton,
                ...(digits.length >= 10 ? styles.numpadButtonDisabled : {}),
              }}
              onClick={() => handleDigit(key)}
              disabled={digits.length >= 10}
            >
              {key}
            </button>
          );
        })}
      </div>

      {/* Confirm button */}
      <button
        style={{
          ...styles.confirmButton,
          ...(isValid ? {} : styles.confirmButtonDisabled),
        }}
        onClick={handleConfirm}
        disabled={!isValid}
      >
        Confirm
      </button>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minHeight: "100vh",
    width: "100%",
    background: "#ffffff",
    padding: "32px 24px",
    boxSizing: "border-box",
    position: "relative",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  },
  skipButton: {
    position: "absolute",
    top: 24,
    right: 24,
    background: "none",
    border: "none",
    color: "#6b7280",
    fontSize: 17,
    fontWeight: 600,
    cursor: "pointer",
    padding: "8px 16px",
    minHeight: 56,
    minWidth: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    touchAction: "manipulation",
  },
  title: {
    fontSize: 32,
    fontWeight: 800,
    color: "#111827",
    textAlign: "center",
    margin: "48px 0 8px 0",
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    margin: "0 0 32px 0",
    maxWidth: 380,
    lineHeight: 1.5,
  },
  phoneDisplay: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    background: "#f8fafc",
    border: "2px solid #e5e7eb",
    borderRadius: 16,
    padding: "16px 24px",
    minHeight: 64,
    width: "100%",
    maxWidth: 380,
    marginBottom: 8,
    boxSizing: "border-box",
  },
  countryCode: {
    fontSize: 24,
    fontWeight: 700,
    color: "#374151",
  },
  phoneDigits: {
    fontSize: 28,
    fontWeight: 700,
    color: "#111827",
    letterSpacing: "2px",
    fontVariantNumeric: "tabular-nums",
  },
  validationHint: {
    fontSize: 13,
    color: "#9ca3af",
    margin: "4px 0 0 0",
    textAlign: "center",
  },
  numpad: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    width: "100%",
    maxWidth: 340,
    margin: "24px 0",
  },
  numpadButton: {
    height: 64,
    minHeight: 64,
    minWidth: 56,
    fontSize: 26,
    fontWeight: 700,
    color: "#111827",
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.1s",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  numpadButtonDisabled: {
    opacity: 0.35,
    cursor: "default",
  },
  numpadEmpty: {
    height: 64,
    minHeight: 64,
  },
  confirmButton: {
    width: "100%",
    maxWidth: 380,
    height: 60,
    minHeight: 56,
    background: "#22c55e",
    color: "#ffffff",
    fontSize: 20,
    fontWeight: 700,
    border: "none",
    borderRadius: 14,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(34, 197, 94, 0.3)",
    transition: "opacity 0.15s",
    touchAction: "manipulation",
  },
  confirmButtonDisabled: {
    background: "#d1d5db",
    boxShadow: "none",
    cursor: "default",
  },
};
