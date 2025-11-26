/**
 * Обработчик контактов (поделиться номером через Telegram)
 */

const db = require('../db/services');

async function handleContact(ctx, userStateData) {
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
      // Функция showMainMenu должна быть доступна из основного файла
      // Пока просто установим состояние
      if (ctx.setState) {
        ctx.setState('main_menu', userStateData.data);
      }
    }
  } catch (error) {
    console.error('[CONTACT] Error saving contact:', error);
    await ctx.reply('❌ Произошла ошибка при сохранении контакта. Попробуйте позже.');
  }
}

module.exports = { handleContact };

