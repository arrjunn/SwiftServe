import React, { useState, useCallback, useEffect } from "react";
import { toRupees, formatINR } from "@swiftserve/shared";

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    padding: 16,
    width: "100%",
    maxWidth: 320,
  },
  display: {
    width: "100%",
    minHeight: 56,
    background: "var(--bg-primary)",
    border: "2px solid var(--border)",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px 16px",
    boxSizing: "border-box",
  },
  displayText: {
    fontSize: 28,
    fontWeight: 600,
    color: "var(--text-primary)",
    letterSpacing: 6,
    fontFamily: "monospace",
    userSelect: "none",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
    width: "100%",
  },
  button: {
    height: 60,
    minWidth: 44,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    fontSize: 22,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    transition: "background 0.1s, transform 0.08s",
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
  },
  buttonActive: {
    background: "var(--border)",
    transform: "scale(0.96)",
  },
  clearButton: {
    background: "#7f1d1d",
    border: "1px solid #991b1b",
    color: "#fca5a5",
  },
  backspaceButton: {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
  },
  quickAmountsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
    justifyContent: "center",
    marginTop: 4,
  },
  quickButton: {
    height: 44,
    minWidth: 72,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
    color: "#38bdf8",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    touchAction: "manipulation",
  },
};

export default function PinPad({
  value: controlledValue,
  onChange,
  onSubmit,
  maxLength = 6,
  masked = false,
  showDecimal = false,
  quickAmounts,
}) {
  // Self-managed mode when onSubmit is provided without onChange
  const [internalValue, setInternalValue] = useState("");
  const isSelfManaged = !onChange && !!onSubmit;
  const value = isSelfManaged ? internalValue : (controlledValue || "");

  const setValue = useCallback((newVal) => {
    if (isSelfManaged) {
      setInternalValue(newVal);
      // Auto-submit when PIN reaches maxLength
      if (newVal.length === maxLength && onSubmit) {
        onSubmit(newVal);
        // Clear after short delay so user sees the dots fill
        setTimeout(() => setInternalValue(""), 800);
      }
    } else if (onChange) {
      onChange(newVal);
    }
  }, [isSelfManaged, onChange, onSubmit, maxLength]);

  const hasDecimal = value.includes(".");

  const handleDigit = useCallback(
    (digit) => {
      // If there's a decimal, limit to 2 decimal places
      if (hasDecimal) {
        const parts = value.split(".");
        if (parts[1] && parts[1].length >= 2) return;
      }
      if (!hasDecimal && value.replace(".", "").length >= maxLength) return;
      setValue(value + digit);
    },
    [value, setValue, maxLength, hasDecimal]
  );

  const handleDecimal = useCallback(() => {
    if (!showDecimal || hasDecimal) return;
    setValue(value === "" ? "0." : value + ".");
  }, [value, setValue, showDecimal, hasDecimal]);

  const handleBackspace = useCallback(() => {
    if (value.length === 0) return;
    setValue(value.slice(0, -1));
  }, [value, setValue]);

  const handleClear = useCallback(() => {
    setValue("");
  }, [setValue]);

  const handleQuickAmount = useCallback(
    (amountPaise) => {
      const rupees = toRupees(amountPaise);
      setValue(
        Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2)
      );
    },
    [setValue]
  );

  // Keyboard support — let users type with PC keyboard
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore keystrokes when user is typing in an input/textarea
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key >= "0" && e.key <= "9") {
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        handleBackspace();
      } else if (e.key === "Delete" || e.key === "Escape") {
        handleClear();
      } else if (e.key === "." && showDecimal) {
        handleDecimal();
      } else if (e.key === "Enter" && onSubmit) {
        onSubmit(value);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleDigit, handleBackspace, handleClear, handleDecimal, showDecimal, onSubmit, value]);

  // Format display value
  const displayValue = (() => {
    if (!value) return "";
    if (masked) return "\u2022".repeat(value.replace(".", "").length);
    return value;
  })();

  const digitKeys = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div style={styles.container}>
      {/* Display area */}
      <div style={styles.display}>
        <span style={styles.displayText}>
          {displayValue || <span style={{ color: "var(--border-light)" }}>--</span>}
        </span>
      </div>

      {/* 3x4 grid */}
      <div style={styles.grid}>
        {digitKeys.map((d) => (
          <button
            key={d}
            type="button"
            style={styles.button}
            onPointerDown={(e) => {
              e.currentTarget.style.background = "var(--border)";
              e.currentTarget.style.transform = "scale(0.96)";
            }}
            onPointerUp={(e) => {
              e.currentTarget.style.background = "var(--bg-secondary)";
              e.currentTarget.style.transform = "scale(1)";
            }}
            onPointerLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-secondary)";
              e.currentTarget.style.transform = "scale(1)";
            }}
            onClick={() => handleDigit(String(d))}
          >
            {d}
          </button>
        ))}

        {/* Bottom row: [decimal/clear], 0, backspace */}
        {showDecimal ? (
          <button
            type="button"
            style={{ ...styles.button, ...(hasDecimal ? { opacity: 0.4 } : {}) }}
            disabled={hasDecimal}
            onClick={handleDecimal}
          >
            .
          </button>
        ) : (
          <button
            type="button"
            style={{ ...styles.button, ...styles.clearButton }}
            onClick={handleClear}
          >
            C
          </button>
        )}

        <button
          type="button"
          style={styles.button}
          onPointerDown={(e) => {
            e.currentTarget.style.background = "var(--border)";
            e.currentTarget.style.transform = "scale(0.96)";
          }}
          onPointerUp={(e) => {
            e.currentTarget.style.background = "var(--bg-secondary)";
            e.currentTarget.style.transform = "scale(1)";
          }}
          onPointerLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-secondary)";
            e.currentTarget.style.transform = "scale(1)";
          }}
          onClick={() => handleDigit("0")}
        >
          0
        </button>

        <button
          type="button"
          style={{ ...styles.button, ...styles.backspaceButton }}
          onClick={handleBackspace}
        >
          &#9003;
        </button>
      </div>

      {/* Clear button when showDecimal is active (since C is replaced by .) */}
      {showDecimal && (
        <button
          type="button"
          style={{
            ...styles.button,
            ...styles.clearButton,
            width: "100%",
            height: 44,
            fontSize: 16,
          }}
          onClick={handleClear}
        >
          Clear
        </button>
      )}

      {/* Quick amount buttons */}
      {quickAmounts && quickAmounts.length > 0 && (
        <div style={styles.quickAmountsRow}>
          {quickAmounts.map((amount) => (
            <button
              key={amount}
              type="button"
              style={styles.quickButton}
              onClick={() => handleQuickAmount(amount)}
            >
              {formatINR(amount)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
