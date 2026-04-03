import { useState, useEffect, useCallback } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { formatINR, toPaise } from "@swiftserve/shared";

const UNITS = ["kg", "g", "l", "ml", "pcs", "dozen", "box"];
const ADJUSTMENT_TYPES = ["receive", "sale_deduct", "wastage", "adjustment"];
const WASTAGE_REASONS = ["expired", "damaged", "spill", "overcooked", "other"];
const FILTERS = ["all", "low_stock", "inactive"];

const EMPTY_FORM = {
  name: "",
  sku: "",
  unit: "pcs",
  current_stock: 0,
  min_stock: 0,
  max_stock: 0,
  cost_per_unit_rupees: "",
  supplier: "",
  is_active: 1,
};

// ── Styles ──────────────────────────────────────────────────────────────────
const S = {
  root: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    background: "var(--bg-primary)",
    color: "var(--text-secondary)",
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
    border: "1px solid var(--border-light)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 20,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0, flex: 1 },
  addBtn: {
    minWidth: 44,
    minHeight: 44,
    padding: "8px 18px",
    background: "#2563eb",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  toolbar: {
    display: "flex",
    gap: 8,
    padding: "12px 20px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  search: {
    flex: 1,
    minWidth: 180,
    minHeight: 44,
    padding: "0 14px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-secondary)",
    fontSize: 14,
    outline: "none",
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
    textTransform: "capitalize",
  }),
  list: { padding: "0 20px 20px" },
  card: (isLow) => ({
    background: "var(--bg-secondary)",
    border: "1px solid " + (isLow ? "#dc2626" : "var(--border)"),
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  }),
  cardInfo: { flex: 1, minWidth: 200 },
  cardName: { fontWeight: 700, fontSize: 16, color: "var(--text-primary)" },
  cardMeta: { fontSize: 12, color: "var(--text-muted)", marginTop: 4 },
  badge: (color) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    background: color + "22",
    color,
    marginRight: 6,
  }),
  stockDisplay: (isLow) => ({
    fontSize: 22,
    fontWeight: 700,
    color: isLow ? "#ef4444" : "#4ade80",
    minWidth: 80,
    textAlign: "center",
  }),
  actionBtns: { display: "flex", gap: 6, flexWrap: "wrap" },
  smallBtn: (bg) => ({
    minWidth: 44,
    minHeight: 44,
    padding: "8px 14px",
    background: bg,
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  }),
  // ── Modal ──
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 20,
  },
  modal: {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 500,
    maxHeight: "90vh",
    overflowY: "auto",
    color: "var(--text-secondary)",
  },
  modalTitle: { fontSize: 18, fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" },
  formGroup: { marginBottom: 14 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 },
  input: {
    width: "100%",
    minHeight: 44,
    padding: "0 12px",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-secondary)",
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
    color: "var(--text-secondary)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    appearance: "auto",
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  toggle: (on) => ({
    width: 50,
    height: 28,
    borderRadius: 14,
    background: on ? "#22c55e" : "var(--border-light)",
    border: "none",
    cursor: "pointer",
    position: "relative",
    transition: "background 0.2s",
  }),
  toggleDot: (on) => ({
    position: "absolute",
    top: 3,
    left: on ? 25 : 3,
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "#fff",
    transition: "left 0.2s",
  }),
  error: { color: "#ef4444", fontSize: 13, marginBottom: 10 },
  btnRow: { display: "flex", gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    background: "transparent",
    border: "1px solid var(--border-light)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  saveBtn: {
    flex: 1,
    minHeight: 44,
    background: "#2563eb",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  empty: {
    textAlign: "center",
    padding: 40,
    color: "var(--text-dim)",
    fontSize: 15,
  },
  textarea: {
    width: "100%",
    minHeight: 60,
    padding: 12,
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-secondary)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    resize: "vertical",
    fontFamily: "inherit",
  },
};

// ── Audit helper ────────────────────────────────────────────────────────────
async function addAudit(staffId, action, entityType, entityId, oldVal, newVal) {
  await db.audit_log.add({
    id: crypto.randomUUID(),
    outlet_id: OUTLET_ID,
    staff_id: staffId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    old_value: oldVal ? JSON.stringify(oldVal) : null,
    new_value: newVal ? JSON.stringify(newVal) : null,
    created_at: new Date().toISOString(),
    synced_at: null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
export default function InventoryScreen({ onBack }) {
  const { staff } = useAuth();
  const staffId = staff?.id || "unknown";

  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  // Modal states
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Stock adjustment modal
  const [adjustItem, setAdjustItem] = useState(null);
  const [adjType, setAdjType] = useState("receive");
  const [adjQty, setAdjQty] = useState("");
  const [adjNotes, setAdjNotes] = useState("");
  const [adjError, setAdjError] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);

  // Wastage modal
  const [wastageItem, setWastageItem] = useState(null);
  const [wastageQty, setWastageQty] = useState("");
  const [wastageReason, setWastageReason] = useState("expired");
  const [wastageNotes, setWastageNotes] = useState("");
  const [wastageError, setWastageError] = useState("");
  const [wastageSaving, setWastageSaving] = useState(false);

  // ── Load items ──────────────────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    const all = await db.inventory_items
      .where("outlet_id")
      .equals(OUTLET_ID)
      .toArray();
    setItems(all);
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // ── Filtered items ──────────────────────────────────────────────────────
  const filtered = items.filter((it) => {
    // search
    const q = search.toLowerCase();
    if (q && !it.name?.toLowerCase().includes(q) && !it.sku?.toLowerCase().includes(q)) {
      return false;
    }
    // filter
    if (filter === "low_stock") return it.current_stock <= it.min_stock && it.is_active === 1;
    if (filter === "inactive") return it.is_active !== 1;
    return true;
  });

  // ── Open add/edit form ──────────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || "",
      sku: item.sku || "",
      unit: item.unit || "pcs",
      current_stock: item.current_stock ?? 0,
      min_stock: item.min_stock ?? 0,
      max_stock: item.max_stock ?? 0,
      cost_per_unit_rupees: item.cost_per_unit ? (item.cost_per_unit / 100).toString() : "",
      supplier: item.supplier || "",
      is_active: item.is_active ?? 1,
    });
    setFormError("");
    setShowForm(true);
  };

  // ── Save item ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const costPaise = form.cost_per_unit_rupees
        ? toPaise(parseFloat(form.cost_per_unit_rupees) || 0)
        : 0;

      const record = {
        outlet_id: OUTLET_ID,
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        unit: form.unit,
        current_stock: parseFloat(form.current_stock) || 0,
        min_stock: parseFloat(form.min_stock) || 0,
        max_stock: parseFloat(form.max_stock) || 0,
        cost_per_unit: costPaise,
        supplier: form.supplier.trim() || null,
        is_active: form.is_active,
        updated_at: now,
      };

      await db.transaction("rw", ["inventory_items", "audit_log"], async () => {
        if (editingId) {
          // Editing existing
          const old = await db.inventory_items.get(editingId);
          record.id = editingId;
          record.created_at = old?.created_at || now;
          await db.inventory_items.put(record);
          await addAudit(staffId, "inventory_item_update", "inventory_item", editingId, old, record);
        } else {
          // New item
          record.id = crypto.randomUUID();
          record.created_at = now;
          await db.inventory_items.put(record);
          await addAudit(staffId, "inventory_item_create", "inventory_item", record.id, null, record);
        }
      });

      await loadItems();
      setShowForm(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Stock adjustment ────────────────────────────────────────────────────
  const openAdjust = (item) => {
    setAdjustItem(item);
    setAdjType("receive");
    setAdjQty("");
    setAdjNotes("");
    setAdjError("");
  };

  const handleAdjust = async () => {
    setAdjError("");
    const qty = parseFloat(adjQty);
    if (!qty || qty === 0) {
      setAdjError("Enter a non-zero quantity");
      return;
    }

    setAdjSaving(true);
    try {
      const now = new Date().toISOString();
      const item = adjustItem;
      const quantityBefore = item.current_stock ?? 0;

      // For sale_deduct and wastage, quantity_change is negative
      let quantityChange = qty;
      if (adjType === "sale_deduct" || adjType === "wastage") {
        quantityChange = -Math.abs(qty);
      }
      // For adjustment, use sign as-is (user can enter +/-)
      // For receive, always positive
      if (adjType === "receive") {
        quantityChange = Math.abs(qty);
      }

      const quantityAfter = quantityBefore + quantityChange;

      if (quantityAfter < 0) {
        setAdjError("Insufficient stock");
        setAdjSaving(false);
        return;
      }

      await db.transaction("rw", ["inventory_transactions", "inventory_items", "wastage_log", "audit_log"], async () => {
        // Create transaction
        const txnId = crypto.randomUUID();
        await db.inventory_transactions.add({
          id: txnId,
          outlet_id: OUTLET_ID,
          inventory_item_id: item.id,
          type: adjType,
          quantity_change: quantityChange,
          quantity_before: quantityBefore,
          quantity_after: quantityAfter,
          cost_per_unit: item.cost_per_unit || 0,
          notes: adjNotes.trim() || null,
          staff_id: staffId,
          created_at: now,
          updated_at: now,
        });

        // Update stock
        await db.inventory_items.update(item.id, {
          current_stock: quantityAfter,
          updated_at: now,
        });

        // If wastage type, also create wastage_log record
        if (adjType === "wastage") {
          await db.wastage_log.add({
            id: crypto.randomUUID(),
            outlet_id: OUTLET_ID,
            inventory_item_id: item.id,
            quantity: Math.abs(quantityChange),
            reason: "other",
            notes: adjNotes.trim() || null,
            staff_id: staffId,
            cost_value: (item.cost_per_unit || 0) * Math.abs(quantityChange),
            created_at: now,
            updated_at: now,
          });
        }

        await addAudit(staffId, "stock_adjustment", "inventory_item", item.id,
          { current_stock: quantityBefore },
          { current_stock: quantityAfter, type: adjType, quantity_change: quantityChange },
        );
      });

      await loadItems();
      setAdjustItem(null);
    } catch (err) {
      setAdjError(err.message);
    } finally {
      setAdjSaving(false);
    }
  };

  // ── Wastage quick-log ───────────────────────────────────────────────────
  const openWastage = (item) => {
    setWastageItem(item);
    setWastageQty("");
    setWastageReason("expired");
    setWastageNotes("");
    setWastageError("");
  };

  const handleWastage = async () => {
    setWastageError("");
    const qty = parseFloat(wastageQty);
    if (!qty || qty <= 0) {
      setWastageError("Enter a positive quantity");
      return;
    }

    setWastageSaving(true);
    try {
      const now = new Date().toISOString();
      const item = wastageItem;
      const quantityBefore = item.current_stock ?? 0;
      const quantityChange = -Math.abs(qty);
      const quantityAfter = quantityBefore + quantityChange;

      if (quantityAfter < 0) {
        setWastageError("Insufficient stock");
        setWastageSaving(false);
        return;
      }

      await db.transaction("rw", ["inventory_transactions", "wastage_log", "inventory_items", "audit_log"], async () => {
        // Create inventory transaction (type=wastage)
        await db.inventory_transactions.add({
          id: crypto.randomUUID(),
          outlet_id: OUTLET_ID,
          inventory_item_id: item.id,
          type: "wastage",
          quantity_change: quantityChange,
          quantity_before: quantityBefore,
          quantity_after: quantityAfter,
          cost_per_unit: item.cost_per_unit || 0,
          notes: `[${wastageReason}] ${wastageNotes.trim()}`.trim(),
          staff_id: staffId,
          created_at: now,
          updated_at: now,
        });

        // Create wastage_log record
        await db.wastage_log.add({
          id: crypto.randomUUID(),
          outlet_id: OUTLET_ID,
          inventory_item_id: item.id,
          quantity: Math.abs(qty),
          reason: wastageReason,
          notes: wastageNotes.trim() || null,
          staff_id: staffId,
          cost_value: (item.cost_per_unit || 0) * Math.abs(qty),
          created_at: now,
          updated_at: now,
        });

        // Deduct from current_stock
        await db.inventory_items.update(item.id, {
          current_stock: quantityAfter,
          updated_at: now,
        });

        await addAudit(staffId, "wastage_log", "inventory_item", item.id,
          { current_stock: quantityBefore },
          { current_stock: quantityAfter, reason: wastageReason, quantity: qty },
        );
      });

      await loadItems();
      setWastageItem(null);
    } catch (err) {
      setWastageError(err.message);
    } finally {
      setWastageSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack} aria-label="Back">{"\u2190"}</button>
        <h1 style={S.title}>Inventory</h1>
        <button style={S.addBtn} onClick={openAdd}>+ Add Item</button>
      </div>

      {/* Toolbar */}
      <div style={S.toolbar}>
        <input
          style={S.search}
          placeholder="Search name or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {FILTERS.map((f) => (
          <button
            key={f}
            style={S.filterBtn(filter === f)}
            onClick={() => setFilter(f)}
          >
            {f === "low_stock" ? "Low Stock" : f === "inactive" ? "Inactive" : "All"}
          </button>
        ))}
      </div>

      {/* Item list */}
      <div style={S.list}>
        {filtered.length === 0 && (
          <div style={S.empty}>
            {items.length === 0 ? "No inventory items yet. Tap + Add Item to get started." : "No items match your search/filter."}
          </div>
        )}
        {filtered.map((item) => {
          const isLow = item.is_active === 1 && item.current_stock <= item.min_stock;
          return (
            <div key={item.id} style={S.card(isLow)}>
              <div style={S.cardInfo}>
                <div style={S.cardName}>
                  {item.name}
                  {item.is_active !== 1 && <span style={S.badge("var(--text-dim)")}> INACTIVE</span>}
                  {isLow && <span style={S.badge("#ef4444")}> LOW</span>}
                </div>
                <div style={S.cardMeta}>
                  {item.sku && <span>SKU: {item.sku} &middot; </span>}
                  Unit: {item.unit || "pcs"} &middot;
                  Min: {item.min_stock ?? 0} &middot;
                  Cost: {item.cost_per_unit ? formatINR(item.cost_per_unit) : "--"} &middot;
                  {item.supplier && <span>Supplier: {item.supplier}</span>}
                </div>
              </div>
              <div style={S.stockDisplay(isLow)}>
                {item.current_stock ?? 0}
                <div style={{ fontSize: 10, fontWeight: 400, color: "var(--text-muted)" }}>{item.unit || "pcs"}</div>
              </div>
              <div style={S.actionBtns}>
                <button style={S.smallBtn("#7c3aed")} onClick={() => openEdit(item)}>Edit</button>
                <button style={S.smallBtn("#0ea5e9")} onClick={() => openAdjust(item)}>Adjust</button>
                <button style={S.smallBtn("#dc2626")} onClick={() => openWastage(item)}>Wastage</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Add/Edit Modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div style={S.overlay} onClick={() => setShowForm(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>{editingId ? "Edit Item" : "Add Inventory Item"}</div>

            {formError && <div style={S.error}>{formError}</div>}

            <div style={S.formGroup}>
              <label style={S.label}>Name *</label>
              <input style={S.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div style={S.formGroup}>
              <label style={S.label}>SKU</label>
              <input style={S.input} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>

            <div style={S.formGroup}>
              <label style={S.label}>Unit</label>
              <select style={S.select} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ ...S.formGroup, flex: 1 }}>
                <label style={S.label}>Current Stock</label>
                <input style={S.input} type="number" value={form.current_stock} onChange={(e) => setForm({ ...form, current_stock: e.target.value })} />
              </div>
              <div style={{ ...S.formGroup, flex: 1 }}>
                <label style={S.label}>Min Stock</label>
                <input style={S.input} type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
              </div>
              <div style={{ ...S.formGroup, flex: 1 }}>
                <label style={S.label}>Max Stock</label>
                <input style={S.input} type="number" value={form.max_stock} onChange={(e) => setForm({ ...form, max_stock: e.target.value })} />
              </div>
            </div>

            <div style={S.formGroup}>
              <label style={S.label}>Cost per Unit (Rupees)</label>
              <input
                style={S.input}
                type="number"
                step="0.01"
                placeholder="e.g. 45.50"
                value={form.cost_per_unit_rupees}
                onChange={(e) => setForm({ ...form, cost_per_unit_rupees: e.target.value })}
              />
            </div>

            <div style={S.formGroup}>
              <label style={S.label}>Supplier</label>
              <input style={S.input} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </div>

            <div style={S.toggleRow}>
              <label style={S.label}>Active</label>
              <button
                style={S.toggle(form.is_active === 1)}
                onClick={() => setForm({ ...form, is_active: form.is_active === 1 ? 0 : 1 })}
                aria-label="Toggle active"
              >
                <div style={S.toggleDot(form.is_active === 1)} />
              </button>
            </div>

            <div style={S.btnRow}>
              <button style={S.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button style={S.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stock Adjustment Modal ─────────────────────────────────────── */}
      {adjustItem && (
        <div style={S.overlay} onClick={() => setAdjustItem(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>Stock Adjustment - {adjustItem.name}</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Current stock: <strong style={{ color: "var(--text-primary)" }}>{adjustItem.current_stock ?? 0} {adjustItem.unit}</strong>
            </div>

            {adjError && <div style={S.error}>{adjError}</div>}

            <div style={S.formGroup}>
              <label style={S.label}>Adjustment Type</label>
              <select style={S.select} value={adjType} onChange={(e) => setAdjType(e.target.value)}>
                {ADJUSTMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace("_", " ")}</option>
                ))}
              </select>
            </div>

            <div style={S.formGroup}>
              <label style={S.label}>
                Quantity {adjType === "receive" ? "(added)" : adjType === "adjustment" ? "(+/-)" : "(deducted)"}
              </label>
              <input
                style={S.input}
                type="number"
                step="any"
                placeholder={adjType === "adjustment" ? "e.g. -5 or +10" : "e.g. 10"}
                value={adjQty}
                onChange={(e) => setAdjQty(e.target.value)}
              />
            </div>

            <div style={S.formGroup}>
              <label style={S.label}>Notes</label>
              <textarea style={S.textarea} value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} placeholder="Optional notes..." />
            </div>

            <div style={S.btnRow}>
              <button style={S.cancelBtn} onClick={() => setAdjustItem(null)}>Cancel</button>
              <button style={S.saveBtn} onClick={handleAdjust} disabled={adjSaving}>
                {adjSaving ? "Saving..." : "Apply Adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Wastage Quick-Log Modal ────────────────────────────────────── */}
      {wastageItem && (
        <div style={S.overlay} onClick={() => setWastageItem(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>Log Wastage - {wastageItem.name}</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Current stock: <strong style={{ color: "var(--text-primary)" }}>{wastageItem.current_stock ?? 0} {wastageItem.unit}</strong>
            </div>

            {wastageError && <div style={S.error}>{wastageError}</div>}

            <div style={S.formGroup}>
              <label style={S.label}>Quantity Wasted</label>
              <input
                style={S.input}
                type="number"
                step="any"
                placeholder="e.g. 2"
                value={wastageQty}
                onChange={(e) => setWastageQty(e.target.value)}
              />
            </div>

            <div style={S.formGroup}>
              <label style={S.label}>Reason</label>
              <select style={S.select} value={wastageReason} onChange={(e) => setWastageReason(e.target.value)}>
                {WASTAGE_REASONS.map((r) => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>

            <div style={S.formGroup}>
              <label style={S.label}>Notes</label>
              <textarea style={S.textarea} value={wastageNotes} onChange={(e) => setWastageNotes(e.target.value)} placeholder="Optional notes..." />
            </div>

            <div style={S.btnRow}>
              <button style={S.cancelBtn} onClick={() => setWastageItem(null)}>Cancel</button>
              <button style={{ ...S.saveBtn, background: "#dc2626" }} onClick={handleWastage} disabled={wastageSaving}>
                {wastageSaving ? "Saving..." : "Log Wastage"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
