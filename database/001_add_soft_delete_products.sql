-- Migration to add soft delete functionality for products
-- This change allows deleting products from admin panel while preserving order history
-- Execution date: 2026-05-20

BEGIN;

-- Add is_deleted column if not exists
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- Add deleted_at column if not exists  
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_products_deleted ON products(is_deleted);

-- Commit transaction
COMMIT;
