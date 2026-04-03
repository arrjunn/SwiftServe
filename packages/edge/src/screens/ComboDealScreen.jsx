import { useState, useEffect, useCallback } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { formatINR, toPaise } from "@swiftserve/shared";

const EMPTY_FORM = {
  name: "",
  description: "",
  combo_price_rupees: "",
  is_active: 1,
  items: [], // [{ menu_item_id, quantity }]
};

export default function ComboDealScreen({ onBack }) {
  const [combos, setCombos] = useState([]);
  const [comboItemsMap, setComboItemsMap] = useState({}); // combo_deal_id -> [{ ...combo_deal_item, menuItem }]
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [mode, setMode] = useState("list"); // list | form
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const allCombos = await db.combo_deals
        .where("outlet_id").equals(OUTLET_ID)
        .toArray();
      allCombos.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

      const allComboItems = await db.combo_deal_items
        .where("outlet_id").equals(OUTLET_ID)
        .toArray();

      const items = await db.menu_items
        .where("outlet_id").equals(OUTLET_ID)
        .filter((i) => i.is_active === 1)
        .toArray();

      const cats = await db.menu_categories
        .where("outlet_id").equals(OUTLET_ID)
        .sortBy("sort_order");

      const itemMap = {};
      items.forEach((i) => { itemMap[i.id] = i; });

      const ciMap = {};
      allComboItems.forEach((ci) => {
        if (!ciMap[ci.combo_deal_id]) ciMap[ci.combo_deal_id] = [];
        ciMap[ci.combo_deal_id].push({ ...ci, menuItem: itemMap[ci.menu_item_id] || null });
      });

      setCombos(allCombos);
      setComboItemsMap(ciMap);
      setMenuItems(items);
      setCategories(cats);
    } catch (err) {
      console.error("ComboDealScreen load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const calcItemsTotal = (comboItems) => {
    let total = 0;
    comboItems.forEach((ci) => {
      const mi = menuItems.find((m) => m.id === ci.menu_item_id);
      if (mi) total += mi.price * (ci.quantity || 1);
    });
    return total;
  };

  const calcSavingsPercent = (itemsTotalPaise, comboPricePaise) => {
    if (itemsTotalPaise <= 0) return 0;
    return Math.round(((itemsTotalPaise - comboPricePaise) / itemsTotalPaise) * 100);
  };

  const openForm = (combo) => {
    if (combo) {
      const items = (comboItemsMap[combo.id] || []).map((ci) => ({
        menu_item_id: ci.menu_item_id,
        quantity: ci.quantity || 1,
      }));
      setEditingId(combo.id);
      setForm({
        name: combo.name,
        description: combo.description || "",
        combo_price_rupees: String(combo.combo_price / 100),
        is_active: combo.is_active,
        items,
      });
    } else {
      setEditingId(null);
      setForm({ ...EMPTY_FORM, items: [] });
    }
    setError("");
    setFilterCategory("all");
    setMode("form");
  };

  const handleSave = async () => {
    setError("");
    if (!form.name.trim()) { setError("Combo name is required"); return; }
    const priceNum = parseFloat(form.combo_price_rupees);
    if (!priceNum || priceNum <= 0) { setError("Valid combo price is required"); return; }
    if (form.items.length === 0) { setError("Add at least one menu item to the combo"); return; }

    setSaving(true);
    const now = new Date().toISOString();
    const comboPricePaise = toPaise(priceNum);

    try {
      await db.transaction("rw", ["combo_deals", "combo_deal_items"], async () => {
        if (editingId) {
          await db.combo_deals.update(editingId, {
            name: form.name.trim(),
            description: form.description.trim(),
            combo_price: comboPricePaise,
            is_active: form.is_active,
            updated_at: now,
          });
          // Remove old items and re-insert
          const oldItems = await db.combo_deal_items
            .where("combo_deal_id").equals(editingId)
            .toArray();
          await db.combo_deal_items.bulkDelete(oldItems.map((i) => i.id));
          const newItems = form.items.map((fi) => ({
            id: crypto.randomUUID(),
            outlet_id: OUTLET_ID,
            combo_deal_id: editingId,
            menu_item_id: fi.menu_item_id,
            quantity: fi.quantity,
            created_at: now,
            updated_at: now,
            synced_at: null,
            deleted_at: null,
          }));
          await db.combo_deal_items.bulkAdd(newItems);
        } else {
          const comboId = crypto.randomUUID();
          await db.combo_deals.add({
            id: comboId,
            outlet_id: OUTLET_ID,
            name: form.name.trim(),
            description: form.description.trim(),
            combo_price: comboPricePaise,
            is_active: form.is_active,
            created_at: now,
            updated_at: now,
            synced_at: null,
            deleted_at: null,
          });
          const newItems = form.items.map((fi) => ({
            id: crypto.randomUUID(),
            outlet_id: OUTLET_ID,
            combo_deal_id: comboId,
            menu_item_id: fi.menu_item_id,
            quantity: fi.quantity,
            created_at: now,
            updated_at: now,
            synced_at: null,
            deleted_at: null,
          }));
          await db.combo_deal_items.bulkAdd(newItems);
        }
      });
      await load();
      setMode("list");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (combo) => {
    try {
      await db.combo_deals.update(combo.id, {
        is_active: combo.is_active === 1 ? 0 : 1,
        updated_at: new Date().toISOString(),
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const addItemToCombo = (menuItemId) => {
    const existing = form.items.find((i) => i.menu_item_id === menuItemId);
    if (existing) {
      setForm({
        ...form,
        items: form.items.map((i) =>
          i.menu_item_id === menuItemId ? { ...i, quantity: i.quantity + 1 } : i
        ),
      });
    } else {
      setForm({ ...form, items: [...form.items, { menu_item_id: menuItemId, quantity: 1 }] });
    }
  };

  const removeItemFromCombo = (menuItemId) => {
    setForm({ ...form, items: form.items.filter((i) => i.menu_item_id !== menuItemId) });
  };

  const updateItemQty = (menuItemId, qty) => {
    const val = Math.max(1, parseInt(qty) || 1);
    setForm({
      ...form,
      items: form.items.map((i) =>
        i.menu_item_id === menuItemId ? { ...i, quantity: val } : i
      ),
    });
  };

  // ── Form view ──────────────────────────────────────────────────────────────
  if (mode === "form") {
    const itemsTotalPaise = calcItemsTotal(form.items);
    const comboPricePaise = toPaise(parseFloat(form.combo_price_rupees) || 0);
    const savingsPercent = calcSavingsPercent(itemsTotalPaise, comboPricePaise);
    const catMap = {};
    categories.forEach((c) => { catMap[c.id] = c.name; });

    const filteredMenuItems = filterCategory === "all"
      ? menuItems
      : menuItems.filter((m) => m.category_id === filterCategory);

    return (
      <div style={S.root}>
        <div style={S.header}>
          <button style={S.backBtn} onClick={() => setMode("list")} aria-label="Back">&#8592;</button>
          <h1 style={S.title}>{editingId ? "Edit Combo" : "Create Combo"}</h1>
        </div>

        <div style={S.formBody}>
          <label style={S.label}>Combo Name *</label>
          <input style={S.input} value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Family Feast" />

          <label style={S.label}>Description</label>
          <input style={S.input} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Optional description" />

          <label style={S.label}>Combo Price (Rupees) *</label>
          <input style={S.input} inputMode="decimal" value={form.combo_price_rupees}
            onChange={(e) => setForm({ ...form, combo_price_rupees: e.target.value.replace(/[^0-9.]/g, "") })}
            placeholder="e.g. 299" />

          <label style={S.label}>Status</label>
          <button
            style={{
              ...S.toggleStatusBtn,
              backgroundColor: form.is_active === 1 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              borderColor: form.is_active === 1 ? "#22c55e" : "#ef4444",
              color: form.is_active === 1 ? "#4ade80" : "#f87171",
            }}
            onClick={() => setForm({ ...form, is_active: form.is_active === 1 ? 0 : 1 })}
          >
            {form.is_active === 1 ? "Active" : "Inactive"}
          </button>

          {/* Savings summary */}
          {form.items.length > 0 && (
            <div style={S.savingsBox}>
              <div style={S.savingsRow}>
                <span style={S.savingsLabel}>Items total</span>
                <span style={S.savingsValue}>{formatINR(itemsTotalPaise)}</span>
              </div>
              <div style={S.savingsRow}>
                <span style={S.savingsLabel}>Combo price</span>
                <span style={{ ...S.savingsValue, color: "#3b82f6" }}>{formatINR(comboPricePaise)}</span>
              </div>
              {comboPricePaise > 0 && itemsTotalPaise > comboPricePaise && (
                <div style={S.savingsRow}>
                  <span style={{ ...S.savingsLabel, color: "#4ade80", fontWeight: 700 }}>Savings</span>
                  <span style={{ ...S.savingsValue, color: "#4ade80", fontWeight: 700 }}>
                    {formatINR(itemsTotalPaise - comboPricePaise)} ({savingsPercent}%)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Selected items */}
          <label style={S.label}>Combo Items ({form.items.length})</label>
          <div style={S.selectedItems}>
            {form.items.length === 0 && (
              <div style={S.emptyHint}>No items added yet. Select items below.</div>
            )}
            {form.items.map((fi) => {
              const mi = menuItems.find((m) => m.id === fi.menu_item_id);
              if (!mi) return null;
              return (
                <div key={fi.menu_item_id} style={S.selectedItemRow}>
                  <div style={S.selectedItemInfo}>
                    <span style={S.selectedItemName}>{mi.name}</span>
                    <span style={S.selectedItemPrice}>{formatINR(mi.price)} each</span>
                  </div>
                  <div style={S.qtyControls}>
                    <button style={S.qtyBtn} onClick={() => updateItemQty(fi.menu_item_id, fi.quantity - 1)}>-</button>
                    <span style={S.qtyDisplay}>{fi.quantity}</span>
                    <button style={S.qtyBtn} onClick={() => updateItemQty(fi.menu_item_id, fi.quantity + 1)}>+</button>
                  </div>
                  <button style={S.removeBtn} onClick={() => removeItemFromCombo(fi.menu_item_id)}>X</button>
                </div>
              );
            })}
          </div>

          {/* Menu items picker */}
          <label style={S.label}>Add Menu Items</label>
          <div style={S.filterRow}>
            <button
              style={{ ...S.filterChip, ...(filterCategory === "all" ? S.filterChipActive : {}) }}
              onClick={() => setFilterCategory("all")}
            >All</button>
            {categories.map((c) => (
              <button key={c.id}
                style={{ ...S.filterChip, ...(filterCategory === c.id ? S.filterChipActive : {}) }}
                onClick={() => setFilterCategory(c.id)}
              >{c.name}</button>
            ))}
          </div>
          <div style={S.menuPickerGrid}>
            {filteredMenuItems.map((mi) => {
              const inCombo = form.items.some((fi) => fi.menu_item_id === mi.id);
              return (
                <button key={mi.id}
                  style={{ ...S.menuPickerItem, ...(inCombo ? S.menuPickerItemSelected : {}) }}
                  onClick={() => inCombo ? removeItemFromCombo(mi.id) : addItemToCombo(mi.id)}
                >
                  <span style={S.menuPickerName}>{mi.name}</span>
                  <span style={S.menuPickerPrice}>{formatINR(mi.price)}</span>
                  {inCombo && <span style={S.menuPickerCheck}>Added</span>}
                </button>
              );
            })}
          </div>

          {error && <div style={S.errorBox}>{error}</div>}

          <button style={{ ...S.saveBtn, ...(saving ? S.disabled : {}) }}
            onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : editingId ? "Update Combo" : "Create Combo"}
          </button>
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack} aria-label="Back">&#8592;</button>
        <h1 style={S.title}>Combo / Meal Deals</h1>
        <button style={S.addBtn} onClick={() => openForm(null)}>+ Create Combo</button>
      </div>

      <div style={S.listBody}>
        {error && <div style={S.errorBox}>{error}</div>}

        {combos.length === 0 && (
          <div style={S.emptyState}>
            <div style={S.emptyTitle}>No combo deals yet</div>
            <div style={S.emptySubtitle}>Create your first combo deal to offer bundled pricing to customers.</div>
          </div>
        )}

        {combos.map((combo) => {
          const items = comboItemsMap[combo.id] || [];
          const itemsTotalPaise = items.reduce((sum, ci) => {
            const price = ci.menuItem ? ci.menuItem.price : 0;
            return sum + price * (ci.quantity || 1);
          }, 0);
          const savingsPercent = calcSavingsPercent(itemsTotalPaise, combo.combo_price);
          const isActive = combo.is_active === 1;

          return (
            <div key={combo.id} style={{ ...S.comboCard, ...(isActive ? {} : { opacity: 0.55 }) }}>
              <div style={S.comboHeader}>
                <div style={S.comboTitleRow}>
                  <span style={S.comboName}>{combo.name}</span>
                  <span style={{
                    ...S.statusBadge,
                    backgroundColor: isActive ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                    color: isActive ? "#4ade80" : "#f87171",
                  }}>
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                {combo.description && <div style={S.comboDesc}>{combo.description}</div>}
              </div>

              <div style={S.comboPriceRow}>
                <span style={S.comboPriceLabel}>Combo Price</span>
                <span style={S.comboPriceValue}>{formatINR(combo.combo_price)}</span>
              </div>

              {itemsTotalPaise > 0 && (
                <div style={S.comboSavingsRow}>
                  <span style={S.comboOriginal}>Items total: {formatINR(itemsTotalPaise)}</span>
                  {savingsPercent > 0 && (
                    <span style={S.comboSavingsBadge}>Save {savingsPercent}%</span>
                  )}
                </div>
              )}

              {items.length > 0 && (
                <div style={S.comboItemsList}>
                  {items.map((ci, idx) => (
                    <span key={idx} style={S.comboItemChip}>
                      {ci.menuItem ? ci.menuItem.name : "Unknown item"}
                      {(ci.quantity || 1) > 1 ? ` x${ci.quantity}` : ""}
                    </span>
                  ))}
                </div>
              )}

              <div style={S.comboActions}>
                <button style={S.editBtn} onClick={() => openForm(combo)}>Edit</button>
                <button
                  style={isActive ? S.deactivateBtn : S.activateBtn}
                  onClick={() => handleToggleActive(combo)}
                >
                  {isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "var(--bg-primary)", color: "var(--text-primary)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    overflowY: "auto",
  },
  header: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "16px 20px", borderBottom: "1px solid var(--border)",
    background: "var(--bg-secondary)", position: "sticky", top: 0, zIndex: 10,
  },
  backBtn: {
    minWidth: 44, minHeight: 44, background: "transparent",
    border: "1px solid var(--border)", borderRadius: 8,
    color: "var(--text-muted)", fontSize: 20, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    touchAction: "manipulation",
  },
  title: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0, flex: 1 },
  addBtn: {
    minHeight: 44, padding: "10px 20px", backgroundColor: "#3b82f6",
    border: "none", borderRadius: 10, color: "#fff", fontSize: 14,
    fontWeight: 700, cursor: "pointer", touchAction: "manipulation", whiteSpace: "nowrap",
  },

  // List
  listBody: { padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 },
  emptyState: { textAlign: "center", padding: "48px 20px" },
  emptyTitle: { fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: "var(--text-muted)" },

  comboCard: {
    backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)",
    borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10,
  },
  comboHeader: { display: "flex", flexDirection: "column", gap: 4 },
  comboTitleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  comboName: { fontSize: 16, fontWeight: 700, color: "var(--text-primary)" },
  statusBadge: {
    fontSize: 11, fontWeight: 700, textTransform: "uppercase", padding: "3px 10px",
    borderRadius: 4,
  },
  comboDesc: { fontSize: 13, color: "var(--text-muted)", lineHeight: 1.4 },
  comboPriceRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  comboPriceLabel: { fontSize: 13, color: "var(--text-dim)" },
  comboPriceValue: { fontSize: 18, fontWeight: 700, color: "#3b82f6" },
  comboSavingsRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  comboOriginal: { fontSize: 12, color: "var(--text-dim)", textDecoration: "line-through" },
  comboSavingsBadge: {
    fontSize: 11, fontWeight: 700, color: "#4ade80",
    backgroundColor: "rgba(34,197,94,0.15)", padding: "2px 8px", borderRadius: 4,
  },
  comboItemsList: { display: "flex", flexWrap: "wrap", gap: 6 },
  comboItemChip: {
    fontSize: 12, color: "var(--text-muted)", backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)", padding: "3px 10px", borderRadius: 6,
  },
  comboActions: { display: "flex", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 10 },
  editBtn: {
    flex: 1, minHeight: 44, padding: "8px 12px", backgroundColor: "transparent",
    border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)",
    fontSize: 13, fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  deactivateBtn: {
    flex: 1, minHeight: 44, padding: "8px 12px", backgroundColor: "transparent",
    border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, color: "#f87171",
    fontSize: 13, fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  activateBtn: {
    flex: 1, minHeight: 44, padding: "8px 12px", backgroundColor: "transparent",
    border: "1px solid rgba(74,222,128,0.4)", borderRadius: 8, color: "#4ade80",
    fontSize: 13, fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },

  // Form
  formBody: {
    padding: "16px 20px", maxWidth: 600, margin: "0 auto", width: "100%",
    boxSizing: "border-box", display: "flex", flexDirection: "column",
  },
  label: {
    fontSize: 13, color: "var(--text-muted)", fontWeight: 600,
    margin: "14px 0 4px 0", textTransform: "uppercase",
  },
  input: {
    width: "100%", padding: "12px 14px", backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)",
    fontSize: 14, outline: "none", boxSizing: "border-box",
  },
  toggleStatusBtn: {
    minHeight: 44, padding: "8px 20px", border: "1px solid", borderRadius: 8,
    fontSize: 14, fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
    backgroundColor: "transparent",
  },

  // Savings box
  savingsBox: {
    marginTop: 12, padding: 12, backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)", borderRadius: 10,
    display: "flex", flexDirection: "column", gap: 6,
  },
  savingsRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  savingsLabel: { fontSize: 13, color: "var(--text-dim)" },
  savingsValue: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" },

  // Selected items
  selectedItems: {
    display: "flex", flexDirection: "column", gap: 6,
    maxHeight: 200, overflowY: "auto",
  },
  emptyHint: { fontSize: 13, color: "var(--text-dim)", padding: "12px 0", textAlign: "center" },
  selectedItemRow: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 12px", backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)", borderRadius: 8,
  },
  selectedItemInfo: { flex: 1, display: "flex", flexDirection: "column", gap: 2 },
  selectedItemName: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" },
  selectedItemPrice: { fontSize: 12, color: "var(--text-dim)" },
  qtyControls: { display: "flex", alignItems: "center", gap: 4 },
  qtyBtn: {
    minWidth: 44, minHeight: 44, background: "var(--bg-primary)",
    border: "1px solid var(--border)", borderRadius: 6,
    color: "var(--text-primary)", fontSize: 16, fontWeight: 700,
    cursor: "pointer", touchAction: "manipulation",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  qtyDisplay: { fontSize: 14, fontWeight: 700, minWidth: 24, textAlign: "center", color: "var(--text-primary)" },
  removeBtn: {
    minWidth: 44, minHeight: 44, background: "rgba(239,68,68,0.15)",
    border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6,
    color: "#f87171", fontSize: 13, fontWeight: 700,
    cursor: "pointer", touchAction: "manipulation",
    display: "flex", alignItems: "center", justifyContent: "center",
  },

  // Menu picker
  filterRow: {
    display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8,
  },
  filterChip: {
    minHeight: 44, padding: "4px 14px", backgroundColor: "transparent",
    border: "1px solid var(--border)", borderRadius: 8,
    color: "var(--text-muted)", fontSize: 12, fontWeight: 600,
    cursor: "pointer", touchAction: "manipulation", whiteSpace: "nowrap",
  },
  filterChipActive: {
    backgroundColor: "rgba(59,130,246,0.15)", borderColor: "#3b82f6", color: "#60a5fa",
  },
  menuPickerGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: 8, maxHeight: 260, overflowY: "auto", paddingBottom: 8,
  },
  menuPickerItem: {
    padding: "10px 12px", backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)", borderRadius: 8,
    cursor: "pointer", touchAction: "manipulation",
    display: "flex", flexDirection: "column", gap: 4, minHeight: 44,
    textAlign: "left",
  },
  menuPickerItemSelected: {
    borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.1)",
  },
  menuPickerName: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" },
  menuPickerPrice: { fontSize: 12, color: "var(--text-dim)" },
  menuPickerCheck: { fontSize: 11, fontWeight: 700, color: "#3b82f6" },

  errorBox: {
    marginTop: 8, padding: "10px 14px", backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444", borderRadius: 8, color: "#fca5a5", fontSize: 14,
    textAlign: "center",
  },
  saveBtn: {
    marginTop: 16, marginBottom: 24, width: "100%", minHeight: 48, padding: "12px 24px",
    backgroundColor: "#22c55e", border: "none", borderRadius: 12, color: "#fff",
    fontSize: 16, fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
  },
  disabled: { opacity: 0.5, cursor: "not-allowed" },
};
