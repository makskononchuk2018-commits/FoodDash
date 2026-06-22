-- Migration: Add soft delete for customer orders
-- This allows customers to delete orders from their view without affecting admin view

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS is_deleted_by_customer BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_by_customer_at TIMESTAMP;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_orders_deleted_by_customer ON orders(is_deleted_by_customer);
