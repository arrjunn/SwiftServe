-- SwiftServe Cloud Database — Initial Schema
-- All money values in INTEGER PAISE (₹100.50 = 10050)
-- All timestamps TIMESTAMPTZ (UTC)
-- All primary keys UUID

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── OUTLETS ────────────────────────────────────────────────────────
CREATE TABLE outlets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  brand_name      TEXT,
  address_line1   TEXT NOT NULL,
  address_line2   TEXT,
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  pincode         TEXT NOT NULL CHECK(length(pincode) = 6),
  gstin           TEXT CHECK(gstin IS NULL OR length(gstin) = 15),
  fssai_number    TEXT,
  phone           TEXT NOT NULL,
  email           TEXT,
  timezone        TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  subscription_plan TEXT DEFAULT 'starter',
  subscription_expires_at TIMESTAMPTZ,
  invoice_prefix  TEXT NOT NULL,
  next_invoice_seq INTEGER NOT NULL DEFAULT 1,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

-- ─── STAFF ──────────────────────────────────────────────────────────
CREATE TABLE staff (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  name            TEXT NOT NULL,
  phone           TEXT,
  role            TEXT NOT NULL CHECK(role IN ('counter','kitchen','captain','owner','admin')),
  pin_hash        TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  permissions     JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_staff_outlet ON staff(outlet_id, is_active);

-- ─── SHIFTS ─────────────────────────────────────────────────────────
CREATE TABLE shifts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  staff_id        UUID NOT NULL REFERENCES staff(id),
  opened_at       TIMESTAMPTZ NOT NULL,
  closed_at       TIMESTAMPTZ,
  opening_cash    INTEGER NOT NULL DEFAULT 0,
  closing_cash    INTEGER,
  expected_cash   INTEGER,
  cash_difference INTEGER,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_shifts_outlet ON shifts(outlet_id, status);

-- ─── TABLES ─────────────────────────────────────────────────────────
CREATE TABLE tables (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  table_number    TEXT NOT NULL,
  section         TEXT DEFAULT 'main',
  capacity        INTEGER NOT NULL DEFAULT 4,
  status          TEXT NOT NULL DEFAULT 'available'
                  CHECK(status IN ('available','occupied','reserved','blocked')),
  current_order_id UUID, -- FK added via ALTER TABLE after orders table exists
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_tables_outlet_number ON tables(outlet_id, table_number)
  WHERE deleted_at IS NULL;

-- ─── MENU CATEGORIES ────────────────────────────────────────────────
CREATE TABLE menu_categories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  name            TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_menu_cats_outlet ON menu_categories(outlet_id, is_active);

-- ─── MENU ITEMS ─────────────────────────────────────────────────────
CREATE TABLE menu_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  category_id     UUID NOT NULL REFERENCES menu_categories(id),
  name            TEXT NOT NULL,
  short_name      TEXT,
  description     TEXT,
  price           INTEGER NOT NULL,
  tax_rate        INTEGER NOT NULL DEFAULT 500,
  hsn_code        TEXT NOT NULL DEFAULT '9963',
  food_type       TEXT NOT NULL DEFAULT 'veg'
                  CHECK(food_type IN ('veg','non_veg','egg')),
  is_available    BOOLEAN NOT NULL DEFAULT TRUE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  prep_time_mins  INTEGER DEFAULT 10,
  station         TEXT DEFAULT 'main',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  image_url       TEXT,
  tags            JSONB DEFAULT '[]',
  variants        JSONB DEFAULT '[]',
  addons          JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_menu_items_outlet ON menu_items(outlet_id, is_active);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);

-- ─── ORDERS ─────────────────────────────────────────────────────────
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  order_number    INTEGER NOT NULL,
  source          TEXT NOT NULL DEFAULT 'counter'
                  CHECK(source IN ('counter','zomato','swiggy','whatsapp','captain')),
  type            TEXT NOT NULL DEFAULT 'dine_in'
                  CHECK(type IN ('dine_in','takeaway','delivery')),
  status          TEXT NOT NULL DEFAULT 'received'
                  CHECK(status IN ('received','preparing','ready','served','completed','cancelled','held')),
  table_id        UUID REFERENCES tables(id),
  staff_id        UUID NOT NULL REFERENCES staff(id),
  shift_id        UUID REFERENCES shifts(id),
  customer_id     UUID,
  subtotal        INTEGER NOT NULL DEFAULT 0,
  tax_total       INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  discount_reason TEXT,
  round_off       INTEGER NOT NULL DEFAULT 0,
  grand_total     INTEGER NOT NULL DEFAULT 0,
  external_order_id TEXT,
  received_at     TIMESTAMPTZ NOT NULL,
  preparing_at    TIMESTAMPTZ,
  ready_at        TIMESTAMPTZ,
  served_at       TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  is_held         BOOLEAN NOT NULL DEFAULT FALSE,
  held_reason     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_orders_outlet_date ON orders(outlet_id, created_at);
CREATE INDEX idx_orders_status ON orders(outlet_id, status);
CREATE INDEX idx_orders_shift ON orders(shift_id);
-- Prevent duplicate order numbers per outlet per day
CREATE UNIQUE INDEX idx_orders_unique_number ON orders(outlet_id, order_number, (DATE(created_at AT TIME ZONE 'Asia/Kolkata')))
  WHERE deleted_at IS NULL;

-- ─── ORDER ITEMS ────────────────────────────────────────────────────
CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  order_id        UUID NOT NULL REFERENCES orders(id),
  menu_item_id    UUID NOT NULL REFERENCES menu_items(id),
  name            TEXT NOT NULL,
  variant_name    TEXT,
  quantity        INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  unit_price      INTEGER NOT NULL,
  variant_add     INTEGER NOT NULL DEFAULT 0,
  addon_total     INTEGER NOT NULL DEFAULT 0,
  effective_price INTEGER NOT NULL,
  line_total      INTEGER NOT NULL,
  tax_rate        INTEGER NOT NULL,
  cgst_amount     INTEGER NOT NULL DEFAULT 0,
  sgst_amount     INTEGER NOT NULL DEFAULT 0,
  cess_amount     INTEGER NOT NULL DEFAULT 0,
  tax_total       INTEGER NOT NULL DEFAULT 0,
  hsn_code        TEXT NOT NULL,
  food_type       TEXT NOT NULL,
  addons_json     JSONB DEFAULT '[]',
  station         TEXT DEFAULT 'main',
  kds_status      TEXT DEFAULT 'pending'
                  CHECK(kds_status IN ('pending','preparing','ready')),
  notes           TEXT,
  is_void         BOOLEAN NOT NULL DEFAULT FALSE,
  void_reason     TEXT,
  void_by         UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_kds ON order_items(outlet_id, station, kds_status);

-- ─── PAYMENTS ───────────────────────────────────────────────────────
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  order_id        UUID NOT NULL REFERENCES orders(id),
  shift_id        UUID REFERENCES shifts(id),
  method          TEXT NOT NULL CHECK(method IN ('cash','upi','card','split')),
  amount          INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK(status IN ('pending','success','failed','refunded')),
  gateway         TEXT,
  gateway_txn_id  TEXT,
  gateway_order_id TEXT,
  upi_vpa_masked  TEXT,
  cash_tendered   INTEGER,
  cash_change     INTEGER,
  is_refund       BOOLEAN NOT NULL DEFAULT FALSE,
  refund_of       UUID,
  refund_reason   TEXT,
  refunded_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_shift ON payments(shift_id);

-- ─── INVOICES (IMMUTABLE after IRN) ────────────────────────────────
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  order_id        UUID NOT NULL REFERENCES orders(id),
  invoice_number  TEXT NOT NULL,
  invoice_date    TEXT NOT NULL,
  financial_year  TEXT NOT NULL,
  seller_gstin    TEXT NOT NULL,
  seller_name     TEXT NOT NULL,
  seller_address  TEXT NOT NULL,
  buyer_name      TEXT,
  buyer_gstin     TEXT,
  buyer_phone     TEXT,
  subtotal        INTEGER NOT NULL,
  cgst_total      INTEGER NOT NULL DEFAULT 0,
  sgst_total      INTEGER NOT NULL DEFAULT 0,
  igst_total      INTEGER NOT NULL DEFAULT 0,
  cess_total      INTEGER NOT NULL DEFAULT 0,
  discount_total  INTEGER NOT NULL DEFAULT 0,
  round_off       INTEGER NOT NULL DEFAULT 0,
  grand_total     INTEGER NOT NULL,
  irn             TEXT,
  irn_generated_at TIMESTAMPTZ,
  qr_code_data    TEXT,
  is_credit_note  BOOLEAN NOT NULL DEFAULT FALSE,
  original_invoice_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_invoices_number ON invoices(outlet_id, invoice_number);
CREATE INDEX idx_invoices_order ON invoices(order_id);

-- ─── CUSTOMERS (PII — encrypt phone/email in app layer) ───────────
CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  name            TEXT,
  phone           TEXT NOT NULL,
  phone_hash      TEXT NOT NULL,
  email           TEXT,
  loyalty_points  INTEGER NOT NULL DEFAULT 0,
  total_spent     INTEGER NOT NULL DEFAULT 0,
  total_orders    INTEGER NOT NULL DEFAULT 0,
  first_order_at  TIMESTAMPTZ,
  last_order_at   TIMESTAMPTZ,
  consent_given   BOOLEAN NOT NULL DEFAULT FALSE,
  consent_at      TIMESTAMPTZ,
  consent_purpose JSONB,
  data_deletion_requested BOOLEAN NOT NULL DEFAULT FALSE,
  data_deletion_requested_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_customers_phone ON customers(phone_hash);
CREATE INDEX idx_customers_outlet ON customers(outlet_id);

-- ─── INVENTORY ──────────────────────────────────────────────────────
CREATE TABLE inventory_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  name            TEXT NOT NULL,
  sku             TEXT,
  unit            TEXT NOT NULL DEFAULT 'kg'
                  CHECK(unit IN ('kg','g','l','ml','pcs','dozen','box')),
  current_stock   INTEGER NOT NULL DEFAULT 0,
  min_stock       INTEGER NOT NULL DEFAULT 0,
  max_stock       INTEGER,
  cost_per_unit   INTEGER NOT NULL DEFAULT 0,
  supplier        TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_received_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_inventory_outlet ON inventory_items(outlet_id, is_active);

CREATE TABLE inventory_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  type            TEXT NOT NULL
                  CHECK(type IN ('receive','sale_deduct','wastage','adjustment','transfer')),
  quantity_change  INTEGER NOT NULL,
  quantity_before  INTEGER NOT NULL,
  quantity_after   INTEGER NOT NULL,
  reference_type  TEXT,
  reference_id    UUID,
  cost_per_unit   INTEGER,
  notes           TEXT,
  staff_id        UUID REFERENCES staff(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_inv_txn_item ON inventory_transactions(inventory_item_id, created_at);

-- ─── RECIPES (BOM) ─────────────────────────────────────────────────
CREATE TABLE recipe_ingredients (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  menu_item_id    UUID NOT NULL REFERENCES menu_items(id),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  quantity_needed INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_recipe_menu ON recipe_ingredients(menu_item_id);

-- ─── PROMOS ─────────────────────────────────────────────────────────
CREATE TABLE promos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK(type IN ('percent','flat','bogo','combo')),
  value           INTEGER NOT NULL,
  min_order       INTEGER NOT NULL DEFAULT 0,
  max_discount    INTEGER,
  applies_to      TEXT DEFAULT 'all',
  applies_to_ids  JSONB DEFAULT '[]',
  coupon_code     TEXT,
  usage_limit     INTEGER,
  used_count      INTEGER NOT NULL DEFAULT 0,
  starts_at       TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_promos_outlet ON promos(outlet_id, is_active);

-- ─── PURCHASE ORDERS ────────────────────────────────────────────────
CREATE TABLE purchase_orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  supplier_name   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK(status IN ('draft','ordered','received','cancelled')),
  total_amount    INTEGER NOT NULL DEFAULT 0,
  ordered_at      TIMESTAMPTZ,
  received_at     TIMESTAMPTZ,
  notes           TEXT,
  staff_id        UUID REFERENCES staff(id),
  items_json      JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

-- ─── WASTAGE LOG ────────────────────────────────────────────────────
CREATE TABLE wastage_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  quantity        INTEGER NOT NULL,
  reason          TEXT NOT NULL CHECK(reason IN ('expired','damaged','spill','overcooked','other')),
  notes           TEXT,
  cost_value      INTEGER NOT NULL DEFAULT 0,
  staff_id        UUID REFERENCES staff(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

-- ─── AUDIT LOG (APPEND-ONLY — NO UPDATE, NO DELETE) ────────────────
CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  staff_id        UUID NOT NULL,
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  old_value       JSONB,
  new_value       JSONB,
  ip_address      TEXT,
  device_id       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ
);
CREATE INDEX idx_audit_outlet ON audit_log(outlet_id, created_at);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_log(outlet_id, action, created_at);

-- ─── DEFERRED FK: tables.current_order_id → orders(id) ────────────
ALTER TABLE tables ADD CONSTRAINT fk_tables_current_order
  FOREIGN KEY (current_order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- ─── PERFORMANCE INDEXES FOR SCALE ─────────────────────────────────
-- Functional index for date-filtered order queries (Asia/Kolkata timezone)
CREATE INDEX idx_orders_outlet_date_tz ON orders(outlet_id, (DATE(created_at AT TIME ZONE 'Asia/Kolkata')));
-- Sync pull: tables need (outlet_id, updated_at) for efficient delta queries
CREATE INDEX idx_shifts_sync ON shifts(outlet_id, updated_at);
CREATE INDEX idx_tables_sync ON tables(outlet_id, updated_at);
CREATE INDEX idx_menu_cats_sync ON menu_categories(outlet_id, updated_at);
CREATE INDEX idx_menu_items_sync ON menu_items(outlet_id, updated_at);
CREATE INDEX idx_orders_sync ON orders(outlet_id, updated_at);
CREATE INDEX idx_order_items_sync ON order_items(outlet_id, updated_at);
CREATE INDEX idx_payments_sync ON payments(outlet_id, updated_at);
CREATE INDEX idx_invoices_sync ON invoices(outlet_id, updated_at);
CREATE INDEX idx_customers_sync ON customers(outlet_id, updated_at);
CREATE INDEX idx_promos_sync ON promos(outlet_id, updated_at);
-- Refund-check query optimization
CREATE INDEX idx_payments_refund ON payments(order_id, is_refund) WHERE deleted_at IS NULL;
-- Order items covering index for non-void items
CREATE INDEX idx_order_items_active ON order_items(order_id) WHERE is_void = FALSE AND deleted_at IS NULL;

-- ─── SCHEMA VERSION TRACKING ────────────────────────────────────────
CREATE TABLE schema_migrations (
  version         INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO schema_migrations (version, name) VALUES (1, '001_initial');
