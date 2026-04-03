/**
 * Validation utilities for SwiftServe.
 */

/** Validate Indian mobile number (10 digits, starts with 6-9) */
export function isValidPhone(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-+]/g, "");
  // With country code
  if (cleaned.startsWith("91") && cleaned.length === 12) {
    return /^91[6-9]\d{9}$/.test(cleaned);
  }
  // Without country code
  return /^[6-9]\d{9}$/.test(cleaned);
}

/** Validate 6-digit Indian pincode */
export function isValidPincode(pincode) {
  return /^[1-9][0-9]{5}$/.test(pincode);
}

/** Validate staff PIN (4-6 digits) */
export function isValidPIN(pin) {
  return /^\d{4,6}$/.test(pin);
}

/** Validate email */
export function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Validate FSSAI license number (14 digits) */
export function isValidFSSAI(fssai) {
  return /^\d{14}$/.test(fssai);
}

/** Validate UPI VPA format (name@bank) */
export function isValidUPI(vpa) {
  return /^[\w.\-]+@[\w]+$/.test(vpa);
}

/** Sanitize string input (prevent XSS) */
export function sanitize(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
