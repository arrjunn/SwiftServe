import { Router } from "express";
import { v4 as uuid } from "uuid";
import { pool, query } from "../db/pool.js";
import { authenticate, authorize } from "./auth.js";
import { calculateGST, multiplyPaise, roundToRupee } from "@swiftserve/shared";

const router = Router();

/**
 * GET /api/orders
 * Query: ?outletId=&status=&date=&limit=&offset=
 * Returns paginated order list for owner dashboard.
 */
router.get("/", authenticate, async (req, res, next) => {
  try {
    const { outletId, status, date, limit: rawLimit = 50, offset = 0 } = req.query;
    const limit = Math.min(parseInt(rawLimit, 10) || 50, 200);
    const effectiveOutlet = outletId || req.staff.outletId;

    if (req.staff.outletId !== effectiveOutlet) {
      return res.status(403).json({ error: "Outlet mismatch" });
    }

    let sql = `
      SELECT o.*, s.name as staff_name
      FROM orders o
      LEFT JOIN staff s ON o.staff_id = s.id
      WHERE o.outlet_id = $1 AND o.deleted_at IS NULL`;
    const params = [effectiveOutlet];
    let paramIdx = 2;

    if (status) {
      sql += ` AND o.status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    if (date) {
      sql += ` AND DATE(o.created_at AT TIME ZONE 'Asia/Kolkata') = $${paramIdx}`;
      params.push(date);
      paramIdx++;
    }

    sql += ` ORDER BY o.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const { rows } = await query(sql, params);

    // Get total count for pagination
    let countSql = `SELECT COUNT(*) FROM orders WHERE outlet_id = $1 AND deleted_at IS NULL`;
    const countParams = [effectiveOutlet];
    let countIdx = 2;

    if (status) {
      countSql += ` AND status = $${countIdx}`;
      countParams.push(status);
      countIdx++;
    }
    if (date) {
      countSql += ` AND DATE(created_at AT TIME ZONE 'Asia/Kolkata') = $${countIdx}`;
      countParams.push(date);
    }

    const { rows: countRows } = await query(countSql, countParams);

    res.json({
      orders: rows,
      total: parseInt(countRows[0].count, 10),
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/:id
 * Returns full order with items and payments.
 */
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: orders } = await query(
      `SELECT o.*, s.name as staff_name
       FROM orders o
       LEFT JOIN staff s ON o.staff_id = s.id
       WHERE o.id = $1 AND o.outlet_id = $2 AND o.deleted_at IS NULL`,
      [id, req.staff.outletId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const [items, payments, invoices] = await Promise.all([
      query(`SELECT * FROM order_items WHERE order_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [id]),
      query(`SELECT * FROM payments WHERE order_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [id]),
      query(`SELECT * FROM invoices WHERE order_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [id]),
    ]);

    res.json({
      order: orders[0],
      items: items.rows,
      payments: payments.rows,
      invoices: invoices.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orders
 * Create a new order from the cloud side (e.g., aggregator webhook).
 * Body: { outletId, type, source, items: [{menuItemId, quantity, notes}], tableId? }
 */
router.post("/", authenticate, async (req, res, next) => {
  try {
    const { outletId, type = "dine_in", source = "counter", items, tableId = null } = req.body;
    const effectiveOutlet = outletId || req.staff.outletId;

    if (!items || !items.length) {
      return res.status(400).json({ error: "Order must have at least one item" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Get menu items for pricing
      const menuItemIds = items.map((i) => i.menuItemId);
      const { rows: menuItems } = await client.query(
        `SELECT id, name, short_name, price, tax_rate, hsn_code, food_type, station
         FROM menu_items
         WHERE id = ANY($1) AND outlet_id = $2 AND is_active = TRUE AND is_available = TRUE AND deleted_at IS NULL`,
        [menuItemIds, effectiveOutlet]
      );

      const menuMap = new Map(menuItems.map((m) => [m.id, m]));

      // Validate all items exist
      for (const item of items) {
        if (!menuMap.has(item.menuItemId)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `Menu item ${item.menuItemId} not found or unavailable` });
        }
      }

      // Generate order number — use MAX + 1 with row-level lock to prevent duplicates
      const { rows: seqRows } = await client.query(
        `SELECT COALESCE(MAX(order_number), 0) + 1 AS next_num FROM orders
         WHERE outlet_id = $1
         AND created_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date
         FOR UPDATE`,
        [effectiveOutlet]
      );
      const orderNumber = seqRows[0].next_num;

      const orderId = uuid();
      const now = new Date().toISOString();

      // Build order items and compute totals
      let subtotal = 0;
      let taxTotal = 0;
      const orderItems = [];

      for (const item of items) {
        const menu = menuMap.get(item.menuItemId);
        const qty = item.quantity || 1;
        const lineTotal = multiplyPaise(menu.price, qty);
        const gst = calculateGST(lineTotal, menu.tax_rate);
        const itemTax = gst.totalTax;
        const cgst = gst.cgst;
        const sgst = gst.sgst;

        subtotal += lineTotal;
        taxTotal += itemTax;

        orderItems.push({
          id: uuid(),
          outlet_id: effectiveOutlet,
          order_id: orderId,
          menu_item_id: menu.id,
          name: menu.name,
          variant_name: null,
          quantity: qty,
          unit_price: menu.price,
          variant_add: 0,
          addon_total: 0,
          effective_price: menu.price,
          line_total: lineTotal,
          tax_rate: menu.tax_rate,
          cgst_amount: cgst,
          sgst_amount: sgst,
          cess_amount: 0,
          tax_total: itemTax,
          hsn_code: menu.hsn_code,
          food_type: menu.food_type,
          station: menu.station,
          kds_status: "pending",
          notes: item.notes || null,
          is_void: false,
          created_at: now,
          updated_at: now,
        });
      }

      // Round to rupee — use shared utility for consistency with edge
      const beforeRound = subtotal + taxTotal;
      const { rounded: grandTotal, roundOff } = roundToRupee(beforeRound);

      // Insert order
      await client.query(
        `INSERT INTO orders (id, outlet_id, order_number, source, type, status, table_id,
         staff_id, shift_id, subtotal, tax_total, discount_amount, round_off, grand_total,
         received_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [orderId, effectiveOutlet, orderNumber, source, type, "received", tableId,
         req.staff.staffId, null, subtotal, taxTotal, 0, roundOff, grandTotal,
         now, now, now]
      );

      // Insert order items
      for (const oi of orderItems) {
        await client.query(
          `INSERT INTO order_items (id, outlet_id, order_id, menu_item_id, name, variant_name,
           quantity, unit_price, variant_add, addon_total, effective_price, line_total,
           tax_rate, cgst_amount, sgst_amount, cess_amount, tax_total, hsn_code, food_type,
           station, kds_status, notes, is_void, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
          [oi.id, oi.outlet_id, oi.order_id, oi.menu_item_id, oi.name, oi.variant_name,
           oi.quantity, oi.unit_price, oi.variant_add, oi.addon_total, oi.effective_price,
           oi.line_total, oi.tax_rate, oi.cgst_amount, oi.sgst_amount, oi.cess_amount,
           oi.tax_total, oi.hsn_code, oi.food_type, oi.station, oi.kds_status, oi.notes,
           oi.is_void, oi.created_at, oi.updated_at]
        );
      }

      // Audit
      await client.query(
        `INSERT INTO audit_log (outlet_id, staff_id, action, entity_type, entity_id, new_value)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [effectiveOutlet, req.staff.staffId, "order_create", "order", orderId,
         JSON.stringify({ order_number: orderNumber, grand_total: grandTotal, source })]
      );

      await client.query("COMMIT");

      res.status(201).json({
        order: {
          id: orderId,
          order_number: orderNumber,
          status: "received",
          subtotal,
          tax_total: taxTotal,
          grand_total: grandTotal,
          items: orderItems.length,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/orders/:id/status
 * Body: { status }
 * Transitions: received → preparing → ready → served → completed
 */
router.patch("/:id/status", authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validTransitions = {
      received: ["preparing", "cancelled"],
      preparing: ["ready", "cancelled"],
      ready: ["served", "completed", "cancelled"],
      served: ["completed"],
      held: ["received", "cancelled"],
    };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // SELECT FOR UPDATE to prevent concurrent status transitions
      const { rows } = await client.query(
        `SELECT id, status, outlet_id FROM orders WHERE id = $1 AND outlet_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [id, req.staff.outletId]
      );

      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Order not found" });
      }

      const order = rows[0];
      const allowed = validTransitions[order.status];

      if (!allowed || !allowed.includes(status)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Cannot transition from '${order.status}' to '${status}'`,
          allowed: allowed || [],
        });
      }

      const now = new Date().toISOString();
      const timestampField = {
        preparing: "preparing_at",
        ready: "ready_at",
        served: "served_at",
        completed: "completed_at",
        cancelled: "cancelled_at",
      }[status];

      let sql = `UPDATE orders SET status = $1, updated_at = $2`;
      const params = [status, now];
      let paramIdx = 3;

      if (timestampField) {
        sql += `, ${timestampField} = $${paramIdx}`;
        params.push(now);
        paramIdx++;
      }

      sql += ` WHERE id = $${paramIdx}`;
      params.push(id);

      await client.query(sql, params);

      // Audit
      await client.query(
        `INSERT INTO audit_log (outlet_id, staff_id, action, entity_type, entity_id, old_value, new_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.staff.outletId, req.staff.staffId, "order_status_change", "order", id,
         JSON.stringify({ status: order.status }),
         JSON.stringify({ status })]
      );

      await client.query("COMMIT");
      res.json({ id, status, updatedAt: now });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orders/:id/cancel
 * Body: { reason }
 * Cancels an order and creates refund payments if needed.
 */
router.post("/:id/cancel", authenticate, authorize("owner", "admin", "counter"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason = "No reason provided" } = req.body;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: orders } = await client.query(
        `SELECT * FROM orders WHERE id = $1 AND outlet_id = $2 AND deleted_at IS NULL`,
        [id, req.staff.outletId]
      );

      if (orders.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Order not found" });
      }

      const order = orders[0];

      if (order.status === "cancelled") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Order already cancelled" });
      }

      if (order.status === "completed") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Cannot cancel completed order — use refund instead" });
      }

      const now = new Date().toISOString();

      // Cancel order
      await client.query(
        `UPDATE orders SET status = 'cancelled', cancelled_at = $1, cancel_reason = $2, updated_at = $1
         WHERE id = $3`,
        [now, reason, id]
      );

      // If there were any payments, create refunds
      const { rows: payments } = await client.query(
        `SELECT * FROM payments WHERE order_id = $1 AND is_refund = FALSE AND status = 'success' AND deleted_at IS NULL`,
        [id]
      );

      for (const payment of payments) {
        await client.query(
          `INSERT INTO payments (id, outlet_id, order_id, shift_id, method, amount, status,
           is_refund, refund_of, refund_reason, refunded_by, created_at, updated_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, 'success', TRUE, $6, $7, $8, $9, $9)`,
          [req.staff.outletId, id, payment.shift_id, payment.method, payment.amount,
           payment.id, reason, req.staff.staffId, now]
        );
      }

      // Audit
      await client.query(
        `INSERT INTO audit_log (outlet_id, staff_id, action, entity_type, entity_id, old_value, new_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.staff.outletId, req.staff.staffId, "order_cancel", "order", id,
         JSON.stringify({ status: order.status }),
         JSON.stringify({ status: "cancelled", reason })]
      );

      await client.query("COMMIT");

      res.json({ id, status: "cancelled", reason, refundsCreated: payments.length });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orders/:id/refund
 * Body: { reason }
 * Full refund for a completed order. Creates credit note.
 */
router.post("/:id/refund", authenticate, authorize("owner", "admin"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason = "No reason provided" } = req.body;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: orders } = await client.query(
        `SELECT * FROM orders WHERE id = $1 AND outlet_id = $2 AND deleted_at IS NULL`,
        [id, req.staff.outletId]
      );

      if (orders.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Order not found" });
      }

      const order = orders[0];

      if (order.status !== "completed") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Can only refund completed orders" });
      }

      // Check for existing refunds
      const { rows: existingRefunds } = await client.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payments
         WHERE order_id = $1 AND is_refund = TRUE AND deleted_at IS NULL`,
        [id]
      );

      if (parseInt(existingRefunds[0].total, 10) >= order.grand_total) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Order already fully refunded" });
      }

      const now = new Date().toISOString();

      // Get original payments
      const { rows: payments } = await client.query(
        `SELECT * FROM payments WHERE order_id = $1 AND is_refund = FALSE AND status = 'success' AND deleted_at IS NULL`,
        [id]
      );

      // Create refund payments
      const refundIds = [];
      for (const payment of payments) {
        const refundId = uuid();
        refundIds.push(refundId);
        await client.query(
          `INSERT INTO payments (id, outlet_id, order_id, shift_id, method, amount, status,
           is_refund, refund_of, refund_reason, refunded_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'success', TRUE, $7, $8, $9, $10, $10)`,
          [refundId, req.staff.outletId, id, payment.shift_id, payment.method, payment.amount,
           payment.id, reason, req.staff.staffId, now]
        );
      }

      // Update order status
      await client.query(
        `UPDATE orders SET status = 'cancelled', cancelled_at = $1, cancel_reason = $2, updated_at = $1
         WHERE id = $3`,
        [now, `Refund: ${reason}`, id]
      );

      // Generate credit note
      const { rows: outlet } = await client.query(
        `SELECT * FROM outlets WHERE id = $1`,
        [req.staff.outletId]
      );

      if (outlet.length > 0) {
        const o = outlet[0];
        // Atomic increment: SELECT ... FOR UPDATE prevents race conditions on invoice sequence
        const { rows: seqRows } = await client.query(
          `UPDATE outlets SET next_invoice_seq = next_invoice_seq + 1, updated_at = $1
           WHERE id = $2 RETURNING next_invoice_seq - 1 AS seq`,
          [now, req.staff.outletId]
        );
        const seq = seqRows[0].seq;
        const fy = (() => {
          const d = new Date();
          const yr = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
          return `${String(yr).slice(2)}${String(yr + 1).slice(2)}`;
        })();

        const cnNumber = `CN-${o.invoice_prefix}${fy}-${String(seq).padStart(6, "0")}`;

        // Find original invoice
        const { rows: origInvoices } = await client.query(
          `SELECT id FROM invoices WHERE order_id = $1 AND is_credit_note = FALSE AND deleted_at IS NULL LIMIT 1`,
          [id]
        );

        await client.query(
          `INSERT INTO invoices (id, outlet_id, order_id, invoice_number, invoice_date, financial_year,
           seller_gstin, seller_name, seller_address, subtotal, cgst_total, sgst_total, discount_total,
           round_off, grand_total, is_credit_note, original_invoice_id, created_at, updated_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           TRUE, $15, $16, $16)`,
          [req.staff.outletId, id, cnNumber, new Date().toISOString().split("T")[0], fy,
           o.gstin || "", o.name, `${o.address_line1}, ${o.city} - ${o.pincode}`,
           order.subtotal, Math.floor((order.tax_total || 0) / 2),
           (order.tax_total || 0) - Math.floor((order.tax_total || 0) / 2),
           order.discount_amount || 0, order.round_off || 0, order.grand_total,
           origInvoices.length > 0 ? origInvoices[0].id : null, now]
        );

        // Invoice sequence already incremented atomically above
      }

      // Audit
      await client.query(
        `INSERT INTO audit_log (outlet_id, staff_id, action, entity_type, entity_id, new_value)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.staff.outletId, req.staff.staffId, "order_refund", "order", id,
         JSON.stringify({ reason, grand_total: order.grand_total, refunds: refundIds.length })]
      );

      await client.query("COMMIT");

      res.json({
        id,
        status: "cancelled",
        reason,
        refundsCreated: refundIds.length,
        grandTotal: order.grand_total,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
