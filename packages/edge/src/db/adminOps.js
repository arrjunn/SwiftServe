/**
 * Admin operations — staff CRUD, menu/category management, outlet settings.
 * All money in integer paise. All IDs are UUIDs.
 */
import { db } from "./index.js";
import { OUTLET_ID } from "./seed.js";
import bcrypt from "bcryptjs";

// ─── Role Verification ───────────────────────────────────────

const ADMIN_ROLES = ["owner"];

async function requireAdminRole(staffId) {
  const staff = await db.staff.get(staffId);
  if (!staff) throw new Error("Staff not found");
  if (!ADMIN_ROLES.includes(staff.role)) {
    throw new Error("Insufficient permissions: owner role required");
  }
  return staff;
}

// ─── Staff Management ────────────────────────────────────────

/**
 * Create a new staff member.
 * @param {{ name, phone, role, pin }} data
 * @param {string} actingStaffId - who is performing this action
 */
export async function createStaff(data, actingStaffId) {
  await requireAdminRole(actingStaffId);
  const now = new Date().toISOString();
  const pinHash = bcrypt.hashSync(data.pin, 10);
  const id = crypto.randomUUID();

  await db.transaction("rw", ["staff", "audit_log"], async () => {
    await db.staff.add({
      id,
      outlet_id: OUTLET_ID,
      name: data.name.trim(),
      phone: data.phone.trim(),
      role: data.role,
      pin_hash: pinHash,
      is_active: 1,
      created_at: now,
      updated_at: now,
      synced_at: null,
      deleted_at: null,
    });

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: "staff_create",
      entity_type: "staff",
      entity_id: id,
      old_value: null,
      new_value: JSON.stringify({ name: data.name, role: data.role }),
      created_at: now,
      synced_at: null,
    });
  });

  return id;
}

/**
 * Update an existing staff member. Re-hashes PIN if changed.
 * @param {string} staffId
 * @param {Object} changes - { name?, phone?, role?, pin? }
 * @param {string} actingStaffId
 */
export async function updateStaff(staffId, changes, actingStaffId) {
  await requireAdminRole(actingStaffId);
  const now = new Date().toISOString();

  await db.transaction("rw", ["staff", "audit_log"], async () => {
    const existing = await db.staff.get(staffId);
    if (!existing) throw new Error("Staff not found");

    const updates = { updated_at: now };
    if (changes.name != null) updates.name = changes.name.trim();
    if (changes.phone != null) updates.phone = changes.phone.trim();
    if (changes.role != null) updates.role = changes.role;
    if (changes.pin) updates.pin_hash = bcrypt.hashSync(changes.pin, 10);

    await db.staff.update(staffId, updates);

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: "staff_update",
      entity_type: "staff",
      entity_id: staffId,
      old_value: JSON.stringify({ name: existing.name, role: existing.role }),
      new_value: JSON.stringify({ name: updates.name || existing.name, role: updates.role || existing.role }),
      created_at: now,
      synced_at: null,
    });
  });
}

/**
 * Deactivate a staff member. Prevents deactivating the last owner.
 */
export async function deactivateStaff(staffId, actingStaffId) {
  await requireAdminRole(actingStaffId);
  const now = new Date().toISOString();

  await db.transaction("rw", ["staff", "audit_log"], async () => {
    const staff = await db.staff.get(staffId);
    if (!staff) throw new Error("Staff not found");

    if (staff.role === "owner") {
      const activeOwners = await db.staff
        .where("role").equals("owner")
        .filter((s) => s.is_active === 1)
        .count();
      if (activeOwners <= 1) throw new Error("Cannot deactivate the last owner");
    }

    await db.staff.update(staffId, { is_active: 0, updated_at: now });

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: "staff_deactivate",
      entity_type: "staff",
      entity_id: staffId,
      old_value: JSON.stringify({ is_active: 1 }),
      new_value: JSON.stringify({ is_active: 0 }),
      created_at: now,
      synced_at: null,
    });
  });
}

/**
 * Reactivate a deactivated staff member.
 */
export async function reactivateStaff(staffId, actingStaffId) {
  await requireAdminRole(actingStaffId);
  const now = new Date().toISOString();

  await db.transaction("rw", ["staff", "audit_log"], async () => {
    await db.staff.update(staffId, { is_active: 1, updated_at: now });

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: "staff_reactivate",
      entity_type: "staff",
      entity_id: staffId,
      old_value: JSON.stringify({ is_active: 0 }),
      new_value: JSON.stringify({ is_active: 1 }),
      created_at: now,
      synced_at: null,
    });
  });
}

/**
 * Get all staff for the outlet.
 */
export async function getStaffList() {
  const staff = await db.staff
    .where("outlet_id").equals(OUTLET_ID)
    .toArray();
  // Strip pin_hash from results — never expose to UI
  return staff.map(({ pin_hash, ...rest }) => rest);
}

// ─── Category Management ─────────────────────────────────────

/**
 * Create a new menu category with auto sort_order.
 */
export async function createCategory(name, actingStaffId) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db.transaction("rw", ["menu_categories", "audit_log"], async () => {
    const all = await db.menu_categories
      .where("outlet_id").equals(OUTLET_ID)
      .toArray();
    const maxSort = all.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);

    await db.menu_categories.add({
      id,
      outlet_id: OUTLET_ID,
      name: name.trim(),
      sort_order: maxSort + 1,
      is_active: 1,
      created_at: now,
      updated_at: now,
      synced_at: null,
      deleted_at: null,
    });

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: "category_create",
      entity_type: "menu_category",
      entity_id: id,
      old_value: null,
      new_value: JSON.stringify({ name }),
      created_at: now,
      synced_at: null,
    });
  });

  return id;
}

/**
 * Reorder a category up or down.
 * @param {string} categoryId
 * @param {"up"|"down"} direction
 */
export async function reorderCategory(categoryId, direction, actingStaffId) {
  const now = new Date().toISOString();

  await db.transaction("rw", ["menu_categories", "audit_log"], async () => {
    const all = await db.menu_categories
      .where("outlet_id").equals(OUTLET_ID)
      .sortBy("sort_order");

    const idx = all.findIndex((c) => c.id === categoryId);
    if (idx === -1) throw new Error("Category not found");

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= all.length) return; // already at boundary

    const current = all[idx];
    const neighbor = all[swapIdx];

    await db.menu_categories.update(current.id, { sort_order: neighbor.sort_order, updated_at: now });
    await db.menu_categories.update(neighbor.id, { sort_order: current.sort_order, updated_at: now });

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: "category_reorder",
      entity_type: "menu_category",
      entity_id: categoryId,
      old_value: JSON.stringify({ sort_order: current.sort_order }),
      new_value: JSON.stringify({ sort_order: neighbor.sort_order, direction }),
      created_at: now,
      synced_at: null,
    });
  });
}

/**
 * Toggle category active/inactive.
 */
export async function toggleCategoryActive(categoryId, actingStaffId) {
  const now = new Date().toISOString();

  await db.transaction("rw", ["menu_categories", "audit_log"], async () => {
    const cat = await db.menu_categories.get(categoryId);
    if (!cat) throw new Error("Category not found");
    const newActive = cat.is_active === 1 ? 0 : 1;

    await db.menu_categories.update(categoryId, { is_active: newActive, updated_at: now });

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: "category_toggle",
      entity_type: "menu_category",
      entity_id: categoryId,
      old_value: JSON.stringify({ is_active: cat.is_active }),
      new_value: JSON.stringify({ is_active: newActive }),
      created_at: now,
      synced_at: null,
    });
  });
}

// ─── Menu Item Management ─────────────────────────────────────

/**
 * Create or update a menu item.
 * @param {Object} data - { id?, name, shortName, categoryId, price (paise), gstRate (bps), hsnCode, foodType, station, prepTime, variants, addons }
 * @param {string} actingStaffId
 */
export async function saveMenuItem(data, actingStaffId) {
  const now = new Date().toISOString();
  const isNew = !data.id;
  const id = data.id || crypto.randomUUID();

  await db.transaction("rw", ["menu_items", "audit_log"], async () => {
    const fields = {
      category_id: data.categoryId,
      name: data.name.trim(),
      short_name: data.shortName?.trim() || data.name.trim().substring(0, 20),
      description: data.description || null,
      price: data.price,
      tax_rate: data.gstRate || 500,
      hsn_code: data.hsnCode || "9963",
      food_type: data.foodType || "veg",
      station: data.station || "counter",
      prep_time_mins: data.prepTime || 5,
      variants: JSON.stringify(data.variants || []),
      addons: JSON.stringify(data.addons || []),
      updated_at: now,
      synced_at: null,
    };

    if (isNew) {
      await db.menu_items.add({
        id,
        outlet_id: OUTLET_ID,
        ...fields,
        image_url: null,
        is_available: 1,
        is_active: 1,
        created_at: now,
        deleted_at: null,
      });
    } else {
      // Preserve existing is_available, is_active, image_url on update
      await db.menu_items.update(id, fields);
    }

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: isNew ? "menu_item_create" : "menu_item_update",
      entity_type: "menu_item",
      entity_id: id,
      old_value: null,
      new_value: JSON.stringify({ name: data.name, price: data.price }),
      created_at: now,
      synced_at: null,
    });
  });

  return id;
}

/**
 * Soft-delete a menu item (set is_active=0, deleted_at).
 */
export async function softDeleteMenuItem(itemId, actingStaffId) {
  const now = new Date().toISOString();

  await db.transaction("rw", ["menu_items", "audit_log"], async () => {
    await db.menu_items.update(itemId, {
      is_active: 0,
      deleted_at: now,
      updated_at: now,
    });

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: "menu_item_delete",
      entity_type: "menu_item",
      entity_id: itemId,
      old_value: null,
      new_value: JSON.stringify({ is_active: 0 }),
      created_at: now,
      synced_at: null,
    });
  });
}

/**
 * Toggle item availability (in-stock / out-of-stock).
 */
export async function toggleItemAvailability(itemId, actingStaffId) {
  const now = new Date().toISOString();

  await db.transaction("rw", ["menu_items", "audit_log"], async () => {
    const item = await db.menu_items.get(itemId);
    if (!item) throw new Error("Menu item not found");
    const newAvail = item.is_available === 1 ? 0 : 1;

    await db.menu_items.update(itemId, { is_available: newAvail, updated_at: now });

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: "menu_item_availability",
      entity_type: "menu_item",
      entity_id: itemId,
      old_value: JSON.stringify({ is_available: item.is_available }),
      new_value: JSON.stringify({ is_available: newAvail }),
      created_at: now,
      synced_at: null,
    });
  });
}

// ─── Outlet Settings ──────────────────────────────────────────

const OUTLET_WRITABLE_FIELDS = [
  "name", "address_line1", "address_line2", "city", "state", "pincode",
  "phone", "email", "gstin", "fssai_number", "invoice_prefix",
  "default_tax_rate", "upi_vpa",
];

/**
 * Update outlet settings. Only whitelisted fields are accepted.
 * @param {Object} changes - outlet fields to update
 * @param {string} actingStaffId
 */
export async function updateOutletSettings(changes, actingStaffId) {
  await requireAdminRole(actingStaffId);
  const now = new Date().toISOString();

  // Only allow whitelisted fields
  const sanitized = {};
  for (const key of Object.keys(changes)) {
    if (OUTLET_WRITABLE_FIELDS.includes(key)) sanitized[key] = changes[key];
  }
  if (Object.keys(sanitized).length === 0) throw new Error("No valid fields to update");

  await db.transaction("rw", ["outlets", "audit_log"], async () => {
    const outlet = await db.outlets.get(OUTLET_ID);
    if (!outlet) throw new Error("Outlet not found");

    await db.outlets.update(OUTLET_ID, { ...sanitized, updated_at: now });

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: actingStaffId,
      action: "outlet_settings_update",
      entity_type: "outlet",
      entity_id: OUTLET_ID,
      old_value: null,
      new_value: JSON.stringify(Object.keys(sanitized)),
      created_at: now,
      synced_at: null,
    });
  });
}
