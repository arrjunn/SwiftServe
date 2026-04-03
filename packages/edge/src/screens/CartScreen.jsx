import React, { useState, useEffect } from "react";
import { useOrder } from "../contexts/OrderContext.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import BillSummary from "../components/BillSummary.jsx";
import PINModal from "../components/PINModal.jsx";
import usePINChallenge from "../hooks/usePINChallenge.js";
import { formatINR, toPaise, FOOD_TYPE_DISPLAY, validatePromo, findPromoByCouponCode, requiresOwnerApproval } from "@swiftserve/shared";
import { db } from "../db/index.js";
import { OUTLET_ID } from "../db/seed.js";

const styles = {
  wrapper: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    display: "flex",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  leftPanel: {
    flex: "0 0 60%",
    display: "flex",
    flexDirection: "column",
    padding: 20,
    overflow: "hidden",
    boxSizing: "border-box",
  },
  rightPanel: {
    flex: "0 0 40%",
    display: "flex",
    flexDirection: "column",
    padding: 20,
    background: "var(--bg-primary)",
    borderLeft: "1px solid var(--border)",
    overflow: "auto",
    boxSizing: "border-box",
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: "var(--text-primary)",
    marginBottom: 16,
  },
  tableWrapper: {
    flex: 1,
    overflow: "auto",
    borderRadius: 10,
    border: "1px solid var(--border)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    position: "sticky",
    top: 0,
    background: "var(--bg-secondary)",
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    padding: "10px 12px",
    textAlign: "left",
    borderBottom: "1px solid var(--border)",
  },
  thRight: {
    textAlign: "right",
  },
  thCenter: {
    textAlign: "center",
  },
  td: {
    padding: "10px 12px",
    fontSize: 14,
    color: "var(--text-secondary)",
    borderBottom: "1px solid #1e293b",
    verticalAlign: "middle",
  },
  tdRight: {
    textAlign: "right",
    fontFamily: "monospace",
    fontWeight: 600,
  },
  tdCenter: {
    textAlign: "center",
  },
  itemName: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  foodIndicator: {
    fontSize: 10,
    flexShrink: 0,
    width: 14,
    height: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1.5px solid",
    borderRadius: 3,
  },
  qtyControls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  qtyBtn: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    fontSize: 20,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  qtyText: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-primary)",
    minWidth: 28,
    textAlign: "center",
  },
  orderTypeSection: {
    marginTop: 16,
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  orderTypeLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  orderTypeBtn: {
    height: 44,
    minWidth: 100,
    padding: "0 20px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    transition: "background 0.15s, color 0.15s, border-color 0.15s",
  },
  orderTypeBtnActive: {
    background: "#38bdf8",
    color: "var(--bg-primary)",
    borderColor: "#38bdf8",
  },
  primaryBtn: {
    width: "100%",
    height: 56,
    minHeight: 44,
    borderRadius: 12,
    border: "none",
    background: "#38bdf8",
    color: "var(--bg-primary)",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    transition: "background 0.15s",
  },
  secondaryBtn: {
    width: "100%",
    height: 48,
    minHeight: 44,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  textBtn: {
    width: "100%",
    height: 44,
    minHeight: 44,
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    textDecoration: "underline",
    textUnderlineOffset: 2,
  },
  emptyState: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: 8,
    color: "var(--border-light)",
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 500,
  },
  disabledBtn: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
};

export default function CartScreen({ onProceedToPayment, onBackToMenu, onOrderHeld, onOrderSubmitted }) {
  const auth = useAuth();
  const order = useOrder();
  const { items, subtotal, taxTotal, cgstTotal, sgstTotal, roundOff, grandTotal, orderType, updateQty, removeItem, setOrderType, holdOrder, discountAmount, discountType, discountReason, applyDiscount, clearDiscount, setItemNotes, setOrderNotes, orderNotes } = order;

  const isCaptain = auth.staff?.role === "captain";
  const [holdingOrder, setHoldingOrder] = useState(false);
  const [holdError, setHoldError] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Customer linking
  const [custPhone, setCustPhone] = useState("");
  const [custSearching, setCustSearching] = useState(false);
  const [linkedCustomer, setLinkedCustomer] = useState(null);
  const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
  const hasItems = items.length > 0;

  // Discount state
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountMode, setDiscountMode] = useState("percentage"); // percentage | flat | coupon
  const [percentInput, setPercentInput] = useState("");
  const [flatInput, setFlatInput] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const pinChallenge = usePINChallenge();
  const [pendingDiscount, setPendingDiscount] = useState(null);

  // Search or create customer by phone, then link to order
  const handleLinkCustomer = async () => {
    const phone = custPhone.trim();
    if (phone.length < 10) return;
    setCustSearching(true);
    try {
      let cust = await db.customers.where("outlet_id").equals(OUTLET_ID)
        .filter((c) => c.phone === phone).first();
      if (!cust) {
        // Auto-create customer
        const now = new Date().toISOString();
        cust = {
          id: crypto.randomUUID(),
          outlet_id: OUTLET_ID,
          name: "",
          phone,
          phone_hash: null,
          loyalty_points: 0,
          total_orders: 0,
          total_spent: 0,
          created_at: now,
          updated_at: now,
          synced_at: null,
          deleted_at: null,
        };
        await db.customers.add(cust);
      }
      setLinkedCustomer(cust);
      order.setCustomer(cust.id);
    } catch (err) {
      console.error("Customer link failed:", err);
    } finally {
      setCustSearching(false);
    }
  };

  const handleUnlinkCustomer = () => {
    setLinkedCustomer(null);
    setCustPhone("");
    order.setCustomer(null);
  };

  // Re-apply discount when items change (reducer recomputes amount from current state)
  useEffect(() => {
    if (discountType && order.discountValue > 0) {
      applyDiscount(discountType, order.discountValue, discountReason, order.couponCode, order.promoId);
    }
  }, [items.length, totalQty]);

  const applyWithPinCheck = async (type, value, reason, couponCode = null, promoId = null) => {
    if (requiresOwnerApproval(type === "percentage" ? Math.floor(subtotal * value / 10000) : value, subtotal)) {
      setPendingDiscount({ type, value, reason, couponCode, promoId });
      const result = await pinChallenge.requestPIN("discount_override");
      if (result) {
        applyDiscount(type, value, reason, couponCode, promoId);
        setPendingDiscount(null);
        setDiscountError("");
      } else {
        setPendingDiscount(null);
      }
    } else {
      applyDiscount(type, value, reason, couponCode, promoId);
      setDiscountError("");
    }
  };

  const handleApplyPercent = () => {
    const pct = parseInt(percentInput, 10);
    if (!pct || pct < 1 || pct > 100) { setDiscountError("Enter 1-100%"); return; }
    applyWithPinCheck("percentage", pct * 100, `${pct}% discount`);
  };

  const handleApplyFlat = () => {
    const rupees = parseFloat(flatInput);
    if (!rupees || rupees <= 0) { setDiscountError("Enter valid amount"); return; }
    const paise = toPaise(rupees);
    if (paise > subtotal) { setDiscountError("Cannot exceed subtotal"); return; }
    applyWithPinCheck("flat", paise, `Flat ₹${rupees} discount`);
  };

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) { setDiscountError("Enter coupon code"); return; }
    setCouponLoading(true);
    setDiscountError("");
    try {
      const promos = await db.promos.where("outlet_id").equals(OUTLET_ID).toArray();
      const promo = findPromoByCouponCode(promos, couponInput);
      const result = validatePromo(promo, subtotal);
      if (!result.valid) { setDiscountError(result.error); return; }
      await applyWithPinCheck("coupon", result.discountAmount, result.reason, promo.coupon_code, promo.id);
    } catch (err) {
      setDiscountError("Failed to validate coupon");
    } finally {
      setCouponLoading(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      {/* Left Panel — Item Table */}
      <div style={styles.leftPanel}>
        <div style={styles.title}>Bill Preview</div>

        {hasItems ? (
          <>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Item</th>
                    <th style={{ ...styles.th, ...styles.thCenter }}>Qty</th>
                    <th style={{ ...styles.th, ...styles.thRight }}>Unit Price</th>
                    <th style={{ ...styles.th, ...styles.thRight }}>GST</th>
                    <th style={{ ...styles.th, ...styles.thRight }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const ft = FOOD_TYPE_DISPLAY[item.foodType];
                    return (
                      <tr key={item.id}>
                        <td style={styles.td}>
                          <div style={styles.itemName}>
                            {ft && (
                              <span
                                style={{
                                  ...styles.foodIndicator,
                                  color: ft.color,
                                  borderColor: ft.color,
                                }}
                              >
                                {ft.symbol}
                              </span>
                            )}
                            <span>{item.name}</span>
                          </div>
                          {editingNoteId === item.id ? (
                            <input
                              autoFocus
                              type="text"
                              placeholder="e.g. no onion, extra spicy"
                              value={item.notes || ""}
                              onChange={(e) => setItemNotes(item.id, e.target.value)}
                              onBlur={() => setEditingNoteId(null)}
                              onKeyDown={(e) => { if (e.key === "Enter") setEditingNoteId(null); }}
                              style={{ marginTop: 4, width: "100%", padding: "4px 8px", fontSize: 12, backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", outline: "none", boxSizing: "border-box" }}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingNoteId(item.id)}
                              style={{ marginTop: 2, padding: 0, border: "none", background: "transparent", color: item.notes ? "#fbbf24" : "var(--text-dim)", fontSize: 11, cursor: "pointer", fontStyle: item.notes ? "italic" : "normal" }}
                            >
                              {item.notes || "Add note"}
                            </button>
                          )}
                        </td>
                        <td style={{ ...styles.td, ...styles.tdCenter }}>
                          <div style={styles.qtyControls}>
                            <button
                              type="button"
                              style={styles.qtyBtn}
                              onClick={() => {
                                if (item.qty <= 1) {
                                  removeItem(item.id);
                                } else {
                                  updateQty(item.id, item.qty - 1);
                                }
                              }}
                            >
                              -
                            </button>
                            <span style={styles.qtyText}>{item.qty}</span>
                            <button
                              type="button"
                              style={styles.qtyBtn}
                              onClick={() => updateQty(item.id, item.qty + 1)}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td style={{ ...styles.td, ...styles.tdRight }}>
                          {formatINR(item.unitPrice)}
                        </td>
                        <td style={{ ...styles.td, ...styles.tdRight }}>
                          {formatINR(item.taxTotal)}
                        </td>
                        <td style={{ ...styles.td, ...styles.tdRight }}>
                          {formatINR(item.lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Order type selector */}
            <div style={styles.orderTypeSection}>
              <span style={styles.orderTypeLabel}>Order Type:</span>
              <button
                type="button"
                style={{
                  ...styles.orderTypeBtn,
                  ...(orderType === "dine_in" ? styles.orderTypeBtnActive : {}),
                }}
                onClick={() => setOrderType("dine_in")}
              >
                Dine-in
              </button>
              <button
                type="button"
                style={{
                  ...styles.orderTypeBtn,
                  ...(orderType === "takeaway" ? styles.orderTypeBtnActive : {}),
                }}
                onClick={() => setOrderType("takeaway")}
              >
                Takeaway
              </button>
            </div>
          </>
        ) : (
          <div style={styles.emptyState}>
            <div style={styles.emptyText}>No items in cart</div>
            <div style={{ fontSize: 13, color: "var(--border-light)" }}>
              Go back to menu to add items
            </div>
          </div>
        )}
      </div>

      {/* Right Panel — Summary & Actions */}
      <div style={styles.rightPanel}>
        {/* Customer Linking */}
        {hasItems && (
          <div style={custStyles.section}>
            {linkedCustomer ? (
              <div style={custStyles.linked}>
                <div style={custStyles.linkedInfo}>
                  <span style={custStyles.linkedLabel}>Customer</span>
                  <span style={custStyles.linkedName}>{linkedCustomer.name || "****" + linkedCustomer.phone?.slice(-4)}</span>
                  <span style={custStyles.linkedMeta}>
                    {linkedCustomer.loyalty_points || 0} pts &middot; {linkedCustomer.total_orders || 0} orders
                  </span>
                </div>
                <button style={custStyles.unlinkBtn} onClick={handleUnlinkCustomer}>&#10005;</button>
              </div>
            ) : (
              <div style={custStyles.searchRow}>
                <input
                  style={custStyles.input}
                  type="tel"
                  placeholder="Customer phone (10 digits)"
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  onKeyDown={(e) => e.key === "Enter" && handleLinkCustomer()}
                />
                <button
                  style={custStyles.linkBtn}
                  onClick={handleLinkCustomer}
                  disabled={custPhone.length < 10 || custSearching}
                >
                  {custSearching ? "..." : "Link"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Discount Section */}
        {hasItems && (
          <div style={discStyles.section}>
            {discountAmount > 0 ? (
              <div style={discStyles.appliedBadge}>
                <span style={discStyles.appliedText}>{discountReason}: -{formatINR(discountAmount)}</span>
                <button style={discStyles.clearBtn} onClick={() => { clearDiscount(); setShowDiscount(false); setPercentInput(""); setFlatInput(""); setCouponInput(""); setDiscountError(""); }}>&#10005;</button>
              </div>
            ) : (
              <>
                {!showDiscount ? (
                  <button style={discStyles.addBtn} onClick={() => setShowDiscount(true)}>+ Add Discount</button>
                ) : (
                  <div style={discStyles.panel}>
                    <div style={discStyles.tabs}>
                      {[["percentage", "%"], ["flat", "₹"], ["coupon", "Coupon"]].map(([key, label]) => (
                        <button key={key} style={{ ...discStyles.tab, ...(discountMode === key ? discStyles.tabActive : {}) }} onClick={() => { setDiscountMode(key); setDiscountError(""); }}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {discountMode === "percentage" && (
                      <div style={discStyles.inputRow}>
                        <input style={discStyles.input} type="number" inputMode="numeric" placeholder="10" min="1" max="100" value={percentInput} onChange={(e) => { setPercentInput(e.target.value); setDiscountError(""); }} />
                        <span style={discStyles.inputSuffix}>%</span>
                        <button style={discStyles.applyBtn} onClick={handleApplyPercent}>Apply</button>
                      </div>
                    )}

                    {discountMode === "flat" && (
                      <div style={discStyles.inputRow}>
                        <span style={discStyles.inputPrefix}>₹</span>
                        <input style={discStyles.input} type="number" inputMode="decimal" placeholder="50" value={flatInput} onChange={(e) => { setFlatInput(e.target.value); setDiscountError(""); }} />
                        <button style={discStyles.applyBtn} onClick={handleApplyFlat}>Apply</button>
                      </div>
                    )}

                    {discountMode === "coupon" && (
                      <div style={discStyles.inputRow}>
                        <input style={{ ...discStyles.input, textTransform: "uppercase" }} type="text" placeholder="FLAT50" value={couponInput} onChange={(e) => { setCouponInput(e.target.value); setDiscountError(""); }} maxLength={20} />
                        <button style={discStyles.applyBtn} onClick={handleApplyCoupon} disabled={couponLoading}>{couponLoading ? "..." : "Apply"}</button>
                      </div>
                    )}

                    {discountError && <div style={discStyles.error}>{discountError}</div>}

                    <button style={discStyles.cancelBtn} onClick={() => { setShowDiscount(false); setDiscountError(""); }}>Cancel</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <BillSummary
          subtotal={subtotal}
          taxTotal={taxTotal}
          cgstTotal={cgstTotal}
          sgstTotal={sgstTotal}
          roundOff={roundOff}
          grandTotal={grandTotal}
          itemCount={totalQty}
          discount={discountAmount}
        />

        <PINModal
          show={pinChallenge.showModal}
          title="Owner PIN Required"
          description="Discount over 20% requires owner authorization"
          pinInput={pinChallenge.pinInput}
          setPinInput={pinChallenge.setPinInput}
          pinError={pinChallenge.pinError}
          onSubmit={pinChallenge.handleSubmit}
          onCancel={pinChallenge.handleCancel}
        />

        {hasItems && (
          <input
            type="text"
            placeholder="Order notes (e.g. birthday, allergy info)"
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", fontSize: 13, backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", outline: "none", boxSizing: "border-box" }}
          />
        )}

        <button
          type="button"
          style={{
            ...styles.primaryBtn,
            ...(!hasItems ? styles.disabledBtn : {}),
          }}
          disabled={!hasItems || submitting}
          onClick={isCaptain ? async () => {
            // Captain submits order directly (no payment) — counter handles payment later
            setSubmitting(true);
            try {
              const sid = await auth.getShiftId();
              await order.saveOrder(auth.staff?.id, sid);
              order.resetOrder();
              if (onOrderSubmitted) onOrderSubmitted();
            } catch (e) {
              setHoldError(e.message || "Failed to submit order");
            } finally {
              setSubmitting(false);
            }
          } : onProceedToPayment}
        >
          {submitting ? "Submitting..." : isCaptain ? "Submit Order" : "Proceed to Payment"}
        </button>

        <button
          type="button"
          style={styles.secondaryBtn}
          onClick={onBackToMenu}
        >
          ← Back to Menu
        </button>

        {holdError && (
          <div style={{ color: "#fca5a5", fontSize: 13, textAlign: "center", padding: "8px 0" }}>
            {holdError}
          </div>
        )}

        <button
          type="button"
          style={{
            ...styles.textBtn,
            ...(!hasItems || holdingOrder ? styles.disabledBtn : {}),
          }}
          disabled={!hasItems || holdingOrder}
          onClick={async () => {
            setHoldingOrder(true);
            setHoldError("");
            try {
              const shiftId = await auth.getShiftId();
              const result = await holdOrder(auth.staff?.id, shiftId);
              if (result && onOrderHeld) {
                order.resetOrder();
                onOrderHeld();
              } else {
                setHoldError("Failed to hold order.");
              }
            } catch (err) {
              console.error("[CART] Hold order failed:", err);
              setHoldError(err.message || "Failed to hold order.");
            } finally {
              setHoldingOrder(false);
            }
          }}
        >
          {holdingOrder ? "Holding..." : "Hold Order"}
        </button>
      </div>
    </div>
  );
}

const custStyles = {
  section: { width: "100%" },
  searchRow: { display: "flex", gap: 8 },
  input: {
    flex: 1, minHeight: 44, padding: "0 12px", backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)",
    fontSize: 14, outline: "none", boxSizing: "border-box",
  },
  linkBtn: {
    minHeight: 44, minWidth: 60, padding: "0 14px", backgroundColor: "#3b82f6",
    border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600,
    cursor: "pointer", touchAction: "manipulation",
  },
  linked: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 14px", backgroundColor: "rgba(34,197,94,0.08)",
    border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10,
  },
  linkedInfo: { display: "flex", flexDirection: "column", gap: 2 },
  linkedLabel: { fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 },
  linkedName: { fontSize: 15, fontWeight: 700, color: "#4ade80" },
  linkedMeta: { fontSize: 12, color: "var(--text-muted)" },
  unlinkBtn: {
    minWidth: 32, minHeight: 32, background: "transparent", border: "1px solid rgba(239,68,68,0.4)",
    borderRadius: 6, color: "#f87171", fontSize: 14, cursor: "pointer",
  },
};

const discStyles = {
  section: { width: "100%" },
  addBtn: {
    width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px dashed var(--border-light)",
    backgroundColor: "transparent", color: "var(--text-muted)", fontSize: 14, fontWeight: 600,
    cursor: "pointer", touchAction: "manipulation",
  },
  appliedBadge: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 14px", borderRadius: 8, backgroundColor: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.3)",
  },
  appliedText: { fontSize: 14, fontWeight: 600, color: "#4ade80" },
  clearBtn: {
    width: 28, height: 28, borderRadius: 6, border: "none",
    backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171", fontSize: 14,
    fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  },
  panel: {
    backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10,
    padding: 14, display: "flex", flexDirection: "column", gap: 10,
  },
  tabs: { display: "flex", gap: 4 },
  tab: {
    flex: 1, padding: "6px 0", borderRadius: 6, border: "1px solid var(--border-light)",
    backgroundColor: "transparent", color: "var(--text-muted)", fontSize: 13, fontWeight: 600,
    cursor: "pointer",
  },
  tabActive: { backgroundColor: "#3b82f6", borderColor: "#3b82f6", color: "#fff" },
  inputRow: { display: "flex", alignItems: "center", gap: 6 },
  input: {
    flex: 1, padding: "10px 12px", backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text-primary)", fontSize: 16, fontWeight: 600, fontFamily: "monospace",
    outline: "none", boxSizing: "border-box",
  },
  inputPrefix: { fontSize: 18, fontWeight: 700, color: "var(--text-muted)" },
  inputSuffix: { fontSize: 16, fontWeight: 700, color: "var(--text-muted)" },
  applyBtn: {
    padding: "10px 16px", borderRadius: 8, border: "none", backgroundColor: "#22c55e",
    color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
  },
  cancelBtn: {
    padding: "6px 0", border: "none", backgroundColor: "transparent",
    color: "var(--text-dim)", fontSize: 13, cursor: "pointer", textDecoration: "underline",
  },
  error: {
    fontSize: 13, color: "#fca5a5", textAlign: "center", padding: "4px 0",
  },
};
