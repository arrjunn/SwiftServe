import { describe, it, expect } from "vitest";
import {
  toPaise,
  toRupees,
  formatINR,
  addPaise,
  multiplyPaise,
  roundToRupee,
} from "../money.js";

// ---------------------------------------------------------------------------
// toPaise
// ---------------------------------------------------------------------------
describe("toPaise", () => {
  it("converts 0 rupees to 0 paise", () => {
    expect(toPaise(0)).toBe(0);
  });

  it("converts 1 rupee to 100 paise", () => {
    expect(toPaise(1)).toBe(100);
  });

  it("converts 99.99 rupees to 9999 paise", () => {
    expect(toPaise(99.99)).toBe(9999);
  });

  it("converts negative rupees to negative paise", () => {
    expect(toPaise(-5)).toBe(-500);
  });

  it("converts fractional rupees correctly (0.01)", () => {
    expect(toPaise(0.01)).toBe(1);
  });

  it("rounds sub-paise amounts (1.005 -> 100 due to float precision)", () => {
    // 1.005 * 100 = 100.49999... in IEEE 754 — Math.round gives 100
    expect(toPaise(1.005)).toBe(100);
  });

  it("handles large numbers (1 crore)", () => {
    expect(toPaise(10000000)).toBe(1000000000);
  });

  it("returns 0 for NaN", () => {
    expect(toPaise(NaN)).toBe(0);
  });

  it("returns 0 for Infinity", () => {
    expect(toPaise(Infinity)).toBe(0);
  });

  it("returns 0 for -Infinity", () => {
    expect(toPaise(-Infinity)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(toPaise(undefined)).toBe(0);
  });

  it("returns 0 for a string", () => {
    expect(toPaise("100")).toBe(0);
  });

  it("handles 0.1 + 0.2 style float correctly via rounding", () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// toRupees
// ---------------------------------------------------------------------------
describe("toRupees", () => {
  it("converts 0 paise to 0 rupees", () => {
    expect(toRupees(0)).toBe(0);
  });

  it("converts 100 paise to 1 rupee", () => {
    expect(toRupees(100)).toBe(1);
  });

  it("converts 10050 paise to 100.50 rupees", () => {
    expect(toRupees(10050)).toBe(100.5);
  });

  it("converts 1 paise to 0.01", () => {
    expect(toRupees(1)).toBe(0.01);
  });

  it("converts negative paise to negative rupees", () => {
    expect(toRupees(-500)).toBe(-5);
  });

  it("converts large values (1 crore paise)", () => {
    expect(toRupees(1000000000)).toBe(10000000);
  });

  it("converts 9999 paise to 99.99", () => {
    expect(toRupees(9999)).toBe(99.99);
  });

  it("converts 50 paise to 0.50", () => {
    expect(toRupees(50)).toBe(0.5);
  });

  it("converts 999999 paise correctly", () => {
    expect(toRupees(999999)).toBe(9999.99);
  });

  it("converts -1 paise to -0.01", () => {
    expect(toRupees(-1)).toBe(-0.01);
  });
});

// ---------------------------------------------------------------------------
// formatINR
// ---------------------------------------------------------------------------
describe("formatINR", () => {
  it("formats 0 paise as ₹0.00", () => {
    expect(formatINR(0)).toBe("₹0.00");
  });

  it("formats 100 paise as ₹1.00", () => {
    expect(formatINR(100)).toBe("₹1.00");
  });

  it("formats 1234567 paise with Indian grouping", () => {
    // 1234567 paise = ₹12,345.67
    expect(formatINR(1234567)).toBe("₹12,345.67");
  });

  it("formats negative values with minus sign", () => {
    expect(formatINR(-500)).toBe("-₹5.00");
  });

  it("formats 1 crore rupees", () => {
    // 1 crore = 1,00,00,000 rupees = 1_00_00_000_00 paise
    expect(formatINR(1_00_00_000_00)).toBe("₹1,00,00,000.00");
  });

  it("formats values under 1000 paise without commas", () => {
    expect(formatINR(99999)).toBe("₹999.99");
  });

  it("formats exactly 1 lakh (₹1,00,000.00)", () => {
    // 1 lakh = ₹100,000 = 10000000 paise
    expect(formatINR(10000000)).toBe("₹1,00,000.00");
  });

  it("returns ₹0.00 for NaN", () => {
    expect(formatINR(NaN)).toBe("₹0.00");
  });

  it("returns ₹0.00 for Infinity", () => {
    expect(formatINR(Infinity)).toBe("₹0.00");
  });

  it("returns ₹0.00 for non-number input", () => {
    expect(formatINR("hello")).toBe("₹0.00");
  });

  it("formats 50 paise as ₹0.50", () => {
    expect(formatINR(50)).toBe("₹0.50");
  });

  it("formats 1 paise as ₹0.01", () => {
    expect(formatINR(1)).toBe("₹0.01");
  });

  it("handles 10 lakh (₹10,00,000.00)", () => {
    expect(formatINR(100000000)).toBe("₹10,00,000.00");
  });
});

// ---------------------------------------------------------------------------
// addPaise
// ---------------------------------------------------------------------------
describe("addPaise", () => {
  it("adds two amounts", () => {
    expect(addPaise(100, 200)).toBe(300);
  });

  it("adds multiple amounts", () => {
    expect(addPaise(100, 200, 300, 400)).toBe(1000);
  });

  it("adds with negative values", () => {
    expect(addPaise(500, -200)).toBe(300);
  });

  it("returns 0 for no arguments", () => {
    expect(addPaise()).toBe(0);
  });

  it("treats null/undefined as 0", () => {
    expect(addPaise(100, null, undefined, 200)).toBe(300);
  });

  it("handles a single argument", () => {
    expect(addPaise(999)).toBe(999);
  });

  it("handles all zeros", () => {
    expect(addPaise(0, 0, 0)).toBe(0);
  });

  it("handles large sums", () => {
    expect(addPaise(999999999, 1)).toBe(1000000000);
  });

  it("handles all negatives", () => {
    expect(addPaise(-100, -200, -300)).toBe(-600);
  });

  it("handles mixed positive and negative summing to zero", () => {
    expect(addPaise(500, -500)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// multiplyPaise
// ---------------------------------------------------------------------------
describe("multiplyPaise", () => {
  it("multiplies by 0 returning 0", () => {
    expect(multiplyPaise(500, 0)).toBe(0);
  });

  it("multiplies by 1 returning same value", () => {
    expect(multiplyPaise(500, 1)).toBe(500);
  });

  it("multiplies by positive integer", () => {
    expect(multiplyPaise(250, 4)).toBe(1000);
  });

  it("multiplies negative paise", () => {
    expect(multiplyPaise(-100, 3)).toBe(-300);
  });

  it("multiplies by negative quantity", () => {
    expect(multiplyPaise(200, -2)).toBe(-400);
  });

  it("handles decimal quantity (1.5 units)", () => {
    expect(multiplyPaise(100, 1.5)).toBe(150);
  });

  it("rounds result for sub-paise amounts", () => {
    expect(multiplyPaise(333, 3)).toBe(999);
  });

  it("rounds when multiplying by fraction", () => {
    expect(multiplyPaise(100, 0.33)).toBe(33);
  });

  it("handles 0 paise", () => {
    expect(multiplyPaise(0, 100)).toBe(0);
  });

  it("handles large multiplication", () => {
    expect(multiplyPaise(10000, 1000)).toBe(10000000);
  });

  it("rounds 0.5 paise up", () => {
    // 3 * 0.5 = 1.5 -> rounds to 2
    expect(multiplyPaise(3, 0.5)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// roundToRupee
// ---------------------------------------------------------------------------
describe("roundToRupee", () => {
  it("returns exactly 0 for 0 paise", () => {
    const { rounded, roundOff } = roundToRupee(0);
    expect(rounded).toBe(0);
    expect(roundOff).toBe(0);
  });

  it("rounds 10050 to 10100 (rounds up at +50)", () => {
    const { rounded, roundOff } = roundToRupee(10050);
    expect(rounded).toBe(10100);
    expect(roundOff).toBe(50);
  });

  it("rounds 10049 to 10000 (rounds down at +49)", () => {
    const { rounded, roundOff } = roundToRupee(10049);
    expect(rounded).toBe(10000);
    expect(roundOff).toBe(-49);
  });

  it("does not change exact rupee amount", () => {
    const { rounded, roundOff } = roundToRupee(50000);
    expect(rounded).toBe(50000);
    expect(roundOff).toBe(0);
  });

  it("handles 99 paise -> rounds to 100", () => {
    const { rounded, roundOff } = roundToRupee(99);
    expect(rounded).toBe(100);
    expect(roundOff).toBe(1);
  });

  it("handles 1 paise -> rounds to 0", () => {
    const { rounded, roundOff } = roundToRupee(1);
    expect(rounded).toBe(0);
    expect(roundOff).toBe(-1);
  });

  it("handles negative amounts", () => {
    // Math.round(-100.5) = -100 in JS (rounds toward +Infinity)
    const { rounded, roundOff } = roundToRupee(-10050);
    expect(rounded).toBe(-10000);
    expect(roundOff).toBe(50);
  });

  it("roundOff = rounded - original always holds", () => {
    const original = 12345;
    const { rounded, roundOff } = roundToRupee(original);
    expect(roundOff).toBe(rounded - original);
  });

  it("handles 100 (exactly 1 rupee)", () => {
    const { rounded, roundOff } = roundToRupee(100);
    expect(rounded).toBe(100);
    expect(roundOff).toBe(0);
  });

  it("handles large amount with trailing paise", () => {
    const { rounded, roundOff } = roundToRupee(9999999);
    // 9999999 / 100 = 99999.99 -> rounds to 100000 * 100 = 10000000
    expect(rounded).toBe(10000000);
    expect(roundOff).toBe(1);
  });

  it("handles 50 paise exactly (rounds to 100)", () => {
    const { rounded, roundOff } = roundToRupee(50);
    expect(rounded).toBe(100);
    expect(roundOff).toBe(50);
  });
});
