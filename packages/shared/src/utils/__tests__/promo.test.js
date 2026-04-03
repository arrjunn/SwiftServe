import { describe, it, expect } from "vitest";
import { validatePromo, findPromoByCouponCode } from "../promo.js";

// ---------------------------------------------------------------------------
// Helper: base valid promo record
// ---------------------------------------------------------------------------
function makePromo(overrides = {}) {
  return {
    name: "WELCOME10",
    coupon_code: "WELCOME10",
    type: "percentage",
    value: 1000, // 10% in basis points
    is_active: true,
    valid_from: "2025-01-01",
    valid_until: "2027-12-31",
    usage_limit: 0,
    used_count: 0,
    min_order_value: 0,
    max_discount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validatePromo
// ---------------------------------------------------------------------------
describe("validatePromo", () => {
  it("validates a valid percentage promo", () => {
    const promo = makePromo();
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(1000);
  });

  it("returns error for null promo", () => {
    const result = validatePromo(null, 10000);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid coupon code");
  });

  it("returns error for inactive promo", () => {
    const promo = makePromo({ is_active: false });
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Coupon is inactive");
  });

  it("returns error if promo not yet valid", () => {
    const promo = makePromo({ valid_from: "2027-01-01" });
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Coupon not yet valid");
  });

  it("returns error if promo expired", () => {
    const promo = makePromo({ valid_until: "2025-12-31" });
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Coupon expired");
  });

  it("returns error if usage limit reached", () => {
    const promo = makePromo({ usage_limit: 100, used_count: 100 });
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Coupon usage limit reached");
  });

  it("passes when used_count < usage_limit", () => {
    const promo = makePromo({ usage_limit: 100, used_count: 99 });
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(true);
  });

  it("returns error when subtotal below min_order_value", () => {
    const promo = makePromo({ min_order_value: 50000 });
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Minimum order");
  });

  it("validates flat discount promo", () => {
    const promo = makePromo({ type: "flat", value: 5000 });
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(5000);
  });

  it("flat discount capped at subtotal", () => {
    const promo = makePromo({ type: "flat", value: 20000 });
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(10000);
  });

  it("percentage discount capped by max_discount", () => {
    const promo = makePromo({ value: 5000, max_discount: 2000 }); // 50% off, but max 2000 paise
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(2000);
  });

  it("accepts 'percent' type alias", () => {
    const promo = makePromo({ type: "percent" });
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(1000);
  });

  it("reason string includes promo name and percentage", () => {
    const promo = makePromo();
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.reason).toContain("WELCOME10");
    expect(result.reason).toContain("10%");
  });

  it("reason string for flat promo includes amount", () => {
    const promo = makePromo({ type: "flat", value: 5000, name: "FLAT50" });
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.reason).toContain("FLAT50");
    expect(result.reason).toContain("50");
  });

  it("handles expires_at field as alternative to valid_until", () => {
    const promo = makePromo({ valid_until: null, expires_at: "2025-12-31" });
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Coupon expired");
  });

  it("handles min_order field as alternative to min_order_value", () => {
    const promo = makePromo({ min_order_value: 0, min_order: 50000 });
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(false);
  });

  it("usage_limit of 0 means unlimited", () => {
    const promo = makePromo({ usage_limit: 0, used_count: 99999 });
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(true);
  });

  it("returns error when discount amount would be 0", () => {
    const promo = makePromo({ value: 0 });
    // value is 0, so calculateDiscount = 0 -> but validatePromo checks value * subtotal
    // Actually: Math.floor(10000 * 0 / 10000) = 0 -> discountAmount <= 0
    const result = validatePromo(promo, 10000, "2026-03-28");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Discount amount is zero");
  });
});

// ---------------------------------------------------------------------------
// findPromoByCouponCode
// ---------------------------------------------------------------------------
describe("findPromoByCouponCode", () => {
  const promos = [
    { coupon_code: "WELCOME10", name: "Welcome" },
    { coupon_code: "FLAT50", name: "Flat 50" },
    { coupon_code: "SUMMER", name: "Summer" },
  ];

  it("finds exact match", () => {
    const result = findPromoByCouponCode(promos, "WELCOME10");
    expect(result.name).toBe("Welcome");
  });

  it("finds case-insensitive match", () => {
    const result = findPromoByCouponCode(promos, "welcome10");
    expect(result.name).toBe("Welcome");
  });

  it("trims whitespace from code", () => {
    const result = findPromoByCouponCode(promos, "  FLAT50  ");
    expect(result.name).toBe("Flat 50");
  });

  it("returns null for non-existent code", () => {
    expect(findPromoByCouponCode(promos, "DOESNOTEXIST")).toBeNull();
  });

  it("returns null for null code", () => {
    expect(findPromoByCouponCode(promos, null)).toBeNull();
  });

  it("returns null for empty code", () => {
    expect(findPromoByCouponCode(promos, "")).toBeNull();
  });

  it("returns null for null promos array", () => {
    expect(findPromoByCouponCode(null, "WELCOME10")).toBeNull();
  });

  it("returns null when promos have no coupon_code field", () => {
    const noCode = [{ name: "No code" }];
    expect(findPromoByCouponCode(noCode, "TEST")).toBeNull();
  });

  it("handles mixed case in stored codes", () => {
    const mixed = [{ coupon_code: "MiXeD", name: "Mixed" }];
    expect(findPromoByCouponCode(mixed, "MIXED").name).toBe("Mixed");
  });

  it("returns first match when duplicates exist", () => {
    const dupes = [
      { coupon_code: "DUP", name: "First" },
      { coupon_code: "DUP", name: "Second" },
    ];
    expect(findPromoByCouponCode(dupes, "DUP").name).toBe("First");
  });
});
