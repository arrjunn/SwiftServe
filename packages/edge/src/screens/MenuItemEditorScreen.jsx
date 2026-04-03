import { useState, useEffect } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { formatINR, toPaise } from "@swiftserve/shared";
import { saveMenuItem, softDeleteMenuItem } from "../db/adminOps.js";

const GST_OPTIONS = [
  { label: "0%", value: 0 },
  { label: "5%", value: 500 },
  { label: "12%", value: 1200 },
  { label: "18%", value: 1800 },
  { label: "28%", value: 2800 },
];

const FOOD_TYPES = ["veg", "non-veg", "egg"];
const STATIONS = ["counter", "kitchen", "bar"];

export default function MenuItemEditorScreen({ itemId, categoryId, onSave, onBack }) {
  const { staff } = useAuth();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    name: "", shortName: "", categoryId: categoryId || "", priceRupees: "",
    gstRate: 500, hsnCode: "9963", foodType: "veg", station: "counter", prepTime: "5",
    variants: [], addons: [],
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    async function load() {
      const cats = await db.menu_categories
        .where("outlet_id").equals(OUTLET_ID)
        .filter((c) => c.is_active === 1)
        .sortBy("sort_order");
      setCategories(cats);

      if (itemId) {
        const item = await db.menu_items.get(itemId);
        if (item) {
          setForm({
            name: item.name,
            shortName: item.short_name || "",
            categoryId: item.category_id,
            priceRupees: (item.price / 100).toString(),
            gstRate: item.tax_rate || 500,
            hsnCode: item.hsn_code || "9963",
            foodType: item.food_type || "veg",
            station: item.station || "counter",
            prepTime: String(item.prep_time_mins || 5),
            variants: JSON.parse(item.variants || item.variants_json || "[]"),
            addons: JSON.parse(item.addons || item.addons_json || "[]"),
          });
        }
      } else if (categoryId) {
        setForm((f) => ({ ...f, categoryId }));
      }
    }
    load();
  }, [itemId, categoryId]);

  const handleSaveItem = async () => {
    setError("");
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.categoryId) { setError("Select a category"); return; }
    const price = toPaise(parseFloat(form.priceRupees));
    if (!price || price <= 0) { setError("Enter a valid price"); return; }

    setSaving(true);
    try {
      await saveMenuItem({
        id: itemId || undefined,
        name: form.name,
        shortName: form.shortName,
        categoryId: form.categoryId,
        price,
        gstRate: form.gstRate,
        hsnCode: form.hsnCode,
        foodType: form.foodType,
        station: form.station,
        prepTime: parseInt(form.prepTime) || 5,
        variants: form.variants,
        addons: form.addons,
      }, staff.id);
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await softDeleteMenuItem(itemId, staff.id);
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addVariant = () => setForm({ ...form, variants: [...form.variants, { name: "", price_add: "" }] });
  const removeVariant = (idx) => setForm({ ...form, variants: form.variants.filter((_, i) => i !== idx) });
  const updateVariant = (idx, field, val) => {
    const v = [...form.variants];
    v[idx] = { ...v[idx], [field]: val };
    setForm({ ...form, variants: v });
  };

  const addAddon = () => setForm({ ...form, addons: [...form.addons, { name: "", price: "" }] });
  const removeAddon = (idx) => setForm({ ...form, addons: form.addons.filter((_, i) => i !== idx) });
  const updateAddon = (idx, field, val) => {
    const a = [...form.addons];
    a[idx] = { ...a[idx], [field]: val };
    setForm({ ...form, addons: a });
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>{itemId ? "Edit Item" : "New Item"}</h1>

        <label style={styles.label}>Item Name</label>
        <input style={styles.input} value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Masala Dosa" />

        <label style={styles.label}>Short Name (KDS)</label>
        <input style={styles.input} value={form.shortName}
          onChange={(e) => setForm({ ...form, shortName: e.target.value })} placeholder="e.g. M.Dosa" maxLength={20} />

        <label style={styles.label}>Category</label>
        <select style={styles.select} value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
          <option value="">Select...</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Price (&#8377;)</label>
            <input style={styles.input} inputMode="decimal" value={form.priceRupees}
              onChange={(e) => setForm({ ...form, priceRupees: e.target.value })} placeholder="0.00" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>HSN Code</label>
            <input style={styles.input} value={form.hsnCode}
              onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} placeholder="9963" />
          </div>
        </div>

        <label style={styles.label}>GST Rate</label>
        <div style={styles.segmented}>
          {GST_OPTIONS.map((g) => (
            <button key={g.value}
              style={{ ...styles.segBtn, ...(form.gstRate === g.value ? styles.segBtnActive : {}) }}
              onClick={() => setForm({ ...form, gstRate: g.value })}>
              {g.label}
            </button>
          ))}
        </div>

        <label style={styles.label}>Food Type</label>
        <div style={styles.segmented}>
          {FOOD_TYPES.map((ft) => (
            <button key={ft}
              style={{ ...styles.segBtn, ...(form.foodType === ft ? styles.segBtnActive : {}) }}
              onClick={() => setForm({ ...form, foodType: ft })}>
              {ft === "non-veg" ? "Non-Veg" : ft.charAt(0).toUpperCase() + ft.slice(1)}
            </button>
          ))}
        </div>

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Station</label>
            <div style={styles.segmented}>
              {STATIONS.map((s) => (
                <button key={s}
                  style={{ ...styles.segBtn, ...(form.station === s ? styles.segBtnActive : {}) }}
                  onClick={() => setForm({ ...form, station: s })}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div style={{ width: 80 }}>
            <label style={styles.label}>Prep (min)</label>
            <input style={styles.input} inputMode="numeric" value={form.prepTime}
              onChange={(e) => setForm({ ...form, prepTime: e.target.value.replace(/\D/g, "") })} />
          </div>
        </div>

        {/* Variants */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Variants</span>
            <button style={styles.addSmallBtn} onClick={addVariant}>+ Add</button>
          </div>
          {form.variants.map((v, idx) => (
            <div key={idx} style={styles.variantRow}>
              <input style={{ ...styles.input, flex: 1 }} value={v.name} placeholder="Name"
                onChange={(e) => updateVariant(idx, "name", e.target.value)} />
              <input style={{ ...styles.input, width: 80 }} value={v.price_add} placeholder="+&#8377;"
                inputMode="decimal" onChange={(e) => updateVariant(idx, "price_add", e.target.value)} />
              <button style={styles.removeBtn} onClick={() => removeVariant(idx)}>X</button>
            </div>
          ))}
        </div>

        {/* Addons */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Add-ons</span>
            <button style={styles.addSmallBtn} onClick={addAddon}>+ Add</button>
          </div>
          {form.addons.map((a, idx) => (
            <div key={idx} style={styles.variantRow}>
              <input style={{ ...styles.input, flex: 1 }} value={a.name} placeholder="Name"
                onChange={(e) => updateAddon(idx, "name", e.target.value)} />
              <input style={{ ...styles.input, width: 80 }} value={a.price} placeholder="&#8377;"
                inputMode="decimal" onChange={(e) => updateAddon(idx, "price", e.target.value)} />
              <button style={styles.removeBtn} onClick={() => removeAddon(idx)}>X</button>
            </div>
          ))}
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <button style={{ ...styles.saveBtn, ...(saving ? styles.disabled : {}) }}
          onClick={handleSaveItem} disabled={saving}>
          {saving ? "Saving..." : "Save Item"}
        </button>

        {itemId && !showDelete && (
          <button style={styles.deleteBtn} onClick={() => setShowDelete(true)}>Delete Item</button>
        )}
        {showDelete && (
          <div style={styles.deleteConfirm}>
            <span style={{ color: "#fca5a5", fontSize: 13 }}>Are you sure?</span>
            <button style={styles.deleteConfirmBtn} onClick={handleDelete}>Yes, Delete</button>
            <button style={styles.deleteCancelBtn} onClick={() => setShowDelete(false)}>No</button>
          </div>
        )}

        <button style={styles.backBtn} onClick={onBack}>&#8592; Cancel</button>
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
    flexDirection: "column", margin: "20px 0",
  },
  title: { color: "var(--text-primary)", fontSize: 22, fontWeight: 700, margin: "0 0 16px 0", textAlign: "center" },
  label: { fontSize: 12, color: "var(--text-muted)", fontWeight: 600, margin: "12px 0 4px 0", textTransform: "uppercase" },
  input: {
    width: "100%", padding: "10px 12px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text-primary)", fontSize: 14, outline: "none", boxSizing: "border-box",
  },
  select: {
    width: "100%", padding: "10px 12px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text-primary)", fontSize: 14, outline: "none", boxSizing: "border-box",
  },
  row: { display: "flex", gap: 12 },
  segmented: { display: "flex", gap: 4 },
  segBtn: {
    flex: 1, minHeight: 44, padding: "8px 8px", backgroundColor: "transparent",
    border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", fontSize: 13,
    fontWeight: 600, cursor: "pointer", touchAction: "manipulation",
  },
  segBtnActive: { borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  section: { marginTop: 16, display: "flex", flexDirection: "column", gap: 6 },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" },
  addSmallBtn: {
    padding: "8px 14px", minHeight: 36, backgroundColor: "transparent", border: "1px solid var(--border-light)",
    borderRadius: 6, color: "var(--text-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer",
    touchAction: "manipulation",
  },
  variantRow: { display: "flex", gap: 6, alignItems: "center" },
  removeBtn: {
    width: 36, height: 36, backgroundColor: "transparent", border: "1px solid rgba(239,68,68,0.4)",
    borderRadius: 4, color: "#f87171", fontSize: 12, cursor: "pointer", display: "flex",
    alignItems: "center", justifyContent: "center", flexShrink: 0, touchAction: "manipulation",
  },
  errorBox: {
    marginTop: 12, padding: "10px 14px", backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444", borderRadius: 8, color: "#fca5a5", fontSize: 14,
    textAlign: "center",
  },
  saveBtn: {
    marginTop: 20, width: "100%", minHeight: 48, padding: "12px 24px",
    backgroundColor: "#22c55e", border: "none", borderRadius: 12, color: "#fff",
    fontSize: 16, fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
  },
  disabled: { opacity: 0.5, cursor: "not-allowed" },
  deleteBtn: {
    marginTop: 10, width: "100%", minHeight: 40, padding: "8px 20px",
    backgroundColor: "transparent", border: "1px solid rgba(239,68,68,0.4)",
    borderRadius: 8, color: "#f87171", fontSize: 14, fontWeight: 600,
    cursor: "pointer", touchAction: "manipulation",
  },
  deleteConfirm: { marginTop: 10, display: "flex", gap: 8, alignItems: "center", justifyContent: "center" },
  deleteConfirmBtn: {
    padding: "6px 16px", backgroundColor: "#dc2626", border: "none", borderRadius: 6,
    color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  deleteCancelBtn: {
    padding: "6px 16px", backgroundColor: "transparent", border: "1px solid var(--border-light)",
    borderRadius: 6, color: "var(--text-muted)", fontSize: 13, cursor: "pointer",
  },
  backBtn: {
    marginTop: 12, width: "100%", minHeight: 44, padding: "10px 24px",
    backgroundColor: "transparent", border: "1px solid var(--border)", borderRadius: 10,
    color: "var(--text-muted)", fontSize: 14, fontWeight: 600, cursor: "pointer",
    touchAction: "manipulation",
  },
};
