# Диагностика проблемы с поиском заказа

## Проблема
Ошибка: "Произошла ошибка при поиске заказа"

## Причина
Не удается подключиться к базе данных PostgreSQL (ECONNREFUSED)

## Решение

### 1. Проверьте, запущен ли PostgreSQL

**Windows:**
```powershell
# Проверьте службу PostgreSQL
Get-Service -Name postgresql*
```

Если служба не запущена:
```powershell
# Запустите службу (замените X на вашу версию)
Start-Service postgresql-x64-XX
```

Или через Services.msc:
1. Нажмите Win+R
2. Введите `services.msc`
3. Найдите службу PostgreSQL
4. Запустите её

**Linux/Mac:**
```bash
# Проверьте статус
sudo systemctl status postgresql
# Или
brew services list | grep postgresql

# Запустите если не запущен
sudo systemctl start postgresql
# Или
brew services start postgresql
```

### 2. Проверьте настройки подключения в .env

Убедитесь, что файл `.env` содержит правильные настройки:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=datum_bot
DB_USER=postgres
DB_PASSWORD=ваш_пароль
```

### 3. Проверьте подключение к PostgreSQL

**Windows (если PostgreSQL установлен):**
```powershell
# Попробуйте подключиться через psql
psql -U postgres -h localhost -p 5432
```

**Или через pgAdmin**

### 4. Создайте базу данных (если её нет)

```sql
-- Подключитесь к PostgreSQL
-- Создайте базу данных
CREATE DATABASE datum_bot;

-- Проверьте
\l
```

### 5. Запустите миграции

После того, как PostgreSQL запущен и база создана:

```bash
node src/db/migrate.js
```

### 6. Проверьте подключение

```bash
node src/db/test-connection.js
```

Этот скрипт покажет:
- Подключение к БД
- Количество заказов
- Список заказов
- Список товаров
- Тест поиска заказов

### 7. Если PostgreSQL не установлен

**Windows:**
1. Скачайте PostgreSQL с https://www.postgresql.org/download/windows/
2. Установите его
3. Запомните пароль пользователя postgres
4. Добавьте этот пароль в .env

**Или используйте Docker:**

```bash
docker run --name datum-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=datum_bot \
  -p 5432:5432 \
  -d postgres:latest
```

### 8. Альтернатива: Используйте SQLite (временно для тестирования)

Если PostgreSQL не получается настроить, можно временно использовать SQLite.
Но для продакшена рекомендуется PostgreSQL.

## После исправления

1. Запустите миграции: `node src/db/migrate.js`
2. Проверьте подключение: `node src/db/test-connection.js`
3. Запустите бота: `npm run dev`
4. Попробуйте найти заказ: введите `ORD12345` или `ORD67890` или `#1234567`

## Тестовые заказы

После выполнения миграций в БД будут следующие заказы:
- `ORD12345` (WOLT) -> BILMIM — Eau de Parfum 50ml
- `ORD67890` (UZUM) -> AZIM — Eau de Toilette 30ml
- `#1234567` (YANDEX) -> RAVSHAN — Intense 50ml

