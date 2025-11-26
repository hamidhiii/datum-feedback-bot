/**
 * Простой NLP/интент-детектор для понимания запросов пользователей
 */

// Ключевые фразы для определения интентов
const intentPatterns = {
  give_order: [
    /(?:заказ|order|ордер|номер заказа|заказ номер|#|ORD|#\d+)/i,
    /(?:заказал|купил|приобрел|получил)/i,
  ],
  ask_product_info: [
    /(?:информация|инфо|описание|расскажи|что это|что за|характеристики)/i,
    /(?:как использовать|как применять|инструкция)/i,
  ],
  ask_alternatives: [
    /(?:альтернатив|похожий|аналог|похоже|другой вариант|варианты)/i,
    /(?:порекомендуй|что еще|еще что-то)/i,
  ],
  leave_review: [
    /(?:отзыв|рецензия|оценка|оценить|плохо|хорошо|нравится)/i,
    /(?:мнение|отклик)/i,
  ],
  contact_support: [
    /(?:поддержка|помощь|менеджер|связаться|связаться с нами)/i,
    /(?:проблема|не работает|не понравилось|вернуть|рекламация)/i,
    /(?:позвонить|звонок|звонить|перезвонить)/i,
  ],
  share_contact: [
    /(?:контакт|телефон|номер|поделиться контактом)/i,
  ],
  main_menu: [
    /(?:меню|главное меню|назад|начать заново|старт)/i,
  ],
  seasonal: [
    /(?:сезон|сезонный|летний|зимний|осенний|весенний)/i,
  ],
};

/**
 * Определить интент из текста
 * @param {string} text
 * @returns {string|null}
 */
function detectIntent(text) {
  if (!text) return null;

  for (const [intent, patterns] of Object.entries(intentPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return intent;
      }
    }
  }

  return null;
}

/**
 * Извлечь номер заказа из текста
 * @param {string} text
 * @returns {string|null}
 */
function extractOrderNumber(text) {
  if (!text) return null;

  // Паттерны для номеров заказов
  const patterns = [
    /(?:#|№)?\s*(\d{5,})/i, // #1234567 или 1234567
    /(?:ORD|ORDER|ОРДЕР|ОРД)\s*(\d+)/i, // ORD12345
    /(\d{7,})/i, // Просто длинное число
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }

  return null;
}

/**
 * Извлечь телефон из текста
 * @param {string} text
 * @returns {string|null}
 */
function extractPhone(text) {
  if (!text) return null;

  // Паттерны для телефонов (узбекские и международные)
  const patterns = [
    /(?:\+998|998)?\s*(\d{2})\s*(\d{3})\s*(\d{2})\s*(\d{2})/i, // +998 90 123 45 67
    /(\d{9,})/i, // Просто 9+ цифр
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].replace(/\s+/g, '');
    }
  }

  return null;
}

/**
 * Извлечь оценку из текста
 * @param {string} text
 * @returns {number|null}
 */
function extractRating(text) {
  if (!text) return null;

  const match = text.match(/(\d)/);
  if (match) {
    const rating = parseInt(match[1]);
    if (rating >= 1 && rating <= 5) {
      return rating;
    }
  }

  return null;
}

/**
 * Определить сезон из текста
 * @param {string} text
 * @returns {string|null}
 */
function detectSeason(text) {
  if (!text) return null;

  const seasons = {
    summer: /(?:лето|летний|summer)/i,
    'autumn-winter': /(?:зима|зимний|осень|осенний|winter|autumn)/i,
    'all-year': /(?:круглогодичный|всесезонный|all-year)/i,
  };

  for (const [season, pattern] of Object.entries(seasons)) {
    if (pattern.test(text)) {
      return season;
    }
  }

  return null;
}

/**
 * Определить эмоциональную окраску (для эскалации негативных отзывов)
 * @param {string} text
 * @returns {string} - 'positive', 'negative', 'neutral'
 */
function detectSentiment(text) {
  if (!text) return 'neutral';

  const negativeWords = [
    'плохо', 'ужасно', 'не понравилось', 'разочарован', 'не работает',
    'брак', 'плохое качество', 'обман', 'вернуть', 'деньги',
  ];

  const positiveWords = [
    'хорошо', 'отлично', 'нравится', 'доволен', 'рекомендую',
    'качественно', 'супер', 'великолепно',
  ];

  const lowerText = text.toLowerCase();

  for (const word of negativeWords) {
    if (lowerText.includes(word)) {
      return 'negative';
    }
  }

  for (const word of positiveWords) {
    if (lowerText.includes(word)) {
      return 'positive';
    }
  }

  return 'neutral';
}

module.exports = {
  detectIntent,
  extractOrderNumber,
  extractPhone,
  extractRating,
  detectSeason,
  detectSentiment,
};

