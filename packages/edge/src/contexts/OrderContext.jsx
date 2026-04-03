import { createContext, useContext, useReducer, useCallback, useMemo } from "react";
import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";
import { modifyOrder, deductInventoryForOrder, awardLoyaltyPoints } from "../db/orderOps.js";
import { calculateGST, roundToRupee, addPaise, multiplyPaise, getCurrentFY, generateInvoiceNumber } from "@swiftserve/shared";

const OrderContext = createContext(null);

const initialState = {
  items: [],          // { id, menuItemId, name, shortName, foodType, qty, unitPrice, taxRate, hsnCode, station, notes }
  orderType: "dine_in",
  orderSource: "counter",  // counter | zomato | swiggy | whatsapp | captain
  tableId: null,
  customerId: null,   // linked customer for loyalty points
  status: "draft",    // draft | saved | paid | invoiced
  orderId: null,
  orderNumber: null,
  orderNotes: "",     // general order-level notes
  // Discount state
  discountType: null,     // 'percentage' | 'flat' | 'coupon'
  discountValue: 0,       // percentage in basis points (1000 = 10%) or flat in paise
  discountAmount: 0,      // computed discount in paise
  discountReason: null,   // display string
  couponCode: null,
  promoId: null,
};

function orderReducer(state, action) {
  switch (action.type) {
    case "ADD_ITEM": {
      // Match by menuItemId + variant + addons (items with different customizations are separate)
      const itemKey = `${action.item.menuItemId}|${action.item.variantName || ""}|${action.item.addonsJson || "[]"}`;
      const existing = state.items.find((i) => {
        const existingKey = `${i.menuItemId}|${i.variantName || ""}|${i.addonsJson || "[]"}`;
        return existingKey === itemKey;
      });
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) => {
            const existingKey = `${i.menuItemId}|${i.variantName || ""}|${i.addonsJson || "[]"}`;
            return existingKey === itemKey ? { ...i, qty: i.qty + 1 } : i;
          }),
        };
      }
      return {
        ...state,
        items: [...state.items, { ...action.item, id: uuid(), qty: 1, notes: null }],
      };
    }
    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.id),
      };
    case "UPDATE_QTY": {
      if (action.qty <= 0) {
        return { ...state, items: state.items.filter((i) => i.id !== action.id) };
      }
      const clampedQty = Math.min(action.qty, 99);
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, qty: clampedQty } : i
        ),
      };
    }
    case "SET_ITEM_NOTES":
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, notes: action.notes } : i
        ),
      };
    case "SET_ORDER_NOTES":
      return { ...state, orderNotes: action.notes };
    case "SET_ORDER_TYPE":
      return { ...state, orderType: action.orderType };
    case "SET_ORDER_SOURCE":
      return { ...state, orderSource: action.orderSource };
    case "SET_TABLE":
      return { ...state, tableId: action.tableId };
    case "SET_CUSTOMER":
      return { ...state, customerId: action.customerId };
    case "MARK_SAVED":
      return { ...state, status: "saved", orderId: action.orderId, orderNumber: action.orderNumber };
    case "MARK_PAID":
      return { ...state, status: "paid" };
    case "MARK_INVOICED":
      return { ...state, status: "invoiced" };
    case "MARK_HELD":
      return { ...state, status: "held", orderId: action.orderId, orderNumber: action.orderNumber };
    case "LOAD_HELD_ORDER":
      return {
        ...initialState,
        items: action.items.map((i) => ({ ...i, id: uuid(), notes: i.notes || null })),
        orderType: action.orderType || "dine_in",
        orderId: action.orderId || null,
        orderNumber: action.orderNumber || null,
        orderNotes: action.orderNotes || "",
        status: action.orderId ? "saved" : "draft",
      };
    case "APPLY_DISCOUNT": {
      // Compute discount from CURRENT state to avoid stale closure
      let rawSubtotal = 0;
      for (const item of state.items) {
        rawSubtotal += multiplyPaise(item.unitPrice, item.qty);
      }
      let discountAmount = 0;
      if (action.discountType === "percentage") {
        discountAmount = Math.floor(rawSubtotal * action.discountValue / 10000);
      } else if (action.discountType === "flat" || action.discountType === "coupon") {
        discountAmount = Math.min(action.discountValue, rawSubtotal);
      }
      return {
        ...state,
        discountType: action.discountType,
        discountValue: action.discountValue,
        discountAmount,
        discountReason: action.discountReason,
        couponCode: action.couponCode || null,
        promoId: action.promoId || null,
      };
    }
    case "CLEAR_DISCOUNT":
      return {
        ...state,
        discountType: null,
        discountValue: 0,
        discountAmount: 0,
        discountReason: null,
        couponCode: null,
        promoId: null,
      };
    case "RESET":
      return { ...initialState };
    default:
      return state;
  }
}

/**
 * Calculate totals for the current cart.
 * Discount is applied BEFORE GST (GST compliance — Section 15(3) CGST Act).
 * Pro-rata discount distribution across items for correct per-item GST on invoice.
 */
function calcTotals(items, discountAmount = 0) {
  if (items.length === 0) {
    return { items: [], subtotal: 0, discountAmount: 0, taxTotal: 0, cgstTotal: 0, sgstTotal: 0, roundOff: 0, grandTotal: 0 };
  }

  // Step 1: Calculate raw subtotal (pre-discount)
  let subtotal = 0;
  const rawItems = items.map((item) => {
    const lineTotal = multiplyPaise(item.unitPrice, item.qty);
    subtotal += lineTotal;
    return { ...item, lineTotal };
  });

  // Step 2: Clamp discount
  const clampedDiscount = Math.min(Math.max(discountAmount, 0), subtotal);

  // Step 3: Pro-rata discount distribution
  let discountDistributed = 0;
  const withDiscount = rawItems.map((item, idx) => {
    let itemDiscount = 0;
    if (clampedDiscount > 0 && subtotal > 0) {
      if (idx === rawItems.length - 1) {
        // Last item gets remainder to avoid rounding drift
        itemDiscount = clampedDiscount - discountDistributed;
      } else {
        itemDiscount = Math.floor((clampedDiscount * item.lineTotal) / subtotal);
        discountDistributed += itemDiscount;
      }
    }
    return { ...item, itemDiscount, discountedLineTotal: item.lineTotal - itemDiscount };
  });

  // Step 4: Calculate GST on discounted line totals
  let taxTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;

  const computed = withDiscount.map((item) => {
    const gst = calculateGST(item.discountedLineTotal, item.taxRate);
    taxTotal += gst.totalTax;
    cgstTotal += gst.cgst;
    sgstTotal += gst.sgst;
    return {
      ...item,
      cgst: gst.cgst,
      sgst: gst.sgst,
      taxTotal: gst.totalTax,
    };
  });

  const discountedSubtotal = subtotal - clampedDiscount;
  const beforeRound = addPaise(discountedSubtotal, taxTotal);
  const { rounded: grandTotal, roundOff } = roundToRupee(beforeRound);

  return { items: computed, subtotal, discountAmount: clampedDiscount, taxTotal, cgstTotal, sgstTotal, roundOff, grandTotal };
}

/**
 * Build order_items rows from computed cart items.
 * Shared by saveOrder and holdOrder to avoid duplication.
 */
function buildOrderItems(computedItems, orderId, outletId) {
  const now = new Date().toISOString();
  return computedItems.map((item) => ({
    id: uuid(),
    outlet_id: outletId,
    order_id: orderId,
    menu_item_id: item.menuItemId,
    name: item.name,
    variant_name: item.variantName || null,
    quantity: item.qty,
    unit_price: item.unitPrice,
    variant_add: item.variantAdd || 0,
    addon_total: item.addonTotal || 0,
    effective_price: item.unitPrice,
    line_total: item.lineTotal,
    tax_rate: item.taxRate,
    cgst_amount: item.cgst,
    sgst_amount: item.sgst,
    cess_amount: 0,
    tax_total: item.taxTotal,
    hsn_code: item.hsnCode,
    food_type: item.foodType,
    addons_json: item.addonsJson || "[]",
    station: item.station,
    kds_status: "pending",
    notes: item.notes || null,
    is_void: 0,
    void_reason: null,
    void_by: null,
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted_at: null,
  }));
}

/**
 * Persist payment record(s) and complete the order.
 * Shared by recordCashPayment, recordUPIPayment, and recordSplitPayments.
 *
 * @param {Array}  paymentRecords  - one or more payment rows to insert
 * @param {string} orderId         - the order being paid
 * @param {string|null} tableId    - table to release (dine-in) or null
 * @param {string|null} customerId - for loyalty points
 * @param {number} grandTotal      - order grand total in paise
 * @param {string} staffId         - acting staff member
 * @param {object} auditNewValue   - JSON-serializable object for the audit log new_value
 * @param {Function} dispatch      - React dispatch for MARK_PAID
 */
async function persistPayment(paymentRecords, orderId, tableId, customerId, grandTotal, staffId, auditNewValue, dispatch, overrideOrderId = null) {
  const effectiveOrderId = overrideOrderId || orderId;
  if (!effectiveOrderId) throw new Error("Cannot record payment: no orderId available");
  const now = new Date().toISOString();

  const txTables = ["payments", "orders", "audit_log"];
  if (tableId) txTables.push("floor_tables");

  await db.transaction("rw", txTables, async () => {
    for (const pr of paymentRecords) {
      await db.payments.add(pr);
    }
    await db.orders.update(effectiveOrderId, {
      status: "completed",
      completed_at: now,
      updated_at: now,
    });
    if (tableId) {
      await db.floor_tables.update(tableId, {
        status: "available",
        current_order_id: null,
        updated_at: now,
      });
    }
    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: staffId,
      action: "payment_received",
      entity_type: "payment",
      entity_id: paymentRecords[0].id,
      old_value: null,
      new_value: JSON.stringify(auditNewValue),
      created_at: now,
      synced_at: null,
    });
  });

  dispatch({ type: "MARK_PAID" });
  // Post-payment hooks (non-blocking)
  deductInventoryForOrder(effectiveOrderId, staffId).catch(() => {});
  awardLoyaltyPoints(effectiveOrderId, customerId, grandTotal, staffId).catch(() => {});
}

export function OrderProvider({ children }) {
  const [state, dispatch] = useReducer(orderReducer, initialState);

  const totals = useMemo(
    () => calcTotals(state.items, state.discountAmount),
    [state.items, state.discountAmount]
  );

  const addItem = useCallback((menuItem, selectedVariant = null, selectedAddons = []) => {
    const variantAdd = selectedVariant ? (selectedVariant.price_add || selectedVariant.price || 0) : 0;
    const addonTotal = selectedAddons.reduce((s, a) => s + (a.price || 0), 0);
    const effectivePrice = menuItem.price + variantAdd + addonTotal;

    dispatch({
      type: "ADD_ITEM",
      item: {
        menuItemId: menuItem.id,
        name: menuItem.name,
        shortName: menuItem.short_name,
        foodType: menuItem.food_type,
        unitPrice: effectivePrice,
        basePrice: menuItem.price,
        variantName: selectedVariant?.name || null,
        variantAdd,
        addonTotal,
        addonsJson: selectedAddons.length > 0 ? JSON.stringify(selectedAddons.map(a => a.name)) : "[]",
        taxRate: menuItem.tax_rate,
        hsnCode: menuItem.hsn_code,
        station: menuItem.station,
      },
    });
  }, []);

  const removeItem = useCallback((id) => {
    dispatch({ type: "REMOVE_ITEM", id });
  }, []);

  const updateQty = useCallback((id, qty) => {
    dispatch({ type: "UPDATE_QTY", id, qty });
  }, []);

  const setOrderType = useCallback((orderType) => {
    dispatch({ type: "SET_ORDER_TYPE", orderType });
  }, []);

  const setOrderSource = useCallback((orderSource) => {
    dispatch({ type: "SET_ORDER_SOURCE", orderSource });
  }, []);

  const setTable = useCallback((tableId) => {
    dispatch({ type: "SET_TABLE", tableId });
  }, []);

  const setCustomer = useCallback((customerId) => {
    dispatch({ type: "SET_CUSTOMER", customerId });
  }, []);

  const setItemNotes = useCallback((id, notes) => {
    dispatch({ type: "SET_ITEM_NOTES", id, notes });
  }, []);

  const setOrderNotes = useCallback((notes) => {
    dispatch({ type: "SET_ORDER_NOTES", notes });
  }, []);

  /** Apply discount to the order. Reducer computes discountAmount from current state. */
  const applyDiscount = useCallback((discountType, discountValue, discountReason, couponCode = null, promoId = null) => {
    dispatch({
      type: "APPLY_DISCOUNT",
      discountType,
      discountValue,
      discountReason,
      couponCode,
      promoId,
    });
  }, []);

  /** Clear any applied discount. */
  const clearDiscount = useCallback(() => {
    dispatch({ type: "CLEAR_DISCOUNT" });
  }, []);

  /** Save order to IndexedDB. Returns order record. */
  const saveOrder = useCallback(async (staffId, shiftId) => {
    try {
      if (state.items.length === 0) return null;

      // Resumed held order — update existing order instead of creating new
      if (state.orderId) {
        const { items: computedItems, subtotal, taxTotal, roundOff, grandTotal, discountAmount } = totals;
        await modifyOrder(state.orderId, computedItems, totals, staffId);
        await db.orders.update(state.orderId, {
          staff_id: staffId,
          shift_id: shiftId,
          discount_amount: discountAmount || 0,
          discount_reason: state.discountReason || null,
          updated_at: new Date().toISOString(),
        });
        return { id: state.orderId, order_number: state.orderNumber, grand_total: grandTotal };
      }

      const { items: computedItems, subtotal, taxTotal, roundOff, grandTotal, discountAmount } = totals;
      const now = new Date().toISOString();
      const orderId = uuid();

      let orderNumber;
      let orderRecord;

      const orderItems = buildOrderItems(computedItems, orderId, OUTLET_ID);

      const tablesToUse = ["orders", "order_items", "audit_log", "outlets"];
      if (state.promoId) tablesToUse.push("promos");
      if (state.tableId) tablesToUse.push("floor_tables");

      await db.transaction("rw", tablesToUse, async () => {
        // Atomic order number: read-increment-write on the outlet record (no race condition)
        const outlet = await db.outlets.get(OUTLET_ID);
        const seq = outlet.next_order_seq || 1;
        await db.outlets.update(OUTLET_ID, {
          next_order_seq: seq + 1,
          updated_at: new Date().toISOString(),
        });
        orderNumber = seq;

        orderRecord = {
          id: orderId,
          outlet_id: OUTLET_ID,
          order_number: orderNumber,
          source: state.orderSource || "counter",
          type: state.orderType,
          status: "received",
          table_id: state.tableId,
          staff_id: staffId,
          shift_id: shiftId,
          customer_id: state.customerId || null,
          subtotal,
          tax_total: taxTotal,
          discount_amount: discountAmount || 0,
          discount_reason: state.discountReason || null,
          round_off: roundOff,
          grand_total: grandTotal,
          external_order_id: null,
          received_at: now,
          preparing_at: null,
          ready_at: null,
          served_at: null,
          completed_at: null,
          cancelled_at: null,
          cancel_reason: null,
          is_held: 0,
          held_reason: state.orderNotes || null,
          created_at: now,
          updated_at: now,
          synced_at: null,
          deleted_at: null,
        };

        await db.orders.add(orderRecord);
        await db.order_items.bulkAdd(orderItems);

        // Update table status for dine-in orders
        if (state.tableId && state.orderType === "dine_in") {
          await db.floor_tables.update(state.tableId, {
            status: "occupied",
            current_order_id: orderId,
            updated_at: now,
          });
        }

        // Increment promo usage if coupon was used
        if (state.promoId) {
          const promo = await db.promos.get(state.promoId);
          if (promo) {
            await db.promos.update(state.promoId, {
              used_count: (promo.used_count || 0) + 1,
              updated_at: now,
            });
          }
        }

        await db.audit_log.add({
          id: crypto.randomUUID(),
          outlet_id: OUTLET_ID,
          staff_id: staffId,
          action: "order_create",
          entity_type: "order",
          entity_id: orderId,
          old_value: null,
          new_value: JSON.stringify({ order_number: orderNumber, grand_total: grandTotal, discount: discountAmount || 0 }),
          created_at: now,
          synced_at: null,
        });
      });

      dispatch({ type: "MARK_SAVED", orderId, orderNumber });
      return orderRecord;
    } catch (err) {
      console.error("[OrderContext] saveOrder failed:", err);
      throw new Error("Failed to save order: " + err.message);
    }
  }, [state.items, state.orderType, state.orderSource, state.tableId, state.customerId, state.orderId, state.orderNumber, state.orderNotes, state.discountReason, state.promoId, totals]);

  /** Hold current order — saves to DB and resets cart. */
  const holdOrder = useCallback(async (staffId, shiftId) => {
    try {
      if (state.items.length === 0) return null;

      if (state.orderId) {
        const { items: computedItems } = totals;
        const now = new Date().toISOString();
        await modifyOrder(state.orderId, computedItems, totals, staffId);
        await db.orders.update(state.orderId, {
          status: "held",
          is_held: 1,
          updated_at: now,
        });
        dispatch({ type: "MARK_HELD", orderId: state.orderId, orderNumber: state.orderNumber });
        return { orderId: state.orderId, orderNumber: state.orderNumber };
      }

      const { items: computedItems, subtotal, taxTotal, roundOff, grandTotal, discountAmount } = totals;
      const now = new Date().toISOString();
      const orderId = uuid();

      let orderNumber;

      const orderItems = buildOrderItems(computedItems, orderId, OUTLET_ID);

      await db.transaction("rw", ["orders", "order_items", "audit_log", "outlets"], async () => {
        // Atomic order number: read-increment-write on the outlet record (no race condition)
        const outlet = await db.outlets.get(OUTLET_ID);
        const seq = outlet.next_order_seq || 1;
        await db.outlets.update(OUTLET_ID, {
          next_order_seq: seq + 1,
          updated_at: new Date().toISOString(),
        });
        orderNumber = seq;

        await db.orders.add({
          id: orderId,
          outlet_id: OUTLET_ID,
          order_number: orderNumber,
          source: state.orderSource || "counter",
          type: state.orderType,
          status: "held",
          table_id: state.tableId,
          staff_id: staffId,
          shift_id: shiftId,
          customer_id: state.customerId || null,
          subtotal,
          tax_total: taxTotal,
          discount_amount: discountAmount || 0,
          discount_reason: state.discountReason || null,
          round_off: roundOff,
          grand_total: grandTotal,
          external_order_id: null,
          received_at: now,
          preparing_at: null,
          ready_at: null,
          served_at: null,
          completed_at: null,
          cancelled_at: null,
          cancel_reason: null,
          is_held: 1,
          held_reason: state.orderNotes || null,
          created_at: now,
          updated_at: now,
          synced_at: null,
          deleted_at: null,
        });
        await db.order_items.bulkAdd(orderItems);
        await db.audit_log.add({
          id: crypto.randomUUID(),
          outlet_id: OUTLET_ID,
          staff_id: staffId,
          action: "order_hold",
          entity_type: "order",
          entity_id: orderId,
          old_value: null,
          new_value: JSON.stringify({ order_number: orderNumber, grand_total: grandTotal }),
          created_at: now,
          synced_at: null,
        });
      });

      dispatch({ type: "MARK_HELD", orderId, orderNumber });
      return { orderId, orderNumber };
    } catch (err) {
      console.error("[OrderContext] holdOrder failed:", err);
      throw new Error("Failed to hold order: " + err.message);
    }
  }, [state.items, state.orderType, state.orderSource, state.tableId, state.customerId, state.orderId, state.orderNumber, state.orderNotes, state.discountReason, totals]);

  /** Record cash payment for saved order. */
  const recordCashPayment = useCallback(async (cashTendered, staffId, shiftId, overrideOrderId = null) => {
    try {
      const effectiveOrderId = overrideOrderId || state.orderId;
      if (!effectiveOrderId) return null;

      const cashChange = cashTendered - totals.grandTotal;
      const now = new Date().toISOString();

      const payment = {
        id: uuid(),
        outlet_id: OUTLET_ID,
        order_id: effectiveOrderId,
        shift_id: shiftId || null,
        method: "cash",
        amount: totals.grandTotal,
        status: "success",
        gateway: null,
        gateway_txn_id: null,
        gateway_order_id: null,
        upi_vpa_masked: null,
        cash_tendered: cashTendered,
        cash_change: cashChange,
        is_refund: 0,
        refund_of: null,
        refund_reason: null,
        refunded_by: null,
        created_at: now,
        updated_at: now,
        synced_at: null,
        deleted_at: null,
      };

      await persistPayment(
        [payment], effectiveOrderId, state.tableId, state.customerId,
        totals.grandTotal, staffId,
        { method: "cash", amount: totals.grandTotal },
        dispatch, overrideOrderId
      );
      return payment;
    } catch (err) {
      console.error("[OrderContext] recordCashPayment failed:", err);
      throw new Error("Cash payment failed: " + err.message);
    }
  }, [state.orderId, state.tableId, state.customerId, totals.grandTotal]);

  /** Record UPI payment for saved order. */
  const recordUPIPayment = useCallback(async (staffId, shiftId, utrNumber = null, overrideOrderId = null) => {
    try {
      const effectiveOrderId = overrideOrderId || state.orderId;
      if (!effectiveOrderId) return null;

      const now = new Date().toISOString();

      const payment = {
        id: uuid(),
        outlet_id: OUTLET_ID,
        order_id: effectiveOrderId,
        shift_id: shiftId || null,
        method: "upi",
        amount: totals.grandTotal,
        status: "success",
        gateway: null,
        gateway_txn_id: utrNumber || null,
        gateway_order_id: null,
        upi_vpa_masked: null,
        cash_tendered: null,
        cash_change: null,
        is_refund: 0,
        refund_of: null,
        refund_reason: null,
        refunded_by: null,
        created_at: now,
        updated_at: now,
        synced_at: null,
        deleted_at: null,
      };

      await persistPayment(
        [payment], effectiveOrderId, state.tableId, state.customerId,
        totals.grandTotal, staffId,
        { method: "upi", amount: totals.grandTotal, utr: utrNumber },
        dispatch, overrideOrderId
      );
      return payment;
    } catch (err) {
      console.error("[OrderContext] recordUPIPayment failed:", err);
      throw new Error("UPI payment failed: " + err.message);
    }
  }, [state.orderId, state.tableId, state.customerId, totals.grandTotal]);

  /** Record split payment — creates multiple payment records in a single transaction. */
  const recordSplitPayments = useCallback(async (payments, staffId, shiftId, overrideOrderId = null) => {
    try {
      const effectiveOrderId = overrideOrderId || state.orderId;
      if (!effectiveOrderId) return null;

      const now = new Date().toISOString();
      const paymentRecords = payments.map((p) => ({
        id: uuid(),
        outlet_id: OUTLET_ID,
        order_id: effectiveOrderId,
        shift_id: shiftId || null,
        method: p.method,
        amount: p.amount,
        status: "success",
        gateway: null,
        gateway_txn_id: p.utrNumber || null,
        gateway_order_id: null,
        upi_vpa_masked: null,
        cash_tendered: p.method === "cash" ? p.cashTendered || p.amount : null,
        cash_change: p.method === "cash" ? (p.cashTendered || p.amount) - p.amount : null,
        is_refund: 0,
        refund_of: null,
        refund_reason: null,
        refunded_by: null,
        created_at: now,
        updated_at: now,
        synced_at: null,
        deleted_at: null,
      }));

      await persistPayment(
        paymentRecords, effectiveOrderId, state.tableId, state.customerId,
        totals.grandTotal, staffId,
        {
          method: "split",
          total: totals.grandTotal,
          slots: paymentRecords.map((p) => ({ method: p.method, amount: p.amount })),
        },
        dispatch, overrideOrderId
      );
      return paymentRecords;
    } catch (err) {
      console.error("[OrderContext] recordSplitPayments failed:", err);
      throw new Error("Split payment failed: " + err.message);
    }
  }, [state.orderId, state.tableId, state.customerId, totals.grandTotal]);

  /** Generate invoice for paid order. Returns invoice record. */
  const generateInvoice = useCallback(async (staffId) => {
    try {
      if (!state.orderId) return null;

      const now = new Date().toISOString();
      const fy = getCurrentFY();

      let invoiceNumber;
      const invoice = await db.transaction("rw", ["orders", "outlets", "invoices", "audit_log"], async () => {
        const dbOrder = await db.orders.get(state.orderId);
        if (!dbOrder || dbOrder.status !== "completed") return null;
        // Guard: prevent duplicate invoices for the same order
        const existing = await db.invoices
          .where("order_id").equals(state.orderId)
          .filter((inv) => !inv.is_credit_note)
          .first();
        if (existing) return existing;

        const outlet = await db.outlets.get(OUTLET_ID);
        const seq = outlet.next_invoice_seq;
        await db.outlets.update(OUTLET_ID, {
          next_invoice_seq: seq + 1,
          updated_at: now,
        });
        invoiceNumber = generateInvoiceNumber(outlet.invoice_prefix, fy, seq);

        // Read totals from the saved order record (not React state) for accuracy
        const invoiceRecord = {
          id: uuid(),
          outlet_id: OUTLET_ID,
          order_id: state.orderId,
          invoice_number: invoiceNumber,
          invoice_date: new Date().toISOString().split("T")[0],
          financial_year: fy,
          seller_gstin: outlet.gstin || "",
          seller_name: outlet.name,
          seller_address: `${outlet.address_line1}, ${outlet.city} - ${outlet.pincode}`,
          buyer_name: null,
          buyer_gstin: null,
          buyer_phone: null,
          subtotal: dbOrder.subtotal,
          cgst_total: dbOrder.cgst || Math.floor((dbOrder.tax_total || 0) / 2),
          sgst_total: dbOrder.sgst || (dbOrder.tax_total || 0) - Math.floor((dbOrder.tax_total || 0) / 2),
          igst_total: 0,
          cess_total: 0,
          discount_total: dbOrder.discount_amount || 0,
          round_off: dbOrder.round_off || 0,
          grand_total: dbOrder.grand_total,
          irn: null,
          irn_generated_at: null,
          qr_code_data: null,
          is_credit_note: 0,
          original_invoice_id: null,
          created_at: now,
          updated_at: now,
          synced_at: null,
          deleted_at: null,
        };

        await db.invoices.add(invoiceRecord);
        await db.audit_log.add({
          id: crypto.randomUUID(),
          outlet_id: OUTLET_ID,
          staff_id: staffId,
          action: "invoice_generate",
          entity_type: "invoice",
          entity_id: invoiceRecord.id,
          old_value: null,
          new_value: JSON.stringify({ invoice_number: invoiceNumber }),
          created_at: now,
          synced_at: null,
        });

        return invoiceRecord;
      });

      dispatch({ type: "MARK_INVOICED" });
      return invoice;
    } catch (err) {
      console.error("[OrderContext] generateInvoice failed:", err);
      throw new Error("Invoice generation failed: " + err.message);
    }
  }, [state.orderId, totals]);

  const resetOrder = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  /** Load items from a held order into the cart. */
  const loadHeldOrder = useCallback((items, orderType, orderId = null, orderNumber = null, orderNotes = "") => {
    dispatch({ type: "LOAD_HELD_ORDER", items, orderType, orderId, orderNumber, orderNotes });
  }, []);

  const value = useMemo(() => ({
    ...state,
    ...totals,
    addItem,
    removeItem,
    updateQty,
    setOrderType,
    setOrderSource,
    setTable,
    setCustomer,
    setItemNotes,
    setOrderNotes,
    applyDiscount,
    clearDiscount,
    saveOrder,
    holdOrder,
    recordCashPayment,
    recordUPIPayment,
    recordSplitPayments,
    generateInvoice,
    resetOrder,
    loadHeldOrder,
  }), [state, totals, addItem, removeItem, updateQty, setOrderType, setOrderSource, setTable,
    setCustomer, setItemNotes, setOrderNotes, applyDiscount, clearDiscount, saveOrder, holdOrder,
    recordCashPayment, recordUPIPayment, recordSplitPayments, generateInvoice, resetOrder, loadHeldOrder]);

  return (
    <OrderContext.Provider value={value}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrder() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrder must be inside OrderProvider");
  return ctx;
}
