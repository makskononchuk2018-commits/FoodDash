-- FoodDash Ready Database (30 rows per table)
-- This script creates all tables and fills each table with exactly 30 records.
-- Test accounts:
--   admin / admin123
--   courier / courier123
--   customer / customer123

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  category TEXT NOT NULL,
  image_url TEXT NOT NULL,
  marketplace_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  courier_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL DEFAULT 'new',
  channel TEXT NOT NULL DEFAULT 'website',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_events (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL,
  event_message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courier_schedule (
  id SERIAL PRIMARY KEY,
  courier_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL,
  time_slots TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(courier_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS courier_locations (
  id SERIAL PRIMARY KEY,
  courier_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  accuracy NUMERIC(8,2),
  speed NUMERIC(8,2),
  heading NUMERIC(8,2),
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shopping_carts (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  cart_id INTEGER NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_addresses (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id, address)
);

CREATE TABLE IF NOT EXISTS manager_contacts (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'Связь с менеджером',
  telegram_url TEXT NOT NULL,
  telegram_username TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(is_deleted);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_deleted ON products(is_deleted);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_courier_id ON orders(courier_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON order_events(created_at);
CREATE INDEX IF NOT EXISTS idx_order_events_type ON order_events(event_type);
CREATE INDEX IF NOT EXISTS idx_courier_schedule_courier_id ON courier_schedule(courier_id);
CREATE INDEX IF NOT EXISTS idx_courier_locations_courier_id ON courier_locations(courier_id);
CREATE INDEX IF NOT EXISTS idx_courier_locations_order_id ON courier_locations(order_id);
CREATE INDEX IF NOT EXISTS idx_courier_locations_created_at ON courier_locations(created_at);
CREATE INDEX IF NOT EXISTS idx_shopping_carts_customer_id ON shopping_carts(customer_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_saved_addresses_customer_id ON saved_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_manager_contacts_active ON manager_contacts(is_active);

-- Re-seed from scratch
TRUNCATE TABLE
  courier_locations,
  cart_items,
  shopping_carts,
  courier_schedule,
  order_events,
  order_items,
  orders,
  saved_addresses,
  manager_contacts,
  products,
  users
RESTART IDENTITY CASCADE;

-- 30 users
INSERT INTO users (
  id,
  username,
  password,
  role,
  full_name,
  email,
  phone,
  is_deleted,
  created_at,
  updated_at
)
SELECT
  gs,
  CASE
    WHEN gs = 1 THEN 'admin'
    WHEN gs = 2 THEN 'courier'
    WHEN gs = 3 THEN 'customer'
    ELSE 'user_' || gs
  END,
  CASE
    WHEN gs = 1 THEN '7c0e3b044a6b4d9e7b2349b74e1e2f94:8b0482787729a184858c364ce7d1b3e00da2733228da56427694bb719bed195361c39076640645cba18b49e5201c6a1dde3b17f501165ff458dcaf7b442a6287'
    WHEN gs = 2 THEN '4f6b19e18b041e08f1adb6ce7a238197:5349eea50143e524e47b4db1fb388f67f2c718f4f39147ab842b90a2215086d2c7ad975d38a9876be4b2fe13e162234d437f68cf97b27ddf53c757dbe94b9374'
    ELSE '5a54392410cebad0c9712a2ab7b58f73:c415467e4c2f9b68e5b6890e0af52ccfe002d1bd6778228b935ee23ebe9bfddae86d15505eeccb403b3c743ddeedf8f1fcb833e448d4da7c5ee555c069e0a691'
  END,
  CASE
    WHEN gs = 1 THEN 'admin'
    WHEN gs = 2 THEN 'courier'
    WHEN gs = 3 THEN 'customer'
    WHEN gs BETWEEN 4 AND 11 THEN 'courier'
    ELSE 'customer'
  END,
  CASE
    WHEN gs = 1 THEN 'Главный администратор'
    WHEN gs = 2 THEN 'Иван Курьер'
    WHEN gs = 3 THEN 'Мария Клиент'
    ELSE 'Пользователь ' || gs
  END,
  CASE
    WHEN gs = 1 THEN 'admin@fooddash.local'
    WHEN gs = 2 THEN 'courier@fooddash.local'
    WHEN gs = 3 THEN 'customer@fooddash.local'
    ELSE 'user' || gs || '@fooddash.local'
  END,
  '+7 (999) ' || LPAD((1000000 + gs)::text, 7, '0'),
  FALSE,
  NOW() - (gs || ' days')::interval,
  NOW() - (gs || ' days')::interval
FROM generate_series(1, 30) AS gs;

-- 30 products
INSERT INTO products (
  id,
  name,
  description,
  price,
  stock,
  category,
  image_url,
  marketplace_status,
  created_at,
  updated_at
)
SELECT
  gs,
  'Товар ' || gs,
  'Описание товара #' || gs,
  ROUND((220 + gs * 19)::numeric, 2),
  10 + (gs % 25),
  CASE (gs % 6)
    WHEN 1 THEN 'Салаты'
    WHEN 2 THEN 'Паста'
    WHEN 3 THEN 'Пицца'
    WHEN 4 THEN 'Супы'
    WHEN 5 THEN 'Бургеры'
    ELSE 'Десерты'
  END,
  'https://picsum.photos/seed/food' || gs || '/800/600',
  '{}'::jsonb,
  NOW() - (gs || ' days')::interval,
  NOW() - (gs || ' days')::interval
FROM generate_series(1, 30) AS gs;

-- 30 orders
WITH src AS (
  SELECT
    gs,
    CASE (gs % 5)
      WHEN 1 THEN 'new'
      WHEN 2 THEN 'delivery'
      WHEN 3 THEN 'completed'
      WHEN 4 THEN 'cancelled'
      ELSE 'returning'
    END AS status,
    CASE (gs % 4)
      WHEN 1 THEN 'website'
      WHEN 2 THEN 'wildberries'
      WHEN 3 THEN 'ozon'
      ELSE 'yandex'
    END AS channel
  FROM generate_series(1, 30) AS gs
)
INSERT INTO orders (
  id,
  customer_id,
  courier_id,
  customer_name,
  customer_phone,
  customer_address,
  total_amount,
  status,
  channel,
  created_at,
  updated_at
)
SELECT
  s.gs,
  CASE WHEN s.gs = 1 THEN 3 ELSE 12 + ((s.gs - 2) % 19) END AS customer_id,
  CASE
    WHEN s.status = 'new' THEN NULL
    ELSE 2 + ((s.gs - 1) % 10)
  END AS courier_id,
  CASE
    WHEN s.gs = 1 THEN 'Мария Клиент'
    ELSE 'Клиент #' || s.gs
  END,
  '+7 (999) ' || LPAD((2000000 + s.gs)::text, 7, '0'),
  'Екатеринбург, ул. Тестовая, д. ' || s.gs || ', кв. ' || (100 + s.gs),
  ROUND((450 + (s.gs * 37 % 900))::numeric, 2),
  s.status,
  s.channel,
  NOW() - ((31 - s.gs) || ' hours')::interval,
  NOW() - ((31 - s.gs) || ' hours')::interval + INTERVAL '35 minutes'
FROM src s;

-- 30 order_items
INSERT INTO order_items (
  id,
  order_id,
  product_id,
  quantity,
  price,
  created_at
)
SELECT
  gs,
  gs,
  ((gs * 7 - 1) % 30) + 1 AS product_id,
  ((gs - 1) % 3) + 1 AS quantity,
  p.price,
  o.created_at + INTERVAL '5 minutes'
FROM generate_series(1, 30) AS gs
JOIN products p ON p.id = ((gs * 7 - 1) % 30) + 1
JOIN orders o ON o.id = gs;

-- 30 order_events
INSERT INTO order_events (
  id,
  order_id,
  actor_id,
  actor_role,
  event_type,
  event_message,
  metadata,
  created_at
)
SELECT
  o.id,
  o.id,
  COALESCE(o.courier_id, 1),
  CASE
    WHEN o.courier_id IS NULL THEN 'admin'
    ELSE 'courier'
  END,
  'status_' || o.status,
  CASE o.status
    WHEN 'new' THEN 'Заказ создан'
    WHEN 'delivery' THEN 'Курьер в пути'
    WHEN 'completed' THEN 'Заказ доставлен'
    WHEN 'cancelled' THEN 'Заказ отменен'
    ELSE 'Оформлен возврат заказа'
  END,
  jsonb_build_object('status', o.status),
  o.updated_at
FROM orders o
WHERE o.id BETWEEN 1 AND 30;

-- 30 courier_schedule rows (10 couriers x 3 days)
INSERT INTO courier_schedule (
  id,
  courier_id,
  day_of_week,
  time_slots,
  created_at,
  updated_at
)
SELECT
  gs,
  2 + ((gs - 1) % 10) AS courier_id,
  CASE FLOOR((gs - 1) / 10.0)::int
    WHEN 0 THEN 'Пн'
    WHEN 1 THEN 'Ср'
    ELSE 'Пт'
  END,
  ARRAY['08:00-12:00', '12:00-16:00', '16:00-20:00']::text[],
  NOW() - (gs || ' days')::interval,
  NOW() - (gs || ' days')::interval
FROM generate_series(1, 30) AS gs;

-- 30 shopping_carts
INSERT INTO shopping_carts (
  id,
  customer_id,
  created_at,
  updated_at
)
SELECT
  gs,
  CASE WHEN gs = 1 THEN 3 ELSE 12 + ((gs - 2) % 19) END,
  NOW() - (gs || ' days')::interval,
  NOW() - ((gs - 1) || ' days')::interval
FROM generate_series(1, 30) AS gs;

-- 30 cart_items
INSERT INTO cart_items (
  id,
  cart_id,
  product_id,
  quantity,
  created_at
)
SELECT
  gs,
  gs,
  ((gs * 5 - 1) % 30) + 1,
  ((gs + 1) % 4) + 1,
  NOW() - (gs || ' hours')::interval
FROM generate_series(1, 30) AS gs;

-- 30 saved_addresses
INSERT INTO saved_addresses (
  id,
  customer_id,
  address,
  is_default,
  created_at
)
SELECT
  gs,
  CASE WHEN gs = 1 THEN 3 ELSE 12 + ((gs - 2) % 19) END,
  'Екатеринбург, ул. Демонстрационная, д. ' || gs || ', кв. ' || (500 + gs),
  (gs <= 19),
  NOW() - (gs || ' days')::interval
FROM generate_series(1, 30) AS gs;

-- 30 manager_contacts (1 active)
INSERT INTO manager_contacts (
  id,
  label,
  telegram_url,
  telegram_username,
  is_active,
  updated_by,
  created_at,
  updated_at
)
SELECT
  gs,
  'Связь с менеджером #' || gs,
  'https://t.me/fooddash_manager_' || gs,
  'fooddash_manager_' || gs,
  (gs = 1),
  1,
  NOW() - (gs || ' days')::interval,
  NOW() - ((gs - 1) || ' days')::interval
FROM generate_series(1, 30) AS gs;

SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), true);
SELECT setval(pg_get_serial_sequence('products', 'id'), COALESCE((SELECT MAX(id) FROM products), 1), true);
SELECT setval(pg_get_serial_sequence('orders', 'id'), COALESCE((SELECT MAX(id) FROM orders), 1), true);
SELECT setval(pg_get_serial_sequence('order_items', 'id'), COALESCE((SELECT MAX(id) FROM order_items), 1), true);
SELECT setval(pg_get_serial_sequence('order_events', 'id'), COALESCE((SELECT MAX(id) FROM order_events), 1), true);
SELECT setval(pg_get_serial_sequence('courier_schedule', 'id'), COALESCE((SELECT MAX(id) FROM courier_schedule), 1), true);
SELECT setval(pg_get_serial_sequence('shopping_carts', 'id'), COALESCE((SELECT MAX(id) FROM shopping_carts), 1), true);
SELECT setval(pg_get_serial_sequence('cart_items', 'id'), COALESCE((SELECT MAX(id) FROM cart_items), 1), true);
SELECT setval(pg_get_serial_sequence('saved_addresses', 'id'), COALESCE((SELECT MAX(id) FROM saved_addresses), 1), true);
SELECT setval(pg_get_serial_sequence('manager_contacts', 'id'), COALESCE((SELECT MAX(id) FROM manager_contacts), 1), true);

COMMIT;
