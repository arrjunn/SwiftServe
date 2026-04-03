const CARDS = [
  { key: "sales", label: "Sales Report", desc: "Revenue by category, item, hour & payment", color: "#38bdf8" },
  { key: "shift", label: "Shift Report", desc: "Staff shift summaries & cash reconciliation", color: "#facc15" },
  { key: "revenue", label: "Revenue Summary", desc: "Revenue vs costs & margin overview", color: "#4ade80" },
  { key: "daily", label: "Daily Summary", desc: "End-of-day overview with top items & trends", color: "#f472b6" },
  { key: "staff-performance", label: "Staff Performance", desc: "Orders/hour, revenue & efficiency per staff", color: "#a5b4fc" },
];

export default function ReportsHubScreen({ onNavigate, onBack }) {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Reports</h1>

        <div style={styles.list}>
          {CARDS.map((c) => (
            <button key={c.key} style={styles.reportCard} onClick={() => onNavigate(c.key)}>
              <span style={{ ...styles.cardLabel, color: c.color }}>{c.label}</span>
              <span style={styles.cardDesc}>{c.desc}</span>
            </button>
          ))}
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
    backgroundColor: "var(--bg-secondary)", borderRadius: 16, padding: 32, width: "100%",
    maxWidth: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex",
    flexDirection: "column", alignItems: "center",
  },
  title: { color: "var(--text-primary)", fontSize: 24, fontWeight: 700, margin: "0 0 24px 0" },
  list: { width: "100%", display: "flex", flexDirection: "column", gap: 10 },
  reportCard: {
    width: "100%", padding: 20, backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)",
    borderRadius: 12, cursor: "pointer", touchAction: "manipulation", display: "flex",
    flexDirection: "column", gap: 4, textAlign: "left",
  },
  cardLabel: { fontSize: 16, fontWeight: 700 },
  cardDesc: { fontSize: 13, color: "var(--text-muted)" },
  backBtn: {
    marginTop: 20, width: "100%", minHeight: 48, padding: "10px 24px",
    backgroundColor: "transparent", border: "1px solid var(--border)", borderRadius: 10,
    color: "var(--text-muted)", fontSize: 15, fontWeight: 600, cursor: "pointer",
    touchAction: "manipulation",
  },
};
