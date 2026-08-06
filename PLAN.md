# План работ

Ветка: `feat.environment-domain-and-compute-backend`.

**Соответствие Google AIP — СДЕЛАНО** (только control-plane `api`; data-plane `wd` — это W3C WebDriver,
свой стандарт). `/v1`; иерархия `accounts/{account}/environments/{environment}`; `name`/`uid`/`createTime`;
Get/List/Create/Delete (Delete → `{}`); пагинация (`pageSize`/`pageToken`/`nextPageToken`); ошибки AIP-193.
Сделано из «отложенного»: **List accounts** (`GET /v1/accounts`, AIP-132) и **непустой message у 401**.
Сделано также: **permissions по IAM** — `GET .../permissions` заменён на IAM-метод
`POST /v1/accounts/{account}:testIamPermissions` (google.iam.v1): тестирует переданный набор и
возвращает подмножество, которым владеет вызывающий (детали — в разделе «Сделано»).
Осталось: `{resource}_id` — доменное решение (нужен релакс id `AccountId`/`EnvironmentId` с uuid до
формата `^[a-z][a-z0-9-]*$` под человекочитаемые имена).

## Сделано

Сквозной сценарий воспроизведён и проверен на живом браузере:

- **Домен**: `Environment` (платформа + доступные `Application` + endpoint, `supports`), `Session`
  (idle-таймаут `touch`/`isIdleAt`, одна активная сессия на окружение), `Platform`/`Application`
  value objects, доменные ошибки (в т.ч. `EnvironmentBusyError` → 409).
- **Compute** (внешний backend за портом, выбор по `COMPUTE_PROVIDER`):
  - `local` — in-memory (для тестов/дев внутри процесса);
  - `docker` — реальные контейнеры; образ конфигурируем (`COMPUTE_DOCKER_IMAGE`, шаблон `{version}`,
    `COMPUTE_DOCKER_PORT`), под ARM — `seleniarm/standalone-chromium`.
- **Control-plane (`api`)**: CRUD окружений с auth + правами на аккаунте.
- **Data-plane (`wd`)**: создание сессии (доменный сценарий с инвариантами) + stateless
  reverse-proxy WebDriver-команд (endpoint закодирован в session id).
- `tsc` 0, юниты 36/36, ESLint по новому коду чист.

## Осталось (по приоритету)

1. ~~**Idle-reaper / liveness сессий.**~~ **СДЕЛАНО** — делегировано узлу браузера. «Умный»
   idle-таймаут (сброс на каждой команде) и инвариант «одна активная сессия на окружение» отданы
   Selenium-узлу через `SE_NODE_SESSION_TIMEOUT` и `SE_NODE_MAX_SESSIONS=1`; таймаут конфигурируется
   `COMPUTE_DOCKER_SESSION_TIMEOUT` (сек, дефолт 300). Доменные `Session.idleTimeout`/`isIdleAt`/`touch`
   остаются спецификацией (и для local-бэкенда, покрыты юнитами). Проверено e2e: сессия переживает
   активность и умирает от простоя. Свой in-process reaper понадобится только для мульти-инстансной
   политики → см. п.9.

2. ~~**Аутентификация data-plane (`wd`).**~~ **СДЕЛАНО.** Токен требуется только на СОЗДАНИЕ сессии
   (`POST /sessions`): `create-session-use-case` резолвит `User` через `UserRepository` (как `api`),
   поэтому `wd` теперь работает с Postgres. Остальное — без auth: доступ по неугадываемому
   `session_id` (capability-модель; секрет — 128-битный wdSessionId внутри id). Реальную схему токена
   (JWT/ключи + выпуск в control-plane) добавим как impl того же auth-порта; авторизацию «может ли
   создать сессию в этом окружении» — вместе с аккаунтами (п.3). Проверено e2e: без/невалидный токен
   → 401, валидный → 201, прокси без токена → 200.

3. **Bootstrap аккаунтов + авторизация в `api` — БОЛЬШАЯ ЧАСТЬ СДЕЛАНА.**
   - ~~Deadlock `create-account`~~ починен: self-service — любой аутентифицированный создаёт аккаунт и
     становится владельцем со всеми правами (grant-all в `Account.create`, персист на `save`).
   - ~~`UserPermissionRepository`~~ → переименован в **`AccountUserPermissionRepository`** (репозиторий
     над `AccountUserPermission`), сделан **postgres-only** (убран сломанный fallback на
     resource-provider). Мёртвый `data-sources/resource-provider/*` удалён.
   - `get-account` теперь реально проверяет `Account.Read` (раньше только объявлял).
   - Проверено e2e (реальный Postgres): create account → get account → list permissions (все 5) →
     create environment → get environment; без токена → 401.

   - ~~авторизация на `create-session`~~ **СДЕЛАНО**: добавлено первоклассное право `session:create`;
     `CreateSessionUseCase` (data-plane `wd`) грузит окружение → его аккаунт → требует `session:create`
     (как environment-use-cases). Право входит в grant-all (`UserPermissionList.getAll`) и в known-names
     (`testIamPermissions`); `wd-module` получил `AccountRepository`/`AccountUserPermissionRepository` +
     их postgres data-source-ы. Проверено e2e (api+wd+docker): без токена → 401, чужой → 403
     (`no permission: session:create`), владелец авторизован (доходит до создания сессии).

   - (б) «более глубокая модель прав» — **разобрано и осознанно отклонено** (сверено с DDD и
     hyperenv-api): агрегат = граница транзакции, толстый `Account`/загрузка всех членов и
     use-case-level Unit of Work — анти-паттерны. Оставили: grant — часть агрегата `Account`;
     `AccountDataSource.saveOne` атомарен (транзакция **внутри data source**); авторизация — узкое
     targeted-чтение `AccountUserPermissionRepository.findAll`. Правила зафиксированы в `CLAUDE.md`
     (транзакция — забота data source; чтение ≠ запись; `with(id, cb)` для load-mutate-save).

   Попутно сделано (аудит): удалён мёртвый `data-sources/ydb/*` (окружения/сессии теперь на `compute`).

4. **WS-протоколы — СДЕЛАНО (ядро).** Stateless WebSocket-reverse-proxy на data-plane: `wd` ловит
   HTTP `upgrade` (минуя Nest-роутинг), декодирует endpoint из session id и пайпит кадры в
   `ws(s)://{endpoint}/session/{wdSessionId}/{rest}`. Без auth (capability по session id, как HTTP-прокси).
   BiDi включён на создании сессии (`webSocketUrl: true`); CDP/VNC отдаёт нода. Схема URL:
   `ws://{wd}/sessions/{id}/se/{bidi,cdp,vnc}`. Проверено e2e на живом контейнере (BiDi `session.status`,
   CDP `Browser.getVersion`); юнит-тесты на роутинг. **Осталось (follow-up):** отдавать `webSocketUrl`/
   `se:cdp`/`se:vnc` в ответе create-session, чтобы клиенты авто-обнаруживали проксирующий URL (сейчас
   URL строится по схеме детерминированно); явный e2e для VNC (тот же путь, но бинарные кадры).

5. **Резолвер образа — app-часть СДЕЛАНА.** Резолвер обобщён до `{image, env}` со стратегиями
   `prebuilt` (браузер вшит в тег; selenium публикует пер-версии теги, напр. `selenium/standalone-chrome:148.0`)
   и `install` (свой базовый образ ставит браузер на старте, получая его через `SW_BROWSER_NAME`/
   `SW_BROWSER_VERSION`), выбор по `COMPUTE_DOCKER_BASE_IMAGE`. Добавлен `COMPUTE_DOCKER_PLATFORM` →
   `docker run --platform`. Юнит-тесты на обе стратегии.
   **Важный вывод по dev-окружению (проверено e2e):** `selenium/standalone-chrome` — только **amd64**;
   на arm-маке под `--platform linux/amd64` контейнер поднимается и WebDriver отвечает, но **сам Chrome
   падает под QEMU** («session not created: Chrome instance exited»). То есть реальный Chrome нужной версии —
   это **нативный amd64** (prod/CI), а на маке для локалки остаётся **Chromium** (`seleniarm`, нативно) —
   текущий дефолт. **Осталось (follow-up, только под нативную арх):** сам install-at-startup образ
   (Dockerfile+entrypoint, качающий Chrome-for-Testing) для версий вне selenium-тегов / своего базового образа.

6. **Стабилизация конфигурации — СДЕЛАНО.** Убраны мёртвые ключи (`ACL_PROVIDER`,
   `ENVIRONMENT_PROVIDER` — код на `COMPUTE_PROVIDER`); починен неполный `.env.production` (падал бы на
   старте — не было `POSTGRES_*`/`COMPUTE_PROVIDER`); `.env.development` выровнен на Postgres **5433**
   (больше не нужен per-command override) + задокументированы `COMPUTE_*` (`PORT`/`SESSION_TIMEOUT`/
   `PLATFORM`/`BASE_IMAGE`); удалён мёртвый `.env.testing` (никакой `NODE_ENV=testing` не используется).
   Проверено: `api` поднимается на dev-конфиге и коннектится к 5433 без оверрайда.

7. **Тесты — `api`-харнесс СДЕЛАН.** Интеграционный харнесс приведён к текущей реальности и зелёный
   (27/27): `accounts` (self-service create, grant-all owner, AIP-форма/ошибки, `:testIamPermissions`,
   PERMISSION_DENIED не-владельцу, пагинация) и вложенные `accounts/{account}/environments` (CRUD на
   local-compute). Харнесс: stateless local-auth (`Authorization.forUser(id)`), Postgres на 5433,
   `COMPUTE_PROVIDER=local`, `maxWorkers=1` (общая БД + TRUNCATE между кейсами → строго последовательно).
   **`wd`-флоу СДЕЛАН**: create-session на local-compute (401/201/403/404/409/400) + stateless-прокси
   (crafted session id → фейковый upstream: форвард команды + DELETE + 400 на кривой id). Общие утилиты
   харнесса подняты в `server/utils` (api и wd их шарят). Вся интеграционка зелёная (**37/37**).
   Мелочь: изредка (~1/5) supertest ловит транзиентный `ECONNRESET` (keep-alive), не связан с логикой;
   ре-ран зелёный. WS-прокси в интеграции не покрыт (upgrade вешается в bootstrap, а не в модуле) — есть
   юнит-тесты роутинга + живой e2e.

8. **Пре-существующий ESLint-долг — СДЕЛАНО.** `eslint src test` = **0 проблем** (было 32): `--fix`
   закрыл 28 (quotes в сгенерированной миграции, import/order, лишняя пустая строка) + 4 ручных
   (перенос длинного импорта, return-типы у статиков `AccountUser`/`AccountUserList`/`AccountUserPermission`).
   Поведение не менялось; tsc/юниты 52/52/интеграция 37/37 зелёные.

9. **Масштабирование / переархитектура окружений+сессий — ДИЗАЙН СОГЛАСОВАН, В РАБОТЕ.**
   Полный дизайн (источник правды) — **`docs/design/environment-lifecycle-and-allocation.md`**. Кратко:
   **Postgres = источник live-правды** (реестр окружений + `busy`), compute — исполнитель (без завязки
   на docker в БД, абстрактный `id`). Окружение = **устройство/контейнер с НАБОРОМ приложений**
   (capability-стереотип W3C+Appium; браузер = частный Application), занятость `busy` — на окружении, не на
   приложении; матч как в Selenium Grid (дочерняя `environment_application`, `EXISTS`). **Async-цикл**
   `enqueued → preparing → executing → deleting → (GC)` + терминальный **`failed`** (permanent — нет
   прав/квоты/caps → без ретрая; transient → ретрай через `enqueued`; `state_reason`; TTL-GC). **Воркер**
   через `LISTEN/NOTIFY` + `FOR UPDATE SKIP LOCKED` (без поллинга/дедлока); воркер НЕ хартбитит — `endpoint`
   и `executing` пишет **internal-ручка при первом хартбите агента** (регистрация). **Аллокация** сессии:
   `POST /sessions {accountId, application}` (без явного env), арбитр 1:1 — **нода** (`max-sessions=1`),
   БД-`busy` — подсказка, оптимистичный pick+retry, на create-пути в БД не пишем. **`busy` ставит хартбит
   агента** (~3с; окно свежести 6с — единый порог для аллокации/статуса/GC). **Delete** — state-based по AIP
   (метод `DELETE` → `state=deleting`, поллинг `GET`; НЕ кастомный verb), воркер гасит контейнер, **GC
   (`pg_cron`) сносит строку** по протухшему хартбиту; `DELETED` — вычисляемый статус. Секрет сессии в БД/логи
   НЕ кладём.
   **Аккаунты/доступ — 3 слоя** (тоже в design-doc): authN `User(external_id,provider_type)`; наша authZ
   `Account`+`account_user_permission` (синхронно в handler-е); ресурс-подключения **`ProviderAccount`** (N на
   аккаунт, `credential_ref`, `state`; заменил `AccountResourceProvider`; `environment.provider_account_id`) —
   *привязка аккаунта к провайдеру ресурсов*, не описание провайдера. **Путь A**: авторизация к провайдеру =
   владение активным `ProviderAccount`, внешний доступ энфорсит провайдер на провижне (`compute.start(credential)`,
   reject → `failed`), не синхронным гейтом; оптимизации (фоновая валидация / pre-flight) — потом.
   **Стадии — в `docs/design/…`; стадии 1 (ADR) и 2 СДЕЛАНЫ.**
   Стадия 2 (проверено: `tsc` 0 · `eslint` 0 · юниты **66/66** · интеграция **37/37** · живой Postgres):
   миграция `environment`+`environment_application`; доменная стейт-машина `Environment` (набор приложений,
   `failed`/`state_reason`, переходы `claim`/`register`/`heartbeat`/`failProvisioning`/`retryProvisioning`/
   `startDeletion`, `effectiveStatus(now,window)`); Postgres `EnvironmentDataSource` + `EnvironmentRepository`
   поверх него; async `create`→`ENQUEUED` (контейнер НЕ поднимается), `GET`/`LIST` с derived `state`, async
   `delete`→`DELETING`/`DELETED` (строка живёт до GC). API create теперь `applications: [...]`, presenter
   отдаёт `state` (без `providerName`/`kind`). Compute env-датасорсы оставлены под сессионный путь (их
   удаление + вынос image-resolver в compute-исполнитель — стадия 3/5); wd create-session на local-compute
   жив. Правило зафиксировано: data source/repository без доменных вычислений (предикаты живости формирует
   домен) — см. `CLAUDE.md`.
   **Стадия 2.5 СДЕЛАНА** (проверено: `tsc` 0 · `eslint` 0 · юниты **69/69** · интеграция **37/37** · живой
   Postgres): `ProviderAccount`-агрегат (+ repo/data-source, `isActive`), `environment.provider_account_id`,
   заменил `AccountResourceProvider` (убран из `Account` и схемы, миграция дропает таблицу); create-account (A)
   заводит дефолтную `ProviderAccount` из `resources` запроса; create-environment резолвит ACTIVE (иначе 409) и
   пишет `provider_account_id`; account-ответ больше не отдаёт `resources`. Data source фильтрует по переданному
   `state` (предикат «active» — в домене/репозитории).
   **Стадия 3 — В ОСНОВНОМ СДЕЛАНА (provision-вертикаль доказана e2e на живом Docker).** 4 фазы
   `enqueued→starting→preparing` (агент→executing = стадия 4). Построено: `presentation/worker/` (raw pg
   `LISTEN`/NOTIFY «насос»); `PrepareNextEnvironmentUseCase` = `repo.withNextEnqueued(e=>e.claim())` →
   `gateway.provision` → `markDispatched` → `save` (**save только на реальном изменении**; провижн — не save);
   ошибка → `failProvisioning`+`save`+`deprovision`; `DeprovisionDeletingEnvironmentsUseCase`. **DDD-развилка
   решена (сверено с источниками): актуатор = Gateway `EnvironmentProviderGateway`** (provision/deprovision,
   docker-адаптер идемпотентный), сиблинг репозитория; **`EnvironmentRepository` Postgres-only** (`withNextEnqueued`
   = атомарный SKIP LOCKED claim в data-source, `save`, `listByState`). Миграция `attempts` + триггер
   `notify_environment_work`. Есть doc `infrastructure/gateways/__ABOUT_GATEWAYS__.md`. **[done] reaper**
   подвисших `starting`(малый)/`preparing`(большой): app-тик воркера под `pg_try_advisory_lock` →
   `ReclaimStuckEnvironmentsUseCase`; предикат формирует домен (VO `StuckProvisioningCriteria` → `{state,cutoff}`),
   data-source лишь транслирует (`findByStateUpdatedBefore`); `Environment.reclaimStuck(maxAttempts)` = `→enqueued`
   (ре-NOTIFY) либо `→failed`(PROVISIONING_TIMEOUT)+deprovision; покрыт domain-unit + integration. **[done] per-account
   routing:** `EnvironmentProviderGatewayResolver.resolve(providerType)` (map local/docker) вместо глобального
   `COMPUTE_PROVIDER`; воркер-use-case-ы резолвят `ProviderAccount` окружения (`ProviderAccountRepository.get`) и берут
   адаптер по `providerType`. **Остаток стадии 3:** delete-e2e прогон.
   **[стадия 4 — серверная часть done]** `/internal:heartbeat`: `POST /internal/environments/{id}:heartbeat {endpoint?, busy}`
   (отдельный `InternalModule`, `INTERNAL_PORT`, без auth пока). Первый хартбит = регистрация (`preparing→executing`+`endpoint`),
   каждый — `busy`+liveness; не вовремя → 409, без endpoint → 400. `RecordEnvironmentHeartbeatUseCase`; покрыт integration.
   Осталось в стадии 4: auth `/internal` (стадия 7) + сам агент в образе (инфра).
   **Плюс РАСКЛАДКА ПАПОК по литературе** (см. память `current-state`): [done] `data/`→`infrastructure/`,
   use-cases→`application/`, presentation по механизму (`http/{api,wd}` + `worker/`, без уровня `nestjs`);
   **[done] R2** — порт-интерфейсы (repo+gateway) = абстрактные классы в `application/interfaces/{repositories,gateways}/`
   (строгий DIP, DI по токену `{ provide: Port, useClass: …Impl }`), реализации остались в `infrastructure/`
   как `…RepositoryImpl` / `<backend>…Gateway`; общие query-типы (`FindUserQuery`, `FindPermissionsQuery`,
   `CreateEnvironmentParams`) переехали в порт; data-sources остались в infra. Зелёно: tsc 0 · eslint 0 · unit 73 · integration 37.
   Стадии 4–7 — агент+heartbeat / аллокация / GC / auth `/internal`.

10. **IAM access-management (Слой 2, наша authZ) — ОТДЕЛЬНЫЙ воркстрим, не на критическом пути compute.**
    Сейчас: `create-account` даёт создателю все права (grant-all owner) + `:testIamPermissions` (проверить свои).
    НЕТ: добавить в аккаунт другого юзера, выдать/забрать права — в аккаунте может быть только создатель.
    Достроить триаду google.iam.v1 (AIP-136) теми же кастомными методами на аккаунте: **`:getIamPolicy`**
    (прочитать политику) + **`:setIamPolicy`** (задать: добавить юзера + права). Политика = биндинги
    `role → members`. Решения на потом: ввести **роли** (бандлы permissions: owner/editor/viewer) vs биндить
    плоские permissions (Google — роли); участник указывается по внешней identity (email/external_id), `User`
    создаётся лениво при первом логине. *(Альтернатива триаде — REST-коллекция `accounts/{acc}/members/{member}`;
    но раз есть `:testIamPermissions`, триада консистентнее.)* «Гейт на вход в сервис» (allowlist поверх
    self-service) — если понадобится, ещё отдельно. Делаем после compute-вертикали.

---

## Permissions по IAM (`:testIamPermissions`) — СДЕЛАНО

`GET /v1/accounts/{account}/permissions` (возвращал ВСЕ права — нестандартно, по AIP-136 такого метода
нет) заменён на IAM-метод `google.iam.v1`, который ТЕСТИРУЕТ переданный набор:

    POST /v1/accounts/{account}:testIamPermissions           # 200
      body:  {"permissions": ["environment:create","environment:delete"]}
      resp:  {"permissions": ["environment:create"]}         # подмножество, которым владеет вызывающий

Реализовано по рекомендациям Google IAM (проверено e2e):
- `TestAccountPermissionsUseCase`: auth → `AccountRepository.find` → `AccountUserPermissionRepository`
  → `AccountUserPermissionList.intersect(requested)` (пересечение — доменное правило, порядок сохраняется).
- **Право на сам вызов не требуется** (любой аутентифицированный тестирует свои права); чужой юзер → `[]`.
- **Неизвестное право → `INVALID_ARGUMENT`** (`UserPermissionName.fromString`).
- **Несуществующий аккаунт → `[]`** (не `NOT_FOUND`); набор ограничен 100; ответ `200` (не 201).
- Роутинг: express матчит `{account}:testIamPermissions` одним сегментом → сплит по последнему `:` в
  контроллере, невалидный verb → `404`. `AccountRepository.find` (nullable) добавлен под пустой набор.
- Удалён старый `list-account-permissions` (use-case + endpoint + DTO). Юнит-тесты на `fromString`/
  `intersect`; интеграционный тест прав обновлён на новый метод.

---

## Как запускать локально (runbook)

Apple Silicon: Docker Desktop запущен; образ `seleniarm/standalone-chromium:latest` подтянут;
`node_modules` стоят. Порт 5432 занят чужим `hyperenv-api-postgresql` → наш Postgres на **5433**
(уже прописан в `.env.development`, оверрайд не нужен). И `api`, и `wd` требуют Postgres.

    # БД + миграции (один раз)
    docker run -d --name sw-db -e POSTGRES_USER=sw -e POSTGRES_PASSWORD=sw -e POSTGRES_DB=sw -p 5433:5432 postgres:16-alpine
    npm run pg:migration:run:dev

    # control-plane (api, :3000) — всё под /v1; локальный токен: любой `Bearer <что-то>`
    npm run start:api:dev
    curl -X POST localhost:3000/v1/accounts -H 'Authorization: Bearer <user1>' -H 'content-type: application/json' \
      -d '{"displayName":"team-a","resources":{"providerId":"p","providerType":"docker"}}'   # -> uid
    curl localhost:3000/v1/accounts -H 'Authorization: Bearer <user1>'                        # List accounts
    # проверить права (IAM): вернётся подмножество, которым владеет вызывающий
    # ВНИМАНИЕ zsh: используй ${ACC}, иначе $ACC:testIamPermissions съест `:t` history-модификатор
    curl -X POST "localhost:3000/v1/accounts/${ACC}:testIamPermissions" -H 'Authorization: Bearer <user1>' \
      -H 'content-type: application/json' -d '{"permissions":["environment:create","account:read"]}'
    # окружения вложены: POST/GET/LIST/DELETE /v1/accounts/{account}/environments[/{env}]

    # data-plane (wd, :3001) — W3C WebDriver + WS-протоколы (bidi/cdp/vnc): ws://{wd}/sessions/{id}/se/{bidi,cdp,vnc}
    npm run start:wd:dev
    ENV_ID=$(npm run --silent env:create:dev | sed -n 's/.*"environmentId": "\([^"]*\)".*/\1/p')   # dev-хелпер, минуя api
    SESSION_ID=$(curl -s -X POST localhost:3001/sessions -H 'Authorization: Bearer <user1>' -H 'content-type: application/json' \
      -d "{\"environmentId\":\"$ENV_ID\",\"application\":{\"name\":\"chrome\",\"version\":\"latest\"}}" | sed 's/.*"id":"//;s/".*//')
    curl localhost:3001/sessions/$SESSION_ID/url            # прокси-команды — без токена (доступ по SESSION_ID)
    npm run env:delete:dev -- $ENV_ID

Проверка: `npx tsc --noEmit` · `npx eslint <files>` · `npx jest --config ./test/unit/jest.unit.js`.
Дев-e2e делаю поднятием реальных `api`/`wd` + Postgres(5433) + Docker и curl-прогоном (см. историю сессии).
