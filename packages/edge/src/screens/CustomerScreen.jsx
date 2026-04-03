import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { formatINR, isValidPhone, isValidEmail } from "@swiftserve/shared";

// ─── Constants ───────────────────────────────────────────────
const PAGE_SIZE = 20;
const SORT_OPTIONS = [
  { key: "recent", label: "Recent" },
  { key: "most_orders", label: "Most Orders" },
  { key: "most_spent", label: "Most Spent" },
];

// ─── Helpers ─────────────────────────────────────────────────

function maskPhone(phone) {
  if (!phone || phone.length < 4) return "****";
  return "****" + phone.slice(-4);
}

async function hashPhone(phone) {
  const encoder = new TextEncoder();
  const data = encoder.encode(phone + "swiftserve-phone-salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

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

// ─── DB Operations ───────────────────────────────────────────

async function getCustomerList() {
  return db.customers
    .where("outlet_id").equals(OUTLET_ID)
    .filter((c) => !c.deleted_at)
    .toArray();
}

async function createCustomer(data, actingStaffId) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db.transaction("rw", ["customers", "audit_log"], async () => {
    await db.customers.add({
      id,
      outlet_id: OUTLET_ID,
      name: data.name.trim(),
      phone: data.phone.trim(),
      phone_hash: await hashPhone(data.phone.trim()),
      email: data.email?.trim() || null,
      loyalty_points: 0,
      total_spent: 0,
      total_orders: 0,
      first_order_at: null,
      last_order_at: null,
      consent_given: data.consent_given || false,
      consent_at: data.consent_given ? now : null,
      consent_purpose: data.consent_given ? '["order_history","loyalty"]' : null,
      data_deletion_requested: false,
      data_deletion_requested_at: null,
      created_at: now,
      updated_at: now,
      synced_at: null,
      deleted_at: null,
    });

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: "customer_create",
      entity_type: "customer",
      entity_id: id,
      old_value: null,
      new_value: JSON.stringify({ name: data.name, phone: maskPhone(data.phone) }),
      created_at: now,
      synced_at: null,
    });
  });

  return id;
}

async function updateCustomer(customerId, changes, actingStaffId) {
  const now = new Date().toISOString();

  await db.transaction("rw", ["customers", "audit_log"], async () => {
    const existing = await db.customers.get(customerId);
    if (!existing) throw new Error("Customer not found");

    const updates = { updated_at: now };
    if (changes.name != null) updates.name = changes.name.trim();
    if (changes.email != null) updates.email = changes.email.trim() || null;
    if (changes.phone != null) {
      updates.phone = changes.phone.trim();
      updates.phone_hash = await hashPhone(changes.phone.trim());
    }

    await db.customers.update(customerId, updates);

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: "customer_update",
      entity_type: "customer",
      entity_id: customerId,
      old_value: JSON.stringify({ name: existing.name, email: existing.email }),
      new_value: JSON.stringify(updates),
      created_at: now,
      synced_at: null,
    });
  });
}

async function adjustLoyaltyPoints(customerId, delta, reason, actingStaffId) {
  const now = new Date().toISOString();

  await db.transaction("rw", ["customers", "audit_log"], async () => {
    const customer = await db.customers.get(customerId);
    if (!customer) throw new Error("Customer not found");
    const newPoints = Math.max(0, (customer.loyalty_points || 0) + delta);

    await db.customers.update(customerId, { loyalty_points: newPoints, updated_at: now });

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: "customer_loyalty_adjust",
      entity_type: "customer",
      entity_id: customerId,
      old_value: JSON.stringify({ loyalty_points: customer.loyalty_points }),
      new_value: JSON.stringify({ loyalty_points: newPoints, delta, reason }),
      created_at: now,
      synced_at: null,
    });
  });
}

async function requestDataDeletion(customerId, actingStaffId) {
  const now = new Date().toISOString();

  await db.transaction("rw", ["customers", "audit_log"], async () => {
    await db.customers.update(customerId, {
      data_deletion_requested: true,
      data_deletion_requested_at: now,
      updated_at: now,
    });

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: "customer_deletion_request",
      entity_type: "customer",
      entity_id: customerId,
      old_value: null,
      new_value: JSON.stringify({ data_deletion_requested: true }),
      created_at: now,
      synced_at: null,
    });
  });
}

async function getCustomerOrders(customerId) {
  return db.orders
    .where("outlet_id").equals(OUTLET_ID)
    .filter((o) => o.customer_id === customerId)
    .reverse()
    .limit(20)
    .toArray();
}

// ─── Component ───────────────────────────────────────────────

export default function CustomerScreen({ onBack }) {
  const { staff } = useAuth();
  const isOwner = staff?.role === "owner";

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getCustomerList();
      setCustomers(list);
    } catch (err) {
      console.error("Failed to load customers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  // Filter and sort
  const filtered = useMemo(() => {
    let result = customers;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.phone?.includes(q)
      );
    }
    result = [...result];
    if (sortBy === "recent") {
      result.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    } else if (sortBy === "most_orders") {
      result.sort((a, b) => (b.total_orders || 0) - (a.total_orders || 0));
    } else if (sortBy === "most_spent") {
      result.sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0));
    }
    return result;
  }, [customers, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when search/sort changes
  useEffect(() => { setPage(0); }, [search, sortBy]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Customer Management</h1>

        {/* Search and Controls */}
        <div style={styles.controlsRow}>
          <input
            style={{ ...styles.input, flex: 1 }}
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button style={styles.addBtn} onClick={() => setShowAddModal(true)}>
            + Add
          </button>
        </div>

        {/* Sort */}
        <div style={styles.sortRow}>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              style={{
                ...styles.sortBtn,
                ...(sortBy === opt.key ? styles.sortBtnActive : {}),
              }}
              onClick={() => setSortBy(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Customer List */}
        {loading ? (
          <div style={styles.emptyState}>Loading...</div>
        ) : paginated.length === 0 ? (
          <div style={styles.emptyState}>
            {search ? "No customers match your search" : "No customers yet"}
          </div>
        ) : (
          <div style={styles.list}>
            {/* Header */}
            <div style={styles.tableHeader}>
              <span style={{ flex: 2 }}>Name</span>
              <span style={{ flex: 1.2 }}>Phone</span>
              <span style={{ flex: 0.7, textAlign: "right" }}>Orders</span>
              <span style={{ flex: 1, textAlign: "right" }}>Spent</span>
              <span style={{ flex: 0.7, textAlign: "right" }}>Points</span>
              <span style={{ flex: 1.2, textAlign: "right" }}>Last Order</span>
            </div>
            {paginated.map((c) => (
              <button
                key={c.id}
                style={styles.customerRow}
                onClick={() => setSelectedCustomer(c)}
              >
                <span style={{ flex: 2, textAlign: "left", fontWeight: 600 }}>{c.name}</span>
                <span style={{ flex: 1.2, textAlign: "left", fontFamily: "monospace", color: "var(--text-muted)" }}>
                  {maskPhone(c.phone)}
                </span>
                <span style={{ flex: 0.7, textAlign: "right" }}>{c.total_orders || 0}</span>
                <span style={{ flex: 1, textAlign: "right" }}>{formatINR(c.total_spent || 0)}</span>
                <span style={{ flex: 0.7, textAlign: "right", color: "#facc15" }}>
                  {c.loyalty_points || 0}
                </span>
                <span style={{ flex: 1.2, textAlign: "right", color: "var(--text-muted)", fontSize: 12 }}>
                  {formatDate(c.last_order_at)}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={styles.paginationRow}>
            <button
              style={{ ...styles.pageBtn, ...(page === 0 ? styles.disabled : {}) }}
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </button>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              style={{ ...styles.pageBtn, ...(page >= totalPages - 1 ? styles.disabled : {}) }}
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}

        <button style={styles.backBtn} onClick={onBack}>&#8592; Back</button>
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <AddCustomerModal
          staffId={staff?.id}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); loadCustomers(); }}
        />
      )}

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          staffId={staff?.id}
          isOwner={isOwner}
          onClose={() => setSelectedCustomer(null)}
          onUpdated={() => { setSelectedCustomer(null); loadCustomers(); }}
        />
      )}
    </div>
  );
}

// ─── Add Customer Modal ──────────────────────────────────────

function AddCustomerModal({ staffId, onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", consent: false });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError("");
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.phone.trim()) { setError("Phone number is required"); return; }
    if (!isValidPhone(form.phone)) { setError("Invalid phone number (10-digit Indian mobile)"); return; }
    if (form.email && !isValidEmail(form.email)) { setError("Invalid email address"); return; }
    if (!form.consent) { setError("Customer consent is required for data storage (DPDP)"); return; }

    setSaving(true);
    try {
      await createCustomer({
        name: form.name,
        phone: form.phone,
        email: form.email || null,
        consent_given: form.consent,
      }, staffId);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>Add Customer</h2>

        <label style={styles.label}>Name *</label>
        <input
          style={styles.input}
          placeholder="Customer name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />

        <label style={styles.label}>Phone *</label>
        <input
          style={styles.input}
          placeholder="10-digit mobile"
          inputMode="numeric"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
        />

        <label style={styles.label}>Email (optional)</label>
        <input
          style={styles.input}
          placeholder="email@example.com"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />

        <label style={styles.consentRow}>
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(e) => setForm({ ...form, consent: e.target.checked })}
            style={{ width: 20, height: 20, marginRight: 10, accentColor: "#3b82f6" }}
          />
          <span style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.4 }}>
            Customer consents to data storage for order history and loyalty program (DPDP Act)
          </span>
        </label>

        {error && <div style={styles.errorBox}>{error}</div>}

        <button
          style={{ ...styles.saveBtn, ...(saving ? styles.disabled : {}) }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Add Customer"}
        </button>
        <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Customer Detail Modal ───────────────────────────────────

function CustomerDetailModal({ customer, staffId, isOwner, onClose, onUpdated }) {
  const [tab, setTab] = useState("info"); // info | orders | loyalty
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: customer.name, phone: customer.phone || "", email: customer.email || "" });
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Loyalty adjustment
  const [pointsDelta, setPointsDelta] = useState("");
  const [pointsReason, setPointsReason] = useState("");

  // Load orders when switching to orders tab
  useEffect(() => {
    if (tab === "orders") {
      setOrdersLoading(true);
      getCustomerOrders(customer.id)
        .then(setOrders)
        .catch((err) => console.error("Failed to load orders:", err))
        .finally(() => setOrdersLoading(false));
    }
  }, [tab, customer.id]);

  const handleSaveEdit = async () => {
    setError("");
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (form.phone && !isValidPhone(form.phone)) { setError("Invalid phone number"); return; }
    if (form.email && !isValidEmail(form.email)) { setError("Invalid email address"); return; }

    setSaving(true);
    try {
      const changes = {};
      if (form.name !== customer.name) changes.name = form.name;
      if (form.phone !== (customer.phone || "")) changes.phone = form.phone;
      if (form.email !== (customer.email || "")) changes.email = form.email;

      if (Object.keys(changes).length > 0) {
        await updateCustomer(customer.id, changes, staffId);
      }
      setEditing(false);
      onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLoyaltyAdjust = async (direction) => {
    setError("");
    const delta = parseInt(pointsDelta, 10);
    if (!delta || delta <= 0) { setError("Enter a valid positive number"); return; }
    if (!pointsReason.trim()) { setError("Reason is required for adjustment"); return; }

    setSaving(true);
    try {
      const adjustedDelta = direction === "add" ? delta : -delta;
      await adjustLoyaltyPoints(customer.id, adjustedDelta, pointsReason.trim(), staffId);
      setPointsDelta("");
      setPointsReason("");
      onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletionRequest = async () => {
    if (!confirm("This will flag the customer record for data deletion per DPDP Act. Continue?")) return;
    setSaving(true);
    try {
      await requestDataDeletion(customer.id, staffId);
      onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>{customer.name}</h2>

        {customer.data_deletion_requested && (
          <div style={styles.warningBox}>
            Data deletion requested on {formatDateTime(customer.data_deletion_requested_at)}
          </div>
        )}

        {/* Tabs */}
        <div style={styles.tabRow}>
          {["info", "orders", "loyalty"].map((t) => (
            <button
              key={t}
              style={{ ...styles.tabBtn, ...(tab === t ? styles.tabBtnActive : {}) }}
              onClick={() => setTab(t)}
            >
              {t === "info" ? "Details" : t === "orders" ? "Orders" : "Loyalty"}
            </button>
          ))}
        </div>

        {/* ─── Info Tab ─── */}
        {tab === "info" && (
          <div style={styles.tabContent}>
            {editing ? (
              <>
                <label style={styles.label}>Name</label>
                <input
                  style={styles.input}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <label style={styles.label}>Phone</label>
                <input
                  style={styles.input}
                  value={form.phone}
                  inputMode="numeric"
                  onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                />
                <label style={styles.label}>Email</label>
                <input
                  style={styles.input}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />

                {error && <div style={styles.errorBox}>{error}</div>}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    style={{ ...styles.saveBtn, flex: 1, ...(saving ? styles.disabled : {}) }}
                    onClick={handleSaveEdit}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    style={{ ...styles.cancelBtn, flex: 1, marginTop: 0 }}
                    onClick={() => { setEditing(false); setError(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={styles.detailGrid}>
                  <DetailRow label="Name" value={customer.name} />
                  <DetailRow label="Phone" value={customer.phone || "-"} />
                  <DetailRow label="Email" value={customer.email || "-"} />
                  <DetailRow label="Total Orders" value={customer.total_orders || 0} />
                  <DetailRow label="Total Spent" value={formatINR(customer.total_spent || 0)} />
                  <DetailRow label="Loyalty Points" value={customer.loyalty_points || 0} highlight />
                  <DetailRow label="First Order" value={formatDate(customer.first_order_at)} />
                  <DetailRow label="Last Order" value={formatDate(customer.last_order_at)} />
                  <DetailRow label="Consent" value={customer.consent_given ? "Given" : "Not given"} />
                  <DetailRow label="Registered" value={formatDate(customer.created_at)} />
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button style={styles.editBtn} onClick={() => setEditing(true)}>
                    Edit
                  </button>
                  {!customer.data_deletion_requested && (
                    <button style={styles.deletionBtn} onClick={handleDeletionRequest} disabled={saving}>
                      Request Data Deletion
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── Orders Tab ─── */}
        {tab === "orders" && (
          <div style={styles.tabContent}>
            {ordersLoading ? (
              <div style={styles.emptyState}>Loading orders...</div>
            ) : orders.length === 0 ? (
              <div style={styles.emptyState}>No orders found</div>
            ) : (
              <div style={styles.ordersList}>
                {orders.map((o) => (
                  <div key={o.id} style={styles.orderRow}>
                    <div style={styles.orderInfo}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>#{o.order_number}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                        padding: "2px 8px", borderRadius: 4,
                        backgroundColor: o.status === "completed" ? "rgba(74,222,128,0.2)" : "rgba(250,204,21,0.2)",
                        color: o.status === "completed" ? "#4ade80" : "#facc15",
                      }}>
                        {o.status}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-muted)" }}>
                      <span>{formatDateTime(o.created_at)}</span>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{formatINR(o.grand_total || 0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Loyalty Tab ─── */}
        {tab === "loyalty" && (
          <div style={styles.tabContent}>
            <div style={styles.loyaltySummary}>
              <div style={styles.loyaltyBig}>{customer.loyalty_points || 0}</div>
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Current Points</div>
            </div>

            <div style={styles.earnRate}>
              Earn rate: 1 point per &#8377;100 spent (auto-earn coming in Phase 5)
            </div>

            {isOwner ? (
              <>
                <label style={styles.label}>Adjust Points</label>
                <input
                  style={styles.input}
                  placeholder="Number of points"
                  inputMode="numeric"
                  value={pointsDelta}
                  onChange={(e) => setPointsDelta(e.target.value.replace(/\D/g, ""))}
                />

                <label style={styles.label}>Reason</label>
                <input
                  style={styles.input}
                  placeholder="Reason for adjustment"
                  value={pointsReason}
                  onChange={(e) => setPointsReason(e.target.value)}
                />

                {error && <div style={styles.errorBox}>{error}</div>}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    style={{ ...styles.addPointsBtn, ...(saving ? styles.disabled : {}) }}
                    onClick={() => handleLoyaltyAdjust("add")}
                    disabled={saving}
                  >
                    + Add Points
                  </button>
                  <button
                    style={{ ...styles.removePointsBtn, ...(saving ? styles.disabled : {}) }}
                    onClick={() => handleLoyaltyAdjust("remove")}
                    disabled={saving}
                  >
                    - Remove Points
                  </button>
                </div>
              </>
            ) : (
              <div style={{ ...styles.emptyState, marginTop: 16 }}>
                Only the owner can adjust loyalty points manually
              </div>
            )}
          </div>
        )}

        <button style={styles.cancelBtn} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ─── Detail Row ──────────────────────────────────────────────

function DetailRow({ label, value, highlight }) {
  return (
    <div style={styles.detailRow}>
      <span style={styles.detailLabel}>{label}</span>
      <span style={{ ...styles.detailValue, ...(highlight ? { color: "#facc15", fontWeight: 700 } : {}) }}>
        {value}
      </span>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = {
  container: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "var(--bg-primary)", display: "flex",
    alignItems: "flex-start", justifyContent: "center", padding: "24px 16px",
    overflowY: "auto", color: "var(--text-primary)",
  },
  card: {
    backgroundColor: "var(--bg-secondary)", borderRadius: 16, padding: 28, width: "100%",
    maxWidth: 800, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex",
    flexDirection: "column", marginTop: 16,
  },
  title: {
    color: "var(--text-primary)", fontSize: 22, fontWeight: 700, margin: "0 0 16px 0", textAlign: "center",
  },
  controlsRow: {
    display: "flex", gap: 8, marginBottom: 12,
  },
  sortRow: {
    display: "flex", gap: 6, marginBottom: 16,
  },
  sortBtn: {
    minHeight: 36, padding: "6px 14px", backgroundColor: "transparent",
    border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)", fontSize: 12,
    fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  sortBtnActive: {
    backgroundColor: "rgba(59,130,246,0.2)", borderColor: "#3b82f6", color: "#60a5fa",
  },
  addBtn: {
    minHeight: 44, padding: "10px 20px", backgroundColor: "#3b82f6",
    border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700,
    cursor: "pointer", touchAction: "manipulation", whiteSpace: "nowrap",
  },
  list: {
    display: "flex", flexDirection: "column", maxHeight: 440, overflowY: "auto",
  },
  tableHeader: {
    display: "flex", padding: "8px 14px", fontSize: 11, fontWeight: 700,
    textTransform: "uppercase", color: "var(--text-dim)", borderBottom: "1px solid var(--border)",
  },
  customerRow: {
    display: "flex", alignItems: "center", padding: "12px 14px",
    backgroundColor: "transparent", border: "none", borderBottom: "1px solid var(--bg-secondary)",
    color: "var(--text-primary)", fontSize: 13, cursor: "pointer", touchAction: "manipulation",
    width: "100%", textAlign: "left", minHeight: 44,
  },
  emptyState: {
    textAlign: "center", color: "var(--text-dim)", padding: 32, fontSize: 14,
  },
  paginationRow: {
    display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 12,
  },
  pageBtn: {
    minHeight: 36, padding: "6px 16px", backgroundColor: "transparent",
    border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)", fontSize: 13,
    fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  backBtn: {
    marginTop: 12, width: "100%", minHeight: 44, padding: "10px 24px",
    backgroundColor: "transparent", border: "1px solid var(--border)", borderRadius: 10,
    color: "var(--text-muted)", fontSize: 14, fontWeight: 600, cursor: "pointer",
    touchAction: "manipulation",
  },

  // ─── Modal ───
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)", display: "flex",
    alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1000,
  },
  modal: {
    backgroundColor: "var(--bg-secondary)", borderRadius: 16, padding: 28, width: "100%",
    maxWidth: 480, maxHeight: "90vh", overflowY: "auto",
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
  },
  modalTitle: {
    color: "var(--text-primary)", fontSize: 20, fontWeight: 700, margin: "0 0 16px 0", textAlign: "center",
  },

  // ─── Form ───
  label: {
    fontSize: 13, color: "var(--text-muted)", fontWeight: 600, margin: "12px 0 4px 0",
    textTransform: "uppercase", display: "block",
  },
  input: {
    width: "100%", padding: "12px 14px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text-primary)", fontSize: 14, outline: "none", boxSizing: "border-box",
  },
  consentRow: {
    display: "flex", alignItems: "flex-start", margin: "16px 0", cursor: "pointer",
    minHeight: 44,
  },
  errorBox: {
    marginTop: 8, padding: "10px 14px", backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444", borderRadius: 8, color: "#fca5a5", fontSize: 14,
    textAlign: "center",
  },
  warningBox: {
    marginBottom: 12, padding: "10px 14px", backgroundColor: "rgba(250,204,21,0.15)",
    border: "1px solid #facc15", borderRadius: 8, color: "#fde68a", fontSize: 13,
    textAlign: "center",
  },
  saveBtn: {
    marginTop: 16, width: "100%", minHeight: 48, padding: "12px 24px",
    backgroundColor: "#22c55e", border: "none", borderRadius: 12, color: "#fff",
    fontSize: 16, fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
  },
  cancelBtn: {
    marginTop: 8, width: "100%", minHeight: 44, padding: "10px 24px",
    backgroundColor: "transparent", border: "1px solid var(--border)", borderRadius: 10,
    color: "var(--text-muted)", fontSize: 14, fontWeight: 600, cursor: "pointer",
    touchAction: "manipulation",
  },
  disabled: { opacity: 0.5, cursor: "not-allowed" },

  // ─── Tabs ───
  tabRow: {
    display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 0,
  },
  tabBtn: {
    flex: 1, minHeight: 44, padding: "10px 12px", backgroundColor: "transparent",
    border: "none", borderBottom: "2px solid transparent", color: "var(--text-dim)",
    fontSize: 13, fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  tabBtnActive: {
    color: "#60a5fa", borderBottomColor: "#3b82f6",
  },
  tabContent: {
    minHeight: 200,
  },

  // ─── Detail ───
  detailGrid: {
    display: "flex", flexDirection: "column", gap: 2,
  },
  detailRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 0", borderBottom: "1px solid rgba(51,65,85,0.5)",
  },
  detailLabel: { fontSize: 13, color: "var(--text-dim)" },
  detailValue: { fontSize: 14, color: "var(--text-primary)", fontWeight: 500 },
  editBtn: {
    flex: 1, minHeight: 44, padding: "10px 12px", backgroundColor: "transparent",
    border: "1px solid var(--border-light)", borderRadius: 8, color: "var(--text-muted)", fontSize: 13,
    fontWeight: 600, cursor: "pointer", touchAction: "manipulation", textAlign: "center",
  },
  deletionBtn: {
    flex: 1, minHeight: 44, padding: "10px 12px", backgroundColor: "transparent",
    border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, color: "#f87171",
    fontSize: 13, fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
    textAlign: "center",
  },

  // ─── Orders ───
  ordersList: {
    display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto",
  },
  orderRow: {
    backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 8,
    padding: 12, display: "flex", flexDirection: "column", gap: 6,
  },
  orderInfo: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },

  // ─── Loyalty ───
  loyaltySummary: {
    textAlign: "center", padding: 20, backgroundColor: "var(--bg-primary)",
    borderRadius: 12, marginBottom: 16,
  },
  loyaltyBig: {
    fontSize: 42, fontWeight: 800, color: "#facc15",
  },
  earnRate: {
    padding: "10px 14px", backgroundColor: "rgba(59,130,246,0.1)",
    border: "1px solid rgba(59,130,246,0.3)", borderRadius: 8, color: "#93c5fd",
    fontSize: 13, textAlign: "center", marginBottom: 16,
  },
  addPointsBtn: {
    flex: 1, minHeight: 44, padding: "10px 12px", backgroundColor: "rgba(74,222,128,0.15)",
    border: "1px solid rgba(74,222,128,0.4)", borderRadius: 8, color: "#4ade80",
    fontSize: 14, fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
  },
  removePointsBtn: {
    flex: 1, minHeight: 44, padding: "10px 12px", backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, color: "#f87171",
    fontSize: 14, fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
  },
};
