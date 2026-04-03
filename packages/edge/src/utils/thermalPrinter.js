/**
 * ESC/POS Thermal Printer driver for SwiftServe.
 *
 * Supports printing via:
 * 1. Web Serial API (USB thermal printers) — Chrome/Edge only
 * 2. Network printer (TCP via cloud proxy endpoint)
 *
 * Setup:
 * - USB: Plug in printer, click "Connect Printer" in Settings
 * - Network: Set printer IP in Settings, cloud proxies the ESC/POS data
 *
 * Common 58mm/80mm thermal printers supported:
 * - Epson TM-T20, TM-T88
 * - Star TSP100/TSP650
 * - Generic POS-5890, POS-8220
 */

// ESC/POS command constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
  INIT: [ESC, 0x40],                       // Initialize printer
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  DOUBLE_HEIGHT_ON: [ESC, 0x21, 0x10],
  DOUBLE_WIDTH_ON: [ESC, 0x21, 0x20],
  DOUBLE_ON: [ESC, 0x21, 0x30],            // Double width + height
  NORMAL: [ESC, 0x21, 0x00],
  UNDERLINE_ON: [ESC, 0x2d, 0x01],
  UNDERLINE_OFF: [ESC, 0x2d, 0x00],
  CUT: [GS, 0x56, 0x00],                   // Full cut
  PARTIAL_CUT: [GS, 0x56, 0x01],
  FEED_LINES: (n) => [ESC, 0x64, n],
  LINE_SPACING: (n) => [ESC, 0x33, n],
  CHARSET_PC437: [ESC, 0x74, 0x00],        // US charset
};

const CHAR_WIDTH_58MM = 32;  // characters per line on 58mm
const CHAR_WIDTH_80MM = 48;  // characters per line on 80mm

class ESCPOSBuilder {
  constructor(paperWidth = 80) {
    this.buffer = [];
    this.charWidth = paperWidth === 58 ? CHAR_WIDTH_58MM : CHAR_WIDTH_80MM;
    this.add(CMD.INIT);
    this.add(CMD.CHARSET_PC437);
  }

  add(bytes) {
    this.buffer.push(...bytes);
    return this;
  }

  text(str) {
    const encoder = new TextEncoder();
    this.buffer.push(...encoder.encode(str));
    return this;
  }

  newline() {
    this.buffer.push(LF);
    return this;
  }

  center() { return this.add(CMD.ALIGN_CENTER); }
  left() { return this.add(CMD.ALIGN_LEFT); }
  right() { return this.add(CMD.ALIGN_RIGHT); }
  bold(on = true) { return this.add(on ? CMD.BOLD_ON : CMD.BOLD_OFF); }
  doubleSize() { return this.add(CMD.DOUBLE_ON); }
  normal() { return this.add(CMD.NORMAL); }

  line(char = "-") {
    this.text(char.repeat(this.charWidth));
    return this.newline();
  }

  dashedLine() { return this.line("-"); }

  /**
   * Print two columns: left-aligned label, right-aligned value
   */
  columns(left, right) {
    const maxLeft = this.charWidth - right.length - 1;
    const truncLeft = left.length > maxLeft ? left.slice(0, maxLeft) : left;
    const padding = this.charWidth - truncLeft.length - right.length;
    this.text(truncLeft + " ".repeat(Math.max(padding, 1)) + right);
    return this.newline();
  }

  feed(lines = 3) {
    return this.add(CMD.FEED_LINES(lines));
  }

  cut() {
    return this.feed(3).add(CMD.PARTIAL_CUT);
  }

  build() {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Build ESC/POS receipt data from invoice/order data.
 */
export function buildReceiptData(invoice, orderItems, payments, order, paperWidth = 80) {
  const b = new ESCPOSBuilder(paperWidth);

  // Header
  b.center().bold().doubleSize();
  b.text(invoice.seller_name || "SwiftServe").newline();
  b.normal().center();
  if (invoice.seller_address) b.text(invoice.seller_address).newline();
  if (invoice.seller_gstin) b.text(`GSTIN: ${invoice.seller_gstin}`).newline();
  b.dashedLine();

  // Invoice info
  b.left();
  b.text(`Invoice: ${invoice.invoice_number}`).newline();
  b.text(`Date: ${invoice.invoice_date}`).newline();
  b.text(`Order #${order.order_number}`).newline();
  if (order.type) b.text(`Type: ${order.type === "dine_in" ? "Dine-in" : "Takeaway"}`).newline();
  b.dashedLine();

  // Items
  b.bold().columns("Item", "Amount").bold(false);
  for (const item of orderItems) {
    if (item.is_void) continue;
    const amount = formatPaise(item.line_total);
    b.columns(item.name, amount);
    b.text(`  ${item.quantity} x ${formatPaise(item.effective_price || item.unit_price)}`).newline();
  }
  b.dashedLine();

  // Totals
  b.columns("Subtotal", formatPaise(invoice.subtotal));
  if (invoice.discount_total > 0) {
    b.columns("Discount", `-${formatPaise(invoice.discount_total)}`);
  }
  b.columns("CGST", formatPaise(invoice.cgst_total));
  b.columns("SGST", formatPaise(invoice.sgst_total));
  if (invoice.round_off !== 0) {
    b.columns("Round-off", `${invoice.round_off > 0 ? "+" : ""}${formatPaise(invoice.round_off)}`);
  }
  b.dashedLine();
  b.bold().columns("GRAND TOTAL", formatPaise(invoice.grand_total)).bold(false);
  b.dashedLine();

  // Payment
  for (const p of payments) {
    b.columns(`Payment: ${(p.method || "cash").toUpperCase()}`, formatPaise(p.amount));
    if (p.method === "cash" && p.cash_tendered != null) {
      b.columns("  Tendered", formatPaise(p.cash_tendered));
      b.columns("  Change", formatPaise(p.cash_change));
    }
    if (p.method === "upi" && p.gateway_txn_id) {
      b.text(`  UTR: ${p.gateway_txn_id}`).newline();
    }
  }
  b.dashedLine();

  // Footer
  b.center();
  b.text("Thank you! Visit again.").newline();
  b.cut();

  return b.build();
}

function formatPaise(paise) {
  if (!paise && paise !== 0) return "0.00";
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? "-" : "";
  return `${sign}${rupees.toFixed(2)}`;
}

/**
 * Print via Web Serial API (USB printer).
 * Returns true on success, throws on error.
 */
export async function printViaUSB(data) {
  if (!("serial" in navigator)) {
    throw new Error("Web Serial API not supported. Use Chrome or Edge.");
  }

  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 9600 });

  const writer = port.writable.getWriter();
  try {
    await writer.write(data);
  } finally {
    writer.releaseLock();
    await port.close();
  }

  return true;
}

/**
 * Print via network (sends ESC/POS data to cloud proxy).
 * The cloud endpoint forwards to printer IP via TCP.
 */
export async function printViaNetwork(data, printerIp, printerPort = 9100, cloudApiUrl = "http://localhost:3001") {
  const response = await fetch(`${cloudApiUrl}/api/printer/print`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: data,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Print failed" }));
    throw new Error(err.error || "Print failed");
  }

  return true;
}

/**
 * Auto-detect and print: tries USB first, then network, then browser print.
 */
export async function autoPrint(receiptData, printerConfig = {}) {
  const { method = "auto", printerIp, printerPort, cloudApiUrl } = printerConfig;

  if (method === "usb" || method === "auto") {
    try {
      await printViaUSB(receiptData);
      return { success: true, method: "usb" };
    } catch (err) {
      if (method === "usb") throw err;
      // Fall through to next method
    }
  }

  if ((method === "network" || method === "auto") && printerIp) {
    try {
      await printViaNetwork(receiptData, printerIp, printerPort, cloudApiUrl);
      return { success: true, method: "network" };
    } catch (err) {
      if (method === "network") throw err;
    }
  }

  // Fallback: browser print
  window.print();
  return { success: true, method: "browser" };
}

export { ESCPOSBuilder };
