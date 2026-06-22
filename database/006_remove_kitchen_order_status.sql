-- Remove the unused kitchen order state from existing databases.
UPDATE orders
SET status = 'new',
    updated_at = NOW()
WHERE status = 'kitchen';
