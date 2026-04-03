import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";

const CARDS = [
  { key: "staff", label: "Staff", desc: "Manage team members & PINs", color: "#a5b4fc" },
  { key: "menu", label: "Menu", desc: "Categories, items & pricing", color: "#38bdf8" },
  { key: "combos", label: "Combos", desc: "Meal deals & bundle pricing", color: "#34d399" },
  { key: "settings", label: "Settings", desc: "Outlet, tax & UPI config", color: "#facc15" },
  { key: "reports", label: "Reports", desc: "Sales, shifts & revenue", color: "#4ade80" },
  { key: "tables", label: "Tables", desc: "Floor layout & table status", color: "#fb923c" },
  { key: "inventory", label: "Inventory", desc: "Stock & adjustments", color: "#f472b6" },
  { key: "wastage", label: "Wastage", desc: "Wastage log & reports", color: "#f87171" },
  { key: "customers", label: "Customers", desc: "Customer list & lookup", color: "#c084fc" },
  { key: "loyalty", label: "Loyalty", desc: "Points, rewards & history", color: "#fbbf24" },
  { key: "feedback", label: "Feedback", desc: "Customer ratings & reviews", color: "#60a5fa" },
];

function formatTime(iso) {
  if (!iso) return "--";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function AdminHubScreen({ onNavigate, onBack }) {
  const { staff } = useAuth();
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const allStaff = await db.staff.where("outlet_id").equals(OUTLET_ID).toArray();
        const activeStaff = allStaff.filter(s => s.is_active === 1);

        // Get today's shifts
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const shifts = await db.shifts.where("outlet_id").equals(OUTLET_ID)
          .filter(s => new Date(s.created_at) >= todayStart)
          .toArray();

        // Get recent logins from audit log
        const logins = await db.audit_log.where("outlet_id").equals(OUTLET_ID)
          .filter(a => a.action === "login_success" && new Date(a.created_at) >= todayStart)
          .toArray();

        const staffMap = {};
        for (const s of activeStaff) staffMap[s.id] = s.name;

        const rows = activeStaff.map(s => {
          const staffShifts = shifts.filter(sh => sh.staff_id === s.id).sort((a, b) => new Date(b.opened_at) - new Date(a.opened_at));
          const latestShift = staffShifts[0] || null;
          const lastLogin = logins.filter(l => l.staff_id === s.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
          return {
            id: s.id,
            name: s.name,
            role: s.role,
            isActive: latestShift?.status === "open",
            shiftOpened: latestShift?.opened_at || null,
            shiftClosed: latestShift?.closed_at || null,
            lastLogin: lastLogin?.created_at || null,
          };
        });
        setActivity(rows);
      } catch (_) { /* ignore */ }
    })();
  }, []);

  if (staff?.role !== "owner" && staff?.role !== "admin") {
    return (
      <div style={styles.container}>
        <div style={styles.denied}>Access restricted to owners.</div>
        <button style={styles.backBtn} onClick={onBack}>&#8592; Back</button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Admin Hub</h1>

        <div style={styles.grid}>
          {CARDS.map((c) => (
            <button
              key={c.key}
              style={{ ...styles.hubCard, borderLeft: `4px solid ${c.color}` }}
              onClick={() => onNavigate(c.key)}
            >
              <span style={{ ...styles.cardLabel, color: c.color }}>{c.label}</span>
              <span style={styles.cardDesc}>{c.desc}</span>
            </button>
          ))}
        </div>

        {/* Staff Activity */}
        {activity.length > 0 && (
          <div style={actStyles.section}>
            <h3 style={actStyles.heading}>Staff Activity — Today</h3>
            {activity.map(a => (
              <div key={a.id} style={actStyles.row}>
                <div style={actStyles.left}>
                  <span style={{ ...actStyles.dot, backgroundColor: a.isActive ? "#22c55e" : "var(--text-dim)" }} />
                  <span style={actStyles.name}>{a.name}</span>
                  <span style={{ ...actStyles.role, color: a.isActive ? "#4ade80" : "var(--text-dim)" }}>
                    {a.role}
                  </span>
                </div>
                <div style={actStyles.right}>
                  {a.isActive ? (
                    <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 600 }}>
                      Active since {formatTime(a.shiftOpened)}
                    </span>
                  ) : a.shiftClosed ? (
                    <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
                      Shift {formatTime(a.shiftOpened)} — {formatTime(a.shiftClosed)}
                    </span>
                  ) : a.lastLogin ? (
                    <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
                      Last login {formatTime(a.lastLogin)}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-dim)", fontSize: 12 }}>No activity</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <button style={styles.backBtn} onClick={onBack}>&#8592; Back to Orders</button>
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
  denied: { color: "#f87171", fontSize: 16, textAlign: "center", padding: 32 },
  card: {
    backgroundColor: "var(--bg-secondary)", borderRadius: 16, padding: 32, width: "100%",
    maxWidth: 520, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex",
    flexDirection: "column", alignItems: "center",
  },
  title: { color: "var(--text-primary)", fontSize: 24, fontWeight: 700, margin: "0 0 24px 0" },
  grid: {
    width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
  },
  hubCard: {
    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
    padding: 20, backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)",
    borderRadius: 12, cursor: "pointer", touchAction: "manipulation",
  },
  cardLabel: { fontSize: 16, fontWeight: 700 },
  cardDesc: { fontSize: 12, color: "var(--text-muted)", textAlign: "left" },
  backBtn: {
    marginTop: 20, width: "100%", minHeight: 48, padding: "10px 24px",
    backgroundColor: "transparent", border: "1px solid var(--border)", borderRadius: 10,
    color: "var(--text-muted)", fontSize: 15, fontWeight: 600, cursor: "pointer",
    touchAction: "manipulation",
  },
};

const actStyles = {
  section: {
    width: "100%", marginTop: 24, borderTop: "1px solid var(--border)",
    paddingTop: 20, display: "flex", flexDirection: "column", gap: 8,
  },
  heading: {
    fontSize: 13, fontWeight: 600, color: "var(--text-dim)",
    textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 8px 0",
  },
  row: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 14px", backgroundColor: "var(--glass)",
    border: "1px solid var(--glass-border)", borderRadius: 10, gap: 8,
  },
  left: { display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  right: { flexShrink: 0 },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  name: { fontSize: 14, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  role: { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 },
};
