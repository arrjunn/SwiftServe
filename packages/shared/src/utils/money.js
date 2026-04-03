/**
 * Money utilities — ALL monetary values are INTEGER PAISE.
 * ₹100.50 = 10050 paise. Never use floats for money.
 */

/** Convert rupees (number) to paise (integer) */
export function toPaise(rupees) {
  if (typeof rupees !== "number" || !isFinite(rupees)) return 0;
  return Math.round(rupees * 100);
}

/** Convert paise (integer) to rupees (number) — only for DISPLAY */
export function toRupees(paise) {
  return paise / 100;
}

/**
 * Format paise as Indian currency string.
 * formatINR(1234567) → "₹12,345.67"
 * Indian numbering: 1,23,45,678 (after first 3 digits, group by 2)
 */
export function formatINR(paise) {
  if (typeof paise !== "number" || !isFinite(paise)) return "₹0.00";
  const rupees = Math.abs(paise) / 100;
  const [whole, decimal = "00"] = rupees.toFixed(2).split(".");

  // Indian grouping: last 3 digits, then groups of 2
  // e.g. 1234567 → "12,34,567"
  let result = "";
  const len = whole.length;

  if (len <= 3) {
    result = whole;
  } else {
    const last3 = whole.slice(len - 3);
    const rest = whole.slice(0, len - 3);
    // Group `rest` from right in pairs
    const parts = [];
    for (let i = rest.length; i > 0; i -= 2) {
      parts.unshift(rest.slice(Math.max(0, i - 2), i));
    }
    result = parts.join(",") + "," + last3;
  }

  const sign = paise < 0 ? "-" : "";
  return `${sign}₹${result}.${decimal}`;
}

/** Add multiple paise amounts safely */
export function addPaise(...amounts) {
  return amounts.reduce((sum, a) => sum + (a || 0), 0);
}

/** Multiply paise by quantity (e.g., unit_price × qty) */
export function multiplyPaise(paise, quantity) {
  return Math.round(paise * quantity);
}

/**
 * Round to nearest rupee (for grand total).
 * Returns { rounded, roundOff } where roundOff is the adjustment in paise.
 * roundOff is always between -50 and +50 paise.
 */
export function roundToRupee(paise) {
  const rounded = Math.round(paise / 100) * 100;
  return {
    rounded,
    roundOff: rounded - paise,
  };
}
