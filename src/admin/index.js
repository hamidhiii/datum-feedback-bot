/**
 * Простая админ-панель для просмотра отзывов и обращений
 */

const express = require('express');
const db = require('../db/services');
const config = require('../config/env');

const router = express.Router();

// Простая авторизация (в продакшене использовать настоящую)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// Страница логина
router.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>DATUM Bot Admin - Login</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
        input { width: 100%; padding: 10px; margin: 10px 0; }
        button { width: 100%; padding: 10px; background: #0088cc; color: white; border: none; cursor: pointer; }
        button:hover { background: #006699; }
      </style>
    </head>
    <body>
      <h2>DATUM Bot Admin</h2>
      <form method="post" action="/admin/login">
        <input type="password" name="password" placeholder="Пароль" required>
        <button type="submit">Войти</button>
      </form>
    </body>
    </html>
  `);
});

router.post('/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    res.cookie('admin_auth', 'true', { httpOnly: true, maxAge: 86400000 }); // 24 часа
    res.redirect('/admin');
  } else {
    res.redirect('/admin/login?error=1');
  }
});

// Middleware для проверки авторизации (упрощенная версия)
function checkAuth(req, res, next) {
  if (req.cookies?.admin_auth === 'true' || req.query.token === ADMIN_PASSWORD) {
    return next();
  }
  res.redirect('/admin/login');
}

// Главная страница админки
router.get('/', checkAuth, async (req, res) => {
  try {
    const reviews = await db.getAllReviews({ limit: 50 });
    const supportRequests = await db.getAllSupportRequests({ limit: 50, status: 'pending' });
    const lowRatingReviews = await db.getLowRatingReviews(2);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>DATUM Bot Admin</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; }
          .header { background: #0088cc; color: white; padding: 20px; }
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
          .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
          .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .stat-number { font-size: 32px; font-weight: bold; color: #0088cc; }
          .stat-label { color: #666; margin-top: 5px; }
          .section { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 20px 0; }
          .section h2 { margin-bottom: 15px; color: #333; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f8f8f8; font-weight: 600; }
          .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
          .badge-success { background: #28a745; color: white; }
          .badge-warning { background: #ffc107; color: black; }
          .badge-danger { background: #dc3545; color: white; }
          .badge-info { background: #17a2b8; color: white; }
          .rating { color: #ffc107; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🤖 DATUM Bot Admin Panel</h1>
        </div>
        <div class="container">
          <div class="stats">
            <div class="stat-card">
              <div class="stat-number">${reviews.length}</div>
              <div class="stat-label">Всего отзывов</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${supportRequests.length}</div>
              <div class="stat-label">Активных запросов</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${lowRatingReviews.length}</div>
              <div class="stat-label">Требуют внимания</div>
            </div>
          </div>

          <div class="section">
            <h2>📝 Последние отзывы</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Оценка</th>
                  <th>Пользователь</th>
                  <th>Заказ</th>
                  <th>Комментарий</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                ${reviews.slice(0, 20).map(review => `
                  <tr>
                    <td>#${review.id}</td>
                    <td><span class="rating">${'⭐'.repeat(review.rating)}</span> ${review.rating}/5</td>
                    <td>${review.user_name || 'N/A'} (${review.telegram_id || 'N/A'})</td>
                    <td>${review.order_number || 'N/A'}</td>
                    <td>${review.text || '-'}</td>
                    <td>${new Date(review.created_at).toLocaleString('ru-RU')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>📞 Запросы поддержки (pending)</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Тип</th>
                  <th>Пользователь</th>
                  <th>Телефон</th>
                  <th>Сообщение</th>
                  <th>Статус</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                ${supportRequests.map(req => `
                  <tr>
                    <td>#${req.id}</td>
                    <td><span class="badge badge-info">${req.request_type}</span></td>
                    <td>${req.user_name || 'N/A'} (${req.telegram_id || 'N/A'})</td>
                    <td>${req.phone || req.user_phone || '-'}</td>
                    <td>${req.message || '-'}</td>
                    <td><span class="badge badge-warning">${req.status}</span></td>
                    <td>${new Date(req.created_at).toLocaleString('ru-RU')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>⚠️ Отзывы, требующие внимания (≤2⭐)</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Оценка</th>
                  <th>Пользователь</th>
                  <th>Телефон</th>
                  <th>Комментарий</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                ${lowRatingReviews.map(review => `
                  <tr>
                    <td>#${review.id}</td>
                    <td><span class="rating">${'⭐'.repeat(review.rating)}</span> ${review.rating}/5</td>
                    <td>${review.user_name || 'N/A'} (${review.telegram_id || 'N/A'})</td>
                    <td>${review.phone || '-'}</td>
                    <td>${review.text || '-'}</td>
                    <td>${new Date(review.created_at).toLocaleString('ru-RU')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('[ADMIN] Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// API endpoint для получения отзывов (JSON)
router.get('/api/reviews', checkAuth, async (req, res) => {
  try {
    const reviews = await db.getAllReviews({ limit: parseInt(req.query.limit) || 50 });
    res.json(reviews);
  } catch (error) {
    console.error('[ADMIN] Error fetching reviews:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API endpoint для получения запросов поддержки
router.get('/api/support', checkAuth, async (req, res) => {
  try {
    const requests = await db.getAllSupportRequests({
      limit: parseInt(req.query.limit) || 50,
      status: req.query.status,
    });
    res.json(requests);
  } catch (error) {
    console.error('[ADMIN] Error fetching support requests:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;

