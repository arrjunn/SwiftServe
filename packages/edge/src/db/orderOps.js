/**
 * Order operations — standalone DB functions.
 * Cancel, resume held orders, modify active orders, refund.
 * All money in integer paise. All IDs are UUIDs.
 */
import { db } from "./index.js";
import { OUTLET_ID } from "./seed.js";
import { getCurrentFY, generateInvoiceNumber } from "@swiftserve/shared";

/**
 * Cancel an order. Creates refund payment if order was already paid.
 * @param {string} orderId
 * @param {string} reason - cancellation reason
 * @param {string} staffId - who cancelled
 * @returns {Object} { success, refundPayment? }
 */
export async function cancelOrder(orderId, reason, staffId) {
  const now = new Date().toISOString();

  return db.transaction("rw", ["orders", "payments", "floor_tables", "audit_log"], async () => {
    const order = await db.orders.get(orderId);
    if (!order) throw new Error("Order not found");

    const cancellableStatuses = ["received", "preparing", "ready", "held"];
    if (!cancellableStatuses.includes(order.status)) {
      throw new Error(`Cannot cancel order with status "${order.status}"`);
    }

    // Check if order was paid (completed orders that somehow need cancellation)
    const existingPayment = await db.payments
      .where("order_id").equals(orderId)
      .filter((p) => p.status === "success" && !p.is_refund)
      .first();

    let refundPayment = null;

    if (existingPayment) {
      refundPayment = {
        id: crypto.randomUUID(),
        outlet_id: OUTLET_ID,
        order_id: orderId,
        shift_id: existingPayment.shift_id,
        method: existingPayment.method,
        amount: existingPayment.amount,
        status: "success",
        gateway: null,
        gateway_txn_id: null,
        gateway_order_id: null,
        upi_vpa_masked: null,
        cash_tendered: null,
        cash_change: null,
        is_refund: 1,
        refund_of: existingPayment.id,
        refund_reason: reason,
        refunded_by: staffId,
        created_at: now,
        updated_at: now,
        synced_at: null,
        deleted_at: null,
      };
      await db.payments.add(refundPayment);
    }

    await db.orders.update(orderId, {
      status: "cancelled",
      cancelled_at: now,
      cancel_reason: reason,
      updated_at: now,
    });

    // Release table if this was a dine-in order
    if (order.table_id) {
      await db.floor_tables.update(order.table_id, {
        status: "available",
        current_order_id: null,
        updated_at: now,
      });
    }

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: staffId,
      action: "order_cancel",
      entity_type: "order",
      entity_id: orderId,
      old_value: JSON.stringify({ status: order.status }),
      new_value: JSON.stringify({ status: "cancelled", reason, refunded: !!refundPayment }),
      created_at: now,
      synced_at: null,
    });

    return { success: true, refundPayment };
  });
}

/**
 * Load a held order's items for resuming into the cart.
 * @param {string} orderId
 * @returns {{ order, items }} - order record + order_items array
 */
export async function loadHeldOrderData(orderId) {
  const order = await db.orders.get(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status !== "held") throw new Error("Order is not held");

  const items = await db.order_items
    .where("order_id").equals(orderId)
    .toArray();

  return { order, items };
}

/**
 * Resume a held order — reactivates it (held → received).
 * Keeps the same order ID and order number.
 * @param {string} orderId
 * @param {string} staffId
 */
export async function resumeHeldOrder(orderId, staffId) {
  const now = new Date().toISOString();

  await db.transaction("rw", ["orders", "audit_log"], async () => {
    const order = await db.orders.get(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status !== "held") throw new Error(`Cannot resume non-held order (status: "${order.status}")`);

    await db.orders.update(orderId, {
      status: "received",
      is_held: 0,
      updated_at: now,
    });

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: staffId,
      action: "held_order_resume",
      entity_type: "order",
      entity_id: orderId,
      old_value: JSON.stringify({ status: "held" }),
      new_value: JSON.stringify({ status: "received" }),
      created_at: now,
      synced_at: null,
    });
  });
}

/**
 * Get all held orders for today.
 * @returns {Array} held orders sorted by created_at desc
 */
export async function getHeldOrders() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return db.orders
    .where("[outlet_id+status]")
    .equals([OUTLET_ID, "held"])
    .filter((o) => new Date(o.created_at) >= todayStart)
    .reverse()
    .toArray();
}

/**
 * Modify an active order — update items, recalculate totals.
 * Only works for "received" or "preparing" orders.
 * @param {string} orderId
 * @param {Array} newItems - computed items with lineTotal, cgst, sgst, taxTotal
 * @param {Object} newTotals - { subtotal, taxTotal, cgstTotal, sgstTotal, roundOff, grandTotal }
 * @param {string} staffId
 */
export async function modifyOrder(orderId, newItems, newTotals, staffId) {
  const now = new Date().toISOString();

  await db.transaction("rw", ["orders", "order_items", "audit_log"], async () => {
    const order = await db.orders.get(orderId);
    if (!order) throw new Error("Order not found");

    const modifiableStatuses = ["received", "preparing", "held"];
    if (!modifiableStatuses.includes(order.status)) {
      throw new Error(`Cannot modify order with status "${order.status}"`);
    }

    // Void existing items
    const existingItems = await db.order_items
      .where("order_id").equals(orderId)
      .toArray();

    for (const item of existingItems) {
      await db.order_items.update(item.id, {
        is_void: 1,
        void_reason: "Order modified",
        void_by: staffId,
        updated_at: now,
      });
    }

    // Add new items
    const orderItems = newItems.map((item) => ({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
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

    await db.order_items.bulkAdd(orderItems);

    // Update order totals
    await db.orders.update(orderId, {
      subtotal: newTotals.subtotal,
      tax_total: newTotals.taxTotal,
      round_off: newTotals.roundOff,
      grand_total: newTotals.grandTotal,
      updated_at: now,
    });

    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: staffId,
      action: "order_modify",
      entity_type: "order",
      entity_id: orderId,
      old_value: JSON.stringify({ grand_total: order.grand_total, item_count: existingItems.length }),
      new_value: JSON.stringify({ grand_total: newTotals.grandTotal, item_count: newItems.length }),
      created_at: now,
      synced_at: null,
    });
  });
}

/**
 * Refund a completed order. Creates refund payment(s), credit note invoice,
 * and marks order as cancelled. Prevents double-refund.
 * @param {string} orderId
 * @param {string} reason
 * @param {string} staffId - who authorized the refund (must be owner)
 * @returns {{ success, refundPayments }}
 */
export async function refundOrder(orderId, reason, staffId) {
  // Verify owner role at data layer
  const actingStaff = await db.staff.get(staffId);
  if (!actingStaff || actingStaff.role !== "owner") {
    throw new Error("Insufficient permissions: owner role required for refunds");
  }

  const now = new Date().toISOString();

  return db.transaction("rw", ["orders", "payments", "invoices", "outlets", "audit_log"], async () => {
    const order = await db.orders.get(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status !== "completed") throw new Error("Only completed orders can be refunded");

    // Double-refund prevention
    const existingRefund = await db.payments
      .where("order_id").equals(orderId)
      .filter((p) => p.is_refund === 1)
      .first();
    if (existingRefund) throw new Error("This order has already been refunded");

    // Get original payment(s) — could be split
    const originalPayments = await db.payments
      .where("order_id").equals(orderId)
      .filter((p) => p.status === "success" && !p.is_refund)
      .toArray();
    if (originalPayments.length === 0) throw new Error("No payment found for this order");

    // Create refund payment per original payment
    const refundPayments = [];
    for (const op of originalPayments) {
      const refundPayment = {
        id: crypto.randomUUID(),
        outlet_id: OUTLET_ID,
        order_id: orderId,
        shift_id: op.shift_id,
        method: op.method,
        amount: op.amount,
        status: "success",
        gateway: null,
        gateway_txn_id: null,
        gateway_order_id: null,
        upi_vpa_masked: null,
        cash_tendered: null,
        cash_change: null,
        is_refund: 1,
        refund_of: op.id,
        refund_reason: reason,
        refunded_by: staffId,
        created_at: now,
        updated_at: now,
        synced_at: null,
        deleted_at: null,
      };
      await db.payments.add(refundPayment);
      refundPayments.push(refundPayment);
    }

    // Create credit note invoice if original invoice exists
    const originalInvoice = await db.invoices
      .where("order_id").equals(orderId)
      .first();

    if (originalInvoice) {
      const outlet = await db.outlets.get(OUTLET_ID);
      const seq = outlet.next_invoice_seq;
      await db.outlets.update(OUTLET_ID, {
        next_invoice_seq: seq + 1,
        updated_at: now,
      });
      const fy = getCurrentFY();
      const invoiceNumber = generateInvoiceNumber(outlet.invoice_prefix, fy, seq);

      await db.invoices.add({
        id: crypto.randomUUID(),
        outlet_id: OUTLET_ID,
        order_id: orderId,
        invoice_number: invoiceNumber,
        invoice_date: new Date().toISOString().split("T")[0],
        financial_year: fy,
        seller_gstin: outlet.gstin || "",
        seller_name: outlet.name,
        seller_address: `${outlet.address_line1}, ${outlet.city} - ${outlet.pincode}`,
        buyer_name: null,
        buyer_gstin: null,
        buyer_phone: null,
        subtotal: originalInvoice.subtotal,
        cgst_total: originalInvoice.cgst_total,
        sgst_total: originalInvoice.sgst_total,
        igst_total: 0,
        cess_total: 0,
        discount_total: originalInvoice.discount_total || 0,
        round_off: originalInvoice.round_off,
        grand_total: originalInvoice.grand_total,
        irn: null,
        irn_generated_at: null,
        qr_code_data: null,
        is_credit_note: 1,
        original_invoice_id: originalInvoice.id,
        created_at: now,
        updated_at: now,
        synced_at: null,
        deleted_at: null,
      });
    }

    // Update order status to cancelled
    await db.orders.update(orderId, {
      status: "cancelled",
      cancelled_at: now,
      cancel_reason: `Refund: ${reason}`,
      cancelled_by: staffId,
      updated_at: now,
    });

    // Audit log
    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: staffId,
      action: "order_refund",
      entity_type: "order",
      entity_id: orderId,
      old_value: JSON.stringify({ status: "completed" }),
      new_value: JSON.stringify({ status: "cancelled", reason, refund_count: refundPayments.length }),
      created_at: now,
      synced_at: null,
    });

    return { success: true, refundPayments };
  });
}

/**
 * Partial refund — refund selected items from a completed order.
 * Order stays "completed", creates refund payment + credit note for partial amount.
 *
 * @param {string} orderId
 * @param {string[]} itemIds - order_item IDs to refund
 * @param {string} reason
 * @param {string} staffId - owner who authorized
 * @returns {{ success, refundAmount, creditNoteNumber }}
 */
export async function partialRefund(orderId, itemIds, reason, staffId) {
  const actingStaff = await db.staff.get(staffId);
  if (!actingStaff || (actingStaff.role !== "owner" && actingStaff.role !== "admin")) {
    throw new Error("Insufficient permissions: owner/admin role required for refunds");
  }

  if (!itemIds || itemIds.length === 0) {
    throw new Error("Select at least one item to refund");
  }

  const now = new Date().toISOString();

  return db.transaction("rw", ["orders", "order_items", "payments", "invoices", "outlets", "audit_log"], async () => {
    const order = await db.orders.get(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status !== "completed") throw new Error("Only completed orders can be partially refunded");

    // Get ALL items (including voided) to check refund eligibility
    const allItems = await db.order_items
      .where("order_id").equals(orderId)
      .filter((i) => !i.deleted_at)
      .toArray();

    const selectedItems = allItems.filter((i) => itemIds.includes(i.id));
    if (selectedItems.length === 0) throw new Error("No valid items found to refund");

    // Check if any selected items were already refunded
    const alreadyVoided = selectedItems.filter((i) => i.is_void);
    if (alreadyVoided.length > 0) throw new Error("Some selected items have already been refunded");

    const itemsToRefund = selectedItems;

    // Calculate refund amount: sum of (line_total + tax_total) for selected items
    let refundSubtotal = 0;
    let refundTax = 0;
    for (const item of itemsToRefund) {
      refundSubtotal += item.line_total;
      refundTax += item.tax_total;
    }
    const refundAmount = refundSubtotal + refundTax;

    // Validate cumulative refund doesn't exceed order total
    const existingRefunds = await db.payments
      .where("order_id").equals(orderId)
      .filter((p) => p.is_refund === 1)
      .toArray();
    const existingRefundTotal = existingRefunds.reduce((s, p) => s + p.amount, 0);

    if (existingRefundTotal + refundAmount > order.grand_total) {
      throw new Error("Refund total would exceed order grand total");
    }

    // Mark items as void
    for (const item of itemsToRefund) {
      await db.order_items.update(item.id, {
        is_void: 1,
        void_reason: `Partial refund: ${reason}`,
        void_by: staffId,
        updated_at: now,
      });
    }

    // Create refund payment
    const refundPaymentId = crypto.randomUUID();
    await db.payments.add({
      id: refundPaymentId,
      outlet_id: OUTLET_ID,
      order_id: orderId,
      shift_id: null,
      method: "cash", // partial refunds default to cash
      amount: refundAmount,
      status: "success",
      gateway: null,
      gateway_txn_id: null,
      gateway_order_id: null,
      upi_vpa_masked: null,
      cash_tendered: null,
      cash_change: null,
      is_refund: 1,
      refund_of: null,
      refund_reason: reason,
      refunded_by: staffId,
      created_at: now,
      updated_at: now,
      synced_at: null,
      deleted_at: null,
    });

    // Create partial credit note
    let creditNoteNumber = null;
    const originalInvoice = await db.invoices
      .where("order_id").equals(orderId)
      .filter((inv) => !inv.is_credit_note)
      .first();

    if (originalInvoice) {
      const outlet = await db.outlets.get(OUTLET_ID);
      const seq = outlet.next_invoice_seq;
      await db.outlets.update(OUTLET_ID, {
        next_invoice_seq: seq + 1,
        updated_at: now,
      });
      const fy = getCurrentFY();
      creditNoteNumber = `CN-${outlet.invoice_prefix}${fy}-${String(seq).padStart(6, "0")}`;

      const refundCgst = Math.floor(refundTax / 2);
      const refundSgst = refundTax - refundCgst;

      await db.invoices.add({
        id: crypto.randomUUID(),
        outlet_id: OUTLET_ID,
        order_id: orderId,
        invoice_number: creditNoteNumber,
        invoice_date: new Date().toISOString().split("T")[0],
        financial_year: fy,
        seller_gstin: outlet.gstin || "",
        seller_name: outlet.name,
        seller_address: `${outlet.address_line1}, ${outlet.city} - ${outlet.pincode}`,
        buyer_name: null,
        buyer_gstin: null,
        buyer_phone: null,
        subtotal: refundSubtotal,
        cgst_total: refundCgst,
        sgst_total: refundSgst,
        igst_total: 0,
        cess_total: 0,
        discount_total: 0,
        round_off: 0,
        grand_total: refundAmount,
        irn: null,
        irn_generated_at: null,
        qr_code_data: null,
        is_credit_note: 1,
        original_invoice_id: originalInvoice.id,
        created_at: now,
        updated_at: now,
        synced_at: null,
        deleted_at: null,
      });
    }

    // Audit
    await db.audit_log.add({
      id: crypto.randomUUID(),
      outlet_id: OUTLET_ID,
      staff_id: staffId,
      action: "partial_refund",
      entity_type: "order",
      entity_id: orderId,
      old_value: null,
      new_value: JSON.stringify({
        reason,
        refund_amount: refundAmount,
        items_refunded: itemIds.length,
        credit_note: creditNoteNumber,
      }),
      created_at: now,
      synced_at: null,
    });

    return { success: true, refundAmount, creditNoteNumber, itemsRefunded: itemIds.length };
  });
}

/**
 * Auto-deduct inventory when an order is completed.
 * Looks up recipe_ingredients for each menu item and reduces stock.
 * Silently skips if no recipe defined — inventory is optional.
 */
export async function deductInventoryForOrder(orderId, staffId) {
  try {
    const items = await db.order_items
      .where("order_id").equals(orderId)
      .filter((i) => !i.is_void)
      .toArray();

    if (items.length === 0) return;

    // Idempotency: check if already deducted for this order
    const alreadyDeducted = await db.inventory_transactions
      .where("type").equals("sale_deduct")
      .filter((t) => t.notes && t.notes.includes(orderId))
      .first();
    if (alreadyDeducted) return;

    const now = new Date().toISOString();

    await db.transaction("rw", ["order_items", "recipe_ingredients", "inventory_items", "inventory_transactions"], async () => {
      for (const item of items) {
        const recipes = await db.recipe_ingredients
          .where("menu_item_id").equals(item.menu_item_id)
          .toArray();

        for (const recipe of recipes) {
          const inv = await db.inventory_items.get(recipe.inventory_item_id);
          if (!inv) continue;

          const deductQty = (recipe.quantity || 0) * (item.quantity || 1);
          if (deductQty <= 0) continue;

          const before = inv.current_stock || 0;
          const after = before - deductQty;
          if (after < 0) console.warn(`[Inventory] ${inv.name || inv.id} stock going negative: ${before} → ${after}`);

          await db.inventory_items.update(inv.id, {
            current_stock: after,
            updated_at: now,
          });

          await db.inventory_transactions.add({
            id: crypto.randomUUID(),
            outlet_id: OUTLET_ID,
            inventory_item_id: inv.id,
            type: "sale_deduct",
            quantity_change: -deductQty,
            quantity_before: before,
            quantity_after: after,
            cost_per_unit: inv.cost_per_unit || 0,
            notes: `Order ${orderId} — ${item.name} x${item.quantity}`,
            staff_id: staffId,
            created_at: now,
            updated_at: now,
          });
        }
      }
    });
  } catch (err) {
    // Inventory deduction is non-critical — don't break the payment flow
    console.warn("[Inventory] Auto-deduct failed:", err.message);
  }
}

/**
 * Award loyalty points to a customer after a completed order.
 * Rule: 1 point per ₹10 spent (configurable).
 */
export async function awardLoyaltyPoints(orderId, customerId, grandTotal, staffId) {
  if (!customerId) return;
  try {
    await db.transaction("rw", ["customers", "loyalty_transactions"], async () => {
      const customer = await db.customers.get(customerId);
      if (!customer) return;

      // Prevent double-earn: check if points already awarded for this order
      const existing = await db.loyalty_transactions
        .where("order_id").equals(orderId)
        .filter((t) => t.type === "earn")
        .first();
      if (existing) return;

      const pointsEarned = Math.floor(grandTotal / 1000); // 1 point per ₹10 (1000 paise)
      if (pointsEarned <= 0) return;

      const currentPoints = customer.loyalty_points || 0;
      const newBalance = currentPoints + pointsEarned;
      const now = new Date().toISOString();

      await db.customers.update(customerId, {
        loyalty_points: newBalance,
        total_orders: (customer.total_orders || 0) + 1,
        total_spent: (customer.total_spent || 0) + grandTotal,
        updated_at: now,
      });

      await db.loyalty_transactions.add({
        id: crypto.randomUUID(),
        outlet_id: OUTLET_ID,
        customer_id: customerId,
        order_id: orderId,
        type: "earn",
        points: pointsEarned,
        balance_after: newBalance,
        description: `Earned ${pointsEarned} pts on order`,
        created_at: now,
        updated_at: now,
        synced_at: null,
        deleted_at: null,
      });
    });
  } catch (err) {
    console.warn("[Loyalty] Points award failed:", err.message);
  }
}
