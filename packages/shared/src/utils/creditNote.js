/**
 * Credit note utilities for SwiftServe.
 *
 * A credit note is an invoice record with is_credit_note=1 and original_invoice_id set.
 * Credit note numbers use the same sequential counter as invoices (gapless).
 * Format: CN-{prefix}{fy}-{seq}
 */

import { getCurrentFY } from "./gst.js";

/**
 * Generate credit note number.
 * Uses the same invoice sequence counter — shares numbering with invoices.
 * @param {string} prefix - outlet invoice prefix (e.g., "SS-MUM-")
 * @param {string} financialYear - e.g., "2526"
 * @param {number} sequence - next sequence number from outlet
 * @returns {string} e.g., "CN-SS-MUM-2526-000142"
 */
export function generateCreditNoteNumber(prefix, financialYear, sequence) {
  const seq = String(sequence).padStart(6, "0");
  return `CN-${prefix}${financialYear}-${seq}`;
}

/**
 * Calculate refund amounts for an order.
 * Handles both single-payment and split-payment orders.
 *
 * @param {Array<{id: string, method: string, amount: number, is_refund: number}>} payments
 * @param {number} grandTotal - original order grand total in paise
 * @returns {{ refundableAmount: number, refundPayments: Array<{originalPaymentId: string, method: string, amount: number}> }}
 */
export function calculateRefundAmounts(payments, grandTotal) {
  // Filter to non-refund payments
  const originals = payments.filter((p) => !p.is_refund && p.status === "success");

  // Sum existing refunds
  const existingRefunds = payments
    .filter((p) => p.is_refund)
    .reduce((sum, p) => sum + p.amount, 0);

  const maxRefundable = grandTotal - existingRefunds;
  if (maxRefundable <= 0) {
    return { refundableAmount: 0, refundPayments: [] };
  }

  const refundPayments = originals.map((p) => ({
    originalPaymentId: p.id,
    method: p.method,
    amount: p.amount,
  }));

  return {
    refundableAmount: maxRefundable,
    refundPayments,
  };
}

/**
 * Validate that a refund amount does not exceed the original order total.
 * Accounts for previously issued refunds.
 *
 * @param {number} requestedRefund - requested refund in paise
 * @param {number} grandTotal - original order total in paise
 * @param {number} existingRefunds - sum of previous refunds in paise
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateRefundAmount(requestedRefund, grandTotal, existingRefunds = 0) {
  if (requestedRefund <= 0) {
    return { valid: false, message: "Refund amount must be positive" };
  }
  const maxRefundable = grandTotal - existingRefunds;
  if (maxRefundable <= 0) {
    return { valid: false, message: "Order has already been fully refunded" };
  }
  if (requestedRefund > maxRefundable) {
    return { valid: false, message: `Refund cannot exceed ${maxRefundable} paise (remaining refundable amount)` };
  }
  return { valid: true };
}
