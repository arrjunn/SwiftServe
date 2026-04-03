import { useState, useEffect, Component, lazy, Suspense } from "react";
import { db } from "./db/index.js";
import { seedDatabase, resolveOutletId } from "./db/seed.js";
import { AuthProvider, useAuth } from "./contexts/AuthContext.jsx";
import { OrderProvider, useOrder } from "./contexts/OrderContext.jsx";

// ── Static imports: screens needed on initial load ──
import LoginScreen from "./screens/LoginScreen.jsx";
import ShiftOpenScreen from "./screens/ShiftOpenScreen.jsx";
import ShiftCloseScreen from "./screens/ShiftCloseScreen.jsx";
import OrderQueueScreen from "./screens/OrderQueueScreen.jsx";
import MenuScreen from "./screens/MenuScreen.jsx";
import CartScreen from "./screens/CartScreen.jsx";
import KDSScreen from "./screens/KDSScreen.jsx";

// ── Lazy-loaded screens: admin, reports, payments, receipts, setup ──
const HeldOrdersScreen = lazy(() => import("./screens/HeldOrdersScreen.jsx"));
const CashPaymentScreen = lazy(() => import("./screens/CashPaymentScreen.jsx"));
const ReceiptScreen = lazy(() => import("./screens/ReceiptScreen.jsx"));
const CancelOrderScreen = lazy(() => import("./screens/CancelOrderScreen.jsx"));
const OrderModifyScreen = lazy(() => import("./screens/OrderModifyScreen.jsx"));
const OrderDetailScreen = lazy(() => import("./screens/OrderDetailScreen.jsx"));
const PaymentSelectScreen = lazy(() => import("./screens/PaymentSelectScreen.jsx"));
const UPIPaymentScreen = lazy(() => import("./screens/UPIPaymentScreen.jsx"));
const SplitPaymentScreen = lazy(() => import("./screens/SplitPaymentScreen.jsx"));
const RefundScreen = lazy(() => import("./screens/RefundScreen.jsx"));
const AdminHubScreen = lazy(() => import("./screens/AdminHubScreen.jsx"));
const StaffManagementScreen = lazy(() => import("./screens/StaffManagementScreen.jsx"));
const MenuBuilderScreen = lazy(() => import("./screens/MenuBuilderScreen.jsx"));
const MenuItemEditorScreen = lazy(() => import("./screens/MenuItemEditorScreen.jsx"));
const SettingsScreen = lazy(() => import("./screens/SettingsScreen.jsx"));
const ReportsHubScreen = lazy(() => import("./screens/ReportsHubScreen.jsx"));
const SalesReportScreen = lazy(() => import("./screens/SalesReportScreen.jsx"));
const ShiftReportScreen = lazy(() => import("./screens/ShiftReportScreen.jsx"));
const RevenueSummaryScreen = lazy(() => import("./screens/RevenueSummaryScreen.jsx"));
const TableManagementScreen = lazy(() => import("./screens/TableManagementScreen.jsx"));
const InventoryScreen = lazy(() => import("./screens/InventoryScreen.jsx"));
const WastageLogScreen = lazy(() => import("./screens/WastageLogScreen.jsx"));
const CustomerScreen = lazy(() => import("./screens/CustomerScreen.jsx"));
const CardPaymentScreen = lazy(() => import("./screens/CardPaymentScreen.jsx"));
const WelcomeScreen = lazy(() => import("./screens/WelcomeScreen.jsx"));
const OutletSetupScreen = lazy(() => import("./screens/OutletSetupScreen.jsx"));
const StaffPerformanceScreen = lazy(() => import("./screens/StaffPerformanceScreen.jsx"));
const DailyReportScreen = lazy(() => import("./screens/DailyReportScreen.jsx"));
const TableTimelineScreen = lazy(() => import("./screens/TableTimelineScreen.jsx"));
const ComboDealScreen = lazy(() => import("./screens/ComboDealScreen.jsx"));
const LoyaltyScreen = lazy(() => import("./screens/LoyaltyScreen.jsx"));
const CustomerFeedbackScreen = lazy(() => import("./screens/CustomerFeedbackScreen.jsx"));
const QuickReorderScreen = lazy(() => import("./screens/QuickReorderScreen.jsx"));

// Kiosk mode screens
const KioskWelcomeScreen = lazy(() => import("./screens/KioskWelcomeScreen.jsx"));
const KioskPhoneScreen = lazy(() => import("./screens/KioskPhoneScreen.jsx"));
const KioskMenuScreen = lazy(() => import("./screens/KioskMenuScreen.jsx"));
const KioskCartScreen = lazy(() => import("./screens/KioskCartScreen.jsx"));
const KioskPaymentScreen = lazy(() => import("./screens/KioskPaymentScreen.jsx"));
const KioskConfirmationScreen = lazy(() => import("./screens/KioskConfirmationScreen.jsx"));

import OfflineQueueIndicator from "./components/OfflineQueueIndicator.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
import { ToastProvider } from "./components/Toast.jsx";

/** Loading fallback for lazy-loaded screens */
function LoadingFallback() {
  return <LoadingScreen message="Loading screen..." />;
}
import { SyncProvider } from "./sync/SyncContext.jsx";
import { SupabaseAuthProvider, useSupabaseAuth } from "./contexts/SupabaseAuthContext.jsx";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext.jsx";

/** Global error boundary — prevents blank screen on unhandled errors */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: "100vh", display: "flex", alignItems: "center",
          justifyContent: "center", background: "var(--bg-primary)", color: "var(--error-light)",
          flexDirection: "column", gap: 12, padding: 32, textAlign: "center",
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</div>
          <div style={{ fontSize: 14, maxWidth: 500, wordBreak: "break-all", color: "#94a3b8" }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </div>
          <button onClick={() => {
            this.setState({ hasError: false, error: null });
          }} style={{
            marginTop: 16, padding: "8px 24px", background: "#6366f1", color: "#fff",
            border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, minHeight: 44,
          }}>Try Again</button>
          <button onClick={() => window.location.reload()} style={{
            padding: "8px 24px", background: "transparent", color: "#94a3b8",
            border: "1px solid #334155", borderRadius: 8, cursor: "pointer", fontSize: 14, minHeight: 44,
          }}>Reload App</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Screen routing via simple state machine.
 * No react-router — a POS is a state machine, not a website.
 */
function AppRouter() {
  const auth = useAuth();
  const order = useOrder();
  const [screen, setScreen] = useState("login");
  const [screenParams, setScreenParams] = useState({}); // e.g. { orderId }
  const [dbReady, setDbReady] = useState(false);
  const [seedError] = useState(null);

  const goTo = (nextScreen, params = {}) => {
    setScreen(nextScreen);
    setScreenParams(params);
  };

  // Seed database on first load — auto-recover if DB is broken
  useEffect(() => {
    (async () => {
      try {
        await seedDatabase();
        // Resolve the actual outlet ID (seeded or Supabase-created)
        const oid = await resolveOutletId();
        // Verify DB is actually usable
        const staffCount = await db.staff.count();
        const outletCount = await db.outlets.count();
        if (staffCount === 0 && outletCount === 0) {
          console.warn("[APP] Empty DB detected — auto-recovering...");
          await db.delete();
          localStorage.clear();
          window.location.reload();
          return;
        }
        // Auto-fill menu: seed missing items per category
        if (outletCount > 0) {
          const allCats = await db.menu_categories.where("outlet_id").equals(oid).sortBy("sort_order");
          if (allCats.length === 0) {
            const defaultCats = ["Burgers","Wraps","Sides","Beverages","Desserts","Combos"];
            for (let i = 0; i < defaultCats.length; i++) {
              await db.menu_categories.add({ id: crypto.randomUUID(), outlet_id: oid, name: defaultCats[i], sort_order: i+1, is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
            }
          }
          const cats = await db.menu_categories.where("outlet_id").equals(oid).sortBy("sort_order");
          const cm = {}; for (const c of cats) cm[c.name] = c.id;
          const existingItems = await db.menu_items.where("outlet_id").equals(oid).toArray();
          const existingNames = new Set(existingItems.map(i => i.name));

          const fullMenu = [
            // Burgers (7)
            {c:"Burgers",n:"Classic Veg Burger",s:"Veg Burger",p:12900,t:"veg",st:"grill",pr:8},
            {c:"Burgers",n:"Paneer Tikka Burger",s:"Pnr Tikka",p:15900,t:"veg",st:"grill",pr:10},
            {c:"Burgers",n:"Chicken Burger",s:"Chk Burger",p:14900,t:"non_veg",st:"grill",pr:10},
            {c:"Burgers",n:"Double Chicken Burger",s:"Dbl Chk",p:19900,t:"non_veg",st:"grill",pr:12},
            {c:"Burgers",n:"Aloo Tikki Burger",s:"Aloo Tkki",p:9900,t:"veg",st:"grill",pr:7},
            {c:"Burgers",n:"Spicy Chicken Zinger",s:"Zinger",p:17900,t:"non_veg",st:"grill",pr:10},
            {c:"Burgers",n:"Mushroom Swiss Burger",s:"Mush Burg",p:16900,t:"veg",st:"grill",pr:10},
            // Wraps (6)
            {c:"Wraps",n:"Paneer Kathi Roll",s:"Pnr Roll",p:13900,t:"veg",st:"grill",pr:8},
            {c:"Wraps",n:"Chicken Kathi Roll",s:"Chk Roll",p:15900,t:"non_veg",st:"grill",pr:9},
            {c:"Wraps",n:"Egg Roll",s:"Egg Roll",p:11900,t:"egg",st:"grill",pr:7},
            {c:"Wraps",n:"Veg Frankie",s:"Veg Frank",p:10900,t:"veg",st:"grill",pr:6},
            {c:"Wraps",n:"Chicken Shawarma",s:"Shawarma",p:16900,t:"non_veg",st:"grill",pr:10},
            {c:"Wraps",n:"Paneer Tikka Wrap",s:"Pnr Wrap",p:14900,t:"veg",st:"grill",pr:8},
            // Sides (6)
            {c:"Sides",n:"French Fries",s:"Fries",p:7900,t:"veg",st:"fryer",pr:5},
            {c:"Sides",n:"Peri Peri Fries",s:"PP Fries",p:9900,t:"veg",st:"fryer",pr:5},
            {c:"Sides",n:"Chicken Nuggets (6pc)",s:"Nuggets",p:12900,t:"non_veg",st:"fryer",pr:6},
            {c:"Sides",n:"Onion Rings",s:"Onion Rng",p:8900,t:"veg",st:"fryer",pr:5},
            {c:"Sides",n:"Coleslaw",s:"Coleslaw",p:5900,t:"veg",st:"assembly",pr:2},
            {c:"Sides",n:"Garlic Bread (4pc)",s:"Garlic Bd",p:9900,t:"veg",st:"grill",pr:6},
            // Beverages (8)
            {c:"Beverages",n:"Coke 300ml",s:"Coke",p:4900,t:"veg",st:"assembly",pr:1},
            {c:"Beverages",n:"Sprite 300ml",s:"Sprite",p:4900,t:"veg",st:"assembly",pr:1},
            {c:"Beverages",n:"Fresh Lime Soda",s:"Lime Soda",p:6900,t:"veg",st:"assembly",pr:3},
            {c:"Beverages",n:"Mango Lassi",s:"Mng Lassi",p:7900,t:"veg",st:"assembly",pr:3},
            {c:"Beverages",n:"Cold Coffee",s:"Cold Coff",p:8900,t:"veg",st:"assembly",pr:4},
            {c:"Beverages",n:"Masala Chai",s:"Chai",p:3900,t:"veg",st:"assembly",pr:3},
            {c:"Beverages",n:"Oreo Milkshake",s:"Oreo Shk",p:11900,t:"veg",st:"assembly",pr:4},
            {c:"Beverages",n:"Mineral Water 500ml",s:"Water",p:2000,t:"veg",st:"assembly",pr:0},
            // Desserts (6)
            {c:"Desserts",n:"Chocolate Brownie",s:"Brownie",p:8900,t:"veg",st:"assembly",pr:2},
            {c:"Desserts",n:"Gulab Jamun (2pc)",s:"Gulab J",p:6900,t:"veg",st:"assembly",pr:2},
            {c:"Desserts",n:"Kulfi",s:"Kulfi",p:5900,t:"veg",st:"assembly",pr:1},
            {c:"Desserts",n:"Chocolate Lava Cake",s:"Lava Cake",p:12900,t:"veg",st:"assembly",pr:3},
            {c:"Desserts",n:"Ice Cream Sundae",s:"Sundae",p:9900,t:"veg",st:"assembly",pr:2},
            {c:"Desserts",n:"Rasgulla (2pc)",s:"Rasgulla",p:5900,t:"veg",st:"assembly",pr:1},
            // Combos (6)
            {c:"Combos",n:"Veg Burger + Fries + Coke",s:"Veg Combo",p:22900,t:"veg",st:"assembly",pr:10},
            {c:"Combos",n:"Chicken Burger + Fries + Coke",s:"Chk Combo",p:25900,t:"non_veg",st:"assembly",pr:12},
            {c:"Combos",n:"Roll + Fries + Drink",s:"Roll Combo",p:21900,t:"veg",st:"assembly",pr:10},
            {c:"Combos",n:"Double Burger + Fries + Shake",s:"Mega Combo",p:34900,t:"non_veg",st:"assembly",pr:15},
            {c:"Combos",n:"Wrap + Nuggets + Drink",s:"Wrap Combo",p:27900,t:"non_veg",st:"assembly",pr:12},
            {c:"Combos",n:"Family Pack (4 Burgers + 2 Fries + 4 Drinks)",s:"Family Pk",p:69900,t:"veg",st:"assembly",pr:18},
          ];

          const newItems = fullMenu.filter(it => !existingNames.has(it.n));
          if (newItems.length > 0) {
            const now = new Date().toISOString();
            const fb = cats[0]?.id;
            for (let i = 0; i < newItems.length; i++) {
              const it = newItems[i];
              if (!cm[it.c] && !fb) continue;
              await db.menu_items.add({
                id: crypto.randomUUID(), outlet_id: oid, category_id: cm[it.c] || fb,
                name: it.n, short_name: it.s, price: it.p, tax_rate: 500, hsn_code: "9963",
                food_type: it.t, is_available: 1, is_active: 1, prep_time_mins: it.pr || 5,
                station: it.st, sort_order: existingItems.length + i + 1,
                variants: "[]", addons: "[]", tags: "[]",
                created_at: now, updated_at: now,
              });
            }
            console.log(`[APP] Added ${newItems.length} new menu items.`);
          }

          // Auto-fill tables up to 20
          const existingTables = await db.floor_tables.where("outlet_id").equals(oid).toArray();
          const existingNums = new Set(existingTables.map(t => t.table_number));
          const allTables = [
            ...Array.from({ length: 10 }, (_, i) => ({ num: i + 1, section: "main", capacity: i < 4 ? 4 : i < 8 ? 2 : 6 })),
            ...Array.from({ length: 6 }, (_, i) => ({ num: i + 11, section: "patio", capacity: i < 3 ? 4 : 2 })),
            ...Array.from({ length: 4 }, (_, i) => ({ num: i + 17, section: "private", capacity: 6 })),
          ];
          const newTables = allTables.filter(t => !existingNums.has(`T${t.num}`));
          if (newTables.length > 0) {
            const now2 = new Date().toISOString();
            for (const t of newTables) {
              await db.floor_tables.add({
                id: crypto.randomUUID(),
                outlet_id: oid,
                table_number: `T${t.num}`,
                section: t.section,
                capacity: t.capacity,
                status: "available",
                current_order_id: null,
                sort_order: t.num,
                created_at: now2,
                updated_at: now2,
              });
            }
            console.log(`[APP] Added ${newTables.length} new tables.`);
          }

          // Auto-fill staff: ensure counter, kitchen, captain exist
          const existingStaff = await db.staff.where("outlet_id").equals(oid).toArray();
          const existingRoles = new Set(existingStaff.map(s => s.role));
          const PIN_HASH = "$2a$10$Fs2S0sJP2M0wpkbLlcX54u0wyHRs2BO1ZngYpd9/pjw4t2bHvUTcC"; // 1234
          const defaultStaff = [
            { name: "Priya", role: "counter", phone: "" },
            { name: "Suresh", role: "kitchen", phone: "" },
            { name: "Deepak", role: "captain", phone: "" },
            { name: "Kiosk", role: "kiosk", phone: "" },
          ];
          const missingStaff = defaultStaff.filter(s => !existingRoles.has(s.role));
          if (missingStaff.length > 0) {
            const now3 = new Date().toISOString();
            for (const s of missingStaff) {
              await db.staff.add({
                id: crypto.randomUUID(),
                outlet_id: oid,
                name: s.name,
                phone: s.phone,
                role: s.role,
                pin_hash: PIN_HASH,
                is_active: 1,
                must_change_pin: 1,
                permissions: "{}",
                created_at: now3,
                updated_at: now3,
              });
            }
            console.log(`[APP] Added ${missingStaff.length} missing staff (PIN: 1234).`);
          }
        }
        setDbReady(true);
      } catch (err) {
        console.error("[APP] DB error — auto-recovering:", err.message);
        try {
          await db.delete();
        } catch (_) { /* ignore */ }
        localStorage.clear();
        window.location.reload();
      }
    })();
  }, []);

  // Reset to login when logged out
  useEffect(() => {
    if (!auth.isLoggedIn) {
      setScreen("login");
    }
  }, [auth.isLoggedIn]);

  // Role-based screen access enforcement
  useEffect(() => {
    const role = auth.staff?.role;
    if (!role) return;

    // Kitchen: ONLY KDS
    if (role === "kitchen" && screen !== "kds" && screen !== "login") {
      setScreen("kds");
      return;
    }

    // Kiosk: locked to kiosk screens only
    const kioskAllowed = ["login", "kiosk-welcome", "kiosk-phone", "kiosk-menu", "kiosk-cart", "kiosk-payment", "kiosk-confirmation"];
    if (role === "kiosk" && !kioskAllowed.includes(screen)) {
      setScreen("kiosk-welcome");
      return;
    }

    // Captain: order queue, menu, cart, table management, order detail — NO payments, admin, reports, refunds
    const captainAllowed = ["login", "order-queue", "menu", "cart", "held-orders", "order-detail", "table-management", "table-timeline", "quick-reorder"];
    if (role === "captain" && !captainAllowed.includes(screen)) {
      setScreen("order-queue");
      return;
    }

    // Counter: no admin-only screens (loyalty, combos, feedback, staff, settings, reports)
    const ownerOnly = ["loyalty", "combo-deals", "customer-feedback", "staff-management", "staff-performance", "daily-report"];
    if (role === "counter" && ownerOnly.includes(screen)) {
      setScreen("order-queue");
    }
  }, [screen, auth.staff]);

  if (!dbReady) {
    return <LoadingScreen message="Setting up database..." />;
  }

  if (seedError) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#0f172a", color: "#fca5a5",
        flexDirection: "column", gap: 12, padding: 32, textAlign: "center",
      }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Seed Error</div>
        <div style={{ fontSize: 14, maxWidth: 500, wordBreak: "break-all" }}>{seedError}</div>
        <button onClick={() => window.location.reload()} style={{
          marginTop: 16, padding: "8px 24px", background: "#6366f1", color: "#fff",
          border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14,
        }}>Retry</button>
      </div>
    );
  }

  // Screen state machine — wrapped in Suspense for lazy-loaded screens
  const renderScreen = () => { switch (screen) {
    case "login":
      return (
        <LoginScreen
          onLoginSuccess={async () => {
            const role = auth.staff?.role;
            if (role === "kitchen") {
              goTo("kds");
            } else if (role === "kiosk") {
              // Auto-open shift for kiosk
              if (!auth.shift) {
                try { await auth.openShift(0); } catch (e) { console.warn("[APP] Kiosk shift:", e.message); }
              }
              goTo("kiosk-welcome");
            } else {
              // Auto-open shift silently (skip ShiftOpenScreen)
              if (["counter", "owner", "admin"].includes(role) && !auth.shift) {
                try { await auth.openShift(0); } catch (e) { console.warn("[APP] Auto shift:", e.message); }
              }
              goTo("order-queue");
            }
          }}
          onKioskMode={async () => {
            // Find kiosk staff and auto-login without PIN
            const allStaff = await db.staff.where("outlet_id").equals(await resolveOutletId()).toArray();
            const kioskStaff = allStaff.find(s => s.role === "kiosk" && s.is_active === 1);
            if (kioskStaff) {
              const loggedIn = await auth.login(kioskStaff.id, null);
              if (loggedIn) {
                // Defer shift open to next tick so React state is committed
                setTimeout(async () => {
                  try { await auth.openShift(0); } catch (_) {}
                  goTo("kiosk-welcome");
                }, 50);
              }
            }
          }}
        />
      );

    case "shift-open":
      return (
        <ShiftOpenScreen
          onShiftOpened={() => goTo("order-queue")}
          onBack={() => goTo("login")}
        />
      );

    case "order-queue":
      return (
        <OrderQueueScreen
          onNewOrder={() => { order.resetOrder(); goTo("menu"); }}
          onLogout={() => {
            auth.logout();
            goTo("login");
          }}
          onCloseShift={() => goTo("shift-close")}
          onHeldOrders={() => goTo("held-orders")}
          onCancelOrder={(orderId) => goTo("cancel-order", { orderId })}
          onModifyOrder={(orderId) => goTo("order-modify", { orderId })}
          onViewOrder={(orderId) => goTo("order-detail", { orderId })}
          onRefundOrder={(orderId) => goTo("refund-order", { orderId })}
          onReorder={async (orderId) => {
            const items = await db.order_items.where("order_id").equals(orderId).filter(i => !i.is_void).toArray();
            order.resetOrder();
            for (const item of items) {
              const menuItem = await db.menu_items.get(item.menu_item_id);
              if (menuItem && menuItem.is_active && menuItem.is_available) {
                for (let q = 0; q < item.quantity; q++) {
                  order.addItem(menuItem);
                }
              }
            }
            goTo("cart");
          }}
          onAdmin={() => goTo("admin-hub")}
          onQuickReorder={() => goTo("quick-reorder")}
          onTableTimeline={() => goTo("table-timeline")}
          onTableManagement={() => goTo("table-management")}
        />
      );

    case "shift-close":
      return (
        <ShiftCloseScreen
          onShiftClosed={() => { auth.logout(); goTo("login"); }}
          onCancel={() => goTo("order-queue")}
        />
      );

    case "held-orders":
      return (
        <HeldOrdersScreen
          onResume={() => goTo("cart")}
          onBack={() => goTo("order-queue")}
        />
      );

    case "order-detail":
      return (
        <OrderDetailScreen
          orderId={screenParams.orderId}
          onBack={() => goTo("order-queue")}
          onRefund={(orderId) => goTo("refund-order", { orderId })}
        />
      );

    case "cancel-order":
      return (
        <CancelOrderScreen
          orderId={screenParams.orderId}
          onCancelled={() => goTo("order-queue")}
          onBack={() => goTo("order-queue")}
        />
      );

    case "order-modify":
      return (
        <OrderModifyScreen
          orderId={screenParams.orderId}
          onModified={() => goTo("order-queue")}
          onBack={() => goTo("order-queue")}
        />
      );

    case "menu":
      return (
        <MenuScreen
          onProceedToCart={() => goTo("cart")}
          onCancel={() => goTo("order-queue")}
        />
      );

    case "cart":
      return (
        <CartScreen
          onProceedToPayment={() => goTo("payment-select")}
          onBackToMenu={() => goTo("menu")}
          onOrderHeld={() => goTo("order-queue")}
          onOrderSubmitted={() => goTo("order-queue")}
        />
      );

    case "payment-select":
      return (
        <PaymentSelectScreen
          onCash={() => goTo("cash-payment")}
          onUPI={() => goTo("upi-payment")}
          onSplit={() => goTo("split-payment")}
          onCard={() => goTo("card-payment")}
          onBack={() => goTo("cart")}
        />
      );

    case "cash-payment":
      return (
        <CashPaymentScreen
          onPaymentComplete={() => goTo("receipt")}
          onBack={() => goTo("payment-select")}
        />
      );

    case "upi-payment":
      return (
        <UPIPaymentScreen
          onPaymentComplete={() => goTo("receipt")}
          onPayWithCash={() => goTo("cash-payment")}
          onBack={() => goTo("payment-select")}
        />
      );

    case "split-payment":
      return (
        <SplitPaymentScreen
          onPaymentComplete={() => goTo("receipt")}
          onBack={() => goTo("payment-select")}
        />
      );

    case "refund-order":
      return (
        <RefundScreen
          orderId={screenParams.orderId}
          onRefunded={() => goTo("order-queue")}
          onBack={() => goTo("order-queue")}
        />
      );

    case "admin-hub":
      return (
        <AdminHubScreen
          onNavigate={(key) => {
            if (key === "staff") goTo("staff-management");
            else if (key === "menu") goTo("menu-builder");
            else if (key === "settings") goTo("settings");
            else if (key === "reports") goTo("reports-hub");
            else if (key === "tables") goTo("table-management");
            else if (key === "inventory") goTo("inventory");
            else if (key === "wastage") goTo("wastage-log");
            else if (key === "customers") goTo("customers");
            else if (key === "combos") goTo("combo-deals");
            else if (key === "loyalty") goTo("loyalty");
            else if (key === "feedback") goTo("customer-feedback");
          }}
          onBack={() => goTo("order-queue")}
        />
      );

    case "staff-management":
      return (
        <StaffManagementScreen
          onBack={() => goTo("admin-hub")}
        />
      );

    case "menu-builder":
      return (
        <MenuBuilderScreen
          onEditItem={(itemId, categoryId) => goTo("menu-item-editor", { itemId, categoryId })}
          onBack={() => goTo("admin-hub")}
        />
      );

    case "menu-item-editor":
      return (
        <MenuItemEditorScreen
          itemId={screenParams.itemId}
          categoryId={screenParams.categoryId}
          onSave={() => goTo("menu-builder")}
          onBack={() => goTo("menu-builder")}
        />
      );

    case "settings":
      return (
        <SettingsScreen
          onBack={() => goTo("admin-hub")}
        />
      );

    case "reports-hub":
      return (
        <ReportsHubScreen
          onNavigate={(key) => {
            if (key === "sales") goTo("sales-report");
            else if (key === "shift") goTo("shift-report");
            else if (key === "revenue") goTo("revenue-summary");
            else if (key === "daily") goTo("daily-report");
            else if (key === "staff-performance") goTo("staff-performance");
          }}
          onBack={() => goTo("admin-hub")}
        />
      );

    case "sales-report":
      return (
        <SalesReportScreen
          onBack={() => goTo("reports-hub")}
        />
      );

    case "shift-report":
      return (
        <ShiftReportScreen
          onBack={() => goTo("reports-hub")}
        />
      );

    case "revenue-summary":
      return (
        <RevenueSummaryScreen
          onBack={() => goTo("reports-hub")}
        />
      );

    case "receipt":
      return (
        <ReceiptScreen
          onNewOrder={() => goTo("order-queue")}
        />
      );

    case "kds":
      return (
        <KDSScreen
          onBack={() => {
            // Kitchen staff can only logout — no access to POS screens
            auth.logout();
            goTo("login");
          }}
        />
      );

    case "table-management":
      return (
        <TableManagementScreen
          onBack={() => goTo("admin-hub")}
        />
      );

    case "inventory":
      return (
        <InventoryScreen
          onBack={() => goTo("admin-hub")}
        />
      );

    case "wastage-log":
      return (
        <WastageLogScreen
          onBack={() => goTo("admin-hub")}
        />
      );

    case "customers":
      return (
        <CustomerScreen
          onBack={() => goTo("admin-hub")}
        />
      );

    case "card-payment":
      return (
        <CardPaymentScreen
          onPaymentComplete={() => goTo("receipt")}
          onBack={() => goTo("payment-select")}
        />
      );

    case "combo-deals":
      return (
        <ComboDealScreen
          onBack={() => goTo("admin-hub")}
        />
      );

    case "loyalty":
      return (
        <LoyaltyScreen
          onBack={() => goTo("admin-hub")}
        />
      );

    case "customer-feedback":
      return (
        <CustomerFeedbackScreen
          onBack={() => goTo("admin-hub")}
        />
      );

    case "daily-report":
      return (
        <DailyReportScreen
          onBack={() => goTo("reports-hub")}
        />
      );

    case "staff-performance":
      return (
        <StaffPerformanceScreen
          onBack={() => goTo("reports-hub")}
        />
      );

    case "table-timeline":
      return (
        <TableTimelineScreen
          onBack={() => goTo("order-queue")}
        />
      );

    case "quick-reorder":
      return (
        <QuickReorderScreen
          onBack={() => goTo("order-queue")}
          onReorder={async (orderId) => {
            const items = await db.order_items.where("order_id").equals(orderId).filter(i => !i.is_void).toArray();
            order.resetOrder();
            for (const item of items) {
              const menuItem = await db.menu_items.get(item.menu_item_id);
              if (menuItem && menuItem.is_active && menuItem.is_available) {
                for (let q = 0; q < item.quantity; q++) {
                  order.addItem(menuItem);
                }
              }
            }
            goTo("cart");
          }}
        />
      );

    // ─── Kiosk Mode Screens ────────────────────────
    case "kiosk-welcome":
      return (
        <KioskWelcomeScreen
          onStart={() => {
            order.resetOrder(); // Clean slate for new customer
            goTo("kiosk-phone");
          }}
        />
      );

    case "kiosk-phone":
      return (
        <KioskPhoneScreen
          onConfirm={async (phone) => {
            // Search or create customer, link to order
            try {
              const oid = await resolveOutletId();
              let cust = await db.customers.where("outlet_id").equals(oid).filter(c => c.phone === phone).first();
              if (!cust) {
                const now = new Date().toISOString();
                cust = { id: crypto.randomUUID(), outlet_id: oid, name: "", phone, phone_hash: null, loyalty_points: 0, total_orders: 0, total_spent: 0, created_at: now, updated_at: now, synced_at: null, deleted_at: null };
                await db.customers.add(cust);
              }
              order.setCustomer(cust.id);
            } catch (e) { console.warn("[KIOSK] Customer link failed:", e.message); }
            goTo("kiosk-menu");
          }}
          onSkip={() => goTo("kiosk-menu")}
        />
      );

    case "kiosk-menu":
      return (
        <KioskMenuScreen
          onCheckout={() => goTo("kiosk-cart")}
        />
      );

    case "kiosk-cart":
      return (
        <KioskCartScreen
          onPay={() => goTo("kiosk-payment")}
          onBackToMenu={() => goTo("kiosk-menu")}
        />
      );

    case "kiosk-payment":
      return (
        <KioskPaymentScreen
          onPaymentComplete={(method) => {
            goTo("kiosk-confirmation", { paymentMethod: method });
          }}
          onBack={() => goTo("kiosk-cart")}
        />
      );

    case "kiosk-confirmation":
      return (
        <KioskConfirmationScreen
          orderNumber={order.orderNumber}
          paymentMethod={screenParams.paymentMethod || "cash"}
          total={order.grandTotal}
          itemCount={order.items.reduce((s, i) => s + i.qty, 0)}
          onNewOrder={() => {
            order.resetOrder();
            goTo("kiosk-welcome");
          }}
        />
      );

    default:
      return (
        <LoginScreen
          onLoginSuccess={() => goTo("shift-open")}
        />
      );
  } };

  return (
    <Suspense fallback={<LoadingFallback />}>
      {renderScreen()}
    </Suspense>
  );
}

/**
 * SupabaseGate — shows Welcome/Signup if not authenticated via Supabase,
 * OutletSetup if authenticated but no outlet configured, then POS flow.
 */
function SupabaseGate() {
  const { user, loading: authLoading, isAuthenticated } = useSupabaseAuth();
  const [hasOutlet, setHasOutlet] = useState(null); // null = checking, true/false = result
  const [checkingOutlet, setCheckingOutlet] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setHasOutlet(null);
      setCheckingOutlet(false);
      return;
    }
    // Check if this Supabase user has an outlet in local Dexie DB
    let cancelled = false;
    (async () => {
      try {
        const count = await db.outlets.count();
        if (!cancelled) {
          setHasOutlet(count > 0);
          setCheckingOutlet(false);
        }
      } catch {
        if (!cancelled) {
          setHasOutlet(false);
          setCheckingOutlet(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, user]);

  // Loading state
  if (authLoading || (isAuthenticated && checkingOutlet)) {
    return <LoadingScreen message="Authenticating..." />;
  }

  // Not authenticated → show Welcome/Signup
  if (!isAuthenticated) {
    return <WelcomeScreen />;
  }

  // Authenticated but no outlet → show Outlet Setup
  if (!hasOutlet) {
    return (
      <OutletSetupScreen
        onSetupComplete={() => {
          setHasOutlet(true);
        }}
      />
    );
  }

  // Authenticated + outlet exists → normal POS flow
  return (
    <AuthProvider>
      <OrderProvider>
        <SyncProvider>
          <AppRouter />
        </SyncProvider>
      </OrderProvider>
    </AuthProvider>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        position: "fixed", bottom: 60, left: 16, zIndex: 9999,
        height: 36, padding: "0 14px", borderRadius: 18,
        background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
        border: "1px solid " + (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"),
        color: "var(--text-muted)", fontSize: 12, fontWeight: 600,
        cursor: "pointer", display: "flex", alignItems: "center",
        backdropFilter: "blur(8px)", letterSpacing: 0.3,
        transition: "all 0.2s",
      }}
    >
      {isDark ? "Light" : "Dark"}
    </button>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ErrorBoundary>
          <ThemeToggle />
          <OfflineQueueIndicator />
          <SupabaseAuthProvider>
            <SupabaseGate />
          </SupabaseAuthProvider>
        </ErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
}
