-- 049: недостающие индексы на горячих FK / частых фильтрах (см. docs/audit/08, H4).
--
-- Все индексы — НЕ unique, аддитивны и идемпотентны (CREATE INDEX IF NOT EXISTS),
-- риска падения старта нет. Каждое имя таблицы/колонки сверено со схемой
-- packages/database/src/schema/*.ts; дубли с уже существующими индексами
-- (миграции 003/004/005/013/014/038/042/044 и др.) исключены.
--
-- Цель: убрать seq-scan'ы при cascade-delete (удаление товара/чека/закупки) и в
-- аналитических join'ах. Без покрывающего индекса по FK Postgres сканирует всю
-- дочернюю таблицу при проверке/каскаде на КАЖДУЮ удаляемую родительскую строку.

-- check_items.item_id → inventory(id). Был только индекс по check_id (003).
-- Нужен для join'а «продажи по товару» и для FK-проверки при правке/удалении
-- карточки товара (check_items.item_id RESTRICT). Растёт с числом продаж.
CREATE INDEX IF NOT EXISTS idx_check_items_item ON check_items (item_id);

-- check_item_modifiers.check_item_id → check_items(id) ON DELETE CASCADE.
-- При удалении чека каскад идёт checks → check_items → check_item_modifiers;
-- без индекса каждая удаляемая позиция чека вызывает seq-scan модификаторов.
CREATE INDEX IF NOT EXISTS idx_check_item_modifiers_check_item ON check_item_modifiers (check_item_id);

-- check_item_modifiers.modifier_id → modifiers(id). FK-проверка при удалении
-- модификатора и join «какие модификаторы продавались» — без индекса seq-scan.
CREATE INDEX IF NOT EXISTS idx_check_item_modifiers_modifier ON check_item_modifiers (modifier_id);

-- modifiers.product_id → inventory(id) ON DELETE CASCADE. Удаление товара
-- каскадит в modifiers; без индекса — seq-scan modifiers на каждый удаляемый товар.
CREATE INDEX IF NOT EXISTS idx_modifiers_product ON modifiers (product_id);

-- supply_items.supply_id → supplies(id) ON DELETE CASCADE. Удаление/откат
-- закупки каскадит в supply_items; без индекса — seq-scan на каждую строку.
CREATE INDEX IF NOT EXISTS idx_supply_items_supply ON supply_items (supply_id);

-- supply_items.item_id → inventory(id). FK-проверка при удалении товара и
-- аналитика приёмок по товару (история закупочных цен). Без индекса — seq-scan.
CREATE INDEX IF NOT EXISTS idx_supply_items_item ON supply_items (item_id);

-- notifications.user_id → profiles(id). Лента уведомлений конкретного
-- пользователя (WHERE user_id = ...) — горячий запрос фронта; без индекса seq-scan.
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);

-- transactions.created_by → profiles(id). FK-проверка при удалении пользователя
-- и фильтр «операции, проведённые сотрудником». Были только индексы по player_id
-- и check_id (003/004) — created_by не покрыт.
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions (created_by) WHERE created_by IS NOT NULL;

-- transactions.item_id → inventory(id). FK-проверка при удалении товара и
-- разбор операций по позиции. Не покрыт прежними индексами transactions.
CREATE INDEX IF NOT EXISTS idx_transactions_item ON transactions (item_id) WHERE item_id IS NOT NULL;

-- expenses.event_id → events(id) (миграция 038). P&L по мероприятию: расходы
-- миникапа (приз/обед/иные) выбираются по event_id. Без индекса — seq-scan.
CREATE INDEX IF NOT EXISTS idx_expenses_event ON expenses (event_id) WHERE event_id IS NOT NULL;

-- expenses.created_by → profiles(id). FK-проверка при удалении пользователя и
-- фильтр расходов по автору. Колонка NOT NULL, индекса не было.
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON expenses (created_by);

-- expenses.expense_date (text 'YYYY-MM-DD'). Отчёты расходов всегда фильтруются
-- по периоду (WHERE expense_date BETWEEN ...); без индекса — seq-scan всей таблицы.
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (expense_date);
