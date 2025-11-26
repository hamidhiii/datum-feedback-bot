-- Заполнение таблицы products начальными данными
INSERT INTO products (sku, title, description, volume, concentration, price, instructions, season_tag, alternatives)
VALUES
  (
    'DATUM-EDP-50',
    'BILMIM — Eau de Parfum 50ml',
    'Аромат: древесно-цветочный. Стойкость: 8+ часов. Идеален для вечеров.',
    '50ml',
    'EDP',
    150000,
    'Наносить на пульсирующие точки: запястья, шея, за ушами.',
    'all-year',
    '["DATUM-EDT-30", "DATUM-INTENSE-50"]'::jsonb
  ),
  (
    'DATUM-EDT-30',
    'AZIM — Eau de Toilette 30ml',
    'Легкий цветочный аромат. Стойкость: 4-5 часов. Подходит для дня.',
    '30ml',
    'EDT',
    100000,
    'Можно наносить несколько раз в день.',
    'summer',
    '["DATUM-EDP-50", "DATUM-INTENSE-50"]'::jsonb
  ),
  (
    'DATUM-INTENSE-50',
    'RAVSHAN — Intense 50ml',
    'Насыщенный древесно-пряный аромат. Стойкость: 10+ часов.',
    '50ml',
    'Intense',
    180000,
    'Экономичный расход. Достаточно 2-3 спрея.',
    'autumn-winter',
    '["DATUM-EDP-50", "DATUM-EDT-30"]'::jsonb
  )
ON CONFLICT (sku) DO NOTHING;

-- Добавляем несколько тестовых заказов
-- Сначала создадим тестового пользователя, если его нет
INSERT INTO users (telegram_id, name)
VALUES (999999999, 'Test User')
ON CONFLICT (telegram_id) DO NOTHING;

-- Добавляем тестовые заказы
INSERT INTO orders (order_id, platform, user_id, product_sku, status, created_at, delivered_at)
SELECT
  'ORD12345',
  'WOLT',
  u.id,
  'DATUM-EDP-50',
  'delivered',
  '2025-11-10T14:30:00Z'::timestamp,
  '2025-11-13T10:00:00Z'::timestamp
FROM users u WHERE u.telegram_id = 999999999
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO orders (order_id, platform, user_id, product_sku, status, created_at, delivered_at)
SELECT
  'ORD67890',
  'UZUM',
  u.id,
  'DATUM-EDT-30',
  'delivered',
  '2025-11-08T09:15:00Z'::timestamp,
  '2025-11-12T16:45:00Z'::timestamp
FROM users u WHERE u.telegram_id = 999999999
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO orders (order_id, platform, user_id, product_sku, status, created_at, delivered_at)
SELECT
  '#1234567',
  'YANDEX',
  u.id,
  'DATUM-INTENSE-50',
  'delivered',
  '2025-11-05T11:00:00Z'::timestamp,
  '2025-11-11T13:20:00Z'::timestamp
FROM users u WHERE u.telegram_id = 999999999
ON CONFLICT (order_id) DO NOTHING;

