import { useState, useEffect } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { isValidPhone, isValidGSTIN, isValidFSSAI, isValidUPI } from "@swiftserve/shared";
import { updateOutletSettings } from "../db/adminOps.js";
import { exportBackupJSON } from "../utils/backup.js";

const TABS = ["Outlet", "Tax / GST", "UPI"];

export default function SettingsScreen({ onBack }) {
  const { staff } = useAuth();
  const [activeTab, setActiveTab] = useState("Outlet");
  const [outlet, setOutlet] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    db.outlets.get(OUTLET_ID).then((o) => {
      setOutlet(o);
      setForm({ ...o });
    });
  }, []);

  const update = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setError("");

    if (activeTab === "Outlet") {
      if (!form.name?.trim()) { setError("Outlet name is required"); return; }
      if (form.phone && !isValidPhone(form.phone)) { setError("Invalid phone (10 digits)"); return; }
    }
    if (activeTab === "Tax / GST") {
      if (form.gstin && !isValidGSTIN(form.gstin)) { setError("Invalid GSTIN format"); return; }
      if (form.fssai_number && !isValidFSSAI(form.fssai_number)) { setError("FSSAI must be 14 digits"); return; }
    }
    if (activeTab === "UPI") {
      if (form.upi_vpa && !isValidUPI(form.upi_vpa)) { setError("Invalid UPI VPA format"); return; }
    }

    setSaving(true);
    try {
      const changes = {};
      for (const key of Object.keys(form)) {
        if (form[key] !== outlet[key]) changes[key] = form[key];
      }
      if (Object.keys(changes).length > 0) {
        await updateOutletSettings(changes, staff.id);
        const updated = await db.outlets.get(OUTLET_ID);
        setOutlet(updated);
      }
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!outlet) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading settings...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Settings</h1>

        <div style={styles.tabs}>
          {TABS.map((t) => (
            <button key={t}
              style={{ ...styles.tab, ...(activeTab === t ? styles.tabActive : {}) }}
              onClick={() => { setActiveTab(t); setError(""); setSaved(false); }}>
              {t}
            </button>
          ))}
        </div>

        {activeTab === "Outlet" && (
          <div style={styles.fields}>
            <Field label="Outlet Name" value={form.name || ""} onChange={(v) => update("name", v)} />
            <Field label="Address" value={form.address_line1 || ""} onChange={(v) => update("address_line1", v)} />
            <Field label="City" value={form.city || ""} onChange={(v) => update("city", v)} />
            <Field label="State" value={form.state || ""} onChange={(v) => update("state", v)} />
            <Field label="Pincode" value={form.pincode || ""} onChange={(v) => update("pincode", v)} inputMode="numeric" maxLength={6} />
            <Field label="Phone" value={form.phone || ""} onChange={(v) => update("phone", v)} inputMode="numeric" maxLength={10} />
            <Field label="Email" value={form.email || ""} onChange={(v) => update("email", v)} />
          </div>
        )}

        {activeTab === "Tax / GST" && (
          <div style={styles.fields}>
            <Field label="GSTIN" value={form.gstin || ""} onChange={(v) => update("gstin", v.toUpperCase())} maxLength={15} placeholder="e.g. 29ABCDE1234F1Z5" />
            <Field label="FSSAI Number" value={form.fssai_number || ""} onChange={(v) => update("fssai_number", v)} inputMode="numeric" maxLength={14} />
            <Field label="Invoice Prefix" value={form.invoice_prefix || ""} onChange={(v) => update("invoice_prefix", v.toUpperCase())} maxLength={5} placeholder="e.g. SS" />
            <div>
              <label style={styles.label}>Default GST Rate</label>
              <div style={styles.segmented}>
                {[0, 500, 1200, 1800, 2800].map((r) => (
                  <button key={r}
                    style={{ ...styles.segBtn, ...(form.default_tax_rate === r ? styles.segBtnActive : {}) }}
                    onClick={() => update("default_tax_rate", r)}>
                    {r / 100}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "UPI" && (
          <div style={styles.fields}>
            <Field label="UPI VPA" value={form.upi_vpa || ""} onChange={(v) => update("upi_vpa", v)} placeholder="e.g. store@upi" />
            <div style={styles.hint}>This VPA is used to generate the QR code for UPI payments.</div>
          </div>
        )}

        {error && <div style={styles.errorBox}>{error}</div>}
        {saved && <div style={styles.successBox}>Settings saved!</div>}

        <button style={{ ...styles.saveBtn, ...(saving ? styles.disabled : {}) }}
          onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </button>

        <button style={styles.backBtn} onClick={onBack}>&#8592; Back</button>

        {/* Data Backup Section */}
        <BackupSection />
      </div>
    </div>
  );
}

function Field({ label, value, onChange, inputMode, maxLength, placeholder }) {
  return (
    <div>
      <label style={styles.label}>{label}</label>
      <input style={styles.input} value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode} maxLength={maxLength} placeholder={placeholder} />
    </div>
  );
}

function BackupSection() {
  const [backing, setBacking] = useState(false);
  const [backupError, setBackupError] = useState("");
  const [lastBackup, setLastBackup] = useState(() =>
    localStorage.getItem("swiftserve_last_backup") || null
  );

  const handleBackup = async () => {
    setBacking(true);
    setBackupError("");
    try {
      await exportBackupJSON();
      setLastBackup(localStorage.getItem("swiftserve_last_backup"));
    } catch (err) {
      setBackupError(err.message || "Backup failed");
    } finally {
      setBacking(false);
    }
  };

  const formattedDate = lastBackup
    ? new Date(lastBackup).toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
      })
    : null;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.5 }}>
        Data Backup
      </div>
      <div style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
        {formattedDate && (
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
            Last backup: {formattedDate}
          </div>
        )}
        <button
          style={{
            width: "100%", minHeight: 44, padding: "10px 24px",
            backgroundColor: "#3b82f6", border: "none", borderRadius: 10,
            color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
            touchAction: "manipulation", opacity: backing ? 0.5 : 1,
          }}
          onClick={handleBackup}
          disabled={backing}
        >
          {backing ? "Preparing backup..." : "Download Backup"}
        </button>
        {backupError && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#fca5a5", textAlign: "center" }}>
            {backupError}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "var(--bg-primary)", display: "flex",
    alignItems: "flex-start", justifyContent: "center", padding: "24px 16px",
    overflowY: "auto", color: "var(--text-primary)",
  },
  loading: { color: "var(--text-muted)", fontSize: 16 },
  card: {
    backgroundColor: "var(--bg-secondary)", borderRadius: 16, padding: 28, width: "100%",
    maxWidth: 520, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex",
    flexDirection: "column",
  },
  title: { color: "var(--text-primary)", fontSize: 22, fontWeight: 700, margin: "0 0 16px 0", textAlign: "center" },
  tabs: { display: "flex", gap: 4, marginBottom: 16 },
  tab: {
    flex: 1, minHeight: 44, padding: "8px 12px", backgroundColor: "transparent",
    border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)", fontSize: 13,
    fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  tabActive: { borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  fields: { display: "flex", flexDirection: "column", gap: 4 },
  label: { display: "block", fontSize: 12, color: "var(--text-muted)", fontWeight: 600, margin: "10px 0 4px 0", textTransform: "uppercase" },
  input: {
    width: "100%", padding: "10px 12px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text-primary)", fontSize: 14, outline: "none", boxSizing: "border-box",
  },
  segmented: { display: "flex", gap: 4 },
  segBtn: {
    flex: 1, minHeight: 44, padding: "6px 8px", backgroundColor: "transparent",
    border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", fontSize: 13,
    fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  segBtnActive: { borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  hint: { fontSize: 12, color: "var(--text-dim)", marginTop: 4 },
  errorBox: {
    marginTop: 12, padding: "10px 14px", backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444", borderRadius: 8, color: "#fca5a5", fontSize: 14,
    textAlign: "center",
  },
  successBox: {
    marginTop: 12, padding: "10px 14px", backgroundColor: "rgba(34,197,94,0.15)",
    border: "1px solid #22c55e", borderRadius: 8, color: "#4ade80", fontSize: 14,
    textAlign: "center",
  },
  saveBtn: {
    marginTop: 16, width: "100%", minHeight: 48, padding: "12px 24px",
    backgroundColor: "#22c55e", border: "none", borderRadius: 12, color: "#fff",
    fontSize: 16, fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
  },
  disabled: { opacity: 0.5, cursor: "not-allowed" },
  backBtn: {
    marginTop: 12, width: "100%", minHeight: 44, padding: "10px 24px",
    backgroundColor: "transparent", border: "1px solid var(--border)", borderRadius: 10,
    color: "var(--text-muted)", fontSize: 14, fontWeight: 600, cursor: "pointer",
    touchAction: "manipulation",
  },
};
