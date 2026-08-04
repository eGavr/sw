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

4. **WS-протоколы**: проксирование `bidi`/`devtools`/`vnc` (сейчас проксируются только HTTP-команды).
   Для интерактива, стриминга и просмотра браузера.

5. **Второй резолвер образа**: «свой базовый linux + доустановка нужного Chrome на старте»
   (договорённость «selenium сейчас, свой потом»). Порт уже конфигурируемый.

6. **Стабилизация конфигурации**: в env-файлах есть устаревший `ENVIRONMENT_PROVIDER` (не читается —
   код использует `COMPUTE_PROVIDER`); задокументировать `COMPUTE_*`. Согласовать `.env.production`.

7. **Тесты — `api`-харнесс СДЕЛАН.** Интеграционный харнесс приведён к текущей реальности и зелёный
   (27/27): `accounts` (self-service create, grant-all owner, AIP-форма/ошибки, `:testIamPermissions`,
   PERMISSION_DENIED не-владельцу, пагинация) и вложенные `accounts/{account}/environments` (CRUD на
   local-compute). Харнесс: stateless local-auth (`Authorization.forUser(id)`), Postgres на 5433,
   `COMPUTE_PROVIDER=local`, `maxWorkers=1` (общая БД + TRUNCATE между кейсами → строго последовательно).
   Осталось: интеграционные тесты `wd`-флоу (create session → proxy → delete) и единый e2e-харнесс.

8. **Пре-существующий ESLint-долг** (~38 проблем в старых файлах, не из этой работы) — подчистить
   `eslint --fix` отдельным коммитом.

9. **Масштабирование**: сейчас `wd` — один процесс; stateless-роутинг по session id это уже
   поддерживает, но инвариант «одна активная сессия на окружение» для docker делегирован ноде
   браузера. Продумать для нескольких инстансов `wd`.

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
`node_modules` стоят. Порт 5432 занят чужим `hyperenv-api-postgresql` → наш Postgres на **5433**.
И `api`, и `wd` теперь требуют Postgres (auth через `UserRepository`).

    # БД + миграции (один раз)
    docker run -d --name sw-db -e POSTGRES_USER=sw -e POSTGRES_PASSWORD=sw -e POSTGRES_DB=sw -p 5433:5432 postgres:16-alpine
    POSTGRES_PORT=5433 npm run pg:migration:run:dev

    # control-plane (api, :3000) — всё под /v1; локальный токен: любой `Bearer <что-то>`
    POSTGRES_PORT=5433 npm run start:api:dev
    curl -X POST localhost:3000/v1/accounts -H 'Authorization: Bearer <user1>' -H 'content-type: application/json' \
      -d '{"displayName":"team-a","resources":{"providerId":"p","providerType":"docker"}}'   # -> uid
    curl localhost:3000/v1/accounts -H 'Authorization: Bearer <user1>'                        # List accounts
    # проверить права (IAM): вернётся подмножество, которым владеет вызывающий
    # ВНИМАНИЕ zsh: используй ${ACC}, иначе $ACC:testIamPermissions съест `:t` history-модификатор
    curl -X POST "localhost:3000/v1/accounts/${ACC}:testIamPermissions" -H 'Authorization: Bearer <user1>' \
      -H 'content-type: application/json' -d '{"permissions":["environment:create","account:read"]}'
    # окружения вложены: POST/GET/LIST/DELETE /v1/accounts/{account}/environments[/{env}]

    # data-plane (wd, :3001) — W3C WebDriver
    POSTGRES_PORT=5433 npm run start:wd:dev
    ENV_ID=$(npm run --silent env:create:dev | sed -n 's/.*"environmentId": "\([^"]*\)".*/\1/p')   # dev-хелпер, минуя api
    SESSION_ID=$(curl -s -X POST localhost:3001/sessions -H 'Authorization: Bearer <user1>' -H 'content-type: application/json' \
      -d "{\"environmentId\":\"$ENV_ID\",\"application\":{\"name\":\"chrome\",\"version\":\"latest\"}}" | sed 's/.*"id":"//;s/".*//')
    curl localhost:3001/sessions/$SESSION_ID/url            # прокси-команды — без токена (доступ по SESSION_ID)
    npm run env:delete:dev -- $ENV_ID

Проверка: `npx tsc --noEmit` · `npx eslint <files>` · `npx jest --config ./test/unit/jest.unit.js`.
Дев-e2e делаю поднятием реальных `api`/`wd` + Postgres(5433) + Docker и curl-прогоном (см. историю сессии).
