require('dotenv').config();

module.exports = {
  // Telegram (основной бот для пользователей)
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || '',
  
  // Telegram Admin Bot (админский бот)
  TELEGRAM_ADMIN_BOT_TOKEN: process.env.TELEGRAM_ADMIN_BOT_TOKEN || '',
  TELEGRAM_ADMIN_BOT_USERNAME: process.env.TELEGRAM_ADMIN_BOT_USERNAME || '',
  TELEGRAM_ADMIN_ID: process.env.TELEGRAM_ADMIN_ID ? parseInt(process.env.TELEGRAM_ADMIN_ID) : null,
  
  // Server
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  WEBHOOK_PATH: process.env.WEBHOOK_PATH || '/webhook/telegram',
  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
  ADMIN_WEBHOOK_PATH: process.env.ADMIN_WEBHOOK_PATH || '/webhook/admin',
  
  // Database
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || 5432,
  DB_NAME: process.env.DB_NAME || 'datum_bot',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || 'postgres',
  
  // App
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
};

