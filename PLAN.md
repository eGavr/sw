# План работ

Ветка: `feat.environment-domain-and-compute-backend`.

## Фич-бэклог верхнего уровня (крупные направления, приоритет сверху) — НЕ начато

Все пункты ниже — новые крупные возможности. Общие принципы, которых держимся:
**секреты пользователя НЕ храним** — доступ к его S3 через **делегирование** (bucket policy / cross-account role на нашу
service-identity), мы грузим под своей identity; включение доп-поведения — через **кастомную capability** в запросе сессии
(наш неймспейс, напр. `sw:*`), а не через глобальный конфиг; данные пользователя (логи/видео) складываем **в его хранилище**,
доступ — только у него.

- **A. Выгрузка логов сессии в S3 (opt-in через capability).** Сессия умеет писать логи; их надо **автоматически выгружать в S3**.
  Пользователь указывает, КУДА грузить (его S3-бакет/префикс + доступ), доступ к данным — **только у него** (пишем в его хранилище
  его кредами). Включается **кастомной capability**: указана → логи пишутся и выгружаются; не указана → логи **не пишутся и не
  выгружаются** вовсе (дефолт — выкл, ничего лишнего не копим). Открытые вопросы: где перехватывать логи (агент/нода в env-поде),
  формат/агрегация, момент выгрузки (по завершении сессии vs стриминг), S3-совместимость (Yandex Object Storage — S3-API; плюс AWS),
  хранение S3-кредов в секрет-сторе. Домен: парсинг capability → конфиг сессии; сама выгрузка — driven-порт (gateway к S3).
  **Модель доступа выбрана пользователем: ТОЛЬКО делегирование — секреты пользователя не храним НИГДЕ** (bucket policy / cross-account
  role / SA даёт нашей service-identity доступ; грузим под своей ambient-identity — SDK default credential chain). Работает с AWS/Yandex;
  произвольный MinIO/self-hosted статик-ключами сознательно НЕ поддерживаем.
  **В РАБОТЕ. Сделано (шаги 1–3, всё зелёное — tsc/eslint/unit/integration):**
  (1) абстракция: доменный VO `StorageDestination` (локация `bucket/prefix/endpoint/region`, метод `keyFor`), driven-порт `ObjectStorageGateway`, in-proc фейк `InMemoryObjectStorageGateway`;
  (2) реальный `S3ObjectStorageGateway` (`@aws-sdk/client-s3`, `forcePathStyle` → AWS/Yandex, ambient-identity, БЕЗ хранения кредов) + выбор `LOG_STORAGE=s3|memory`;
  (3) пред-регистрация назначения (1 на аккаунт): таблица `storage_destination` (миграция, БЕЗ credential-колонки), repo/data-source, use-cases,
  **AIP-156 singleton** `accounts/{account}/storageDestination` (`Get` + `Update PATCH`, без Create/List; принимает только локацию — креды НЕ принимаем и НЕ возвращаем),
  новые права `storageDestination:get`/`:set` (admin авто).
  **Сделано (шаги 4–7, всё зелёное — tsc/eslint/unit 87 / integration 71):** capture = **C, on-session-end** (агент шлёт логи по завершении, без стриминга; облачных кредов в поде нет):
  (4) internal-ручка приёма **`POST /internal/environments/{id}/sessionLogs`** (AIP nested-create session-логов под окружением; raw-body ≤16MB; use-case `UploadSessionLogsUseCase` резолвит env→account→`storageDestination`, `null`→no-op `{stored:false}`, иначе ключ `sessions/<env-id>/<ts>/session.log` + `ObjectStorageGateway.put`), + метод `list` в порту/адаптерах;
  (5) `logging?: boolean` в create-session → capability `sw:logging` в сессии ноды (порт `WebDriverSessionGateway.create(...,options)` → `WebDriverClient`);
  (6) тесты: интеграционный приём логов (read-back через `list`+`get`), wd `logging`→gateway, `WebDriverClient` кладёт `sw:logging` в тело `/session`;
  (7) агент (bash): на конце сессии (busy true→false) шлёт offset-дельту лога ноды на ручку; capture решается по `sw:logging` из `/status`; best-effort POST (не-2xx, вкл. 404, НЕ триггерит self-fence).
  **Осталось: (8)** ручной docker e2e + **проверка `/status`-feasibility** (отдаёт ли нода vendor-cap `sw:logging`; если нет → fallback пода-локальный прокси, парсящий `/session`, по решению пользователя); и **read-back API** (ручка чтения/списка логов, feature-step 5). Способ делегирования на проде (bucket-policy на наш principal vs AssumeRole по `roleArn`) — при подключении реального S3.
  **Follow-up (низкий приоритет):** нативный per-session лог-файл драйвера (chromedriver `--log-path` + verbose, свой образ/энтрипоинт) вместо нарезки общего лога ноды по offset — чище/богаче, но требует своего образа (связано с install-at-startup из п.5). Механизм capture на шаге 4 выбран = «агент нарезает из лога ноды».

- **B. Запись видео сессии + выгрузка в S3 (opt-in через capability).** Записывать видео происходящего в сессии и грузить в S3
  (тем же механизмом, что логи в п. A). Включение — через **кастомную capability** (какую именно — решить, добавим свою в неймспейсе
  `sw:*`). Открытые вопросы: чем писать (sidecar `selenium/video` в env-поде vs ffmpeg по дисплею), кодек/битрейт/размер, куда и когда
  выгружать (S3, по завершении), стоимость хранения/трафика.

- **C. Удалённый интерактивный доступ к сессии («посмотреть и порулить руками»).** Дать возможность **буквально подключиться к живой
  сессии и что-то сделать вручную**. **ВАЖНО:** задача — не «заюзать именно noVNC», а обеспечить удалённое интерактивное управление;
  noVNC — лишь один из вариантов, надо оценить и **более качественные решения** (напр. WebRTC-стриминг ввода/картинки, готовые
  интерактивные вьюеры). Отталкиваемся от того, что у selenium-нод уже есть VNC(5900)/noVNC(7900) и мы уже проксируем VNC
  (`ws://{wd}/sessions/{id}/se/vnc`, см. п. 4 «Сделано») — то есть базовый путь есть, но выбор технологии открыт.

- **D. Поддержка Android.** Домен уже обобщён до `Application` (браузер = частный случай), занятость на окружении — как есть; нужен
  compute-адаптер под Android (Appium = WD-эндпоинт во всех вариантах). **Две оси (решено):** (1) ЧТО — capability/стереотип
  (`platformName=android`, версия, `deviceName`, набор приложений; Appium-стандарт, одинаково для всех бэкендов); (2) КАК — **`execution`
  (`container|emulator|device`)** — «на чём исполняется окружение» (индустрия: bare-metal/VM/container = «execution environments»;
  Firebase: virtual/physical). `container` = redroid (и linux-chrome), `emulator` = офиц. QEMU-эмулятор, `device` = реальный.
  **Три бэкенда = три compute-адаптера за одним `EnvironmentProviderGateway`.** `execution` — **первоклассный атрибут стереотипа**:
  задаётся при СОЗДАНИИ окружения (поле `execution`, дефолт `container`), резолвится в аккаунтовый compute-провайдер по `(platform,
  execution)` (провайдер-типы `android-redroid`/`android-emulator`/`android-device`) — БЕЗ инфра-имён в API. **N ProviderAccount'ов на
  аккаунт (решено — закладываем):** аккаунт может держать redroid+emulator+device одновременно; агрегат `ProviderAccount` уже N-на-аккаунт,
  надо лишь дать create-environment резолвить провайдера по `execution` (сейчас берёт «активный» = один; при одном — неявно).
  **`execution` — И match-капа сессии (важно):** раз redroid+emulator могут сосуществовать с ИДЕНТИЧНЫМ стереотипом, сессия адресует
  конкретный через **`sw:execution`** (`alwaysMatch sw:execution=container` = строго redroid; «любой эмулированный» = W3C `firstMatch:
  [{sw:execution:container},{sw:execution:emulator}]`). Для браузеров `sw:execution` не указывается (дефолт `container`). Матч расширяем
  в `SessionAllocationCriteria` (`execution` + platform/device), окружение хранит свой `execution`. Домен-lifecycle/логи/видео/VNC НЕ
  меняются.
  **СДЕЛАНО (эта сессия) — ОСЬ `execution` (домен+API+матч), ветка `feat.environment-execution-axis` stacked на W3C-шаге:** доменный
  enum `Execution` (container|emulator|device, дефолт container) + `Environment.execution`; миграция `environment.execution`
  (NOT NULL default 'container'); create-environment принимает опц. `execution` (`@IsEnum`), presenter его отдаёт; аллокация матчит по
  `execution` (`SessionAllocationCriteria.from({now,freshnessMs,execution,application})` + фильтр `environment.execution = :execution` в
  data-source) и резолвер сессии читает `sw:execution` (дефолт container, невалидное → 400). Браузеры без `sw:execution` работают как раньше
  (container=container). tsc 0 · eslint 0 · unit 101 · integration 85. **НЕ вошло (осознанно, → D3):** резолв ProviderAccount по `(platform,
  execution)` (сейчас один активный провайдер = неявно) и `firstMatch`-альтернативы «любой эмулированный» — вместе с реальным android-адаптером.
  Порядок:
  - **D1 (сейчас): `runtime=redroid` на самоуправляемой YC Compute VM.** Redroid = контейнерный Android на ХОСТ-ядре, **KVM НЕ нужен**;
    запускается как **docker-контейнер** `docker run --privileged redroid/redroid:<ver>` (ложится на существующий docker-адаптер).
    Требует: root-контроль ядра (`modprobe binder_linux`, поэтому Compute VM, а НЕ managed MK8s-нода) + privileged. Отдаёт **ADB:5555** →
    Appium `adb connect` → WD-эндпоинт. Биллинг **посекундный** (Compute VM), on-demand, «платим за реальное». **Первый шаг — де-риск:**
    маленькая Ubuntu Compute VM → `apt install linux-modules-extra-$(uname -r)` + `modprobe binder_linux` (есть ли binder) → `docker run
    redroid` → `adb connect` (загрузился ли Android) → Appium-команда. Минусы Redroid: AOSP без GApps/Play по умолчанию; «Android-в-контейнере»,
    не полный девайс; часть приложений, проверяющих GMS/эмулятор/root, капризничает.
  - **D2 (потом): `runtime=emulator` — официальный QEMU-эмулятор через KVM.** Нужен `/dev/kvm` (полное ускорение; без него single-digit FPS
    / загрузка в минуты — непригодно). YC MK8s/Compute VM **KVM НЕ дают** (nested virt не отдают). Субстраты: **YC Bare Metal** (KVM есть, но
    минимум — целый двухсокетник ~52c/128GB/~1.6TB SSD, ~76k₽/мес, аренда суточно, только RU → только как ПЛОТНАЯ ФЕРМА: пакуем ~15–25
    эмуляторов, сами делаем нарезку (наш контейнер+cgroups) + возвращаем учёт слотов/ёмкости, который выкинули для браузеров) **ИЛИ**
    nested-virt VM в другом облаке (GCP `--enable-nested-virtualization` посекундно / Azure почасово / AWS `.metal`/`c8i`) — точечно «один
    эмулятор on-demand + KVM», без нарезки, но кросс-клауд к нашему control-plane. **ИЛИ** почасовой bare-metal (Scaleway Elastic Metal).
    Ресурсы на 1 эмулятор: ~2–4 vCPU / 4–8GB / ~20–30GB, KVM.
  - **D3 (потом): `runtime=device` — реальные устройства.** Либо своя device-farm (USB-хабы, тяжёлая операционка), либо делегирование во
    внешний device-cloud (BrowserStack/SauceLabs/AWS Device Farm/Firebase Test Lab) через compute-адаптер (железо не наша забота, тариф
    per-device-min). Лучшая точность.
  - Compute pluggable и пер-аккаунт (`ProviderAccount`-роутинг) → Android-компьют может жить на ДРУГОМ провайдере, чем браузеры.

- **E. Поддержка iOS (обязательно ли нужны маки?).** Открытый вопрос-констрейнт: реальный iOS (Xcode-тулчейн, симуляторы,
  WebDriverAgent) по лицензии Apple **работает только на macOS** → нужны Mac-хосты (облачные Mac-провайдеры / bare-metal), а это
  дорого и не вписывается в текущий Linux-k8s. Надо решить: нужны ли маки, и если да — как их подключать как отдельный compute-backend.

**Соответствие Google AIP — СДЕЛАНО** (только control-plane `api`; data-plane `wd` — это W3C WebDriver,
свой стандарт). `/v1`; иерархия `accounts/{account}/environments/{environment}`; `name`/`uid`/`createTime`;
Get/List/Create/Delete (Delete → `{}` — **пересмотреть, см. п.15**); пагинация (`pageSize`/`pageToken`/`nextPageToken`); ошибки AIP-193.
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

**★ БЛИЖАЙШЕЕ / ПРИОРИТЕТ — привести `POST /sessions` REQUEST к W3C-конверту `capabilities` — СДЕЛАНО.**
В фиче C мы привели к W3C только ОТВЕТ create-session (`{value:{sessionId, capabilities}}`), а запрос оставался кастомным
(`{accountId, application, logging, video}`). Теперь запрос — тоже W3C New Session-форма:
`{ "capabilities": { "alwaysMatch": {…}, "firstMatch": […] } }`. Стандартное `browserName`/`browserVersion` называет
приложение, наши поля переехали в vendor-caps: `sw:accountId` (явно — у юзера может быть несколько аккаунтов), `sw:logging`,
`sw:video`. Реализация: тонкая request-модель `CreateSessionRequestModel` (валидирует только конверт: `capabilities` —
object) + **чистый unit-тестируемый резолвер** `session-capabilities.ts` (`resolveSessionRequest`: W3C-merge
`alwaysMatch`+первый `firstMatch` с disjoint-key проверкой → извлекает наши поля; невалидный конверт → 400). Контроллер
зовёт резолвер (ValidationPipe в `wd` без `transform`, поэтому маппинг в контроллере, как в create-environment). Домен/аллокация
(`SessionAllocationCriteria` по name+version) и ОТВЕТ — без изменений; поведение сохранено. Покрыто: unit (9 кейсов резолвера) +
интеграция (конверт, sw:* opt-in-ы, 400 на не-W3C тело и на отсутствие `sw:accountId`). Проверено: **tsc 0 · eslint 0 · unit 98 ·
integration 81**. **Осталось для фичи D:** `sw:execution` (container|emulator|device) и `appium:*` (device/версия) добавятся в
резолвер+`SessionAllocationCriteria` ВМЕСТЕ с доменной осью `execution` (шаг D3), чтобы не плодить мёртвый разбор капы, которую
домен ещё не матчит. **NB (разделение по слоям):** create-ENVIRONMENT (control-plane `api`) остаётся **AIP-ресурсом** (обычный
REST-body: `platform`/`applications`/`device`/выбор провайдера), W3C-`capabilities`-конверт — только у create-SESSION (`wd`).

1. ~~**Idle-reaper / liveness сессий.**~~ **СДЕЛАНО** — делегировано узлу браузера. «Умный»
   idle-таймаут (сброс на каждой команде) и инвариант «одна активная сессия на окружение» отданы
   Selenium-узлу через `SE_NODE_SESSION_TIMEOUT` и `SE_NODE_MAX_SESSIONS=1`; таймаут конфигурируется
   `COMPUTE_DOCKER_SESSION_TIMEOUT` (сек, дефолт 300). **Явный kill** — стандартный W3C `DELETE /sessions/{id}`
   проксируется на ноду (`DELETE /session/{wdSessionId}`); нода завершает сессию, а `busy` само-восстанавливается
   следующим хартбитом агента (окружение снова аллоцируемо). Проверено e2e: сессия переживает активность и умирает
   от простоя; после `DELETE` команда → `NoSuchSession`, `busy=false`. **Спекулятивная доменная idle-машинерия
   удалена** (`Session.idleTimeout`/`isIdleAt`/`touch`/`lastActivityAt`, `SessionId`, `SessionIdleTimeout`,
   `SessionData`/`fromObject`) — в новой модели сессия не персистится и её lifecycle держит нода; `Session` теперь
   чистый immutable-VO результата аллокации. Свой in-process reaper понадобится только для мульти-инстансной
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
   CDP `Browser.getVersion`); юнит-тесты на роутинг. **Follow-up СДЕЛАН:** ответ create-session теперь
   отдаёт `webSocketUrls: {bidi, cdp, vnc}` (абсолютные `ws(s)://{wd-host}/sessions/{id}/se/{proto}`, хост
   берётся из запроса) — клиент не строит URL по конвенции. Явный **VNC e2e** пройден live (первый кадр
   `RFB 003.008` через прокси) вместе с BiDi (`session.status`) на адвертайзнутых URL.

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
   **[стадия 5 — done]** Аллокация сессии: `POST /sessions {accountId, application}` (без `environmentId`). Домен формирует
   предикат (`SessionAllocationCriteria` → `{state=executing, busy=false, heartbeatCutoff, appName, appVersion}`), data source
   транслирует (`findAllocatable`, `EXISTS` по caps, `ORDER BY RANDOM()`); use-case: authZ → кандидаты → optimistic pick+retry
   через driven-порт `WebDriverSessionGateway` (POST на ноду; reject→следующий), без записи в БД; id ответа =
   `SessionRoute.encode(endpoint, wdSessionId)`. Нет свободных/все reject → 409. Покрыт integration (gateway ноды замокан).
   Старый compute-session/env-модель мёртв → удалить отдельным cleanup.
   **Плюс РАСКЛАДКА ПАПОК по литературе** (см. память `current-state`): [done] `data/`→`infrastructure/`,
   use-cases→`application/`, presentation по механизму (`http/{api,wd}` + `worker/`, без уровня `nestjs`);
   **[done] R2** — порт-интерфейсы (repo+gateway) = абстрактные классы в `application/interfaces/{repositories,gateways}/`
   (строгий DIP, DI по токену `{ provide: Port, useClass: …Impl }`), реализации остались в `infrastructure/`
   как `…RepositoryImpl` / `<backend>…Gateway`; общие query-типы (`FindUserQuery`, `FindPermissionsQuery`,
   `CreateEnvironmentParams`) переехали в порт; data-sources остались в infra. Зелёно: tsc 0 · eslint 0 · unit 73 · integration 37.
   Стадии 4–7 — агент+heartbeat / аллокация / GC / auth `/internal`.

10. **IAM access-management (Слой 2, наша authZ) — СДЕЛАНО (Google-модель на ролях, authz переписан с нуля).**
    Развилка «роли vs плоские права» решена пользователем в пользу **ролей** (как рекомендует Google IAM: права
    выдаются только через роль, не биндятся напрямую). Триада google.iam.v1 достроена кастомными методами на
    аккаунте: **`:getIamPolicy`** (нужно `account:getIamPolicy`), **`:setIamPolicy`** (нужно `account:setIamPolicy`,
    заменяет всю политику), плюс уже бывший `:testIamPermissions` (теперь резолвит роли→права). Домен: `RoleName`
    (predefined `roles/{admin,developer,viewer}`) + `Role` (каталог роль→permissions), `Member` (`user:<external_id>`,
    хранится строкой — роль можно выдать до первого логина), `IamBinding`/`IamPolicy` (bind/resolve/grants/test).
    Агрегат `Account` несёт `IamPolicy`; `Account.create` даёт создателю `roles/admin`; authz = `account.grants(member,
    permission)` (аккаунт уже загружен — отдельного чтения прав нет, `AccountUserPermissionRepository`/
    `UserPermissionDataSource`/`AccountUser*` удалены). Хранилище: таблица `account_iam_binding(account_id, role, member)`
    (миграция дропает `account_user_permission`); `AccountDataSource` грузит/replace-ит биндинги, `listByMember` для
    `listByUser`. Контроллер мультиплексит `:{verb}` (валидация body под нужную модель). Проверено: **tsc 0 · eslint 0 ·
    unit 83/83 · integration 57/57** + live (owner создаёт аккаунт → `getIamPolicy` показывает owner=admin → bob без
    прав 403 → owner `setIamPolicy` даёт bob `roles/developer` → bob создаёт env 201 → bob `getIamPolicy` 403).
    Осталось (по желанию, не начато): `:setIamPolicy` etag для optimistic concurrency; кастомные роли; «гейт на вход»
    (allowlist поверх self-service).

11. **Kubernetes compute-адаптер — СДЕЛАНО (второй реальный backend за портом `EnvironmentProviderGateway`).**
    Payoff абстракции compute-провайдера: окружение = **Pod + NodePort Service** в кластере; роутинг по
    `providerType=kubernetes` (аккаунт с `resources.providerType=kubernetes`). Тот же agent-образ Фазы B. Клиент
    `KubernetesClient` — тонкая обёртка над `kubectl` (`apply -f -` через stdin / `delete -l` / `listNodePorts`), как
    `DockerClient` над `docker`. `KubernetesEnvironmentProviderGateway`: идемпотентный provision (снести Pod/Service по
    `sw.environment.id` → выбрать свободный NodePort из диапазона → apply манифеста), deprovision по label. Сеть (оба
    направления доказаны на kind + Docker Desktop): **host→pod** — NodePort из диапазона 30000-30005, замапленного на хост
    (`SW_ENDPOINT=http://127.0.0.1:<nodePort>`); **pod→host** — агент шлёт хартбит на `host.docker.internal:3002` (резолвится
    из kind-пода). `imagePullPolicy: IfNotPresent` (образ загружается в kind через `kind load`, не тянется из registry) +
    emptyDir `medium: Memory` на `/dev/shm` (аналог `--shm-size`). Локальный кластер — `kind` (`k8s/kind-cluster.yaml`),
    конфиг `COMPUTE_K8S_*` в `.env.development`. **Live-проверено полностью:** create env (providerType=kubernetes) → под
    поднялся в kind → агент зарегистрировал → ACTIVE → аллокация → реальный Chromium в поде вернул `{"value":"sw-k8s-ok"}`
    через прокси (host→NodePort→pod) → DELETE → Pod+Service снесены → GC удалил строку. tsc 0 · eslint 0 · unit 80/80 ·
    integration 57/57. **Hardening СДЕЛАН:** env-объекты в отдельном namespace `sw-environments` (`COMPUTE_K8S_NAMESPACE`,
    манифест `k8s/namespace.yaml`); под получает resource requests/limits (`COMPUTE_K8S_{CPU,MEMORY}_{REQUEST,LIMIT}`, дефолт
    500m/1Gi … 2/2Gi); least-privilege RBAC для in-cluster воркера (`k8s/rbac.yaml`: SA `sw-worker` + Role только на
    pods/services в namespace). Live-проверено: env поднимается в `sw-environments` с лимитами, e2e (`sw-k8s-hardened`) + delete
    ок, в `default` ничего не течёт. Осталось (по желанию): self-fence осиротевшего пода полностью не удаляет (нет `--rm` у Pod;
    редкий 404-кейс) → нужен label-vs-DB prune; **in-cluster сетевой режим** (ClusterIP-DNS вместо NodePort+host.docker.internal)
    — главный шаг к реальному облаку; контейнеризация сервиса + его k8s-манифесты.
    **[сделано] in-cluster сетевой режим** — `COMPUTE_K8S_NETWORKING=nodeport|cluster-dns` (cluster-dns: ClusterIP + endpoint
    `sw-env-<id>.<ns>.svc.cluster.local:4444`), проверено на kind (in-cluster probe достучался по DNS). Коммит `cf75420`.

12. **БЕЗОПАСНОСТЬ internal-канала для ПРОДА — ОБЯЗАТЕЛЬНО (пока НЕ сделано).** Сейчас аутентификация агент↔контрол-плейн — это
    ОДИН общий симметричный секрет `INTERNAL_API_SECRET` (заголовок `x-internal-secret`, инъектится в контейнер как
    `SW_INTERNAL_SECRET`, сверяется `InternalSecretGuard`). Риск: секрет общий на все окружения — компрометация одного env-контейнера
    раскрывает секрет для всех; это транспортная M2M-аутентификация, а не идентичность ворклоада. **Для прод-решения обязательно:**
    (а) **TLS на internal-канале** (хартбит + fetch скрипта; сейчас plaintext по внутренней сети); (б) **per-workload идентичность
    вместо общего секрета** — mTLS с клиентскими сертификатами на env-контейнер, либо в k8s — **per-pod ServiceAccount-токены /
    SPIFFE** (projected SA token + audience, проверка через TokenReview), чтобы каждый под аутентифицировался как он сам, а не общим
    паролем. Также ротация/секрет-стор для `INTERNAL_API_SECRET`, пока он используется. Без этого в прод не выкатывать.

13. **Доставка агента без пересборки образа — СДЕЛАНО (`9ee5fee`).** Агент запускается РЯДОМ с браузером в том же контейнере (не
    sidecar — переносимо между докером/k8s/любым рантаймом), но доставляется НЕ вшиванием в образ, а **скачиванием на старте** с
    контрол-плейна: internal-сервис отдаёт `GET /internal/agentScript:download` (`text/x-shellscript`, под тем же
    `InternalSecretGuard`); docker/k8s-адаптеры берут **стоковый selenium-образ** (версия браузера = тег) и инъектят команду-бутстрап
    (`curl -H x-internal-secret … agentScript:download & exec <entrypoint>`; entrypoint в конфиг). Пересборки образа для агента нет
    вообще, любой браузер = стоковый тег. Убран кастомный `docker/agent`. Live-проверено на docker и kind.

14. **Деплой в Yandex Cloud — В РАБОТЕ.** Цель: контрол-плейн в **Managed Service for Kubernetes**, окружения = Pod'ы в том же
    кластере (наш k8s-адаптер + `COMPUTE_K8S_NETWORKING=cluster-dns`). Строительные блоки (research с источниками, в памяти
    `current-state`): MK8s, Container Registry (node-SA `container-registry.images.puller`), Managed PostgreSQL (6432,
    `sslmode=verify-full`, та же VPC), NLB/ALB для api+wd, IAM service accounts, зоны `ru-central1-a/b/d`.
    - **[сделано] контейнеризация сервиса** (`202802c`): multi-stage `Dockerfile` (один образ, 4 entrypoint-а через `command`),
      kubectl в образе (для k8s-адаптера воркера), копирование `.sh`-ассета в build, `pg:migration:run:built` для migration-Job,
      `.dockerignore`; поправлены устаревшие не-dev start-скрипты на реальные пути `build/src/presentation/...`. Образ смоук-проверен.
    - **[сделано] k8s-манифесты сервиса** (`25a0105`): `k8s/` — namespaces (`sw` + `sw-environments`), RBAC (SA воркера в `sw` +
      кросс-ns Role на pods/services в `sw-environments`), ConfigMap+Secret, Deployments api/wd/internal/worker (один образ,
      per-process `command`; SA только у воркера) + ClusterIP-Services, migration-Job, README (build/push в CR, apply, expose
      LB/Ingress). Postgres TLS: `POSTGRES_SSL`/`POSTGRES_SSL_CA` (off для dev/kind, verify-full для managed PG). **Полная облачная
      топология live-проверена на kind:** контрол-плейн подами, in-cluster worker (SA+RBAC+in-cluster kubectl) поднял env-под+Service
      в `sw-environments` (cluster-dns), агент (скачан с in-cluster internal) → ACTIVE, in-cluster wd-прокси достучался по cluster DNS
      → `{"value":"sw-cloud-topology"}`, DELETE снёс pod+svc.
    - **[сделано] Terraform** (`8ef081d`): `terraform/` — VPC+subnet+security-groups, 2 SA с ролями (cluster:
      `k8s.clusters.agent`/`vpc.publicAdmin`/`load-balancer.admin`; nodes: `container-registry.images.puller`), Container Registry,
      MK8s cluster+node-group, Managed PostgreSQL (+db+user); outputs (registry_id, cluster_name, postgres_host_rw). Структурно
      валиден (`terraform init/validate/fmt`), НЕ apply-тестирован (нет облачного аккаунта) — SG-правила/версии сверить с доками,
      для HA — региональный мастер.
    - **[нужен YC-аккаунт юзера]** `export YC_TOKEN` → `terraform apply` (или ручные `yc`); `docker build/push` в CR; заполнить
      `k8s/config.yaml` (PG FQDN из output) + `sw-secrets` + `sw-postgres-ca` (CA.pem); `kubectl apply -f k8s/`; expose api+wd
      (LB/Ingress). Прод-безопасность internal-канала (п.12) — обязательна до боевого запуска.

15. **`DELETE environment` — вернуть ресурс со `state=DELETING` вместо `{}` (AIP-135) — НЕ сделано.** Сейчас
    `EnvironmentsController.deleteEnvironment` возвращает `EmptyPresenter` -> `{}` (валидный `google.protobuf.Empty`).
    Но наш delete **асинхронный/soft**: ручка не удаляет мгновенно, а переводит окружение в `deleting` (физически
    гасит воркер `deprovision`, строку сносит GC) — на момент ответа ресурс ещё существует. По AIP-135 для такого
    случая `Empty` не годится: нужно вернуть **сам `Environment` со `state=DELETING`** (soft-delete; клиент сразу
    видит, что удаление принято и идёт, и поллит `GET` до `404`), либо `google.longrunning.Operation` (если оформлять
    teardown как LRO — тяжелее, операций у нас нет). Выбор: **отдавать ресурс** (мягкий вариант, без LRO-машинерии).
    Правка: `DeleteEnvironmentUseCase` возвращает доменный `Environment` (в состоянии `deleting`) вместо `void`;
    `deleteEnvironment` отдаёт `EnvironmentPresenter` вместо `EmptyPresenter` (убрать `EmptyPresenter` с этого пути);
    обновить интеграционный тест delete (ждать тело со `state=deleting`, а не пустой объект). Мелкий рефактор,
    поведение сноса не меняется — меняется только форма ответа.

16. **Операционное логирование воркера — НЕ сделано (дырка в наблюдаемости).** Сейчас процесс воркера пишет
    ТОЛЬКО bootstrap-строки Nest (`…dependencies initialized`) и дальше молчит: его `LISTEN/NOTIFY`-насос и
    use-case'ы (`PrepareNextEnvironment`, `DeprovisionDeletingEnvironments`, `ReclaimStuck…`, GC-тик) не логируют
    ничего. В итоге в консоли (напр. YC) не видно, что воркер реально делает, — provision/deprovision/reclaim/GC
    проходят без единой строки (сам факт работы виден только косвенно: появился/исчез Pod). Нет и `Nest application
    successfully started` — воркер не HTTP-сервер (standalone-контекст без `listen()`), это ок. Сделать: по строке
    на каждое событие с `env id` и исходом — `claimed`/`provisioning`/`dispatched`, `deprovisioned`, `reclaimed`
    (с причиной), `gc removed`, `failProvisioning` (с `state_reason`); плюс однократная стартовая строка «worker
    listening» после подписки на NOTIFY, чтобы было видно, что насос поднялся. Логгер уже есть (`LoggerModule`);
    добавить его в worker-use-case'ы/насос (структурные поля: `environmentId`, `action`, `outcome`), без чувствительных
    данных (без `wdSessionId`/`credential_ref`). Небольшой код-чейндж + redeploy образа.

17. **Session idle timeout — вынести из backend-конфигов в единую доменную политику (+ опц. override через API) — НЕ сделано.**
    Сейчас idle-таймаут WebDriver-сессии (нода закрывает простаивающую сессию; сброс на каждой команде) задаётся
    **пер-backend**: два отдельных ключа `COMPUTE_DOCKER_SESSION_TIMEOUT` и `COMPUTE_K8S_SESSION_TIMEOUT`, константа
    `defaultSessionTimeoutSeconds = 300` **продублирована** в `docker-environment-config.ts` и `kubernetes-environment-config.ts`,
    каждый gateway сам кладёт её в `SE_NODE_SESSION_TIMEOUT` пода. Это запашок: idle-таймаут — свойство **сессии/окружения
    (домен)**, а не compute-backend'а (тот же селениумовский рычаг независимо от docker/k8s), и он нарушает правило `CLAUDE.md`
    «пороги живости/занятости формирует домен, а data source/gateway лишь транслирует». Сделать: **один backend-агностичный
    источник** таймаута (доменная политика / единый ключ, напр. `SESSION_IDLE_TIMEOUT`), убрать дубль `300`, gateway'и лишь
    транслируют его в `SE_NODE_SESSION_TIMEOUT` (`COMPUTE_*_SESSION_TIMEOUT` удалить/задепрекейтить). **Опционально** — дать
    пользователю override: поле (напр. `sessionTimeout`) в `CreateEnvironmentRequestModel`, протащить как доменное значение
    окружения в gateway вместо глобальной константы (пер-юзер/пер-окружение таймаут). Небольшой рефактор + правка конфигов/тестов.

18. **Надёжная доставка логов сессии: не терять un-shipped-дельту (env удалён до отправки + короткая сессия между тиками) — НЕ сделано.**
    Сейчас агент шлёт логи best-effort на переходе `busy true→false`; из-за этого две родственные потери (обе = «логи сессии не
    доехали в S3»):
    - **(a) env удалён до отправки (гонка).** Сессия закончилась → агент ещё не отправил (шлёт асинхронно на следующем тике) →
      `DELETE env` → воркер `deprovision` = **`docker rm -f`** (SIGKILL, без грейса; в k8s SIGTERM идёт в PID 1 selenium, а агент —
      фоновый процесс) → контейнер+агент убиты до отправки → логи теряются.
    - **(b) сессия короче тика агента (~3с).** Сессия стартовала и закончилась между двумя тиками → агент НИКОГДА не увидел
      `busy=true` → переход `false→true→false` не пойман → отправка не триггернулась (даже без всякого delete).
    Общий корень — доставка привязана к наблюдаемым busy-переходам; всё, что не отправлено к моменту смерти контейнера (или
    не наблюдалось), теряется. **Решение (вариант 1, покрывает обе):** агент ведёт «last-shipped offset» и **флашит всю un-shipped
    дельту** (не «последнюю сессию»), триггеры: (1) конец сессии, как сейчас; (2) **graceful teardown через heartbeat-канал** —
    `DELETE`→`deleting`; в ответе heartbeat сигнал агенту «тебя удаляют» → агент **дошлёт un-shipped-дельту и сам погасится**
    (переиспользует `shutdown_environment` self-fence); воркерский `deprovision` (force-rm) — **фолбэк-реапер** с грейс-задержкой.
    Флаш всей дельты на teardown автоматически ловит и короткие сессии, что были ДО delete (их логи в un-shipped-дельте). Остаток
    (короткая сессия на долгоживущем, никогда не удаляемом env) — добить периодическим флашем un-shipped-дельты или меньшим тиком.
    Переиспользует heartbeat + self-fence, без нового канала. Средняя сложность; прод-robustness (до боевого трафика).

19. **Мульти-провайдерное делегирование в S3 (одна НАША identity на облако) — НЕ сделано.** Сейчас `S3ObjectStorageGateway`
    берёт ОДИН набор кредов (SDK default chain = наш YC service-account-ключ `AWS_*`) и лишь меняет `endpoint` из назначения →
    работает **только с бакетами Yandex Object Storage**. Причина: делегирование требует, чтобы НАША identity была первоклассным
    principal у провайдера бакета; Yandex-SA не principal в AWS (там только IAM role/user, ARN), поэтому в AWS-бакет наш YC-SA
    в bucket-policy не пропишешь. **Хотим: поддержать делегирование под разные облака (YC сейчас, AWS/другие потом), ПО-ПРЕЖНЕМУ
    без хранения секретов пользователя.** Сделать: держать нашу identity **per-provider** (YC service account; AWS IAM role/user
    в нашем AWS-аккаунте; …); в `StorageDestination` различать провайдера (явное поле `provider` или инференс по `endpoint`);
    адаптер **выбирает креды/identity по провайдеру назначения** (endpoint YC → YC-ключ, endpoint AWS → AWS-креды/AssumeRole).
    Для AWS чище всего — cross-account **AssumeRole** на роль в аккаунте пользователя (или bucket-policy на наш principal) с
    условием **external-id** (защита от confused-deputy). Публикуем наши id per-provider (YC SA id, AWS role ARN), пользователь
    грантит их у себя на бакете. **Вне скоупа:** произвольный MinIO/self-hosted (нет общего IAM) — только через хранимые ключи,
    что мы исключили; если понадобится настоящий «любой S3» — отдельный гибрид (делегирование, где можно + секрет-стор, где нельзя).

20. **Куда деть `interactive.html` (noVNC-вьюер) — это по сути frontend — НЕ решено.** Страница-вьюер сейчас лежит внутри
    backend-сервиса `wd` (`src/presentation/http/wd/controllers/interactive/interactive.html`, отдаётся контроллером +
    статика noVNC под `/novnc/`) и копируется в образ отдельным шагом Dockerfile — но это уже **клиентский код (HTML/JS)**, а не
    backend. Когда будем делать полноценный **frontend**, вынести вьюер туда (отдельный frontend-пакет/приложение или CDN-раздача
    ассетов), а `wd` пусть отдаёт только доменные данные (сейчас — `sw:vnc` capability, к которому фронт и цепляет noVNC). Пока
    оставлено в `wd` как batteries-included заглушка; при появлении фронта — переезд + решить раздачу статики (не из backend-контроллера).

21. **Куда положить `heartbeat-agent.sh` — это фактически отдельный сервис/пакет — НЕ решено.** Агент (bash-скрипт, живёт рядом с
    браузером в env-контейнере) сейчас лежит внутри `wd`/internal-контроллера
    (`src/presentation/http/internal/controllers/agent/heartbeat-agent.sh`, отдаётся `agentScript:download`, копируется в образ
    отдельным шагом Dockerfile) — но по сути это **самостоятельный компонент** (in-container agent), а не часть presentation-слоя
    контрол-плейна. Рассмотреть вынос в отдельный пакет `packages/agent/` (или свой модуль/репозиторий) с собственной версткой/тестами/
    версионированием; internal-ручка тогда просто отдаёт собранный артефакт. Связано с тем же вопросом доставки статических ассетов из
    backend (см. п.20) — сейчас и агент, и ffmpeg, и vnc-html доставляются через internal/wd-контроллеры; стоит консолидировать подход.

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
    # сессия аллоцируется по capabilities (W3C New Session), без явного env; ${ACC} — аккаунт, под которым создано окружение
    SESSION_ID=$(curl -s -X POST localhost:3001/sessions -H 'Authorization: Bearer <user1>' -H 'content-type: application/json' \
      -d "{\"capabilities\":{\"alwaysMatch\":{\"browserName\":\"chrome\",\"browserVersion\":\"latest\",\"sw:accountId\":\"${ACC}\"}}}" \
      | sed 's/.*"sessionId":"//;s/".*//')                  # ответ = W3C {value:{sessionId, capabilities:{sw:vnc,…}}}
    curl localhost:3001/sessions/$SESSION_ID/url            # прокси-команды — без токена (доступ по SESSION_ID)
    npm run env:delete:dev -- $ENV_ID

Проверка: `npx tsc --noEmit` · `npx eslint <files>` · `npx jest --config ./test/unit/jest.unit.js`.
Дев-e2e делаю поднятием реальных `api`/`wd` + Postgres(5433) + Docker и curl-прогоном (см. историю сессии).
