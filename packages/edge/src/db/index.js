import Dexie from "dexie";

/**
 * SwiftServe Edge Database (IndexedDB via Dexie).
 *
 * IMPORTANT: "tables" is a reserved Dexie property (db.tables returns all table definitions).
 * We use "floor_tables" as the store name for restaurant floor tables.
 *
 * After ANY schema change: increment version, add new .stores() block.
 * Never modify a previous version — add a new one.
 */
export const db = new Dexie("SwiftServeDB");

// Version 3: clean schema with floor_tables (replaces v1 "tables" which conflicted with Dexie internals)
db.version(3).stores({
  outlets: "id",
  staff: "id, outlet_id, role, is_active",
  shifts: "id, outlet_id, staff_id, status, opened_at",
  floor_tables: "id, outlet_id, table_number, status",
  menu_categories: "id, outlet_id, sort_order, is_active",
  menu_items: "id, outlet_id, category_id, station, food_type, is_available, is_active",
  orders: "id, outlet_id, order_number, source, type, status, staff_id, shift_id, table_id, created_at, [outlet_id+status], [outlet_id+created_at]",
  order_items: "id, outlet_id, order_id, menu_item_id, station, kds_status",
  payments: "id, outlet_id, order_id, shift_id, method, status, gateway_txn_id",
  invoices: "id, outlet_id, order_id, invoice_number, invoice_date, financial_year",
  customers: "id, outlet_id, phone_hash",
  inventory_items: "id, outlet_id, is_active",
  inventory_transactions: "id, outlet_id, inventory_item_id, type, created_at",
  recipe_ingredients: "id, outlet_id, menu_item_id, inventory_item_id",
  promos: "id, outlet_id, coupon_code, is_active",
  purchase_orders: "id, outlet_id, status",
  wastage_log: "id, outlet_id, inventory_item_id, created_at",
  audit_log: "id, outlet_id, staff_id, action, entity_type, entity_id, created_at",
  sync_meta: "id",
});

// Version 4: loyalty points, combo deals, customer feedback
db.version(4).stores({
  outlets: "id",
  staff: "id, outlet_id, role, is_active",
  shifts: "id, outlet_id, staff_id, status, opened_at",
  floor_tables: "id, outlet_id, table_number, status",
  menu_categories: "id, outlet_id, sort_order, is_active",
  menu_items: "id, outlet_id, category_id, station, food_type, is_available, is_active",
  orders: "id, outlet_id, order_number, source, type, status, staff_id, shift_id, table_id, customer_id, created_at, [outlet_id+status], [outlet_id+created_at]",
  order_items: "id, outlet_id, order_id, menu_item_id, station, kds_status",
  payments: "id, outlet_id, order_id, shift_id, method, status, gateway_txn_id",
  invoices: "id, outlet_id, order_id, invoice_number, invoice_date, financial_year",
  customers: "id, outlet_id, phone_hash, phone, loyalty_points",
  inventory_items: "id, outlet_id, is_active",
  inventory_transactions: "id, outlet_id, inventory_item_id, type, created_at",
  recipe_ingredients: "id, outlet_id, menu_item_id, inventory_item_id",
  promos: "id, outlet_id, coupon_code, is_active",
  purchase_orders: "id, outlet_id, status",
  wastage_log: "id, outlet_id, inventory_item_id, created_at",
  audit_log: "id, outlet_id, staff_id, action, entity_type, entity_id, created_at",
  sync_meta: "id",
  // New in v4
  loyalty_transactions: "id, outlet_id, customer_id, order_id, type, created_at",
  combo_deals: "id, outlet_id, is_active",
  combo_deal_items: "id, outlet_id, combo_deal_id, menu_item_id",
  customer_feedback: "id, outlet_id, order_id, customer_id, created_at",
});

// Version 5: sync performance indexes + atomic order sequence
db.version(5).stores({
  outlets: "id",
  staff: "id, outlet_id, role, is_active",
  shifts: "id, outlet_id, staff_id, status, opened_at",
  floor_tables: "id, outlet_id, table_number, status",
  menu_categories: "id, outlet_id, sort_order, is_active",
  menu_items: "id, outlet_id, category_id, station, food_type, is_available, is_active",
  orders: "id, outlet_id, order_number, source, type, status, staff_id, shift_id, table_id, customer_id, created_at, synced_at, [outlet_id+status], [outlet_id+created_at]",
  order_items: "id, outlet_id, order_id, menu_item_id, station, kds_status, synced_at",
  payments: "id, outlet_id, order_id, shift_id, method, status, gateway_txn_id, synced_at",
  invoices: "id, outlet_id, order_id, invoice_number, invoice_date, financial_year, synced_at",
  customers: "id, outlet_id, phone_hash, phone, loyalty_points",
  inventory_items: "id, outlet_id, is_active",
  inventory_transactions: "id, outlet_id, inventory_item_id, type, created_at",
  recipe_ingredients: "id, outlet_id, menu_item_id, inventory_item_id",
  promos: "id, outlet_id, coupon_code, is_active",
  purchase_orders: "id, outlet_id, status",
  wastage_log: "id, outlet_id, inventory_item_id, created_at",
  audit_log: "id, outlet_id, staff_id, action, entity_type, entity_id, created_at, synced_at",
  sync_meta: "id",
  loyalty_transactions: "id, outlet_id, customer_id, order_id, type, created_at, synced_at",
  combo_deals: "id, outlet_id, is_active",
  combo_deal_items: "id, outlet_id, combo_deal_id, menu_item_id",
  customer_feedback: "id, outlet_id, order_id, customer_id, created_at, synced_at",
});

// Version 6: kiosk mode — image_url on menu items, scheduled_messages for post-order automation
db.version(6).stores({
  outlets: "id",
  staff: "id, outlet_id, role, is_active",
  shifts: "id, outlet_id, staff_id, status, opened_at",
  floor_tables: "id, outlet_id, table_number, status",
  menu_categories: "id, outlet_id, sort_order, is_active",
  menu_items: "id, outlet_id, category_id, station, food_type, is_available, is_active",
  orders: "id, outlet_id, order_number, source, type, status, staff_id, shift_id, table_id, customer_id, created_at, synced_at, [outlet_id+status], [outlet_id+created_at]",
  order_items: "id, outlet_id, order_id, menu_item_id, station, kds_status, synced_at",
  payments: "id, outlet_id, order_id, shift_id, method, status, gateway_txn_id, synced_at",
  invoices: "id, outlet_id, order_id, invoice_number, invoice_date, financial_year, synced_at",
  customers: "id, outlet_id, phone_hash, phone, loyalty_points",
  inventory_items: "id, outlet_id, is_active",
  inventory_transactions: "id, outlet_id, inventory_item_id, type, created_at",
  recipe_ingredients: "id, outlet_id, menu_item_id, inventory_item_id",
  promos: "id, outlet_id, coupon_code, is_active",
  purchase_orders: "id, outlet_id, status",
  wastage_log: "id, outlet_id, inventory_item_id, created_at",
  audit_log: "id, outlet_id, staff_id, action, entity_type, entity_id, created_at, synced_at",
  sync_meta: "id",
  loyalty_transactions: "id, outlet_id, customer_id, order_id, type, created_at, synced_at",
  combo_deals: "id, outlet_id, is_active",
  combo_deal_items: "id, outlet_id, combo_deal_id, menu_item_id",
  customer_feedback: "id, outlet_id, order_id, customer_id, created_at, synced_at",
  scheduled_messages: "id, outlet_id, order_id, type, send_at, status",
});

export default db;
