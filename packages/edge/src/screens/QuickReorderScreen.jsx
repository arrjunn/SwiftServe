import { useState, useEffect, useCallback } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { formatINR } from "@swiftserve/shared";

function maskPhone(phone) {
  if (!phone) return "-";
  if (phone.length <= 4) return phone;
  return "****" + phone.slice(-4);
}

// ─── Constants ───────────────────────────────────────────────
const PAST_ORDER_LIMIT = 20;

// ─── Helpers ─────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── DB Operations ───────────────────────────────────────────

async function searchCustomers(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim().toLowerCase();

  const all = await db.customers
    .where("outlet_id")
    .equals(OUTLET_ID)
    .filter((c) => !c.deleted_at)
    .toArray();

  return all.filter(
    (c) =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)),
  );
}

async function getCustomerOrders(customerId) {
  const orders = await db.orders
    .where("outlet_id")
    .equals(OUTLET_ID)
    .filter(
      (o) =>
        o.customer_id === customerId &&
        (o.status === "completed" || o.status === "paid"),
    )
    .toArray();

  // Sort newest first, take last N
  orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const sliced = orders.slice(0, PAST_ORDER_LIMIT);

  // Attach item counts
  const enriched = await Promise.all(
    sliced.map(async (order) => {
      const items = await db.order_items
        .where("order_id")
        .equals(order.id)
        .filter((i) => !i.is_void)
        .toArray();
      return { ...order, itemCount: items.length };
    }),
  );

  return enriched;
}

// ─── Styles ──────────────────────────────────────────────────

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    flexShrink: 0,
  },
  backBtn: {
    background: "none",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    padding: "10px 16px",
    borderRadius: 8,
    fontSize: 15,
    cursor: "pointer",
    minHeight: 44,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
  },
  body: {
    flex: 1,
    overflow: "auto",
    padding: 20,
  },
  searchBox: {
    width: "100%",
    padding: "14px 16px",
    fontSize: 16,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    outline: "none",
    boxSizing: "border-box",
    minHeight: 48,
  },
  hint: {
    color: "var(--text-muted)",
    fontSize: 13,
    marginTop: 8,
  },
  customerList: {
    listStyle: "none",
    margin: "16px 0 0",
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  customerItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    cursor: "pointer",
    minHeight: 48,
  },
  customerName: {
    fontSize: 15,
    fontWeight: 600,
  },
  customerPhone: {
    fontSize: 13,
    color: "var(--text-muted)",
    marginTop: 2,
  },
  customerMeta: {
    textAlign: "right",
    fontSize: 12,
    color: "var(--text-dim)",
  },
  profileCard: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    padding: "16px 20px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    marginBottom: 20,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 700,
    width: "100%",
    marginBottom: 4,
  },
  profileStat: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
  profileStatValue: {
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  changeCustBtn: {
    marginLeft: "auto",
    background: "none",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    padding: "8px 14px",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
    minHeight: 44,
    alignSelf: "flex-start",
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: 12,
  },
  orderList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  orderCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    gap: 12,
  },
  orderInfo: {
    flex: 1,
    minWidth: 0,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: 600,
  },
  orderDetail: {
    fontSize: 13,
    color: "var(--text-muted)",
    marginTop: 3,
  },
  reorderBtn: {
    background: "var(--text-primary)",
    color: "var(--bg-primary)",
    border: "none",
    padding: "10px 20px",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    minHeight: 44,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  emptyMsg: {
    textAlign: "center",
    padding: "40px 20px",
    color: "var(--text-muted)",
    fontSize: 15,
  },
  loading: {
    textAlign: "center",
    padding: "40px 20px",
    color: "var(--text-dim)",
    fontSize: 14,
  },
};

// ─── Component ───────────────────────────────────────────────

export default function QuickReorderScreen({ onBack, onReorder }) {
  const [step, setStep] = useState("search"); // "search" | "orders"
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // ── Search customers ──
  useEffect(() => {
    if (step !== "search") return;
    if (query.trim().length < 2) {
      setCustomers([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchCustomers(query);
        if (!cancelled) setCustomers(results);
      } catch (err) {
        console.error("[QUICK-REORDER] Search failed:", err);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, step]);

  // ── Select customer ──
  const handleSelectCustomer = useCallback(async (customer) => {
    setSelectedCustomer(customer);
    setStep("orders");
    setLoadingOrders(true);
    try {
      const pastOrders = await getCustomerOrders(customer.id);
      setOrders(pastOrders);
    } catch (err) {
      console.error("[QUICK-REORDER] Load orders failed:", err);
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  // ── Change customer ──
  const handleChangeCustomer = useCallback(() => {
    setStep("search");
    setSelectedCustomer(null);
    setOrders([]);
    setQuery("");
  }, []);

  // ── Reorder ──
  const handleReorder = useCallback(
    (orderId) => {
      if (onReorder) onReorder(orderId);
    },
    [onReorder],
  );

  // ── Render ──
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack} aria-label="Back">
          &#8592; Back
        </button>
        <h2 style={styles.title}>Quick Reorder</h2>
      </div>

      <div style={styles.body}>
        {/* ── Step 1: Search ── */}
        {step === "search" && (
          <>
            <input
              style={styles.searchBox}
              type="text"
              placeholder="Search by customer name or phone..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <div style={styles.hint}>
              Type at least 2 characters to search
            </div>

            {searching && (
              <div style={styles.loading}>Searching...</div>
            )}

            {!searching && query.trim().length >= 2 && customers.length === 0 && (
              <div style={styles.emptyMsg}>
                <div>No customer found</div>
                <button
                  style={{ ...styles.backBtn, marginTop: 16 }}
                  onClick={onBack}
                >
                  Go Back
                </button>
              </div>
            )}

            {customers.length > 0 && (
              <ul style={styles.customerList}>
                {customers.map((c) => (
                  <li
                    key={c.id}
                    style={styles.customerItem}
                    onClick={() => handleSelectCustomer(c)}
                  >
                    <div>
                      <div style={styles.customerName}>{c.name}</div>
                      <div style={styles.customerPhone}>{maskPhone(c.phone)}</div>
                    </div>
                    <div style={styles.customerMeta}>
                      <div>{c.total_orders || 0} orders</div>
                      <div>{formatINR(c.total_spent || 0)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* ── Step 2 / 3: Customer Orders ── */}
        {step === "orders" && selectedCustomer && (
          <>
            {/* Customer profile card */}
            <div style={styles.profileCard}>
              <div style={{ flex: 1 }}>
                <div style={styles.profileName}>{selectedCustomer.name}</div>
                <div style={styles.profileStat}>
                  Phone:{" "}
                  <span style={styles.profileStatValue}>
                    {maskPhone(selectedCustomer.phone)}
                  </span>
                </div>
                <div style={styles.profileStat}>
                  Loyalty Points:{" "}
                  <span style={styles.profileStatValue}>
                    {selectedCustomer.loyalty_points || 0}
                  </span>
                </div>
                <div style={styles.profileStat}>
                  Total Orders:{" "}
                  <span style={styles.profileStatValue}>
                    {selectedCustomer.total_orders || 0}
                  </span>
                </div>
              </div>
              <button
                style={styles.changeCustBtn}
                onClick={handleChangeCustomer}
              >
                Change Customer
              </button>
            </div>

            {/* Orders list */}
            <div style={styles.sectionLabel}>
              Past Orders (last {PAST_ORDER_LIMIT})
            </div>

            {loadingOrders && (
              <div style={styles.loading}>Loading orders...</div>
            )}

            {!loadingOrders && orders.length === 0 && (
              <div style={styles.emptyMsg}>
                No completed orders found for this customer.
              </div>
            )}

            {!loadingOrders && orders.length > 0 && (
              <div style={styles.orderList}>
                {orders.map((order) => (
                  <div key={order.id} style={styles.orderCard}>
                    <div style={styles.orderInfo}>
                      <div style={styles.orderNumber}>
                        #{order.order_number}
                      </div>
                      <div style={styles.orderDetail}>
                        {formatDateTime(order.created_at)}
                        {"  |  "}
                        {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
                        {"  |  "}
                        {formatINR(order.grand_total || 0)}
                      </div>
                    </div>
                    <button
                      style={styles.reorderBtn}
                      onClick={() => handleReorder(order.id)}
                    >
                      Reorder
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
