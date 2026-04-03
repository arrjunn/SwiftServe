-- ═══════════════════════════════════════════════════════════════
-- SwiftServe — Complete Supabase Setup
--
-- INSTRUCTIONS:
-- 1. Go to https://supabase.com/dashboard/project/rjrmzvwgsscnthfzuudx/sql
-- 2. Click "New query"
-- 3. Paste this ENTIRE file
-- 4. Click "Run"
-- ═══════════════════════════════════════════════════════════════

-- ═══ PART 1: SCHEMA (001_initial.sql) ════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS outlets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  brand_name      TEXT,
  address_line1   TEXT NOT NULL DEFAULT '',
  address_line2   TEXT,
  city            TEXT NOT NULL DEFAULT '',
  state           TEXT NOT NULL DEFAULT '',
  pincode         TEXT NOT NULL DEFAULT '000000',
  gstin           TEXT,
  fssai_number    TEXT,
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT,
  timezone        TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  subscription_plan TEXT DEFAULT 'starter',
  subscription_expires_at TIMESTAMPTZ,
  invoice_prefix  TEXT NOT NULL DEFAULT 'SS-',
  next_invoice_seq INTEGER NOT NULL DEFAULT 1,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  owner_user_id   UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS staff (
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

CREATE TABLE IF NOT EXISTS shifts (
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

CREATE TABLE IF NOT EXISTS tables (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  table_number    TEXT NOT NULL,
  section         TEXT DEFAULT 'main',
  capacity        INTEGER NOT NULL DEFAULT 4,
  status          TEXT NOT NULL DEFAULT 'available'
                  CHECK(status IN ('available','occupied','reserved','blocked')),
  current_order_id UUID,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS menu_categories (
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

CREATE TABLE IF NOT EXISTS menu_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  category_id     UUID NOT NULL REFERENCES menu_categories(id),
  name            TEXT NOT NULL,
  short_name      TEXT,
  description     TEXT,
  price           INTEGER NOT NULL,
  tax_rate        INTEGER NOT NULL DEFAULT 500,
  hsn_code        TEXT NOT NULL DEFAULT '9963',
  food_type       TEXT NOT NULL DEFAULT 'veg' CHECK(food_type IN ('veg','non_veg','egg')),
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

CREATE TABLE IF NOT EXISTS orders (
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
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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

CREATE TABLE IF NOT EXISTS order_items (
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
  kds_status      TEXT DEFAULT 'pending' CHECK(kds_status IN ('pending','preparing','ready')),
  notes           TEXT,
  is_void         BOOLEAN NOT NULL DEFAULT FALSE,
  void_reason     TEXT,
  void_by         UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  order_id        UUID NOT NULL REFERENCES orders(id),
  shift_id        UUID REFERENCES shifts(id),
  method          TEXT NOT NULL CHECK(method IN ('cash','upi','card','split')),
  amount          INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','success','failed','refunded')),
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

CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  order_id        UUID NOT NULL REFERENCES orders(id),
  invoice_number  TEXT NOT NULL,
  invoice_date    TEXT NOT NULL,
  financial_year  TEXT NOT NULL,
  seller_gstin    TEXT NOT NULL DEFAULT '',
  seller_name     TEXT NOT NULL DEFAULT '',
  seller_address  TEXT NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  name            TEXT,
  phone           TEXT NOT NULL DEFAULT '',
  phone_hash      TEXT NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS inventory_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  name            TEXT NOT NULL,
  sku             TEXT,
  unit            TEXT NOT NULL DEFAULT 'kg' CHECK(unit IN ('kg','g','l','ml','pcs','dozen','box')),
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

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  type            TEXT NOT NULL CHECK(type IN ('receive','sale_deduct','wastage','adjustment','transfer')),
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

CREATE TABLE IF NOT EXISTS recipe_ingredients (
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

CREATE TABLE IF NOT EXISTS promos (
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
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  supplier_name   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ordered','received','cancelled')),
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

CREATE TABLE IF NOT EXISTS wastage_log (
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

CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL,
  staff_id        UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  old_value       JSONB,
  new_value       JSONB,
  ip_address      TEXT,
  device_id       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version         INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══ INDEXES ═════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_staff_outlet ON staff(outlet_id, is_active);
CREATE INDEX IF NOT EXISTS idx_shifts_outlet ON shifts(outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_menu_cats_outlet ON menu_categories(outlet_id, is_active);
CREATE INDEX IF NOT EXISTS idx_menu_items_outlet ON menu_items(outlet_id, is_active);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_outlet_date ON orders(outlet_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_shift ON orders(shift_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_kds ON order_items(outlet_id, station, kds_status);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_shift ON payments(shift_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_hash);
CREATE INDEX IF NOT EXISTS idx_customers_outlet ON customers(outlet_id);
CREATE INDEX IF NOT EXISTS idx_inventory_outlet ON inventory_items(outlet_id, is_active);
CREATE INDEX IF NOT EXISTS idx_inv_txn_item ON inventory_transactions(inventory_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_recipe_menu ON recipe_ingredients(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_promos_outlet ON promos(outlet_id, is_active);
CREATE INDEX IF NOT EXISTS idx_audit_outlet ON audit_log(outlet_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_outlets_owner ON outlets(owner_user_id);

-- Sync indexes
CREATE INDEX IF NOT EXISTS idx_shifts_sync ON shifts(outlet_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_tables_sync ON tables(outlet_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_menu_cats_sync ON menu_categories(outlet_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_menu_items_sync ON menu_items(outlet_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_orders_sync ON orders(outlet_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_order_items_sync ON order_items(outlet_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_payments_sync ON payments(outlet_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_invoices_sync ON invoices(outlet_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_customers_sync ON customers(outlet_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_promos_sync ON promos(outlet_id, updated_at);

-- ═══ PART 2: ROW LEVEL SECURITY ═════════════════════════════

-- Enable RLS
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE wastage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION user_outlet_ids()
RETURNS SETOF UUID AS $$
  SELECT id FROM outlets WHERE owner_user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Outlet policies
CREATE POLICY outlets_select ON outlets FOR SELECT USING (owner_user_id = auth.uid());
CREATE POLICY outlets_insert ON outlets FOR INSERT WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY outlets_update ON outlets FOR UPDATE USING (owner_user_id = auth.uid());

-- All other tables: scoped by outlet_id
CREATE POLICY staff_access ON staff FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY shifts_access ON shifts FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY tables_access ON tables FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY menu_categories_access ON menu_categories FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY menu_items_access ON menu_items FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY orders_access ON orders FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY order_items_access ON order_items FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY payments_access ON payments FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY invoices_access ON invoices FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY customers_access ON customers FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY inventory_items_access ON inventory_items FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY inventory_transactions_access ON inventory_transactions FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY promos_access ON promos FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY purchase_orders_access ON purchase_orders FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY wastage_log_access ON wastage_log FOR ALL USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY audit_log_read ON audit_log FOR SELECT USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY audit_log_insert ON audit_log FOR INSERT WITH CHECK (outlet_id IN (SELECT user_outlet_ids()));

-- Migration tracking
INSERT INTO schema_migrations (version, name) VALUES (1, '001_initial') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (version, name) VALUES (2, '002_supabase_rls') ON CONFLICT DO NOTHING;

-- ═══ DONE! ═══════════════════════════════════════════════════
