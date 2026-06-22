-- Update manager contact URL to MAX
UPDATE manager_contacts 
SET telegram_url = 'https://max.ru/u/f9LHodD0cOKJyXx9spPr1Qc_3tGdWpdLED5xOB-SSjJw8Eo2vJyFCZjn0L4',
    telegram_username = 'max_manager',
    updated_at = NOW()
WHERE is_active = true;

-- If no active contact exists, create one
INSERT INTO manager_contacts (label, telegram_url, telegram_username, is_active)
SELECT 
  'Связь с менеджером',
  'https://max.ru/u/f9LHodD0cOKJyXx9spPr1Qc_3tGdWpdLED5xOB-SSjJw8Eo2vJyFCZjn0L4',
  'max_manager',
  true
WHERE NOT EXISTS (SELECT 1 FROM manager_contacts WHERE is_active = true);
