import { Router } from "express";
import express from "express";
import { pool, query } from "../db/pool.js";
import { authenticate } from "./auth.js";

const router = Router();
const SAFE_TABLE_RE = /^[a-z_]+$/;

// Edge Dexie uses "floor_tables", PostgreSQL uses "tables"
const EDGE_TO_CLOUD = { floor_tables: "tables" };
const CLOUD_TO_EDGE = { tables: "floor_tables" };

/**
 * Sync protocol:
 * - Edge keeps a `last_synced_at` timestamp per table.
 * - Push: edge sends mutations (inserts/updates) since its last push.
 * - Pull: edge requests records updated after its `last_synced_at`.
 * - Conflict resolution: last-write-wins based on `updated_at`.
 * - Deletes are soft (deleted_at != null).
 */

const SYNCABLE_TABLES = [
  "outlets",
  "staff",
  "shifts",
  "tables",
  "menu_categories",
  "menu_items",
  "orders",
  "order_items",
  "payments",
  "invoices",
  "customers",
  "promos",
  "audit_log",
  "loyalty_transactions",
  "combo_deals",
  "combo_deal_items",
  "customer_feedback",
];

// Column lists per table to prevent SQL injection
const TABLE_COLUMNS = {
  outlets: ["id", "name", "brand_name", "address_line1", "address_line2", "city", "state", "pincode", "gstin", "fssai_number", "phone", "email", "timezone", "is_active", "subscription_plan", "subscription_expires_at", "invoice_prefix", "next_invoice_seq", "schema_version", "created_at", "updated_at", "synced_at", "deleted_at"],
  staff: ["id", "outlet_id", "name", "phone", "role", "pin_hash", "is_active", "permissions", "created_at", "updated_at", "synced_at", "deleted_at"],
  shifts: ["id", "outlet_id", "staff_id", "opened_at", "closed_at", "opening_cash", "closing_cash", "expected_cash", "cash_difference", "notes", "status", "created_at", "updated_at", "synced_at", "deleted_at"],
  tables: ["id", "outlet_id", "table_number", "section", "capacity", "status", "current_order_id", "sort_order", "created_at", "updated_at", "synced_at", "deleted_at"],
  menu_categories: ["id", "outlet_id", "name", "sort_order", "is_active", "created_at", "updated_at", "synced_at", "deleted_at"],
  menu_items: ["id", "outlet_id", "category_id", "name", "short_name", "description", "price", "tax_rate", "hsn_code", "food_type", "is_available", "is_active", "prep_time_mins", "station", "sort_order", "image_url", "tags", "variants", "addons", "created_at", "updated_at", "synced_at", "deleted_at"],
  orders: ["id", "outlet_id", "order_number", "source", "type", "status", "table_id", "staff_id", "shift_id", "customer_id", "subtotal", "tax_total", "discount_amount", "discount_reason", "round_off", "grand_total", "external_order_id", "received_at", "preparing_at", "ready_at", "served_at", "completed_at", "cancelled_at", "cancel_reason", "is_held", "held_reason", "created_at", "updated_at", "synced_at", "deleted_at"],
  order_items: ["id", "outlet_id", "order_id", "menu_item_id", "name", "variant_name", "quantity", "unit_price", "variant_add", "addon_total", "effective_price", "line_total", "tax_rate", "cgst_amount", "sgst_amount", "cess_amount", "tax_total", "hsn_code", "food_type", "addons_json", "station", "kds_status", "notes", "is_void", "void_reason", "void_by", "created_at", "updated_at", "synced_at", "deleted_at"],
  payments: ["id", "outlet_id", "order_id", "shift_id", "method", "amount", "status", "gateway", "gateway_txn_id", "gateway_order_id", "upi_vpa_masked", "cash_tendered", "cash_change", "is_refund", "refund_of", "refund_reason", "refunded_by", "created_at", "updated_at", "synced_at", "deleted_at"],
  invoices: ["id", "outlet_id", "order_id", "invoice_number", "invoice_date", "financial_year", "seller_gstin", "seller_name", "seller_address", "buyer_name", "buyer_gstin", "buyer_phone", "subtotal", "cgst_total", "sgst_total", "igst_total", "cess_total", "discount_total", "round_off", "grand_total", "irn", "irn_generated_at", "qr_code_data", "is_credit_note", "original_invoice_id", "created_at", "updated_at", "synced_at", "deleted_at"],
  customers: ["id", "outlet_id", "name", "phone", "phone_hash", "email", "loyalty_points", "total_spent", "total_orders", "first_order_at", "last_order_at", "consent_given", "consent_at", "consent_purpose", "data_deletion_requested", "data_deletion_requested_at", "created_at", "updated_at", "synced_at", "deleted_at"],
  promos: ["id", "outlet_id", "name", "type", "value", "min_order", "max_discount", "applies_to", "applies_to_ids", "coupon_code", "usage_limit", "used_count", "starts_at", "expires_at", "is_active", "created_at", "updated_at", "synced_at", "deleted_at"],
  audit_log: ["id", "outlet_id", "staff_id", "action", "entity_type", "entity_id", "old_value", "new_value", "ip_address", "device_id", "created_at", "synced_at"],
  loyalty_transactions: ["id", "outlet_id", "customer_id", "order_id", "type", "points", "balance_after", "description", "created_at", "updated_at", "synced_at", "deleted_at"],
  combo_deals: ["id", "outlet_id", "name", "description", "combo_price", "is_active", "created_at", "updated_at", "synced_at", "deleted_at"],
  combo_deal_items: ["id", "outlet_id", "combo_deal_id", "menu_item_id", "quantity", "created_at", "updated_at", "synced_at", "deleted_at"],
  customer_feedback: ["id", "outlet_id", "order_id", "customer_id", "rating", "comment", "_customer_name", "created_at", "updated_at", "synced_at", "deleted_at"],
};

/**
 * POST /api/sync/push
 * Body: { outletId, mutations: { [tableName]: [ {row}, ... ] } }
 *
 * Upserts each row using last-write-wins on updated_at.
 * Returns: { accepted: number, conflicts: number }
 */
router.post("/push", express.json({ limit: "5mb" }), authenticate, async (req, res, next) => {
  try {
    const { outletId, mutations } = req.body;

    if (!outletId || !mutations) {
      return res.status(400).json({ error: "outletId and mutations are required" });
    }

    // Verify staff belongs to this outlet
    if (req.staff.outletId !== outletId) {
      return res.status(403).json({ error: "Outlet mismatch" });
    }

    let accepted = 0;
    let conflicts = 0;
    const now = new Date().toISOString();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Tables that only owner/admin can push to (privilege escalation prevention)
      const RESTRICTED_PUSH_TABLES = { staff: ["owner", "admin"], promos: ["owner", "admin"], outlets: ["owner", "admin"] };

      for (const [edgeTable, rows] of Object.entries(mutations)) {
        // Map edge store names to cloud table names
        const table = EDGE_TO_CLOUD[edgeTable] || edgeTable;
        if (!SYNCABLE_TABLES.includes(table) || !SAFE_TABLE_RE.test(table)) continue;
        const columns = TABLE_COLUMNS[table];
        if (!columns) continue;

        // Role check for sensitive tables
        if (RESTRICTED_PUSH_TABLES[table] && !RESTRICTED_PUSH_TABLES[table].includes(req.staff.role)) {
          continue; // silently skip — don't leak that the table is restricted
        }

        for (const row of rows) {
          // Check existing record
          const { rows: existing } = await client.query(
            `SELECT updated_at FROM ${table} WHERE id = $1`,
            [row.id]
          );

          if (existing.length > 0) {
            const cloudUpdated = new Date(existing[0].updated_at).getTime();
            const edgeUpdated = new Date(row.updated_at).getTime();

            if (edgeUpdated <= cloudUpdated) {
              conflicts++;
              continue;
            }

            // Update — only set columns that exist in the table
            const setClauses = [];
            const values = [];
            let paramIdx = 1;

            // Columns that must never be overwritten by edge sync
            const SYNC_PROTECTED_COLS = new Set(["id", "next_invoice_seq", "pin_hash", "outlet_id", "created_at"]);

            for (const col of columns) {
              if (SYNC_PROTECTED_COLS.has(col)) continue;
              if (row[col] !== undefined) {
                setClauses.push(`${col} = $${paramIdx}`);
                values.push(row[col]);
                paramIdx++;
              }
            }

            // Set synced_at
            if (!setClauses.find(c => c.startsWith("synced_at"))) {
              setClauses.push(`synced_at = $${paramIdx}`);
              values.push(now);
              paramIdx++;
            }

            values.push(row.id);
            await client.query(
              `UPDATE ${table} SET ${setClauses.join(", ")} WHERE id = $${paramIdx}`,
              values
            );
          } else {
            // Insert — build column/value lists from available data
            const insertCols = [];
            const insertVals = [];
            const placeholders = [];
            let paramIdx = 1;

            for (const col of columns) {
              if (row[col] !== undefined) {
                insertCols.push(col);
                insertVals.push(row[col]);
                placeholders.push(`$${paramIdx}`);
                paramIdx++;
              }
            }

            // Ensure synced_at is set
            if (!insertCols.includes("synced_at")) {
              insertCols.push("synced_at");
              insertVals.push(now);
              placeholders.push(`$${paramIdx}`);
            }

            await client.query(
              `INSERT INTO ${table} (${insertCols.join(", ")}) VALUES (${placeholders.join(", ")})`,
              insertVals
            );
          }
          accepted++;
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.json({ accepted, conflicts, syncedAt: now });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sync/pull
 * Body: { outletId, since: { [tableName]: "ISO timestamp" } }
 *
 * Returns rows updated after the given timestamps, per table.
 * Response: { mutations: { [tableName]: [rows] }, pulledAt: "ISO" }
 */
router.post("/pull", authenticate, async (req, res, next) => {
  try {
    const { outletId, since = {} } = req.body;

    if (!outletId) {
      return res.status(400).json({ error: "outletId is required" });
    }

    if (req.staff.outletId !== outletId) {
      return res.status(403).json({ error: "Outlet mismatch" });
    }

    const pulledAt = new Date().toISOString();
    const mutations = {};
    const PULL_LIMIT = 500; // Max rows per table per pull

    for (const table of SYNCABLE_TABLES) {
      const sinceTime = since[table] || "1970-01-01T00:00:00.000Z";

      let q;
      if (table === "outlets") {
        // outlets uses 'id' not 'outlet_id'
        q = await query(
          `SELECT * FROM outlets WHERE id = $1 AND updated_at > $2
           ORDER BY updated_at ASC LIMIT $3`,
          [outletId, sinceTime, PULL_LIMIT]
        );
      } else if (table === "audit_log") {
        // audit_log uses created_at for sync (append-only, no updated_at)
        q = await query(
          `SELECT * FROM ${table}
           WHERE outlet_id = $1 AND created_at > $2
           ORDER BY created_at ASC LIMIT $3`,
          [outletId, sinceTime, PULL_LIMIT]
        );
      } else {
        q = await query(
          `SELECT * FROM ${table}
           WHERE outlet_id = $1 AND updated_at > $2
           ORDER BY updated_at ASC LIMIT $3`,
          [outletId, sinceTime, PULL_LIMIT]
        );
      }

      if (q.rows.length > 0) {
        // Strip sensitive fields before sending to edge
        if (table === "staff") {
          mutations[table] = q.rows.map(({ pin_hash, ...rest }) => rest);
        } else {
          mutations[table] = q.rows;
        }
      }
    }

    // Map cloud table names back to edge store names
    const edgeMutations = {};
    for (const [table, rows] of Object.entries(mutations)) {
      const edgeName = CLOUD_TO_EDGE[table] || table;
      edgeMutations[edgeName] = rows;
    }
    res.json({ mutations: edgeMutations, pulledAt });
  } catch (err) {
    next(err);
  }
});

export default router;
