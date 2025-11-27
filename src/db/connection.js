const { Pool } = require('pg');
const config = require('../config/env');

// Render требует подключение через DATABASE_URL + SSL
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Лог ошибок
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Тест подключения
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Database connected successfully');
  }
});

module.exports = pool;
