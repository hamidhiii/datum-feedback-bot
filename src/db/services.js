const pool = require('./connection');

// ============ ПОЛЬЗОВАТЕЛИ ============

/**
 * Создать или получить пользователя по Telegram ID
 * @param {number} telegramId
 * @param {Object} data - { name, phone, email }
 * @returns {Promise<Object>}
 */
async function getOrCreateUser(telegramId, data = {}) {
  const client = await pool.connect();
  try {
    // Пытаемся найти пользователя
    let result = await client.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramId]
    );

    let user;
    if (result.rows.length === 0) {
      // Создаем нового пользователя
      result = await client.query(
        `INSERT INTO users (telegram_id, name, phone, email)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [telegramId, data.name || null, data.phone || null, data.email || null]
      );
      user = result.rows[0];
    } else {
      user = result.rows[0];
      // Обновляем данные, если они предоставлены
      if (data.name || data.phone || data.email) {
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (data.name) {
          updates.push(`name = $${paramCount++}`);
          values.push(data.name);
        }
        if (data.phone) {
          updates.push(`phone = $${paramCount++}`);
          values.push(data.phone);
        }
        if (data.email) {
          updates.push(`email = $${paramCount++}`);
          values.push(data.email);
        }

        if (updates.length > 0) {
          values.push(telegramId);
          result = await client.query(
            `UPDATE users SET ${updates.join(', ')} WHERE telegram_id = $${paramCount} RETURNING *`,
            values
          );
          user = result.rows[0];
        }
      }
    }

    return user;
  } finally {
    client.release();
  }
}

/**
 * Получить пользователя по Telegram ID
 * @param {number} telegramId
 * @returns {Promise<Object|null>}
 */
async function getUser(telegramId) {
  const result = await pool.query(
    'SELECT * FROM users WHERE telegram_id = $1',
    [telegramId]
  );
  return result.rows[0] || null;
}

// ============ ЗАКАЗЫ ============

/**
 * Найти заказ по номеру
 * @param {string} orderNumber
 * @returns {Promise<Object|null>}
 */
async function findOrder(orderNumber) {
  // Нормализуем номер: сохраняем # если есть, остальное в верхнем регистре
  let normalizedNumber = orderNumber.trim();
  if (normalizedNumber.startsWith('#')) {
    normalizedNumber = '#' + normalizedNumber.substring(1).toUpperCase().trim();
  } else {
    normalizedNumber = normalizedNumber.toUpperCase().trim();
  }
  
  console.log(`[DB] findOrder: searching for "${normalizedNumber}"`);
  
  try {
    const result = await pool.query(
      'SELECT * FROM orders WHERE order_id = $1',
      [normalizedNumber]
    );
    
    console.log(`[DB] findOrder: found ${result.rows.length} orders`);
    return result.rows[0] || null;
  } catch (error) {
    console.error(`[DB] findOrder error for "${normalizedNumber}":`, error.message);
    throw error;
  }
}

/**
 * Получить информацию о заказе с деталями товара
 * @param {string} orderNumber
 * @returns {Promise<Object|null>}
 */
async function getOrderDetails(orderNumber) {
  console.log(`[DB] getOrderDetails: called with "${orderNumber}"`);
  
  try {
    const order = await findOrder(orderNumber);
    if (!order) {
      console.log(`[DB] getOrderDetails: order not found`);
      return null;
    }

    console.log(`[DB] getOrderDetails: order found, product_sku: ${order.product_sku}`);
    
    const productResult = await pool.query(
      'SELECT * FROM products WHERE sku = $1',
      [order.product_sku]
    );

    if (productResult.rows.length === 0) {
      console.log(`[DB] getOrderDetails: product not found for sku: ${order.product_sku}`);
      return null;
    }

    console.log(`[DB] getOrderDetails: product found: ${productResult.rows[0].title}`);
    
    return {
      order,
      product: productResult.rows[0],
    };
  } catch (error) {
    console.error(`[DB] getOrderDetails error:`, error.message);
    throw error;
  }
}

/**
 * Создать заказ
 * @param {Object} orderData - { order_id, platform, user_id, product_sku, status, raw_payload }
 * @returns {Promise<Object>}
 */
async function createOrder(orderData) {
  const result = await pool.query(
    `INSERT INTO orders (order_id, platform, user_id, product_sku, status, raw_payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      orderData.order_id,
      orderData.platform,
      orderData.user_id || null,
      orderData.product_sku,
      orderData.status || 'delivered',
      orderData.raw_payload ? JSON.stringify(orderData.raw_payload) : null,
    ]
  );
  return result.rows[0];
}

/**
 * Получить все заказы
 * @param {Object} options - { limit, offset, platform, user_id }
 * @returns {Promise<Array>}
 */
async function getAllOrders(options = {}) {
  let query = `
    SELECT o.*, u.name as user_name, u.telegram_id, u.phone as user_phone, p.title as product_title
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    LEFT JOIN products p ON o.product_sku = p.sku
    WHERE 1=1
  `;
  const params = [];
  let paramCount = 1;

  if (options.platform) {
    query += ` AND o.platform = $${paramCount++}`;
    params.push(options.platform);
  }

  if (options.user_id) {
    query += ` AND o.user_id = $${paramCount++}`;
    params.push(options.user_id);
  }

  query += ' ORDER BY o.created_at DESC';

  if (options.limit) {
    query += ` LIMIT $${paramCount++}`;
    params.push(options.limit);
  }

  if (options.offset) {
    query += ` OFFSET $${paramCount++}`;
    params.push(options.offset);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

// ============ ТОВАРЫ ============

/**
 * Получить товар по SKU
 * @param {string} sku
 * @returns {Promise<Object|null>}
 */
async function getProduct(sku) {
  const result = await pool.query('SELECT * FROM products WHERE sku = $1', [sku]);
  return result.rows[0] || null;
}

/**
 * Получить все товары
 * @returns {Promise<Array>}
 */
async function getAllProducts() {
  const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
  return result.rows;
}

/**
 * Получить альтернативные товары
 * @param {string} sku
 * @returns {Promise<Array>}
 */
async function getAlternatives(sku) {
  const product = await getProduct(sku);
  if (!product || !product.alternatives || !Array.isArray(product.alternatives)) {
    return [];
  }

  const result = await pool.query(
    `SELECT * FROM products WHERE sku = ANY($1::text[])`,
    [product.alternatives]
  );
  return result.rows;
}

/**
 * Получить сезонные товары
 * @param {string} season - 'summer', 'autumn-winter', 'all-year'
 * @returns {Promise<Array>}
 */
async function getSeasonalProducts(season) {
  const result = await pool.query(
    `SELECT * FROM products 
     WHERE season_tag = $1 OR season_tag = 'all-year'
     ORDER BY created_at DESC`,
    [season]
  );
  return result.rows;
}

// ============ ОТЗЫВЫ ============

/**
 * Сохранить отзыв
 * @param {Object} reviewData - { user_id, order_id, rating, text }
 * @returns {Promise<Object>}
 */
async function saveReview(reviewData) {
  const result = await pool.query(
    `INSERT INTO reviews (user_id, order_id, rating, text, created_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      reviewData.user_id || null,
      reviewData.order_id || null,
      reviewData.rating,
      reviewData.text || null,
    ]
  );
  return result.rows[0];
}

/**
 * Получить все отзывы
 * @param {Object} options - { limit, offset, order_id, user_id }
 * @returns {Promise<Array>}
 */
async function getAllReviews(options = {}) {
  let query = `
    SELECT r.*, u.name as user_name, u.telegram_id, o.order_id as order_number
    FROM reviews r
    LEFT JOIN users u ON r.user_id = u.id
    LEFT JOIN orders o ON r.order_id = o.id
    WHERE 1=1
  `;
  const params = [];
  let paramCount = 1;

  if (options.order_id) {
    query += ` AND r.order_id = $${paramCount++}`;
    params.push(options.order_id);
  }

  if (options.user_id) {
    query += ` AND r.user_id = $${paramCount++}`;
    params.push(options.user_id);
  }

  query += ' ORDER BY r.created_at DESC';

  if (options.limit) {
    query += ` LIMIT $${paramCount++}`;
    params.push(options.limit);
  }

  if (options.offset) {
    query += ` OFFSET $${paramCount++}`;
    params.push(options.offset);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Получить отзывы с низким рейтингом (для эскалации)
 * @param {number} maxRating - максимальный рейтинг (по умолчанию 2)
 * @returns {Promise<Array>}
 */
async function getLowRatingReviews(maxRating = 2) {
  const result = await pool.query(
    `SELECT r.*, u.name as user_name, u.telegram_id, u.phone, o.order_id as order_number
     FROM reviews r
     LEFT JOIN users u ON r.user_id = u.id
     LEFT JOIN orders o ON r.order_id = o.id
     WHERE r.rating <= $1
     ORDER BY r.created_at DESC`,
    [maxRating]
  );
  return result.rows;
}

// ============ ДИАЛОГИ (логирование) ============

/**
 * Логировать действие пользователя
 * @param {Object} dialogData - { telegram_id, order_id, message, direction, action, metadata }
 * @returns {Promise<Object>}
 */
async function logDialog(dialogData) {
  // Получаем user_id из telegram_id
  let userId = null;
  if (dialogData.telegram_id) {
    const user = await getUser(dialogData.telegram_id);
    if (user) userId = user.id;
  }

  // Получаем order_id из order_number, если нужно
  let orderId = dialogData.order_id;
  if (!orderId && dialogData.order_number) {
    const order = await findOrder(dialogData.order_number);
    if (order) orderId = order.id;
  }

  const result = await pool.query(
    `INSERT INTO dialogs (user_id, order_id, message, direction, action, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      userId,
      orderId,
      dialogData.message || null,
      dialogData.direction || 'incoming',
      dialogData.action || null,
      dialogData.metadata ? JSON.stringify(dialogData.metadata) : null,
    ]
  );
  return result.rows[0];
}

/**
 * Получить историю диалогов пользователя
 * @param {number} telegramId
 * @param {Object} options - { limit, offset }
 * @returns {Promise<Array>}
 */
async function getUserDialogs(telegramId, options = {}) {
  const user = await getUser(telegramId);
  if (!user) return [];

  let query = `
    SELECT d.*, o.order_id as order_number
    FROM dialogs d
    LEFT JOIN orders o ON d.order_id = o.id
    WHERE d.user_id = $1
    ORDER BY d.created_at DESC
  `;
  const params = [user.id];
  let paramCount = 2;

  if (options.limit) {
    query += ` LIMIT $${paramCount++}`;
    params.push(options.limit);
  }

  if (options.offset) {
    query += ` OFFSET $${paramCount++}`;
    params.push(options.offset);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Получить все диалоги (для админа)
 * @param {Object} options - { limit, offset, action, telegram_id }
 * @returns {Promise<Array>}
 */
async function getAllDialogs(options = {}) {
  let query = `
    SELECT d.*, u.name as user_name, u.telegram_id, o.order_id as order_number
    FROM dialogs d
    LEFT JOIN users u ON d.user_id = u.id
    LEFT JOIN orders o ON d.order_id = o.id
    WHERE 1=1
  `;
  const params = [];
  let paramCount = 1;

  if (options.action) {
    query += ` AND d.action = $${paramCount++}`;
    params.push(options.action);
  }

  if (options.telegram_id) {
    query += ` AND u.telegram_id = $${paramCount++}`;
    params.push(options.telegram_id);
  }

  query += ' ORDER BY d.created_at DESC';

  if (options.limit) {
    query += ` LIMIT $${paramCount++}`;
    params.push(options.limit);
  }

  if (options.offset) {
    query += ` OFFSET $${paramCount++}`;
    params.push(options.offset);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

// ============ ПОДДЕРЖКА ============

/**
 * Создать запрос поддержки
 * @param {Object} requestData - { user_id, request_type, phone, preferred_time, issue_type, message }
 * @returns {Promise<Object>}
 */
async function createSupportRequest(requestData) {
  const result = await pool.query(
    `INSERT INTO support_requests (user_id, request_type, phone, preferred_time, issue_type, message, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      requestData.user_id || null,
      requestData.request_type,
      requestData.phone || null,
      requestData.preferred_time || null,
      requestData.issue_type || null,
      requestData.message || null,
    ]
  );
  return result.rows[0];
}

/**
 * Получить все запросы поддержки
 * @param {Object} options - { limit, offset, status }
 * @returns {Promise<Array>}
 */
async function getAllSupportRequests(options = {}) {
  let query = `
    SELECT sr.*, u.name as user_name, u.telegram_id, u.phone as user_phone
    FROM support_requests sr
    LEFT JOIN users u ON sr.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  let paramCount = 1;

  if (options.status) {
    query += ` AND sr.status = $${paramCount++}`;
    params.push(options.status);
  }

  query += ' ORDER BY sr.created_at DESC';

  if (options.limit) {
    query += ` LIMIT $${paramCount++}`;
    params.push(options.limit);
  }

  if (options.offset) {
    query += ` OFFSET $${paramCount++}`;
    params.push(options.offset);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Обновить статус запроса поддержки
 * @param {number} requestId
 * @param {Object} updateData - { status, manager_id }
 * @returns {Promise<Object>}
 */
async function updateSupportRequest(requestId, updateData) {
  const updates = [];
  const values = [];
  let paramCount = 1;

  if (updateData.status) {
    updates.push(`status = $${paramCount++}`);
    values.push(updateData.status);
  }

  if (updateData.manager_id !== undefined) {
    updates.push(`manager_id = $${paramCount++}`);
    values.push(updateData.manager_id);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(requestId);
  const result = await pool.query(
    `UPDATE support_requests SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
}

// ============ ЭКСПОРТ ============

module.exports = {
  // Пользователи
  getOrCreateUser,
  getUser,

  // Заказы
  findOrder,
  getOrderDetails,
  createOrder,
  getAllOrders,

  // Товары
  getProduct,
  getAllProducts,
  getAlternatives,
  getSeasonalProducts,

  // Отзывы
  saveReview,
  getAllReviews,
  getLowRatingReviews,

  // Диалоги
  logDialog,
  getUserDialogs,
  getAllDialogs,

  // Поддержка
  createSupportRequest,
  getAllSupportRequests,
  updateSupportRequest,
};
