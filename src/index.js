require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const config = require('./config/env');
const db = require('./db/services');
const notifications = require('./utils/notifications');
const { handleContact } = require('./handlers/contact');
const { handlePhoto } = require('./handlers/photo');
const { stateMiddleware } = require('./middleware/state');

// Инициализация БД (подключение проверяется в connection.js)
require('./db/connection');

const app = express();
app.use(bodyParser.json());
app.use(cookieParser());

// Инициализируем Telegram бот
const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

// Уведомления будут инициализированы после запуска админского бота

// Middleware для управления состоянием
bot.use(stateMiddleware);

// ============ СОСТОЯНИЕ ПОЛЬЗОВАТЕЛЯ ============
// Хранит текущее состояние каждого пользователя
const userState = {};

function setUserState(userId, state, data = {}) {
  userState[userId] = { state, data, updatedAt: Date.now() };
  console.log(`[STATE] User ${userId}: ${state}`, data);
}

function getUserState(userId) {
  return userState[userId] || { state: 'start', data: {} };
}

// ============ КОМАНДЫ ============

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || 'Друг';

  console.log(`[START] User ${userId} started bot`);

  // Создаем или получаем пользователя в БД
  try {
    await db.getOrCreateUser(userId, { name: firstName });
  } catch (error) {
    console.error('[START] Error creating user:', error);
  }

  // Парсим параметры из deep link
  const args = ctx.startPayload;
  if (args) {
    console.log(`[START] Deep link param: ${args}`);
  }

  // Логируем начало диалога
  try {
    await db.logDialog({
      telegram_id: userId,
      action: 'bot_started',
      direction: 'outgoing',
      metadata: { firstName, deep_link: args || null },
    });
  } catch (error) {
    console.error('[START] Error logging dialog:', error);
  }

  const welcomeText = `Привет, ${firstName}! 👋

Спасибо, что выбрали продукцию DATUM. Я — виртуальный помощник бренда.

Чтобы помочь быстрее, скажите, с какой платформы вы приобрели товар?`;

  ctx.setState('platform_selection', {});

  await ctx.reply(welcomeText, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Wolt', callback_data: 'platform_wolt' },
          { text: 'Uzum', callback_data: 'platform_uzum' },
        ],
        [
          { text: 'ЯндексМаркет', callback_data: 'platform_yandex' },
          { text: 'OLX', callback_data: 'platform_olx' },
        ],
        [{ text: 'Другое', callback_data: 'platform_other' }],
      ],
    },
  });
});

bot.help(async (ctx) => {
  const helpText = `📋 Доступные команды:

/start — начать заново
/help — справка
/menu — главное меню`;

  await ctx.reply(helpText);
});

bot.command('menu', async (ctx) => {
  ctx.setState('main_menu', {});
  await showMainMenu(ctx);
});

// ============ CALLBACK QUERIES ============

// Обработка выбора платформы
bot.action(/platform_/, async (ctx) => {
  const userId = ctx.from.id;
  const platform = ctx.match[0].replace('platform_', '').toUpperCase();

  console.log(`[PLATFORM] User ${userId} selected: ${platform}`);

  await ctx.answerCbQuery();

  // Логируем выбор платформы
  try {
    await db.logDialog({
      telegram_id: userId,
      action: 'platform_selected',
      direction: 'incoming',
      metadata: { platform },
    });
  } catch (error) {
    console.error('[PLATFORM] Error logging dialog:', error);
  }

  ctx.setState('order_input', { platform });

  const text = `✅ Вы выбрали платформу: **${platform}**

Введите, пожалуйста, номер заказа или загрузите фото/скрин чека.
Формат номера: **#1234567** или **ORD12345**`;

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📷 Загрузить фото чека', callback_data: 'upload_receipt' }],
      ],
    },
  });
});

// Главное меню
bot.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.setState('main_menu', {});
  await showMainMenu(ctx);
});

// Меню: Информация о товаре
bot.action('menu_info', async (ctx) => {
  const userId = ctx.from.id;
  const userStateData = ctx.userState;

  await ctx.answerCbQuery();

  if (!userStateData.data.orderDetails) {
    await ctx.reply('❌ Заказ не найден. Пожалуйста, начните заново.', {
      reply_markup: {
        inline_keyboard: [[{ text: '🔄 Начать заново', callback_data: 'restart' }]],
      },
    });
    return;
  }

  const { product } = userStateData.data.orderDetails;

  const infoText = `ℹ️ **Информация о товаре**

📦 **${product.title}**
💧 Объём: ${product.volume}
🎯 Концентрация: ${product.concentration}
${product.price ? `💰 Цена: ${product.price} сум` : ''}

**Описание:**
${product.description || 'Нет описания'}

**Инструкция:**
${product.instructions || 'Нет инструкции'}`;

  await ctx.reply(infoText, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '⬅️ Назад в меню', callback_data: 'main_menu' }]],
    },
  });

  try {
    await db.logDialog({
      telegram_id: userId,
      order_id: userStateData.data.orderDetails.order.id,
      action: 'product_info_viewed',
      direction: 'incoming',
      metadata: { product_sku: product.sku },
    });
  } catch (error) {
    console.error('[MENU_INFO] Error logging dialog:', error);
  }
});

// Меню: Альтернативы
bot.action('menu_alternatives', async (ctx) => {
  const userId = ctx.from.id;
  const userStateData = ctx.userState;

  await ctx.answerCbQuery();

  if (!userStateData.data.orderDetails) {
    await ctx.reply('❌ Заказ не найден.');
    return;
  }

  const { product } = userStateData.data.orderDetails;

  try {
    const alternatives = await db.getAlternatives(product.sku);

    if (alternatives.length === 0) {
      await ctx.reply('🔄 Альтернатив нет.', {
        reply_markup: {
          inline_keyboard: [[{ text: '⬅️ Назад в меню', callback_data: 'main_menu' }]],
        },
      });
      return;
    }

    let altText = '🔄 **Похожие товары:**\n\n';
    alternatives.forEach((alt, i) => {
      altText += `${i + 1}. **${alt.title}** (${alt.volume})\n   ${alt.description || ''}\n\n`;
    });

    await ctx.reply(altText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Назад в меню', callback_data: 'main_menu' }]],
      },
    });

    await db.logDialog({
      telegram_id: userId,
      order_id: userStateData.data.orderDetails.order.id,
      action: 'alternatives_viewed',
      direction: 'incoming',
      metadata: { product_sku: product.sku },
    });
  } catch (error) {
    console.error('[MENU_ALTERNATIVES] Error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке альтернатив.');
  }
});

// Меню: Сезонные
bot.action('menu_seasonal', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  // Определяем текущий сезон (упрощенно - можно улучшить)
  const month = new Date().getMonth() + 1;
  let season = 'all-year';
  if (month >= 6 && month <= 8) season = 'summer';
  else if (month >= 12 || month <= 2) season = 'autumn-winter';
  else if (month >= 3 && month <= 5) season = 'summer'; // весна
  else season = 'autumn-winter'; // осень

  try {
    const seasonalProducts = await db.getSeasonalProducts(season);

    if (seasonalProducts.length === 0) {
      await ctx.reply('🌞 Сезонных товаров нет.', {
        reply_markup: {
          inline_keyboard: [[{ text: '⬅️ Назад в меню', callback_data: 'main_menu' }]],
        },
      });
      return;
    }

    let seasonText = '🌞 **Сезонные рекомендации:**\n\n';
    seasonalProducts.forEach((prod, i) => {
      seasonText += `${i + 1}. **${prod.title}** (${prod.volume})\n   ${prod.description || ''}\n\n`;
    });

    await ctx.reply(seasonText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Назад в меню', callback_data: 'main_menu' }]],
      },
    });

    await db.logDialog({
      telegram_id: userId,
      action: 'seasonal_viewed',
      direction: 'incoming',
      metadata: { season },
    });
  } catch (error) {
    console.error('[MENU_SEASONAL] Error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке сезонных товаров.');
  }
});

// Меню: Оставить отзыв
bot.action('menu_review', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  setUserState(userId, 'review_rating');

  await ctx.reply('⭐ Спасибо! Оцените товар по шкале 1–5', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '1⭐', callback_data: 'review_1' },
          { text: '2⭐', callback_data: 'review_2' },
          { text: '3⭐', callback_data: 'review_3' },
          { text: '4⭐', callback_data: 'review_4' },
          { text: '5⭐', callback_data: 'review_5' },
        ],
      ],
    },
  });

  try {
    await db.logDialog({
      telegram_id: userId,
      action: 'review_started',
      direction: 'incoming',
      metadata: {},
    });
  } catch (error) {
    console.error('[REVIEW] Error logging dialog:', error);
  }
});

// Обработка оценки отзыва
bot.action(/review_(\d)/, async (ctx) => {
  const userId = ctx.from.id;
  const rating = parseInt(ctx.match[1]);

  await ctx.answerCbQuery();

  ctx.setState('review_text', { rating });

  await ctx.reply(`📝 Вы выбрали оценку: ${rating}⭐\n\nНапишите, пожалуйста, пару слов (по желанию):`, {
    reply_markup: {
      inline_keyboard: [[{ text: 'Пропустить', callback_data: 'review_skip_text' }]],
    },
  });
});

// Меню: Связаться с нами
bot.action('menu_support', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  ctx.setState('support_selection', {});

  await ctx.reply('📞 Выберите способ связи:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📱 Позвоните мне', callback_data: 'support_call' }],
        [{ text: '💬 Чат с менеджером', callback_data: 'support_chat' }],
        [{ text: '📧 Написать email', callback_data: 'support_email' }],
        [{ text: '⬅️ Назад', callback_data: 'main_menu' }],
      ],
    },
  });

  try {
    await db.logDialog({
      telegram_id: userId,
      action: 'support_requested',
      direction: 'incoming',
      metadata: {},
    });
  } catch (error) {
    console.error('[SUPPORT] Error logging dialog:', error);
  }
});

// Обработка поддержки: звонок
bot.action('support_call', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  ctx.setState('support_call', { request_type: 'call' });

  await ctx.reply(
    '📱 Понял! Чтобы мы могли вам перезвонить, пожалуйста:\n\n1. Поделитесь контактом (кнопка ниже), или\n2. Введите номер телефона в формате +998901234567',
    {
      reply_markup: {
        keyboard: [
          [{ text: '📱 Поделиться контактом', request_contact: true }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
});

// Обработка поддержки: чат
bot.action('support_chat', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  try {
    const user = await db.getOrCreateUser(userId, { name: ctx.from.first_name || null });

    const supportRequest = await db.createSupportRequest({
      user_id: user.id,
      request_type: 'chat',
      message: 'Запрос на чат с менеджером',
    });

    // Уведомляем менеджера
    const requestData = await db.getAllSupportRequests({ limit: 1 }).then((reqs) =>
      reqs.find((r) => r.id === supportRequest.id)
    );
    if (requestData) {
      await notifications.notifySupportRequest(requestData);
    }

    await ctx.reply(
      '💬 Ваш запрос отправлен менеджеру. Он свяжется с вами в ближайшее время.\n\nВы можете вернуться в меню.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '⬅️ Главное меню', callback_data: 'main_menu' }]],
        },
      }
    );
  } catch (error) {
    console.error('[SUPPORT_CHAT] Error:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
});

// Обработка поддержки: email
bot.action('support_email', async (ctx) => {
  await ctx.answerCbQuery();

  ctx.setState('support_email', { request_type: 'email' });

  await ctx.reply(
    '📧 Напишите, пожалуйста, ваше сообщение или вопрос, и мы ответим вам на email:\n\n(Вы можете написать сообщение, и менеджер свяжется с вами)',
    {
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Отмена', callback_data: 'main_menu' }]],
      },
    }
  );
});

// Пропуск текста отзыва
bot.action('review_skip_text', async (ctx) => {
  const userId = ctx.from.id;
  const userStateData = ctx.userState;
  const rating = userStateData.data.rating;

  await ctx.answerCbQuery();

  try {
    const user = await db.getUser(userId);
    const orderId = userStateData.data.orderDetails?.order.id || null;

    const review = await db.saveReview({
      user_id: user ? user.id : null,
      order_id: orderId,
      rating,
      text: null,
    });

    // Уведомляем менеджера
    const reviewData = await db.getAllReviews({ limit: 1 }).then((reviews) =>
      reviews.find((r) => r.id === review.id)
    );
    if (reviewData) {
      await notifications.notifyNewReview(reviewData);
      if (rating <= 2) {
        await notifications.notifyNegativeReview(reviewData);
      }
    }

    const thankYouText = `✅ Спасибо за отзыв!

Ваша оценка: ${rating}⭐

В знак признательности — ваш промокод: **DATUM10** (10% на следующую покупку). Срок действия: 30 дней.`;

    await ctx.reply(thankYouText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Вернуться в меню', callback_data: 'main_menu' }]],
      },
    });

    ctx.setState('main_menu', {});
  } catch (error) {
    console.error('[REVIEW_SKIP] Error:', error);
    await ctx.reply('❌ Произошла ошибка при сохранении отзыва.');
  }
});

// Перезагрузка / начало заново
bot.action('restart', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.clearState();
  ctx.setState('start', {});
  await ctx.reply('🔄 Начинаем заново...', {
    reply_markup: {
      inline_keyboard: [[{ text: '▶️ Начать', callback_data: 'start_again' }]],
    },
  });
});

bot.action('start_again', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  // Триггерим команду start
  ctx.update.message = { text: '/start' };
  await bot.handleUpdate(ctx.update);
});

// Повторный ввод номера заказа
bot.action('retry_order', async (ctx) => {
  const userId = ctx.from.id;
  const userStateData = ctx.userState;
  await ctx.answerCbQuery();

  ctx.setState('order_input', { platform: userStateData.data.platform });

  await ctx.reply('Введите номер заказа заново:', {
    reply_markup: {
      inline_keyboard: [[{ text: '📷 Загрузить фото чека', callback_data: 'upload_receipt' }]],
    },
  });
});

// Загрузка фото чека
bot.action('upload_receipt', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('📷 Пожалуйста, загрузите фото чека или скриншот заказа:', {
    reply_markup: {
      inline_keyboard: [[{ text: '⬅️ Отмена', callback_data: 'retry_order' }]],
    },
  });
});

// ============ ОБРАБОТКА ТЕКСТА ============

// Обработка текстовых сообщений
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  const userStateData = ctx.userState;

  console.log(`[TEXT] User ${userId}, state: ${userStateData.state}, text: ${text}`);

  try {
    // Логируем входящее сообщение
    await db.logDialog({
      telegram_id: userId,
      message: text,
      direction: 'incoming',
      action: 'text_message',
      metadata: { state: userStateData.state },
    });
  } catch (error) {
    console.error('[TEXT] Error logging dialog:', error);
  }

  // Ввод номера заказа
  if (userStateData.state === 'order_input') {
    // Нормализуем номер заказа: удаляем пробелы, приводим к верхнему регистру
    // Но сохраняем символ #, если он есть
    let orderNumber = text.trim();
    // Если номер начинается с #, сохраняем его
    if (orderNumber.startsWith('#')) {
      orderNumber = '#' + orderNumber.substring(1).toUpperCase().trim();
    } else {
      orderNumber = orderNumber.toUpperCase().trim();
    }

    console.log(`[ORDER_SEARCH] User ${userId} looking for order: "${orderNumber}"`);

    try {
      console.log(`[ORDER_SEARCH] Calling db.getOrderDetails("${orderNumber}")`);
      const orderDetails = await db.getOrderDetails(orderNumber);
      console.log(`[ORDER_SEARCH] Result:`, orderDetails ? 'Found' : 'Not found');

      if (orderDetails) {
        const { order, product } = orderDetails;

        // Обновляем заказ, связывая с пользователем
        const user = await db.getUser(userId);
        if (user && !order.user_id) {
          // Можно обновить user_id в заказе, если нужно
        }

        await db.logDialog({
          telegram_id: userId,
          order_id: order.id,
          action: 'order_found',
          direction: 'outgoing',
          metadata: { order_number: orderNumber, product_sku: product.sku },
        });

        // Уведомляем админа о найденном заказе
        try {
          await notifications.notifyOrderFound({
            order,
            product,
            user,
          });
        } catch (error) {
          console.error('[ORDER_FOUND] Error notifying admin:', error);
        }

        ctx.setState('order_found', { orderDetails, platform: userStateData.data.platform });

        // Предлагаем сохранить контакт
        const confirmText = `✅ Спасибо — нашёл ваш заказ!

📦 **Товар:** ${product.title}
📅 **Дата покупки:** ${new Date(order.created_at).toLocaleDateString('ru-RU')}
💧 **Объём:** ${product.volume}
🎯 **Концентрация:** ${product.concentration}

Могу сохранить ваш контакт, чтобы менеджер мог с вами связаться (для быстрой поддержки или бонусов).`;

        await ctx.reply(confirmText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📱 Поделиться контактом', callback_data: 'share_contact' }],
              [{ text: 'Пропустить', callback_data: 'skip_contact' }],
            ],
          },
        });
      } else {
        await db.logDialog({
          telegram_id: userId,
          action: 'order_not_found',
          direction: 'outgoing',
          metadata: { order_number: orderNumber },
        });

        const notFoundText = `❌ Не получилось найти заказ по номеру **${orderNumber}**.

Проверьте, пожалуйста, номер или попробуйте ещё раз.`;

        await ctx.reply(notFoundText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Ввести номер заново', callback_data: 'retry_order' }],
              [{ text: 'Выбрать товар вручную', callback_data: 'manual_product' }],
            ],
          },
        });
      }
    } catch (error) {
      console.error('[ORDER_SEARCH] Error details:');
      console.error('  Error message:', error.message);
      console.error('  Error stack:', error.stack);
      console.error('  Order number searched:', orderNumber);
      console.error('  User ID:', userId);
      
      // Более информативное сообщение об ошибке
      let errorMessage = '❌ Произошла ошибка при поиске заказа.';
      if (error.message.includes('connect')) {
        errorMessage += '\n\nПроблема с подключением к базе данных. Проверьте настройки БД.';
      } else if (error.message.includes('relation') || error.message.includes('table')) {
        errorMessage += '\n\nТаблица не найдена. Возможно, миграции не выполнены.';
      }
      errorMessage += '\n\nПопробуйте позже или обратитесь в поддержку.';
      
      await ctx.reply(errorMessage, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Ввести номер заново', callback_data: 'retry_order' }],
          ],
        },
      });
    }
  }
  // Текст отзыва
  else if (userStateData.state === 'review_text') {
    const rating = userStateData.data.rating;
    const reviewText = text;

    try {
      const user = await db.getUser(userId);
      const orderId = userStateData.data.orderDetails?.order.id || null;

      const review = await db.saveReview({
        user_id: user ? user.id : null,
        order_id: orderId,
        rating,
        text: reviewText,
      });

      // Уведомляем менеджера
      const reviewData = await db.getAllReviews({ limit: 1 }).then((reviews) =>
        reviews.find((r) => r.id === review.id)
      );
      if (reviewData) {
        await notifications.notifyNewReview(reviewData);
        if (rating <= 2) {
          await notifications.notifyNegativeReview(reviewData);
        }
      }

      await db.logDialog({
        telegram_id: userId,
        order_id: orderId,
        action: 'review_submitted',
        direction: 'incoming',
        metadata: { rating, text: reviewText },
      });

      const thankYouText = `✅ Спасибо за отзыв!

Ваша оценка: ${rating}⭐
Комментарий: "${reviewText}"

В знак признательности — ваш промокод: **DATUM10** (10% на следующую покупку). Срок действия: 30 дней.`;

      await ctx.reply(thankYouText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '⬅️ Вернуться в меню', callback_data: 'main_menu' }]],
        },
      });

      ctx.setState('main_menu', {});
    } catch (error) {
      console.error('[REVIEW] Error:', error);
      await ctx.reply('❌ Произошла ошибка при сохранении отзыва.');
    }
  }
  // Запрос поддержки: звонок (номер телефона)
  else if (userStateData.state === 'support_call') {
    const phone = text.trim();

    try {
      const user = await db.getUser(userId);
      const supportRequest = await db.createSupportRequest({
        user_id: user ? user.id : null,
        request_type: 'call',
        phone,
      });

      // Уведомляем менеджера
      const requestData = await db.getAllSupportRequests({ limit: 1 }).then((reqs) =>
        reqs.find((r) => r.id === supportRequest.id)
      );
      if (requestData) {
        await notifications.notifySupportRequest(requestData);
      }

      await ctx.reply(
        '✅ Ваш запрос на обратный звонок отправлен менеджеру. Он свяжется с вами в ближайшее время.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Главное меню', callback_data: 'main_menu' }]],
          },
        }
      );

      ctx.setState('main_menu', {});
    } catch (error) {
      console.error('[SUPPORT_CALL] Error:', error);
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }
  // Запрос поддержки: email (сообщение)
  else if (userStateData.state === 'support_email') {
    try {
      const user = await db.getUser(userId);
      const supportRequest = await db.createSupportRequest({
        user_id: user ? user.id : null,
        request_type: 'email',
        message: text,
      });

      // Уведомляем менеджера
      const requestData = await db.getAllSupportRequests({ limit: 1 }).then((reqs) =>
        reqs.find((r) => r.id === supportRequest.id)
      );
      if (requestData) {
        await notifications.notifySupportRequest(requestData);
      }

      await ctx.reply('✅ Ваше сообщение отправлено менеджеру. Он свяжется с вами в ближайшее время.', {
        reply_markup: {
          inline_keyboard: [[{ text: '⬅️ Главное меню', callback_data: 'main_menu' }]],
        },
      });

      ctx.setState('main_menu', {});
    } catch (error) {
      console.error('[SUPPORT_EMAIL] Error:', error);
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }
  // Неизвестное состояние
  else {
    await ctx.reply('Простите, я не понял(а). Выберите пункт меню или попробуйте ещё раз.', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Главное меню', callback_data: 'main_menu' }]],
      },
    });
  }
});

// Обработка контактов
bot.on('contact', async (ctx) => {
  const userId = ctx.from.id;
  const contact = ctx.message.contact;

  if (!contact) {
    await ctx.reply('❌ Не удалось получить контакт. Попробуйте еще раз.');
    return;
  }

  const phone = contact.phone_number;
  const name = contact.first_name || ctx.from.first_name || null;

  // Сохраняем контакт в БД
  try {
    await db.getOrCreateUser(userId, {
      name,
      phone: phone.startsWith('+') ? phone : `+${phone}`,
    });

    await db.logDialog({
      telegram_id: userId,
      action: 'contact_shared',
      direction: 'incoming',
      metadata: { phone, name },
    });

    // Если есть запрос на поддержку (звонок)
    const userStateData = ctx.userState;
    if (userStateData.state === 'support_call') {
      // Создаем запрос поддержки
      const user = await db.getUser(userId);
      const supportRequest = await db.createSupportRequest({
        user_id: user ? user.id : null,
        request_type: 'call',
        phone: phone.startsWith('+') ? phone : `+${phone}`,
      });

      // Уведомляем менеджера
      const requestData = await db.getAllSupportRequests({ limit: 1 }).then((reqs) =>
        reqs.find((r) => r.id === supportRequest.id)
      );
      if (requestData) {
        await notifications.notifySupportRequest(requestData);
      }

      await ctx.reply(
        '✅ Ваш контакт сохранён и запрос на обратный звонок отправлен менеджеру. Он свяжется с вами в ближайшее время.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Главное меню', callback_data: 'main_menu' }]],
          },
        }
      );
      ctx.setState('main_menu', {});
    } else {
      // Просто сохранение контакта
      await ctx.reply(
        `✅ Спасибо! Ваш контакт сохранён.\n\nТеперь менеджер сможет с вами связаться для поддержки или бонусов.`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Главное меню', callback_data: 'main_menu' }]],
          },
        }
      );
      
      // Если у нас есть заказ, показываем главное меню
      if (userStateData.data?.orderDetails) {
        await showMainMenu(ctx);
        ctx.setState('main_menu', userStateData.data);
      } else {
        ctx.setState('main_menu', {});
      }
    }
  } catch (error) {
    console.error('[CONTACT] Error saving contact:', error);
    await ctx.reply('❌ Произошла ошибка при сохранении контакта. Попробуйте позже.');
  }
});

// Обработка фото
bot.on('photo', async (ctx) => {
  await handlePhoto(ctx, ctx.userState);
});

// Обработка callback: поделиться контактом
bot.action('share_contact', async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply('Поделитесь контактом, пожалуйста:', {
    reply_markup: {
      keyboard: [[{ text: '📱 Поделиться контактом', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
});

// Пропустить сохранение контакта
bot.action('skip_contact', async (ctx) => {
  await ctx.answerCbQuery();

  await showMainMenu(ctx);
  ctx.setState('main_menu', ctx.userState.data);
});

// ============ ГЛАВНОЕ МЕНЮ ============

async function showMainMenu(ctx) {
  const text = `Что хотите сделать дальше?`;

  await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'ℹ️ Инфо о товаре', callback_data: 'menu_info' }],
        [{ text: '🔄 Альтернативы', callback_data: 'menu_alternatives' }],
        [{ text: '🌞 Сезонные', callback_data: 'menu_seasonal' }],
        [{ text: '⭐ Оставить отзыв', callback_data: 'menu_review' }],
        [{ text: '📞 Связаться с нами', callback_data: 'menu_support' }],
      ],
    },
  });
}

// ============ WEBHOOK ============

app.post(config.WEBHOOK_PATH, (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

// ============ АДМИН-ПАНЕЛЬ (отключена, используется админский бот) ============
// Веб-админка отключена, так как используется отдельный админский бот
// Раскомментируйте, если нужна веб-версия для отладки:
// const adminRouter = require('./admin');
// app.use('/admin', adminRouter);

// ============ HEALTH CHECK ============

app.get('/health', async (req, res) => {
  try {
    // Проверяем подключение к БД
    const pool = require('./db/connection');
    await pool.query('SELECT 1');
    
    res.json({
      status: 'OK',
      bot: bot.botInfo?.username || 'unknown',
      database: 'connected',
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      bot: bot.botInfo?.username || 'unknown',
      database: 'disconnected',
      error: error.message,
    });
  }
});

// ============ ЗАПУСК ============

async function start() {
  try {
    // Запускаем миграции БД
    const { runMigrations } = require('./db/migrate');
    await runMigrations();
    console.log('✅ Database migrations completed');
  } catch (error) {
    console.error('⚠️ Database migration error (continuing anyway):', error.message);
  }

  const PORT = config.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`✅ Server started on port ${PORT}`);
    console.log(`🤖 User Bot username: @${config.TELEGRAM_BOT_USERNAME || 'not configured'}`);
    console.log(`👨‍💼 Admin Bot username: @${config.TELEGRAM_ADMIN_BOT_USERNAME || 'not configured'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  });

  // Запускаем админский бот ПЕРВЫМ (до user bot, чтобы он был готов получать уведомления)
  console.log('[STARTUP] Checking admin bot configuration...');
  console.log(`[STARTUP] TELEGRAM_ADMIN_BOT_TOKEN: ${config.TELEGRAM_ADMIN_BOT_TOKEN ? 'SET' : 'NOT SET'}`);
  console.log(`[STARTUP] TELEGRAM_ADMIN_ID: ${config.TELEGRAM_ADMIN_ID || 'NOT SET'}`);
  
  if (config.TELEGRAM_ADMIN_BOT_TOKEN) {
    console.log('[STARTUP] Admin bot token found, attempting to start...');
    try {
      const { adminBot } = require('./admin-bot');
      console.log('[STARTUP] Admin bot module loaded successfully');
      
      // Инициализируем уведомления с админским ботом
      notifications.init(adminBot);
      console.log('[STARTUP] Notifications initialized with admin bot');
      
      // Обработка ошибок админ-бота
      adminBot.catch((err, ctx) => {
        console.error('[ADMIN_BOT] Error:', err);
        console.error('[ADMIN_BOT] Context:', ctx);
      });
      
      if (config.WEBHOOK_URL) {
        // Webhook mode для админского бота
        console.log('📡 Setting up admin bot webhook...');
        await adminBot.telegram.setWebhook(`${config.WEBHOOK_URL}${config.ADMIN_WEBHOOK_PATH}`);
        console.log('✅ Admin bot webhook configured');
      } else {
        // Polling mode для админского бота
        console.log('📡 Starting admin bot in polling mode...');
        console.log(`[ADMIN_BOT] Admin ID configured: ${config.TELEGRAM_ADMIN_ID || 'NOT SET'}`);
        console.log(`[ADMIN_BOT] Admin bot token: ${config.TELEGRAM_ADMIN_BOT_TOKEN ? 'SET' : 'NOT SET'}`);
        
        try {
          // Сначала удаляем webhook, если был установлен
          try {
            await adminBot.telegram.deleteWebhook({ drop_pending_updates: true });
            console.log('[ADMIN_BOT] Webhook cleared');
          } catch (error) {
            console.log('[ADMIN_BOT] Could not clear webhook (may not be set)');
          }
          
          // Получаем информацию о боте для проверки
          const botInfo = await adminBot.telegram.getMe();
          console.log(`[ADMIN_BOT] Bot info: @${botInfo.username} (${botInfo.first_name})`);
          
          await adminBot.launch({
            allowedUpdates: ['message', 'callback_query'],
          });
          console.log('🚀 Admin bot is running and ready to receive updates');
        } catch (error) {
          console.error('[ADMIN_BOT] Failed to launch:', error);
          console.error('[ADMIN_BOT] Error details:', error.message);
          console.error('[ADMIN_BOT] Error stack:', error.stack);
          throw error;
        }
      }
    } catch (error) {
      console.error('❌ Failed to start admin bot:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error stack:', error.stack);
    }
  } else {
    console.log('⚠️ Admin bot token not configured. Admin bot will not start.');
    console.log('⚠️ Please set TELEGRAM_ADMIN_BOT_TOKEN in .env file');
  }

  // Запускаем основной бот (для пользователей) ПОСЛЕ админ-бота
  if (config.TELEGRAM_BOT_TOKEN && (config.NODE_ENV === 'development' || config.NODE_ENV === 'production')) {
    if (config.WEBHOOK_URL) {
      // Webhook mode
      console.log('📡 Setting up user bot webhook...');
      await bot.telegram.setWebhook(`${config.WEBHOOK_URL}${config.WEBHOOK_PATH}`);
      console.log('✅ User bot webhook configured');
    } else {
      // Polling mode - сначала удаляем webhook, если был установлен
      try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        console.log('✅ User bot webhook cleared');
      } catch (error) {
        console.log('⚠️ Could not clear user bot webhook (may not be set)');
      }
      console.log('📡 Starting user bot in polling mode...');
      await bot.launch({
        allowedUpdates: ['message', 'callback_query'],
      });
      console.log('🚀 User bot is running');
    }
  }
}

// Webhook для админского бота
app.post(config.ADMIN_WEBHOOK_PATH, (req, res) => {
  const { adminBot } = require('./admin-bot');
  adminBot.handleUpdate(req.body);
  res.sendStatus(200);
});

// Graceful shutdown
process.once('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  try {
    bot.stop('SIGINT');
    if (config.TELEGRAM_ADMIN_BOT_TOKEN) {
      const { adminBot } = require('./admin-bot');
      adminBot.stop('SIGINT');
    }
  } catch (error) {
    console.error('Error stopping bots:', error);
  }
  process.exit(0);
});

process.once('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  try {
    bot.stop('SIGTERM');
    if (config.TELEGRAM_ADMIN_BOT_TOKEN) {
      const { adminBot } = require('./admin-bot');
      adminBot.stop('SIGTERM');
    }
  } catch (error) {
    console.error('Error stopping bots:', error);
  }
  process.exit(0);
});

// Запуск приложения
start().catch((error) => {
  console.error('❌ Failed to start:', error);
  process.exit(1);
});