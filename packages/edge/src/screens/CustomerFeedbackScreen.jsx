import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { formatINR } from "@swiftserve/shared";

// ── Date helpers ────────────────────────────────────────────────────────────

const DATE_RANGES = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
];

function getDateRange(key) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (key === "today") {
    return { from: startOfDay.toISOString(), to: now.toISOString() };
  }
  if (key === "week") {
    const day = startOfDay.getDay(); // 0=Sun
    const monday = new Date(startOfDay);
    monday.setDate(monday.getDate() - ((day + 6) % 7));
    return { from: monday.toISOString(), to: now.toISOString() };
  }
  // month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: startOfMonth.toISOString(), to: now.toISOString() };
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  }) + " " + d.toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function renderStars(rating) {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  let out = "";
  for (let i = 1; i <= 5; i++) {
    out += i <= filled ? "\u2605" : "\u2606";
  }
  return out;
}

// ── Styles ──────────────────────────────────────────────────────────────────

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
  toolbar: {
    display: "flex",
    gap: 8,
    padding: "12px 20px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  filterBtn: (active) => ({
    minHeight: 44,
    padding: "8px 16px",
    background: active ? "#2563eb" : "var(--bg-secondary)",
    border: "1px solid " + (active ? "#2563eb" : "var(--border)"),
    borderRadius: 8,
    color: active ? "#fff" : "var(--text-muted)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  }),
  summaryBar: {
    display: "flex",
    gap: 16,
    padding: "12px 20px",
    flexWrap: "wrap",
  },
  summaryCard: {
    flex: 1,
    minWidth: 140,
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 16,
    textAlign: "center",
  },
  summaryLabel: { fontSize: 12, color: "var(--text-muted)", marginBottom: 4 },
  summaryValue: { fontSize: 22, fontWeight: 700, color: "var(--text-primary)" },
  distSection: {
    padding: "0 20px 12px",
  },
  distLabel: { fontSize: 12, color: "var(--text-muted)", marginBottom: 8 },
  distRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  distStarLabel: {
    fontSize: 13,
    color: "var(--text-muted)",
    width: 44,
    textAlign: "right",
    flexShrink: 0,
  },
  distBarBg: {
    flex: 1,
    height: 14,
    background: "var(--bg-secondary)",
    borderRadius: 7,
    overflow: "hidden",
  },
  distBarFill: (pct, color) => ({
    height: "100%",
    width: pct + "%",
    background: color,
    borderRadius: 7,
    transition: "width 0.3s ease",
  }),
  distCount: {
    fontSize: 12,
    color: "var(--text-dim)",
    width: 30,
    textAlign: "right",
    flexShrink: 0,
  },
  listSection: {
    padding: "0 20px 20px",
  },
  card: {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardStars: { fontSize: 18, color: "#f59e0b", letterSpacing: 2 },
  cardDate: { fontSize: 12, color: "var(--text-dim)" },
  cardCustomer: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 },
  cardOrder: { fontSize: 12, color: "var(--text-muted)", marginBottom: 8 },
  cardComment: { fontSize: 14, color: "var(--text-primary)", lineHeight: 1.4 },
  empty: {
    textAlign: "center",
    padding: 40,
    color: "var(--text-dim)",
    fontSize: 15,
  },
  // Modal styles
  overlay: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 20,
  },
  modal: {
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 420,
    maxHeight: "90vh",
    overflowY: "auto",
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 20, margin: 0 },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, display: "block" },
  fieldGroup: { marginBottom: 16 },
  select: {
    width: "100%",
    minHeight: 44,
    padding: "8px 12px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
  },
  input: {
    width: "100%",
    minHeight: 44,
    padding: "8px 12px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: 80,
    padding: "10px 12px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    resize: "vertical",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  ratingSelector: {
    display: "flex",
    gap: 8,
  },
  ratingStar: (active) => ({
    minWidth: 44,
    minHeight: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    color: active ? "#f59e0b" : "var(--text-dim)",
    background: active ? "#f59e0b22" : "var(--bg-secondary)",
    border: "1px solid " + (active ? "#f59e0b" : "var(--border)"),
    borderRadius: 8,
    cursor: "pointer",
  }),
  modalActions: {
    display: "flex",
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  submitBtn: (disabled) => ({
    flex: 1,
    minHeight: 44,
    background: disabled ? "#1e3a5f" : "#2563eb",
    border: "none",
    borderRadius: 8,
    color: disabled ? "#6b7280" : "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  }),
  addBtn: {
    minHeight: 44,
    padding: "8px 16px",
    background: "#2563eb",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    marginLeft: "auto",
  },
};

const STAR_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e"];

// ─────────────────────────────────────────────────────────────────────────────

export default function CustomerFeedbackScreen({ onBack }) {
  const [feedbackList, setFeedbackList] = useState([]);
  const [orderMap, setOrderMap] = useState({});
  const [customerMap, setCustomerMap] = useState({});
  const [range, setRange] = useState("today");
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [todayOrders, setTodayOrders] = useState([]);
  const [formOrderId, setFormOrderId] = useState("");
  const [formRating, setFormRating] = useState(0);
  const [formComment, setFormComment] = useState("");
  const [formCustomerName, setFormCustomerName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { from } = getDateRange(range);

      // Feedback within range
      const allFeedback = await db.customer_feedback
        .where("outlet_id")
        .equals(OUTLET_ID)
        .toArray();

      const filtered = allFeedback
        .filter((f) => f.created_at >= from)
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

      setFeedbackList(filtered);

      // Build order lookup
      const orderIds = [...new Set(filtered.map((f) => f.order_id).filter(Boolean))];
      if (orderIds.length > 0) {
        const orders = await db.orders.where("id").anyOf(orderIds).toArray();
        const oMap = {};
        for (const o of orders) oMap[o.id] = o;
        setOrderMap(oMap);
      } else {
        setOrderMap({});
      }

      // Build customer lookup
      const customerIds = [...new Set(filtered.map((f) => f.customer_id).filter(Boolean))];
      if (customerIds.length > 0) {
        const customers = await db.customers.where("id").anyOf(customerIds).toArray();
        const cMap = {};
        for (const c of customers) cMap[c.id] = c;
        setCustomerMap(cMap);
      } else {
        setCustomerMap({});
      }

      setLoading(false);
    } catch (err) {
      console.error("CustomerFeedbackScreen loadData error:", err);
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = feedbackList.length;
    if (total === 0) {
      return { avg: 0, total: 0, dist: [0, 0, 0, 0, 0] };
    }
    const sum = feedbackList.reduce((s, f) => s + (f.rating || 0), 0);
    const avg = sum / total;
    const dist = [0, 0, 0, 0, 0];
    for (const f of feedbackList) {
      const r = Math.max(1, Math.min(5, Math.round(f.rating || 0)));
      dist[r - 1]++;
    }
    return { avg, total, dist };
  }, [feedbackList]);

  const maxDist = Math.max(...stats.dist, 1);

  // ── Submit feedback modal ─────────────────────────────────────────────────

  const openModal = useCallback(async () => {
    try {
      // Load today's completed orders for the dropdown
      const { from } = getDateRange("today");
      const allOrders = await db.orders
        .where("outlet_id")
        .equals(OUTLET_ID)
        .toArray();

      const completed = allOrders
        .filter((o) => o.created_at >= from && (o.status === "completed" || o.status === "paid"))
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

      setTodayOrders(completed);
      setFormOrderId("");
      setFormRating(0);
      setFormComment("");
      setFormCustomerName("");
      setShowModal(true);
    } catch (err) {
      console.error("CustomerFeedbackScreen openModal error:", err);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formOrderId || formRating < 1) return;
    setSubmitting(true);

    try {
      // Prevent duplicate feedback per order
      const existing = await db.customer_feedback
        .where("order_id").equals(formOrderId)
        .first();
      if (existing) {
        setSubmitting(false);
        alert("Feedback already submitted for this order.");
        return;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const comment = (formComment.trim() || "").slice(0, 1000) || null; // Max 1000 chars

      await db.customer_feedback.add({
        id,
        outlet_id: OUTLET_ID,
        order_id: formOrderId,
        customer_id: null,
        rating: formRating,
        comment,
        _customer_name: formCustomerName.trim() || null,
        created_at: now,
        updated_at: now,
        synced_at: null,
        deleted_at: null,
      });

      setShowModal(false);
      setSubmitting(false);
      loadData().catch(() => {});
    } catch (err) {
      console.error("CustomerFeedbackScreen handleSubmit error:", err);
      setSubmitting(false);
      alert("Failed to save feedback. Please try again.");
    }
  }, [formOrderId, formRating, formComment, formCustomerName, loadData]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack} aria-label="Go back">
          &#8592;
        </button>
        <h1 style={S.title}>Customer Feedback</h1>
        <button style={S.addBtn} onClick={openModal}>
          Submit Feedback
        </button>
      </div>

      {/* Date filter */}
      <div style={S.toolbar}>
        {DATE_RANGES.map((r) => (
          <button
            key={r.key}
            style={S.filterBtn(range === r.key)}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={S.empty}>Loading...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={S.summaryBar}>
            <div style={S.summaryCard}>
              <div style={S.summaryLabel}>Average Rating</div>
              <div style={S.summaryValue}>
                {stats.total > 0 ? stats.avg.toFixed(1) : "--"}
              </div>
              {stats.total > 0 && (
                <div style={{ color: "#f59e0b", fontSize: 14, marginTop: 4 }}>
                  {renderStars(Math.round(stats.avg))}
                </div>
              )}
            </div>
            <div style={S.summaryCard}>
              <div style={S.summaryLabel}>Total Feedback</div>
              <div style={S.summaryValue}>{stats.total}</div>
            </div>
          </div>

          {/* Rating distribution */}
          {stats.total > 0 && (
            <div style={S.distSection}>
              <div style={S.distLabel}>Rating Distribution</div>
              {[5, 4, 3, 2, 1].map((star) => {
                const count = stats.dist[star - 1];
                const pct = (count / maxDist) * 100;
                return (
                  <div key={star} style={S.distRow}>
                    <span style={S.distStarLabel}>{star} {"\u2605"}</span>
                    <div style={S.distBarBg}>
                      <div style={S.distBarFill(pct, STAR_COLORS[star - 1])} />
                    </div>
                    <span style={S.distCount}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Feedback list */}
          <div style={S.listSection}>
            {feedbackList.length === 0 ? (
              <div style={S.empty}>No feedback found for this period.</div>
            ) : (
              feedbackList.map((f) => {
                const order = orderMap[f.order_id];
                const customer = customerMap[f.customer_id];
                const customerName = f._customer_name || (customer && customer.name) || "Anonymous";
                return (
                  <div key={f.id} style={S.card}>
                    <div style={S.cardTop}>
                      <span style={S.cardStars}>{renderStars(f.rating)}</span>
                      <span style={S.cardDate}>{formatDateTime(f.created_at)}</span>
                    </div>
                    <div style={S.cardCustomer}>{customerName}</div>
                    {order && (
                      <div style={S.cardOrder}>
                        Order #{order.order_number} — {formatINR(order.grand_total)}
                      </div>
                    )}
                    {f.comment && <div style={S.cardComment}>{f.comment}</div>}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Submit Feedback Modal */}
      {showModal && (
        <div style={S.overlay} onClick={() => setShowModal(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={S.modalTitle}>Submit Feedback</h2>

            {/* Order select */}
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>Order</label>
              <select
                style={S.select}
                value={formOrderId}
                onChange={(e) => setFormOrderId(e.target.value)}
              >
                <option value="">Select an order...</option>
                {todayOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    #{o.order_number} — {formatINR(o.grand_total)}
                  </option>
                ))}
              </select>
            </div>

            {/* Rating */}
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>Rating</label>
              <div style={S.ratingSelector}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    style={S.ratingStar(star <= formRating)}
                    onClick={() => setFormRating(star)}
                    type="button"
                    aria-label={`${star} star`}
                  >
                    {star <= formRating ? "\u2605" : "\u2606"}
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>Comment</label>
              <textarea
                style={S.textarea}
                placeholder="Customer comment..."
                value={formComment}
                onChange={(e) => setFormComment(e.target.value)}
              />
            </div>

            {/* Customer name */}
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>Customer Name (optional)</label>
              <input
                style={S.input}
                type="text"
                placeholder="Anonymous"
                value={formCustomerName}
                onChange={(e) => setFormCustomerName(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div style={S.modalActions}>
              <button
                style={S.cancelBtn}
                onClick={() => setShowModal(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                style={S.submitBtn(!formOrderId || formRating < 1 || submitting)}
                onClick={handleSubmit}
                disabled={!formOrderId || formRating < 1 || submitting}
                type="button"
              >
                {submitting ? "Saving..." : "Save Feedback"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
