/**
 * Админский бот для управления и просмотра данных
 * Отдельный бот только для администраторов
 */

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const config = require('./config/env');
const db = require('./db/services');

if (!config.TELEGRAM_ADMIN_BOT_TOKEN) {
  console.error('[ADMIN_BOT] ERROR: TELEGRAM_ADMIN_BOT_TOKEN is not set!');
  throw new Error('TELEGRAM_ADMIN_BOT_TOKEN is required');
}

const adminBot = new Telegraf(config.TELEGRAM_ADMIN_BOT_TOKEN);

// Логируем все обновления для диагностики
adminBot.use(async (ctx, next) => {
  console.log('[ADMIN_BOT] Update received:', {
    updateType: ctx.updateType,
    userId: ctx.from?.id,
    username: ctx.from?.username,
    text: ctx.message?.text || ctx.callbackQuery?.data,
  });
  return next();
});

// Проверка, что пользователь - администратор
function isAdmin(userId) {
  return config.TELEGRAM_ADMIN_ID && userId === config.TELEGRAM_ADMIN_ID;
}

// Middleware для проверки прав администратора (после логирования)
adminBot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  
  if (!userId) {
    console.log('[ADMIN_BOT] No user ID, skipping');
    return;
  }

  // Для команд и сообщений проверяем права
  if (ctx.message || ctx.callbackQuery) {
    if (!isAdmin(userId)) {
      console.log(`[ADMIN_BOT] Access denied for user ${userId} (expected ${config.TELEGRAM_ADMIN_ID})`);
      try {
        if (ctx.message) {
          await ctx.reply(`❌ У вас нет доступа к админ-панели.\n\nВаш ID: ${userId}\nОжидается ID: ${config.TELEGRAM_ADMIN_ID || 'не настроен'}\n\nПроверьте настройку TELEGRAM_ADMIN_ID в .env файле.`);
        } else if (ctx.callbackQuery) {
          await ctx.answerCbQuery('❌ У вас нет доступа к админ-панели.');
        }
      } catch (error) {
        console.error('[ADMIN_BOT] Error sending access denied message:', error);
      }
      return;
    }
  }

  return next();
});

// Команда /start
adminBot.start(async (ctx) => {
  const userId = ctx.from.id;
  
  console.log('[ADMIN_BOT] /start command received from user:', userId);
  console.log('[ADMIN_BOT] isAdmin check:', isAdmin(userId));
  console.log('[ADMIN_BOT] config.TELEGRAM_ADMIN_ID:', config.TELEGRAM_ADMIN_ID);
  
  if (!isAdmin(userId)) {
    console.log('[ADMIN_BOT] Access denied in /start handler');
    await ctx.reply('❌ У вас нет доступа к админ-панели.');
    return;
  }

  console.log('[ADMIN_BOT] Sending welcome message');
  await ctx.reply(
    `👋 Добро пожаловать в админ-панель DATUM Bot!\n\n` +
    `Доступные команды:\n` +
    `/dashboard - Главная панель со статистикой\n` +
    `/orders - Найденные заказы\n` +
    `/dialogs - История диалогов\n` +
    `/reviews - Последние отзывы\n` +
    `/support - Запросы поддержки\n` +
    `/low_rating - Отзывы с низким рейтингом\n` +
    `/stats - Статистика\n` +
    `/help - Справка`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 Панель управления', callback_data: 'admin_dashboard' }],
          [{ text: '📦 Заказы', callback_data: 'admin_orders' }],
          [{ text: '💬 Диалоги', callback_data: 'admin_dialogs' }],
          [{ text: '📝 Отзывы', callback_data: 'admin_reviews' }],
          [{ text: '📞 Поддержка', callback_data: 'admin_support' }],
          [{ text: '⚠️ Требуют внимания', callback_data: 'admin_low_rating' }],
        ],
      },
    }
  );
});

// Команда /help
adminBot.help(async (ctx) => {
  const helpText = `📋 Команды админ-панели:

/dashboard - Главная панель со статистикой
/orders - Найденные заказы (последние 20)
/dialogs - История диалогов (последние 20)
/reviews - Последние отзывы (10 штук)
/reviews_all - Все отзывы
/support - Активные запросы поддержки (pending)
/support_all - Все запросы поддержки
/low_rating - Отзывы с низким рейтингом (≤2⭐)
/stats - Общая статистика
/help - Эта справка`;

  await ctx.reply(helpText);
});

// Команда /dashboard
adminBot.command('dashboard', async (ctx) => {
  try {
    const reviews = await db.getAllReviews({ limit: 10 });
    const supportRequests = await db.getAllSupportRequests({ limit: 10, status: 'pending' });
    const lowRatingReviews = await db.getLowRatingReviews(2);
    
    // Получаем общую статистику
    const allReviews = await db.getAllReviews();
    const allSupportRequests = await db.getAllSupportRequests();
    const allOrders = await db.getAllOrders();
    const recentDialogs = await db.getAllDialogs({ limit: 100 });
    const orderFoundDialogs = recentDialogs.filter(d => d.action === 'order_found');

    const statsText = `📊 **Панель управления DATUM Bot**

📦 **Заказы:**
• Всего заказов: ${allOrders.length}
• Найдено пользователями: ${orderFoundDialogs.length}

💬 **Диалоги:**
• Последние действия: ${recentDialogs.length}

📝 **Отзывы:**
• Всего: ${allReviews.length}
• Требуют внимания (≤2⭐): ${lowRatingReviews.length}
• За последние 10: ${reviews.length}

📞 **Поддержка:**
• Всего запросов: ${allSupportRequests.length}
• В ожидании: ${supportRequests.length}

⚠️ **Требуют срочного внимания:**
${lowRatingReviews.length > 0 ? `• ${lowRatingReviews.length} негативных отзывов` : '• Нет'}`;

    await ctx.reply(statsText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📦 Заказы', callback_data: 'admin_orders' }],
          [{ text: '💬 Диалоги', callback_data: 'admin_dialogs' }],
          [{ text: '📝 Последние отзывы', callback_data: 'admin_reviews' }],
          [{ text: '📞 Запросы поддержки', callback_data: 'admin_support' }],
          [{ text: '⚠️ Низкие оценки', callback_data: 'admin_low_rating' }],
          [{ text: '📊 Подробная статистика', callback_data: 'admin_stats' }],
        ],
      },
    });
  } catch (error) {
    console.error('[ADMIN_BOT] Dashboard error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке данных.');
  }
});

// Команда /reviews
adminBot.command('reviews', async (ctx) => {
  try {
    const reviews = await db.getAllReviews({ limit: 10 });
    
    if (reviews.length === 0) {
      await ctx.reply('📝 Отзывов пока нет.');
      return;
    }

    let reviewsText = `📝 **Последние ${reviews.length} отзывов:**\n\n`;
    
    reviews.forEach((review, index) => {
      const emoji = review.rating >= 4 ? '⭐' : review.rating <= 2 ? '⚠️' : '📝';
      reviewsText += `${emoji} **Отзыв #${review.id}**\n`;
      reviewsText += `Оценка: ${'⭐'.repeat(review.rating)} (${review.rating}/5)\n`;
      reviewsText += `Пользователь: ${review.user_name || 'N/A'} (ID: ${review.telegram_id || 'N/A'})\n`;
      reviewsText += `Заказ: ${review.order_number || 'N/A'}\n`;
      if (review.text) {
        reviewsText += `Комментарий: ${review.text.substring(0, 100)}${review.text.length > 100 ? '...' : ''}\n`;
      }
      reviewsText += `Дата: ${new Date(review.created_at).toLocaleString('ru-RU')}\n\n`;
    });

    await ctx.reply(reviewsText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Все отзывы', callback_data: 'admin_reviews_all' }],
          [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
        ],
      },
    });
  } catch (error) {
    console.error('[ADMIN_BOT] Reviews error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке отзывов.');
  }
});

// Команда /support
adminBot.command('support', async (ctx) => {
  try {
    const requests = await db.getAllSupportRequests({ limit: 10, status: 'pending' });
    
    if (requests.length === 0) {
      await ctx.reply('📞 Нет активных запросов поддержки.');
      return;
    }

    let supportText = `📞 **Активные запросы поддержки (${requests.length}):**\n\n`;
    
    requests.forEach((req, index) => {
      const typeEmoji = {
        call: '📱',
        chat: '💬',
        email: '📧',
      };
      const emoji = typeEmoji[req.request_type] || '📞';
      
      supportText += `${emoji} **Запрос #${req.id}**\n`;
      supportText += `Тип: ${req.request_type}\n`;
      supportText += `Пользователь: ${req.user_name || 'N/A'} (ID: ${req.telegram_id || 'N/A'})\n`;
      if (req.phone || req.user_phone) {
        supportText += `Телефон: ${req.phone || req.user_phone}\n`;
      }
      if (req.message) {
        supportText += `Сообщение: ${req.message.substring(0, 100)}${req.message.length > 100 ? '...' : ''}\n`;
      }
      supportText += `Дата: ${new Date(req.created_at).toLocaleString('ru-RU')}\n\n`;
    });

    await ctx.reply(supportText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Все запросы', callback_data: 'admin_support_all' }],
          [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
        ],
      },
    });
  } catch (error) {
    console.error('[ADMIN_BOT] Support error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке запросов поддержки.');
  }
});

// Команда /low_rating
adminBot.command('low_rating', async (ctx) => {
  try {
    const reviews = await db.getLowRatingReviews(2);
    
    if (reviews.length === 0) {
      await ctx.reply('✅ Нет отзывов с низким рейтингом.');
      return;
    }

    let lowRatingText = `⚠️ **Отзывы, требующие внимания (${reviews.length}):**\n\n`;
    
    reviews.forEach((review, index) => {
      lowRatingText += `⚠️ **Отзыв #${review.id}**\n`;
      lowRatingText += `Оценка: ${'⭐'.repeat(review.rating)} (${review.rating}/5)\n`;
      lowRatingText += `Пользователь: ${review.user_name || 'N/A'} (ID: ${review.telegram_id || 'N/A'})\n`;
      if (review.phone) {
        lowRatingText += `Телефон: ${review.phone}\n`;
      }
      lowRatingText += `Заказ: ${review.order_number || 'N/A'}\n`;
      if (review.text) {
        lowRatingText += `Комментарий: ${review.text}\n`;
      }
      lowRatingText += `Дата: ${new Date(review.created_at).toLocaleString('ru-RU')}\n\n`;
    });

    await ctx.reply(lowRatingText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
        ],
      },
    });
  } catch (error) {
    console.error('[ADMIN_BOT] Low rating error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке отзывов.');
  }
});

// Команда /orders
adminBot.command('orders', async (ctx) => {
  try {
    const orders = await db.getAllOrders({ limit: 20 });
    
    if (orders.length === 0) {
      await ctx.reply('📦 Заказов пока нет.');
      return;
    }

    let ordersText = `📦 **Последние ${orders.length} заказов:**\n\n`;
    
    orders.forEach((order, index) => {
      ordersText += `📦 **Заказ #${order.id}**\n`;
      ordersText += `Номер: ${order.order_id}\n`;
      ordersText += `Платформа: ${order.platform}\n`;
      ordersText += `Товар: ${order.product_title || order.product_sku || 'N/A'}\n`;
      ordersText += `Пользователь: ${order.user_name || 'N/A'} (ID: ${order.telegram_id || 'N/A'})\n`;
      if (order.user_phone) {
        ordersText += `Телефон: ${order.user_phone}\n`;
      }
      ordersText += `Статус: ${order.status}\n`;
      ordersText += `Дата: ${new Date(order.created_at).toLocaleString('ru-RU')}\n\n`;
    });

    await ctx.reply(ordersText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
        ],
      },
    });
  } catch (error) {
    console.error('[ADMIN_BOT] Orders error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке заказов.');
  }
});

// Команда /dialogs
adminBot.command('dialogs', async (ctx) => {
  try {
    const dialogs = await db.getAllDialogs({ limit: 20 });
    
    if (dialogs.length === 0) {
      await ctx.reply('💬 Диалогов пока нет.');
      return;
    }

    let dialogsText = `💬 **Последние ${dialogs.length} действий:**\n\n`;
    
    dialogs.forEach((dialog, index) => {
      const actionEmoji = {
        'bot_started': '🚀',
        'order_found': '✅',
        'order_not_found': '❌',
        'platform_selected': '📱',
        'contact_shared': '📞',
        'review_submitted': '⭐',
        'support_requested': '📞',
        'text_message': '💬',
        'photo_received': '📷',
      };
      
      const emoji = actionEmoji[dialog.action] || '💬';
      dialogsText += `${emoji} **${dialog.action || 'action'}**\n`;
      dialogsText += `Пользователь: ${dialog.user_name || 'N/A'} (ID: ${dialog.telegram_id || 'N/A'})\n`;
      if (dialog.order_number) {
        dialogsText += `Заказ: ${dialog.order_number}\n`;
      }
      if (dialog.message) {
        dialogsText += `Сообщение: ${dialog.message.substring(0, 80)}${dialog.message.length > 80 ? '...' : ''}\n`;
      }
      dialogsText += `Направление: ${dialog.direction}\n`;
      dialogsText += `Дата: ${new Date(dialog.created_at).toLocaleString('ru-RU')}\n\n`;
    });

    await ctx.reply(dialogsText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
        ],
      },
    });
  } catch (error) {
    console.error('[ADMIN_BOT] Dialogs error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке диалогов.');
  }
});

// Команда /stats
adminBot.command('stats', async (ctx) => {
  try {
    const allReviews = await db.getAllReviews();
    const allSupportRequests = await db.getAllSupportRequests();
    const lowRatingReviews = await db.getLowRatingReviews(2);
    
    // Подсчитываем среднюю оценку
    const avgRating = allReviews.length > 0
      ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length).toFixed(2)
      : 0;

    // Подсчитываем запросы по типам
    const supportByType = {};
    allSupportRequests.forEach(req => {
      supportByType[req.request_type] = (supportByType[req.request_type] || 0) + 1;
    });

    let statsText = `📊 **Общая статистика DATUM Bot**\n\n`;
    statsText += `📝 **Отзывы:**\n`;
    statsText += `• Всего: ${allReviews.length}\n`;
    statsText += `• Средняя оценка: ${avgRating}/5\n`;
    statsText += `• Низкие оценки (≤2⭐): ${lowRatingReviews.length}\n`;
    statsText += `• Высокие оценки (≥4⭐): ${allReviews.filter(r => r.rating >= 4).length}\n\n`;
    
    statsText += `📞 **Поддержка:**\n`;
    statsText += `• Всего запросов: ${allSupportRequests.length}\n`;
    statsText += `• В ожидании: ${allSupportRequests.filter(r => r.status === 'pending').length}\n`;
    statsText += `• В работе: ${allSupportRequests.filter(r => r.status === 'in_progress').length}\n`;
    statsText += `• Решено: ${allSupportRequests.filter(r => r.status === 'resolved').length}\n\n`;
    
    if (Object.keys(supportByType).length > 0) {
      statsText += `📊 **По типам:**\n`;
      Object.entries(supportByType).forEach(([type, count]) => {
        const emoji = type === 'call' ? '📱' : type === 'chat' ? '💬' : '📧';
        statsText += `${emoji} ${type}: ${count}\n`;
      });
    }

    await ctx.reply(statsText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
        ],
      },
    });
  } catch (error) {
    console.error('[ADMIN_BOT] Stats error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке статистики.');
  }
});

// ============ CALLBACK HANDLERS (обработчики кнопок) ============

// Обработчик кнопки "Панель управления"
adminBot.action('admin_dashboard', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCbQuery('❌ У вас нет доступа.');
    return;
  }
  
  await ctx.answerCbQuery();
  
  try {
    const reviews = await db.getAllReviews({ limit: 10 });
    const supportRequests = await db.getAllSupportRequests({ limit: 10, status: 'pending' });
    const lowRatingReviews = await db.getLowRatingReviews(2);
    
    // Получаем общую статистику
    const allReviews = await db.getAllReviews();
    const allSupportRequests = await db.getAllSupportRequests();
    const allOrders = await db.getAllOrders();
    const recentDialogs = await db.getAllDialogs({ limit: 100 });
    const orderFoundDialogs = recentDialogs.filter(d => d.action === 'order_found');

    const statsText = `📊 **Панель управления DATUM Bot**

📦 **Заказы:**
• Всего заказов: ${allOrders.length}
• Найдено пользователями: ${orderFoundDialogs.length}

💬 **Диалоги:**
• Последние действия: ${recentDialogs.length}

📝 **Отзывы:**
• Всего: ${allReviews.length}
• Требуют внимания (≤2⭐): ${lowRatingReviews.length}
• За последние 10: ${reviews.length}

📞 **Поддержка:**
• Всего запросов: ${allSupportRequests.length}
• В ожидании: ${supportRequests.length}

⚠️ **Требуют срочного внимания:**
${lowRatingReviews.length > 0 ? `• ${lowRatingReviews.length} негативных отзывов` : '• Нет'}`;

    try {
      await ctx.editMessageText(statsText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Последние отзывы', callback_data: 'admin_reviews' }],
            [{ text: '📞 Запросы поддержки', callback_data: 'admin_support' }],
            [{ text: '⚠️ Низкие оценки', callback_data: 'admin_low_rating' }],
            [{ text: '📊 Подробная статистика', callback_data: 'admin_stats' }],
          ],
        },
      });
    } catch (error) {
      // Если сообщение нельзя отредактировать (новое сообщение), отправляем новое
      await ctx.reply(statsText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Последние отзывы', callback_data: 'admin_reviews' }],
            [{ text: '📞 Запросы поддержки', callback_data: 'admin_support' }],
            [{ text: '⚠️ Низкие оценки', callback_data: 'admin_low_rating' }],
            [{ text: '📊 Подробная статистика', callback_data: 'admin_stats' }],
          ],
        },
      });
    }
  } catch (error) {
    console.error('[ADMIN_BOT] Dashboard error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке данных.');
  }
});

// Обработчик кнопки "Отзывы"
adminBot.action('admin_reviews', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCbQuery('❌ У вас нет доступа.');
    return;
  }
  
  await ctx.answerCbQuery();
  
  try {
    const reviews = await db.getAllReviews({ limit: 10 });
    
    if (reviews.length === 0) {
      try {
        await ctx.editMessageText('📝 Отзывов пока нет.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
            ],
          },
        });
      } catch (error) {
        await ctx.reply('📝 Отзывов пока нет.');
      }
      return;
    }

    let reviewsText = `📝 **Последние ${reviews.length} отзывов:**\n\n`;
    
    reviews.forEach((review, index) => {
      const emoji = review.rating >= 4 ? '⭐' : review.rating <= 2 ? '⚠️' : '📝';
      reviewsText += `${emoji} **Отзыв #${review.id}**\n`;
      reviewsText += `Оценка: ${'⭐'.repeat(review.rating)} (${review.rating}/5)\n`;
      reviewsText += `Пользователь: ${review.user_name || 'N/A'} (ID: ${review.telegram_id || 'N/A'})\n`;
      reviewsText += `Заказ: ${review.order_number || 'N/A'}\n`;
      if (review.text) {
        reviewsText += `Комментарий: ${review.text.substring(0, 100)}${review.text.length > 100 ? '...' : ''}\n`;
      }
      reviewsText += `Дата: ${new Date(review.created_at).toLocaleString('ru-RU')}\n\n`;
    });

    try {
      await ctx.editMessageText(reviewsText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Все отзывы', callback_data: 'admin_reviews_all' }],
            [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
          ],
        },
      });
    } catch (error) {
      await ctx.reply(reviewsText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Все отзывы', callback_data: 'admin_reviews_all' }],
            [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
          ],
        },
      });
    }
  } catch (error) {
    console.error('[ADMIN_BOT] Reviews error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке отзывов.');
  }
});

// Обработчик кнопки "Поддержка"
adminBot.action('admin_support', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCbQuery('❌ У вас нет доступа.');
    return;
  }
  
  await ctx.answerCbQuery();
  
  try {
    const requests = await db.getAllSupportRequests({ limit: 10, status: 'pending' });
    
    if (requests.length === 0) {
      try {
        await ctx.editMessageText('📞 Нет активных запросов поддержки.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
            ],
          },
        });
      } catch (error) {
        await ctx.reply('📞 Нет активных запросов поддержки.');
      }
      return;
    }

    let supportText = `📞 **Активные запросы поддержки (${requests.length}):**\n\n`;
    
    requests.forEach((req, index) => {
      const typeEmoji = {
        call: '📱',
        chat: '💬',
        email: '📧',
      };
      const emoji = typeEmoji[req.request_type] || '📞';
      
      supportText += `${emoji} **Запрос #${req.id}**\n`;
      supportText += `Тип: ${req.request_type}\n`;
      supportText += `Пользователь: ${req.user_name || 'N/A'} (ID: ${req.telegram_id || 'N/A'})\n`;
      if (req.phone || req.user_phone) {
        supportText += `Телефон: ${req.phone || req.user_phone}\n`;
      }
      if (req.message) {
        supportText += `Сообщение: ${req.message.substring(0, 100)}${req.message.length > 100 ? '...' : ''}\n`;
      }
      supportText += `Дата: ${new Date(req.created_at).toLocaleString('ru-RU')}\n\n`;
    });

    try {
      await ctx.editMessageText(supportText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Все запросы', callback_data: 'admin_support_all' }],
            [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
          ],
        },
      });
    } catch (error) {
      await ctx.reply(supportText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Все запросы', callback_data: 'admin_support_all' }],
            [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
          ],
        },
      });
    }
  } catch (error) {
    console.error('[ADMIN_BOT] Support error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке запросов поддержки.');
  }
});

// Обработчик кнопки "Низкие оценки"
adminBot.action('admin_low_rating', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCbQuery('❌ У вас нет доступа.');
    return;
  }
  
  await ctx.answerCbQuery();
  
  try {
    const reviews = await db.getLowRatingReviews(2);
    
    if (reviews.length === 0) {
      try {
        await ctx.editMessageText('✅ Нет отзывов с низким рейтингом.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
            ],
          },
        });
      } catch (error) {
        await ctx.reply('✅ Нет отзывов с низким рейтингом.');
      }
      return;
    }

    let lowRatingText = `⚠️ **Отзывы, требующие внимания (${reviews.length}):**\n\n`;
    
    reviews.forEach((review, index) => {
      lowRatingText += `⚠️ **Отзыв #${review.id}**\n`;
      lowRatingText += `Оценка: ${'⭐'.repeat(review.rating)} (${review.rating}/5)\n`;
      lowRatingText += `Пользователь: ${review.user_name || 'N/A'} (ID: ${review.telegram_id || 'N/A'})\n`;
      if (review.phone) {
        lowRatingText += `Телефон: ${review.phone}\n`;
      }
      lowRatingText += `Заказ: ${review.order_number || 'N/A'}\n`;
      if (review.text) {
        lowRatingText += `Комментарий: ${review.text}\n`;
      }
      lowRatingText += `Дата: ${new Date(review.created_at).toLocaleString('ru-RU')}\n\n`;
    });

    try {
      await ctx.editMessageText(lowRatingText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
          ],
        },
      });
    } catch (error) {
      await ctx.reply(lowRatingText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
          ],
        },
      });
    }
  } catch (error) {
    console.error('[ADMIN_BOT] Low rating error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке отзывов.');
  }
});

// Обработчик кнопки "Статистика"
adminBot.action('admin_stats', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCbQuery('❌ У вас нет доступа.');
    return;
  }
  
  await ctx.answerCbQuery();
  
  try {
    const allReviews = await db.getAllReviews();
    const allSupportRequests = await db.getAllSupportRequests();
    const lowRatingReviews = await db.getLowRatingReviews(2);
    
    // Подсчитываем среднюю оценку
    const avgRating = allReviews.length > 0
      ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length).toFixed(2)
      : 0;

    // Подсчитываем запросы по типам
    const supportByType = {};
    allSupportRequests.forEach(req => {
      supportByType[req.request_type] = (supportByType[req.request_type] || 0) + 1;
    });

    let statsText = `📊 **Общая статистика DATUM Bot**\n\n`;
    statsText += `📝 **Отзывы:**\n`;
    statsText += `• Всего: ${allReviews.length}\n`;
    statsText += `• Средняя оценка: ${avgRating}/5\n`;
    statsText += `• Низкие оценки (≤2⭐): ${lowRatingReviews.length}\n`;
    statsText += `• Высокие оценки (≥4⭐): ${allReviews.filter(r => r.rating >= 4).length}\n\n`;
    
    statsText += `📞 **Поддержка:**\n`;
    statsText += `• Всего запросов: ${allSupportRequests.length}\n`;
    statsText += `• В ожидании: ${allSupportRequests.filter(r => r.status === 'pending').length}\n`;
    statsText += `• В работе: ${allSupportRequests.filter(r => r.status === 'in_progress').length}\n`;
    statsText += `• Решено: ${allSupportRequests.filter(r => r.status === 'resolved').length}\n\n`;
    
    if (Object.keys(supportByType).length > 0) {
      statsText += `📊 **По типам:**\n`;
      Object.entries(supportByType).forEach(([type, count]) => {
        const emoji = type === 'call' ? '📱' : type === 'chat' ? '💬' : '📧';
        statsText += `${emoji} ${type}: ${count}\n`;
      });
    }

    try {
      await ctx.editMessageText(statsText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
          ],
        },
      });
    } catch (error) {
      await ctx.reply(statsText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
          ],
        },
      });
    }
  } catch (error) {
    console.error('[ADMIN_BOT] Stats error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке статистики.');
  }
});

// Обработчик кнопки "Все отзывы"
adminBot.action('admin_reviews_all', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCbQuery('❌ У вас нет доступа.');
    return;
  }
  
  await ctx.answerCbQuery();
  try {
    const reviews = await db.getAllReviews({ limit: 50 });
    
    if (reviews.length === 0) {
      await ctx.editMessageText('📝 Отзывов пока нет.');
      return;
    }

    // Разбиваем на части, так как сообщение может быть слишком длинным
    const chunkSize = 5;
    for (let i = 0; i < reviews.length; i += chunkSize) {
      const chunk = reviews.slice(i, i + chunkSize);
      let reviewsText = `📝 **Отзывы (${i + 1}-${Math.min(i + chunkSize, reviews.length)} из ${reviews.length}):**\n\n`;
      
      chunk.forEach((review) => {
        const emoji = review.rating >= 4 ? '⭐' : review.rating <= 2 ? '⚠️' : '📝';
        reviewsText += `${emoji} **#${review.id}** ${'⭐'.repeat(review.rating)} (${review.rating}/5)\n`;
        reviewsText += `👤 ${review.user_name || 'N/A'} | 📦 ${review.order_number || 'N/A'}\n`;
        if (review.text) {
          reviewsText += `💬 ${review.text.substring(0, 80)}${review.text.length > 80 ? '...' : ''}\n`;
        }
        reviewsText += `📅 ${new Date(review.created_at).toLocaleDateString('ru-RU')}\n\n`;
      });

      if (i === 0) {
        await ctx.editMessageText(reviewsText, {
          parse_mode: 'Markdown',
          reply_markup: i + chunkSize >= reviews.length ? {
            inline_keyboard: [
              [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
            ],
          } : undefined,
        });
      } else {
        await ctx.reply(reviewsText, {
          parse_mode: 'Markdown',
          reply_markup: i + chunkSize >= reviews.length ? {
            inline_keyboard: [
              [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
            ],
          } : undefined,
        });
      }
    }
  } catch (error) {
    console.error('[ADMIN_BOT] Reviews all error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке отзывов.');
  }
});

adminBot.action('admin_support_all', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCbQuery('❌ У вас нет доступа.');
    return;
  }
  
  await ctx.answerCbQuery();
  try {
    const requests = await db.getAllSupportRequests({ limit: 50 });
    
    if (requests.length === 0) {
      await ctx.editMessageText('📞 Нет запросов поддержки.');
      return;
    }

    // Разбиваем на части
    const chunkSize = 5;
    for (let i = 0; i < requests.length; i += chunkSize) {
      const chunk = requests.slice(i, i + chunkSize);
      let supportText = `📞 **Запросы поддержки (${i + 1}-${Math.min(i + chunkSize, requests.length)} из ${requests.length}):**\n\n`;
      
      chunk.forEach((req) => {
        const typeEmoji = {
          call: '📱',
          chat: '💬',
          email: '📧',
        };
        const emoji = typeEmoji[req.request_type] || '📞';
        const statusEmoji = {
          pending: '⏳',
          in_progress: '🔄',
          resolved: '✅',
        };
        
        supportText += `${emoji} **#${req.id}** [${statusEmoji[req.status] || '📌'} ${req.status}]\n`;
        supportText += `👤 ${req.user_name || 'N/A'} (${req.telegram_id || 'N/A'})\n`;
        if (req.phone || req.user_phone) {
          supportText += `📱 ${req.phone || req.user_phone}\n`;
        }
        if (req.message) {
          supportText += `💬 ${req.message.substring(0, 80)}${req.message.length > 80 ? '...' : ''}\n`;
        }
        supportText += `📅 ${new Date(req.created_at).toLocaleDateString('ru-RU')}\n\n`;
      });

      if (i === 0) {
        await ctx.editMessageText(supportText, {
          parse_mode: 'Markdown',
          reply_markup: i + chunkSize >= requests.length ? {
            inline_keyboard: [
              [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
            ],
          } : undefined,
        });
      } else {
        await ctx.reply(supportText, {
          parse_mode: 'Markdown',
          reply_markup: i + chunkSize >= requests.length ? {
            inline_keyboard: [
              [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
            ],
          } : undefined,
        });
      }
    }
  } catch (error) {
    console.error('[ADMIN_BOT] Support all error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке запросов поддержки.');
  }
});

// Обработчик кнопки "Заказы"
adminBot.action('admin_orders', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCbQuery('❌ У вас нет доступа.');
    return;
  }
  
  await ctx.answerCbQuery();
  
  try {
    const orders = await db.getAllOrders({ limit: 20 });
    
    if (orders.length === 0) {
      try {
        await ctx.editMessageText('📦 Заказов пока нет.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
            ],
          },
        });
      } catch (error) {
        await ctx.reply('📦 Заказов пока нет.');
      }
      return;
    }

    let ordersText = `📦 **Последние ${orders.length} заказов:**\n\n`;
    
    orders.forEach((order, index) => {
      ordersText += `📦 **Заказ #${order.id}**\n`;
      ordersText += `Номер: ${order.order_id}\n`;
      ordersText += `Платформа: ${order.platform}\n`;
      ordersText += `Товар: ${order.product_title || order.product_sku || 'N/A'}\n`;
      ordersText += `Пользователь: ${order.user_name || 'N/A'} (ID: ${order.telegram_id || 'N/A'})\n`;
      if (order.user_phone) {
        ordersText += `Телефон: ${order.user_phone}\n`;
      }
      ordersText += `Статус: ${order.status}\n`;
      ordersText += `Дата: ${new Date(order.created_at).toLocaleString('ru-RU')}\n\n`;
    });

    try {
      await ctx.editMessageText(ordersText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
          ],
        },
      });
    } catch (error) {
      await ctx.reply(ordersText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
          ],
        },
      });
    }
  } catch (error) {
    console.error('[ADMIN_BOT] Orders error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке заказов.');
  }
});

// Обработчик кнопки "Диалоги"
adminBot.action('admin_dialogs', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCbQuery('❌ У вас нет доступа.');
    return;
  }
  
  await ctx.answerCbQuery();
  
  try {
    const dialogs = await db.getAllDialogs({ limit: 20 });
    
    if (dialogs.length === 0) {
      try {
        await ctx.editMessageText('💬 Диалогов пока нет.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
            ],
          },
        });
      } catch (error) {
        await ctx.reply('💬 Диалогов пока нет.');
      }
      return;
    }

    let dialogsText = `💬 **Последние ${dialogs.length} действий:**\n\n`;
    
    dialogs.forEach((dialog, index) => {
      const actionEmoji = {
        'bot_started': '🚀',
        'order_found': '✅',
        'order_not_found': '❌',
        'platform_selected': '📱',
        'contact_shared': '📞',
        'review_submitted': '⭐',
        'support_requested': '📞',
        'text_message': '💬',
        'photo_received': '📷',
      };
      
      const emoji = actionEmoji[dialog.action] || '💬';
      dialogsText += `${emoji} **${dialog.action || 'action'}**\n`;
      dialogsText += `Пользователь: ${dialog.user_name || 'N/A'} (ID: ${dialog.telegram_id || 'N/A'})\n`;
      if (dialog.order_number) {
        dialogsText += `Заказ: ${dialog.order_number}\n`;
      }
      if (dialog.message) {
        dialogsText += `Сообщение: ${dialog.message.substring(0, 80)}${dialog.message.length > 80 ? '...' : ''}\n`;
      }
      dialogsText += `Направление: ${dialog.direction}\n`;
      dialogsText += `Дата: ${new Date(dialog.created_at).toLocaleString('ru-RU')}\n\n`;
    });

    try {
      await ctx.editMessageText(dialogsText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
          ],
        },
      });
    } catch (error) {
      await ctx.reply(dialogsText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Назад в панель', callback_data: 'admin_dashboard' }],
          ],
        },
      });
    }
  } catch (error) {
    console.error('[ADMIN_BOT] Dialogs error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке диалогов.');
  }
});

// Обработка всех текстовых сообщений (для диагностики)
adminBot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  
  console.log('[ADMIN_BOT] Text message received:', {
    userId,
    text,
    isAdmin: isAdmin(userId),
    adminId: config.TELEGRAM_ADMIN_ID,
  });
  
  if (!isAdmin(userId)) {
    await ctx.reply(`❌ У вас нет доступа к админ-панели.\n\nВаш ID: ${userId}\nОжидается ID: ${config.TELEGRAM_ADMIN_ID || 'не настроен'}\n\nПроверьте настройку TELEGRAM_ADMIN_ID в .env файле.`);
    return;
  }
  
  await ctx.reply('Неизвестная команда. Используйте /help для справки.');
});

// Экспорт для использования в основном приложении
module.exports = { adminBot };

