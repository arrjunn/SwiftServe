import { Router } from "express";
import crypto from "crypto";
import { v4 as uuid } from "uuid";
import { pool, query } from "../db/pool.js";
import { authenticate, authorize } from "./auth.js";

const router = Router();

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const ZOMATO_WEBHOOK_SECRET = process.env.ZOMATO_WEBHOOK_SECRET;
const SWIGGY_WEBHOOK_SECRET = process.env.SWIGGY_WEBHOOK_SECRET;
const ZOMATO_API_KEY = process.env.ZOMATO_API_KEY;
const SWIGGY_API_KEY = process.env.SWIGGY_API_KEY;

// Base URLs (easy to update when real docs are available)
const ZOMATO_API_BASE = "https://api.zomato.com/v1";
const SWIGGY_API_BASE = "https://partner-api.swiggy.com/v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verify HMAC-SHA256 webhook signature */
function verifySignature(body, secret, headerValue) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(typeof body === "string" ? body : JSON.stringify(body))
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(headerValue || ""));
}

/** Map aggregator status strings to local order statuses */
const ZOMATO_STATUS_MAP = {
  placed: "received",
  confirmed: "preparing",
  ready_for_pickup: "ready",
  picked_up: "served",
  delivered: "completed",
  cancelled: "cancelled",
};

const SWIGGY_STATUS_MAP = {
  placed: "received",
  confirmed: "preparing",
  ready_for_pickup: "ready",
  picked_up: "served",
  delivered: "completed",
  cancelled: "cancelled",
};

/**
 * Convert an amount to paise.  If the value is already an integer that looks
 * like paise (> 10000 for what would be Rs 100+), we leave it as-is.
 * Otherwise we treat it as rupees and multiply by 100.
 */
function toPaise(amount) {
  const n = Number(amount) || 0;
  // Heuristic: if the number has decimals, it is in rupees
  if (!Number.isInteger(n)) return Math.round(n * 100);
  return n;
}

/** Audit helper — fire-and-forget so it never blocks the webhook response */
function auditLog(outletId, action, entityType, entityId, newValue) {
  query(
    `INSERT INTO audit_log (outlet_id, staff_id, action, entity_type, entity_id, new_value)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      outletId,
      "00000000-0000-0000-0000-000000000000", // system user
      action,
      entityType,
      entityId,
      JSON.stringify(newValue),
    ]
  ).catch((err) => console.error("[AUDIT]", err.message));
}

// ---------------------------------------------------------------------------
// Shared order-creation logic
// ---------------------------------------------------------------------------

/**
 * Create a local order from an aggregator payload.
 *
 * @param {object}  opts
 * @param {string}  opts.source          - "zomato" | "swiggy"
 * @param {string}  opts.externalOrderId - aggregator order id
 * @param {string}  opts.outletId        - local outlet UUID
 * @param {string}  opts.type            - "delivery" | "pickup"
 * @param {Array}   opts.items           - [{ name, external_id?, quantity, unit_price, total? }]
 * @param {number}  opts.grandTotal      - total from aggregator (will be converted to paise)
 * @param {object}  opts.rawPayload      - original webhook body (for audit)
 */
async function createAggregatorOrder({
  source,
  externalOrderId,
  outletId,
  type,
  items,
  grandTotal,
  rawPayload,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Generate order number
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*) FROM orders
       WHERE outlet_id = $1
       AND created_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date`,
      [outletId]
    );
    const orderNumber = parseInt(countRows[0].count, 10) + 1;

    const orderId = uuid();
    const now = new Date().toISOString();

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const qty = item.quantity || 1;
      const unitPrice = toPaise(item.unit_price);
      const lineTotal = item.total ? toPaise(item.total) : unitPrice * qty;

      // Try to match a local menu item by external_id or name
      let menuItem = null;
      if (item.external_id) {
        const { rows } = await client.query(
          `SELECT id, name, price, tax_rate, hsn_code, food_type, station
           FROM menu_items
           WHERE outlet_id = $1 AND external_id = $2 AND deleted_at IS NULL LIMIT 1`,
          [outletId, item.external_id]
        );
        if (rows.length) menuItem = rows[0];
      }
      if (!menuItem && item.name) {
        const { rows } = await client.query(
          `SELECT id, name, price, tax_rate, hsn_code, food_type, station
           FROM menu_items
           WHERE outlet_id = $1 AND LOWER(name) = LOWER($2) AND deleted_at IS NULL LIMIT 1`,
          [outletId, item.name]
        );
        if (rows.length) menuItem = rows[0];
      }

      const taxRate = menuItem ? menuItem.tax_rate : 0;
      const itemTax = Math.round((lineTotal * taxRate) / 10000);
      const cgst = Math.floor(itemTax / 2);
      const sgst = itemTax - cgst;

      subtotal += lineTotal;

      orderItems.push({
        id: uuid(),
        outlet_id: outletId,
        order_id: orderId,
        menu_item_id: menuItem ? menuItem.id : null,
        name: menuItem ? menuItem.name : item.name || "Unknown item",
        variant_name: null,
        quantity: qty,
        unit_price: unitPrice,
        variant_add: 0,
        addon_total: 0,
        effective_price: unitPrice,
        line_total: lineTotal,
        tax_rate: taxRate,
        cgst_amount: cgst,
        sgst_amount: sgst,
        cess_amount: 0,
        tax_total: itemTax,
        hsn_code: menuItem ? menuItem.hsn_code : null,
        food_type: menuItem ? menuItem.food_type : "veg",
        station: menuItem ? menuItem.station : "kitchen",
        kds_status: "pending",
        notes: item.notes || null,
        is_void: false,
        created_at: now,
        updated_at: now,
      });
    }

    const taxTotal = orderItems.reduce((s, i) => s + i.tax_total, 0);
    const totalPaise = toPaise(grandTotal) || subtotal + taxTotal;
    const roundOff = totalPaise - (subtotal + taxTotal);

    // Insert order
    await client.query(
      `INSERT INTO orders (id, outlet_id, order_number, source, type, status, table_id,
       staff_id, shift_id, external_order_id, subtotal, tax_total, discount_amount, round_off,
       grand_total, received_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        orderId,
        outletId,
        orderNumber,
        source,
        type,
        "received",
        null, // no table for aggregator orders
        null, // no staff — system-created
        null, // no shift
        externalOrderId,
        subtotal,
        taxTotal,
        0,
        roundOff,
        totalPaise,
        now,
        now,
        now,
      ]
    );

    // Insert order items
    for (const oi of orderItems) {
      await client.query(
        `INSERT INTO order_items (id, outlet_id, order_id, menu_item_id, name, variant_name,
         quantity, unit_price, variant_add, addon_total, effective_price, line_total,
         tax_rate, cgst_amount, sgst_amount, cess_amount, tax_total, hsn_code, food_type,
         station, kds_status, notes, is_void, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
        [
          oi.id, oi.outlet_id, oi.order_id, oi.menu_item_id, oi.name, oi.variant_name,
          oi.quantity, oi.unit_price, oi.variant_add, oi.addon_total, oi.effective_price,
          oi.line_total, oi.tax_rate, oi.cgst_amount, oi.sgst_amount, oi.cess_amount,
          oi.tax_total, oi.hsn_code, oi.food_type, oi.station, oi.kds_status, oi.notes,
          oi.is_void, oi.created_at, oi.updated_at,
        ]
      );
    }

    await client.query("COMMIT");

    // Audit (non-blocking)
    auditLog(outletId, "aggregator_order_create", "order", orderId, {
      source,
      external_order_id: externalOrderId,
      order_number: orderNumber,
      grand_total: totalPaise,
    });

    return { orderId, orderNumber, grandTotal: totalPaise, itemCount: orderItems.length };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// 1. POST /api/aggregators/zomato/webhook
// ---------------------------------------------------------------------------

router.post("/zomato/webhook", async (req, res, next) => {
  try {
    if (!ZOMATO_WEBHOOK_SECRET) {
      return res.status(503).json({ error: "Zomato integration not configured" });
    }

    // Verify signature
    const signature = req.headers["x-zomato-signature"];
    if (!signature) {
      return res.status(401).json({ error: "Missing X-Zomato-Signature header" });
    }

    let valid = false;
    try {
      valid = verifySignature(req.body, ZOMATO_WEBHOOK_SECRET, signature);
    } catch {
      valid = false;
    }
    if (!valid) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    const { event_type, data } = req.body;

    // Audit every incoming event
    const outletId = data?.outlet_id || data?.restaurant_id || null;
    auditLog(outletId, `zomato_webhook_${event_type}`, "aggregator", data?.order_id || "unknown", {
      event_type,
      zomato_order_id: data?.order_id,
    });

    // ---- order.placed ----
    if (event_type === "order.placed") {
      const orderType = data.delivery_type === "pickup" ? "pickup" : "delivery";
      const items = (data.items || []).map((i) => ({
        name: i.name,
        external_id: i.external_id || i.id || null,
        quantity: i.quantity || 1,
        unit_price: i.price || i.unit_price || 0,
        total: i.total || null,
        notes: i.special_instructions || null,
      }));

      const result = await createAggregatorOrder({
        source: "zomato",
        externalOrderId: String(data.order_id),
        outletId: data.outlet_id || data.restaurant_id,
        type: orderType,
        items,
        grandTotal: data.order_total || data.grand_total || 0,
        rawPayload: req.body,
      });

      return res.json({ status: "ok", orderId: result.orderId });
    }

    // ---- order.cancelled ----
    if (event_type === "order.cancelled") {
      const extId = String(data.order_id);
      const reason = data.cancel_reason || data.cancellation_reason || "Cancelled by Zomato";

      const now = new Date().toISOString();
      await query(
        `UPDATE orders SET status = 'cancelled', cancelled_at = $1, cancel_reason = $2, updated_at = $1
         WHERE external_order_id = $3 AND source = 'zomato' AND status != 'cancelled'`,
        [now, reason, extId]
      );

      return res.json({ status: "ok" });
    }

    // ---- order.status_update ----
    if (event_type === "order.status_update") {
      const extId = String(data.order_id);
      const localStatus = ZOMATO_STATUS_MAP[data.status] || null;

      if (localStatus) {
        const now = new Date().toISOString();
        const timestampField = {
          preparing: "preparing_at",
          ready: "ready_at",
          served: "served_at",
          completed: "completed_at",
          cancelled: "cancelled_at",
        }[localStatus];

        let sql = `UPDATE orders SET status = $1, updated_at = $2`;
        const params = [localStatus, now];
        let idx = 3;

        if (timestampField) {
          sql += `, ${timestampField} = $${idx}`;
          params.push(now);
          idx++;
        }

        sql += ` WHERE external_order_id = $${idx} AND source = 'zomato'`;
        params.push(extId);

        await query(sql, params);
      }

      return res.json({ status: "ok" });
    }

    // Unknown event — acknowledge to prevent retries
    return res.json({ status: "ok", note: "unhandled event type" });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 2. POST /api/aggregators/swiggy/webhook
// ---------------------------------------------------------------------------

router.post("/swiggy/webhook", async (req, res, next) => {
  try {
    if (!SWIGGY_WEBHOOK_SECRET) {
      return res.status(503).json({ error: "Swiggy integration not configured" });
    }

    // Verify signature
    const signature = req.headers["x-swiggy-signature"];
    if (!signature) {
      return res.status(401).json({ error: "Missing X-Swiggy-Signature header" });
    }

    let valid = false;
    try {
      valid = verifySignature(req.body, SWIGGY_WEBHOOK_SECRET, signature);
    } catch {
      valid = false;
    }
    if (!valid) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    const { event_type, data } = req.body;

    const outletId = data?.outlet_id || data?.restaurant_id || null;
    auditLog(outletId, `swiggy_webhook_${event_type}`, "aggregator", data?.order_id || "unknown", {
      event_type,
      swiggy_order_id: data?.order_id,
    });

    // ---- order_placed ----
    if (event_type === "order_placed") {
      const orderType = data.delivery_type === "pickup" ? "pickup" : "delivery";
      const items = (data.items || []).map((i) => ({
        name: i.name,
        external_id: i.external_id || i.id || null,
        quantity: i.quantity || 1,
        unit_price: i.price || i.unit_price || 0,
        total: i.total || null,
        notes: i.special_instructions || null,
      }));

      const result = await createAggregatorOrder({
        source: "swiggy",
        externalOrderId: String(data.order_id),
        outletId: data.outlet_id || data.restaurant_id,
        type: orderType,
        items,
        grandTotal: data.order_total || data.grand_total || 0,
        rawPayload: req.body,
      });

      return res.json({ status: "ok", orderId: result.orderId });
    }

    // ---- order_cancelled ----
    if (event_type === "order_cancelled") {
      const extId = String(data.order_id);
      const reason = data.cancel_reason || data.cancellation_reason || "Cancelled by Swiggy";

      const now = new Date().toISOString();
      await query(
        `UPDATE orders SET status = 'cancelled', cancelled_at = $1, cancel_reason = $2, updated_at = $1
         WHERE external_order_id = $3 AND source = 'swiggy' AND status != 'cancelled'`,
        [now, reason, extId]
      );

      return res.json({ status: "ok" });
    }

    // ---- order_status_update ----
    if (event_type === "order_status_update") {
      const extId = String(data.order_id);
      const localStatus = SWIGGY_STATUS_MAP[data.status] || null;

      if (localStatus) {
        const now = new Date().toISOString();
        const timestampField = {
          preparing: "preparing_at",
          ready: "ready_at",
          served: "served_at",
          completed: "completed_at",
          cancelled: "cancelled_at",
        }[localStatus];

        let sql = `UPDATE orders SET status = $1, updated_at = $2`;
        const params = [localStatus, now];
        let idx = 3;

        if (timestampField) {
          sql += `, ${timestampField} = $${idx}`;
          params.push(now);
          idx++;
        }

        sql += ` WHERE external_order_id = $${idx} AND source = 'swiggy'`;
        params.push(extId);

        await query(sql, params);
      }

      return res.json({ status: "ok" });
    }

    return res.json({ status: "ok", note: "unhandled event type" });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 3. POST /api/aggregators/zomato/accept/:orderId  (authenticated, owner/admin)
// ---------------------------------------------------------------------------

router.post(
  "/zomato/accept/:orderId",
  authenticate,
  authorize("owner", "admin"),
  async (req, res, next) => {
    try {
      if (!ZOMATO_API_KEY) {
        return res.status(503).json({ error: "Zomato API key not configured" });
      }

      const { orderId } = req.params;

      // Fetch local order
      const { rows } = await query(
        `SELECT id, external_order_id, status, outlet_id
         FROM orders
         WHERE id = $1 AND outlet_id = $2 AND source = 'zomato' AND deleted_at IS NULL`,
        [orderId, req.staff.outletId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Zomato order not found" });
      }

      const order = rows[0];

      // Call Zomato accept API
      const apiUrl = `${ZOMATO_API_BASE}/orders/${order.external_order_id}/accept`;
      const apiRes = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": ZOMATO_API_KEY,
          Authorization: `Bearer ${ZOMATO_API_KEY}`,
        },
        body: JSON.stringify({ order_id: order.external_order_id }),
      });

      if (!apiRes.ok) {
        const errBody = await apiRes.text();
        console.error("[ZOMATO] Accept API error:", apiRes.status, errBody);
        return res.status(502).json({
          error: "Zomato API rejected the request",
          upstream_status: apiRes.status,
        });
      }

      // Update local status to preparing
      const now = new Date().toISOString();
      await query(
        `UPDATE orders SET status = 'preparing', preparing_at = $1, updated_at = $1 WHERE id = $2`,
        [now, orderId]
      );

      auditLog(req.staff.outletId, "zomato_order_accept", "order", orderId, {
        external_order_id: order.external_order_id,
        accepted_by: req.staff.staffId,
      });

      res.json({ status: "ok", orderId, orderStatus: "preparing" });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// 4. POST /api/aggregators/swiggy/accept/:orderId  (authenticated, owner/admin)
// ---------------------------------------------------------------------------

router.post(
  "/swiggy/accept/:orderId",
  authenticate,
  authorize("owner", "admin"),
  async (req, res, next) => {
    try {
      if (!SWIGGY_API_KEY) {
        return res.status(503).json({ error: "Swiggy API key not configured" });
      }

      const { orderId } = req.params;

      const { rows } = await query(
        `SELECT id, external_order_id, status, outlet_id
         FROM orders
         WHERE id = $1 AND outlet_id = $2 AND source = 'swiggy' AND deleted_at IS NULL`,
        [orderId, req.staff.outletId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Swiggy order not found" });
      }

      const order = rows[0];

      // Call Swiggy accept API
      const apiUrl = `${SWIGGY_API_BASE}/orders/${order.external_order_id}/accept`;
      const apiRes = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": SWIGGY_API_KEY,
          Authorization: `Bearer ${SWIGGY_API_KEY}`,
        },
        body: JSON.stringify({ order_id: order.external_order_id }),
      });

      if (!apiRes.ok) {
        const errBody = await apiRes.text();
        console.error("[SWIGGY] Accept API error:", apiRes.status, errBody);
        return res.status(502).json({
          error: "Swiggy API rejected the request",
          upstream_status: apiRes.status,
        });
      }

      const now = new Date().toISOString();
      await query(
        `UPDATE orders SET status = 'preparing', preparing_at = $1, updated_at = $1 WHERE id = $2`,
        [now, orderId]
      );

      auditLog(req.staff.outletId, "swiggy_order_accept", "order", orderId, {
        external_order_id: order.external_order_id,
        accepted_by: req.staff.staffId,
      });

      res.json({ status: "ok", orderId, orderStatus: "preparing" });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// 5. GET /api/aggregators/status  (authenticated)
// ---------------------------------------------------------------------------

router.get("/status", authenticate, async (req, res) => {
  res.json({
    zomato: {
      configured: Boolean(ZOMATO_WEBHOOK_SECRET && ZOMATO_API_KEY),
      webhookUrl: "/api/aggregators/zomato/webhook",
    },
    swiggy: {
      configured: Boolean(SWIGGY_WEBHOOK_SECRET && SWIGGY_API_KEY),
      webhookUrl: "/api/aggregators/swiggy/webhook",
    },
  });
});

export default router;
