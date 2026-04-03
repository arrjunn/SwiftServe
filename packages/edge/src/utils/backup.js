import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";

/**
 * Export a full backup of all key tables from the local Dexie database as a JSON file download.
 *
 * Tables exported: outlets, staff, orders, order_items, payments, invoices,
 * customers, menu_items, menu_categories, inventory_items, shifts, floor_tables,
 * promos, audit_log, sync_meta, loyalty_transactions, combo_deals, combo_deal_items,
 * customer_feedback, inventory_transactions, recipe_ingredients, wastage_log
 */
export async function exportBackupJSON() {
  const tableNames = [
    "outlets",
    "staff",
    "orders",
    "order_items",
    "payments",
    "invoices",
    "customers",
    "menu_items",
    "menu_categories",
    "inventory_items",
    "shifts",
    "floor_tables",
    "promos",
    "audit_log",
    "sync_meta",
    "loyalty_transactions",
    "combo_deals",
    "combo_deal_items",
    "customer_feedback",
    "inventory_transactions",
    "recipe_ingredients",
    "wastage_log",
  ];

  const data = {};
  const recordCounts = {};

  for (const name of tableNames) {
    const table = db[name];
    if (!table) {
      data[name] = [];
      recordCounts[name] = 0;
      continue;
    }
    const records = await table.toArray();
    data[name] = records;
    recordCounts[name] = records.length;
  }

  const backup = {
    metadata: {
      exported_at: new Date().toISOString(),
      outlet_id: OUTLET_ID,
      record_counts: recordCounts,
    },
    ...data,
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const filename = `swiftserve-backup-${yyyy}-${mm}-${dd}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Store last backup date in localStorage
  localStorage.setItem("swiftserve_last_backup", new Date().toISOString());

  return { filename, recordCounts };
}
