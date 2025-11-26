/**
 * Обработчик фото (чек, скриншот заказа)
 */

const db = require('../db/services');

async function handlePhoto(ctx, userStateData) {
  const userId = ctx.from.id;
  const photo = ctx.message.photo;

  if (!photo || photo.length === 0) {
    await ctx.reply('❌ Не удалось получить фото. Попробуйте еще раз.');
    return;
  }

  // Берем самое большое фото
  const largestPhoto = photo[photo.length - 1];
  const fileId = largestPhoto.file_id;

  try {
    await db.logDialog({
      telegram_id: userId,
      action: 'photo_received',
      direction: 'incoming',
      metadata: { file_id: fileId, type: 'receipt' },
    });

    // Пока без OCR - просто сохраняем информацию о фото
    await ctx.reply(
      `📷 Спасибо! Фото получено.\n\nВ данный момент автоматическое распознавание чека недоступно. Пожалуйста, введите номер заказа вручную или выберите товар вручную.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Ввести номер заново', callback_data: 'retry_order' }],
            [{ text: 'Выбрать товар вручную', callback_data: 'manual_product' }],
          ],
        },
      }
    );
  } catch (error) {
    console.error('[PHOTO] Error logging photo:', error);
    await ctx.reply('❌ Произошла ошибка при обработке фото. Попробуйте позже.');
  }
}

module.exports = { handlePhoto };

