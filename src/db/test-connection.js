/**
 * Скрипт для проверки подключения к БД и наличия данных
 */

require('dotenv').config();
const pool = require('./connection');
const db = require('./services');

async function testConnection() {
  console.log('🔍 Проверка подключения к БД...\n');
  
  try {
    // Проверка подключения
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Подключение к БД успешно');
    console.log('   Время сервера:', result.rows[0].now);
    
    // Проверка таблицы orders
    console.log('\n🔍 Проверка таблицы orders...');
    const ordersResult = await pool.query('SELECT COUNT(*) as count FROM orders');
    console.log(`   Всего заказов в БД: ${ordersResult.rows[0].count}`);
    
    // Показать все заказы
    const allOrders = await pool.query('SELECT order_id, platform, product_sku FROM orders ORDER BY created_at');
    console.log('\n📋 Список заказов в БД:');
    allOrders.rows.forEach((order, index) => {
      console.log(`   ${index + 1}. ${order.order_id} (${order.platform}) -> ${order.product_sku}`);
    });
    
    // Проверка таблицы products
    console.log('\n🔍 Проверка таблицы products...');
    const productsResult = await pool.query('SELECT COUNT(*) as count FROM products');
    console.log(`   Всего товаров в БД: ${productsResult.rows[0].count}`);
    
    // Показать все товары
    const allProducts = await pool.query('SELECT sku, title FROM products');
    console.log('\n📦 Список товаров в БД:');
    allProducts.rows.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.sku}: ${product.title}`);
    });
    
    // Тест поиска заказов
    console.log('\n🔍 Тест поиска заказов...');
    const testOrders = ['ORD12345', 'ORD67890', '#1234567', '#1234567', 'ord12345'];
    
    for (const orderNum of testOrders) {
      try {
        const orderDetails = await db.getOrderDetails(orderNum);
        if (orderDetails) {
          console.log(`   ✅ "${orderNum}" -> найден! Товар: ${orderDetails.product.title}`);
        } else {
          console.log(`   ❌ "${orderNum}" -> не найден`);
        }
      } catch (error) {
        console.log(`   ⚠️  "${orderNum}" -> ошибка: ${error.message}`);
      }
    }
    
    console.log('\n✅ Проверка завершена');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

testConnection();

