-- SwiftServe — Supabase Row Level Security policies
-- Run this after 001_initial.sql when using Supabase

-- Add owner_user_id column to outlets (links Supabase Auth user to outlet)
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS owner_user_id UUID;
CREATE INDEX IF NOT EXISTS idx_outlets_owner ON outlets(owner_user_id);

-- Enable RLS on all tables
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

-- ─── OUTLETS ────────────────────────────────
-- Owner can read/update their own outlet
CREATE POLICY outlets_owner_select ON outlets FOR SELECT
  USING (owner_user_id = auth.uid());
CREATE POLICY outlets_owner_update ON outlets FOR UPDATE
  USING (owner_user_id = auth.uid());
CREATE POLICY outlets_owner_insert ON outlets FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

-- ─── HELPER FUNCTION: Check if user owns the outlet ────
CREATE OR REPLACE FUNCTION user_outlet_ids()
RETURNS SETOF UUID AS $$
  SELECT id FROM outlets WHERE owner_user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── ALL OTHER TABLES: Scoped by outlet_id ────────────
-- Generic policy pattern: user can access rows belonging to their outlet(s)

-- Staff
CREATE POLICY staff_access ON staff FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Shifts
CREATE POLICY shifts_access ON shifts FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Tables
CREATE POLICY tables_access ON tables FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Menu Categories
CREATE POLICY menu_categories_access ON menu_categories FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Menu Items
CREATE POLICY menu_items_access ON menu_items FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Orders
CREATE POLICY orders_access ON orders FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Order Items
CREATE POLICY order_items_access ON order_items FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Payments
CREATE POLICY payments_access ON payments FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Invoices
CREATE POLICY invoices_access ON invoices FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Customers
CREATE POLICY customers_access ON customers FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Inventory Items
CREATE POLICY inventory_items_access ON inventory_items FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Inventory Transactions
CREATE POLICY inventory_transactions_access ON inventory_transactions FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Promos
CREATE POLICY promos_access ON promos FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Purchase Orders
CREATE POLICY purchase_orders_access ON purchase_orders FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Wastage Log
CREATE POLICY wastage_log_access ON wastage_log FOR ALL
  USING (outlet_id IN (SELECT user_outlet_ids()));

-- Audit Log (read-only for users, insert allowed)
CREATE POLICY audit_log_read ON audit_log FOR SELECT
  USING (outlet_id IN (SELECT user_outlet_ids()));
CREATE POLICY audit_log_insert ON audit_log FOR INSERT
  WITH CHECK (outlet_id IN (SELECT user_outlet_ids()));

-- ─── SERVICE ROLE BYPASS ─────────────────────
-- The cloud server uses service_role key which bypasses RLS.
-- These policies only affect direct Supabase client access from edge.

-- Track migration
INSERT INTO schema_migrations (version, name) VALUES (2, '002_supabase_rls');
