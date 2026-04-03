import { describe, it, expect } from "vitest";
import {
  DEFAULT_GST_RATE,
  HSN_CODES,
  calculateGST,
  calculateOrderGST,
  isValidGSTIN,
  generateInvoiceNumber,
  getCurrentFY,
} from "../gst.js";

// ---------------------------------------------------------------------------
// Constants sanity checks
// ---------------------------------------------------------------------------
describe("GST constants", () => {
  it("DEFAULT_GST_RATE is 500 (5%)", () => {
    expect(DEFAULT_GST_RATE).toBe(500);
  });

  it("HSN_CODES has RESTAURANT_SERVICE", () => {
    expect(HSN_CODES.RESTAURANT_SERVICE).toBe("9963");
  });
});

// ---------------------------------------------------------------------------
// calculateGST
// ---------------------------------------------------------------------------
describe("calculateGST", () => {
  it("calculates 5% GST (default) on 10000 paise", () => {
    const result = calculateGST(10000);
    expect(result.totalTax).toBe(500);
    expect(result.amountWithTax).toBe(10500);
  });

  it("splits CGST/SGST equally for intra-state", () => {
    const result = calculateGST(10000, 500, false);
    expect(result.cgst).toBe(250);
    expect(result.sgst).toBe(250);
    expect(result.igst).toBe(0);
  });

  it("uses IGST for inter-state", () => {
    const result = calculateGST(10000, 500, true);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
    expect(result.igst).toBe(500);
  });

  it("calculates 12% GST (1200 basis points)", () => {
    const result = calculateGST(10000, 1200);
    expect(result.totalTax).toBe(1200);
    expect(result.amountWithTax).toBe(11200);
  });

  it("calculates 18% GST (1800 basis points)", () => {
    const result = calculateGST(10000, 1800);
    expect(result.totalTax).toBe(1800);
    expect(result.amountWithTax).toBe(11800);
  });

  it("returns 0 tax for 0 amount", () => {
    const result = calculateGST(0);
    expect(result.totalTax).toBe(0);
    expect(result.amountWithTax).toBe(0);
  });

  it("handles odd-paise CGST/SGST split (assigns extra to SGST)", () => {
    // 5% of 10001 = 500.05, rounded to 500
    // 500 / 2 = 250 floor, sgst = 500 - 250 = 250
    const result = calculateGST(10001, 500);
    expect(result.cgst + result.sgst).toBe(result.totalTax);
  });

  it("odd tax amount: 5% of 999 paise = 50 (rounded)", () => {
    // 999 * 500 / 10000 = 49.95, rounded to 50
    const result = calculateGST(999, 500);
    expect(result.totalTax).toBe(50);
    expect(result.cgst).toBe(25);
    expect(result.sgst).toBe(25);
  });

  it("cess is always 0 (not implemented)", () => {
    const result = calculateGST(10000, 1800);
    expect(result.cess).toBe(0);
  });

  it("handles large amounts (10 lakh paise)", () => {
    const result = calculateGST(1000000, 500);
    expect(result.totalTax).toBe(50000);
    expect(result.amountWithTax).toBe(1050000);
  });

  it("28% GST rate on 10000 paise", () => {
    const result = calculateGST(10000, 2800);
    expect(result.totalTax).toBe(2800);
    expect(result.amountWithTax).toBe(12800);
  });

  it("odd split: 5% of 1 paise = 0 (rounds to 0)", () => {
    const result = calculateGST(1, 500);
    expect(result.totalTax).toBe(0);
    expect(result.amountWithTax).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// calculateOrderGST
// ---------------------------------------------------------------------------
describe("calculateOrderGST", () => {
  it("calculates for multiple items", () => {
    const items = [
      { lineTotal: 10000, taxRate: 500 },
      { lineTotal: 20000, taxRate: 500 },
    ];
    const result = calculateOrderGST(items);
    expect(result.subtotal).toBe(30000);
    expect(result.taxTotal).toBe(1500);
    expect(result.grandTotal).toBe(31500);
  });

  it("returns zeros for empty array", () => {
    const result = calculateOrderGST([]);
    expect(result.subtotal).toBe(0);
    expect(result.taxTotal).toBe(0);
    expect(result.grandTotal).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("handles mixed tax rates", () => {
    const items = [
      { lineTotal: 10000, taxRate: 500 },   // 5% -> 500
      { lineTotal: 10000, taxRate: 1800 },  // 18% -> 1800
    ];
    const result = calculateOrderGST(items);
    expect(result.taxTotal).toBe(500 + 1800);
    expect(result.grandTotal).toBe(20000 + 500 + 1800);
  });

  it("inter-state order uses IGST", () => {
    const items = [{ lineTotal: 10000, taxRate: 500 }];
    const result = calculateOrderGST(items, true);
    expect(result.igstTotal).toBe(500);
    expect(result.cgstTotal).toBe(0);
    expect(result.sgstTotal).toBe(0);
  });

  it("intra-state order splits into CGST/SGST", () => {
    const items = [{ lineTotal: 10000, taxRate: 500 }];
    const result = calculateOrderGST(items, false);
    expect(result.cgstTotal).toBe(250);
    expect(result.sgstTotal).toBe(250);
    expect(result.igstTotal).toBe(0);
  });

  it("items array in result contains tax breakdown per item", () => {
    const items = [{ lineTotal: 5000, taxRate: 1200 }];
    const result = calculateOrderGST(items);
    expect(result.items[0].totalTax).toBe(600);
    expect(result.items[0].amountWithTax).toBe(5600);
  });

  it("single item order matches calculateGST directly", () => {
    const items = [{ lineTotal: 15000, taxRate: 500 }];
    const result = calculateOrderGST(items);
    const direct = calculateGST(15000, 500);
    expect(result.taxTotal).toBe(direct.totalTax);
    expect(result.grandTotal).toBe(direct.amountWithTax);
  });

  it("cess totals remain 0", () => {
    const items = [
      { lineTotal: 10000, taxRate: 500 },
      { lineTotal: 20000, taxRate: 1200 },
    ];
    const result = calculateOrderGST(items);
    expect(result.cessTotal).toBe(0);
  });

  it("preserves original item fields in result items", () => {
    const items = [{ lineTotal: 5000, taxRate: 500, name: "Chai" }];
    const result = calculateOrderGST(items);
    expect(result.items[0].name).toBe("Chai");
  });

  it("correctly sums three items", () => {
    const items = [
      { lineTotal: 10000, taxRate: 500 },
      { lineTotal: 20000, taxRate: 500 },
      { lineTotal: 30000, taxRate: 500 },
    ];
    const result = calculateOrderGST(items);
    expect(result.subtotal).toBe(60000);
    expect(result.taxTotal).toBe(3000);
    expect(result.grandTotal).toBe(63000);
  });
});

// ---------------------------------------------------------------------------
// isValidGSTIN
// ---------------------------------------------------------------------------
describe("isValidGSTIN", () => {
  it("accepts valid GSTIN format", () => {
    expect(isValidGSTIN("27AAPFU0939F1ZV")).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidGSTIN(null)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidGSTIN("")).toBe(false);
  });

  it("rejects too short", () => {
    expect(isValidGSTIN("27AAPFU0939F1Z")).toBe(false);
  });

  it("rejects too long", () => {
    expect(isValidGSTIN("27AAPFU0939F1ZVX")).toBe(false);
  });

  it("rejects lowercase letters", () => {
    expect(isValidGSTIN("27aapfu0939f1zv")).toBe(false);
  });

  it("rejects if 'Z' position is wrong", () => {
    expect(isValidGSTIN("27AAPFU0939F1AV")).toBe(false);
  });

  it("rejects state code starting with letter", () => {
    expect(isValidGSTIN("A7AAPFU0939F1ZV")).toBe(false);
  });

  it("accepts another valid GSTIN", () => {
    expect(isValidGSTIN("07AAACR5055K1Z5")).toBe(true);
  });

  it("rejects undefined", () => {
    expect(isValidGSTIN(undefined)).toBe(false);
  });

  it("rejects GSTIN with special characters", () => {
    expect(isValidGSTIN("27AAPFU0939F1Z!")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateInvoiceNumber
// ---------------------------------------------------------------------------
describe("generateInvoiceNumber", () => {
  it("generates with prefix and padded sequence", () => {
    expect(generateInvoiceNumber("SS-MUM-", "2526", 142)).toBe("SS-MUM-2526-000142");
  });

  it("pads single digit to 6 chars", () => {
    expect(generateInvoiceNumber("INV-", "2526", 1)).toBe("INV-2526-000001");
  });

  it("handles sequence at 6 digits (no padding needed)", () => {
    expect(generateInvoiceNumber("INV-", "2526", 999999)).toBe("INV-2526-999999");
  });

  it("handles sequence exceeding 6 digits", () => {
    expect(generateInvoiceNumber("INV-", "2526", 1000001)).toBe("INV-2526-1000001");
  });

  it("empty prefix works", () => {
    expect(generateInvoiceNumber("", "2526", 5)).toBe("2526-000005");
  });

  it("different financial year", () => {
    expect(generateInvoiceNumber("SS-", "2627", 100)).toBe("SS-2627-000100");
  });

  it("sequence 0 pads to 000000", () => {
    expect(generateInvoiceNumber("X-", "2526", 0)).toBe("X-2526-000000");
  });

  it("handles large prefix", () => {
    expect(generateInvoiceNumber("SWIFTSERVE-MUMBAI-OUTLET1-", "2526", 42)).toBe(
      "SWIFTSERVE-MUMBAI-OUTLET1-2526-000042"
    );
  });

  it("handles two digit sequence", () => {
    expect(generateInvoiceNumber("SS-", "2526", 99)).toBe("SS-2526-000099");
  });

  it("handles five digit sequence", () => {
    expect(generateInvoiceNumber("SS-", "2526", 12345)).toBe("SS-2526-012345");
  });
});

// ---------------------------------------------------------------------------
// getCurrentFY
// ---------------------------------------------------------------------------
describe("getCurrentFY", () => {
  it("April 2025 -> 2526", () => {
    expect(getCurrentFY(new Date(2025, 3, 1))).toBe("2526");
  });

  it("March 2026 -> 2526 (still in FY 2025-26)", () => {
    expect(getCurrentFY(new Date(2026, 2, 31))).toBe("2526");
  });

  it("January 2026 -> 2526", () => {
    expect(getCurrentFY(new Date(2026, 0, 15))).toBe("2526");
  });

  it("April 2026 -> 2627 (new FY)", () => {
    expect(getCurrentFY(new Date(2026, 3, 1))).toBe("2627");
  });

  it("December 2025 -> 2526", () => {
    expect(getCurrentFY(new Date(2025, 11, 31))).toBe("2526");
  });

  it("March 2025 -> 2425 (end of FY 2024-25)", () => {
    expect(getCurrentFY(new Date(2025, 2, 31))).toBe("2425");
  });

  it("April 2024 -> 2425", () => {
    expect(getCurrentFY(new Date(2024, 3, 1))).toBe("2425");
  });

  it("February 2030 -> 2930", () => {
    expect(getCurrentFY(new Date(2030, 1, 15))).toBe("2930");
  });

  it("June 2025 -> 2526", () => {
    expect(getCurrentFY(new Date(2025, 5, 15))).toBe("2526");
  });

  it("defaults to current date when no argument passed", () => {
    const result = getCurrentFY();
    expect(result).toMatch(/^\d{4}$/);
  });
});
