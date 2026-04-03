import { describe, it, expect } from "vitest";
import {
  calculateDiscount,
  distributeDiscountProRata,
  requiresOwnerApproval,
} from "../discount.js";

// ---------------------------------------------------------------------------
// calculateDiscount
// ---------------------------------------------------------------------------
describe("calculateDiscount", () => {
  it("calculates 10% percentage discount", () => {
    // 10% = 1000 basis points, subtotal = 10000 paise
    expect(calculateDiscount("percentage", 1000, 10000)).toBe(1000);
  });

  it("calculates 100% percentage discount", () => {
    expect(calculateDiscount("percentage", 10000, 10000)).toBe(10000);
  });

  it("calculates 0% percentage discount returns 0", () => {
    expect(calculateDiscount("percentage", 0, 10000)).toBe(0);
  });

  it("calculates flat discount", () => {
    expect(calculateDiscount("flat", 500, 10000)).toBe(500);
  });

  it("clamps flat discount to subtotal if it exceeds", () => {
    expect(calculateDiscount("flat", 20000, 10000)).toBe(10000);
  });

  it("coupon type behaves like flat", () => {
    expect(calculateDiscount("coupon", 300, 10000)).toBe(300);
  });

  it("returns 0 when subtotal is 0", () => {
    expect(calculateDiscount("percentage", 1000, 0)).toBe(0);
  });

  it("returns 0 when subtotal is negative", () => {
    expect(calculateDiscount("percentage", 1000, -5000)).toBe(0);
  });

  it("returns 0 when value is 0", () => {
    expect(calculateDiscount("flat", 0, 10000)).toBe(0);
  });

  it("returns 0 when value is negative", () => {
    expect(calculateDiscount("flat", -100, 10000)).toBe(0);
  });

  it("floors percentage discount (no rounding up)", () => {
    // 33.33% of 10000 = 3333.33... -> floor to 3333
    expect(calculateDiscount("percentage", 3333, 10000)).toBe(3333);
  });

  it("5% on 9999 paise = floor(499.95) = 499", () => {
    expect(calculateDiscount("percentage", 500, 9999)).toBe(499);
  });

  it("flat discount equal to subtotal returns subtotal", () => {
    expect(calculateDiscount("flat", 5000, 5000)).toBe(5000);
  });

  it("returns 0 when value is undefined/null (falsy)", () => {
    expect(calculateDiscount("flat", null, 10000)).toBe(0);
    expect(calculateDiscount("flat", undefined, 10000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// distributeDiscountProRata
// ---------------------------------------------------------------------------
describe("distributeDiscountProRata", () => {
  it("distributes equally among 2 equal items", () => {
    const items = [{ lineTotal: 5000 }, { lineTotal: 5000 }];
    const result = distributeDiscountProRata(items, 2000);
    expect(result[0].itemDiscount).toBe(1000);
    expect(result[1].itemDiscount).toBe(1000);
  });

  it("distributes pro-rata among 3 unequal items", () => {
    const items = [
      { lineTotal: 2000 },
      { lineTotal: 3000 },
      { lineTotal: 5000 },
    ];
    const result = distributeDiscountProRata(items, 1000);
    // item1: floor(1000 * 2000 / 10000) = 200
    // item2: floor(1000 * 3000 / 10000) = 300
    // item3: 1000 - 200 - 300 = 500 (remainder absorber)
    expect(result[0].itemDiscount).toBe(200);
    expect(result[1].itemDiscount).toBe(300);
    expect(result[2].itemDiscount).toBe(500);
  });

  it("single item gets entire discount", () => {
    const items = [{ lineTotal: 10000 }];
    const result = distributeDiscountProRata(items, 500);
    expect(result[0].itemDiscount).toBe(500);
    expect(result[0].discountedLineTotal).toBe(9500);
  });

  it("last item absorbs rounding remainder", () => {
    const items = [
      { lineTotal: 3333 },
      { lineTotal: 3333 },
      { lineTotal: 3334 },
    ];
    const result = distributeDiscountProRata(items, 100);
    const totalDisc = result.reduce((s, i) => s + i.itemDiscount, 0);
    expect(totalDisc).toBe(100);
  });

  it("clamps discount to subtotal", () => {
    const items = [{ lineTotal: 1000 }];
    const result = distributeDiscountProRata(items, 5000);
    expect(result[0].itemDiscount).toBe(1000);
    expect(result[0].discountedLineTotal).toBe(0);
  });

  it("returns 0 discounts when totalDiscount is 0", () => {
    const items = [{ lineTotal: 5000 }, { lineTotal: 3000 }];
    const result = distributeDiscountProRata(items, 0);
    expect(result[0].itemDiscount).toBe(0);
    expect(result[1].itemDiscount).toBe(0);
  });

  it("returns 0 discounts when totalDiscount is negative", () => {
    const items = [{ lineTotal: 5000 }];
    const result = distributeDiscountProRata(items, -100);
    expect(result[0].itemDiscount).toBe(0);
  });

  it("preserves original item fields", () => {
    const items = [{ lineTotal: 5000, name: "Burger" }];
    const result = distributeDiscountProRata(items, 500);
    expect(result[0].name).toBe("Burger");
  });

  it("discountedLineTotal is correct for each item", () => {
    const items = [{ lineTotal: 8000 }, { lineTotal: 2000 }];
    const result = distributeDiscountProRata(items, 1000);
    result.forEach((item) => {
      expect(item.discountedLineTotal).toBe(item.lineTotal - item.itemDiscount);
    });
  });

  it("sum of all itemDiscounts equals totalDiscount exactly", () => {
    const items = [
      { lineTotal: 1234 },
      { lineTotal: 5678 },
      { lineTotal: 9012 },
      { lineTotal: 3456 },
    ];
    const discount = 777;
    const result = distributeDiscountProRata(items, discount);
    const totalDistributed = result.reduce((s, i) => s + i.itemDiscount, 0);
    expect(totalDistributed).toBe(discount);
  });

  it("handles empty items array", () => {
    const result = distributeDiscountProRata([], 1000);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// requiresOwnerApproval
// ---------------------------------------------------------------------------
describe("requiresOwnerApproval", () => {
  it("returns false when discount is below threshold", () => {
    // 10% discount (1000 of 10000) < 20% threshold
    expect(requiresOwnerApproval(1000, 10000)).toBe(false);
  });

  it("returns true when discount is above default threshold (20%)", () => {
    // 25% discount (2500 of 10000) > 20% threshold
    expect(requiresOwnerApproval(2500, 10000)).toBe(true);
  });

  it("returns false at exactly 20% (not strictly greater)", () => {
    expect(requiresOwnerApproval(2000, 10000)).toBe(false);
  });

  it("returns true for 100% discount", () => {
    expect(requiresOwnerApproval(10000, 10000)).toBe(true);
  });

  it("returns false when subtotal is 0", () => {
    expect(requiresOwnerApproval(500, 0)).toBe(false);
  });

  it("returns false when subtotal is negative", () => {
    expect(requiresOwnerApproval(500, -1000)).toBe(false);
  });

  it("custom threshold: 10%", () => {
    // 15% discount > 10% threshold
    expect(requiresOwnerApproval(1500, 10000, 10)).toBe(true);
  });

  it("custom threshold: 50%", () => {
    // 25% discount < 50% threshold
    expect(requiresOwnerApproval(2500, 10000, 50)).toBe(false);
  });

  it("returns true for very small subtotal with disproportionate discount", () => {
    expect(requiresOwnerApproval(50, 100)).toBe(true);
  });

  it("returns false for 0 discount", () => {
    expect(requiresOwnerApproval(0, 10000)).toBe(false);
  });

  it("returns false at exactly custom threshold", () => {
    expect(requiresOwnerApproval(1000, 10000, 10)).toBe(false);
  });
});
