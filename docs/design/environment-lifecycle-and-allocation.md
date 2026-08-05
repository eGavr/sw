# Design: environment lifecycle, capability stereotype & session allocation

Статус: **согласовано, к реализации** (пункт 9 плана — переархитектура окружений/сессий на масштаб).
Это отменяет раннее решение «live-состояние знает только провайдер, Postgres — только accounts/permissions».

## Пивот
- **Postgres = источник правды о live-инвентаре** (реестр окружений + их занятость). Compute
  (Docker / в будущем облако) — **исполнитель**; связь `env id → контейнер` он держит **у себя**,
  никакой завязки на docker в БД (в БД — абстрактный `id`).
- **Окружение = capability-стереотип** (W3C WebDriver + Appium), матчится против запрошенных
  capabilities сессии (модель Selenium Grid: node stereotype ↔ requested caps). Браузер — частный
  случай **Application**. Модель сразу покрывает десктоп (linux/win/mac) и мобилки (android/ios).
- **Async-жизненный цикл окружения**: `enqueued → preparing → executing → deleting → (строка снесена GC)`.
- **Сессии отдельной таблицей НЕ храним** (пока): только `environment` + флаг `busy`. Секрет сессии
  (wdSessionId) в БД/логи **не кладём** — роутинг stateless (endpoint закодирован в session id).

## Схема `environment`
```
id                   uuid pk
account_id           uuid
state                enqueued | preparing | executing | deleting
-- capability-стереотип (что окружение предлагает; всё NOT NULL — есть у любого окружения):
platform_name        -- linux|windows|mac|android|ios
platform_version     -- версия ОС
device_name          -- мобилка: модель телефона; десктоп: идентичность машины/ноды (реальное значение, не null)
application_name      -- chrome | firefox | com.example.app  (браузер = приложение)
application_version   -- матч по мажору; version_sort под диапазоны = TODO
-- runtime:
endpoint             -- КУДА направлять трафик (http://host:port); пишет compute при запуске; null до запуска
busy                 boolean NOT NULL DEFAULT false  -- ставит ХАРТБИТ агента, НЕ create-session
last_heartbeat_at    -- null до первого хартбита
created_at, updated_at
```
Правило nullable: **variant-nullable** (поле осмысленно только для части строк по типу) — запрещено
(поэтому `device_name` всегда с реальным значением, нет `application_kind`/`automationName`);
**lifecycle-nullable** («ещё не / сейчас не»: `endpoint` до запуска, `last_heartbeat_at` до первого
хартбита) — допустимо. Нет `allocation_id`/fencing (см. «Аллокация»).

Индекс под аллокацию: частичный по «свободным исполняющимся», напр.
`(account_id, platform_name, application_name, application_version) WHERE state='executing' AND busy=false`.

## Liveness — единый порог
Агент хартбитит **раз в ~3с** (+ немедленный хартбит при смене состояния busy↔free — опц. оптимизация).
Окно свежести — **6с** (потом конфиг). **Один порог 6с используется везде**: фильтр аллокации,
вычисление эффективного статуса, GC. Хартбит — единственный сигнал liveness и занятости.

## Создание окружения (async)
1. `POST /v1/accounts/{a}/environments {platform, application}` → строка `state=enqueued` → ответ:
   ресурс в состоянии `ENQUEUED` (клиент поллит `GET`). *(create — state-based async, как и delete.)*
2. **Воркер** (см. ниже) подхватывает `enqueued` → `state=preparing` (короткая claim-транзакция) →
   зовёт compute «подними окружение id=…» → compute поднимает контейнер, **прокидывает внутрь `id`
   + базовый URL `/internal`**, и **пишет `endpoint`** (он один знает host-mapped порт).
3. **Агент** внутри контейнера хартбитит `POST /internal/environments/{id}:heartbeat {busy}`.
   **Первый хартбит = регистрация** → `state=executing` + `last_heartbeat_at`.
4. Клиент через `GET` видит переход в `EXECUTING`.

## Воркер: без поллинга, без дедлока, масштабируемо
- **`LISTEN/NOTIFY`**: триггер `AFTER INSERT/UPDATE … WHEN state IN ('enqueued','deleting')` →
  `pg_notify('environment_work', id)`. Воркер держит постоянный `pg`-коннекшн с `LISTEN` (TypeORM
  LISTEN нормально не отдаёт → raw `pg`-клиент). NOTIFY — только «будильник».
- **Startup catch-up**: на старте скан существующих `enqueued`/`deleting` (NOTIFY не durable).
- **Claim без гонок и дедлока**:
  `UPDATE environment SET state='preparing' WHERE id=(SELECT id FROM environment WHERE state='enqueued'
   ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING …`.
  `SKIP LOCKED` **никогда не ждёт** → дедлок невозможен; каждый воркер берёт свою строку.
- **Короткая claim-транзакция**: заклеймил (`→ preparing`) и **COMMIT**, долгий запуск — вне блокировки.
  Крашнулся после claim (застряло `preparing`) → **preparing-timeout** возвращает в `enqueued`.
- Один воркер обслуживает **оба** перехода: `enqueued` (запуск) и `deleting` (остановка).

## Аллокация сессии (create-session)
- `POST /sessions {accountId, application}` — **без явного environmentId** (пул-аллокация).
- **Арбитр занятости 1:1 — сам endpoint/нода** (`SE_NODE_MAX_SESSIONS=1` принимает одну new-session,
  остальные отбраковывает). БД-`busy` — **подсказка**, не гарантия (поэтому НЕ нужен ни `allocation_id`,
  ни `UNIQUE(active session)`).
- **На create-пути в БД НЕ пишем** (стабильная нагрузка; занятость отрапортует следующий хартбит):
  ```
  loop (bounded):
    cand = SELECT свободное (state='executing', busy=false,
                             last_heartbeat_at > now()-interval '6s', <caps match>)
           ORDER BY random() LIMIT 1                    -- ПОДСКАЗКА (может быть протухшей)
    if none → 409/503 «нет свободных под caps»
    try POST {cand.endpoint}/session (caps):
        success  → return encode(cand.endpoint, wdSessionId)
        rejected → continue                             -- нода отбраковала (уже занято) → берём другую
  ```
- Матчинг caps: только **указанные** в запросе caps учитываются (Selenium Grid semantics); версия —
  по мажору сейчас, констрейнты (`>=`) через `application_version_sort` = TODO.

## Удаление окружения (async, state-based по AIP — НЕ кастомный verb)
- `DELETE /v1/accounts/{a}/environments/{id}` → `state=deleting`, `202`. Метод остаётся стандартным
  `DELETE` (AIP-135); асинхронность выражается **полем `state`** (AIP-216) + поллингом `GET` — как и
  async create. *(LRO/AIP-151 — более тяжёлая альтернатива; выбрали лёгкий state-based.)*
- `deleting` сразу выпадает из аллокации (фильтр берёт только `executing`).
- **Воркер** подхватывает `deleting` → compute **останавливает контейнер** (актуатор остановки).
- Контейнер погас → хартбиты прекратились → `last_heartbeat_at` протух.
- **GC сносит строку** (по протухшему хартбиту) — **`pg_cron`** прямо в БД (или лёгкий app-side reaper,
  если расширения нет):
  ```sql
  DELETE FROM environment WHERE state='deleting' AND last_heartbeat_at < now() - interval '6 seconds';
  ```
  Тот же GC чистит **крашнутые `executing`** (хартбит протух). Таблица не растёт (hard delete).
- **Эффективный статус вычисляется при `GET`** из (`state` + свежесть хартбита), а не отдаётся сырым:
  `deleting`+протух → **`DELETED`**; `executing`+свеж → `ACTIVE`; `executing`+протух → фактически мёртв;
  строки нет → `404`.
- Разделение: **воркер = остановка контейнера, GC = уборка строки**. Агент строку НЕ удаляет
  (умирает вместе с контейнером — ненадёжно); его хартбит просто прекращается.

## Internal callback API
- Одна ручка: `POST /internal/environments/{id}:heartbeat {busy}` (AIP custom method). Первый хартбит =
  регистрация (`preparing→executing`). **Нет** отдельного `:released` (busy несёт хартбит) и **нет**
  отдельного register.
- Auth `/internal` (внутренний секрет / mTLS, не пользовательский токен) — **отдельная задача** (позже).

## Агент (в образе)
Живёт внутри образа окружения (сайдкар/процесс). На вход — `env id` + базовый URL `/internal` (env-vars).
Хартбитит `{alive, busy}`; `busy` берёт, интроспектируя состояние ноды (кол-во активных сессий).
Реализация агента — инфра-задача.

## Открытые TODO / отложенные решения
- `application_version_sort` + матчинг диапазонов версий (сейчас — только мажор).
- Auth `/internal` (секрет/mTLS).
- Реализация агента в образе + как он читает `busy` у ноды.
- Возврат `endpoint` из compute (compute должен сообщать host-порт).
- Доступность `pg_cron` (иначе app-side reaper).
- Preparing-timeout / recovery специфика; возможные `failed`-состояния (если create не поднялся).
- Именование состояний под AIP-216 (`CREATING/ACTIVE/DELETING`) vs внутренние тонкие (`enqueued/preparing/…`).

## Стадии реализации
1. **[сделано]** ADR (этот файл) + разворот доменной секции `CLAUDE.md`/памяти.
2. Миграция `environment` (реестр + `state` + capability-колонки + `busy` + `last_heartbeat_at`);
   доменный `Environment` со стейт-машиной; репозиторий поверх Postgres; async `create` (`enqueued`);
   `GET` c эффективным `state`; async `delete` (`deleting`).
3. Compute-воркер: LISTEN/NOTIFY + SKIP LOCKED claim для `enqueued` (запуск) и `deleting` (остановка);
   запись `endpoint`; preparing-timeout recovery.
4. Агент (в образе) + `/internal:heartbeat` (активация + `busy` + liveness).
5. Аллокация сессии: `create-session` на `{accountId, application}` с оптимистичным pick+retry;
   убрать явный `environmentId`.
6. GC (`pg_cron`) + вычисляемый эффективный статус + конфигурируемый порог свежести.
7. Auth `/internal` (отдельно).
