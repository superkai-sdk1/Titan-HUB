# Аудит: DevOps & Инфраструктура (2026-06-18)

Базовые отчёты: `docs/audit/09-api-infra.md` и `docs/audit/15-production-devops.md` (12 июня).
С 12 июня закрыт целый ряд находок — ниже отмечено, что исправлено, и что осталось/появилось нового
в связи с переходом на модель database-per-club.

## Оценка готовности к эксплуатации: 64/100

**Что улучшилось с 12 июня (было 58):**
- H1 (ротация логов) — **закрыто**: `x-logging` anchor `max-size:10m max-file:3` на всех сервисах (`docker-compose.yml:3-7`).
- `mem_limit` на каждом контейнере (хост 4 ГБ защищён от OOM одного сервиса).
- C1 из 09-api-infra (graceful shutdown) — **закрыто**: `setupGracefulShutdown` с дренажом, force-таймаут 8с, закрытие пулов (`apps/api/src/index.ts:44-74`).
- H4 (root в API/web) — **частично**: web/wallet `USER nextjs`, bot-admin/bot-wallet `USER node`. **API по-прежнему root** (нужны pg_dump/rclone + запись в `/backups`).
- Мультитенант: nginx разнесён на 3 контура (основной / `admin.` / `*.titanpos.ru` wildcard), Host пробрасывается в api для tenantContext, отдельные сертификаты.
- Бэкап расширен на control-БД и все `club_*` БД (`scripts/backup-db.sh:50-76`), best-effort.

**Что тянет оценку вниз (детали ниже):** restore так и остался не транзакционным и без maintenance-режима (C3 не закрыта); **новые миграции 050+ не применяются к БД клубов** (схемный дрейф — новый P0 для SaaS); нет observability/алертинга; `.env.example` всё ещё рассинхронизирован и вводит в заблуждение; деплой собирает образы на проде и ставит pnpm на хост; нет CI; bucket MinIO публичен; бюджет Postgres-соединений не просчитан под рост клубов.

---

## Находки по severity

### [P0] Новые миграции (050+) НЕ применяются к БД клубов — схемный дрейф под SaaS
- **Файл:** `apps/api/src/migrations/runner.ts:22` (`runMigrations()` без аргумента БД) + единственный вызов `apps/api/src/index.ts:32`; провижининг `apps/api/src/modules/superadmin/provisioning.ts:240-259`; ложное обещание в `apps/api/src/provisioning/README.md:30`.
- **Суть:** `runMigrations()` работает ТОЛЬКО на синглтоне `db` (дефолтный `DATABASE_URL`). Нет ни одного места, где раннер итерирует по `getCronTargets()`/`getClubDb()` (grep подтверждает: единственный call site — `index.ts:32`). При провижининге `club_<slug>` создаётся из `baseline.sql` и все текущие файлы помечаются applied. README (стр. 30) утверждает «Будущие миграции (050+) применяются раннером штатно — и на этом клубе, и на всех» — **это неверно, кода нет**.
- **Риск:** после первого же нового релиза с миграцией БД основного клуба (`titan_hub`) уходит вперёд, а все `club_*` остаются на схеме baseline. Поддомены арендаторов начинают падать на отсутствующих колонках/таблицах (500 на эндпоинтах, использующих новую схему). Это тихий, отложенный, тотальный отказ всех платящих клубов после ближайшего деплоя со схемными изменениями.
- **Исправление:** на старте API после `runMigrations()` пройтись по `getCronTargets()` (или `listActiveClubDbNames()`) и применить раннер к каждой клуб-БД — раннер должен принимать `Database`-инстанс параметром (`runMigrations(target.db)`), а не импортировать синглтон. Обернуть прогон каждой БД в `pg_advisory_lock`. Привести README в соответствие с кодом.

### [P0] Restore БД не транзакционен, не блокирует приём денег, без maintenance-режима
- **Файл:** `apps/api/src/lib/backup.ts:112-117` (`restoreFromPath`): `pg_terminate_backend` по всем коннектам + `psql -v ON_ERROR_STOP=0` для самого restore; хендлеры `apps/api/src/modules/system/system.router.ts:173-201` (`/restore`, `/restore-upload`) — синхронно в request-хендлере, без mutex и без перевода API в read-only.
- **Суть:** C3 из 15-production-devops **не закрыта**. `ON_ERROR_STOP=0` → при ошибке посреди дампа psql продолжает, БД остаётся частично восстановленной без падения. Параллельно POS может пробивать оплаты в полу-восстановленную базу; два restore/backup могут затоптать друг друга (нет Redis-lock).
- **Риск:** owner жмёт «Восстановить» в проде → возможна тихая порча финансовых данных + обрыв активной смены/оплаты на середине транзакции. В мультитенанте restore основной БД роняет коннекты всех (terminate по `current_database()` — только своей БД, но пул API общий с cron по всем клубам).
- **Исправление:** `gunzip -c file | psql -v ON_ERROR_STOP=1 --single-transaction` (атомарно либо целиком, либо откат). На время restore — maintenance-флаг в Redis, middleware отбивает мутации 503. Redis-lock (`SET NX PX`) общий на backup+restore. Выполнять как фоновую задачу со статусом, а не держать HTTP-соединение.

### [P1] Бюджет Postgres-соединений не просчитан под database-per-club
- **Файл:** `packages/database/src/client.ts:12` (`max:10` дефолтный пул), `:49` (`max:5` на каждый клуб-пул), `packages/database/src/control/client.ts:35` (`max:5` control); Postgres без тюнинга (`docker-compose.yml:10-29` — нет `command`/`max_connections`, дефолт = 100).
- **Суть:** один процесс API держит: 10 (дефолт) + 5 (control) + 5×N (по пулу на активный клуб, создаются лениво в `getClubDb`). Пулы клубов не закрываются по TTL — живут до shutdown. При 16+ клубах с трафиком: 10+5+5×16 = 95 → упор в дефолтный `max_connections=100` Postgres. Плюс cron `runForAllClubs` каждую минуту (polls, fiscalize) трогает все клуб-пулы, удерживая их «тёплыми».
- **Риск:** при росте до ~15-16 активных клубов API начнёт получать `too many connections`, рандомные 500 по всем тенантам. Потолок наступит раньше, если bot-admin/bot-wallet тоже подключаются к клуб-БД.
- **Исправление:** поднять `max_connections` Postgres (`command: postgres -c max_connections=200`) с поправкой на `mem_limit:768m` (каждый коннект ~5-10 МБ), либо ввести PgBouncer (transaction-pooling) перед Postgres — единственный устойчивый путь для модели «БД-на-клуб». Снизить `max` клуб-пула до 2-3 и добавить idle-eviction самих пулов (закрывать пул клуба, не обслуживавшегося N минут).

### [P1] Нет observability / алертинга — инцидент у клуба узнаёте постфактум
- **Файл:** весь API — логирование `console.*` (`apps/api/src/app.ts`, `index.ts`, cron); grep `sentry|otel|prometheus|/metrics` = ноль. `/health` тривиален (`{ok:true}` безусловно — H4 из 09-api-infra не закрыта), хотя Docker-healthcheck бьёт именно в него.
- **Суть:** нет error-tracking, нет structured-логов с `clubId`/`userId`/`requestId`, нет метрик, нет алертов. Health false-healthy: процесс жив при мёртвом PG/Redis → nginx льёт трафик, оркестратор не рестартует.
- **Риск:** в SaaS невозможно ответить «у клуба X не приходят уведомления / падают оплаты»; обратная связь — звонок разозлённого владельца. Провал миграции/бэкапа/webhook Platega уходит в stdout, который никто не читает.
- **Исправление:** Sentry (`@sentry/node`) на `onError`+`unhandledRejection` с DSN из env; `pino` (JSON, requestId, clubId); `/health/ready` с `SELECT 1`+Redis PING (liveness — отдельно). Алерты в существующий bot-admin: провал миграции/бэкапа, всплеск 5xx, `AMOUNT_MISMATCH`, диск >85%.

### [P1] Деплой собирает образы на проде + ставит pnpm на хост — CPU-пик и SSH-разрывы
- **Файл:** `scripts/deploy.sh:16-17` (`npm i -g pnpm@11` + `pnpm install --frozen-lockfile` на ХОСТЕ), `:29` (`docker compose build` на проде); нет `.github/workflows/`.
- **Суть:** host-toolchain рантайму не нужен (всё в Docker), но ставится каждый деплой — лишний сетевой/CPU-шаг. Главное — образы собираются на самом VPS (3 параллельные Next.js-сборки), что и есть корень «SSH рвётся под сборкой» и роста build-кэша до десятков ГБ (известный инцидент переполнения диска 45G).
- **Риск:** каждый деплой = пик нагрузки и риск обрыва; нет lint/type-check/test перед проливкой — любой компилящийся локально, но падающий в проде коммит доедет до клиентов (`git reset --hard origin/main`, `:13`).
- **Исправление:** GitHub Actions: на PR — `pnpm lint && type-check && build`; на merge — сборка образов в CI → GHCR; на VPS только `docker compose pull && up -d`. Это убирает CPU-пик и SSH-разрывы. Убрать host-`pnpm install` из deploy.sh. Добавить `docker builder prune` в конце деплоя (или периодический cron) против переполнения диска.

### [P1] MinIO bucket публичен и без изоляции по клубу
- **Файл:** `apps/api/src/modules/upload/upload.router.ts:88-92,98` (политика `Principal: AWS:['*'], s3:GetObject`); nginx `/media/` отдаёт `minio:9000` без авторизации (`nginx.conf:101-109, 428-436`).
- **Суть:** C2 из 09-api-infra не закрыта. Один глобально-читаемый bucket `titan-hub` без префикса `clubId/`. Утечка одной ссылки = вечный публичный доступ; в мультитенанте файлы всех клубов в общем читаемом пространстве.
- **Риск:** утечка медиа арендатора (аватары/фото/чеки) между клубами, неустранимая ротацией.
- **Исправление:** приватный bucket + `presignedGetObject` (TTL) или проксирование через API с проверкой роли; ключи `clubs/<clubId>/...`, политика на префикс. Fail-fast по `MINIO_*` (сейчас fallback `minioadmin`, `upload.router.ts:52-57` — L1).

### [P2] `.env.example` рассинхронизирован и вводит в заблуждение
- **Файл:** `.env.example` (через git show) — документирует `ANTHROPIC_API_KEY`/`AI_MODEL=claude-sonnet-4-6`, а код AI читает `POLZA_*` (`ai.router.ts`); `WALLET_WEBAPP_URL=.../wallet` (переехало на `/residents`).
- **Отсутствуют:** `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` (push молча не работает), `WEBAUTHN_RP_ID/RP_NAME/ORIGIN` (passkey ломается на `localhost`-фолбэке), `POLZA_API_KEY/BASE_URL/MODEL`, `CONTROL_DATABASE_URL`, `SUPERADMIN_WEBAUTHN_*`, `RATELIMIT_ANON/AUTH`, `BACKUP_*`, `*_BOT_USERNAME`. M1 не закрыта.
- **Риск:** новый деплой/провижининг по `.env.example` поднимается «здоровым», но push/passkey/AI не работают; диагностика — часы.
- **Исправление:** синхронизировать с фактическими ключами, пометить обязательные/опциональные, убрать `ANTHROPIC_*`. Расширить `assertEnv` (`index.ts:15-28` проверяет только JWT+DATABASE_URL): при `NODE_ENV=production` требовать `PLATEGA_*`, `VAPID_*`, `WEBAUTHN_RP_ID≠localhost`, `MINIO_*`.

### [P2] Cron на setTimeout/setInterval — пропуск запуска при рестарте, дрейф
- **Файл:** `apps/api/src/index.ts:93-153` (birthdays/balance-audit через `setTimeout`+`setInterval(24h)`; polls/fiscalize — `setInterval(60s)`).
- **Суть:** `setInterval(24h)` дрейфует и не переживает рестарт: контейнер перезапущен в 06:01 → дневной запуск birthdays/balance-audit за этот день пропущен. Идемпотентность бонусов есть (`birthdays.ts` — проверка записи за CURRENT_DATE + FOR UPDATE), но сам запуск может не случиться. polls/fiscalize тикают каждую минуту и идемпотентны — устойчивы.
- **Риск:** в дни деплоя (а деплой = рестарт API) недоначисление бонусов ко дню рождения / пропуск сверки балансов — тихие ошибки.
- **Исправление:** BullMQ (уже в зависимостях, не используется) `repeat:{pattern:'0 6 * * *'}` — переживает рестарт, гарантирует один запуск. Вынести воркеры из API-процесса (готовит почву для реплик API).

### [P2] Миграции без advisory-lock + restore/backup без mutex
- **Файл:** `apps/api/src/migrations/runner.ts` (нет `pg_advisory_lock`); `backup.ts` (нет Redis-lock).
- **Суть:** транзакция на файл спасает от частичного применения, но не от двойного запуска при 2+ репликах/rolling-restart. Сейчас инстанс один — гонки нет, но это держится только на синглтоне.
- **Исправление:** обернуть весь прогон раннера в `pg_advisory_lock(<const>)`; Redis-lock на backup/restore.

### [P3] Нет PITR; restore не тестируется; MinIO/Redis не в бэкапе
- **Файл:** `scripts/backup-db.sh` (ежедневный pg_dump, ротация 14д, Drive опционально).
- **Суть:** RPO до 24ч (нет WAL-archiving), валидируется только размер >1КБ (не факт восстановимости), `minio-data` (медиа) и Redis в бэкап не входят. Офсайт в Google Drive — нарушение локализации ПДн (152-ФЗ, M6).
- **Исправление:** pgBackRest/WAL-G (PITR, RPO минуты); еженедельный авто-restore последнего дампа в одноразовый контейнер + smoke-тест; бэкап `minio-data` (rclone sync). Офсайт перенести в РФ-облако (Yandex/VK/Selectel) с шифрованием дампов.

### [P3] nginx: нет `server_tokens off`, CSP, Referrer-Policy, Permissions-Policy, OCSP stapling
- **Файл:** `nginx/nginx.conf` — есть HSTS/X-Frame-Options/X-Content-Type-Options (во всех трёх контурах), но нет перечисленного.
- **Исправление:** `server_tokens off;` в `http{}`; `Referrer-Policy`, `Permissions-Policy`, аккуратная CSP; `ssl_stapling on`.

### [P3] API-контейнер под root + право DROP БД + доступ к rclone-кредам
- **Файл:** `apps/api/Dockerfile` (нет `USER`); `docker-compose.yml:95-98` (`/opt/backups:rw`, `/root/.config/rclone:ro`); `backup.ts` шеллит pg_dump/psql/rclone с `--clean`.
- **Суть:** H4 закрыта для остальных сервисов, но API остался root (нужны бинари бэкапа). Компрометация API → root в контейнере + Google-токены + DROP всей БД и бэкапов. Blast radius максимален, в мультитенанте — все клубы.
- **Исправление:** вынести бэкап в отдельный sidecar/cron-контейнер, API лишить root и права DROP (отдельная БД-роль для restore). Минимум — `USER node` + chown `/backups`.

### [P3] bot-контейнеры без healthcheck
- **Файл:** `docker-compose.yml:153-185` — `bot-admin`/`bot-wallet` без `healthcheck` (упавший long-poll считается «running»).
- **Исправление:** лёгкий heartbeat в Redis или алерт на restart-петлю.

---

## Возможности апгрейда

1. **CI/CD со сборкой образов в реестре (GHCR).** PR → lint+type-check+build+test; merge → push образов; на VPS только `docker compose pull && up -d`. Разом убирает: CPU-пик и SSH-разрывы при деплое (корень известных инцидентов), переполнение build-кэшем диска 45G, проливку непротестированного кода. Самый высокий ROI.

2. **PgBouncer + тюнинг `max_connections`.** Перед началом продаж — transaction-pooling перед Postgres. Без него модель database-per-club упрётся в потолок коннектов на ~15 клубах. Заодно снять `max` клуб-пулов и добавить idle-eviction пулов в `client.ts`.

3. **Наблюдаемость как канал поддержки.** Sentry + pino (JSON с `clubId`) + `/health/ready` (SELECT 1 + Redis PING) + алерты в существующий bot-admin (провал миграции/бэкапа, 5xx-всплеск, диск >85%, зависшая оплата). Без этого SLA для платящих клубов продать нельзя.
