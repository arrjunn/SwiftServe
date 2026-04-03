import { Router } from "express";
import crypto from "crypto";
import { query } from "../db/pool.js";
import { authenticate, authorize } from "./auth.js";

const router = Router();

/**
 * WhatsApp Business API integration for SwiftServe.
 *
 * Environment Variables (set in .env):
 *   WHATSAPP_PHONE_NUMBER_ID  — WhatsApp Business phone number ID
 *   WHATSAPP_ACCESS_TOKEN     — Meta Graph API access token
 *   WHATSAPP_VERIFY_TOKEN     — Webhook verification token (you choose this)
 *   WHATSAPP_API_URL          — defaults to https://graph.facebook.com/v18.0
 */

const getConfig = () => ({
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  apiUrl: process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v18.0",
});

function isConfigured() {
  const c = getConfig();
  return !!(c.phoneNumberId && c.accessToken);
}

async function sendWhatsAppMessage(to, templateName, templateParams = [], language = "en") {
  const config = getConfig();
  if (!isConfigured()) {
    throw new Error("WhatsApp not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in .env");
  }

  const url = `${config.apiUrl}/${config.phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to: to.startsWith("91") ? to : `91${to}`,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components: templateParams.length > 0 ? [{
        type: "body",
        parameters: templateParams.map((p) => ({ type: "text", text: String(p) })),
      }] : undefined,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`WhatsApp API error: ${JSON.stringify(data.error || data)}`);
  }

  return data;
}

async function sendTextMessage(to, text) {
  const config = getConfig();
  if (!isConfigured()) {
    throw new Error("WhatsApp not configured");
  }

  const url = `${config.apiUrl}/${config.phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.startsWith("91") ? to : `91${to}`,
      type: "text",
      text: { body: text },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`WhatsApp API error: ${JSON.stringify(data.error || data)}`);
  }
  return data;
}

/**
 * GET /api/whatsapp/status
 * Check if WhatsApp is configured.
 */
router.get("/status", authenticate, (req, res) => {
  res.json({
    configured: isConfigured(),
    phoneNumberId: getConfig().phoneNumberId ? "***configured***" : null,
  });
});

/**
 * POST /api/whatsapp/send-receipt
 * Send order receipt via WhatsApp.
 * Body: { orderId, phone }
 */
router.post("/send-receipt", authenticate, async (req, res, next) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        error: "WhatsApp not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in .env",
      });
    }

    const { orderId, phone } = req.body;
    if (!orderId || !phone) {
      return res.status(400).json({ error: "orderId and phone are required" });
    }

    // Load order + invoice
    const { rows: orders } = await query(
      `SELECT o.*, i.invoice_number, i.grand_total as invoice_total
       FROM orders o
       LEFT JOIN invoices i ON i.order_id = o.id AND i.is_credit_note = FALSE
       WHERE o.id = $1 AND o.outlet_id = $2`,
      [orderId, req.staff.outletId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orders[0];
    const amount = ((order.grand_total || 0) / 100).toFixed(2);
    const invoiceNum = order.invoice_number || "N/A";

    // Load outlet for name
    const { rows: outlets } = await query(`SELECT name FROM outlets WHERE id = $1`, [req.staff.outletId]);
    const outletName = outlets.length > 0 ? outlets[0].name : "SwiftServe";

    // Send as text message (template messages need pre-approval from Meta)
    const text = [
      `Thank you for visiting ${outletName}!`,
      ``,
      `Order #${order.order_number}`,
      `Invoice: ${invoiceNum}`,
      `Amount: ₹${amount}`,
      ``,
      `We hope to see you again!`,
    ].join("\n");

    const result = await sendTextMessage(phone, text);

    // Audit
    await query(
      `INSERT INTO audit_log (outlet_id, staff_id, action, entity_type, entity_id, new_value)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.staff.outletId, req.staff.staffId, "whatsapp_receipt_sent", "order", orderId,
       JSON.stringify({ phone: phone.slice(-4), messageId: result.messages?.[0]?.id })]
    );

    res.json({ sent: true, messageId: result.messages?.[0]?.id });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/whatsapp/send-ready
 * Notify customer that order is ready for pickup.
 * Body: { orderId, phone }
 */
router.post("/send-ready", authenticate, async (req, res, next) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ error: "WhatsApp not configured" });
    }

    const { orderId, phone } = req.body;
    if (!orderId || !phone) {
      return res.status(400).json({ error: "orderId and phone are required" });
    }

    const { rows: orders } = await query(
      `SELECT order_number FROM orders WHERE id = $1 AND outlet_id = $2`,
      [orderId, req.staff.outletId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const { rows: outlets } = await query(`SELECT name FROM outlets WHERE id = $1`, [req.staff.outletId]);
    const outletName = outlets.length > 0 ? outlets[0].name : "SwiftServe";

    const text = `Hi! Your order #${orders[0].order_number} at ${outletName} is READY for pickup. Please collect it from the counter. Thank you!`;

    const result = await sendTextMessage(phone, text);

    res.json({ sent: true, messageId: result.messages?.[0]?.id });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/whatsapp/webhook
 * Meta webhook verification (challenge-response).
 */
router.get("/webhook", (req, res) => {
  const config = getConfig();
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.verifyToken) {
    console.log("[WhatsApp] Webhook verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

/**
 * POST /api/whatsapp/webhook
 * Receive incoming WhatsApp messages (customer replies, order via WhatsApp).
 */
router.post("/webhook", async (req, res) => {
  try {
    // Verify Meta webhook signature (X-Hub-Signature-256) — fail closed
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      console.warn("[WhatsApp] WHATSAPP_APP_SECRET not set — rejecting webhook");
      return res.sendStatus(503);
    }
    const signature = req.headers["x-hub-signature-256"];
    const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(JSON.stringify(req.body)).digest("hex");
    if (!signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return res.sendStatus(403);
    }

    const body = req.body;

    if (body.object !== "whatsapp_business_account") {
      return res.sendStatus(404);
    }

    // Process each entry
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;

        for (const message of change.value?.messages || []) {
          // Mask PII in logs — only show last 4 digits of phone
          console.log(`[WhatsApp] Incoming message from ***${(message.from || "").slice(-4)}: ${message.type}`);

          // TODO: Implement order-via-WhatsApp flow
          // For now, log the message for manual review
          // Future: parse "I want to order..." messages and create orders
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("[WhatsApp] Webhook error:", err);
    res.sendStatus(200); // Always 200 to prevent Meta retries
  }
});

export default router;
