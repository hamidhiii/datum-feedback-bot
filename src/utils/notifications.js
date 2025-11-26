const config = require('../config/env');

let adminBotInstance = null;

/**
 * Инициализировать админский бот для уведомлений
 * @param {Telegraf} adminBot
 */
function init(adminBot) {
  adminBotInstance = adminBot;
}

/**
 * Отправить уведомление администратору через админский бот
 * @param {string} message
 * @param {Object} options - { parse_mode, reply_markup }
 */
async function notifyAdmin(message, options = {}) {
  if (!config.TELEGRAM_ADMIN_ID || !adminBotInstance) {
    console.log('[NOTIFICATION] Admin bot not configured:', message);
    return;
  }

  try {
    await adminBotInstance.telegram.sendMessage(
      config.TELEGRAM_ADMIN_ID,
      message,
      options
    );
  } catch (error) {
    console.error('[NOTIFICATION] Error sending to admin:', error.message);
  }
}

/**
 * Уведомить о новом отзыве
 * @param {Object} review - данные отзыва
 */
async function notifyNewReview(review) {
  const emoji = review.rating >= 4 ? '⭐' : review.rating <= 2 ? '⚠️' : '📝';
  const message = `${emoji} **Новый отзыв**

**Оценка:** ${'⭐'.repeat(review.rating)} (${review.rating}/5)
**Пользователь:** ${review.user_name || 'Неизвестно'} (ID: ${review.telegram_id || 'N/A'})
**Заказ:** ${review.order_number || 'N/A'}

${review.text ? `**Комментарий:**\n${review.text}` : 'Без комментария'}

${review.rating <= 2 ? '⚠️ **Требует внимания!**' : ''}`;

  await notifyAdmin(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Все отзывы', callback_data: 'admin_reviews' }],
        review.rating <= 2 ? [{ text: '⚠️ Низкие оценки', callback_data: 'admin_low_rating' }] : [],
        [{ text: '📊 Панель управления', callback_data: 'admin_dashboard' }],
      ].filter(row => row.length > 0),
    },
  });
}

/**
 * Уведомить о запросе поддержки
 * @param {Object} request - данные запроса
 */
async function notifySupportRequest(request) {
  const typeEmoji = {
    call: '📱',
    chat: '💬',
    email: '📧',
  };

  const emoji = typeEmoji[request.request_type] || '📞';
  const message = `${emoji} **Новый запрос поддержки**

**Тип:** ${request.request_type}
**Пользователь:** ${request.user_name || 'Неизвестно'} (ID: ${request.telegram_id || 'N/A'})
${request.user_phone ? `**Телефон:** ${request.user_phone}` : ''}
${request.phone ? `**Указанный телефон:** ${request.phone}` : ''}
${request.preferred_time ? `**Удобное время:** ${new Date(request.preferred_time).toLocaleString('ru-RU')}` : ''}
${request.issue_type ? `**Тип проблемы:** ${request.issue_type}` : ''}

${request.message ? `**Сообщение:**\n${request.message}` : ''}

**Статус:** ${request.status}`;

  await notifyAdmin(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📞 Все запросы поддержки', callback_data: 'admin_support' }],
        [{ text: '📊 Панель управления', callback_data: 'admin_dashboard' }],
      ],
    },
  });
}

/**
 * Уведомить о негативном отзыве (для эскалации)
 * @param {Object} review - данные отзыва
 */
async function notifyNegativeReview(review) {
  const message = `🚨 **Негативный отзыв - требует срочного внимания!**

**Оценка:** ${'⭐'.repeat(review.rating)} (${review.rating}/5)
**Пользователь:** ${review.user_name || 'Неизвестно'} (ID: ${review.telegram_id || 'N/A'})
**Телефон:** ${review.phone || 'Не указан'}
**Заказ:** ${review.order_number || 'N/A'}

**Комментарий:**
${review.text || 'Без комментария'}

Рекомендуется связаться с клиентом.`;

  await notifyAdmin(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚠️ Низкие оценки', callback_data: 'admin_low_rating' }],
        [{ text: '📝 Все отзывы', callback_data: 'admin_reviews' }],
        [{ text: '📊 Панель управления', callback_data: 'admin_dashboard' }],
      ],
    },
  });
}

/**
 * Уведомить о найденном заказе
 * @param {Object} orderDetails - { order, product, user }
 */
async function notifyOrderFound(orderDetails) {
  const { order, product, user } = orderDetails;
  
  const message = `📦 **Заказ найден пользователем**

**Номер заказа:** ${order.order_id}
**Платформа:** ${order.platform}
**Пользователь:** ${user?.name || 'Неизвестно'} (ID: ${user?.telegram_id || 'N/A'})
${user?.phone ? `**Телефон:** ${user.phone}` : '**Телефон:** Не указан'}

**Товар:**
📦 ${product.title}
💧 Объём: ${product.volume}
🎯 Концентрация: ${product.concentration}
${product.price ? `💰 Цена: ${product.price} сум` : ''}

**Дата покупки:** ${new Date(order.created_at).toLocaleDateString('ru-RU')}
**Статус:** ${order.status}`;

  await notifyAdmin(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📦 Все заказы', callback_data: 'admin_orders' }],
        [{ text: '💬 История диалогов', callback_data: 'admin_dialogs' }],
        [{ text: '📊 Панель управления', callback_data: 'admin_dashboard' }],
      ],
    },
  });
}

module.exports = {
  init,
  notifyAdmin,
  notifyNewReview,
  notifySupportRequest,
  notifyNegativeReview,
  notifyOrderFound,
};

