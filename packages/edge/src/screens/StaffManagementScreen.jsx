import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { getStaffList, createStaff, updateStaff, deactivateStaff, reactivateStaff } from "../db/adminOps.js";
import { isValidPhone, isValidPIN } from "@swiftserve/shared";

const ROLES = ["counter", "kitchen", "captain"];
const ROLE_COLORS = {
  owner: { bg: "rgba(165,180,252,0.2)", color: "#a5b4fc" },
  counter: { bg: "rgba(56,189,248,0.2)", color: "#38bdf8" },
  kitchen: { bg: "rgba(250,204,21,0.2)", color: "#facc15" },
  captain: { bg: "rgba(74,222,128,0.2)", color: "#4ade80" },
};

export default function StaffManagementScreen({ onBack }) {
  const { staff: currentStaff } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [mode, setMode] = useState("list"); // list | form
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", role: "counter", pin: "", confirmPin: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadStaff = async () => {
    const list = await getStaffList();
    setStaffList(list);
  };

  useEffect(() => { loadStaff(); }, []);

  const openForm = (staff) => {
    if (staff) {
      setEditingId(staff.id);
      setForm({ name: staff.name, phone: staff.phone || "", role: staff.role, pin: "", confirmPin: "" });
    } else {
      setEditingId(null);
      setForm({ name: "", phone: "", role: "counter", pin: "", confirmPin: "" });
    }
    setError("");
    setMode("form");
  };

  const handleSave = async () => {
    setError("");
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (form.phone && !isValidPhone(form.phone)) { setError("Invalid phone number (10 digits)"); return; }

    if (!editingId) {
      if (!form.pin) { setError("PIN is required for new staff"); return; }
      if (!isValidPIN(form.pin)) { setError("PIN must be 4-6 digits"); return; }
      if (form.pin !== form.confirmPin) { setError("PINs do not match"); return; }
    } else if (form.pin) {
      if (!isValidPIN(form.pin)) { setError("PIN must be 4-6 digits"); return; }
      if (form.pin !== form.confirmPin) { setError("PINs do not match"); return; }
    }

    setSaving(true);
    try {
      if (editingId) {
        const changes = { name: form.name, phone: form.phone, role: form.role };
        if (form.pin) changes.pin = form.pin;
        await updateStaff(editingId, changes, currentStaff.id);
      } else {
        await createStaff({ name: form.name, phone: form.phone, role: form.role, pin: form.pin }, currentStaff.id);
      }
      await loadStaff();
      setMode("list");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (s) => {
    try {
      if (s.is_active === 1) {
        await deactivateStaff(s.id, currentStaff.id);
      } else {
        await reactivateStaff(s.id, currentStaff.id);
      }
      await loadStaff();
    } catch (err) {
      setError(err.message);
    }
  };

  if (mode === "form") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>{editingId ? "Edit Staff" : "Add Staff"}</h1>

          <label style={styles.label}>Name</label>
          <input style={styles.input} value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />

          <label style={styles.label}>Phone</label>
          <input style={styles.input} value={form.phone} inputMode="numeric"
            onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
            placeholder="10-digit mobile" />

          <label style={styles.label}>Role</label>
          <div style={styles.roleRow}>
            {ROLES.map((r) => {
              const rc = ROLE_COLORS[r];
              const active = form.role === r;
              return (
                <button key={r} style={{
                  ...styles.roleBtn,
                  ...(active ? { backgroundColor: rc.bg, borderColor: rc.color, color: rc.color } : {}),
                }} onClick={() => setForm({ ...form, role: r })}>
                  {r}
                </button>
              );
            })}
          </div>

          <label style={styles.label}>{editingId ? "New PIN (leave blank to keep)" : "PIN"}</label>
          <input style={styles.input} type="password" inputMode="numeric" value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            placeholder="4-6 digits" />

          <label style={styles.label}>Confirm PIN</label>
          <input style={styles.input} type="password" inputMode="numeric" value={form.confirmPin}
            onChange={(e) => setForm({ ...form, confirmPin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            placeholder="Re-enter PIN" />

          {error && <div style={styles.errorBox}>{error}</div>}

          <button style={{ ...styles.saveBtn, ...(saving ? styles.disabled : {}) }}
            onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Staff"}
          </button>

          <button style={styles.backBtn} onClick={() => setMode("list")}>&#8592; Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Staff Management</h1>

        <button style={styles.addBtn} onClick={() => openForm(null)}>+ Add Staff</button>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.staffList}>
          {staffList.map((s) => {
            const rc = ROLE_COLORS[s.role] || ROLE_COLORS.counter;
            return (
              <div key={s.id} style={{ ...styles.staffRow, ...(s.is_active !== 1 ? { opacity: 0.5 } : {}) }}>
                <div style={styles.staffInfo}>
                  <span style={styles.staffName}>{s.name}</span>
                  <span style={{ ...styles.roleBadge, backgroundColor: rc.bg, color: rc.color }}>{s.role}</span>
                </div>
                <div style={styles.staffMeta}>
                  <span style={styles.phone}>{s.phone ? `***${s.phone.slice(-4)}` : "No phone"}</span>
                  <span style={{ color: s.is_active === 1 ? "#4ade80" : "#f87171", fontSize: 12 }}>
                    {s.is_active === 1 ? "Active" : "Inactive"}
                  </span>
                </div>
                {s.role !== "owner" && (
                  <div style={styles.actions}>
                    <button style={styles.editBtn} onClick={() => openForm(s)}>Edit</button>
                    <button style={s.is_active === 1 ? styles.deactivateBtn : styles.activateBtn}
                      onClick={() => handleToggleActive(s)}>
                      {s.is_active === 1 ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button style={styles.backBtn} onClick={onBack}>&#8592; Back</button>
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
  card: {
    backgroundColor: "var(--bg-secondary)", borderRadius: 16, padding: 28, width: "100%",
    maxWidth: 520, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex",
    flexDirection: "column",
  },
  title: { color: "var(--text-primary)", fontSize: 22, fontWeight: 700, margin: "0 0 16px 0", textAlign: "center" },
  addBtn: {
    width: "100%", minHeight: 44, padding: "10px 20px", backgroundColor: "#3b82f6",
    border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700,
    cursor: "pointer", touchAction: "manipulation", marginBottom: 16,
  },
  staffList: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto" },
  staffRow: {
    backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10,
    padding: 14, display: "flex", flexDirection: "column", gap: 8,
  },
  staffInfo: { display: "flex", alignItems: "center", gap: 10 },
  staffName: { fontSize: 15, fontWeight: 600, flex: 1 },
  roleBadge: {
    fontSize: 11, fontWeight: 700, textTransform: "uppercase", padding: "2px 10px",
    borderRadius: 4,
  },
  staffMeta: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  phone: { fontSize: 13, color: "var(--text-muted)", fontFamily: "monospace" },
  actions: { display: "flex", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 8 },
  editBtn: {
    flex: 1, minHeight: 34, padding: "4px 12px", backgroundColor: "transparent",
    border: "1px solid var(--border-light)", borderRadius: 8, color: "var(--text-muted)", fontSize: 13,
    fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  deactivateBtn: {
    flex: 1, minHeight: 34, padding: "4px 12px", backgroundColor: "transparent",
    border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, color: "#f87171",
    fontSize: 13, fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  activateBtn: {
    flex: 1, minHeight: 34, padding: "4px 12px", backgroundColor: "transparent",
    border: "1px solid rgba(74,222,128,0.4)", borderRadius: 8, color: "#4ade80",
    fontSize: 13, fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  label: { fontSize: 13, color: "var(--text-muted)", fontWeight: 600, margin: "12px 0 4px 0", textTransform: "uppercase" },
  input: {
    width: "100%", padding: "12px 14px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text-primary)", fontSize: 14, outline: "none", boxSizing: "border-box",
  },
  roleRow: { display: "flex", gap: 8 },
  roleBtn: {
    flex: 1, minHeight: 40, padding: "8px 12px", backgroundColor: "transparent",
    border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)", fontSize: 13,
    fontWeight: 600, cursor: "pointer", touchAction: "manipulation", textTransform: "capitalize",
  },
  errorBox: {
    marginTop: 8, padding: "10px 14px", backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444", borderRadius: 8, color: "#fca5a5", fontSize: 14,
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
