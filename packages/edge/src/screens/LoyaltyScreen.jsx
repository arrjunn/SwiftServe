import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { formatINR } from "@swiftserve/shared";
import { useAuth } from "../contexts/AuthContext.jsx";

/** Mask phone: show last 4 digits only */
function maskPhone(phone) {
  if (!phone) return "-";
  if (phone.length <= 4) return phone;
  return "****" + phone.slice(-4);
}

// ─── Constants ───────────────────────────────────────────────
const LOYALTY_RULES = {
  earnRate: 1,       // points per Rs 10 spent
  earnPer: 10,       // Rs spent to earn 1 point
  redeemThreshold: 100, // min points to redeem
  redeemValue: 50,   // Rs off when redeeming 100 points
};

const TYPE_LABELS = { earn: "Earned", redeem: "Redeemed", adjust: "Adjusted" };
const TYPE_COLORS = { earn: "#22c55e", redeem: "#f59e0b", adjust: "#3b82f6" };

// ─── Helpers ─────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ─── Styles ──────────────────────────────────────────────────
const S = {
  root: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    overflowY: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 20,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0, flex: 1 },
  body: { padding: "16px 20px", maxWidth: 900, margin: "0 auto" },

  // ── Stats row ──
  statsRow: {
    display: "flex",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  statCard: {
    flex: 1,
    minWidth: 140,
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "14px 16px",
    textAlign: "center",
  },
  statValue: { fontSize: 24, fontWeight: 700, color: "var(--text-primary)" },
  statLabel: { fontSize: 12, color: "var(--text-muted)", marginTop: 4 },

  // ── Rules banner ──
  rulesBanner: {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "14px 18px",
    marginBottom: 20,
    fontSize: 13,
    color: "var(--text-muted)",
    lineHeight: 1.6,
  },
  rulesTitle: { fontWeight: 700, color: "var(--text-primary)", fontSize: 14, marginBottom: 4 },

  // ── Search ──
  searchRow: {
    display: "flex",
    gap: 10,
    marginBottom: 20,
    flexWrap: "wrap",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    minWidth: 200,
    minHeight: 44,
    padding: "0 14px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  },
  searchBtn: {
    minWidth: 44,
    minHeight: 44,
    padding: "8px 20px",
    background: "#2563eb",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  // ── Customer list ──
  customerList: { marginBottom: 20 },
  customerRow: (selected) => ({
    background: selected ? "#2563eb22" : "var(--bg-secondary)",
    border: "1px solid " + (selected ? "#2563eb" : "var(--border)"),
    borderRadius: 10,
    padding: "12px 16px",
    marginBottom: 8,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
    gap: 12,
  }),
  customerName: { fontWeight: 600, fontSize: 15, color: "var(--text-primary)" },
  customerPhone: { fontSize: 13, color: "var(--text-muted)", marginTop: 2 },
  customerPoints: { fontWeight: 700, fontSize: 16, color: "#22c55e", whiteSpace: "nowrap" },

  // ── Detail card ──
  detailCard: {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
  },
  detailHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  detailName: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)" },
  detailPhone: { fontSize: 14, color: "var(--text-muted)", marginTop: 2 },
  pointsBig: {
    fontSize: 32,
    fontWeight: 700,
    color: "#22c55e",
    textAlign: "right",
  },
  pointsLabel: { fontSize: 12, color: "var(--text-muted)", textAlign: "right" },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
    marginTop: 12,
  },
  detailStat: {
    background: "var(--bg-primary)",
    borderRadius: 8,
    padding: "10px 14px",
  },
  detailStatVal: { fontWeight: 700, fontSize: 16, color: "var(--text-primary)" },
  detailStatLbl: { fontSize: 11, color: "var(--text-muted)", marginTop: 2 },

  // ── Adjust section ──
  adjustSection: {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
  },
  adjustTitle: { fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 },
  adjustRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "flex-end",
  },
  formGroup: { flex: 1, minWidth: 120 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 },
  input: {
    width: "100%",
    minHeight: 44,
    padding: "0 12px",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    minHeight: 44,
    padding: "0 12px",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  adjustBtn: (variant) => ({
    minWidth: 44,
    minHeight: 44,
    padding: "8px 20px",
    background: variant === "add" ? "#22c55e" : "#ef4444",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap",
  }),

  // ── Transaction history ──
  historySection: {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
  },
  historyTitle: { fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 },
  txRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid var(--border)",
    gap: 10,
  },
  txBadge: (type) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    background: (TYPE_COLORS[type] || "#666") + "22",
    color: TYPE_COLORS[type] || "#666",
    marginRight: 8,
    textTransform: "uppercase",
  }),
  txDesc: { fontSize: 13, color: "var(--text-primary)", flex: 1 },
  txDate: { fontSize: 11, color: "var(--text-dim)", marginTop: 2 },
  txPoints: (type) => ({
    fontWeight: 700,
    fontSize: 15,
    color: type === "earn" ? "#22c55e" : type === "redeem" ? "#f59e0b" : "#3b82f6",
    whiteSpace: "nowrap",
  }),

  // ── Empty / messages ──
  empty: { textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 14 },
  error: {
    background: "#dc262622",
    border: "1px solid #dc2626",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 12,
    color: "#fca5a5",
    fontSize: 13,
  },
  success: {
    background: "#22c55e22",
    border: "1px solid #22c55e",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 12,
    color: "#86efac",
    fontSize: 13,
  },
};

// ─── Component ───────────────────────────────────────────────
const MAX_MANUAL_POINTS = 500; // Max points per manual adjustment

export default function LoyaltyScreen({ onBack }) {
  const { staff } = useAuth();
  const staffId = staff?.id || "unknown";
  // Stats
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalActivePoints, setTotalActivePoints] = useState(0);
  const [redeemedToday, setRedeemedToday] = useState(0);

  // Search / selection
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Transaction history for selected customer
  const [transactions, setTransactions] = useState([]);

  // Adjust form
  const [adjustType, setAdjustType] = useState("add");
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  // Messages
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ── Load stats ──
  const loadStats = useCallback(async () => {
    try {
      const customers = await db.customers
        .where("outlet_id").equals(OUTLET_ID)
        .filter((c) => !c.deleted_at)
        .toArray();

      setTotalCustomers(customers.length);
      setTotalActivePoints(
        customers.reduce((sum, c) => sum + (c.loyalty_points || 0), 0)
      );

      const todayStr = todayStart();
      const todayTxns = await db.loyalty_transactions
        .where("outlet_id").equals(OUTLET_ID)
        .filter((t) => t.type === "redeem" && t.created_at >= todayStr)
        .toArray();

      setRedeemedToday(
        todayTxns.reduce((sum, t) => sum + Math.abs(t.points || 0), 0)
      );
    } catch (err) {
      console.error("Failed to load loyalty stats", err);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ── Search customers ──
  const handleSearch = useCallback(async () => {
    setError("");
    setSuccess("");
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    try {
      const all = await db.customers
        .where("outlet_id").equals(OUTLET_ID)
        .filter((c) => !c.deleted_at)
        .toArray();

      const isPhone = /^\d+$/.test(q);
      const matched = all.filter((c) => {
        if (isPhone) {
          return (c.phone || "").includes(q);
        }
        return (c.name || "").toLowerCase().includes(q);
      });

      matched.sort((a, b) => (b.loyalty_points || 0) - (a.loyalty_points || 0));
      setSearchResults(matched.slice(0, 50));
      setHasSearched(true);
    } catch (err) {
      console.error("Search failed", err);
      setError("Search failed. Please try again.");
    }
  }, [searchQuery]);

  // ── Select customer ──
  const selectCustomer = useCallback(async (customer) => {
    setSelectedCustomer(customer);
    setError("");
    setSuccess("");
    setAdjustPoints("");
    setAdjustReason("");

    try {
      const txns = await db.loyalty_transactions
        .where("customer_id").equals(customer.id)
        .filter((t) => t.outlet_id === OUTLET_ID)
        .toArray();

      txns.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      setTransactions(txns);
    } catch (err) {
      console.error("Failed to load transactions", err);
      setTransactions([]);
    }
  }, []);

  // ── Manual points adjustment ──
  const handleAdjust = useCallback(async () => {
    setError("");
    setSuccess("");

    if (!selectedCustomer) return;

    const pts = parseInt(adjustPoints, 10);
    if (!pts || pts <= 0) {
      setError("Enter a valid number of points greater than 0.");
      return;
    }
    if (pts > MAX_MANUAL_POINTS) {
      setError(`Maximum ${MAX_MANUAL_POINTS} points per adjustment.`);
      return;
    }
    if (!adjustReason.trim()) {
      setError("Please provide a reason for the adjustment.");
      return;
    }

    const delta = adjustType === "add" ? pts : -pts;
    const currentPoints = selectedCustomer.loyalty_points || 0;

    if (adjustType === "deduct" && pts > currentPoints) {
      setError(`Cannot deduct ${pts} points. Customer only has ${currentPoints} points.`);
      return;
    }

    const newBalance = Math.max(0, currentPoints + delta);
    const now = new Date().toISOString();
    const txnId = crypto.randomUUID();

    try {
      await db.transaction("rw", ["customers", "loyalty_transactions"], async () => {
        await db.customers.update(selectedCustomer.id, {
          loyalty_points: newBalance,
          updated_at: now,
        });

        await db.loyalty_transactions.add({
          id: txnId,
          outlet_id: OUTLET_ID,
          customer_id: selectedCustomer.id,
          order_id: null,
          type: "adjust",
          points: delta,
          balance_after: newBalance,
          description: (adjustType === "add" ? "Manual add" : "Manual deduct") + ": " + adjustReason.trim(),
          created_at: now,
          updated_at: now,
          synced_at: null,
          deleted_at: null,
        });
      });

      // Refresh customer
      const updated = await db.customers.get(selectedCustomer.id);
      setSelectedCustomer(updated);
      setAdjustPoints("");
      setAdjustReason("");
      setSuccess(`Successfully ${adjustType === "add" ? "added" : "deducted"} ${pts} points. New balance: ${newBalance}`);

      // Refresh transactions
      const txns = await db.loyalty_transactions
        .where("customer_id").equals(selectedCustomer.id)
        .filter((t) => t.outlet_id === OUTLET_ID)
        .toArray();
      txns.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      setTransactions(txns);

      // Audit log
      await db.audit_log.add({
        id: crypto.randomUUID(),
        outlet_id: OUTLET_ID,
        staff_id: staffId,
        action: "loyalty_adjust",
        entity_type: "customer",
        entity_id: selectedCustomer.id,
        old_value: JSON.stringify({ loyalty_points: selectedCustomer.loyalty_points || 0 }),
        new_value: JSON.stringify({ loyalty_points: newBalance, delta, reason: adjustReason.trim() }),
        created_at: now,
        synced_at: null,
      });

      // Refresh stats
      loadStats().catch(() => {});
    } catch (err) {
      console.error("Adjustment failed", err);
      setError("Failed to adjust points. Please try again.");
    }
  }, [selectedCustomer, adjustType, adjustPoints, adjustReason, loadStats]);

  // ── Clear selection ──
  const clearSelection = useCallback(() => {
    setSelectedCustomer(null);
    setTransactions([]);
    setError("");
    setSuccess("");
    setAdjustPoints("");
    setAdjustReason("");
  }, []);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack} aria-label="Go back">
          &#8592;
        </button>
        <h1 style={S.title}>Customer Loyalty</h1>
      </div>

      <div style={S.body}>
        {/* Stats row */}
        <div style={S.statsRow}>
          <div style={S.statCard}>
            <div style={S.statValue}>{totalCustomers}</div>
            <div style={S.statLabel}>Total Customers</div>
          </div>
          <div style={S.statCard}>
            <div style={S.statValue}>{totalActivePoints.toLocaleString("en-IN")}</div>
            <div style={S.statLabel}>Total Active Points</div>
          </div>
          <div style={S.statCard}>
            <div style={S.statValue}>{redeemedToday.toLocaleString("en-IN")}</div>
            <div style={S.statLabel}>Points Redeemed Today</div>
          </div>
        </div>

        {/* Loyalty rules */}
        <div style={S.rulesBanner}>
          <div style={S.rulesTitle}>Loyalty Rules</div>
          <div>Earn {LOYALTY_RULES.earnRate} point per Rs {LOYALTY_RULES.earnPer} spent.</div>
          <div>Redeem {LOYALTY_RULES.redeemThreshold} points = Rs {LOYALTY_RULES.redeemValue} off on next order.</div>
        </div>

        {/* Search */}
        <div style={S.searchRow}>
          <input
            style={S.searchInput}
            type="text"
            placeholder="Search by phone number or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button style={S.searchBtn} onClick={handleSearch}>
            Search
          </button>
          {selectedCustomer && (
            <button
              style={{ ...S.searchBtn, background: "#64748b" }}
              onClick={clearSelection}
            >
              Clear
            </button>
          )}
        </div>

        {/* Messages */}
        {error && <div style={S.error}>{error}</div>}
        {success && <div style={S.success}>{success}</div>}

        {/* Customer detail view */}
        {selectedCustomer ? (
          <>
            {/* Detail card */}
            <div style={S.detailCard}>
              <div style={S.detailHeader}>
                <div>
                  <div style={S.detailName}>{selectedCustomer.name || "Unnamed"}</div>
                  <div style={S.detailPhone}>{maskPhone(selectedCustomer.phone)}</div>
                </div>
                <div>
                  <div style={S.pointsBig}>{(selectedCustomer.loyalty_points || 0).toLocaleString("en-IN")}</div>
                  <div style={S.pointsLabel}>Loyalty Points</div>
                </div>
              </div>
              <div style={S.detailGrid}>
                <div style={S.detailStat}>
                  <div style={S.detailStatVal}>{selectedCustomer.total_orders || 0}</div>
                  <div style={S.detailStatLbl}>Total Orders</div>
                </div>
                <div style={S.detailStat}>
                  <div style={S.detailStatVal}>{formatINR(selectedCustomer.total_spent || 0)}</div>
                  <div style={S.detailStatLbl}>Total Spent</div>
                </div>
                <div style={S.detailStat}>
                  <div style={S.detailStatVal}>{formatDate(selectedCustomer.created_at)}</div>
                  <div style={S.detailStatLbl}>Member Since</div>
                </div>
              </div>
            </div>

            {/* Manual adjustment */}
            <div style={S.adjustSection}>
              <div style={S.adjustTitle}>Manual Points Adjustment</div>
              <div style={S.adjustRow}>
                <div style={{ ...S.formGroup, minWidth: 100, flex: "0 0 auto" }}>
                  <label style={S.label}>Action</label>
                  <select
                    style={S.select}
                    value={adjustType}
                    onChange={(e) => setAdjustType(e.target.value)}
                  >
                    <option value="add">Add Points</option>
                    <option value="deduct">Deduct Points</option>
                  </select>
                </div>
                <div style={{ ...S.formGroup, flex: "0 1 120px" }}>
                  <label style={S.label}>Points</label>
                  <input
                    style={S.input}
                    type="number"
                    min="1"
                    placeholder="0"
                    value={adjustPoints}
                    onChange={(e) => setAdjustPoints(e.target.value)}
                  />
                </div>
                <div style={{ ...S.formGroup, flex: 2 }}>
                  <label style={S.label}>Reason</label>
                  <input
                    style={S.input}
                    type="text"
                    placeholder="Reason for adjustment..."
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdjust()}
                  />
                </div>
                <button
                  style={S.adjustBtn(adjustType)}
                  onClick={handleAdjust}
                >
                  {adjustType === "add" ? "Add" : "Deduct"}
                </button>
              </div>
            </div>

            {/* Transaction history */}
            <div style={S.historySection}>
              <div style={S.historyTitle}>
                Loyalty History ({transactions.length})
              </div>
              {transactions.length === 0 ? (
                <div style={S.empty}>No loyalty transactions found for this customer.</div>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} style={S.txRow}>
                    <div style={{ flex: 1 }}>
                      <div>
                        <span style={S.txBadge(tx.type)}>
                          {TYPE_LABELS[tx.type] || tx.type}
                        </span>
                        <span style={S.txDesc}>{tx.description || "-"}</span>
                      </div>
                      <div style={S.txDate}>{formatDateTime(tx.created_at)}</div>
                    </div>
                    <div style={S.txPoints(tx.type)}>
                      {tx.points > 0 ? "+" : ""}{tx.points}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          /* Search results list */
          <div style={S.customerList}>
            {hasSearched && searchResults.length === 0 && (
              <div style={S.empty}>No customers found matching your search.</div>
            )}
            {!hasSearched && (
              <div style={S.empty}>Search for a customer by phone number or name to view their loyalty details.</div>
            )}
            {searchResults.map((c) => (
              <div
                key={c.id}
                style={S.customerRow(false)}
                onClick={() => selectCustomer(c)}
              >
                <div>
                  <div style={S.customerName}>{c.name || "Unnamed"}</div>
                  <div style={S.customerPhone}>{maskPhone(c.phone)}</div>
                </div>
                <div style={S.customerPoints}>
                  {(c.loyalty_points || 0).toLocaleString("en-IN")} pts
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
