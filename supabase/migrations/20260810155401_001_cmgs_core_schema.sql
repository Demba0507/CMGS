/*
# CMGS Commerce AI — Core Schema

Creates the full relational model for a social-commerce platform operating in Bamako, Mali.
All money values are stored as integer FCFA amounts (bigint) to avoid floating point errors.

## New Tables
1. `categories` — product categories (with optional parent for sub-categories)
2. `suppliers` — validated wholesale partners (PENDING/APPROVED/REJECTED/SUSPENDED)
3. `products` — catalog items with supplier price, sale price, declared & verified stock
4. `stock_movements` — audit trail of every stock change (ADD/SALE/RESERVATION/RELEASE/CORRECTION)
5. `customers` — end customers (PROSPECT/CUSTOMER/INACTIVE)
6. `orders` — central order entity with FCFA money fields and controlled status workflow
7. `order_items` — product lines pinned with price-at-order-time
8. `payments` — cash-on-delivery and manual Orange Money tracking
9. `drivers` — CMGS delivery fleet
10. `deliveries` — delivery assignments tied to orders and drivers
11. `returns` — product returns with reason and routing
12. `conversations` & `messages` — multichannel chat history (WhatsApp/Site/Instagram/Facebook/Simulator)
13. `notifications` — in-app event notifications
14. `event_logs` — auditable system events

## Security
This is a single-tenant demo with no sign-in screen; every table uses `TO anon, authenticated`
policies so the anon-key frontend can read and write its own data. Enabling RLS still hardens
the default-deny posture. If sign-in is added later, tighten these policies to `authenticated`
with ownership predicates.

## Notes
- FCFA amounts use bigint; the app formats them with thousands separators.
- Product codes (P0001...) and supplier codes (F0001...) are human-readable.
- Order codes use CMGS- prefix.
*/

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============ CATEGORIES ============
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_categories" ON categories;
CREATE POLICY "anon_crud_categories" ON categories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_categories" ON categories;
CREATE POLICY "anon_insert_categories" ON categories FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_categories" ON categories;
CREATE POLICY "anon_update_categories" ON categories FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_categories" ON categories;
CREATE POLICY "anon_delete_categories" ON categories FOR DELETE TO anon, authenticated USING (true);

-- ============ SUPPLIERS ============
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  business_name text,
  phone text,
  zone text,
  contact_info text,
  status text NOT NULL DEFAULT 'APPROVED',
  quality_rating int DEFAULT 3 CHECK (quality_rating BETWEEN 0 AND 5),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_suppliers" ON suppliers;
CREATE POLICY "anon_select_suppliers" ON suppliers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_suppliers" ON suppliers;
CREATE POLICY "anon_insert_suppliers" ON suppliers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_suppliers" ON suppliers;
CREATE POLICY "anon_update_suppliers" ON suppliers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_suppliers" ON suppliers;
CREATE POLICY "anon_delete_suppliers" ON suppliers FOR DELETE TO anon, authenticated USING (true);

-- ============ PRODUCTS ============
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_price bigint NOT NULL DEFAULT 0,
  sale_price bigint NOT NULL DEFAULT 0,
  stock_declared int NOT NULL DEFAULT 0,
  stock_verified int NOT NULL DEFAULT 0,
  stock_last_checked timestamptz,
  image_url text,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_products" ON products;
CREATE POLICY "anon_insert_products" ON products FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_products" ON products;
CREATE POLICY "anon_update_products" ON products FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_products" ON products;
CREATE POLICY "anon_delete_products" ON products FOR DELETE TO anon, authenticated USING (true);

-- ============ STOCK MOVEMENTS ============
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  type text NOT NULL,
  quantity int NOT NULL DEFAULT 0,
  previous_stock int NOT NULL DEFAULT 0,
  new_stock int NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_stockmv_product ON stock_movements(product_id);
DROP POLICY IF EXISTS "anon_select_stockmov" ON stock_movements;
CREATE POLICY "anon_select_stockmov" ON stock_movements FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_stockmov" ON stock_movements;
CREATE POLICY "anon_insert_stockmov" ON stock_movements FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_stockmov" ON stock_movements;
CREATE POLICY "anon_update_stockmov" ON stock_movements FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_stockmov" ON stock_movements;
CREATE POLICY "anon_delete_stockmov" ON stock_movements FOR DELETE TO anon, authenticated USING (true);

-- ============ CUSTOMERS ============
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  neighborhood text,
  address text,
  channel text NOT NULL DEFAULT 'SITE',
  status text NOT NULL DEFAULT 'PROSPECT',
  last_interaction timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
DROP POLICY IF EXISTS "anon_select_customers" ON customers;
CREATE POLICY "anon_select_customers" ON customers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_customers" ON customers;
CREATE POLICY "anon_insert_customers" ON customers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_customers" ON customers;
CREATE POLICY "anon_update_customers" ON customers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_customers" ON customers;
CREATE POLICY "anon_delete_customers" ON customers FOR DELETE TO anon, authenticated USING (true);

-- ============ ORDERS ============
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'SITE',
  status text NOT NULL DEFAULT 'PENDING',
  subtotal bigint NOT NULL DEFAULT 0,
  delivery_fee bigint NOT NULL DEFAULT 0,
  service_fee bigint NOT NULL DEFAULT 0,
  total bigint NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'CASH_ON_DELIVERY',
  payment_status text NOT NULL DEFAULT 'PENDING',
  delivery_address text,
  delivery_neighborhood text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
DROP POLICY IF EXISTS "anon_select_orders" ON orders;
CREATE POLICY "anon_select_orders" ON orders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_orders" ON orders;
CREATE POLICY "anon_update_orders" ON orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
CREATE POLICY "anon_delete_orders" ON orders FOR DELETE TO anon, authenticated USING (true);

-- ============ ORDER ITEMS ============
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  product_code text,
  quantity int NOT NULL DEFAULT 1,
  unit_price bigint NOT NULL DEFAULT 0,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_price bigint NOT NULL DEFAULT 0
);
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_orderitems_order ON order_items(order_id);
DROP POLICY IF EXISTS "anon_select_orderitems" ON order_items;
CREATE POLICY "anon_select_orderitems" ON order_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_orderitems" ON order_items;
CREATE POLICY "anon_insert_orderitems" ON order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_orderitems" ON order_items;
CREATE POLICY "anon_update_orderitems" ON order_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_orderitems" ON order_items;
CREATE POLICY "anon_delete_orderitems" ON order_items FOR DELETE TO anon, authenticated USING (true);

-- ============ PAYMENTS ============
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'CASH_ON_DELIVERY',
  amount bigint NOT NULL DEFAULT 0,
  reference text,
  status text NOT NULL DEFAULT 'PENDING',
  verified_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
DROP POLICY IF EXISTS "anon_select_payments" ON payments;
CREATE POLICY "anon_select_payments" ON payments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_payments" ON payments;
CREATE POLICY "anon_insert_payments" ON payments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_payments" ON payments;
CREATE POLICY "anon_update_payments" ON payments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_payments" ON payments;
CREATE POLICY "anon_delete_payments" ON payments FOR DELETE TO anon, authenticated USING (true);

-- ============ DRIVERS ============
CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  phone text,
  zone text,
  status text NOT NULL DEFAULT 'AVAILABLE',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_drivers" ON drivers;
CREATE POLICY "anon_select_drivers" ON drivers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_drivers" ON drivers;
CREATE POLICY "anon_insert_drivers" ON drivers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_drivers" ON drivers;
CREATE POLICY "anon_update_drivers" ON drivers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_drivers" ON drivers;
CREATE POLICY "anon_delete_drivers" ON drivers FOR DELETE TO anon, authenticated USING (true);

-- ============ DELIVERIES ============
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ASSIGNED',
  assigned_at timestamptz DEFAULT now(),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  note text
);
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_deliveries_order ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(driver_id);
DROP POLICY IF EXISTS "anon_select_deliveries" ON deliveries;
CREATE POLICY "anon_select_deliveries" ON deliveries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_deliveries" ON deliveries;
CREATE POLICY "anon_insert_deliveries" ON deliveries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_deliveries" ON deliveries;
CREATE POLICY "anon_update_deliveries" ON deliveries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_deliveries" ON deliveries;
CREATE POLICY "anon_delete_deliveries" ON deliveries FOR DELETE TO anon, authenticated USING (true);

-- ============ RETURNS ============
CREATE TABLE IF NOT EXISTS returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES order_items(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED',
  comment text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_returns" ON returns;
CREATE POLICY "anon_select_returns" ON returns FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_returns" ON returns;
CREATE POLICY "anon_insert_returns" ON returns FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_returns" ON returns;
CREATE POLICY "anon_update_returns" ON returns FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_returns" ON returns;
CREATE POLICY "anon_delete_returns" ON returns FOR DELETE TO anon, authenticated USING (true);

-- ============ CONVERSATIONS & MESSAGES ============
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'SIMULATOR',
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_conv_customer ON conversations(customer_id);
DROP POLICY IF EXISTS "anon_select_conv" ON conversations;
CREATE POLICY "anon_select_conv" ON conversations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_conv" ON conversations;
CREATE POLICY "anon_insert_conv" ON conversations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_conv" ON conversations;
CREATE POLICY "anon_update_conv" ON conversations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_conv" ON conversations;
CREATE POLICY "anon_delete_conv" ON conversations FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  sender text NOT NULL DEFAULT 'BOT',
  content text NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  intent text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_msg_created ON messages(created_at);
DROP POLICY IF EXISTS "anon_select_msg" ON messages;
CREATE POLICY "anon_select_msg" ON messages FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_msg" ON messages;
CREATE POLICY "anon_insert_msg" ON messages FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_msg" ON messages;
CREATE POLICY "anon_update_msg" ON messages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_msg" ON messages;
CREATE POLICY "anon_delete_msg" ON messages FOR DELETE TO anon, authenticated USING (true);

-- ============ NOTIFICATIONS ============
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  message text,
  target_type text,
  target_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_notif" ON notifications;
CREATE POLICY "anon_select_notif" ON notifications FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_notif" ON notifications;
CREATE POLICY "anon_insert_notif" ON notifications FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_notif" ON notifications;
CREATE POLICY "anon_update_notif" ON notifications FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_notif" ON notifications;
CREATE POLICY "anon_delete_notif" ON notifications FOR DELETE TO anon, authenticated USING (true);

-- ============ EVENT LOGS ============
CREATE TABLE IF NOT EXISTS event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  description text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE event_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_logs_created ON event_logs(created_at DESC);
DROP POLICY IF EXISTS "anon_select_logs" ON event_logs;
CREATE POLICY "anon_select_logs" ON event_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_logs" ON event_logs;
CREATE POLICY "anon_insert_logs" ON event_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_logs" ON event_logs;
CREATE POLICY "anon_update_logs" ON event_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_logs" ON event_logs;
CREATE POLICY "anon_delete_logs" ON event_logs FOR DELETE TO anon, authenticated USING (true);
