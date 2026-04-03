import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { ROLE_PERMISSIONS } from "@swiftserve/shared";

const AuthContext = createContext(null);

const SESSION_KEY = "swiftserve_session";
const LOCKOUT_KEY = "swiftserve_lockout";
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const KIOSK_INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes for kiosk
const MAX_SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 hours absolute max
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 60 * 1000; // 60 seconds

/** Read lockout state from localStorage */
function readLockoutState() {
  try {
    const raw = localStorage.getItem(LOCKOUT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Clear expired lockout
      if (parsed.lockedUntil && Date.now() >= parsed.lockedUntil) {
        localStorage.removeItem(LOCKOUT_KEY);
        return { attempts: 0, lockedUntil: 0 };
      }
      return { attempts: parsed.attempts || 0, lockedUntil: parsed.lockedUntil || 0 };
    }
  } catch { /* ignore corrupt data */ }
  return { attempts: 0, lockedUntil: 0 };
}

/** Write lockout state to localStorage */
function writeLockoutState(attempts, lockedUntil) {
  try {
    localStorage.setItem(LOCKOUT_KEY, JSON.stringify({ attempts, lockedUntil }));
  } catch { /* localStorage full or unavailable — degrade gracefully */ }
}

export function AuthProvider({ children }) {
  const [staff, setStaff] = useState(null);
  const [shift, setShift] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const attemptsRef = useRef(0);
  const lockedUntilRef = useRef(0);

  // Restore session from sessionStorage and lockout from localStorage on mount
  useEffect(() => {
    // Restore lockout state from localStorage (survives page refresh)
    const lockout = readLockoutState();
    attemptsRef.current = lockout.attempts;
    lockedUntilRef.current = lockout.lockedUntil;
    setAttempts(lockout.attempts);
    setLockedUntil(lockout.lockedUntil);

    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        const session = JSON.parse(saved);
        const now = Date.now();
        const sinceLastActivity = now - session.lastActivityAt;
        const sinceLogin = now - session.loginAt;
        if (sinceLastActivity < INACTIVITY_TIMEOUT && sinceLogin < MAX_SESSION_DURATION) {
          setStaff(session.staff);
          setShift(session.shift);
        } else {
          sessionStorage.removeItem(SESSION_KEY);
        }
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
  }, []);

  // Persist session on change (loginAt is set once, lastActivityAt updates)
  useEffect(() => {
    if (staff) {
      const existing = sessionStorage.getItem(SESSION_KEY);
      let loginAt = Date.now();
      if (existing) {
        try { loginAt = JSON.parse(existing).loginAt || loginAt; } catch { /* use new */ }
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        staff,
        shift, // null after closeShift — prevents stale shift on reload
        loginAt,
        lastActivityAt: Date.now(),
      }));
    }
  }, [staff, shift]);

  // Inactivity auto-logout + absolute session timeout
  useEffect(() => {
    if (!staff) return;

    let inactivityTimer;
    let absoluteTimer;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      const timeout = staff?.role === "kiosk" ? KIOSK_INACTIVITY_TIMEOUT : INACTIVITY_TIMEOUT;
      inactivityTimer = setTimeout(() => {
        logout();
      }, timeout);
      // Update lastActivityAt (preserve original loginAt) — works even after shift close
      if (staff) {
        const existing = sessionStorage.getItem(SESSION_KEY);
        let loginAt = Date.now();
        if (existing) {
          try { loginAt = JSON.parse(existing).loginAt || loginAt; } catch { /* use new */ }
        }
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
          staff, shift, loginAt, lastActivityAt: Date.now(),
        }));
      }
    };

    // Absolute timeout: force logout after MAX_SESSION_DURATION regardless of activity
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) {
      try {
        const session = JSON.parse(existing);
        const remaining = MAX_SESSION_DURATION - (Date.now() - session.loginAt);
        if (remaining <= 0) {
          logout();
          return;
        }
        absoluteTimer = setTimeout(() => logout(), remaining);
      } catch { /* ignore */ }
    }

    const events = ["mousedown", "touchstart", "keydown", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(inactivityTimer);
      clearTimeout(absoluteTimer);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [staff, shift]);

  const getStaffList = useCallback(async () => {
    // Try hardcoded OUTLET_ID first, then fall back to first outlet in DB
    let all = await db.staff
      .where("outlet_id").equals(OUTLET_ID)
      .toArray();
    if (all.length === 0) {
      // Outlet was created via Supabase setup — find the actual outlet
      const outlet = await db.outlets.toCollection().first();
      if (outlet) {
        all = await db.staff.where("outlet_id").equals(outlet.id).toArray();
      }
    }
    return all.filter((s) => s.is_active === 1);
  }, []);

  const login = useCallback(async (staffId, pin) => {
    setLoginError("");

    // Check lockout
    if (Date.now() < lockedUntilRef.current) {
      const secs = Math.ceil((lockedUntilRef.current - Date.now()) / 1000);
      setLoginError(`Too many attempts. Try again in ${secs}s.`);
      return false;
    }

    const staffRecord = await db.staff.get(staffId);
    if (!staffRecord || !staffRecord.is_active) {
      setLoginError("Staff not found.");
      return false;
    }

    // Kiosk role bypasses PIN check
    const pinValid = staffRecord.role === "kiosk" || await bcrypt.compare(pin, staffRecord.pin_hash);
    if (!pinValid) {
      const newAttempts = attemptsRef.current + 1;
      attemptsRef.current = newAttempts;
      setAttempts(newAttempts);
      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        const newLockTime = Date.now() + LOCKOUT_DURATION;
        lockedUntilRef.current = newLockTime;
        setLockedUntil(newLockTime);
        attemptsRef.current = 0;
        setAttempts(0);
        writeLockoutState(0, newLockTime);
        setLoginError("Too many failed attempts. Locked for 60 seconds.");
      } else {
        writeLockoutState(newAttempts, 0);
        setLoginError(`Wrong PIN. ${MAX_LOGIN_ATTEMPTS - newAttempts} attempts left.`);
      }
      // Audit log
      await db.audit_log.add({
        id: crypto.randomUUID(),
        outlet_id: OUTLET_ID,
        staff_id: staffId,
        action: "login_failed",
        entity_type: "staff",
        entity_id: staffId,
        old_value: null,
        new_value: null,
        created_at: new Date().toISOString(),
        synced_at: null,
      });
      return false;
    }

    // Successful login — clear lockout state
    attemptsRef.current = 0;
    lockedUntilRef.current = 0;
    setAttempts(0);
    setLockedUntil(0);
    writeLockoutState(0, 0);
    const role = staffRecord.role;
    let customPerms = {};
    if (staffRecord.permissions) {
      try { customPerms = JSON.parse(staffRecord.permissions); } catch { /* ignore malformed */ }
    }
    const permissions = {
      ...ROLE_PERMISSIONS[role],
      ...customPerms,
    };

    const staffData = {
      id: staffRecord.id,
      name: staffRecord.name,
      role,
      permissions,
      mustChangePin: staffRecord.must_change_pin === 1,
    };

    setStaff(staffData);

    // Audit log
    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: staffId,
      action: "login",
      entity_type: "staff",
      entity_id: staffId,
      old_value: null,
      new_value: JSON.stringify({ role }),
      created_at: new Date().toISOString(),
      synced_at: null,
    });

    return true;
  }, []);

  const openShift = useCallback(async (openingCash) => {
    if (!staff) return null;

    // Counter, owners, admin, and kiosk can open shifts
    const allowedRoles = ["counter", "owner", "admin", "kiosk"];
    if (!allowedRoles.includes(staff.role)) {
      return null;
    }

    // Wrap entire shift logic in transaction to prevent concurrent duplicates
    const shiftRecord = await db.transaction("rw", ["shifts", "audit_log"], async () => {
      const openShifts = await db.shifts
        .where("outlet_id").equals(OUTLET_ID)
        .filter((s) => s.status === "open")
        .toArray();

      // If current staff already has an open shift, reuse it
      const ownShift = openShifts.find((s) => s.staff_id === staff.id);
      if (ownShift) return ownShift;

      // Auto-close any stale open shifts from other staff
      const now = new Date().toISOString();
      for (const staleShift of openShifts) {
        await db.shifts.update(staleShift.id, {
          status: "closed", closed_at: now,
          notes: "Auto-closed: new shift opened by another staff", updated_at: now,
        });
        await db.audit_log.add({
          id: crypto.randomUUID(), outlet_id: OUTLET_ID, staff_id: staff.id,
          action: "shift_auto_close", entity_type: "shift", entity_id: staleShift.id,
          old_value: JSON.stringify({ staff_id: staleShift.staff_id }),
          new_value: JSON.stringify({ closed_by: staff.id }), created_at: now,
          synced_at: null,
        });
      }

      const newShift = {
        id: crypto.randomUUID(), outlet_id: OUTLET_ID, staff_id: staff.id,
        opened_at: now, closed_at: null, opening_cash: openingCash,
        closing_cash: null, expected_cash: null, cash_difference: null,
        notes: "", status: "open", created_at: now, updated_at: now,
      };
      await db.shifts.add(newShift);
      await db.audit_log.add({
        id: crypto.randomUUID(), outlet_id: OUTLET_ID, staff_id: staff.id,
        action: "shift_open", entity_type: "shift", entity_id: newShift.id,
        old_value: null, new_value: JSON.stringify({ opening_cash: openingCash }),
        created_at: now,
        synced_at: null,
      });
      return newShift;
    });

    setShift(shiftRecord);
    return shiftRecord;
  }, [staff]);

  /** Close current shift with closing cash and notes. Returns shift summary. */
  const closeShift = useCallback(async (closingCash, notes = "") => {
    if (!staff) throw new Error("No staff logged in");
    // If shift is null in state, try to find it in DB
    let activeShift = shift;
    if (!activeShift) {
      // Find any open shift for this staff member (don't rely on OUTLET_ID)
      const allShifts = await db.shifts.where("staff_id").equals(staff.id).toArray();
      const openShift = allShifts.find(s => s.status === "open");
      if (openShift) {
        activeShift = openShift;
        setShift(activeShift);
      } else {
        throw new Error("No open shift found. Open a shift first.");
      }
    }

    const now = new Date().toISOString();

    // Calculate expected cash and close shift atomically
    const summary = await db.transaction("rw", ["shifts", "payments", "audit_log"], async () => {
      // Verify shift is still open in DB (could have been auto-closed by another staff)
      const dbShift = await db.shifts.get(activeShift.id);
      if (!dbShift) throw new Error("Shift record not found");
      if (dbShift.status !== "open") throw new Error("Shift was already closed");

      const allShiftPayments = await db.payments
        .where("shift_id").equals(activeShift.id)
        .toArray();

      const cashIn = allShiftPayments.filter(p => p.method === "cash" && p.status === "success" && !p.is_refund).reduce((sum, p) => sum + p.amount, 0);
      const cashOut = allShiftPayments.filter(p => p.method === "cash" && p.is_refund === 1).reduce((sum, p) => sum + p.amount, 0);
      const expectedCash = (activeShift.opening_cash || 0) + cashIn - cashOut;
      const cashDifference = closingCash - expectedCash;

      await db.shifts.update(activeShift.id, {
        status: "closed",
        closed_at: now,
        closing_cash: closingCash,
        expected_cash: expectedCash,
        cash_difference: cashDifference,
        notes,
        updated_at: now,
      });

      await db.audit_log.add({
        id: crypto.randomUUID(),
        outlet_id: OUTLET_ID,
        staff_id: staff.id,
        action: "shift_close",
        entity_type: "shift",
        entity_id: activeShift.id,
        old_value: JSON.stringify({ opening_cash: activeShift.opening_cash }),
        new_value: JSON.stringify({ closing_cash: closingCash, expected_cash: expectedCash, cash_difference: cashDifference }),
        created_at: now,
        synced_at: null,
      });

      return {
        shiftId: activeShift.id,
        openingCash: activeShift.opening_cash || 0,
        closingCash,
        expectedCash,
        cashDifference,
        cashIn,
        cashOut,
        openedAt: activeShift.opened_at,
        closedAt: now,
      };
    });

    setShift(null);
    return summary;
  }, [staff, shift]);

  /** Get current shift ID — auto-recovers from DB if state is lost */
  const getShiftId = useCallback(async () => {
    if (shift?.id) return shift.id;
    if (!staff) return null;
    const openShifts = await db.shifts.where("staff_id").equals(staff.id).filter(s => s.status === "open").toArray();
    if (openShifts.length > 0) {
      setShift(openShifts[0]);
      return openShifts[0].id;
    }
    // Auto-create shift
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.shifts.add({ id, outlet_id: OUTLET_ID, staff_id: staff.id, opened_at: now, closed_at: null, opening_cash: 0, closing_cash: null, expected_cash: null, cash_difference: null, notes: "", status: "open", created_at: now, updated_at: now });
    const newShift = await db.shifts.get(id);
    setShift(newShift);
    return id;
  }, [staff, shift]);

  const logout = useCallback(() => {
    setStaff(null);
    setShift(null);
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const value = useMemo(() => ({
    staff,
    shift,
    isLoggedIn: !!staff,
    hasShift: !!shift,
    mustChangePin: !!staff?.mustChangePin,
    loginError,
    login,
    logout,
    openShift,
    closeShift,
    getStaffList,
    getShiftId,
  }), [staff, shift, loginError, login, logout, openShift, closeShift, getStaffList, getShiftId]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
