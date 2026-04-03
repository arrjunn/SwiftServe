/**
 * Discount calculation utilities for SwiftServe.
 *
 * Discount is applied BEFORE GST (GST compliance — Section 15(3) CGST Act).
 * All money values are INTEGER PAISE.
 */

import { multiplyPaise } from "./money.js";

/**
 * Calculate discount amount from type and value.
 * @param {'percentage'|'flat'|'coupon'} type
 * @param {number} value - basis points (percentage) or paise (flat/coupon)
 * @param {number} subtotal - order subtotal in paise
 * @returns {number} discount amount in paise
 */
export function calculateDiscount(type, value, subtotal) {
  if (!subtotal || subtotal <= 0 || !value || value <= 0) return 0;

  if (type === "percentage") {
    return Math.floor(subtotal * value / 10000);
  }
  // flat or coupon — value is already in paise
  return Math.min(value, subtotal);
}

/**
 * Distribute a total discount pro-rata across line items.
 * Last item absorbs rounding remainder to guarantee exact sum.
 *
 * @param {Array<{lineTotal: number}>} items - items with lineTotal in paise
 * @param {number} totalDiscount - total discount in paise
 * @returns {Array<{itemDiscount: number, discountedLineTotal: number}>} items with discount fields
 */
export function distributeDiscountProRata(items, totalDiscount) {
  if (!items.length || totalDiscount <= 0) {
    return items.map((item) => ({ ...item, itemDiscount: 0, discountedLineTotal: item.lineTotal }));
  }

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const clamped = Math.min(totalDiscount, subtotal);
  let distributed = 0;

  return items.map((item, idx) => {
    let itemDiscount = 0;
    if (clamped > 0 && subtotal > 0) {
      if (idx === items.length - 1) {
        itemDiscount = clamped - distributed;
      } else {
        itemDiscount = Math.floor((clamped * item.lineTotal) / subtotal);
        distributed += itemDiscount;
      }
    }
    return {
      ...item,
      itemDiscount,
      discountedLineTotal: item.lineTotal - itemDiscount,
    };
  });
}

/**
 * Check if a discount percentage requires owner authorization.
 * @param {number} discountPaise - discount amount in paise
 * @param {number} subtotal - order subtotal in paise
 * @param {number} threshold - percentage threshold in whole percent (default 20)
 * @returns {boolean} true if owner PIN is required
 */
export function requiresOwnerApproval(discountPaise, subtotal, threshold = 20) {
  if (!subtotal || subtotal <= 0) return false;
  const pct = (discountPaise / subtotal) * 100;
  return pct > threshold;
}
