import { db } from "./index.js";

let OUTLET_ID = "outlet-001";

// Pre-computed bcrypt hashes (avoids async bcrypt.hash which can fail in some bundler configs)
// All staff use the same PIN: 1234
const UNIVERSAL_PIN_HASH = "$2a$10$Fs2S0sJP2M0wpkbLlcX54u0wyHRs2BO1ZngYpd9/pjw4t2bHvUTcC"; // 1234
const PIN_HASHES = {
  owner:   UNIVERSAL_PIN_HASH,
  staff1:  UNIVERSAL_PIN_HASH,
  staff2:  UNIVERSAL_PIN_HASH,
  kitchen: UNIVERSAL_PIN_HASH,
  captain: UNIVERSAL_PIN_HASH,
};

// Fixed IDs so seed is fully idempotent (put won't fail on duplicates)
const IDS = {
  owner: "staff-owner-001",
  staff1: "staff-counter-001",
  staff2: "staff-counter-002",
  kitchen: "staff-kitchen-001",
  captain: "staff-captain-001",
  catBurgers: "cat-burgers",
  catWraps: "cat-wraps",
  catSides: "cat-sides",
  catBeverages: "cat-beverages",
  catDesserts: "cat-desserts",
  catCombos: "cat-combos",
};

/**
 * Singleton to prevent StrictMode double-invoke race.
 */
let _seedPromise = null;
export function seedDatabase() {
  if (!_seedPromise) {
    _seedPromise = _doSeed().catch((err) => {
      _seedPromise = null;
      throw err;
    });
  }
  return _seedPromise;
}

async function _doSeed() {
  const now = new Date().toISOString();

  // Check if already seeded
  try {
    const count = await db.staff.count();
    if (count > 0) {
      console.log("[SEED] Already seeded (" + count + " staff).");
      return false;
    }
  } catch (e) {
    console.warn("[SEED] Count check error:", e.message);
    // Continue to seed anyway
  }

  console.log("[SEED] Seeding database...");

  // ─── OUTLET (put = upsert, never fails on duplicate) ───
  await db.outlets.put({
    id: OUTLET_ID,
    name: "SwiftServe Demo Outlet",
    brand_name: "SwiftServe",
    address_line1: "123, MG Road",
    address_line2: "Near City Mall",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    gstin: "27AABCS1234A1Z5",
    fssai_number: "12345678901234",
    phone: "9876543210",
    email: "demo@swiftserve.in",
    timezone: "Asia/Kolkata",
    is_active: 1,
    subscription_plan: "growth",
    invoice_prefix: "SS-MUM-",
    next_invoice_seq: 1,
    next_order_seq: 1,
    upi_vpa: "swiftserve@upi",
    schema_version: 1,
    created_at: now,
    updated_at: now,
  });
  console.log("[SEED] Outlet added.");

  // ─── STAFF (put = upsert) ───
  const staffRecords = [
    { id: IDS.owner, outlet_id: OUTLET_ID, name: "Amit (Owner)", phone: "", role: "owner", pin_hash: PIN_HASHES.owner, is_active: 1, permissions: "{}", must_change_pin: 1, created_at: now, updated_at: now },
    { id: IDS.staff2, outlet_id: OUTLET_ID, name: "Priya", phone: "", role: "counter", pin_hash: PIN_HASHES.staff2, is_active: 1, permissions: "{}", must_change_pin: 1, created_at: now, updated_at: now },
    { id: IDS.kitchen, outlet_id: OUTLET_ID, name: "Suresh (Kitchen)", phone: "", role: "kitchen", pin_hash: PIN_HASHES.kitchen, is_active: 1, permissions: "{}", must_change_pin: 1, created_at: now, updated_at: now },
    { id: IDS.captain, outlet_id: OUTLET_ID, name: "Deepak (Captain)", phone: "", role: "captain", pin_hash: PIN_HASHES.captain, is_active: 1, permissions: "{}", must_change_pin: 1, created_at: now, updated_at: now },
  ];
  for (const s of staffRecords) {
    await db.staff.put(s);
  }
  console.log("[SEED] Staff added (" + staffRecords.length + ").");

  // ─── MENU CATEGORIES ───
  const categories = [
    { id: IDS.catBurgers, outlet_id: OUTLET_ID, name: "Burgers", sort_order: 1, is_active: 1, created_at: now, updated_at: now },
    { id: IDS.catWraps, outlet_id: OUTLET_ID, name: "Wraps & Rolls", sort_order: 2, is_active: 1, created_at: now, updated_at: now },
    { id: IDS.catSides, outlet_id: OUTLET_ID, name: "Sides", sort_order: 3, is_active: 1, created_at: now, updated_at: now },
    { id: IDS.catBeverages, outlet_id: OUTLET_ID, name: "Beverages", sort_order: 4, is_active: 1, created_at: now, updated_at: now },
    { id: IDS.catDesserts, outlet_id: OUTLET_ID, name: "Desserts", sort_order: 5, is_active: 1, created_at: now, updated_at: now },
    { id: IDS.catCombos, outlet_id: OUTLET_ID, name: "Combos", sort_order: 6, is_active: 1, created_at: now, updated_at: now },
  ];
  for (const c of categories) {
    await db.menu_categories.put(c);
  }
  console.log("[SEED] Categories added.");

  // ─── MENU ITEMS ───
  const items = [
    { cat: IDS.catBurgers, name: "Classic Veg Burger", short: "Veg Burger", price: 12900, type: "veg", station: "grill", prep: 8 },
    { cat: IDS.catBurgers, name: "Paneer Tikka Burger", short: "Pnr Tikka", price: 15900, type: "veg", station: "grill", prep: 10 },
    { cat: IDS.catBurgers, name: "Chicken Burger", short: "Chk Burger", price: 14900, type: "non_veg", station: "grill", prep: 10 },
    { cat: IDS.catBurgers, name: "Double Chicken Burger", short: "Dbl Chk", price: 19900, type: "non_veg", station: "grill", prep: 12 },
    { cat: IDS.catBurgers, name: "Aloo Tikki Burger", short: "Aloo Tkki", price: 9900, type: "veg", station: "grill", prep: 7 },
    { cat: IDS.catWraps, name: "Paneer Kathi Roll", short: "Pnr Roll", price: 13900, type: "veg", station: "grill", prep: 8 },
    { cat: IDS.catWraps, name: "Chicken Kathi Roll", short: "Chk Roll", price: 15900, type: "non_veg", station: "grill", prep: 9 },
    { cat: IDS.catWraps, name: "Egg Roll", short: "Egg Roll", price: 11900, type: "egg", station: "grill", prep: 7 },
    { cat: IDS.catWraps, name: "Veg Frankie", short: "Veg Frank", price: 10900, type: "veg", station: "grill", prep: 6 },
    { cat: IDS.catSides, name: "French Fries", short: "Fries", price: 7900, type: "veg", station: "fryer", prep: 5 },
    { cat: IDS.catSides, name: "Peri Peri Fries", short: "PP Fries", price: 9900, type: "veg", station: "fryer", prep: 5 },
    { cat: IDS.catSides, name: "Chicken Nuggets (6pc)", short: "Nuggets", price: 12900, type: "non_veg", station: "fryer", prep: 6 },
    { cat: IDS.catSides, name: "Onion Rings", short: "Onion Rng", price: 8900, type: "veg", station: "fryer", prep: 5 },
    { cat: IDS.catSides, name: "Coleslaw", short: "Coleslaw", price: 5900, type: "veg", station: "assembly", prep: 2 },
    { cat: IDS.catBeverages, name: "Coke 300ml", short: "Coke", price: 4900, type: "veg", station: "assembly", prep: 1 },
    { cat: IDS.catBeverages, name: "Sprite 300ml", short: "Sprite", price: 4900, type: "veg", station: "assembly", prep: 1 },
    { cat: IDS.catBeverages, name: "Fresh Lime Soda", short: "Lime Soda", price: 6900, type: "veg", station: "assembly", prep: 3 },
    { cat: IDS.catBeverages, name: "Mango Lassi", short: "Mng Lassi", price: 7900, type: "veg", station: "assembly", prep: 3 },
    { cat: IDS.catBeverages, name: "Cold Coffee", short: "Cold Coff", price: 8900, type: "veg", station: "assembly", prep: 4 },
    { cat: IDS.catBeverages, name: "Masala Chai", short: "Chai", price: 3900, type: "veg", station: "assembly", prep: 3 },
    { cat: IDS.catDesserts, name: "Chocolate Brownie", short: "Brownie", price: 8900, type: "veg", station: "assembly", prep: 2 },
    { cat: IDS.catDesserts, name: "Gulab Jamun (2pc)", short: "Gulab J", price: 6900, type: "veg", station: "assembly", prep: 2 },
    { cat: IDS.catDesserts, name: "Kulfi", short: "Kulfi", price: 5900, type: "veg", station: "assembly", prep: 1 },
    { cat: IDS.catCombos, name: "Veg Burger + Fries + Coke", short: "Veg Combo", price: 22900, type: "veg", station: "assembly", prep: 10 },
    { cat: IDS.catCombos, name: "Chicken Burger + Fries + Coke", short: "Chk Combo", price: 25900, type: "non_veg", station: "assembly", prep: 12 },
    { cat: IDS.catCombos, name: "Roll + Fries + Drink", short: "Roll Combo", price: 21900, type: "veg", station: "assembly", prep: 10 },
  ];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    await db.menu_items.put({
      id: `menu-item-${String(i + 1).padStart(3, "0")}`,
      outlet_id: OUTLET_ID,
      category_id: item.cat,
      name: item.name,
      short_name: item.short,
      description: "",
      price: item.price,
      tax_rate: 500,
      hsn_code: "9963",
      food_type: item.type,
      is_available: 1,
      is_active: 1,
      prep_time_mins: item.prep,
      station: item.station,
      sort_order: i + 1,
      image_url: "",
      tags: "[]",
      variants: "[]",
      addons: "[]",
      created_at: now,
      updated_at: now,
    });
  }
  console.log("[SEED] Menu items added (" + items.length + ").");

  // ─── TABLES (20 tables across 3 sections) ───
  const tableSections = [
    // Main hall: T1-T10
    ...Array.from({ length: 10 }, (_, i) => ({ num: i + 1, section: "main", capacity: i < 4 ? 4 : i < 8 ? 2 : 6 })),
    // Patio: T11-T16
    ...Array.from({ length: 6 }, (_, i) => ({ num: i + 11, section: "patio", capacity: i < 3 ? 4 : 2 })),
    // Private: T17-T20
    ...Array.from({ length: 4 }, (_, i) => ({ num: i + 17, section: "private", capacity: 6 })),
  ];
  for (const t of tableSections) {
    await db.floor_tables.put({
      id: `table-${String(t.num).padStart(3, "0")}`,
      outlet_id: OUTLET_ID,
      table_number: `T${t.num}`,
      section: t.section,
      capacity: t.capacity,
      status: "available",
      current_order_id: null,
      sort_order: t.num,
      created_at: now,
      updated_at: now,
    });
  }
  console.log("[SEED] 20 tables added (main, patio, private).");

  // ─── PROMOS ───
  const promos = [
    { id: "promo-flat50", outlet_id: OUTLET_ID, name: "Flat ₹50 Off", coupon_code: "FLAT50", type: "flat", value: 5000, min_order: 20000, max_discount: 5000, applies_to: "all", applies_to_ids: "[]", starts_at: "2024-01-01T00:00:00.000Z", expires_at: "2027-12-31T23:59:59.000Z", usage_limit: 0, used_count: 0, is_active: 1, created_at: now, updated_at: now },
    { id: "promo-save10", outlet_id: OUTLET_ID, name: "Save 10%", coupon_code: "SAVE10", type: "percent", value: 1000, min_order: 10000, max_discount: 10000, applies_to: "all", applies_to_ids: "[]", starts_at: "2024-01-01T00:00:00.000Z", expires_at: "2027-12-31T23:59:59.000Z", usage_limit: 100, used_count: 0, is_active: 1, created_at: now, updated_at: now },
    { id: "promo-vip20", outlet_id: OUTLET_ID, name: "VIP 20% Off", coupon_code: "VIP20", type: "percent", value: 2000, min_order: 0, max_discount: 0, applies_to: "all", applies_to_ids: "[]", starts_at: "2024-01-01T00:00:00.000Z", expires_at: "2027-12-31T23:59:59.000Z", usage_limit: 0, used_count: 0, is_active: 1, created_at: now, updated_at: now },
  ];
  for (const p of promos) {
    await db.promos.put(p);
  }
  console.log("[SEED] Promos added (" + promos.length + ").");

  // ─── SYNC META ───
  await db.sync_meta.put({
    id: "singleton",
    last_push_at: null,
    last_pull_at: null,
    device_id: `device-${Date.now().toString(36)}`,
    schema_version: 1,
    pending_count: 0,
  });

  console.log("[SEED] ✓ Database seeded successfully.");
  // Only show PINs in development — never in production builds
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    console.log("[SEED] Dev PIN — All staff: 1234");
  }
  return true;
}

/**
 * Resolve the real outlet ID from DB. Must be called during startup
 * BEFORE any screen renders. Updates the exported OUTLET_ID so all
 * 23+ files that import it get the correct value.
 */
export async function resolveOutletId() {
  try {
    // Check if seeded outlet exists
    const seeded = await db.outlets.get("outlet-001");
    if (seeded) { OUTLET_ID = "outlet-001"; return OUTLET_ID; }
    // Otherwise find the first outlet (Supabase-created)
    const first = await db.outlets.toCollection().first();
    if (first) { OUTLET_ID = first.id; return first.id; }
  } catch (_) { /* ignore */ }
  return OUTLET_ID;
}

export { OUTLET_ID };
