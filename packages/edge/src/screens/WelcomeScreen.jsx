import { useState } from "react";
import { useSupabaseAuth } from "../contexts/SupabaseAuthContext.jsx";

const MODE_WELCOME = "welcome";
const MODE_SIGN_IN = "signin";
const MODE_SIGN_UP = "signup";

export default function WelcomeScreen() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useSupabaseAuth();

  const [mode, setMode] = useState(MODE_WELCOME);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFullName("");
    setError("");
    setSuccessMsg("");
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || "Google sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (err) {
      setError(err.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const data = await signUpWithEmail(email.trim(), password, fullName.trim());
      if (data?.user && !data.session) {
        setSuccessMsg("Account created! Check your email to confirm, then sign in.");
        setMode(MODE_SIGN_IN);
        setPassword("");
        setConfirmPassword("");
        setFullName("");
      }
    } catch (err) {
      if (err.message?.includes("already registered")) {
        setError("This email is already registered. Try signing in instead.");
      } else {
        setError(err.message || "Sign-up failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Brand Header */}
        <div style={styles.brandSection}>
          <h1 style={styles.brand}>SwiftServe</h1>
          <p style={styles.tagline}>Smart POS for Indian QSR</p>
        </div>

        {/* Welcome mode: show auth options */}
        {mode === MODE_WELCOME && (
          <div style={styles.authOptions}>
            <button
              style={{ ...styles.googleBtn, ...(loading ? styles.disabled : {}) }}
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <span style={styles.googleIcon}>G</span>
              {loading ? "Connecting..." : "Continue with Google"}
            </button>

            <div style={styles.divider}>
              <span style={styles.dividerLine} />
              <span style={styles.dividerText}>or</span>
              <span style={styles.dividerLine} />
            </div>

            <button
              style={styles.emailBtn}
              onClick={() => { resetForm(); setMode(MODE_SIGN_IN); }}
              disabled={loading}
            >
              Continue with Email
            </button>
          </div>
        )}

        {/* Sign In form */}
        {mode === MODE_SIGN_IN && (
          <form style={styles.form} onSubmit={handleEmailSignIn}>
            <h2 style={styles.formTitle}>Sign In</h2>

            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={loading}
            />

            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              disabled={loading}
            />

            <button
              type="submit"
              style={{ ...styles.submitBtn, ...(loading ? styles.disabled : {}) }}
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <p style={styles.switchText}>
              Don't have an account?{" "}
              <button
                type="button"
                style={styles.switchLink}
                onClick={() => { resetForm(); setMode(MODE_SIGN_UP); }}
              >
                Sign Up
              </button>
            </p>

            <button
              type="button"
              style={styles.backLink}
              onClick={() => { resetForm(); setMode(MODE_WELCOME); }}
            >
              &#8592; Back
            </button>
          </form>
        )}

        {/* Sign Up form */}
        {mode === MODE_SIGN_UP && (
          <form style={styles.form} onSubmit={handleEmailSignUp}>
            <h2 style={styles.formTitle}>Create Account</h2>

            <label style={styles.label}>Full Name</label>
            <input
              style={styles.input}
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              autoComplete="name"
              disabled={loading}
            />

            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={loading}
            />

            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              autoComplete="new-password"
              disabled={loading}
            />

            <label style={styles.label}>Confirm Password</label>
            <input
              style={styles.input}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              autoComplete="new-password"
              disabled={loading}
            />

            <button
              type="submit"
              style={{ ...styles.submitBtn, ...(loading ? styles.disabled : {}) }}
              disabled={loading}
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>

            <p style={styles.switchText}>
              Already have an account?{" "}
              <button
                type="button"
                style={styles.switchLink}
                onClick={() => { resetForm(); setMode(MODE_SIGN_IN); }}
              >
                Sign In
              </button>
            </p>

            <button
              type="button"
              style={styles.backLink}
              onClick={() => { resetForm(); setMode(MODE_WELCOME); }}
            >
              &#8592; Back
            </button>
          </form>
        )}

        {/* Error display */}
        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Success message */}
        {successMsg && <div style={styles.successBox}>{successMsg}</div>}

        {/* Footer */}
        <div style={styles.footer}>
          SwiftServe v1.0 — Built for Indian Restaurants
        </div>
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
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "24px 16px",
    overflowY: "auto",
    color: "var(--text-primary)",
  },
  card: {
    backgroundColor: "var(--bg-secondary)",
    borderRadius: 16,
    padding: 32,
    width: "100%",
    maxWidth: 420,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  brandSection: {
    textAlign: "center",
    marginBottom: 32,
  },
  brand: {
    fontSize: 32,
    fontWeight: 800,
    background: "linear-gradient(135deg, #6366f1, #38bdf8)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    margin: 0,
    letterSpacing: "-0.5px",
  },
  tagline: {
    fontSize: 14,
    color: "var(--text-muted)",
    margin: "8px 0 0 0",
    fontWeight: 500,
    letterSpacing: 0.3,
  },
  authOptions: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  googleBtn: {
    width: "100%",
    minHeight: 48,
    padding: "12px 24px",
    backgroundColor: "#ffffff",
    border: "none",
    borderRadius: 12,
    color: "#1f2937",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: 700,
    background: "linear-gradient(135deg, #4285F4, #EA4335, #FBBC05, #34A853)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: "4px 0",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "var(--border)",
  },
  dividerText: {
    fontSize: 12,
    color: "var(--text-dim)",
    fontWeight: 500,
    textTransform: "uppercase",
  },
  emailBtn: {
    width: "100%",
    minHeight: 48,
    padding: "12px 24px",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 12,
    color: "var(--text-primary)",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  form: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: "0 0 16px 0",
    textAlign: "center",
  },
  label: {
    display: "block",
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 600,
    margin: "10px 0 4px 0",
    textTransform: "uppercase",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    minHeight: 44,
  },
  submitBtn: {
    marginTop: 16,
    width: "100%",
    minHeight: 48,
    padding: "12px 24px",
    backgroundColor: "#3b82f6",
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  disabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  switchText: {
    marginTop: 16,
    fontSize: 14,
    color: "var(--text-muted)",
    textAlign: "center",
  },
  switchLink: {
    background: "none",
    border: "none",
    color: "#60a5fa",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    padding: 0,
    textDecoration: "underline",
  },
  backLink: {
    marginTop: 8,
    background: "none",
    border: "none",
    color: "var(--text-dim)",
    fontSize: 13,
    cursor: "pointer",
    padding: 4,
    textAlign: "center",
  },
  errorBox: {
    marginTop: 12,
    padding: "10px 14px",
    backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444",
    borderRadius: 8,
    color: "#fca5a5",
    fontSize: 14,
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box",
  },
  successBox: {
    marginTop: 12,
    padding: "10px 14px",
    backgroundColor: "rgba(34,197,94,0.15)",
    border: "1px solid #22c55e",
    borderRadius: 8,
    color: "#4ade80",
    fontSize: 14,
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box",
  },
  footer: {
    marginTop: 32,
    fontSize: 12,
    color: "var(--border-light)",
    textAlign: "center",
    fontWeight: 500,
  },
};
