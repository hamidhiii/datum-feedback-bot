// Mock данные для тестирования (позже заменим на БД)

// Таблица товаров
const products = {
    'DATUM-EDP-50': {
      id: 'DATUM-EDP-50',
      title: 'BILMIM — Eau de Parfum 50ml',
      description: 'Аромат: древесно-цветочный. Стойкость: 8+ часов. Идеален для вечеров.',
      price: 150000,
      volume: '50ml',
      concentration: 'EDP',
      image: 'https://example.com/bilmim-50.jpg',
      instructions: 'Наносить на пульсирующие точки: запястья, шея, за ушами.',
      season: 'all-year',
      alternatives: ['DATUM-EDT-30', 'DATUM-INTENSE-50'],
    },
    'DATUM-EDT-30': {
      id: 'DATUM-EDT-30',
      title: 'AZIM — Eau de Toilette 30ml',
      description: 'Легкий цветочный аромат. Стойкость: 4-5 часов. Подходит для дня.',
      price: 100000,
      volume: '30ml',
      concentration: 'EDT',
      image: 'https://example.com/azim-30.jpg',
      instructions: 'Можно наносить несколько раз в день.',
      season: 'summer',
      alternatives: ['DATUM-EDP-50', 'DATUM-INTENSE-50'],
    },
    'DATUM-INTENSE-50': {
      id: 'DATUM-INTENSE-50',
      title: 'RAVSHAN — Intense 50ml',
      description: 'Насыщенный древесно-пряный аромат. Стойкость: 10+ часов.',
      price: 180000,
      volume: '50ml',
      concentration: 'Intense', 
      image: 'https://example.com/ravshan-intense.jpg',
      instructions: 'Экономичный расход. Достаточно 2-3 спрея.',
      season: 'autumn-winter',
      alternatives: ['DATUM-EDP-50', 'DATUM-EDT-30'],
    },
  };
  
  // Таблица заказов
  const orders = {
    'ORD12345': {
      id: 'ORD12345',
      platform: 'WOLT',
      productId: 'DATUM-EDP-50',
      customerId: null,
      status: 'delivered',
      createdAt: '2025-11-10T14:30:00Z',
      deliveredAt: '2025-11-13T10:00:00Z',
    },
    'ORD67890': {
      id: 'ORD67890',
      platform: 'UZUM',
      productId: 'DATUM-EDT-30',
      customerId: null,
      status: 'delivered',
      createdAt: '2025-11-08T09:15:00Z',
      deliveredAt: '2025-11-12T16:45:00Z',
    },
    '#1234567': {
      id: '#1234567',
      platform: 'YANDEX',
      productId: 'DATUM-INTENSE-50',
      customerId: null,
      status: 'delivered',
      createdAt: '2025-11-05T11:00:00Z',
      deliveredAt: '2025-11-11T13:20:00Z',
    },
  };
  
  // Таблица клиентов (отзывы, контакты)
  const customers = {};
  
  // Таблица отзывов
  const reviews = {};
  
  // Таблица диалогов (для логирования)
  const dialogs = [];
  
  module.exports = {
    products,
    orders,
    customers,
    reviews,
    dialogs,
  };