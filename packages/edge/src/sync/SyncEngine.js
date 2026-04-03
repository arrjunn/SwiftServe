import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";

/**
 * SwiftServe Edge Sync Engine.
 *
 * Handles bidirectional sync between the edge POS (Dexie/IndexedDB)
 * and the cloud API. Push-then-pull strategy with last-write-wins
 * conflict resolution on updated_at.
 *
 * All money values remain integer paise throughout sync.
 * All timestamps are ISO 8601.
 */

const SYNCABLE_TABLES = [
  "orders",
  "order_items",
  "payments",
  "invoices",
  "shifts",
  "staff",
  "menu_categories",
  "menu_items",
  "floor_tables",
  "promos",
  "customers",
  "audit_log",
];

export class SyncEngine {
  constructor(apiBaseUrl = "http://localhost:3001") {
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");
    this.token = null;
    this._autoSyncTimer = null;
    this._listeners = new Set();
    this._syncing = false;
  }

  // ─── Event helpers (for UI consumption) ────────────────────────────

  /** Subscribe to status changes. Returns unsubscribe function. */
  onStatusChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify(status) {
    for (const fn of this._listeners) {
      try { fn(status); } catch { /* never crash */ }
    }
  }

  // ─── Auth ──────────────────────────────────────────────────────────

  async login(outletId, pin) {
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId, pin }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Login failed (${res.status})`);
      }
      const data = await res.json();
      this.token = data.token;
      return data;
    } catch (err) {
      console.warn("[SyncEngine] login error:", err.message);
      throw err;
    }
  }

  // ─── Internal fetch wrapper ────────────────────────────────────────

  async _fetch(path, body) {
    if (!navigator.onLine) {
      throw new Error("offline");
    }
    if (!this.token) {
      throw new Error("Not authenticated — call login() first");
    }
    const res = await fetch(`${this.apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || `API error (${res.status})`);
    }
    return res.json();
  }

  // ─── Push ──────────────────────────────────────────────────────────

  async push() {
    const meta = await db.sync_meta.get("singleton");
    if (!meta) throw new Error("sync_meta not initialised — run seed first");

    const lastPushAt = meta.last_push_at || "1970-01-01T00:00:00.000Z";
    const mutations = {};
    let totalRows = 0;

    for (const table of SYNCABLE_TABLES) {
      const dexieTable = db[table];
      if (!dexieTable) continue;

      // Collect rows modified since last push
      const rows = await dexieTable
        .filter((row) => row.updated_at > lastPushAt || row.created_at > lastPushAt)
        .toArray();

      if (rows.length > 0) {
        mutations[table] = rows;
        totalRows += rows.length;
      }
    }

    if (totalRows === 0) {
      return { accepted: 0, conflicts: [], syncedAt: lastPushAt };
    }

    const result = await this._fetch("/api/sync/push", {
      outletId: OUTLET_ID,
      mutations,
    });

    // Update sync_meta
    const now = result.syncedAt || new Date().toISOString();
    await db.sync_meta.update("singleton", {
      last_push_at: now,
      pending_count: 0,
    });

    // Mark pushed rows with synced_at timestamp
    for (const table of Object.keys(mutations)) {
      const dexieTable = db[table];
      if (!dexieTable) continue;
      const ids = mutations[table].map((r) => r.id);
      for (const id of ids) {
        try {
          await dexieTable.update(id, { synced_at: now });
        } catch {
          // Row may have been deleted locally in the meantime — skip silently
        }
      }
    }

    return result;
  }

  // ─── Pull ──────────────────────────────────────────────────────────

  async pull() {
    const meta = await db.sync_meta.get("singleton");
    if (!meta) throw new Error("sync_meta not initialised — run seed first");

    // Build per-table "since" map
    const since = {};
    const fallback = meta.last_pull_at || "1970-01-01T00:00:00.000Z";
    for (const table of SYNCABLE_TABLES) {
      since[table] = fallback;
    }

    const result = await this._fetch("/api/sync/pull", {
      outletId: OUTLET_ID,
      since,
    });

    const serverMutations = result.mutations || {};

    // Upsert into Dexie with last-write-wins on updated_at
    for (const table of Object.keys(serverMutations)) {
      const dexieTable = db[table];
      if (!dexieTable) continue;
      const rows = serverMutations[table];
      if (!rows || rows.length === 0) continue;

      for (const row of rows) {
        try {
          const existing = await dexieTable.get(row.id);
          if (!existing || row.updated_at >= existing.updated_at) {
            await dexieTable.put(row);
          }
          // If local row is newer, skip — local wins
        } catch {
          // Table or row issue — skip silently
        }
      }
    }

    // Update sync_meta
    const pulledAt = result.pulledAt || new Date().toISOString();
    await db.sync_meta.update("singleton", {
      last_pull_at: pulledAt,
    });

    return result;
  }

  // ─── Full sync (push then pull) ────────────────────────────────────

  async sync() {
    if (this._syncing) return { skipped: true };
    if (!navigator.onLine) return { offline: true };

    this._syncing = true;
    this._notify({ isSyncing: true });

    try {
      const pushResult = await this.push();
      const pullResult = await this.pull();
      const lastSyncAt = new Date().toISOString();

      this._notify({
        isSyncing: false,
        lastSyncAt,
        error: null,
      });

      return { pushResult, pullResult, lastSyncAt };
    } catch (err) {
      // Sync failures should never crash the POS
      console.warn("[SyncEngine] sync error:", err.message);
      this._notify({
        isSyncing: false,
        error: err.message,
      });
      return { error: err.message };
    } finally {
      this._syncing = false;
    }
  }

  // ─── Auto-sync polling ─────────────────────────────────────────────

  startAutoSync(intervalMs = 30000) {
    this.stopAutoSync();
    // Fire immediately, then poll
    this.sync();
    this._autoSyncTimer = setInterval(() => this.sync(), intervalMs);
  }

  stopAutoSync() {
    if (this._autoSyncTimer) {
      clearInterval(this._autoSyncTimer);
      this._autoSyncTimer = null;
    }
  }

  // ─── Pending count helper ──────────────────────────────────────────

  async getPendingCount() {
    const meta = await db.sync_meta.get("singleton");
    if (!meta) return 0;
    const lastPushAt = meta.last_push_at || "1970-01-01T00:00:00.000Z";
    let count = 0;
    for (const table of SYNCABLE_TABLES) {
      const dexieTable = db[table];
      if (!dexieTable) continue;
      const rows = await dexieTable
        .filter((row) => row.updated_at > lastPushAt || row.created_at > lastPushAt)
        .count();
      count += rows;
    }
    return count;
  }
}

export default SyncEngine;
