import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import PinPad from "../components/PinPad.jsx";
import { formatINR, toPaise } from "@swiftserve/shared";

const QUICK_AMOUNTS = [0, 500, 1000, 2000, 5000];

export default function ShiftOpenScreen({ onShiftOpened, onBack }) {
  const auth = useAuth();
  const [amountStr, setAmountStr] = useState("");
  const [dateTime, setDateTime] = useState(new Date());
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setDateTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const amountPaise = amountStr === "" ? 0 : toPaise(Number(amountStr));

  const handlePinPadChange = (value) => {
    setAmountStr(value);
    setError("");
  };

  const handleQuickAmount = (rupees) => {
    setAmountStr(rupees === 0 ? "" : String(rupees));
    setError("");
  };

  const allowedRoles = ["counter", "owner", "admin"];
  const canOpenShift = allowedRoles.includes(auth.staff?.role);

  const handleOpenShift = async () => {
    if (!canOpenShift) {
      setError(`Role "${auth.staff?.role}" cannot open a shift. Only counter, owner, and admin roles can.`);
      return;
    }
    setOpening(true);
    setError("");
    try {
      const result = await auth.openShift(amountPaise);
      if (result) {
        onShiftOpened();
      } else {
        setError("Failed to open shift. Please try again.");
      }
    } catch (err) {
      setError(err.message || "An error occurred.");
    } finally {
      setOpening(false);
    }
  };

  const formattedDate = dateTime.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedTime = dateTime.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const roleBadgeColor =
    auth.staff?.role === "admin" || auth.staff?.role === "manager"
      ? "#6366f1"
      : auth.staff?.role === "cashier"
        ? "#0ea5e9"
        : "var(--text-dim)";

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Date/Time */}
        <div style={styles.dateTimeRow}>
          <span style={styles.dateText}>{formattedDate}</span>
          <span style={styles.timeText}>{formattedTime}</span>
        </div>

        {/* Greeting */}
        <h1 style={styles.greeting}>
          Welcome, {auth.staff?.name || "Staff"}
        </h1>
        <span
          style={{
            ...styles.roleBadge,
            backgroundColor: roleBadgeColor,
          }}
        >
          {auth.staff?.role || "staff"}
        </span>

        <p style={styles.prompt}>Enter opening cash amount</p>

        {/* Cash Display */}
        <div style={styles.amountDisplay}>
          <span style={styles.amountText}>
            {formatINR(amountPaise)}
          </span>
        </div>

        {/* Quick Amount Buttons */}
        <div style={styles.quickRow}>
          {QUICK_AMOUNTS.map((rupees) => (
            <button
              key={rupees}
              style={{
                ...styles.quickButton,
                ...(amountStr === (rupees === 0 ? "" : String(rupees))
                  ? styles.quickButtonActive
                  : {}),
              }}
              onClick={() => handleQuickAmount(rupees)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--border)";
                e.currentTarget.style.borderColor = "#6366f1";
              }}
              onMouseLeave={(e) => {
                const isActive =
                  amountStr === (rupees === 0 ? "" : String(rupees));
                e.currentTarget.style.backgroundColor = isActive
                  ? "#312e81"
                  : "var(--bg-primary)";
                e.currentTarget.style.borderColor = isActive
                  ? "#6366f1"
                  : "var(--border)";
              }}
            >
              {rupees === 0 ? "\u20B90" : `\u20B9${rupees.toLocaleString("en-IN")}`}
            </button>
          ))}
        </div>

        {/* PinPad for amount entry */}
        <PinPad
          value={amountStr}
          showDecimal={false}
          masked={false}
          maxLength={6}
          onChange={handlePinPadChange}
        />

        {/* Error */}
        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Open Shift Button */}
        <button
          style={{
            ...styles.openButton,
            ...(opening ? styles.openButtonDisabled : {}),
          }}
          onClick={handleOpenShift}
          disabled={opening}
          onMouseEnter={(e) => {
            if (!opening) e.currentTarget.style.backgroundColor = "#4f46e5";
          }}
          onMouseLeave={(e) => {
            if (!opening) e.currentTarget.style.backgroundColor = "#6366f1";
          }}
        >
          {opening ? "Opening..." : "Open Shift"}
        </button>

        {onBack && (
          <button
            style={styles.backButton}
            onClick={() => {
              auth.logout();
              onBack();
            }}
          >
            ← Logout
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "var(--bg-primary)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    padding: "24px 16px",
    overflowY: "auto",
    color: "var(--text-primary)",
  },
  card: {
    backgroundColor: "var(--bg-secondary)",
    borderRadius: 16,
    padding: 32,
    width: "100%",
    maxWidth: 440,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  dateTimeRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    marginBottom: 16,
  },
  dateText: {
    color: "var(--text-muted)",
    fontSize: 14,
  },
  timeText: {
    color: "var(--text-dim)",
    fontSize: 13,
  },
  greeting: {
    color: "var(--text-primary)",
    fontSize: 24,
    fontWeight: 700,
    margin: 0,
    textAlign: "center",
  },
  roleBadge: {
    display: "inline-block",
    marginTop: 8,
    marginBottom: 20,
    padding: "4px 14px",
    borderRadius: 20,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    textTransform: "capitalize",
    letterSpacing: "0.02em",
  },
  prompt: {
    color: "var(--text-muted)",
    fontSize: 15,
    margin: "0 0 12px 0",
  },
  amountDisplay: {
    width: "100%",
    padding: "16px 0",
    backgroundColor: "var(--bg-primary)",
    borderRadius: 12,
    textAlign: "center",
    marginBottom: 16,
  },
  amountText: {
    color: "var(--text-primary)",
    fontSize: 36,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  },
  quickRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginBottom: 16,
    width: "100%",
  },
  quickButton: {
    minHeight: 44,
    minWidth: 72,
    padding: "8px 14px",
    backgroundColor: "var(--bg-primary)",
    border: "2px solid var(--border)",
    borderRadius: 10,
    color: "var(--text-primary)",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 0.15s, border-color 0.15s",
  },
  quickButtonActive: {
    backgroundColor: "#312e81",
    borderColor: "#6366f1",
  },
  errorBox: {
    marginTop: 12,
    padding: "10px 16px",
    backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444",
    borderRadius: 8,
    color: "#fca5a5",
    fontSize: 14,
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box",
  },
  openButton: {
    marginTop: 16,
    width: "100%",
    minHeight: 52,
    padding: "12px 24px",
    backgroundColor: "#6366f1",
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    transition: "background-color 0.15s",
    letterSpacing: "0.01em",
  },
  openButtonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  backButton: {
    marginTop: 12,
    width: "100%",
    minHeight: 44,
    padding: "10px 24px",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 0.15s",
  },
};
