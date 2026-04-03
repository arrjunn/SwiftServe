import { useState, useEffect, useMemo } from "react";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { TABLE_STATUS } from "@swiftserve/shared";
import { useAuth } from "../contexts/AuthContext.jsx";

const STATUS_COLORS = {
  [TABLE_STATUS.AVAILABLE]: "#22c55e",
  [TABLE_STATUS.OCCUPIED]: "#3b82f6",
  [TABLE_STATUS.RESERVED]: "#f59e0b",
  [TABLE_STATUS.BLOCKED]: "#ef4444",
};

const STATUS_LABELS = {
  [TABLE_STATUS.AVAILABLE]: "Available",
  [TABLE_STATUS.OCCUPIED]: "Occupied",
  [TABLE_STATUS.RESERVED]: "Reserved",
  [TABLE_STATUS.BLOCKED]: "Blocked",
};

const STATUS_CYCLE = [
  TABLE_STATUS.AVAILABLE,
  TABLE_STATUS.OCCUPIED,
  TABLE_STATUS.RESERVED,
  TABLE_STATUS.BLOCKED,
];

const DEFAULT_SECTIONS = ["main", "outdoor", "private", "bar"];

export default function TableManagementScreen({ onBack }) {
  const { staff } = useAuth();
  const [tables, setTables] = useState([]);
  const [activeSection, setActiveSection] = useState("all");
  const [mode, setMode] = useState("grid"); // grid | form | confirm-delete
  const [editingTable, setEditingTable] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ table_number: "", section: "main", capacity: "4" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadTables = async () => {
    const all = await db.floor_tables.where("outlet_id").equals(OUTLET_ID).toArray();
    setTables(all.filter((t) => !t.deleted_at).sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true })));
  };

  useEffect(() => { loadTables(); }, []);

  const sections = useMemo(() => {
    const existing = new Set(tables.map((t) => t.section).filter(Boolean));
    DEFAULT_SECTIONS.forEach((s) => existing.add(s));
    return ["all", ...Array.from(existing).sort()];
  }, [tables]);

  const filteredTables = useMemo(() => {
    if (activeSection === "all") return tables;
    return tables.filter((t) => t.section === activeSection);
  }, [tables, activeSection]);

  const auditLog = async (action, entityId, oldVal, newVal) => {
    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: staff?.id || "unknown",
      action,
      entity_type: "table",
      entity_id: entityId,
      old_value: oldVal ? JSON.stringify(oldVal) : null,
      new_value: newVal ? JSON.stringify(newVal) : null,
      created_at: new Date().toISOString(),
      synced_at: null,
    });
  };

  const cycleStatus = async (table) => {
    const currentIdx = STATUS_CYCLE.indexOf(table.status);
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];
    await setTableStatus(table, nextStatus);
  };

  const setTableStatus = async (table, newStatus) => {
    if (table.status === newStatus) return;
    const now = new Date().toISOString();
    const updates = { status: newStatus, updated_at: now };
    // Clear order link when freeing a table
    if (newStatus === TABLE_STATUS.AVAILABLE) {
      updates.current_order_id = null;
    }
    await db.floor_tables.update(table.id, updates);
    await auditLog("table_status_change", table.id, { status: table.status }, { status: newStatus });
    await loadTables();
  };

  const openAddForm = () => {
    setEditingTable(null);
    setForm({ table_number: "", section: "main", capacity: "4" });
    setError("");
    setMode("form");
  };

  const openEditForm = (table, e) => {
    e.stopPropagation();
    setEditingTable(table);
    setForm({
      table_number: String(table.table_number),
      section: table.section || "main",
      capacity: String(table.capacity || 4),
    });
    setError("");
    setMode("form");
  };

  const openDeleteConfirm = (table, e) => {
    e.stopPropagation();
    setDeleteTarget(table);
    setMode("confirm-delete");
  };

  const handleSave = async () => {
    setError("");
    const tableNum = parseInt(form.table_number, 10);
    if (!form.table_number || isNaN(tableNum) || tableNum <= 0) {
      setError("Valid table number is required");
      return;
    }
    const capacity = parseInt(form.capacity, 10);
    if (isNaN(capacity) || capacity < 1) {
      setError("Capacity must be at least 1");
      return;
    }

    // Check uniqueness
    const duplicate = tables.find(
      (t) => t.table_number === tableNum && (!editingTable || t.id !== editingTable.id)
    );
    if (duplicate) {
      setError(`Table #${tableNum} already exists`);
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (editingTable) {
        const changes = {
          table_number: tableNum,
          section: form.section.trim().toLowerCase() || "main",
          capacity,
          updated_at: now,
        };
        await db.floor_tables.update(editingTable.id, changes);
        await auditLog("table_update", editingTable.id, {
          table_number: editingTable.table_number,
          section: editingTable.section,
          capacity: editingTable.capacity,
        }, changes);
      } else {
        const id = crypto.randomUUID();
        const newTable = {
          id,
          outlet_id: OUTLET_ID,
          table_number: tableNum,
          section: form.section.trim().toLowerCase() || "main",
          capacity,
          status: TABLE_STATUS.AVAILABLE,
          current_order_id: null,
          created_at: now,
          updated_at: now,
        };
        await db.floor_tables.add(newTable);
        await auditLog("table_create", id, null, newTable);
      }
      await loadTables();
      setMode("grid");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await db.floor_tables.update(deleteTarget.id, { deleted_at: now, updated_at: now });
      await auditLog("table_delete", deleteTarget.id, { table_number: deleteTarget.table_number }, { deleted_at: now });
      await loadTables();
      setMode("grid");
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // -- Delete confirmation modal --
  if (mode === "confirm-delete") {
    return (
      <div style={styles.container}>
        <div style={styles.modal}>
          <h2 style={styles.modalTitle}>Delete Table</h2>
          <p style={styles.modalText}>
            Are you sure you want to delete Table #{deleteTarget?.table_number}? This action can be undone by an admin.
          </p>
          {error && <div style={styles.errorBox}>{error}</div>}
          <button
            style={{ ...styles.deleteConfirmBtn, ...(saving ? styles.disabled : {}) }}
            onClick={handleDelete}
            disabled={saving}
          >
            {saving ? "Deleting..." : "Yes, Delete"}
          </button>
          <button style={styles.cancelBtn} onClick={() => { setMode("grid"); setDeleteTarget(null); }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // -- Add/Edit form --
  if (mode === "form") {
    return (
      <div style={styles.container}>
        <div style={styles.modal}>
          <h2 style={styles.modalTitle}>{editingTable ? "Edit Table" : "Add Table"}</h2>

          <label style={styles.label}>Table Number</label>
          <input
            style={styles.input}
            type="number"
            inputMode="numeric"
            value={form.table_number}
            onChange={(e) => setForm({ ...form, table_number: e.target.value })}
            placeholder="e.g. 1, 2, 3..."
          />

          <label style={styles.label}>Section</label>
          <div style={styles.sectionRow}>
            {DEFAULT_SECTIONS.map((s) => (
              <button
                key={s}
                style={{
                  ...styles.sectionChip,
                  ...(form.section === s
                    ? { backgroundColor: "rgba(59,130,246,0.2)", borderColor: "#3b82f6", color: "#93c5fd" }
                    : {}),
                }}
                onClick={() => setForm({ ...form, section: s })}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            style={{ ...styles.input, marginTop: 6 }}
            value={form.section}
            onChange={(e) => setForm({ ...form, section: e.target.value })}
            placeholder="Or type custom section"
          />

          <label style={styles.label}>Capacity</label>
          <input
            style={styles.input}
            type="number"
            inputMode="numeric"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            placeholder="Number of seats"
          />

          {error && <div style={styles.errorBox}>{error}</div>}

          <button
            style={{ ...styles.saveBtn, ...(saving ? styles.disabled : {}) }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : editingTable ? "Update Table" : "Add Table"}
          </button>
          <button style={styles.cancelBtn} onClick={() => setMode("grid")}>
            &#8592; Cancel
          </button>
        </div>
      </div>
    );
  }

  // -- Main grid view --
  return (
    <div style={styles.container}>
      <div style={styles.page}>
        {/* Header */}
        <div style={styles.header}>
          <button style={styles.backBtn} onClick={onBack}>&#8592;</button>
          <h1 style={styles.title}>Table Management</h1>
          <button style={styles.addBtn} onClick={openAddForm}>+ Add</button>
        </div>

        {/* Section filter tabs */}
        <div style={styles.tabsRow}>
          {sections.map((s) => (
            <button
              key={s}
              style={{
                ...styles.tab,
                ...(activeSection === s
                  ? { backgroundColor: "#3b82f6", color: "#fff", borderColor: "#3b82f6" }
                  : {}),
              }}
              onClick={() => setActiveSection(s)}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Status legend */}
        <div style={styles.legendRow}>
          {STATUS_CYCLE.map((s) => (
            <div key={s} style={styles.legendItem}>
              <span style={{ ...styles.legendDot, backgroundColor: STATUS_COLORS[s] }} />
              <span style={styles.legendText}>{STATUS_LABELS[s]}</span>
            </div>
          ))}
        </div>

        {/* Table grid */}
        {filteredTables.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={{ color: "var(--text-dim)", fontSize: 15 }}>No tables found.</p>
            <button style={styles.addBtnLarge} onClick={openAddForm}>+ Add a Table</button>
          </div>
        ) : (
          <div style={styles.grid}>
            {filteredTables.map((table) => {
              const color = STATUS_COLORS[table.status] || "var(--text-dim)";
              return (
                <div
                  key={table.id}
                  style={{
                    ...styles.tableCard,
                    borderColor: color,
                    boxShadow: `0 0 12px ${color}33`,
                  }}
                >
                  <div style={{ ...styles.statusBadge, backgroundColor: color + "22", color }}>
                    {STATUS_LABELS[table.status] || table.status}
                  </div>
                  <div style={styles.tableNumber}>#{table.table_number}</div>
                  <div style={styles.tableMeta}>
                    <span style={styles.metaText}>
                      {(table.section || "main").charAt(0).toUpperCase() + (table.section || "main").slice(1)}
                    </span>
                    <span style={styles.metaDivider}>|</span>
                    <span style={styles.metaText}>{table.capacity || 4} seats</span>
                  </div>
                  {table.status === TABLE_STATUS.OCCUPIED && table.current_order_id && (
                    <div style={styles.orderLink}>
                      Order: {table.current_order_id.slice(0, 8)}...
                    </div>
                  )}
                  {/* Quick status buttons */}
                  <div style={styles.statusBtns}>
                    {STATUS_CYCLE.map((s) => {
                      const isActive = table.status === s;
                      const sColor = STATUS_COLORS[s];
                      return (
                        <button
                          key={s}
                          style={{
                            ...styles.statusBtn,
                            backgroundColor: isActive ? sColor + "33" : "transparent",
                            borderColor: isActive ? sColor : "var(--border)",
                            color: isActive ? sColor : "var(--text-dim)",
                          }}
                          onClick={(e) => { e.stopPropagation(); setTableStatus(table, s); }}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      );
                    })}
                  </div>
                  <div style={styles.cardActions}>
                    <button
                      style={styles.cardEditBtn}
                      onClick={(e) => openEditForm(table, e)}
                    >
                      Edit
                    </button>
                    <button
                      style={styles.cardDeleteBtn}
                      onClick={(e) => openDeleteConfirm(table, e)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "var(--bg-primary)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 16,
    overflowY: "auto",
    color: "var(--text-primary)",
    boxSizing: "border-box",
  },
  page: {
    width: "100%",
    maxWidth: 900,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    padding: "8px 12px",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--text-muted)",
    fontSize: 18,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  title: {
    flex: 1,
    color: "var(--text-primary)",
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
  },
  addBtn: {
    minWidth: 44,
    minHeight: 44,
    padding: "8px 16px",
    backgroundColor: "#3b82f6",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  addBtnLarge: {
    marginTop: 12,
    minHeight: 44,
    padding: "10px 24px",
    backgroundColor: "#3b82f6",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  tabsRow: {
    display: "flex",
    gap: 6,
    overflowX: "auto",
    paddingBottom: 4,
  },
  tab: {
    minHeight: 36,
    padding: "6px 16px",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    whiteSpace: "nowrap",
    textTransform: "capitalize",
  },
  legendRow: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    padding: "4px 0",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    display: "inline-block",
  },
  legendText: {
    fontSize: 12,
    color: "var(--text-muted)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 12,
  },
  tableCard: {
    backgroundColor: "var(--bg-secondary)",
    borderRadius: 14,
    border: "2px solid",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    touchAction: "manipulation",
    transition: "transform 0.1s",
    minHeight: 140,
    justifyContent: "center",
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    padding: "2px 10px",
    borderRadius: 4,
    letterSpacing: 0.5,
  },
  tableNumber: {
    fontSize: 28,
    fontWeight: 800,
    color: "var(--text-primary)",
    lineHeight: 1.1,
  },
  tableMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: "var(--text-muted)",
  },
  metaDivider: {
    color: "var(--border-light)",
    fontSize: 12,
  },
  orderLink: {
    fontSize: 11,
    color: "#60a5fa",
    fontFamily: "monospace",
    marginTop: 2,
  },
  cardActions: {
    display: "flex",
    gap: 6,
    marginTop: 6,
    width: "100%",
  },
  cardEditBtn: {
    flex: 1,
    minHeight: 32,
    padding: "4px 8px",
    backgroundColor: "transparent",
    border: "1px solid var(--border-light)",
    borderRadius: 6,
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  cardDeleteBtn: {
    flex: 1,
    minHeight: 32,
    padding: "4px 8px",
    backgroundColor: "transparent",
    border: "1px solid rgba(239,68,68,0.4)",
    borderRadius: 6,
    color: "#f87171",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  statusBtns: {
    display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4,
  },
  statusBtn: {
    flex: 1, minHeight: 30, padding: "4px 6px", border: "1px solid var(--border)",
    borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer",
    touchAction: "manipulation", textTransform: "capitalize",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  // Modal / Form styles
  modal: {
    backgroundColor: "var(--bg-secondary)",
    borderRadius: 16,
    padding: 28,
    width: "100%",
    maxWidth: 420,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    display: "flex",
    flexDirection: "column",
  },
  modalTitle: {
    color: "var(--text-primary)",
    fontSize: 20,
    fontWeight: 700,
    margin: "0 0 16px 0",
    textAlign: "center",
  },
  modalText: {
    color: "var(--text-muted)",
    fontSize: 14,
    textAlign: "center",
    margin: "0 0 20px 0",
    lineHeight: 1.5,
  },
  label: {
    fontSize: 13,
    color: "var(--text-muted)",
    fontWeight: 600,
    margin: "12px 0 4px 0",
    textTransform: "uppercase",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  sectionRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  sectionChip: {
    minHeight: 36,
    padding: "6px 14px",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    textTransform: "capitalize",
  },
  errorBox: {
    marginTop: 8,
    padding: "10px 14px",
    backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #ef4444",
    borderRadius: 8,
    color: "#fca5a5",
    fontSize: 14,
    textAlign: "center",
  },
  saveBtn: {
    marginTop: 16,
    width: "100%",
    minHeight: 48,
    padding: "12px 24px",
    backgroundColor: "#22c55e",
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  deleteConfirmBtn: {
    width: "100%",
    minHeight: 48,
    padding: "12px 24px",
    backgroundColor: "#ef4444",
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  cancelBtn: {
    marginTop: 10,
    width: "100%",
    minHeight: 44,
    padding: "10px 24px",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    textAlign: "center",
  },
  disabled: { opacity: 0.5, cursor: "not-allowed" },
};
