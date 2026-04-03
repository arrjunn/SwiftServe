/** Roles and permissions */
export const ROLES = {
  COUNTER: "counter",
  KITCHEN: "kitchen",
  CAPTAIN: "captain",
  OWNER: "owner",
  ADMIN: "admin",
};

/** Default permissions per role */
export const ROLE_PERMISSIONS = {
  counter: {
    create_order: true,
    void_item: true, // requires PIN re-entry
    refund: false,
    view_reports: false,
    edit_menu: false,
    manage_staff: false,
    apply_discount: true, // up to 10%
    max_discount_percent: 1000, // basis points (10%)
  },
  kitchen: {
    create_order: false,
    void_item: false,
    refund: false,
    view_reports: false,
    edit_menu: false,
    manage_staff: false,
    update_kds_status: true,
  },
  captain: {
    create_order: true,
    void_item: false,
    refund: false,
    view_reports: false,
    edit_menu: false,
    manage_staff: false,
    manage_tables: true,
  },
  owner: {
    create_order: true,
    void_item: true,
    refund: true,
    view_reports: true,
    edit_menu: true,
    manage_staff: true,
    apply_discount: true,
    max_discount_percent: 10000, // 100%
  },
  admin: {
    create_order: true,
    void_item: true,
    refund: true,
    view_reports: true,
    edit_menu: true,
    manage_staff: true,
    apply_discount: true,
    max_discount_percent: 10000,
    manage_outlets: true,
  },
  kiosk: {
    create_order: true,
    void_item: false,
    refund: false,
    view_reports: false,
    edit_menu: false,
    manage_staff: false,
    apply_discount: false,
    max_discount_percent: 0,
  },
};

/** Order sources */
export const ORDER_SOURCES = {
  COUNTER: "counter",
  ZOMATO: "zomato",
  SWIGGY: "swiggy",
  WHATSAPP: "whatsapp",
  CAPTAIN: "captain",
  KIOSK: "kiosk",
};

/** Order types */
export const ORDER_TYPES = {
  DINE_IN: "dine_in",
  TAKEAWAY: "takeaway",
  DELIVERY: "delivery",
};

/** Order statuses */
export const ORDER_STATUS = {
  RECEIVED: "received",
  PREPARING: "preparing",
  READY: "ready",
  SERVED: "served",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

/** Payment methods */
export const PAYMENT_METHODS = {
  CASH: "cash",
  UPI: "upi",
  CARD: "card",
  SPLIT: "split",
};

/** Payment statuses */
export const PAYMENT_STATUS = {
  PENDING: "pending",
  SUCCESS: "success",
  FAILED: "failed",
  REFUNDED: "refunded",
};

/** KDS statuses */
export const KDS_STATUS = {
  PENDING: "pending",
  PREPARING: "preparing",
  READY: "ready",
};

/** Table statuses */
export const TABLE_STATUS = {
  AVAILABLE: "available",
  OCCUPIED: "occupied",
  RESERVED: "reserved",
  BLOCKED: "blocked",
};

/** Food types (Indian regulation) */
export const FOOD_TYPE = {
  VEG: "veg",
  NON_VEG: "non_veg",
  EGG: "egg",
};

/** Food type display config */
export const FOOD_TYPE_DISPLAY = {
  veg: { label: "Veg", color: "#16a34a", symbol: "●" },
  non_veg: { label: "Non-Veg", color: "#dc2626", symbol: "▲" },
  egg: { label: "Egg", color: "#ca8a04", symbol: "●" },
};

/** Indian states (for GST state codes) */
export const GST_STATE_CODES = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "27": "Maharashtra",
  "29": "Karnataka",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "36": "Telangana",
  "37": "Andhra Pradesh",
};

/** Subscription plans */
export const PLANS = {
  STARTER: {
    id: "starter",
    name: "Starter",
    price: 2900, // paise per week (₹29)
    maxStaff: 3,
    maxItems: 50,
    features: ["pos", "cash_payment", "basic_reports"],
  },
  GROWTH: {
    id: "growth",
    name: "Growth",
    price: 99900, // paise per month (₹999)
    maxStaff: 10,
    maxItems: 200,
    features: ["pos", "all_payments", "kds", "inventory", "reports", "gst"],
  },
  PRO: {
    id: "pro",
    name: "Pro",
    price: 249900, // paise per month (₹2,499)
    maxStaff: 50,
    maxItems: 999,
    features: ["pos", "all_payments", "kds", "inventory", "reports", "gst", "multi_outlet", "whatsapp", "loyalty", "aggregators"],
  },
};
