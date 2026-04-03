import { describe, it, expect } from "vitest";
import {
  generateCreditNoteNumber,
  calculateRefundAmounts,
  validateRefundAmount,
} from "../creditNote.js";

// ---------------------------------------------------------------------------
// generateCreditNoteNumber
// ---------------------------------------------------------------------------
describe("generateCreditNoteNumber", () => {
  it("generates with CN- prefix", () => {
    expect(generateCreditNoteNumber("SS-MUM-", "2526", 142)).toBe("CN-SS-MUM-2526-000142");
  });

  it("pads single digit sequence", () => {
    expect(generateCreditNoteNumber("SS-", "2526", 1)).toBe("CN-SS-2526-000001");
  });

  it("handles 6-digit sequence without extra padding", () => {
    expect(generateCreditNoteNumber("SS-", "2526", 999999)).toBe("CN-SS-2526-999999");
  });

  it("handles sequence exceeding 6 digits", () => {
    expect(generateCreditNoteNumber("SS-", "2526", 1000001)).toBe("CN-SS-2526-1000001");
  });

  it("empty prefix", () => {
    expect(generateCreditNoteNumber("", "2526", 5)).toBe("CN-2526-000005");
  });

  it("different financial year", () => {
    expect(generateCreditNoteNumber("SS-", "2627", 42)).toBe("CN-SS-2627-000042");
  });

  it("sequence 0", () => {
    expect(generateCreditNoteNumber("X-", "2526", 0)).toBe("CN-X-2526-000000");
  });

  it("always starts with CN-", () => {
    const result = generateCreditNoteNumber("INV-", "2526", 10);
    expect(result.startsWith("CN-")).toBe(true);
  });

  it("three digit sequence", () => {
    expect(generateCreditNoteNumber("SS-", "2526", 123)).toBe("CN-SS-2526-000123");
  });

  it("five digit sequence", () => {
    expect(generateCreditNoteNumber("SS-", "2526", 12345)).toBe("CN-SS-2526-012345");
  });
});

// ---------------------------------------------------------------------------
// calculateRefundAmounts
// ---------------------------------------------------------------------------
describe("calculateRefundAmounts", () => {
  it("calculates full refund for single payment", () => {
    const payments = [
      { id: "p1", method: "upi", amount: 10000, is_refund: 0, status: "success" },
    ];
    const result = calculateRefundAmounts(payments, 10000);
    expect(result.refundableAmount).toBe(10000);
    expect(result.refundPayments).toHaveLength(1);
    expect(result.refundPayments[0].originalPaymentId).toBe("p1");
  });

  it("deducts existing refunds from refundable amount", () => {
    const payments = [
      { id: "p1", method: "upi", amount: 10000, is_refund: 0, status: "success" },
      { id: "r1", method: "upi", amount: 3000, is_refund: 1, status: "success" },
    ];
    const result = calculateRefundAmounts(payments, 10000);
    expect(result.refundableAmount).toBe(7000);
  });

  it("returns 0 refundable when fully refunded", () => {
    const payments = [
      { id: "p1", method: "cash", amount: 5000, is_refund: 0, status: "success" },
      { id: "r1", method: "cash", amount: 5000, is_refund: 1, status: "success" },
    ];
    const result = calculateRefundAmounts(payments, 5000);
    expect(result.refundableAmount).toBe(0);
    expect(result.refundPayments).toHaveLength(0);
  });

  it("handles split payments", () => {
    const payments = [
      { id: "p1", method: "cash", amount: 5000, is_refund: 0, status: "success" },
      { id: "p2", method: "upi", amount: 5000, is_refund: 0, status: "success" },
    ];
    const result = calculateRefundAmounts(payments, 10000);
    expect(result.refundableAmount).toBe(10000);
    expect(result.refundPayments).toHaveLength(2);
  });

  it("excludes failed payments from refund list", () => {
    const payments = [
      { id: "p1", method: "upi", amount: 10000, is_refund: 0, status: "failed" },
      { id: "p2", method: "cash", amount: 10000, is_refund: 0, status: "success" },
    ];
    const result = calculateRefundAmounts(payments, 10000);
    expect(result.refundPayments).toHaveLength(1);
    expect(result.refundPayments[0].originalPaymentId).toBe("p2");
  });

  it("handles empty payments array", () => {
    const result = calculateRefundAmounts([], 10000);
    expect(result.refundableAmount).toBe(10000);
    expect(result.refundPayments).toHaveLength(0);
  });

  it("preserves payment method in refund list", () => {
    const payments = [
      { id: "p1", method: "card", amount: 5000, is_refund: 0, status: "success" },
    ];
    const result = calculateRefundAmounts(payments, 5000);
    expect(result.refundPayments[0].method).toBe("card");
  });

  it("preserves payment amount in refund list", () => {
    const payments = [
      { id: "p1", method: "upi", amount: 7500, is_refund: 0, status: "success" },
    ];
    const result = calculateRefundAmounts(payments, 7500);
    expect(result.refundPayments[0].amount).toBe(7500);
  });

  it("multiple existing refunds are summed", () => {
    const payments = [
      { id: "p1", method: "cash", amount: 10000, is_refund: 0, status: "success" },
      { id: "r1", method: "cash", amount: 2000, is_refund: 1, status: "success" },
      { id: "r2", method: "cash", amount: 3000, is_refund: 1, status: "success" },
    ];
    const result = calculateRefundAmounts(payments, 10000);
    expect(result.refundableAmount).toBe(5000);
  });

  it("refunds exceeding grand total yield 0 refundable", () => {
    const payments = [
      { id: "p1", method: "cash", amount: 10000, is_refund: 0, status: "success" },
      { id: "r1", method: "cash", amount: 12000, is_refund: 1, status: "success" },
    ];
    const result = calculateRefundAmounts(payments, 10000);
    expect(result.refundableAmount).toBe(0);
    expect(result.refundPayments).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateRefundAmount
// ---------------------------------------------------------------------------
describe("validateRefundAmount", () => {
  it("accepts valid refund amount", () => {
    const result = validateRefundAmount(5000, 10000);
    expect(result.valid).toBe(true);
  });

  it("accepts refund equal to grand total", () => {
    const result = validateRefundAmount(10000, 10000);
    expect(result.valid).toBe(true);
  });

  it("rejects refund of 0", () => {
    const result = validateRefundAmount(0, 10000);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("positive");
  });

  it("rejects negative refund", () => {
    const result = validateRefundAmount(-100, 10000);
    expect(result.valid).toBe(false);
  });

  it("rejects refund exceeding grand total", () => {
    const result = validateRefundAmount(15000, 10000);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("cannot exceed");
  });

  it("accounts for existing refunds", () => {
    const result = validateRefundAmount(8000, 10000, 5000);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("5000");
  });

  it("accepts when refund + existing equals grand total", () => {
    const result = validateRefundAmount(5000, 10000, 5000);
    expect(result.valid).toBe(true);
  });

  it("rejects when fully refunded already", () => {
    const result = validateRefundAmount(1, 10000, 10000);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("fully refunded");
  });

  it("rejects when over-refunded already", () => {
    const result = validateRefundAmount(1, 10000, 12000);
    expect(result.valid).toBe(false);
  });

  it("defaults existingRefunds to 0", () => {
    const result = validateRefundAmount(10000, 10000);
    expect(result.valid).toBe(true);
  });

  it("accepts 1 paise refund", () => {
    const result = validateRefundAmount(1, 10000);
    expect(result.valid).toBe(true);
  });

  it("rejects when remaining is exactly 0 but requesting 1", () => {
    const result = validateRefundAmount(1, 5000, 5000);
    expect(result.valid).toBe(false);
  });
});
