/**
 * Middleware для управления состоянием пользователя
 */

const userState = {};

/**
 * Установить состояние пользователя
 * @param {number} userId
 * @param {string} state
 * @param {Object} data
 */
function setUserState(userId, state, data = {}) {
  userState[userId] = { state, data, updatedAt: Date.now() };
  console.log(`[STATE] User ${userId}: ${state}`, data);
}

/**
 * Получить состояние пользователя
 * @param {number} userId
 * @returns {Object}
 */
function getUserState(userId) {
  return userState[userId] || { state: 'start', data: {} };
}

/**
 * Очистить состояние пользователя
 * @param {number} userId
 */
function clearUserState(userId) {
  delete userState[userId];
}

/**
 * Middleware для сохранения состояния в контексте
 */
function stateMiddleware(ctx, next) {
  const userId = ctx.from?.id;
  if (userId) {
    ctx.userState = getUserState(userId);
    ctx.setState = (state, data) => setUserState(userId, state, data);
    ctx.clearState = () => clearUserState(userId);
  }
  return next();
}

module.exports = {
  setUserState,
  getUserState,
  clearUserState,
  stateMiddleware,
};

