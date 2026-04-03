import { Router } from "express";
import crypto from "crypto";
import { v4 as uuid } from "uuid";
import { pool, query } from "../db/pool.js";
import { authenticate } from "./auth.js";

const router = Router();

/**
 * POST /api/payments/create-order
 * Creates a Razorpay order via their REST API.
 * Body: { amount (paise), orderId, keyId }
 * Returns: { razorpayOrderId, amount, currency }
 */
router.post("/create-order", authenticate, async (req, res, next) => {
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return res.status(503).json({
        error: "Payment gateway not configured. Set RAZORPAY_KEY_SECRET in .env",
      });
    }

    const { amount, orderId } = req.body;
    const keyId = process.env.RAZORPAY_KEY_ID;

    if (!amount || !orderId) {
      return res.status(400).json({ error: "amount and orderId are required" });
    }
    if (!keyId) {
      return res.status(503).json({ error: "RAZORPAY_KEY_ID not configured in .env" });
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({
        error: "amount must be a positive integer (paise)",
      });
    }

    // Create Razorpay order via REST API (no SDK needed)
    const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt: orderId,
      }),
    });

    if (!razorpayRes.ok) {
      const errBody = await razorpayRes.json().catch(() => ({}));
      console.error("[Payments] Razorpay create-order failed:", razorpayRes.status, errBody);
      return res.status(502).json({
        error: errBody?.error?.description || "Failed to create payment order with Razorpay",
      });
    }

    const razorpayOrder = await razorpayRes.json();

    // Audit log
    await query(
      `INSERT INTO audit_log (outlet_id, staff_id, action, entity_type, entity_id, new_value)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.staff.outletId,
        req.staff.staffId,
        "razorpay_order_created",
        "payment",
        orderId,
        JSON.stringify({
          razorpay_order_id: razorpayOrder.id,
          amount,
          currency: "INR",
        }),
      ]
    );

    res.json({
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/verify
 * Verifies Razorpay payment signature and records the payment.
 * Body: { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderId, amount }
 * Returns: { verified: true, paymentId }
 */
router.post("/verify", authenticate, async (req, res, next) => {
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return res.status(503).json({
        error: "Payment gateway not configured. Set RAZORPAY_KEY_SECRET in .env",
      });
    }

    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      orderId,
      amount,
    } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({
        error: "razorpay_payment_id, razorpay_order_id, and razorpay_signature are required",
      });
    }

    if (!orderId || !amount) {
      return res.status(400).json({
        error: "orderId and amount are required",
      });
    }

    // Verify signature: HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      // Audit failed verification
      await query(
        `INSERT INTO audit_log (outlet_id, staff_id, action, entity_type, entity_id, new_value)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.staff.outletId,
          req.staff.staffId,
          "razorpay_verify_failed",
          "payment",
          orderId,
          JSON.stringify({
            razorpay_order_id,
            razorpay_payment_id,
            reason: "signature_mismatch",
          }),
        ]
      );

      return res.status(400).json({ error: "Payment verification failed" });
    }

    // Signature valid — record payment in DB
    const now = new Date().toISOString();
    const paymentId = uuid();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Idempotency check: if a payment with this gateway_txn_id already exists, return success
      const { rows: existingPayments } = await client.query(
        `SELECT id FROM payments WHERE gateway_txn_id = $1 LIMIT 1`,
        [razorpay_payment_id]
      );
      if (existingPayments.length > 0) {
        await client.query("ROLLBACK");
        client.release();
        return res.json({ verified: true, paymentId: existingPayments[0].id, idempotent: true });
      }

      // Validate payment amount matches order grand_total
      const { rows: orderRows } = await client.query(
        `SELECT grand_total FROM orders WHERE id = $1 AND outlet_id = $2`,
        [orderId, req.staff.outletId]
      );
      if (orderRows.length === 0) {
        await client.query("ROLLBACK");
        client.release();
        return res.status(404).json({ error: "Order not found" });
      }
      if (orderRows[0].grand_total !== amount) {
        await client.query("ROLLBACK");
        client.release();
        return res.status(400).json({
          error: "Payment amount does not match order total",
          expected: orderRows[0].grand_total,
          received: amount,
        });
      }

      // Insert payment record
      await client.query(
        `INSERT INTO payments (id, outlet_id, order_id, shift_id, method, amount, status,
         gateway, gateway_txn_id, gateway_order_id, is_refund, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          paymentId,
          req.staff.outletId,
          orderId,
          null, // shift_id not available server-side
          "card",
          amount,
          "success",
          "razorpay",
          razorpay_payment_id,
          razorpay_order_id,
          false,
          now,
          now,
        ]
      );

      // Update order status to completed
      await client.query(
        `UPDATE orders SET status = 'completed', completed_at = $1, updated_at = $1
         WHERE id = $2 AND outlet_id = $3`,
        [now, orderId, req.staff.outletId]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_log (outlet_id, staff_id, action, entity_type, entity_id, new_value)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.staff.outletId,
          req.staff.staffId,
          "razorpay_payment_verified",
          "payment",
          paymentId,
          JSON.stringify({
            method: "card",
            gateway: "razorpay",
            amount,
            razorpay_payment_id,
            razorpay_order_id,
          }),
        ]
      );

      await client.query("COMMIT");

      res.json({ verified: true, paymentId });
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
