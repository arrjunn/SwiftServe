import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import PinPad from "../components/PinPad.jsx";

const STEP_STAFF = "staff";
const STEP_PIN = "pin";
const ROLE_COLORS = { owner: "#6366f1", counter: "#3b82f6", kitchen: "#f59e0b", captain: "#22c55e", admin: "#8b5cf6", kiosk: "#10b981" };

export default function LoginScreen({ onLoginSuccess, onKioskMode }) {
  const auth = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [step, setStep] = useState(STEP_STAFF);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    auth.getStaffList()
      .then((list) => {
        console.log("[LOGIN] getStaffList returned:", list.length, "staff");
        if (!cancelled) {
          setStaffList(list.filter(s => s.role !== "kiosk"));
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("[LOGIN] getStaffList FAILED:", err);
        if (!cancelled) {
          setFetchError(String(err));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [auth.getStaffList]);

  const handleStaffSelect = (staff) => {
    setSelectedStaff(staff);
    setStep(STEP_PIN);
  };

  const handleBack = () => {
    setSelectedStaff(null);
    setStep(STEP_STAFF);
  };

  const [submitting, setSubmitting] = useState(false);

  const handlePinSubmit = async (pin) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const success = await auth.login(selectedStaff.id, pin);
      if (success) {
        onLoginSuccess();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>SwiftServe POS</h1>
        <p style={styles.subtitle}>Select staff &amp; enter PIN</p>

        {step === STEP_STAFF && (
          <div style={styles.stepContainer}>
            {loading ? (
              <p style={styles.loadingText}>Loading staff...</p>
            ) : fetchError ? (
              <p style={{ color: "#fca5a5", fontSize: 14, wordBreak: "break-all" }}>Error: {fetchError}</p>
            ) : staffList.length === 0 ? (
              <p style={styles.loadingText}>No active staff found. Check console (F12) for [SEED] logs.</p>
            ) : (
              <div style={styles.staffGrid}>
                {staffList.map((s) => (
                  <button
                    key={s.id}
                    style={styles.staffButton}
                    onClick={() => handleStaffSelect(s)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "rgba(99,102,241,0.08)";
                      e.currentTarget.style.borderColor = "rgba(99,102,241,0.3)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--glass)";
                      e.currentTarget.style.borderColor = "var(--border)";
                    }}
                  >
                    <span style={{ ...styles.staffAvatar, backgroundColor: ROLE_COLORS[s.role] || "#6366f1" }}>
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                    <span style={styles.staffName}>{s.name}</span>
                    <span style={{ ...styles.staffRole, color: ROLE_COLORS[s.role] || "var(--text-muted)" }}>{s.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === STEP_PIN && selectedStaff && (
          <div style={styles.stepContainer}>
            <button
              style={styles.backButton}
              onClick={handleBack}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--border)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              &larr; Back
            </button>

            <div style={styles.selectedStaffBanner}>
              <span style={styles.selectedAvatar}>
                {selectedStaff.name.charAt(0).toUpperCase()}
              </span>
              <span style={styles.selectedName}>{selectedStaff.name}</span>
            </div>

            <p style={styles.pinPrompt}>Enter your PIN</p>

            <PinPad
              masked={true}
              maxLength={4}
              onSubmit={handlePinSubmit}
            />

            {auth.loginError && (
              <div style={styles.errorBox}>
                {auth.loginError}
              </div>
            )}
          </div>
        )}
      </div>

      {onKioskMode && (
        <button
          style={styles.kioskBtn}
          onClick={onKioskMode}
        >
          Kiosk Mode
        </button>
      )}

      <p style={styles.versionText}>v1.0 &middot; Offline-Ready</p>
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
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderRadius: 20,
    border: "1px solid var(--glass-border)",
    padding: "40px 36px",
    width: "100%",
    maxWidth: 420,
    boxShadow: "var(--shadow)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    background: "linear-gradient(135deg, #818cf8, #38bdf8)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    margin: 0,
    letterSpacing: "-0.03em",
  },
  subtitle: {
    color: "var(--text-dim)",
    fontSize: 14,
    margin: "6px 0 28px 0",
    fontWeight: 400,
  },
  stepContainer: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  loadingText: {
    color: "var(--text-muted)",
    fontSize: 15,
  },
  staffGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: "100%",
  },
  staffButton: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    minHeight: 52,
    padding: "0 16px",
    backgroundColor: "var(--glass)",
    border: "1px solid var(--glass-border)",
    borderRadius: 12,
    cursor: "pointer",
    transition: "all 0.2s ease",
    boxSizing: "border-box",
  },
  staffAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 700,
    flexShrink: 0,
  },
  staffName: {
    color: "var(--text-primary)",
    fontSize: 14,
    fontWeight: 500,
    flex: 1,
    textAlign: "left",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  staffRole: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    padding: "3px 8px",
    borderRadius: 4,
    backgroundColor: "rgba(99,102,241,0.1)",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  backButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    padding: "8px 16px",
    backgroundColor: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 15,
    cursor: "pointer",
    borderRadius: 8,
    transition: "background-color 0.15s",
    marginBottom: 8,
  },
  selectedStaffBanner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  selectedAvatar: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    backgroundColor: "#6366f1",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    fontWeight: 700,
  },
  selectedName: {
    color: "var(--text-primary)",
    fontSize: 20,
    fontWeight: 600,
  },
  pinPrompt: {
    color: "var(--text-muted)",
    fontSize: 14,
    marginBottom: 16,
  },
  errorBox: {
    marginTop: 16,
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
  versionText: {
    color: "var(--border-light)",
    fontSize: 13,
    marginTop: 24,
  },
  kioskBtn: {
    marginTop: 16,
    width: "100%",
    maxWidth: 360,
    minHeight: 48,
    padding: "12px 24px",
    backgroundColor: "rgba(16,185,129,0.1)",
    border: "1px solid rgba(16,185,129,0.3)",
    borderRadius: 12,
    color: "#10b981",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    letterSpacing: 0.3,
  },
};
