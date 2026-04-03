/**
 * Reporting operations — aggregate queries for sales, shift, and revenue reports.
 * All money in integer paise.
 */
import { db } from "./index.js";
import { OUTLET_ID } from "./seed.js";

/**
 * Get date range presets.
 * @param {"today"|"yesterday"|"thisWeek"|"thisMonth"} preset
 * @returns {{ start: Date, end: Date }}
 */
export function getDateRange(preset) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (preset) {
    case "today":
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "yesterday":
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case "thisWeek": {
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday start
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case "thisMonth":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    default:
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}

/**
 * Get completed orders in a date range.
 * Note: start/end are local Date objects. We convert to ISO for the index
 * (which stores UTC strings), so the index range correctly covers the local range.
 */
export async function getOrdersInRange(start, end) {
  // Convert local Date bounds to ISO strings for Dexie's lexicographic index comparison
  const startISO = start.toISOString();
  const endISO = end.toISOString();
  return db.orders
    .where("[outlet_id+created_at]")
    .between(
      [OUTLET_ID, startISO],
      [OUTLET_ID, endISO],
      true, true
    )
    .filter((o) => o.status === "completed")
    .toArray();
}

/**
 * Get order items for a set of order IDs (non-void only).
 */
export async function getOrderItemsForOrders(orderIds) {
  if (orderIds.length === 0) return [];
  return db.order_items
    .where("order_id").anyOf(orderIds)
    .filter((i) => !i.is_void)
    .toArray();
}

/**
 * Get successful non-refund payments for a set of order IDs.
 */
export async function getPaymentsForOrders(orderIds) {
  if (orderIds.length === 0) return [];
  return db.payments
    .where("order_id").anyOf(orderIds)
    .filter((p) => p.status === "success" && !p.is_refund)
    .toArray();
}

/**
 * Get shifts in a date range, optionally filtered by staff.
 */
export async function getShiftsInRange(start, end, staffId) {
  let shifts = await db.shifts
    .where("outlet_id").equals(OUTLET_ID)
    .filter((s) => {
      const opened = new Date(s.opened_at);
      return opened >= start && opened <= end;
    })
    .toArray();

  if (staffId) shifts = shifts.filter((s) => s.staff_id === staffId);
  return shifts;
}

// ─── Aggregations (pure JS, run on already-fetched data) ─────

/**
 * Aggregate sales by category.
 */
export function aggregateSalesByCategory(items, categories) {
  const map = {};
  items.forEach((item) => {
    const catId = item.category_id || "uncategorized";
    if (!map[catId]) map[catId] = { categoryId: catId, name: "", revenue: 0, qty: 0 };
    map[catId].revenue += item.line_total || 0;
    map[catId].qty += item.quantity || 0;
  });

  const catMap = {};
  categories.forEach((c) => { catMap[c.id] = c.name; });

  return Object.values(map)
    .map((m) => ({ ...m, name: catMap[m.categoryId] || "Other" }))
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Aggregate sales by item (top N by revenue).
 */
export function aggregateSalesByItem(items, topN = 20) {
  const map = {};
  items.forEach((item) => {
    const key = item.menu_item_id || item.name;
    if (!map[key]) map[key] = { name: item.name, revenue: 0, qty: 0 };
    map[key].revenue += item.line_total || 0;
    map[key].qty += item.quantity || 0;
  });

  return Object.values(map)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, topN);
}

/**
 * Aggregate sales by hour (24-slot array).
 */
export function aggregateSalesByHour(orders) {
  const slots = Array.from({ length: 24 }, (_, i) => ({ hour: i, revenue: 0, count: 0 }));
  orders.forEach((o) => {
    const h = new Date(o.created_at).getHours();
    slots[h].revenue += o.grand_total || 0;
    slots[h].count += 1;
  });
  return slots;
}

/**
 * Aggregate sales by payment method.
 */
export function aggregateSalesByPaymentMethod(payments) {
  const map = {};
  payments.forEach((p) => {
    const method = p.method || "other";
    if (!map[method]) map[method] = { method, total: 0, count: 0 };
    map[method].total += p.amount || 0;
    map[method].count += 1;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}
