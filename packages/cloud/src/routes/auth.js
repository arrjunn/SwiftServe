import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../db/pool.js";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    "FATAL: JWT_SECRET environment variable is not set. " +
    "The server cannot start without a JWT_SECRET. " +
    "Set JWT_SECRET in your .env file or environment variables."
  );
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET;
const JWT_EXPIRES_IN = "12h";

/**
 * POST /api/auth/login
 * Body: { outletId, pin }
 * Returns: { token, staff: { id, name, role, outletId } }
 */
router.post("/login", async (req, res, next) => {
  try {
    const { outletId, pin } = req.body;

    if (!outletId || !pin) {
      return res.status(400).json({ error: "outletId and pin are required" });
    }

    if (!/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ error: "PIN must be 4-6 digits" });
    }

    // Get active staff for this outlet
    const { rows: staffList } = await query(
      `SELECT id, name, role, pin_hash, outlet_id
       FROM staff
       WHERE outlet_id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
      [outletId]
    );

    if (staffList.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Find matching staff by PIN
    let matched = null;
    for (const staff of staffList) {
      if (await bcrypt.compare(pin, staff.pin_hash)) {
        matched = staff;
        break;
      }
    }

    if (!matched) {
      // Audit failed login
      await query(
        `INSERT INTO audit_log (outlet_id, staff_id, action, entity_type, entity_id, new_value)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [outletId, "00000000-0000-0000-0000-000000000000", "login_failed", "auth", outletId,
         JSON.stringify({ reason: "invalid_pin" })]
      );
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT
    const payload = {
      staffId: matched.id,
      name: matched.name,
      role: matched.role,
      outletId: matched.outlet_id,
    };
    const token = jwt.sign(payload, EFFECTIVE_JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Audit successful login
    await query(
      `INSERT INTO audit_log (outlet_id, staff_id, action, entity_type, entity_id, new_value)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [matched.outlet_id, matched.id, "login_success", "auth", matched.id,
       JSON.stringify({ role: matched.role })]
    );

    res.json({
      token,
      staff: {
        id: matched.id,
        name: matched.name,
        role: matched.role,
        outletId: matched.outlet_id,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/verify
 * Header: Authorization: Bearer <token>
 * Returns: { valid: true, staff: { ... } }
 */
router.post("/verify", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing token" });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET);

    // Verify staff still active
    const { rows } = await query(
      `SELECT id, name, role FROM staff WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
      [decoded.staffId]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Staff deactivated" });
    }

    res.json({ valid: true, staff: decoded });
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    next(err);
  }
});

/**
 * Auth middleware — attach to routes that need auth.
 * Usage: router.get("/protected", authenticate, handler)
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const token = authHeader.slice(7);
    req.staff = jwt.verify(token, EFFECTIVE_JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Role-based authorization middleware.
 * Usage: router.get("/admin", authenticate, authorize("owner", "admin"), handler)
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.staff || !roles.includes(req.staff.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

export default router;
