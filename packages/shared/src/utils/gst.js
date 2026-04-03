/**
 * GST calculation utilities for Indian QSR.
 *
 * Tax rates stored as basis points: 5% = 500, 12% = 1200, 18% = 1800
 * Restaurant services: typically 5% (no ITC) for non-AC, 5% for AC (w/o ITC),
 * or 18% if ITC is claimed (rare for QSR).
 * Most QSRs use 5% GST rate (HSN 9963).
 */

/** Default GST rate for restaurant services (basis points) */
export const DEFAULT_GST_RATE = 500; // 5%

/** Common HSN codes for QSR */
export const HSN_CODES = {
  RESTAURANT_SERVICE: "9963",
  PACKED_FOOD: "2106",
  BEVERAGES: "2202",
  ICE_CREAM: "2105",
};

/**
 * Calculate GST for a line item.
 * @param {number} taxableAmount - Amount in paise (before tax)
 * @param {number} taxRate - Rate in basis points (500 = 5%)
 * @param {boolean} isInterState - true for IGST, false for CGST+SGST
 * @returns {{ cgst, sgst, igst, cess, totalTax, amountWithTax }}
 */
export function calculateGST(taxableAmount, taxRate = DEFAULT_GST_RATE, isInterState = false) {
  // Tax = taxableAmount × (rate / 10000)
  const totalTax = Math.round(taxableAmount * taxRate / 10000);

  if (isInterState) {
    return {
      cgst: 0,
      sgst: 0,
      igst: totalTax,
      cess: 0,
      totalTax,
      amountWithTax: taxableAmount + totalTax,
    };
  }

  // Intra-state: split equally into CGST and SGST
  const halfTax = Math.floor(totalTax / 2);
  const cgst = halfTax;
  const sgst = totalTax - halfTax; // handles odd paise

  return {
    cgst,
    sgst,
    igst: 0,
    cess: 0,
    totalTax,
    amountWithTax: taxableAmount + totalTax,
  };
}

/**
 * Calculate GST for an entire order (array of line items).
 * Each item: { lineTotal (paise), taxRate (basis points), quantity }
 */
export function calculateOrderGST(items, isInterState = false) {
  let subtotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;
  let cessTotal = 0;

  const itemsWithTax = items.map((item) => {
    const taxable = item.lineTotal;
    const gst = calculateGST(taxable, item.taxRate, isInterState);
    subtotal += taxable;
    cgstTotal += gst.cgst;
    sgstTotal += gst.sgst;
    igstTotal += gst.igst;
    cessTotal += gst.cess;
    return { ...item, ...gst };
  });

  return {
    items: itemsWithTax,
    subtotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    cessTotal,
    taxTotal: cgstTotal + sgstTotal + igstTotal + cessTotal,
    grandTotal: subtotal + cgstTotal + sgstTotal + igstTotal + cessTotal,
  };
}

/**
 * Validate GSTIN format (15 characters).
 * Format: 2-digit state code + 10-char PAN + 1 entity + Z + checksum
 */
export function isValidGSTIN(gstin) {
  if (!gstin || gstin.length !== 15) return false;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin);
}

/**
 * Generate invoice number.
 * Format: PREFIX-FY-SEQUENCE (e.g., SS-MUM-2526-000142)
 */
export function generateInvoiceNumber(prefix, financialYear, sequence) {
  const seq = String(sequence).padStart(6, "0");
  return `${prefix}${financialYear}-${seq}`;
}

/**
 * Get current Indian financial year string.
 * April 2025 → March 2026 = "2526"
 */
export function getCurrentFY(date = new Date()) {
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();
  const fyStart = month >= 3 ? year : year - 1; // April = month 3
  const fyEnd = fyStart + 1;
  return `${String(fyStart).slice(2)}${String(fyEnd).slice(2)}`;
}
