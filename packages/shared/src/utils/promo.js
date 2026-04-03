/**
 * Promo/coupon validation utilities for SwiftServe.
 *
 * Promos are stored in the promos table with:
 * - type: 'percentage' | 'flat'
 * - value: basis points (percentage) or paise (flat)
 * - coupon_code: text (case-insensitive match)
 * - usage_limit: max uses (0 = unlimited)
 * - used_count: current uses
 * - valid_from / valid_until: date range (YYYY-MM-DD or ISO string)
 * - min_order_value: minimum subtotal in paise
 * - max_discount: cap for percentage discounts in paise
 * - is_active: boolean
 */

/**
 * Validate a promo record against current order context.
 *
 * @param {object} promo - promo record from database
 * @param {number} subtotal - current order subtotal in paise
 * @param {string} [today] - current date as YYYY-MM-DD (defaults to today)
 * @returns {{ valid: boolean, error?: string, discountAmount?: number, reason?: string }}
 */
export function validatePromo(promo, subtotal, today = null) {
  if (!promo) {
    return { valid: false, error: "Invalid coupon code" };
  }
  if (!promo.is_active) {
    return { valid: false, error: "Coupon is inactive" };
  }

  const now = today || new Date().toISOString().split("T")[0];

  // Date range checks
  if (promo.valid_from) {
    const from = promo.valid_from.split("T")[0];
    if (now < from) {
      return { valid: false, error: "Coupon not yet valid" };
    }
  }
  if (promo.valid_until || promo.expires_at) {
    const until = (promo.valid_until || promo.expires_at).split("T")[0];
    if (now > until) {
      return { valid: false, error: "Coupon expired" };
    }
  }

  // Usage limit
  if (promo.usage_limit && promo.usage_limit > 0 && promo.used_count >= promo.usage_limit) {
    return { valid: false, error: "Coupon usage limit reached" };
  }

  // Minimum order value
  const minOrder = promo.min_order_value || promo.min_order || 0;
  if (minOrder > 0 && subtotal < minOrder) {
    return { valid: false, error: `Minimum order: ₹${(minOrder / 100).toFixed(0)}` };
  }

  // Calculate discount
  let discountAmount = 0;
  let reason = "";

  if (promo.type === "percentage" || promo.type === "percent") {
    discountAmount = Math.floor(subtotal * promo.value / 10000);
    if (promo.max_discount && promo.max_discount > 0) {
      discountAmount = Math.min(discountAmount, promo.max_discount);
    }
    reason = `${promo.name} (${promo.value / 100}% off)`;
  } else {
    // flat
    discountAmount = Math.min(promo.value, subtotal);
    reason = `${promo.name} (₹${promo.value / 100} off)`;
  }

  if (discountAmount <= 0) {
    return { valid: false, error: "Discount amount is zero" };
  }

  return {
    valid: true,
    discountAmount,
    reason,
  };
}

/**
 * Find a promo by coupon code (case-insensitive).
 * @param {Array} promos - array of promo records
 * @param {string} code - coupon code to search
 * @returns {object|null} matching promo or null
 */
export function findPromoByCouponCode(promos, code) {
  if (!code || !promos) return null;
  const normalized = code.trim().toUpperCase();
  return promos.find((p) => p.coupon_code && p.coupon_code.toUpperCase() === normalized) || null;
}
