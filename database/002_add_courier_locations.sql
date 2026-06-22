-- Add GPS tracking for couriers
-- Migration file for courier_locations table

BEGIN;

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

CREATE INDEX IF NOT EXISTS idx_courier_locations_courier_id ON courier_locations(courier_id);
CREATE INDEX IF NOT EXISTS idx_courier_locations_order_id ON courier_locations(order_id);
CREATE INDEX IF NOT EXISTS idx_courier_locations_created_at ON courier_locations(created_at);

COMMIT;
