-- Создание таблицы users (пользователи Telegram)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);

-- Создание таблицы products (товары)
CREATE TABLE IF NOT EXISTS products (
  sku VARCHAR(100) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  volume VARCHAR(50),
  concentration VARCHAR(50),
  price INTEGER,
  image_url VARCHAR(500),
  instructions TEXT,
  season_tag VARCHAR(50) DEFAULT 'all-year',
  alternatives JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_season ON products(season_tag);

-- Создание таблицы orders (заказы)
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(100) UNIQUE NOT NULL,
  platform VARCHAR(50) NOT NULL,
  user_id INTEGER REFERENCES users(id),
  product_sku VARCHAR(100) REFERENCES products(sku),
  status VARCHAR(50) DEFAULT 'delivered',
  raw_payload JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_platform ON orders(platform);

-- Создание таблицы reviews (отзывы)
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  order_id INTEGER REFERENCES orders(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text TEXT,
  manager_response TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);

-- Создание таблицы dialogs (логи диалогов)
CREATE TABLE IF NOT EXISTS dialogs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  order_id INTEGER REFERENCES orders(id),
  message TEXT,
  direction VARCHAR(20) NOT NULL, -- 'incoming' или 'outgoing'
  action VARCHAR(100),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dialogs_user_id ON dialogs(user_id);
CREATE INDEX IF NOT EXISTS idx_dialogs_order_id ON dialogs(order_id);
CREATE INDEX IF NOT EXISTS idx_dialogs_action ON dialogs(action);
CREATE INDEX IF NOT EXISTS idx_dialogs_created_at ON dialogs(created_at);

-- Создание таблицы support_requests (запросы поддержки)
CREATE TABLE IF NOT EXISTS support_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  request_type VARCHAR(50) NOT NULL, -- 'call', 'chat', 'email'
  phone VARCHAR(50),
  preferred_time TIMESTAMP,
  issue_type VARCHAR(100),
  message TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'resolved'
  manager_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_requests_user_id ON support_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_support_requests_status ON support_requests(status);
CREATE INDEX IF NOT EXISTS idx_support_requests_created_at ON support_requests(created_at);

-- Функция для автоматического обновления updated_at
-- Используем CREATE OR REPLACE для безопасного пересоздания
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггеры для автоматического обновления updated_at
-- Используем DROP IF EXISTS для безопасного пересоздания
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reviews_updated_at ON reviews;
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_support_requests_updated_at ON support_requests;
CREATE TRIGGER update_support_requests_updated_at BEFORE UPDATE ON support_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

