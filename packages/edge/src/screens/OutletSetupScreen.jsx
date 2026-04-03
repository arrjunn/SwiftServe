import { useState } from "react";
import { useSupabaseAuth } from "../contexts/SupabaseAuthContext.jsx";
import { db } from "../db/index.js";
import bcrypt from "bcryptjs";
import { isValidPhone, isValidPincode, isValidGSTIN, isValidFSSAI, isValidUPI } from "@swiftserve/shared";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

const DEFAULT_CATEGORIES = [
  { name: "Burgers", sort_order: 1 },
  { name: "Wraps", sort_order: 2 },
  { name: "Sides", sort_order: 3 },
  { name: "Beverages", sort_order: 4 },
  { name: "Desserts", sort_order: 5 },
  { name: "Combos", sort_order: 6 },
];

export default function OutletSetupScreen({ onSetupComplete }) {
  const { user } = useSupabaseAuth();

  const [form, setForm] = useState({
    name: "SwiftServe Demo Restaurant",
    address_line1: "123, MG Road",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    phone: "9876543210",
    email: user?.email || "demo@swiftserve.in",
    gstin: "",
    fssai_number: "",
    upi_vpa: "",
  });

  const [ownerPin, setOwnerPin] = useState("1234");
  const [confirmPin, setConfirmPin] = useState("1234");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const update = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  };

  const validate = () => {
    if (!form.name.trim()) return "Restaurant name is required.";
    if (!form.address_line1.trim()) return "Address is required.";
    if (!form.city.trim()) return "City is required.";
    if (!form.state) return "Please select a state.";
    if (!form.pincode.trim()) return "Pincode is required.";
    if (!isValidPincode(form.pincode)) return "Pincode must be 6 digits.";
    if (!form.phone.trim()) return "Phone number is required.";
    if (!isValidPhone(form.phone)) return "Phone must be 10 digits.";
    if (form.gstin && !isValidGSTIN(form.gstin)) return "Invalid GSTIN format (15 characters).";
    if (form.fssai_number && !isValidFSSAI(form.fssai_number)) return "FSSAI number must be 14 digits.";
    if (form.upi_vpa && !isValidUPI(form.upi_vpa)) return "Invalid UPI VPA format.";
    if (!ownerPin || ownerPin.length < 4) return "Owner PIN must be at least 4 digits.";
    if (ownerPin !== confirmPin) return "PINs do not match.";
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const now = new Date().toISOString();
      const outletId = crypto.randomUUID();
      const staffId = crypto.randomUUID();
      const pinHash = await bcrypt.hash(ownerPin, 10);

      await db.transaction("rw", ["outlets", "staff", "menu_categories", "menu_items", "audit_log"], async () => {
        // Create outlet
        await db.outlets.add({
          id: outletId,
          owner_user_id: user.id,
          name: form.name.trim(),
          address_line1: form.address_line1.trim(),
          city: form.city.trim(),
          state: form.state,
          pincode: form.pincode.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || null,
          gstin: form.gstin.trim().toUpperCase() || null,
          fssai_number: form.fssai_number.trim() || null,
          upi_vpa: form.upi_vpa.trim() || null,
          invoice_prefix: "SS-",
          next_invoice_seq: 1,
          default_tax_rate: 500,
          created_at: now,
          updated_at: now,
        });

        // Create owner staff record
        await db.staff.add({
          id: staffId,
          outlet_id: outletId,
          name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Owner",
          role: "owner",
          pin_hash: pinHash,
          is_active: 1,
          permissions: null,
          created_at: now,
          updated_at: now,
        });

        // Seed default menu categories
        for (const cat of DEFAULT_CATEGORIES) {
          await db.menu_categories.add({
            id: crypto.randomUUID(),
            outlet_id: outletId,
            name: cat.name,
            sort_order: cat.sort_order,
            is_active: 1,
            created_at: now,
            updated_at: now,
          });
        }

        // Add demo staff (counter, kitchen, captain) with same PIN
        const demoStaff = [
          { name: "Priya (Counter)", role: "counter" },
          { name: "Suresh (Kitchen)", role: "kitchen" },
          { name: "Deepak (Captain)", role: "captain" },
        ];
        for (const ds of demoStaff) {
          await db.staff.add({
            id: crypto.randomUUID(),
            outlet_id: outletId,
            name: ds.name,
            role: ds.role,
            pin_hash: pinHash, // same PIN as owner
            is_active: 1,
            permissions: null,
            created_at: now,
            updated_at: now,
          });
        }

        // Seed full demo menu across all categories
        const cats = await db.menu_categories.where("outlet_id").equals(outletId).sortBy("sort_order");
        const catMap = {};
        for (const c of cats) catMap[c.name] = c.id;

        const demoMenu = [
          // Burgers
          { cat: "Burgers", name: "Classic Veg Burger", short: "Veg Burger", price: 12900, type: "veg", station: "grill", prep: 8 },
          { cat: "Burgers", name: "Paneer Tikka Burger", short: "Pnr Tikka", price: 15900, type: "veg", station: "grill", prep: 10 },
          { cat: "Burgers", name: "Chicken Burger", short: "Chk Burger", price: 14900, type: "non_veg", station: "grill", prep: 10 },
          { cat: "Burgers", name: "Double Chicken Burger", short: "Dbl Chk", price: 19900, type: "non_veg", station: "grill", prep: 12 },
          { cat: "Burgers", name: "Aloo Tikki Burger", short: "Aloo Tkki", price: 9900, type: "veg", station: "grill", prep: 7 },
          // Wraps
          { cat: "Wraps", name: "Paneer Kathi Roll", short: "Pnr Roll", price: 13900, type: "veg", station: "grill", prep: 8 },
          { cat: "Wraps", name: "Chicken Kathi Roll", short: "Chk Roll", price: 15900, type: "non_veg", station: "grill", prep: 9 },
          { cat: "Wraps", name: "Egg Roll", short: "Egg Roll", price: 11900, type: "egg", station: "grill", prep: 7 },
          { cat: "Wraps", name: "Veg Frankie", short: "Veg Frank", price: 10900, type: "veg", station: "grill", prep: 6 },
          // Sides
          { cat: "Sides", name: "French Fries", short: "Fries", price: 7900, type: "veg", station: "fryer", prep: 5 },
          { cat: "Sides", name: "Peri Peri Fries", short: "PP Fries", price: 9900, type: "veg", station: "fryer", prep: 5 },
          { cat: "Sides", name: "Chicken Nuggets (6pc)", short: "Nuggets", price: 12900, type: "non_veg", station: "fryer", prep: 6 },
          { cat: "Sides", name: "Onion Rings", short: "Onion Rng", price: 8900, type: "veg", station: "fryer", prep: 5 },
          { cat: "Sides", name: "Coleslaw", short: "Coleslaw", price: 5900, type: "veg", station: "assembly", prep: 2 },
          // Beverages
          { cat: "Beverages", name: "Coke 300ml", short: "Coke", price: 4900, type: "veg", station: "assembly", prep: 1 },
          { cat: "Beverages", name: "Sprite 300ml", short: "Sprite", price: 4900, type: "veg", station: "assembly", prep: 1 },
          { cat: "Beverages", name: "Fresh Lime Soda", short: "Lime Soda", price: 6900, type: "veg", station: "assembly", prep: 3 },
          { cat: "Beverages", name: "Mango Lassi", short: "Mng Lassi", price: 7900, type: "veg", station: "assembly", prep: 3 },
          { cat: "Beverages", name: "Cold Coffee", short: "Cold Coff", price: 8900, type: "veg", station: "assembly", prep: 4 },
          { cat: "Beverages", name: "Masala Chai", short: "Chai", price: 3900, type: "veg", station: "assembly", prep: 3 },
          // Desserts
          { cat: "Desserts", name: "Chocolate Brownie", short: "Brownie", price: 8900, type: "veg", station: "assembly", prep: 2 },
          { cat: "Desserts", name: "Gulab Jamun (2pc)", short: "Gulab J", price: 6900, type: "veg", station: "assembly", prep: 2 },
          { cat: "Desserts", name: "Kulfi", short: "Kulfi", price: 5900, type: "veg", station: "assembly", prep: 1 },
          // Combos
          { cat: "Combos", name: "Veg Burger + Fries + Coke", short: "Veg Combo", price: 22900, type: "veg", station: "assembly", prep: 10 },
          { cat: "Combos", name: "Chicken Burger + Fries + Coke", short: "Chk Combo", price: 25900, type: "non_veg", station: "assembly", prep: 12 },
          { cat: "Combos", name: "Roll + Fries + Drink", short: "Roll Combo", price: 21900, type: "veg", station: "assembly", prep: 10 },
        ];

        const fallbackCat = cats[0]?.id;
        for (let i = 0; i < demoMenu.length; i++) {
          const di = demoMenu[i];
          await db.menu_items.add({
            id: crypto.randomUUID(),
            outlet_id: outletId,
            category_id: catMap[di.cat] || fallbackCat,
            name: di.name, short_name: di.short,
            price: di.price, tax_rate: 500, hsn_code: "9963",
            food_type: di.type, is_available: 1, is_active: 1,
            prep_time_mins: di.prep, station: di.station, sort_order: i + 1,
            variants: "[]", addons: "[]", tags: "[]",
            created_at: now, updated_at: now,
          });
        }

        // Audit log entry
        await db.audit_log.add({
          id: crypto.randomUUID(),
          outlet_id: outletId,
          staff_id: staffId,
          action: "outlet_created",
          entity_type: "outlet",
          entity_id: outletId,
          old_value: null,
          new_value: JSON.stringify({ name: form.name.trim() }),
          created_at: now,
          synced_at: null,
        });
      });

      if (onSetupComplete) {
        onSetupComplete(outletId);
      }
    } catch (err) {
      setError(err.message || "Setup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Set Up Your Restaurant</h1>
        <p style={styles.subtitle}>
          Complete the details below to get started with SwiftServe.
        </p>

        <div style={styles.fields}>
          <Field
            label="Restaurant Name *"
            value={form.name}
            onChange={(v) => update("name", v)}
            placeholder="e.g. Burger Palace"
          />
          <Field
            label="Address Line 1 *"
            value={form.address_line1}
            onChange={(v) => update("address_line1", v)}
            placeholder="e.g. 42, MG Road"
          />
          <Field
            label="City *"
            value={form.city}
            onChange={(v) => update("city", v)}
            placeholder="e.g. Bengaluru"
          />

          <div>
            <label style={styles.label}>State *</label>
            <select
              style={styles.select}
              value={form.state}
              onChange={(e) => update("state", e.target.value)}
            >
              <option value="">Select state</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <Field
            label="Pincode *"
            value={form.pincode}
            onChange={(v) => update("pincode", v)}
            inputMode="numeric"
            maxLength={6}
            placeholder="e.g. 560001"
          />
          <Field
            label="Phone *"
            value={form.phone}
            onChange={(v) => update("phone", v)}
            inputMode="numeric"
            maxLength={10}
            placeholder="e.g. 9876543210"
          />
          <Field
            label="Email"
            value={form.email}
            onChange={(v) => update("email", v)}
            placeholder="restaurant@example.com"
          />

          <div style={styles.sectionDivider}>
            <span style={styles.sectionLabel}>Tax & Compliance (optional)</span>
          </div>

          <Field
            label="GSTIN"
            value={form.gstin}
            onChange={(v) => update("gstin", v.toUpperCase())}
            maxLength={15}
            placeholder="e.g. 29ABCDE1234F1Z5"
          />
          <Field
            label="FSSAI Number"
            value={form.fssai_number}
            onChange={(v) => update("fssai_number", v)}
            inputMode="numeric"
            maxLength={14}
            placeholder="14-digit license number"
          />
          <Field
            label="UPI VPA"
            value={form.upi_vpa}
            onChange={(v) => update("upi_vpa", v)}
            placeholder="e.g. store@upi"
          />

          <div style={styles.sectionDivider}>
            <span style={styles.sectionLabel}>Owner PIN</span>
          </div>

          <Field
            label="Set Owner PIN *"
            value={ownerPin}
            onChange={(v) => setOwnerPin(v)}
            inputMode="numeric"
            maxLength={6}
            placeholder="Min 4 digits"
            type="password"
          />
          <Field
            label="Confirm PIN *"
            value={confirmPin}
            onChange={(v) => setConfirmPin(v)}
            inputMode="numeric"
            maxLength={6}
            placeholder="Re-enter PIN"
            type="password"
          />
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <button
          style={{ ...styles.submitBtn, ...(loading ? styles.disabled : {}) }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? "Setting up..." : "Get Started"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, inputMode, maxLength, placeholder, type }) {
  return (
    <div>
      <label style={styles.label}>{label}</label>
      <input
        style={styles.input}
        type={type || "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
      />
    </div>
  );
}

const styles = {
  container: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "var(--bg-primary)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: 16,
    paddingTop: 32,
    paddingBottom: 32,
    color: "var(--text-primary)",
    overflowY: "auto",
  },
  card: {
    backgroundColor: "var(--bg-secondary)",
    borderRadius: 16,
    padding: 28,
    width: "100%",
    maxWidth: 520,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    display: "flex",
    flexDirection: "column",
  },
  title: {
    color: "var(--text-primary)",
    fontSize: 24,
    fontWeight: 700,
    margin: "0 0 4px 0",
    textAlign: "center",
  },
  subtitle: {
    color: "var(--text-muted)",
    fontSize: 14,
    margin: "0 0 20px 0",
    textAlign: "center",
  },
  fields: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  label: {
    display: "block",
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 600,
    margin: "10px 0 4px 0",
    textTransform: "uppercase",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    minHeight: 44,
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    minHeight: 44,
    appearance: "auto",
  },
  sectionDivider: {
    marginTop: 16,
    marginBottom: 4,
    borderTop: "1px solid var(--border)",
    paddingTop: 12,
  },
  sectionLabel: {
    fontSize: 13,
    color: "var(--text-dim)",
    fontWeight: 600,
  },
  errorBox: {
    marginTop: 12,
    padding: "10px 14px",
    backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444",
    borderRadius: 8,
    color: "#fca5a5",
    fontSize: 14,
    textAlign: "center",
  },
  submitBtn: {
    marginTop: 20,
    width: "100%",
    minHeight: 48,
    padding: "12px 24px",
    backgroundColor: "#22c55e",
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  disabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
};
