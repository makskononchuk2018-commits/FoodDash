-- Update manager contact to MAX URL
UPDATE manager_contacts 
SET telegram_url = 'https://max.ru/u/f9LHodD0cOKJyXx9spPr1Qc_3tGdWpdLED5xOB-SSjJw8Eo2vJyFCZjn0L4',
    telegram_username = 'max_manager',
    updated_at = CURRENT_TIMESTAMP
WHERE is_active = true;
