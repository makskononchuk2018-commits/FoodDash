-- Add delivery management tables for courier operations
-- Migration for courier_deliveries, order_cancellations, delivery_reasons

BEGIN;

-- Courier deliveries - track which orders courier has accepted and their sequence
CREATE TABLE IF NOT EXISTS courier_deliveries (
  id SERIAL PRIMARY KEY,
  courier_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_sequence INTEGER NOT NULL CHECK (delivery_sequence BETWEEN 1 AND 3),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'picked_up', 'delivered', 'cancelled')),
  pickup_latitude NUMERIC(10,7),
  pickup_longitude NUMERIC(10,7),
  delivery_address TEXT NOT NULL,
  delivery_latitude NUMERIC(10,7),
  delivery_longitude NUMERIC(10,7),
  notes TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(courier_id, order_id),
  UNIQUE(courier_id, delivery_sequence) -- Enforce max 3 deliveries per sequence
);

-- Cancellation reasons reference table
CREATE TABLE IF NOT EXISTS delivery_reasons (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('customer', 'courier', 'admin')),
  reason_key TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Order cancellations - track cancellations with reasons
CREATE TABLE IF NOT EXISTS order_cancellations (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  cancelled_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cancelled_by_role TEXT NOT NULL CHECK (cancelled_by_role IN ('customer', 'courier', 'admin')),
  reason_key TEXT NOT NULL,
  reason_details TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(order_id)
);

-- Add soft delete columns to orders
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Add removed items tracking
CREATE TABLE IF NOT EXISTS order_items_removed (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id INTEGER REFERENCES order_items(id) ON DELETE SET NULL,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  removed_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  removed_by_role TEXT NOT NULL CHECK (removed_by_role IN ('customer', 'courier', 'admin')),
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Insert default cancellation reasons for customers
INSERT INTO delivery_reasons (role, reason_key, reason_text, category)
VALUES
  ('customer', 'changed_mind', 'Передумал(а)', 'personal'),
  ('customer', 'expensive', 'Слишком дорого', 'price'),
  ('customer', 'long_delivery', 'Слишком долго доставляется', 'delivery'),
  ('customer', 'found_cheaper', 'Нашел(ла) дешевле', 'price'),
  ('customer', 'duplicate_order', 'Дублирующийся заказ', 'mistake'),
  ('customer', 'address_wrong', 'Неправильный адрес', 'mistake'),
  ('customer', 'no_money', 'Нет денег', 'personal'),
  ('customer', 'other', 'Другое', 'other')
ON CONFLICT DO NOTHING;

-- Insert default cancellation reasons for couriers
INSERT INTO delivery_reasons (role, reason_key, reason_text, category)
VALUES
  ('courier', 'customer_unreachable', 'Клиент недоступен', 'customer'),
  ('courier', 'address_unavailable', 'Адрес недоступен', 'logistics'),
  ('courier', 'weather', 'Плохие погодные условия', 'force_majeure'),
  ('courier', 'vehicle_issue', 'Проблема с транспортом', 'vehicle'),
  ('courier', 'accident', 'Происшествие', 'accident'),
  ('courier', 'other', 'Другое', 'other')
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_courier_deliveries_courier_id ON courier_deliveries(courier_id);
CREATE INDEX IF NOT EXISTS idx_courier_deliveries_order_id ON courier_deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_courier_deliveries_status ON courier_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_courier_deliveries_sequence ON courier_deliveries(delivery_sequence);
CREATE INDEX IF NOT EXISTS idx_order_cancellations_order_id ON order_cancellations(order_id);
CREATE INDEX IF NOT EXISTS idx_order_cancellations_created_at ON order_cancellations(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_removed_order_id ON order_items_removed(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_removed_removed_by ON order_items_removed(removed_by_id);
CREATE INDEX IF NOT EXISTS idx_orders_is_deleted ON orders(is_deleted);
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON orders(deleted_at);
CREATE INDEX IF NOT EXISTS idx_delivery_reasons_role ON delivery_reasons(role);

COMMIT;
