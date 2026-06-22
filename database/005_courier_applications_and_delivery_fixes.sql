-- Courier applications and delivery consistency fixes.

BEGIN;

CREATE TABLE IF NOT EXISTS courier_applications (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  experience TEXT,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_comment TEXT,
  reviewed_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_applications_status
  ON courier_applications(status);

CREATE INDEX IF NOT EXISTS idx_courier_applications_created_at
  ON courier_applications(created_at);

-- Older draft migration created this as a global unique constraint, which blocks
-- sequence reuse after completed/cancelled deliveries. Active deliveries only
-- need unique route positions.
ALTER TABLE courier_deliveries
  DROP CONSTRAINT IF EXISTS courier_deliveries_courier_id_delivery_sequence_key;

DROP INDEX IF EXISTS uq_courier_deliveries_active_sequence;

CREATE UNIQUE INDEX IF NOT EXISTS uq_courier_deliveries_active_sequence
  ON courier_deliveries(courier_id, delivery_sequence)
  WHERE status IN ('pending', 'picked_up');

INSERT INTO delivery_reasons (role, reason_key, reason_text, category)
VALUES
  ('customer', 'changed_mind', 'Передумал(а)', 'Личное'),
  ('customer', 'long_delivery', 'Долго ждать доставку', 'Доставка'),
  ('customer', 'address_wrong', 'Указан неверный адрес', 'Ошибка'),
  ('customer', 'duplicate_order', 'Заказ создан случайно', 'Ошибка'),
  ('customer', 'other', 'Другая причина', 'Другое'),
  ('courier', 'customer_unreachable', 'Клиент не выходит на связь', 'Клиент'),
  ('courier', 'customer_refused', 'Клиент отказался от заказа', 'Клиент'),
  ('courier', 'address_not_found', 'Не удалось найти адрес', 'Адрес'),
  ('courier', 'vehicle_issue', 'Проблема с транспортом', 'Транспорт'),
  ('courier', 'defect', 'Обнаружен брак товара', 'Товар'),
  ('courier', 'other', 'Другая причина', 'Другое'),
  ('admin', 'customer_request', 'Отмена по просьбе клиента', 'Клиент'),
  ('admin', 'stock_issue', 'Проблема с наличием товара', 'Склад'),
  ('admin', 'courier_issue', 'Проблема с доставкой', 'Доставка'),
  ('admin', 'other', 'Другая причина', 'Другое')
ON CONFLICT DO NOTHING;

COMMIT;
