# Design: environment lifecycle, capability stereotype & session allocation

Статус: **согласовано, к реализации** (пункт 9 плана — переархитектура окружений/сессий на масштаб).
Это отменяет раннее решение «live-состояние знает только провайдер, Postgres — только accounts/permissions».

## Пивот
- **Postgres = источник правды о live-инвентаре** (реестр окружений + занятость). Compute
  (Docker / в будущем облако) — **исполнитель**; связь `env id → контейнер` держит **у себя**,
  в БД — абстрактный `id`.
- **Окружение = устройство/контейнер с НАБОРОМ установленных приложений** (capability-стереотип,
  W3C WebDriver + Appium). Занятость (`busy`) — свойство **окружения** (устройства/контейнера),
  а не приложения: пока крутится сессия любого приложения — окружение занято целиком. Сессия
  аллоцируется под **конкретное приложение из набора**. Браузер — частный случай **Application**.
  Модель покрывает десктоп (linux/win/mac) и мобилки (android/ios).
  - *Почему набор, а не одно приложение:* реальное устройство (android) держит несколько приложений;
    моделировать «один app = одно окружение» нельзя — две строки на одно физическое устройство дали бы
    независимый `busy` и сломали 1:1-занятость. Для Docker — выбор оператора: упаковать несколько
    браузеров в один образ (одно окружение, общая занятость) или разнести на разные образы
    (независимая занятость).
- **Async-жизненный цикл**: `enqueued → preparing → executing → deleting → (строка снесена GC)`,
  плюс терминальный `failed` (провижн не удался).
- **Сессии отдельной таблицей НЕ храним** (пока): только `environment` (+ дочерняя
  `environment_application`) + флаг `busy`. Секрет сессии (wdSessionId) в БД/логи **не кладём** —
  роутинг stateless (endpoint закодирован в session id).

## Схема БД
```
environment
  id                   uuid pk
  account_id           uuid   -- тенант-владелец (FK account)
  provider_account_id  uuid   -- на каком облаке крутится (FK provider_account, nullable); ДОБАВЛЕНО в стадии 2.5
  state                enqueued | preparing | executing | deleting | failed
  state_reason         null | PERMISSION_DENIED | QUOTA_EXCEEDED | INVALID_CAPS | PROVIDER_ERROR
  -- capability-описатели: по ним аллокатор ИЩЕТ окружение (это «что матчить», НЕ «где стоит»):
  platform_name        NOT NULL   -- linux|windows|mac|android|ios
  platform_version     NOT NULL
  device_name          NOT NULL   -- реальное осмысленное значение даже когда «не важно» (без variant-null)
  -- runtime:
  endpoint             null до регистрации  -- КУДА слать трафик; пишет internal-handler при регистрации
  busy                 boolean NOT NULL DEFAULT false   -- ставит ХАРТБИТ агента, НЕ create-session
  last_heartbeat_at    null до первого хартбита
  created_at, updated_at

environment_application         -- набор установленных приложений (часть агрегата Environment), 1:N
  id                   uuid pk
  environment_id       uuid   FK environment ON DELETE CASCADE
  application_name     NOT NULL   -- chrome | firefox | com.example.app  (браузер = приложение)
  application_version  NOT NULL   -- матч по мажору; version_sort под диапазоны = TODO
  UNIQUE(environment_id, application_name, application_version)
  -- application_kind УБРАН (для матчинга не нужен)
```
Правило nullable: **variant-nullable** (поле осмысленно только для части строк по типу) — запрещено
(поэтому `device_name` всегда с реальным значением, нет `application_kind`); **lifecycle-nullable**
(«ещё не / сейчас не»: `endpoint`, `last_heartbeat_at`, `state_reason`) — допустимо. Нет
`allocation_id`/fencing (см. «Аллокация»).

Индекс под аллокацию: частичный `(platform_name, platform_version) WHERE state='executing' AND
busy=false`; матч приложения — `EXISTS` по `environment_application` (опц. индекс
`(application_name, application_version)`).

## Кто что пишет в БД (важно: воркер НЕ хартбитит)
- **api** (control-plane): `INSERT enqueued` (create), `UPDATE state=deleting` (delete). **Наша
  авторизация — синхронно здесь.**
- **worker**: только claim (`enqueued→preparing`, SKIP LOCKED) и переходы `failed`/ретрай.
  `busy`/`last_heartbeat_at`/`endpoint` **не трогает**.
- **internal-handler** (принимает хартбит агента изнутри контейнера): пишет `busy` +
  `last_heartbeat_at`; **первый хартбит = регистрация** → пишет `endpoint` + `state=executing`.
- **GC** (`pg_cron`): `DELETE` протухших/старых.

## Liveness — единый порог
Агент хартбитит **раз в ~3с** (+ немедленный хартбит при смене busy↔free — опц. оптимизация).
Окно свежести — **6с** (потом конфиг). **Один порог 6с везде**: фильтр аллокации, эффективный статус, GC.
Хартбит — единственный сигнал liveness и занятости.

## Создание окружения (async)
1. `POST …/environments {platform, applications}` → **синхронно** в api-хендлере: authN + наша authZ
   (`environment:create`) + есть ACTIVE connection у аккаунта → `INSERT state=enqueued` → ответ:
   ресурс `ENQUEUED` (клиент поллит `GET`). *(create — state-based async, как и delete.)*
2. **Воркер** подхватывает `enqueued` → `state=preparing` (короткая claim-транзакция) → зовёт
   `compute.start(id, credential)`; compute поднимает контейнер, **выбирает host-порт и прокидывает
   внутрь `id` + `endpoint` + базовый URL `/internal`** (env-vars).
3. **Агент** внутри контейнера шлёт первый хартбит `POST /internal/environments/{id}:heartbeat
   {endpoint, busy}` → **internal-handler пишет `endpoint` + `last_heartbeat_at` + `state=executing`**
   (регистрация).
4. Клиент через `GET` видит `EXECUTING`.
   Провижн не удался → см. «Ошибки провижна».

## Ошибки провижна (failed / ретрай)
- Compute-адаптер (data-source) переводит ошибку провайдера в **доменную классификацию** на границе
  data-слоя (не пропуская backend-текст/секреты):
  - **permanent** (нет прав / нет квоты / кривые caps) → `preparing → failed` + `state_reason`,
    **без ретрая**.
  - **transient** (сеть / 5xx / временно нет ёмкости) → `preparing → enqueued` (bounded retry +
    backoff); ретраи исчерпаны → `failed`.
- Решение «ретрай или падать» — **доменное правило стейт-машины** `Environment`
  (`failProvisioning(reason)` / `retryProvisioning()`); воркер лишь диспетчеризует пойманную
  классифицированную ошибку.
- `failed` — из `preparing` («не поднялось»). Если `executing` **уже жил и умер** (доступ отозвали на
  ходу, краш) — это протухший хартбит, ловит heartbeat-GC, а **не** `failed`. Разные механизмы.
- `failed` не имеет хартбита → heartbeat-GC его не сносит → **TTL-GC**
  `DELETE WHERE state='failed' AND updated_at < now()-<ttl>` (окно прочитать причину) + юзер может
  `DELETE` сам.
- На transient-падении воркер делает best-effort `compute.stop`, чтобы не оставить orphan-контейнер.
- `GET`: `failed` → эффективный `FAILED` + `state_reason` (AIP-216 state + AIP-193 error detail).
- Аллокацию не трогает: она берёт только `executing & busy=false & свежий` → `failed`/`enqueued`/
  `preparing`/`deleting` отсекаются сами.

## Аллокация сессии (create-session)
- `POST /sessions {accountId, application}` — **без явного environmentId** (пул-аллокация).
- **Арбитр занятости 1:1 — сам endpoint/нода** (`SE_NODE_MAX_SESSIONS=1`). БД-`busy` — **подсказка**,
  не гарантия (поэтому НЕ нужен ни `allocation_id`, ни `UNIQUE(active session)`).
- **На create-пути в БД НЕ пишем** (занятость отрапортует следующий хартбит):
  ```
  loop (bounded):
    cand = SELECT свободное
           (state='executing', busy=false, last_heartbeat_at > now()-interval '6s',
            <platform match>,
            EXISTS(environment_application: application_name=? AND application_version=?))
           ORDER BY random() LIMIT 1                    -- ПОДСКАЗКА (может быть протухшей)
    if none → 409/503 «нет свободных под caps»
    try POST {cand.endpoint}/session (caps):
        success  → return encode(cand.endpoint, wdSessionId)
        rejected → continue                             -- нода отбраковала → берём другого
  ```
- Матчинг caps: только **указанные** в запросе caps (Selenium Grid semantics); версия — по мажору
  сейчас, констрейнты (`>=`) через `application_version_sort` = TODO.
- **Слои:** предикат живости/свободности формирует ДОМЕН (cutoff-таймстемп «now − freshness», набор
  допустимых состояний, критерий caps) и передаёт его репозиторию→data source готовым; data source лишь
  транслирует его в SQL. Порог свежести (6с) и правило «свободно» в data source не хардкодим.

## Удаление окружения (async, state-based по AIP — НЕ кастомный verb)
- `DELETE …/environments/{id}` → `state=deleting`, `202`. Метод стандартный `DELETE` (AIP-135);
  асинхронность — полем `state` (AIP-216) + поллингом `GET`.
- `deleting` сразу выпадает из аллокации.
- **Воркер** подхватывает `deleting` → `compute.stop` (актуатор остановки).
- Контейнер погас → хартбиты прекратились → `last_heartbeat_at` протух.
- **GC сносит строку** — **`pg_cron`** (или app-side reaper): `DELETE FROM environment WHERE
  state='deleting' AND last_heartbeat_at < now() - interval '6 seconds';`. Тот же GC чистит крашнутые
  `executing`. Таблица не растёт (hard delete).
- **Эффективный статус на `GET`** из (`state` + свежесть хартбита): `deleting`+протух → `DELETED`;
  `executing`+свеж → `ACTIVE`; строки нет → `404`.
- Разделение: **воркер = остановка контейнера, GC = уборка строки**. Агент строку НЕ удаляет.

## Internal callback API
- Одна ручка: `POST /internal/environments/{id}:heartbeat {endpoint?, busy}` (AIP custom method).
  **Первый хартбит = регистрация** (пишет `endpoint`, `preparing→executing`). Нет отдельного
  `:released` (busy несёт хартбит) и нет отдельного register.
- Auth `/internal` (внутренний секрет / mTLS, не пользовательский токен) — **отдельная задача** (позже).

## Агент (в образе)
Живёт внутри образа окружения (сайдкар/процесс). На вход — `env id` + `endpoint` + базовый URL
`/internal` (env-vars от compute). Хартбитит `{endpoint, busy}` (endpoint — при регистрации);
`busy` берёт, интроспектируя ноду (кол-во активных сессий). Реализация агента — инфра-задача.

## Модель аккаунтов, пользователей и подключений (authN / authZ / ресурсы)
Три раздельных слоя (сейчас в коде склеены (2)+(3) — рерайт слоя подключений на стадии 2.5):
- **Слой 1 — Идентичность (authN):** `User(external_id, provider_type)` — один логин через IdP.
  Оставляем как есть; про ресурсы ничего не знает.
- **Слой 2 — Тенант + НАША авторизация:** `Account` + `account_user_permission` (membership:
  `environment:create`, `session:create`, …). Оставляем как есть. Наши права, без внешних систем.
- **Слой 3 — Ресурс-подключения (external authZ):** `ProviderAccount(id, account_id, provider_type,
  external_ref, credential_ref, state)` — **отдельный агрегат**, N на аккаунт (ссылка на account по
  id). Заменил неиспользуемый `AccountResourceProvider` (1:1). Это *привязка аккаунта к провайдеру
  ресурсов* (связь + креды + состояние), НЕ описание самого провайдера. Провижнинг берёт `credential`;
  истина о внешнем доступе — на стороне провайдера.
  - `environment.provider_account_id` — на каком облаке крутится окружение.
  - `credential_ref` → секрет-стор (dev: шифрованное поле; prod: KMS/secret-manager); никогда
    plaintext / в логи (как `wdSessionId`); для `local`/`docker` — null.
  - `ProviderAccount` — свой агрегат (не разбухший `Account`); ссылки по идентити (`account_id`,
    `environment.provider_account_id`). Предикат «активна ли» формирует домен (state=active), data
    source лишь фильтрует по переданному значению — не хардкодит «что значит active».

### Авторизация — путь A (согласован)
```
POST /accounts/{acc}/environments {platform, applications}
  СИНХРОННО (api-хендлер):
    authN → наша authZ: membership(acc,user) имеет environment:create?       → 403
          → есть ACTIVE providerAccount у аккаунта?                           → 409
          → INSERT env(account_id, provider_account_id, state=enqueued)       → ответ клиенту сразу
  АСИНХРОННО (воркер, provision-time):
    compute.start(env, providerAccount.credential)
      accept           → executing        (внешний доступ подтверждён самим провайдером)
      reject permanent → failed(PERMISSION_DENIED | QUOTA_EXCEEDED | …)  ← внешняя истина
      reject transient → retry/enqueued → … → failed
```
- **Наша authZ — синхронно** (быстрый 403/400). **Внешний доступ энфорсит провайдер на провижне**:
  воркер не делает отдельный «а можно?»-роундтрип — `provider.start` есть и запрос, и ответ
  авторизации (accept/reject). Это тот же принцип, что «владение секретом = авторизация».
- **Путь A**: полагаемся на provision-time. Оптимизации потом: **(C)** фоновая валидация `Connection`
  (health-check кредов при подключении и периодически) + `connection.state=active|invalid` для быстрого
  **локального** фидбэка; **(B)** синхронный pre-flight у провайдера — только если нужна 100%
  синхронная уверенность на каждый create.
- Роутинг провижна: `environment → account → providerAccount → compute-адаптер` (порт `ComputeProvider`
  тот же; выбор адаптера переезжает из install-конфига `COMPUTE_PROVIDER` в per-account providerAccount).
  «Мак с докером» и «настоящее облако» — два адаптера одного порта.
- Отложено: per-providerAccount права; мульти-identity на логин; хранение/ротация кредов; 1 vs N
  подключений (модель N; dev держит одно дефолтное, заводится при создании аккаунта — вариант A).

## Открытые TODO / отложенные решения
- `application_version_sort` + матчинг диапазонов версий (сейчас — только мажор).
- Auth `/internal` (секрет/mTLS).
- Реализация агента: чтение `busy` у ноды + рапорт `endpoint` при регистрации.
- Ретрай-политика провижна (кол-во попыток, backoff) + TTL для `failed` — конфиг.
- Доступность `pg_cron` (иначе app-side reaper).
- Preparing-timeout / recovery; возврат `endpoint` из compute (host-порт).
- Именование состояний под AIP-216 (внешние `CREATING/ACTIVE/DELETING/FAILED` vs внутренние тонкие).
- Секрет-стор для `credential_ref`; фоновая валидация `Connection` (опт. C).

## Стадии реализации
1. **[сделано]** ADR (этот файл) + разворот доменной секции `CLAUDE.md`/памяти.
2. Миграция `environment` (+ `environment_application`; `state` вкл. `failed`; `state_reason`;
   capability-колонки; `busy`; `last_heartbeat_at`; **без** `connection_id` пока); доменный
   `Environment` со стейт-машиной (набор приложений; `failProvisioning`/`retryProvisioning` как
   спецификация); репозиторий поверх Postgres; async `create` (`enqueued`); `GET` c эффективным
   `state`; async `delete` (`deleting`). **Аккаунты/юзеры НЕ трогаем.**
2.5. **[сделано]** Рерайт слоя подключений: `ProviderAccount`-агрегат (N на аккаунт, `credential_ref`,
   `state`, `isActive`) + `ProviderAccountRepository`/`ProviderAccountDataSource` + `environment.provider_account_id`;
   заменил `AccountResourceProvider` (убран из агрегата `Account` и из схемы). create-account (вариант A)
   заводит дефолтную `ProviderAccount`; create-environment резолвит ACTIVE (иначе 409). Роутинг провижна
   `env→account→providerAccount→адаптер` — на воркере (стадия 3). Аддитивная миграция.
3. Compute-воркер: `LISTEN/NOTIFY` + `FOR UPDATE SKIP LOCKED` claim (`enqueued` запуск, `deleting`
   остановка); наполнение переходов `failed`/ретрай; best-effort stop orphan; preparing-timeout recovery.
4. Агент (в образе) + `/internal:heartbeat` (регистрация: `endpoint`+`executing`; `busy`; liveness).
5. Аллокация сессии: `create-session` на `{accountId, application}` с оптимистичным pick+retry;
   убрать явный `environmentId`.
6. GC (`pg_cron`: `deleting` + `failed` TTL + stale `executing`) + вычисляемый эффективный статус +
   конфигурируемый порог свежести.
7. Auth `/internal` (отдельно).
