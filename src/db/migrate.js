const fs = require('fs');
const path = require('path');
const pool = require('./connection');
const config = require('../config/env');

async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  console.log('🔄 Running migrations...');

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    try {
      await pool.query(sql);
      console.log(`✅ Migrated: ${file}`);
    } catch (error) {
      console.error(`❌ Error migrating ${file}:`, error.message);
      throw error;
    }
  }

  console.log('✅ All migrations completed');
}

// Запуск миграций при прямом вызове
if (require.main === module) {
  runMigrations()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations };

