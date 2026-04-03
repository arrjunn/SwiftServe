import { useState, useCallback, useRef } from "react";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";

/**
 * Reusable PIN challenge hook for owner authorization.
 *
 * Usage:
 *   const { requestPIN, showModal, pinInput, setPinInput, pinError, handleSubmit, handleCancel } = usePINChallenge();
 *
 *   // Trigger the challenge:
 *   const result = await requestPIN("discount_override");
 *   // result = { staffId, staffName } on success, null on cancel
 *
 * The caller renders <PINModal /> using the returned state.
 */
export default function usePINChallenge() {
  const [showModal, setShowModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const resolveRef = useRef(null);

  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 60000; // 60 seconds

  const requestPIN = useCallback((permissionKey) => {
    return new Promise((resolve) => {
      // Check lockout
      if (lockedUntil && Date.now() < lockedUntil) {
        const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
        setPinError(`Locked out. Try again in ${remaining}s`);
        resolve(null);
        return;
      }

      resolveRef.current = resolve;
      setPinInput("");
      setPinError("");
      setShowModal(true);
    });
  }, [lockedUntil]);

  const handleSubmit = useCallback(async () => {
    if (pinInput.length < 4) {
      setPinError("Enter owner PIN (4-6 digits)");
      return;
    }

    // Check lockout
    if (lockedUntil && Date.now() < lockedUntil) {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      setPinError(`Locked out. Try again in ${remaining}s`);
      return;
    }

    try {
      const owners = await db.staff
        .where("role")
        .anyOf("owner", "admin")
        .filter((s) => s.is_active === 1)
        .toArray();

      let verified = null;
      for (const owner of owners) {
        if (await bcrypt.compare(pinInput, owner.pin_hash)) {
          verified = { staffId: owner.id, staffName: owner.name };
          break;
        }
      }

      if (!verified) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setPinInput("");

        if (newAttempts >= MAX_ATTEMPTS) {
          const lockTime = Date.now() + LOCKOUT_MS;
          setLockedUntil(lockTime);
          setPinError(`Too many attempts. Locked for 60s`);
          setAttempts(0);

          // Log lockout
          try {
            await db.audit_log.add({
              id: crypto.randomUUID(),
              outlet_id: owners[0]?.outlet_id || "unknown",
              staff_id: "unknown",
              action: "pin_lockout",
              entity_type: "auth",
              entity_id: "pin_challenge",
              old_value: null,
              new_value: JSON.stringify({ attempts: MAX_ATTEMPTS }),
              created_at: new Date().toISOString(),
              synced_at: null,
            });
          } catch (_) { /* audit failure is non-fatal */ }
        } else {
          setPinError(`Invalid PIN (${MAX_ATTEMPTS - newAttempts} attempts left)`);
        }
        return;
      }

      // Success
      setAttempts(0);
      setShowModal(false);
      setPinInput("");
      setPinError("");
      if (resolveRef.current) {
        resolveRef.current(verified);
        resolveRef.current = null;
      }
    } catch (err) {
      setPinError("Verification failed");
    }
  }, [pinInput, attempts, lockedUntil]);

  const handleCancel = useCallback(() => {
    setShowModal(false);
    setPinInput("");
    setPinError("");
    if (resolveRef.current) {
      resolveRef.current(null);
      resolveRef.current = null;
    }
  }, []);

  return {
    requestPIN,
    showModal,
    pinInput,
    setPinInput,
    pinError,
    handleSubmit,
    handleCancel,
  };
}
