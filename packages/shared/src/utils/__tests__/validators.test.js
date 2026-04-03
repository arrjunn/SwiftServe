import { describe, it, expect } from "vitest";
import {
  isValidPhone,
  isValidPincode,
  isValidPIN,
  isValidEmail,
  isValidFSSAI,
  isValidUPI,
  sanitize,
} from "../validators.js";

// ---------------------------------------------------------------------------
// isValidPhone
// ---------------------------------------------------------------------------
describe("isValidPhone", () => {
  it("accepts valid 10-digit number starting with 9", () => {
    expect(isValidPhone("9876543210")).toBe(true);
  });

  it("accepts valid 10-digit number starting with 6", () => {
    expect(isValidPhone("6123456789")).toBe(true);
  });

  it("accepts valid 10-digit number starting with 7", () => {
    expect(isValidPhone("7000000000")).toBe(true);
  });

  it("accepts valid 10-digit number starting with 8", () => {
    expect(isValidPhone("8123456789")).toBe(true);
  });

  it("accepts with 91 country code prefix", () => {
    expect(isValidPhone("919876543210")).toBe(true);
  });

  it("accepts with +91 prefix (stripped)", () => {
    expect(isValidPhone("+919876543210")).toBe(true);
  });

  it("rejects too short (9 digits)", () => {
    expect(isValidPhone("987654321")).toBe(false);
  });

  it("rejects too long (11 digits without country code)", () => {
    expect(isValidPhone("98765432101")).toBe(false);
  });

  it("rejects starting with 5", () => {
    expect(isValidPhone("5123456789")).toBe(false);
  });

  it("rejects containing letters", () => {
    expect(isValidPhone("98765abcde")).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidPhone(null)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidPhone("")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidPhone(undefined)).toBe(false);
  });

  it("accepts number with spaces/dashes (cleaned)", () => {
    expect(isValidPhone("98765-43210")).toBe(true);
    expect(isValidPhone("987 654 3210")).toBe(true);
  });

  it("rejects starting with 0", () => {
    expect(isValidPhone("0123456789")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidPincode
// ---------------------------------------------------------------------------
describe("isValidPincode", () => {
  it("accepts valid 6-digit pincode", () => {
    expect(isValidPincode("400001")).toBe(true);
  });

  it("accepts another valid pincode", () => {
    expect(isValidPincode("110001")).toBe(true);
  });

  it("rejects 5-digit code", () => {
    expect(isValidPincode("40001")).toBe(false);
  });

  it("rejects 7-digit code", () => {
    expect(isValidPincode("4000011")).toBe(false);
  });

  it("rejects starting with 0", () => {
    expect(isValidPincode("012345")).toBe(false);
  });

  it("rejects letters", () => {
    expect(isValidPincode("abcdef")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidPincode("")).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidPincode(null)).toBe(false);
  });

  it("accepts highest valid pincode", () => {
    expect(isValidPincode("999999")).toBe(true);
  });

  it("accepts pincode 100000", () => {
    expect(isValidPincode("100000")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidPIN (staff PIN, 4-6 digits)
// ---------------------------------------------------------------------------
describe("isValidPIN", () => {
  it("accepts 4-digit PIN", () => {
    expect(isValidPIN("1234")).toBe(true);
  });

  it("accepts 5-digit PIN", () => {
    expect(isValidPIN("12345")).toBe(true);
  });

  it("accepts 6-digit PIN", () => {
    expect(isValidPIN("123456")).toBe(true);
  });

  it("rejects 3-digit PIN", () => {
    expect(isValidPIN("123")).toBe(false);
  });

  it("rejects 7-digit PIN", () => {
    expect(isValidPIN("1234567")).toBe(false);
  });

  it("rejects letters", () => {
    expect(isValidPIN("abcd")).toBe(false);
  });

  it("rejects mixed alpha-numeric", () => {
    expect(isValidPIN("12ab")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidPIN("")).toBe(false);
  });

  it("accepts all zeros", () => {
    expect(isValidPIN("0000")).toBe(true);
  });

  it("rejects special characters", () => {
    expect(isValidPIN("12@4")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidEmail
// ---------------------------------------------------------------------------
describe("isValidEmail", () => {
  it("accepts standard email", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("accepts email with subdomain", () => {
    expect(isValidEmail("user@mail.example.com")).toBe(true);
  });

  it("accepts email with dots in local part", () => {
    expect(isValidEmail("first.last@example.com")).toBe(true);
  });

  it("accepts email with plus sign", () => {
    expect(isValidEmail("user+tag@example.com")).toBe(true);
  });

  it("rejects missing @", () => {
    expect(isValidEmail("userexample.com")).toBe(false);
  });

  it("rejects missing domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });

  it("rejects missing TLD", () => {
    expect(isValidEmail("user@example")).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidEmail(null)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidEmail(undefined)).toBe(false);
  });

  it("rejects spaces", () => {
    expect(isValidEmail("user @example.com")).toBe(false);
  });

  it("rejects double @", () => {
    expect(isValidEmail("user@@example.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidFSSAI
// ---------------------------------------------------------------------------
describe("isValidFSSAI", () => {
  it("accepts valid 14-digit number", () => {
    expect(isValidFSSAI("12345678901234")).toBe(true);
  });

  it("rejects 13 digits", () => {
    expect(isValidFSSAI("1234567890123")).toBe(false);
  });

  it("rejects 15 digits", () => {
    expect(isValidFSSAI("123456789012345")).toBe(false);
  });

  it("rejects letters", () => {
    expect(isValidFSSAI("1234567890abcd")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidFSSAI("")).toBe(false);
  });

  it("accepts all zeros", () => {
    expect(isValidFSSAI("00000000000000")).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidFSSAI(null)).toBe(false);
  });

  it("rejects special characters", () => {
    expect(isValidFSSAI("1234-5678-9012")).toBe(false);
  });

  it("rejects mixed alpha", () => {
    expect(isValidFSSAI("12345678ABCDEF")).toBe(false);
  });

  it("accepts another valid 14-digit", () => {
    expect(isValidFSSAI("99999999999999")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidUPI
// ---------------------------------------------------------------------------
describe("isValidUPI", () => {
  it("accepts standard VPA", () => {
    expect(isValidUPI("user@upi")).toBe(true);
  });

  it("accepts VPA with bank name", () => {
    expect(isValidUPI("merchant@icici")).toBe(true);
  });

  it("accepts VPA with dots and hyphens", () => {
    expect(isValidUPI("first.last-name@okaxis")).toBe(true);
  });

  it("rejects missing @", () => {
    expect(isValidUPI("userupi")).toBe(false);
  });

  it("rejects missing handle", () => {
    expect(isValidUPI("user@")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidUPI("")).toBe(false);
  });

  it("rejects spaces", () => {
    expect(isValidUPI("user @upi")).toBe(false);
  });

  it("accepts numeric prefix", () => {
    expect(isValidUPI("9876543210@paytm")).toBe(true);
  });

  it("accepts underscore in name", () => {
    expect(isValidUPI("my_store@ybl")).toBe(true);
  });

  it("rejects double @", () => {
    expect(isValidUPI("user@@bank")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sanitize
// ---------------------------------------------------------------------------
describe("sanitize", () => {
  it("escapes < and >", () => {
    expect(sanitize("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("escapes script tags", () => {
    expect(sanitize('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it("returns normal text unchanged", () => {
    expect(sanitize("Hello World")).toBe("Hello World");
  });

  it("escapes ampersand", () => {
    expect(sanitize("A & B")).toBe("A &amp; B");
  });

  it("escapes double quotes", () => {
    expect(sanitize('He said "hi"')).toBe("He said &quot;hi&quot;");
  });

  it("escapes single quotes", () => {
    expect(sanitize("it's")).toBe("it&#x27;s");
  });

  it("returns empty string for non-string input", () => {
    expect(sanitize(null)).toBe("");
    expect(sanitize(undefined)).toBe("");
    expect(sanitize(123)).toBe("");
  });

  it("handles empty string", () => {
    expect(sanitize("")).toBe("");
  });

  it("escapes combination of special chars", () => {
    expect(sanitize('<a href="x">&</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;'
    );
  });

  it("handles string with only special characters", () => {
    expect(sanitize("<>&\"'")).toBe("&lt;&gt;&amp;&quot;&#x27;");
  });

  it("preserves unicode characters", () => {
    expect(sanitize("₹100 मसाला")).toBe("₹100 मसाला");
  });

  it("escapes event handler attribute pattern", () => {
    expect(sanitize('onload="alert(1)"')).toBe('onload=&quot;alert(1)&quot;');
  });
});
