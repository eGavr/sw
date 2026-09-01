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
  **read-back API — СДЕЛАНО (session-scoped; ветки `fix.redact-session-ids-in-logs` + `feat.session-logs-readback-server` + `feat.session-logs-agent`).** Логи читаются **по session id**, а не по env:
  `GET /v1/projects/{project}/sessions/{sessionId}/logs` (api). **Проект в URL** (долгоживущий), т.к. окружение эфемерно (GC сносит его раньше, чем читают лог); из проекта резолвим бакет.
  Лог **ключуется по `sha256(wdSessionId)`** (плоско `session-logs/<hash>/session.log`) — сырой секрет не попадает в persistent-ключ; тот же ключ считается на записи и на чтении. Сервер — **делегированная
  прокся**: тянет объект из бакета пользователя под нашей identity. Write-path переехал на session-scoped `POST /internal/environments/{env}/sessions/{sessionId}:uploadSessionLogs`
  (env всё ещё резолвит бакет; сессия — ключ); `SessionLogKey.forEnvironment`→`forSession`. Право **`sw.sessions.get`** (роли developer/viewer). `SessionRoute` поднят в общий `presentation/http/`.
  **Редакция логов:** `LoggingMiddleware` маскирует `/sessions/<id>` во ВСЕХ request-логах (api/wd/internal) — чинит и текущую wd-утечку wire-id. tsc 0 · eslint 0 · unit 142 · integration 105.
  **Агент — СДЕЛАНО (ветка `feat.session-logs-agent`, проверено живым Docker-e2e):** агент захватывает `sessionId` из `/status` `.session.sessionId` во время busy (пропуская Grid-плейсхолдер
  `reserved` — ловится реальный hex-id) и шлёт **сырой** id на session-scoped upload; сервер хэширует. Заодно снят вопрос **`/status`-feasibility**: нода отдаёт vendor-cap **`sw:logging: true`**
  в `.session.capabilities` — опт-ин работает, fallback-прокси не нужен. E2e: реальная нода + агент + фейковый internal → сессия → на конце агент POST-нул на `…/sessions/<реальный-id>:uploadSessionLogs`
  с верным слайсом лога. Способ делегирования на проде (bucket-policy vs AssumeRole по `roleArn`) — при подключении реального S3.
  **РЕАЛЬНАЯ S3-делегация ДОКАЗАНА ВЖИВУЮ (2026-08-26, на задеплоенном стеке):** проект → `PATCH storageDestination` (бакет `sw-session-logs-poc`, endpoint Yandex Object Storage) → браузерная сессия (`sw:logging`+`sw:video`) → логи И **видео** (1.6MB MP4) реально легли в бакет под нашей SA-identity → прочитаны назад через `GET …/sessions/{id}/logs|video`. Грузим под статическим ключом SA `sw-object-storage` (`LOG_STORAGE=s3` + `AWS_*`); бакет лежал в НАШЕМ фолдере, где SA уже имела `storage.editor` — то есть «пользователь грантит нашу identity» по-настоящему НЕ воспроизводили (доступ был ambient). Детали — память [[yc-single-host-deploy]] (Phase 4).
  **Follow-up (UX делегации, из вопроса «какую identity грантить?»):** регистрация бакета (`PATCH storageDestination`) и ВЫДАЧА доступа — два РАЗНЫХ действия; второе (bucket-policy/ACL на нашу identity) пользователь делает у себя в облаке ДО первой сессии, и продукт сейчас **не сообщает, какую именно identity грантить**. Надо отдавать это в `GET storageDestination` (наш SA/identity/ARN, который надо вписать в bucket-policy) + опц. кнопка «проверить доступ» (пробная запись/чтение → сразу «доступ есть/нет», иначе всё молча падает на upload'е позже). Для cross-account AWS — то же плюс `roleArn` (AssumeRole).
  **Follow-up — НЕСКОЛЬКО IDENTITY (мульти-провайдер, реализуемо, ограниченная доработка):** сейчас пишем ОДНОЙ глобальной service-identity (`AWS_*` = наш ключ на одном провайдере), поэтому дотягиваемся только до бакетов этого провайдера (Yandex). Чтобы обслуживать пользователей на РАЗНЫХ S3 (AWS + Yandex + …) одновременно — резолвить креды **под каждый `StorageDestination`**, а не одну глобальную: (1) `S3ObjectStorageGateway.clientFor(destination)` выбирает креды по destination — `roleArn`→**STS AssumeRole** (наша базовая identity ассюмит навешенную пользователем роль → временные креды для бакета), иначе НАШ ключ под провайдера по endpoint, иначе дефолт-цепочка; (2) в `StorageDestination` добавить `roleArn` и/или селектор провайдера (миграция; `roleArn` — не секрет); (3) конфиг наших идентичностей ПО провайдерам (env). **Инвариант «без секретов пользователя» сохраняется:** «несколько identity» = НАШИ идентичности по провайдерам + роли, что нам грантят, но НЕ ключи пользователя. Клиент S3-агностичен уже сейчас (endpoint из destination + `forcePathStyle`) — не хватает только пер-destination резолва кредов.
  **Follow-up (низкий приоритет):** нативный per-session лог-файл драйвера (chromedriver `--log-path` + verbose, свой образ/энтрипоинт) вместо нарезки общего лога ноды по offset — чище/богаче, но требует своего образа (связано с install-at-startup из п.5). Механизм capture на шаге 4 выбран = «агент нарезает из лога ноды».
  **Follow-up (когда-нибудь, НЕ ближайшее):** **live-стриминг логов — доступность ДО завершения сессии.** Сейчас лог батчем уезжает на конце сессии (busy→false), т.е. посмотреть его можно только после end. Хочется отдавать логи **во время** сессии: агент периодически флашит un-shipped-дельту (не только на конце), а read-ручка отдаёт накопленное/tail в реальном времени (append в объект или чанки + склейка на чтении, либо SSE/стрим). Тот же session-scoped ключ уже есть. Связано с **п.18** (надёжная доставка = периодический флаш un-shipped-дельты — та же машинерия, другой мотив). Аналогично можно и видео live, но это дороже.

- **B. Запись видео сессии + выгрузка в S3 (opt-in через capability) — В ОСНОВНОМ СДЕЛАНО.** Capture+upload сделаны ранее (агент пишет mp4
  статическим ffmpeg по X-дисплею, opt-in `sw:video`, стрим-выгрузка на internal). **Read-back — СДЕЛАНО (session-scoped, ветка `feat.session-video-readback`),
  ЗЕРКАЛО фичи A:** видео читается **по session id** — `GET /v1/projects/{project}/sessions/{sessionId}/video` (api, **стримит mp4** из бакета
  пользователя под нашей identity, `@Res()` мимо presenter; право `sw.sessions.get`). Ключ **по `sha256(wdSessionId)`** (`session-videos/<hash>/session.mp4`),
  тот же на записи и чтении. Write-path видео переехал на session-scoped `POST /internal/environments/{env}/sessions/{sessionId}:uploadSessionVideo` (internal-хендлер
  обобщён под logs+video); агент шлёт **сырой** session id (тот же захват из `/status`, что для логов), сервер хэширует. В порт добавлен `getStream` (InMemory + S3
  стримят без буферизации). tsc 0 · eslint 0 · unit 148 · integration 110. Агент-видео проверен по аналогии с живым logs-e2e (тот же session_id + session-scoped URL).
  *(Историческая формулировка ниже.)* Записывать видео происходящего в сессии и грузить в S3
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
    **Доставка (решено): on-demand Compute VM из прешитого golden-image.** sw в MK8s, адаптер под запрос `yc compute instance create` из
    образа, где ЗАПЕЧЕНЫ docker + `sw/android-node` (companion, версионно-независим) + **несколько популярных redroid-тегов** (=версий Android;
    напр. 11/13/14) + binder-модули + startup-юнит (metadata VM → modprobe binder → redroid нужного тега + companion + агент). Печём образ из
    лаб-VM (снапшот диска). **FOLLOW-UP (важно, на будущее):** запечь ВСЕ версии Android в один образ НЕ выйдет — каждая redroid-версия ~3 ГБ
    на диске (11=2.98GB, 13=2.87GB), образ растёт линейно и это тупо долго качать/хранить. Нужен **параметризованный выбор образа**: тянуть/
    выбирать per-версию образ по запросу (pull-on-demand с кэшем, либо per-версия golden-image, либо отдельный слой-том с redroid-тегами). Пока
    печём фикс-набор популярных версий; масштабирование на все версии — отдельная задача.
  - **D2: `runtime=emulator` — официальный QEMU-эмулятор через KVM — CODE-SIDE СДЕЛАН (ветка `feat.android-emulator-adapter`), live-verify отложен.**
    Адаптер `AndroidEmulatorEnvironmentProviderGateway` (`provider="android-emulator"`, зарегистрирован в реестре) — **зеркало redroid**: on-demand
    YC Compute VM из прешитого golden-image **на KVM-платформе**, минимум ресурсов под ОДИН эмулятор, metadata (env id, `sw-android-avd`, internal
    url/secret) → VM сама разворачивается → агент регистрит → executing; `deprovision` = delete VM. **KVM-платформа — параметр** (`platformId`,
    `--platform-id` добавлен в `YandexComputeClient`): оператор подставляет KVM-железо (сегодня YC bare-metal; мини-VM когда появится nested-virt/
    дешёвый per-minute провайдер). Boot-infra `images/android-emulator-node/` (`vm-boot.sh`: проверка `/dev/kvm`, headless AVD с KVM, тот же
    companion, что у redroid — Appium+`/status`-shim+nginx на :4444, agent-fetch; `sw-android-emulator-boot.service`; README с golden-image build +
    de-risk-чеклистом) — **portable на любой KVM-хост**, YC-специфичен только адаптер. Домен НЕ трогали (ось `execution=emulator` уже была). Прешитый
    golden-image (фикс набор версий, AVD `sw-android-<версия>`). tsc 0 · eslint 0 · unit 171 · integration 140. **Осталось (под железо):** де-риск
    на KVM-платформе (см. README-чеклист: `/dev/kvm` → emulator boot → adb → Appium → companion :4444), бейк golden-image, e2e на YC + PLATFORM_ID.
    *(Историческая формулировка — субстраты и трейд-оффы ниже.)* Нужен `/dev/kvm` (полное ускорение; без него single-digit FPS
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
**`{resource}_id` (человекочитаемые id) — ПРОЕКТЫ СДЕЛАНЫ (ветка `feat.human-readable-resource-ids`); ОКРУЖЕНИЯ — следующим PR.**
Реализовано по AIP-133: клиент опц. задаёт `projectId` (`^[a-z][a-z0-9-]*$`, VO `ResourceId`, uuid-форма запрещена во избежание коллизии
с uid-namespace), он идёт в `name: projects/my-team`; не задал → `name: projects/<uid>` (backward-compatible). `uid` (uuid) остаётся
стабильным хэндлом; `displayName` — отдельная изменяемая метка. Дубликат → 409 (`ResourceIdConflictError`, глобально уникален,
партиал-unique-индекс на `resource_id`). Резолв URL-токена — `ProjectRepository.getByHandle`/`findByHandle` (`id::text = h OR resource_id = h`);
`get(ProjectId)` остаётся строго-uuid для внутренних вызовов. ~15 use-case-ов переключены на `getByHandle`. Well-formed-but-missing токен →
404 (не 400). Покрыто: unit `ResourceId` + integration (id в name / фолбэк на uid / lookup по id и uid / дубль 409 / формат 400 / uuid-форма 400 /
вложенный ресурс по human-id). tsc 0 · eslint 0 · unit 171 · integration 133.
**ОКРУЖЕНИЯ — СДЕЛАНО (ветка `feat.environment-resource-ids`).** Те же человекочитаемые id для окружений (`projects/{p}/environments/{env}`):
опц. `environmentId` в create, env-`resource_id` **уникален пер-проект** (партиал-unique-индекс `(project_id, resource_id)`, миграция), дубликат
в проекте → 409, тот же id в другом проекте — ок. Резолв env-токена **в контексте проекта** — `EnvironmentRepository.getByProjectAndHandle`/
`findByProjectAndHandle` (`project_id = p AND (id::text = h OR resource_id = h)`, applications join'ится явно — eager не грузится в QueryBuilder);
`get(EnvironmentId)` остаётся uuid-only для internal. `get`/`delete-environment` теперь резолвят **проект по handle → authorize → env по
(project, handle)** — заодно починен латентный баг «env другого проекта в чужом URL». Env-`name = projects/{projectHandle}/environments/{envHandle}`
(проектный токен эхом в презентер). Покрыто integration (id в name / фолбэк uid / lookup по id и uid / дубль-в-проекте 409 / тот же id в другом
проекте ок / формат 400 / uuid-форма 400 / env под human-id проекта). tsc 0 · eslint 0 · unit 171 · integration 140.

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

12. **БЕЗОПАСНОСТЬ internal-канала для ПРОДА — per-workload идентичность СДЕЛАНА (ветка `feat.per-env-agent-tokens`); TLS остаётся.**
    Было: ОДИН общий секрет на все окружения (`x-internal-secret`), компрометация одного env-контейнера раскрывала доступ ко всем.
    **Сделано (б) — per-env токены вместо общего секрета:** контрол-плейн на провижне минтит **per-environment signed JWT (HS256, `sub`=env id)**
    и инъектит его туда же, где раньше общий секрет (`SW_INTERNAL_TOKEN`; docker/k8s env, YC-VM metadata); агент шлёт `Authorization: Bearer`;
    `InternalAgentTokenGuard` проверяет подпись+`iss`/`aud`/`exp` и **энфорсит `sub` === env из URL** (токен env A не может дёргать env B).
    Ключ подписи — `INTERNAL_API_SECRET`, переосмыслен: теперь **не раздаётся агентам**, а только подписывает/проверяет на контрол-плейне (симметричный
    HS256 — агент лишь bearer, сам не проверяет, PKI/JWKS не нужны). Порт `AgentTokenService` (`issue`/`verify`), impl `Hs256AgentTokenService`,
    провайдер в worker+internal модулях; TTL `INTERNAL_AGENT_TOKEN_TTL_SECONDS` (дефолт 48ч). Тесты: integration покрывает accept валидного, reject
    без токена / невалидного / **токена для другого env** (для обеих форм роута — heartbeat и sessions). tsc 0 · eslint 0 · unit 171 · integration 142.
    **Осталось до боевого трафика:** (а) **TLS на internal-канале** (сейчас plaintext по внутренней сети; терминировать на internal-эндпоинте / меш —
    защищает от кражи токена в транзите/реплея); опц. **ротация** токена (обновлять в ответе хартбита — сейчас щедрый TTL) и секрет-стор для ключа
    подписи. per-env-идентичность закрыта; остался транспорт-шифрование + оперирование ключом на деплое.

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

15. **`DELETE environment` — вернуть ресурс со `state=DELETING` вместо `{}` (AIP-135) — СДЕЛАНО (ветка `fix.api-correctness-sweep`).**
    `DeleteEnvironmentUseCase` уже возвращал `Environment`; контроллер теперь отдаёт `EnvironmentPresenter` (ресурс со `state`)
    вместо `EmptyPresenter` (`{}` убран с этого пути). Тело delete = сам ресурс с текущим lifecycle-состоянием (`DELETING`, либо
    `DELETED` если хартбит уже протух). Интеграционный тест обновлён. См. п.28 про идемпотентность/404. tsc/eslint/unit 104/integration 87.
    *(Историческая формулировка ниже.)* Сейчас
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

16. **Операционное логирование воркера — СДЕЛАНО (базово, ветка `fix.api-correctness-sweep`).** Введён application-порт
    логирования `application/interfaces/logger.ts` (абстрактный класс = DI-токен, как остальные порты; application больше не
    импортирует infra напрямую), в `WorkerModule` привязан к infra-`Logger` через `useExisting`. `PrepareNextEnvironmentUseCase`
    логирует `provisioning`/`dispatched`/`provision failed` (убран `console.error`); `EnvironmentWorker` (presentation) логирует
    старт «listening on …» и «shutting down» infra-логгером напрямую (как middleware). **Осталось (follow-up):** по-событийные
    счётчики reaper/GC/deprovision (сейчас эти use-case'ы возвращают `void` — для «reclaimed N/gc removed N» нужно менять их
    сигнатуры), структурные поля (`environmentId`/`action`/`outcome`). *(Историческая формулировка ниже.)* Сейчас процесс воркера пишет
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

17. **Session idle timeout — единая доменная политика — СДЕЛАНО (ветка `feat.session-idle-timeout`).** Дубль `defaultSessionTimeoutSeconds = 300`
    из `docker-environment-config.ts` и `kubernetes-environment-config.ts` убран; введён доменный VO `SessionIdleTimeout`
    (`domain/entities/session/session-idle-timeout.ts`: `defaultSessionIdleTimeoutSeconds = 300`, `default()`, `ofSeconds(n)` — отвергает
    не-положительное/не-целое → `InvalidArgumentError`). Composition root (`environment-provider-gateway-provider.ts`) резолвит таймаут ОДИН раз из
    **единого ключа `SESSION_IDLE_TIMEOUT`** (fallback — доменный default; кривой конфиг падает fail-fast на старте) и передаёт секунды и в docker-, и в
    k8s-конфиг; gateway'и лишь транслируют в `SE_NODE_SESSION_TIMEOUT`. Ключи `COMPUTE_DOCKER_SESSION_TIMEOUT`/`COMPUTE_K8S_SESSION_TIMEOUT` удалены
    (в .env их и не было). Домен формирует порог, gateway транслирует — по правилу `CLAUDE.md`. Unit на VO. tsc 0 · eslint 0 · unit 137 · integration 99.
    **Пер-окруженческий override через API (`sessionTimeout` в create-environment) — сознательно НЕ делаю (YAGNI):** глобальной доменной политики
    достаточно; появится реальная нужда — VO уже готов принять пер-окруженческое значение, протащим его как атрибут окружения в gateway.
    *(Историческая формулировка ниже.)* Сейчас idle-таймаут WebDriver-сессии (нода закрывает простаивающую сессию; сброс на каждой команде) задаётся
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

22. **Несколько compute-провайдеров на ОДИН аккаунт — резолв `ProviderAccount` по `(platform, execution)` — СДЕЛАНО (ветка `feat.multi-provider-per-account`).**
    `ProviderAccount` теперь хранит субстрат, который обслуживает (`platformName` + `execution`, миграция `1786500000000` с бэкофиллом
    существующих строк по типу провайдера); доменная коллекция `ProviderAccountList.resolveFor(platformName, execution)` выбирает активный
    провайдер точным совпадением субстрата (unit-покрыто); `create-environment` резолвит через неё (`listActiveByAccount` + resolveFor),
    нет подходящего активного → `NoActiveProviderAccountError` (409). **`create-account` `compute` → МАССИВ** `[{provider, externalRef,
    platform, execution}]` (ломающее изменение — no users yet): один вызов заводит все провайдеры аккаунта с их субстратами. Интеграция
    подтверждает роутинг (linux→kubernetes / android→redroid) и 409 на непокрытый субстрат. Runbook обновлён. tsc 0 · eslint 0 · unit 108 ·
    integration 89. **PR-2 (management-API providerAccounts) — СДЕЛАНО (ветка `feat.provider-account-management-api`).** Полный CRUD над
    провайдерами проекта как AIP nested-ресурс `projects/{project}/providerAccounts`: **Create** (`POST`, валидирует `provider` по реестру,
    принимает `platform`/`execution?`/`config?`), **List** (`GET`, все состояния; коллекция мала → без пагинации), **Get** (`GET :id`),
    **Update** (`PATCH :id`, меняет только `config` — provider/platform/execution — identity, креды через секрет-стор), **Delete** (`DELETE :id`
    = **AIP-135 soft-delete → `disabled`**, т.к. FK `environment→provider_account` без onDelete: строка остаётся, из активного резолва выпадает).
    Домен: состояние `disabled` + мутаторы `disable()`/`updateConfig()` + предикат `belongsTo(projectId)` (cross-project → 404, не течём). Права
    **`sw.providerAccounts.{get,list,create,update,delete}`** — **только `roles/admin`** (управление провайдерами = admin-концерн). Презентер отдаёт
    `config` (не-секретный), НО НЕ `credentialRef`. Резолв по `(platform, execution)` уже был (`ProviderAccountList.resolveFor`). Миграция НЕ нужна
    (`disabled` — новое значение varchar-состояния). Покрыто: domain-unit (`disable`/`updateConfig`/`belongsTo`) + integration blackbox (CRUD-цикл,
    authz non-member/non-admin/unauth, unknown-provider→400, cross-project→404). **Осталось (follow-up):** `displayName` (нужна миграция-колонка),
    `:enable` (re-enable disabled), read-права провайдеров для developer/viewer. tsc 0 · eslint 0 · unit 160 · integration 127. *(Историческая формулировка ниже.)* Агрегат
    `ProviderAccount` уже N-на-аккаунт (заложено в дизайне D), НО `CreateEnvironmentUseCase` сейчас берёт **единственный активный**
    провайдер аккаунта (при одном — неявно верно; при нескольких — недетерминированно/неверно). Нужно: (а) create-environment выбирает
    `ProviderAccount` по паре `(platform, execution)` окружения (напр. `android`+`container`→`android-redroid`, `android`+`emulator`→
    `android-emulator`, `linux`+`container`→`kubernetes`), 409 если подходящего активного нет; (б) при создании аккаунта разрешить
    заводить/добавлять несколько `ProviderAccount` (сейчас create-account бутстрапит ровно один из `compute`); нужен способ добавить ещё
    (AIP-ресурс `accounts/{a}/providerAccounts` — create/list/delete, или расширить create-account до массива). Матч сессии по `execution`
    уже готов (ось `execution`, п. D). Это ПРЯМОЕ продолжение D — без него «redroid+emulator на одном аккаунте» не выбираемы.

23. **Версия приложения окружения обязана быть КОНКРЕТНОЙ; `latest` — только capability сессии — СДЕЛАНО (части «а» и «б»).**
    Сделано (часть «а», ветка `fix.api-correctness-sweep`): `Application.create` отвергает зарезервированную версию `latest` (новая доменная ошибка `NonConcreteApplicationVersionError`);
    `CreateEnvironmentUseCase` переведён с `Application.fromObject` (реконституция, толерантна) на `Application.create` (создание с инвариантом),
    поэтому создать окружение с `version:"latest"` теперь `400`; в ответе окружения `latest` больше не появится. Unit + integration покрыто.
    **Сделано (часть «б», ветка `feat.session-latest-version`):** `latest`/отсутствие версии как капа СЕССИИ = «выбрать самую свежую среди поднятых окружений».
    Доменный `RequestedApplication` VO (name + версия ИЛИ latest; omit/"latest" ⇒ latest); порядок версий — `ApplicationVersion.compareTo`
    (dotted-numeric: `141>139`, `9<10`, `1.2==1.2.0<1.2.1`, non-numeric → строковое сравнение; unit-покрыто как сложная чистая логика);
    `SessionAllocationCriteria` несёт nullable-версию (null=latest) и `rank()` — для latest сортирует кандидатов по версии desc (стабильно,
    ties держат random-load-spread), для exact — identity. Data-source: при latest матчит по имени БЕЗ версии и БЕЗ лимита (новейшее выбирается
    в домене — нельзя срезать до сортировки; множество ограничено свободным инвентарём), reload eager `applications` двухшаговым запросом
    (QueryBuilder не грузит eager). Сессия открывается с **конкретным** приложением выбранного окружения (в ответе `browserVersion` — реальная
    версия, не `latest`). Резолвер: `browserVersion` опционален (отсутствие ⇒ latest). tsc 0 · eslint 0 · unit 128 · integration 96.
    *(Историческая формулировка ниже.)* Сейчас
    create-environment принимает любую строку версии (в т.ч. `latest`) и хранит/возвращает её как есть — окружение с `version:"latest"`
    семантически неверно (у поднятого ресурса всегда есть конкретная версия). Правило: (а) домен требует у `application.version`
    конкретную версию (валидатор/VO отвергает `latest`/пустое/диапазоны при СОЗДАНИИ окружения); (б) `latest` живёт ТОЛЬКО как капа
    сессии — при аллокации `browserVersion:"latest"` (или отсутствие версии) означает «выбрать самую свежую среди подходящих ПОДНЯТЫХ
    окружений», резолв — в `SessionAllocationCriteria`/матче (сортировка по версии desc, не строгое равенство). Т.е. версия окружения =
    факт, версия в запросе сессии = критерий выбора. Убрать `latest` из примеров ответа create-environment.

24. **Android live-VNC — companion-образ теперь поднимает VNC-пайплайн — CODE-SIDE СДЕЛАНО (ветка `feat.android-node-vnc`), live-verify под железо.**
    Транспорт (`se/vnc`-прокси + hosted-вьюер `/interactive` + движок `/novnc/`) готов и работает для браузеров; теперь `images/android-node`
    заводит и Android-сторону. **Сделано:** в `Dockerfile` добавлены `xvfb x11vnc websockify openbox libgl1-mesa-dri ffmpeg libsdl2-2.0-0 libusb-1.0-0`
    + скачивание прешитого **scrcpy v4.1** (в bookworm пакета нет; официальный portable linux x86_64, sha256-пиннинг, несёт scrcpy-server+adb;
    поэтому образ строится под `linux/amd64` — совпадает с redroid-VM). `start.sh` запускает пайплайн
    `scrcpy → Xvfb:99 → openbox → x11vnc:5900 → websockify:7900` перед nginx (x11vnc без пароля — доступ гейтит неугадываемый session id;
    geometry дефолт `720x1280`, override `SW_VNC_GEOMETRY`; вход scrcpy пробрасывает обратно на устройство = полное управление). nginx уже
    роутит `/session/*/se/vnc` на websockify. **Проверено:** apt-пакеты резолвятся в bookworm, scrcpy-либы линкуются (ldd 0 not-found),
    образ-слои собираются под amd64 и `scrcpy --version` запускается. **Осталось (под железо):** live-verify всей цепочки на redroid-хосте
    (дешёвый YC Compute VM — redroid контейнерный, KVM НЕ нужен; чеклист в `images/android-node/README.md`), перепечь golden-image (runbook §4),
    e2e через `sw:interactive`. **Не делаем:** серверный view-only (сессии всегда full-control). Скриншот (`GET /session/{id}/screenshot` через
    Appium/UiAutomator2) работает и без VNC. Видео Android (`adb screenrecord`) — follow-up тем же заходом.

25. **Настоящая keyset (курсорная) БД-пагинация — СДЕЛАНО (ветка `feat.keyset-pagination`).** Заменили in-memory offset-`paginate()` на
    **keyset** по `(created_at, id)` на уровне data-source: `application/pagination.ts` (`PageCursor`/`PageRequest`/`Page`/`clampPageSize`),
    infra-хелпер `keysetPage` (order by `(created_at, id)`, `take(limit+1)` для детекта следующей страницы, БЕЗ OFFSET — старт сразу после курсора),
    `ProjectDataSource.pageByMember` (keyset + `IN`-подзапрос по member + `leftJoinAndSelect createdBy`) и `EnvironmentDataSource.pageByProject`
    (keyset + `leftJoinAndSelect applications`, `take()` корректно лимитит корни при OneToMany). Репозитории/use-case'ы отдают `Page<T>` c
    `nextCursor`; presentation кодирует его в **opaque `nextPageToken`** (AIP-158, `page-token`/`next-page-token`, URL-safe, не парсибельный),
    декодирует `pageToken`→курсор. Индексы `1786800000000` под keyset (environment(project_id,created_at,id), project(created_at,id),
    project_iam_binding(member)). Интеграция гоняет обход по токену + end-of-collection. tsc 0 · eslint 0 · unit 108 · integration 90.
    **Нейминг (сверено с AIP-158):** wire = `nextPageToken` (opaque), внутренний `nextCursor` = декодированная keyset-позиция (createdAt,id),
    из которой токен кодируется — разные вещи (cursor ≠ token, как в Relay `cursor`/`endCursor`).
    *(Историческая формулировка ниже.)* Аудит текущего состояния:
    list-ручек ровно две — `GET /v1/accounts` и `GET /v1/accounts/{a}/environments`; **обе** пагинируются единообразно (общий
    `PageRequestModel` `pageSize/pageToken` + `paginate()` + `nextPageToken` в презентере, AIP-158). НО `paginate()` режет **уже
    полностью загруженный список в памяти** (комментарий в `page.ts`: «Real backends would paginate at the data source») → на больших
    объёмах грузим всё. Нужно: опустить пагинацию на data-source (LIMIT/OFFSET или keyset по `created_at,id`), сохранив тот же
    транспорт-контракт. Не-list-ручки, где пагинации нет и **не должно быть**: `storageDestination` (AIP-156 singleton — get/set),
    `:getIamPolicy`/`:setIamPolicy`/`:testIamPermissions` (google.iam.v1 — политика возвращается/пишется целиком, см. п.27). Итог ревизии:
    консистентность формы уже есть; долг — только «настоящая» БД-пагинация.

26. **`:setIamPolicy` etag (optimistic concurrency) — СДЕЛАНО (ветка `feat.iam-policy-etag`).** `getIamPolicy`/`setIamPolicy`-ответ теперь
    несёт **`etag`** — непрозрачный отпечаток содержимого политики (доменный `IamPolicy.etag()`: канонизация биндингов/членов → чистый sync
    FNV-1a-хеш, БЕЗ crypto/I-O, БЕЗ колонки в БД). **Google-стиль (опционален):** `setIamPolicy` с `policy.etag` → при рассинхроне
    `IamPolicyEtagMismatchError` (`ConflictError` → **409 ABORTED**), защищая от lost-update; без etag → слепая перезапись разрешена (как gcloud).
    Инвариант «пишешь поверх версии, что читал» — в домене (`Project.setIamPolicy(policy, expectedEtag?)`). Покрыто: unit (etag стабилен при
    переупорядочивании, различает роли/членов; guard) + integration (current-etag OK+новый etag, stale→409 ABORTED, blind-set без etag OK).
    tsc 0 · eslint 0 · unit 114 · integration 93. **Осталось (по желанию):** клиентские удобства
    add/remove-binding (как `gcloud ... add-iam-policy-binding` — тонкая обёртка read-modify-write над тем же setIamPolicy).
    *(Историческая формулировка ниже.)* Полное переопределение политики
    (read-modify-write) — это САМ google.iam.v1-стандарт (метод заменяет политику целиком), это ок; проблема в другом — у нас нет **etag**,
    поэтому два параллельных `setIamPolicy` затрут друг друга (lost update). Нужно: (а) `getIamPolicy` возвращает `etag` (версия/хеш
    политики), `setIamPolicy` требует его и отвергает при рассинхроне (`ABORTED`/409); (б) опц. добавить клиентские удобства
    add/remove-binding (как `gcloud ... add-iam-policy-binding` — тонкая обёртка read-modify-write над тем же setIamPolicy), чтобы не гонять
    всю политику руками. NB: политика **на один аккаунт** (per-resource), setIamPolicy не трогает «все аккаунты»; масштаб — это много
    биндингов/членов в ОДНОЙ политике, что google решает лимитами (напр. ~1500 принципалов на политику), а не пагинацией.

27. **Именование permission'ов: двоеточие→точка (Google-стиль) — СДЕЛАНО (ветка `refactor.dotted-permission-names`).** Перешли на dotted
    **`sw.<resourcePlural>.<verb>`** (напр. `sw.environments.create`, `sw.projects.setIamPolicy`, `sw.storageDestinations.get`) — консистентно с
    принятой google.iam.v1-моделью. Изменены ЗНАЧЕНИЯ enum `UserPermissionName` (члены `Read`/`Create`/… не тронуты, каталог ролей ссылается на них,
    не на строки); `testIamPermissions` known-names автоматически dotted; тест-строки обновлены. **Декомпозиция `read→get/list` под Google —
    СДЕЛАНА (ветка `feat.iam-policy-etag`, см. п.26):** `sw.<res>.read` → `get` (одна сущность) + `list` (коллекция) → `sw.projects.get`,
    `sw.environments.get`+`sw.environments.list` (роли developer/viewer держат оба; поведение read сохранено). **У проектов НЕТ `list`**
    осознанно: листинг проектов membership-scoped (`listByUser` не проверяет право), гейтить нечего. Verb'ы `create`/`delete`/`getIamPolicy`/
    `setIamPolicy`/`get`/`set` — без изменений. Design-doc (историч.) не трогали.
    tsc 0 · eslint 0 · unit 108 · integration 90. *(Историческая формулировка ниже.)* Мы приняли
    **google.iam.v1** для политики (`bindings`/`members`/roles/`testIamPermissions`), но сами permission-строки у нас в **AWS-стиле**
    `account:read`/`environment:create`/`session:create` (двоеточие = `service:Action`, как в AWS IAM). Google IAM использует **точку**
    `service.resource.verb` (напр. `resourcemanager.projects.get` → у нас было бы `sw.environments.create`, `sw.accounts.setIamPolicy`).
    Двоеточие «работает», но неконсистентно с моделью, вокруг которой строим API. Решить: либо перейти на dotted `sw.<resource>.<verb>`
    (консистентно с google.iam.v1, рекомендуется), либо осознанно зафиксировать AWS-стиль и не путать. Правка затрагивает enum
    `UserPermissionName`, каталог ролей, `:testIamPermissions` вход/выход, знание prod-клиентов.

28. **`DELETE environment` — статус/идемпотентность по AIP-135 — СДЕЛАНО (ветка `fix.api-correctness-sweep`).** Принятое решение (уточнено
    в обсуждении с юзером): DELETE **идемпотентен и возвращает ресурс с текущим lifecycle-состоянием, ПОКА строка физически существует**
    (`DELETING`, либо `DELETED` когда хартбит протух), а `404 NOT_FOUND` отдаётся ТОЛЬКО когда строка физически удалена GC (это уже делает
    `repository.get`). Так `GET` и `DELETE` согласованы (оба видят ресурс, пока он есть; оба `404` после GC), и это ровно AIP-135 soft/LRO-модель.
    Ранний вариант «404 как только `effectiveStatus==DELETED`» ОТВЕРГНУТ — он рассинхронил бы `GET`(200/DELETED) и `DELETE`(404). Мы НЕ делаем
    полноценный AIP-164 (нет undelete/expire_time/show_deleted). Покрыто интеграцией (delete возвращает ресурс; повторный delete идемпотентен).
    *(Историческая формулировка ниже — «две проблемы».)* Две проблемы: (1) сейчас возвращаем `{}`
    вместо ресурса со `state=DELETING` (это уже п.15); (2) **повторный DELETE уже удаляемого/удалённого окружения отдаёт `200`** —
    `Environment.startDeletion()` идемпотентно no-op'ит, если уже `deleting`. По AIP-135 удаление НЕсуществующего (уже собранного GC)
    ресурса → `NOT_FOUND (404)`; для ресурса «в процессе длительного удаления» строгий вариант — вернуть текущую delete-операцию/`state`,
    а не «пустой ОК». Нужно: определить контракт — (а) повторный DELETE в `deleting` → вернуть ресурс со `state=DELETING` (тот же LRO), (б)
    DELETE уже-`DELETED`/отсутствующего → `404` (если не вводим `allow_missing`). Согласовать с моделью soft-delete (строка живёт до GC).

29. **Группы как тип принципала в IAM (федеративная модель) — СДЕЛАНО (ветка `feat.iam-groups`).** Реализовано ровно по Google: IAM только
    **ссылается** на группы, членством НЕ управляет (свою директорию не строим — ни `Group`-агрегата, ни `create`/`addMember`-ручек). Домен
    `Member` учится в `group:<id>` рядом с `user:<id>` (`Member.group`, `fromString` принимает оба). Резолв прав раскрывает группы: `IamPolicy`
    (`grants`/`test`/`permissionsFor`) принимает **НАБОР** принципалов и возвращает **объединение** ролей; `Project.grants`/`testPermissions` —
    тоже по набору. Членство приходит из identity (транзиентно, per-request): `User.groups` наполняется из провайдера в `UserRepositoryImpl`
    (наложение поверх персистентной строки, в БД группы НЕ храним); `AccessControl.principalsOf(user)` = `{user:<id>} ∪ {group:<gid>}`, его
    используют и `authorize`, и `testIamPermissions`-use-case. `setIamPolicy` принимает `group:` в members, `getIamPolicy` отдаёт `group:`
    дословно (без разворачивания в людей). `local`-auth токен расширен до `<id#group1,group2>` для тестов (реальный OIDC-адаптер валидировал бы
    JWT и читал `groups`-claim — та же форма). Малые команды без IdP живут на `user:`-биндингах (группы не обязательны). Покрыто: domain-unit
    (`Member` group, `IamPolicy` union по user+groups), integration (участник через `group:eng` получает права/создаёт окружение — путь
    `authorize()`; `getIamPolicy` verbatim `group:`). tsc 0 · eslint 0 · unit 133 · integration 99. **Осознанно вне скоупа (как и планировали):**
    свой group-directory, вложенность групп (её раскрывает IdP), `domain:`/`allAuthenticatedUsers`, IAM conditions, реальный OIDC-адаптер (когда
    поднимем прод-IdP — новый auth-data-source за тем же портом). *(Историческая формулировка ниже.)* Сейчас `member` — только
    `user:<external_id>`; чтобы дать доступ N людям, надо N биндингов, а политика google.iam.v1 не пагинируется и ограничена по числу
    принципалов (см. обсуждение ~1500/политику). Стандартный ответ Google — **группы**: `group:` считается за ОДИН принципал, но
    представляет сколько угодно людей → роль выдаётся группе, люди кладутся в группу, размер политики не растёт. Ввести это у нас.
    **Что сделать:**
    - Новый тип члена **`group:<id>`** рядом с `user:<id>` (домен `Member` уже строковый принципал — расширить парсинг/типы; строка
      остаётся google.iam.v1-совместимой). `setIamPolicy`/`getIamPolicy`/`:testIamPermissions` начинают понимать `group:`.
    - **Резолв эффективных прав раскрывает группы:** сейчас `AccessControl.authorize` = `account.grants(Member.user(externalId), perm)`;
      станет = объединение ролей, привязанных (а) напрямую к `user:<id>` И (б) к любой группе, где состоит пользователь. Проверка
      остаётся синхронной — значит членство в группах должно быть доступно в момент проверки (загружается с аккаунтом или из identity).
    **РЕШЕНО: делаем ровно по Google-стандарту — IAM группами НЕ управляет, только ссылается на них.** В модели Google группы живут во
    внешнем directory/IdP (Cloud Identity/Workspace/федерация), а IAM лишь биндит роли на `group:<id>` и доверяет directory список групп
    пользователя. Значит:
    - **Мы НЕ строим свой group-directory** (никаких наших `Group`-агрегатов/ручек create/addMember — это ответственность identity-слоя,
      не authZ). IAM-часть только: (а) принимает `group:<id>` как валидный `member` в `setIamPolicy`/отдаёт в `getIamPolicy`, (б) при
      проверке раскрывает группы пользователя.
    - **Членство берём из identity (как OIDC `groups`-claim / directory-API IdP), а не из нашей БД.** authZ-проверка синхронна → набор
      групп пользователя должен приходить вместе с аутентификацией (в `User`/creds), чтобы `account.grants(...)` резолвил без доп. I/O.
    - **Эффективные права = объединение ролей**, привязанных к `user:<id>` И к каждой группе `group:<id>`, где он состоит (плюс, по
      стандарту, `domain:`/`allAuthenticatedUsers` — если понадобятся). `:testIamPermissions` раскрывает группы так же.
    - **Вложенность групп (group-in-group) резолвит directory/IdP**, не мы: IAM получает уже эффективный набор групп юзера — от нас
      никакого обхода дерева членства.
    **Предпосылка (identity-слой, вне самого IAM):** нужен IdP, отдающий группы в токене/claims. У нас сейчас `AUTH_STRATEGY=local` + один
    внешний IdP — прокинуть `groups` из внешнего IdP в `User`; для `local` — тестовый способ задать группы. Это identity-задача, не authZ.
    **Осознанно вне скоупа:** собственное управление членством групп (директория — не наша зона), IAM conditions. Связано с п.26 (etag) и
    п.27 (единый стиль принципалов/имён).

30. **Нейминг: тенант `Account` → `Project`; `ProviderAccount` остаётся — СДЕЛАНО (ветка `refactor.rename-local-provider-to-noop`, стек-коммит).**
    Валидировано против Crossplane (`Provider` vs `ProviderConfig`) / Terraform (`provider`+`alias`) / Cluster API (identity). Переименовано: доменные
    `Account*`→`Project*` (`Account`/`AccountId`/`AccountName`/`AccountRepository`/…, файлы+папки), URL `/v1/accounts`→`/v1/projects`, вложенный роут
    `projects/:project/environments`, IAM-права `account:*`→`project:*` (+ роли/`testIamPermissions`), капа сессии `sw:accountId`→`sw:projectId`,
    presenter/`name`=`projects/{id}`, миграция `1786600000000` (таблицы `account`→`project`, `account_iam_binding`→`project_iam_binding`, колонки
    `account_id`→`project_id` в environment/provider_account/storage_destination), тесты, runbook. **`ProviderAccount` СОХРАНЁН** (защищён при
    ренейме word-boundary + сентинелом для kebab). Historical-миграции не тронуты (создают `account`, новая переименовывает). auth-`local` — другой
    концепт, не тронут. tsc 0 · eslint 0 · unit 108 · integration 89.

31. **Нейминг значений `provider` (реестр адаптеров) — принцип «имя по бэкенду», часть РЕШЕНА.** Принцип: `provider` = имя ЗАРЕГИСТРИРОВАННОГО
    бэкенда (как Terraform/Crossplane), субстрат (`platform`/`execution`) и `config` определяют что на нём крутится. **Имя поля — оставляем `provider`**
    (РЕШЕНО): рассматривали `backend`/`providerType` из-за повтора `providerAccount.provider`, но повтор мягкий и осмысленный (ср. `bankAccount.bank`),
    а `provider` — индустриальный термин. `provider` = «каким адаптером/бэкендом поднимается окружение» (ортогонально `platform`/`execution`).
    - **`local` → `noop` — СДЕЛАНО (ветка `refactor.rename-local-provider-to-noop`).** `NoopEnvironmentProviderGateway` (был `Local…`) ничего не
      поднимает (null-object); ключ реестра `"local"`→`"noop"`, сиды тестов `provider:"local"`→`"noop"`, мёртвый `COMPUTE_PROVIDER=local`→`noop`.
      **NB:** auth-`local` (`AUTH_STRATEGY`, `User.providerType:"local"`, local user data source) — ЭТО ДРУГОЙ `local`, НЕ трогали. tsc/eslint/unit 108/integration 89.
    - **`docker` — ОСТАВИТЬ.** Это бэкенд Docker Engine (демон может быть и удалённым — `DOCKER_HOST`), а не «локальная машина»; «для локалки» было
      лишь usage-примечанием. Имя честное и индустриальное (у Terraform есть провайдер `docker`).
    - **`kubernetes` — ОСТАВИТЬ.**
    - **`android-redroid` → `yandex-compute` (ПРЕДЛОЖЕНО).** Реальный бэкенд — YC Compute VM; «redroid/android» это СУБСТРАТ (platform=android,
      execution=container) + `config` (golden image), а не бэкенд → имя не должно дублировать субстрат. Влечёт follow-up: обобщить адаптер (образ/субстрат
      из `config`, а не хардкод redroid), тогда `yandex-compute` сможет обслуживать и linux-VM. Пока — как минимум переименование значения.

32. **Модель данных `ProviderAccount` — пересматриваем поля (в обсуждении).** Итоговый состав: `provider` (бэкенд), `platformName`+`execution`
    (субстрат — СДЕЛАНО), `externalRef`+`config` (в обсуждении), `credentialRef`, `state`, `displayName`+`labels` (предложено).
    - **`credentialRef` — РЕШЕНО (смысл уточнён, код без изменений):** это **опциональный** указатель на **ОДНУ** запись секрет-стора, содержимое
      которой — **провайдер-специфичный бандл** (файл / JSON / несколько ключей: docker-TLS = ca+cert+key, AWS = key+secret, kubeconfig = документ,
      YC/GCP = ключ SA-JSON), а НЕ «одна строка-пароль». `credentialRef = null` = аутентификация ambient-identity воркера (in-cluster SA-токен,
      IAM-токен из metadata, instance profile) — первоклассный и самый частый кейс для «нашей» инфры. Проверено по всем провайдерам — укладывается.
      Не-секретные параметры аутентификации (режим ambient/explicit, `roleArn` для AssumeRole, `audience` для WIF, region, endpoint) в credentialRef
      НЕ кладём — они в `config`. Follow-up (не сейчас, все текущие пути = null): **резолвер секрет-стора** (gateway `credentialRef → материал`).
    - **`externalRef` → убрать; ввести `config` — РЕШЕНО.** Одна строка `externalRef` не вмещает провайдер-специфичный набор (YC:
      folder/zone/subnet/SG/image/cpu/mem/disk; k8s: context/namespace/networking/image/limits; docker: dockerHost/image/platform) — сейчас всё
      это в install-конфиге `COMPUTE_*`. Решение: **`externalRef` удаляем** (внешний аккаунт/пространство = просто ключ конфига: `folderId`/`context`/
      `dockerHost`), вводим **`config` — непрозрачный JSON-блоб (ОДИН, не два)**, провайдер-специфичный, **не-секретный**. Домен хранит/передаёт как
      `Record<string, unknown>`, НЕ интерпретирует; парсит и **валидирует адаптер** на `create`/add-provider (кривой конфиг → `400`, fail-fast, как и
      валидация `provider` против реестра). Не-секретные параметры аутентификации (режим, roleArn, audience, region, endpoint) — тоже в `config`.
      **Follow-up (заметный рефактор):** перенести `COMPUTE_*` из `configService` в адаптерах на переданный `config` (docker/k8s/yandex-compute) —
      это и «выключает» install-конфиг, разблокируя per-project роутинг + BYO. Сайзинг (cpu/mem/image) пока фиксирован на providerAccount; пер-окруженческий
      сайзинг — будущая капа create-environment.
    - **`state`/`displayName`/`labels` — вводим вместе с потребляющей фичей (YAGNI):** `disabled`-состояние (+`stateReason`) и `displayName`
      приезжают с **PR-2 (management-API providerAccounts)** — сейчас их некому ставить/читать; `state` пока `active|invalid`. `labels`
      (+ `providerSelector` в create-environment) — с **PR-3 (placement)**, когда появляется выбор по меткам. Целевая форма задокументирована,
      но поля добавляем по мере надобности.
    - **Целевая форма `ProviderAccount`:** `id, projectId, provider, platformName, execution, config(JSON), credentialRef?, state
      (active|disabled|invalid), stateReason?, displayName, labels(map), createdAt, updatedAt`. Сейчас-релевантно: `config` (замена `externalRef`)
      + валидация `provider` по реестру; остальное — по фичам (PR-2/PR-3).
    - **Валидация `provider` по реестру — СДЕЛАНО (ветка `feat.provider-config`, слайс 1 PR-B).** Порт `application/interfaces/provider-catalog.ts`
      (`supports`/`list`), impl `RegisteredProviderCatalog` из `registeredProviderTypes` (единый источник рядом с реестром адаптеров),
      провайдится в `ApiModule`. `CreateProjectUseCase` валидирует каждый `compute.provider` ДО создания проекта → неизвестный = `400
      INVALID_ARGUMENT` (fail-fast, без orphan-проекта). Интеграция покрывает. tsc 0 · eslint 0 · unit 108 · integration 90.
    - **`externalRef → config` — СДЕЛАНО (ветка `feat.provider-account-config`, слайс 2 шаг 1, коммит `3672005`).** Доменный `ProviderConfig`
      (`Record<string,unknown>`) + поле `config` вместо `externalRef`; миграция `1786700000000` (add `config` jsonb / drop `external_ref`); typeorm-entity
      (jsonb); `create-project` compute-запись принимает `config` вместо `externalRef` (`@IsOptional @IsObject`); тесты. Пока `config` ХРАНИТСЯ, но
      адаптеры его НЕ читают (используют install `COMPUTE_*`). tsc 0 · eslint 0 · unit 108 · integration 90.
    - **Слайс 2 шаг 2 — DOCKER-часть СДЕЛАНА и проверена вживую (ветка `feat.provider-config-consumption`).** Плумбинг: порт `provision(env,
      providerAccount)` (deprovision без изменений — docker сносит по label, конфиг не нужен; PA в deprovision добавим с k8s/yandex); `PrepareNextEnvironmentUseCase`
      грузит PA окружения (`ProviderAccountRepository.get` по `env.providerAccountId`, null если нет) и отдаёт в `provision`; `RoutingEnvironmentProviderGateway`
      пробрасывает. **Docker-адаптер читает provisioning-config из `ProviderAccount.config`** (`image`/`baseImage`/`platform`/`port`), fallback — install `COMPUTE_DOCKER_*`;
      install-level поля (`internalUrl`/`internalSecret`/`advertiseHost`/`entrypoint`/idle-timeout) остаются глобальными. Чистый парсер `dockerProvisioningOverrides`
      (валидирует типы, кривой конфиг → 400) + `resolveDockerProvisioning` (образ prebuilt/install) — unit-покрыто. `noop`/k8s/android не трогали (TS: метод с меньшим
      числом параметров реализует порт). **Живой Docker e2e:** окружение с `config.image=seleniarm/...` подняло контейнер именно с этим образом (а не install-fallback
      `selenium/standalone-chrome`). tsc 0 · eslint 0 · unit 141 · integration 99.
    - **Слайс 2 шаг 2 — K8S-часть СДЕЛАНА (ветка `feat.k8s-per-project-config`), live-verify на kind отложен.** Зеркало docker-слайса: `provision(env, providerAccount)`
      **читает provisioning-config из `ProviderAccount.config`** (`image` / `port`→`containerPort` / `resources`{requests,limits}), fallback — install `COMPUTE_K8S_*`;
      install-level поля (`namespace`/`networking`/`nodePortRange`/callback URL/secret) **остаются глобальными** — это топология кластера и изоляция (RBAC scoped на
      `sw-environments`), а не per-project. Чистый парсер `kubernetesProvisioningOverrides` (валидирует типы + вложенный `resources`, кривой конфиг → 400) — unit-покрыт.
      Плумбинг (`prepare`-use-case грузит PA → routing-gateway пробрасывает) уже был от docker-части; k8s лишь начал использовать аргумент. Live-e2e на `kind` — когда
      поднимем кластер (сейчас kind снят). tsc 0 · eslint 0 · unit 153 · integration 120.
    - **Осталось (шаг 2, под живую инфру):** **k8s live-verify на `kind`** (пересоздать кластер) — код готов; **yandex-compute-адаптер** читает config
      (`folder`/`zone`/`subnet`/`image`/`cores`) + `deprovision(env, providerAccount)` для namespace/folder + **`android-redroid → yandex-compute`** ренейм — проверяемо только
      на YC. Паттерн доказан на docker + реализован на k8s; yandex — тот же заход, когда поднимем YC.

33. **Честный auth на проде + прогон недавнего IAM/сессий на живой инфре — CODE-SIDE СДЕЛАН, живой прогон с реальным IdP остаётся.** Сейчас
    дефолтная dev/test-стратегия — `local`-заглушка (`AUTH_STRATEGY=local`): токен `<external_id#group1,group2>` разбирается напрямую, БЕЗ проверки
    подписи. Это тест-скаффолдинг, в прод его пускать нельзя.
    - **[СДЕЛАНО] Реальный OIDC-адаптер** — `OidcUserDataSource` за тем же портом (`UserDataSource`), выбирается `AUTH_STRATEGY=oidc`: `jose` валидирует
      подпись JWT по JWKS IdP (`createRemoteJWKSet(OIDC_JWKS_URI)` — сам кэширует + rotation), проверяет `iss`/`aud`/`exp`, извлекает `sub`→`external_id`
      и **`groups`-claim→`User.groups`** (та же форма, что отдаёт `local`). Конфиг: `OIDC_ISSUER`/`OIDC_AUDIENCE`/`OIDC_JWKS_URI`/`OIDC_GROUPS_CLAIM`
      (default `groups`). Тонкая обёртка-клиент `OidcTokenVerifier` над `jose`; JWKS-резолвер инжектируемый → тесты подставляют локальный key set (реальная
      проверка подписи, без сети — «мокаем только внешний IdP-fetch»). Прод-env переведён на `oidc`. Покрыто integration-suite (`api/tests/auth/oidc`):
      валидный токен → аутентифицирован как `sub`; `groups`-claim → доступ по роли группы; tampered/expired/wrong-iss/wrong-aud/unknown-key/non-JWT → 401.
    - **[СДЕЛАНО] Огородить `local` от прода** — при `NODE_ENV=production` фабрика auth-data-source бросает на `AUTH_STRATEGY=local`, честный auth нельзя
      случайно обойти.
    - **[СДЕЛАНО — локально, на реальном IdP] OIDC-адаптер проверен против настоящего Keycloak** (harness `docs/deploy/local-oidc-keycloak/`: docker-compose +
      setup-realm.sh + runbook; бесплатно, без облака). Живой e2e (2026-08-24): реальный подписанный токен Keycloak → `POST /v1/projects` **201**, владелец =
      `user:<keycloak-sub>` (`sub`→external_id); **группы из реального `groups`-claim** → доступ по `group:eng` (bob в группе → 200, carol без группы → 403);
      битый/пустой → 401. **Багов в адаптере НЕ нашлось** — Keycloak-токены принимаются как есть. Тот же Keycloak = брокер под UI-логин (п.35). Грабли (в README):
      audience-mapper (иначе `aud=account`→401), group-membership-mapper `full.path=false`, KC26 «not fully set up» (нужны firstName/lastName/emailVerified/non-temp
      пароль), префикс `/v1` у запущенного сервера.
    - **[ОСТАЁТСЯ] Прогнать на ЖИВОЙ ЗАДЕПЛОЕННОЙ инфре с реальным IdP всё недавнее:** роли + **etag `setIamPolicy`** (п.26), гранулярность **get/list** (п.27-follow-up),
      **`testIamPermissions`**, **группы** (п.29), **latest-капа сессии** (п.23-ч2). Убедиться, что local-scaffolding (`<id#groups>`, лениво-создаваемый юзер) нигде не
      протекает в прод-путь. (OIDC-механика уже доказана на Keycloak локально — осталось повторить на задеплоенном стеке.)
    - Связано с **п.12** (безопасность internal-канала) и **п.14** (деплой в YC) — весь блок прод-безопасности закрываем до боевого трафика.

34. **Редакция session id в логах вшита в глобальный `LoggingMiddleware` — сделать конфигурируемой per-route (тех-долг) — СДЕЛАНО (ветка `feat.route-configurable-redaction`).**
    Было: `redactSessionIds` хардкодил паттерн `/sessions/<id>` прямо в общем `LoggingMiddleware` (фронтит api/wd/internal) — middleware «знал» про конкретный
    чувствительный сегмент. Решение — **вариант (б)/(в): инъекция редакций через DI** (декоратор `@Sensitive()` через reflector отпал — NestMiddleware бежит на
    Express-уровне ДО резолва хендлера, метадату не достать). Механизм generic: `middlewares/url-redaction.ts` — тип `UrlRedaction {pattern, replacement}`, токен
    `UrlRedactions` (Symbol) и чистая `redactUrl(url, redactions)`; middleware инжектит `@Optional() @Inject(UrlRedactions)` (дефолт `[]`) и просто применяет список,
    **оставаясь route-agnostic**. Конкретный паттерн `sessionIdUrlRedaction` объявлен **рядом с `session-route.ts`** (владелец session-id-секрета) и регистрируется
    каждым модулем-владельцем чувствительного роута (`{ provide: UrlRedactions, useValue: [sessionIdUrlRedaction] }` в api/wd/internal). Новый чувствительный роут →
    добавляет свою редакцию в СВОЙ модуль, глобальный middleware НЕ трогается. Unit на `redactUrl` + `sessionIdUrlRedaction`; live-verified (лог показал
    `/sessions/<redacted>/logs`, сырой id в логах отсутствует). tsc 0 · eslint 0 · unit 157 · integration 120.

35. **UI-логин через набор провайдеров (Google/GitHub/…) → identity-брокер выдаёт НАШ токен — НЕ сделано (future, продуктовое направление; выбран брокер-паттерн).**
    Цель: пользователь заходит на наш UI, жмёт «войти через Google/GitHub/…» (конечный список), и дальше self-service — создать проект и добавлять людей в свой
    проект. Это ДВА разных куска: **(A) вход/логин + UI — нового**; **(B) verify токена на каждом запросе API — УЖЕ сделано (п.33) и НЕ усложняется.** create-project
    и `setIamPolicy` уже self-service, так что «дальше создавать проект и звать людей» готово, как только у пользователя валидный токен.
    - **Решение — брокер-паттерн (согласовано с юзером):** поставить identity-брокер (self-hosted **Dex**/**Keycloak** либо тонкий свой BFF-auth-сервис), который
      показывает конечный список провайдеров, федерирует апстрим-IdP и **выпускает ОДИН наш OIDC-токен**. `OIDC_ISSUER` = брокер → наш resource-server (п.33) остаётся
      как есть, по-прежнему один issuer. Именно так работают Keycloak/Auth0/Dex — не изобретаем.
    - **Почему НЕ мульти-issuer прямо в API:** дороже на verify-стороне (несколько JWKS) и **GitHub вообще не OIDC** (OAuth2 без `id_token`/JWKS) — нормализацию разных
      провайдеров держим в брокере, а не в нашем verify.
    - **Ключевые решения при реализации:**
      - **Identity-ключ через N провайдеров:** `external_id` должен кодировать провайдера (`google:<sub>`, `github:<id>`) — у провайдеров разные `sub`-пространства, иначе
        коллизии; IAM-member тоже (`user:google:<sub>`). Брокер как раз даёт единый стабильный `sub`. Опц. account-linking (один человек = несколько провайдеров).
      - **Стабильность identity (важно — иначе мёртвые IAM-биндинги):** сейчас `sub` = СЛУЧАЙНЫЙ UUID Keycloak, привязанный к его БД. Ресет/миграция БД Keycloak → все
        прежние UUID «умирают», люди при следующем входе становятся НОВЫМИ пользователями, а IAM-биндинги (строки `user:<uuid>` в политиках проектов) разом протухают.
        Надо класть в `sub` СТАБИЛЬНЫЙ провайдер-кодированный идентификатор (напр. `yandex:<стабильный-id>` или верифицированный email) через Keycloak protocol-mapper —
        тогда identity переживает пересоздание Keycloak и биндинги не умирают, и это же даёт человекочитаемый member (см. инвайт по email ниже). *(В самом sw осиротевших
        user-СТРОК не копится — IAM-member хранится строкой без FK на users; риск именно в протухании биндингов при смене UUID.)*
      - **Инвайт по email/username:** при брокере можно класть человекочитаемый identifier → «добавить человека по email» становится реальным (сейчас зовём по `sub` —
        числовому id); опц. письмо-приглашение (сейчас никаких уведомлений нет, `setIamPolicy` просто вписывает идентификатор).
      - **Модель членства сверх отдельных пользователей — ОТКРЫТОЕ решение, ОТДАЛЁННЫЕ планы.** Пока осознанно остаёмся на `user:<sub>`-биндингах (уже работает, ничего не
        пилим). «Несколько людей = одна роль» решать позже; варианты разобраны: **(а) app-owned Teams (GitHub-стиль)** — self-service, команда = наш ресурс, инвайт по email;
        подходит self-service-продукту, но требует орг-уровня НАД проектами (чтобы команды переиспользовались) + стабильного identity + invite-by-email; **(б) директорийные
        группы (Google/Yandex Cloud enterprise-стиль)** = наш существующий `group:<id>`-федерейт из Keycloak, НЕ self-service (составом рулит директория/платформа, не владелец
        проекта). Все большие облака (Google/Yandex/AWS) идут путём (б); GitHub/GitLab/Vercel — путём (а). Выбор отложен; для sw как self-service dev-облака ближе (а).
      - **Сессия для UI:** после логина фронту нужна сессия (cookie / наш токен) — это в брокере/BFF, не в resource-server.
      - **Ограничение онбординга (связано):** сейчас create-project открыт ЛЮБОМУ с валидным токеном; при UI-входе решить, ограничивать ли по домену/организации/провайдеру
        (allowlist) — иначе self-service открыт всем, кого пускает брокер.
    - **Скоуп:** наш код (resource-server, IAM, self-service) в основном НЕ меняется; работа — брокер (конфиг/деплой Dex/Keycloak или тонкий свой auth-BFF) + фронт +
      решение про identity-ключ (провайдер-в-`external_id`) и опц. invite-by-email. Связано с п.33 (verify уже готов) и п.14 (деплой).

36. **Storage-семантика имён методов репозитория — `collectGarbage` протёк как сценарный глагол — СДЕЛАНО (ветка `refactor.repository-delete-collectable`).**
    По правилу (CLAUDE.md «Репозитории») публичные методы репозитория обязаны иметь **storage-семантику** (`get/find/list/create/update/save/delete/with` + осмысленные
    варианты `verb+DomainCriterion`), а сценарные глаголы запрещены. `EnvironmentRepository.collectGarbage(criteria)` называл **зачем** (GC-сценарий), а не **что**
    (массовый delete по collectable-критерию) — при том что data-source внизу уже был `deleteCollectable`, а сиблинги следуют конвенции (`listStuckProvisioning`,
    `findAllocatable`). Переименовано `collectGarbage` → **`deleteCollectable`** (порт + impl + вызов); сценарное имя остаётся у use-case (`CollectGarbageEnvironmentsUseCase`).
    Аудит всех репозиториев (project/provider-account/storage-destination/user/environment) — других протёкших сценарных глаголов НЕТ. Behavior-preserving; покрыт GC-интеграционным сьютом.

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
`pnpm install` выполнен в корне монорепы. Порт 5432 занят чужим `hyperenv-api-postgresql` → наш Postgres на **5433**
(уже прописан в `apps/backend/env/.env.development`, оверрайд не нужен). И `api`, и `wd` требуют Postgres.

    # БД + миграции (один раз)
    docker run -d --name sw-db -e POSTGRES_USER=sw -e POSTGRES_PASSWORD=sw -e POSTGRES_DB=sw -p 5433:5432 postgres:16-alpine
    pnpm --filter @sw/backend run pg:migration:run:dev

    # control-plane (api, :3000) — всё под /v1; локальный токен: любой `Bearer <что-то>`
    pnpm --filter @sw/backend run start:api:dev
    curl -X POST localhost:3000/v1/accounts -H 'Authorization: Bearer <user1>' -H 'content-type: application/json' \
      -d '{"displayName":"team-a","resources":{"providerId":"p","providerType":"docker"}}'   # -> uid
    curl localhost:3000/v1/accounts -H 'Authorization: Bearer <user1>'                        # List accounts
    # проверить права (IAM): вернётся подмножество, которым владеет вызывающий
    # ВНИМАНИЕ zsh: используй ${ACC}, иначе $ACC:testIamPermissions съест `:t` history-модификатор
    curl -X POST "localhost:3000/v1/accounts/${ACC}:testIamPermissions" -H 'Authorization: Bearer <user1>' \
      -H 'content-type: application/json' -d '{"permissions":["environment:create","account:read"]}'
    # окружения вложены: POST/GET/LIST/DELETE /v1/accounts/{account}/environments[/{env}]

    # data-plane (wd, :3001) — W3C WebDriver + WS-протоколы (bidi/cdp/vnc): ws://{wd}/sessions/{id}/se/{bidi,cdp,vnc}
    pnpm --filter @sw/backend run start:wd:dev
    # сессия аллоцируется по capabilities (W3C New Session), без явного env; ${ACC} — аккаунт, под которым создано окружение
    SESSION_ID=$(curl -s -X POST localhost:3001/sessions -H 'Authorization: Bearer <user1>' -H 'content-type: application/json' \
      -d "{\"capabilities\":{\"alwaysMatch\":{\"browserName\":\"chrome\",\"browserVersion\":\"latest\",\"sw:accountId\":\"${ACC}\"}}}" \
      | sed 's/.*"sessionId":"//;s/".*//')                  # ответ = W3C {value:{sessionId, capabilities:{sw:vnc,…}}}
    curl localhost:3001/sessions/$SESSION_ID/url            # прокси-команды — без токена (доступ по SESSION_ID)
    pnpm --filter @sw/backend run env:delete:dev -- $ENV_ID

Проверка (из корня): `pnpm --filter @sw/backend run build` · `pnpm --filter @sw/backend run lint` · `pnpm --filter @sw/backend run test:unit`.
Дев-e2e делаю поднятием реальных `api`/`wd` + Postgres(5433) + Docker и curl-прогоном (см. историю сессии).

## UI / дашборд (frontend) — В РАБОТЕ

**Стек (выбран, сверено с мировой практикой):** pnpm-монорепа, приложение `apps/frontend` = **Next.js (App Router) + Auth.js (NextAuth v5, Keycloak-провайдер) + Mantine**. Дизайн — НЕ с нуля: тема Mantine + готовые блоки Mantine UI, расширяем по мере надобности.

**Аутентификация = BFF-паттерн (самый безопасный из 3 по IETF «OAuth 2.0 for Browser-Based Apps»; сверено с Auth0/Curity/FusionAuth).** Наш OIDC-токен живёт ТОЛЬКО на сервере Next (BFF); браузер держит лишь httpOnly cookie-сессию; route-handlers `/api/sw/*` проксируют к sw `api`/`wd`, подставляя `Bearer` на сервере. Токена в браузере нет. Гочи: отдельный **confidential** Keycloak-клиент `sw-web` (не public `sw-api`) + audience-mapper `aud=sw`; форвардить **access_token** (не id_token); refresh в jwt-колбэке; НЕ отдавать токены через `/api/auth/session`; нормальный TLS (наш Caddy self-signed → back-channel Node↔Keycloak споткнётся; нужен реальный серт по DNS-01). CORS не нужен. Механизм BFF-сессии (encrypted-cookie vs server-store) — при wiring auth.

**Модель секретов (СОГЛАСОВАНО):** `session-id` несёт секрет `wdSessionId` → **не храним НИГДЕ** (ни БД, ни кука, ни localStorage) — консистентно с «секрет сессии не персистим». После создания сессии показываем id **один раз** (copy) — дальше он у пользователя, как session-id у обычного WebDriver-клиента. Взаимодействие — через **stateless «Inspect session»**: вставил id → VNC / логи / видео (readback project-scoped, право `sw.sessions.get`). Ничего at-rest. **Durable-история сессий — отдельная будущая фича** (неизбежно требует персистить capability → отдельное решение по секрету; вариант «RAM BFF + прокси VNC-WS по opaque-хэндлу» — тоже без БД).

**Экраны MVP:** Login (Keycloak → Google/Yandex) → **Projects** (+create) → **Project → Environments** (список + `state`; +create/+delete; +New session) → **New session** (capabilities + тумблеры `sw:logging`/`sw:video`; id один раз) → **Inspect session** (Live-VNC / Logs / Video, stateless). Якорь — окружение; отдельной вкладки-списка сессий нет (у бэкенда нет ручки «список сессий»).

**Доставка — ИНКРЕМЕНТАЛЬНО, маленькими под-PR, каждый запускаем и открываем локально** (`pnpm --filter @sw/frontend dev`), а не одним большим PR:
- **шаг 1:** скаффолд Next+Mantine — рендерится AppShell + плейсхолдер Projects (моки/пусто), БЕЗ auth. Открывается локально.
- **шаг 2:** Auth.js (Keycloak, BFF) + `/api/sw/*` прокси → реальный список Projects.
- **шаг 3:** Project → Environments (список/create/delete).
- **шаг 4:** New session (caps + тумблеры, id один раз).
- **шаг 5:** Inspect session (VNC/Logs/Video, stateless).

**UX-бэклог (мелочи с живых прогонов):**
- ~~Дизейблить «New environment» без облака~~, ~~«New project» в UI~~, ~~свободный `displayName`~~ — СДЕЛАНО (PR #58).
- ~~Confirm-диалог при удалении busy-окружения~~ — СДЕЛАНО (ветка feat.confirm-busy-delete): «Delete environment» на busy-строке открывает подтверждение с честным текстом («сессия будет убита, её логи/видео не сохранятся»), на остальных строках удаляет сразу.
- **Settings-таб: раздел Storage (S3).** Структура UI проекта переехала (по решению юзера 2026-08-29): табы **Environments | Sessions | Settings**; Inspect-страницы больше нет — просмотр/убийство сессий живёт в Sessions-табе (deep-link `?tab=sessions&session=…` со строки окружения); Clouds стал первым разделом Settings. Следующее наполнение Settings — **раздел Storage**: настройка `storageDestination` (бакет/префикс/endpoint/креды) через UI поверх существующих GET/PATCH ручек.
- **Пагинация в UI: projects (сайдбар) и environments (таблица).** API давно умеет keyset-пагинацию (AIP-158: `pageSize`/`pageToken`, дефолт 50, max 1000), но UI берёт ТОЛЬКО первую страницу и игнорирует `nextPageToken` — после 50 элементов список молча обрезается. Фронт: load-more/infinite по `nextPageToken` (`useInfiniteQuery`). `cloudAccounts` — без пагинации by design (горстка на проект, отдаётся целиком), там ничего не надо.

- **Connection-check плашка дёргает вёрстку при refresh (и Storage, и Cloud).** При нажатии recheck (и на авто-probe) статус переключается на «checking…» (спиннер + текст другой ширины), из-за чего строка/блок прыгает — заметно и в health стораджа (`storage-settings.tsx`), и в бейдже облака (`clouds-tab.tsx` `CloudReachabilityBadge`). Фикс: зарезервировать фиксированную ширину/высоту под статус (min-width или overlay-спиннер поверх текущего статуса, не заменяя его), чтобы layout не сдвигался. Мелочь, но общая для обеих проверок — сделать единообразно.

**Backend follow-ups для occupancy (ОТДЕЛЬНЫМИ шагами, НЕ во фронт-PR):**
- **Отдать `busy` (bool) + `lastHeartbeatAt` в GET environments.** Presenter сейчас отдаёт только `state`. Занятость **ортогональна** lifecycle: и свободное, и занятое окружение — оба `state=executing`/`ACTIVE` (сессия не меняет lifecycle, `busy` ставит хартбит агента) → из `state` не вывести. `busy` — не секрет. Два потребителя в UI: (1) колонка Occupancy (`busy`/`free` + свежесть хартбита); (2) **гард кнопки «New session» на строке окружения — занятый env дизейблить с подсказкой**, а не вести пользователя к отказу (как гард «New environment без облака»). Сервер занятый таргет и так отбивает 409 (`TargetEnvironmentNotReadyError` / reject ноды) — это UX-гард, не замена серверной проверки.
- **Таймстемпы перехода `busy↔free`** («стало занято/свободно в HH:MM»): бэкенд сейчас НЕ пишет момент перехода (только `updatedAt`/`lastHeartbeatAt`) → нужна доп-колонка/событие. Для UI «busy since / free since».

## Редизайн аллокации сессий: пессимистичная РЕЗЕРВАЦИЯ вместо optimistic pick+retry — СДЕЛАНО (ветка feat.session-reservation, live-проверено)

Итоговые имена (решения юзера в ходе ревью): колонка занятости — `occupancy` (`free|reserved|busy`), её подтверждение — **`occupancy_last_confirmed_at`** (штампуют ВСЕ переходы occupancy + keep-alive резервации + агентский хартбит для busy/free; агентское `busy=false` при `reserved` сознательно НЕ подтверждает — так мёртвая резервация протухает при живом агенте); агентский хартбит остался `last_heartbeat_at`. Ошибка ноды наружу = W3C `session not created` (500, InternalError с причиной; `tryAllocate`-глотание умерло; wd ErrorInterceptor отдаёт сообщение 500-х доменных ошибок). Гонка «агент отстучал busy=true раньше occupy()» решена идемпотентным `occupy()` (busy→busy = тот же успех). Live e2e: FREE → create → BUSY (мгновенно) → kill → FREE (~3с хартбитом). Гейты: tsc 0 · lint 0 · unit 211 · integration 170 (+ suite reservation-sweep).

Спека юзера, согласована 2026-08-30. Мотивация: честная модель занятости (сегодня eager `occupy()` пишет `busy=true`, когда правда «зарезервировано»; UI подпирает freeing-маркером в localStorage), честная пропагация ошибок ноды (сейчас `tryAllocate` глотает любую ошибку → невнятный 409), не жечь дорогие create на android (10–20с) в перебор. Нода с `SE_NODE_MAX_SESSIONS=1` остаётся финальным арбитром-предохранителем.

1. **Домен:** occupancy — отдельный enum `free | reserved | busy` вместо bool `busy` (ортогонален lifecycle-state). Методы: `reserve(now)` (только executing+free+свежий агентский хартбит), `releaseReservation()` (reserved→free; env НЕ удаляется), `occupy()` (reserved→busy), `heartbeat(busy)` с правилом: агентское `busy=false` при `reserved` НЕ затирает резервацию (агент ещё не знает о создаваемой сессии), `busy=true` → busy.
2. **Схема:** колонка `occupancy` (миграция из `busy`), два самоописывающих хартбита (решение юзера — каждая колонка называет своего хозяина): `last_heartbeat_at` → **`agent_heartbeat_at`** (слово агента: нода жива) + новая **`reservation_heartbeat_at`** (слово wd: ещё создаю сессию). Раздельно из корректности: общая колонка = живой агент вечно освежал бы резервацию мёртвого wd. На проводе остаётся `lastHeartbeatTime` (наружу торчит только агентский — двусмысленности нет). Частичный индекс `WHERE occupancy='reserved'`. Миграции в ОБЕ базы (sw, sw_test).
3. **Индекс-аудит (решение юзера: без неиндексированных запросов даже на мелких данных):** EXPLAIN по горячим запросам + одна миграция: `(state, created_at)` под withNext, `(state, updated_at)` под реапер, `(state, last_heartbeat_at)` под crashed/GC, составной под findAllocatable, `environment.cloud_account_id` (FK-проверка при DELETE cloud_account), `cloud_account.project_id`.
4. **Data source:** атомарный захват — ранжированные кандидаты (latest-ранг доменный) → условный CAS `UPDATE … WHERE id=$1 AND occupancy='free' … RETURNING`; промах → следующий кандидат (это дешёвый БД-CAS, «без ретраев» = без повторных create на ноду). Таргет `sw:environmentId` — тот же CAS по одному id, промах → 409.
5. **Use case create-session:** reserve → ОДИН create на ноду (с клиентским таймаутом-предохранителем ~60с против зависшей ноды) → успех: `occupy()` + ownership-upsert; неуспех: `releaseReservation()` + настоящая ошибка ноды клиенту (без перебора).
6. **Reservation-хартбит в wd:** пока ждём ноду — каждые ~3с `UPDATE reservation_heartbeat_at`. Хартбит, а не lease-дедлайн (решение юзера): не надо угадывать per-type таймауты создания, и мёртвый wd детектится за ~10с, а не «когда истечёт таймаут».
7. **Воркер-свип протухших резерваций:** ОТДЕЛЬНЫЙ тик `WORKER_RESERVATION_SWEEP_INTERVAL_MS` (дефолт 3000; порог `RESERVATION_STALENESS_MS` 10000), атомарный UPDATE под advisory-lock, критерий формирует домен. Свип = страховка на смерть wd; живой неуспех wd чистит сам. Событийность (pg_notify на reserved) осознанно отвергнута: протухание — это тишина, событие «стал reserved» происходит, когда проблемы ещё нет; watchdog-таймеры = тот же поллинг в памяти + всё равно нужен догоняющий свип. Нагрузка: свип O(1) на инсталляцию (advisory-lock), не растёт с юзерами; доминирующая запись в БД — агентские хартбиты, не свип.
8. **Wire:** `busy: boolean` в GET environments заменяется `occupancy: FREE | RESERVED | BUSY` (breaking ок).
9. **UI после бэка:** в Actions env ТОЛЬКО удаление; кнопка старта сессии переезжает к статусу (бейджу free); попап старта: «запустить» → просто закрывается (результат-вью с id умирает); у busy — стрелка-переход в Sessions (уже есть); `reserved` — отдельный серый бейдж; freeing-маркер localStorage вероятно упростить/убрать.

## Sessions-таб: порядок табов + командный блок VNC — СДЕЛАНО (ветка feat.session-commands)

Спека юзера (2026-08-30), реализовано:
- **Порядок табов: Logs | Video | VNC**; **активный таб по пути входа** — deep-link со строки env (живая сессия) → VNC, ручной ввод id → Logs.
- **Командный блок под VNC-табом** (`SessionCommandBar`): команды = массив дескрипторов (label + опц. input + run), новая WD-команда — ещё один элемент, без перевёрстки. Пока две: **Delete** (kill по capability) и **Go** (переход по URL — W3C Navigate To `POST /sessions/{id}/url` через `/api/wd`; голый хост дополняется `https://`). Ошибки команд — notifications-тостами. Delete из шапки табов удалён.
- **Удаление сессии со страницы envs** (решение юзера: гибрид): частые/безопасные действия остаются у occupancy-бейджа (▶ старт на free, ↗ переход на busy), разрушительные собраны в **кебаб-меню (⋯) в Actions** с секциями «Session» (Delete session — только busy+создатель; recover id → kill → freeing-маркер) и «Environment» (Delete environment, с подписью «kills its running session» на busy). Две мусорки-близнеца в одной строке исключены by design.

## Follow-up: VNC-труба переживает смерть сессии — capability-дыра — СДЕЛАНО (ветка fix.ws-pipe-liveness)

Улов юзера (2026-08-31): после удаления сессии установленное VNC-соединение продолжает работать (кликать можно) — x11vnc живёт на уровне контейнера и показывает дисплей, а наш ws-прокси stateless и качает байты, пока сторона не закроется (ре-валидации нет). Опасность: окружение переиспользуется → держатель трубы по МЁРТВОМУ session id увидит СЛЕДУЮЩУЮ сессию (возможно чужую). Доктрина «смотрит владелец id живой сессии» должна быть честна непрерывно, не только на connect. Фикс двумя слоями:
1. ✅ **wd ws-прокси ре-валидирует установленные трубы**: upgrade по мёртвому id отсекается ДО похода на ноду; живая труба сверяется раз в `WD_PIPE_LIVENESS_INTERVAL_MS` (дефолт 10с) через `/status` ноды (ProbeSessionLivenessUseCase — без команд в сессию) и рвётся close(1000, "session ended") при смерти. Интеграционный сьют websocket-liveness (fake-нода, отказ на входе + разрыв установленной).
2. ✅ Пояс: **агент перезапускает x11vnc на грани busy→false** (`pkill -x x11vnc`, supervisord поднимает) — рубит и прямые трубы к дисплею. Действует для НОВЫХ окружений (старые несут прежний скрипт агента до пересоздания).

Обходимость (вопрос юзера): в правильном деплое обойти валидацию нельзя — endpoint'ы окружений внутренние, наружу торчит только wd (VNC контейнера не публикуется, Grid-нода проксирует его через свой 4444, доступный лишь нашим сервисам). НО это сетевой инвариант ДЕПЛОЯ, не кода: env-порты не должны публиковаться наружу (на single-host VM прикрыто security-group; ужесточение — публиковать порты нод только на внутреннем интерфейсе). Ставка выше VNC: прямой доступ к ноде позволил бы создавать сессии мимо нашей authN. Локальный dev — исключение по природе (оператор владеет машиной).

## Follow-up: агент отгружал логи/видео FOREGROUND и ломался при быстром переиспользовании env — СДЕЛАНО (ветка fix.agent-artifacts-reuse-safe, live-проверено)

Улов юзера (2026-08-31): логи/видео сессии агент отгружает УЖЕ ПОСЛЕ ответа пользователю на DELETE, а с ретраем (и до него — с резервацией) новая сессия может сесть на тот же env почти сразу. Артефактный конвейер агента (`heartbeat-agent.sh`) предполагает ЗАЗОР между сессиями на окружении — быстрое переиспользование это ломает. Разбор:
- **Логи — деградируют.** Слайс `[log_offset, size]` отгружается синхронно на грани busy→false, ДО того как новая сессия (ей нужно ~1–2с на create+start) успевает дописать — сам старый лог чистый. НО `log_offset` для СЛЕДУЮЩЕЙ сессии берётся из `idle_offset = log_size()`, вычисленного ПОСЛЕ отгрузки видео (foreground, до ~15с) — к этому моменту новая сессия уже пишет → её слайс стартует слишком поздно и ТЕРЯЕТ начало.
- **Видео — хуже.** Запись останавливается/финализируется на грани (кадры только старой сессии — ок), но finalize+upload идёт FOREGROUND и блокирует цикл на ~15с+. За это время: (1) нет хартбитов → у только что занятого новой сессией env хартбит протухает (>6с) → **reaper (`reclaimCrashed`) может снести env с НОВОЙ сессией как crashed и депровизнуть контейнер** — реальный риск для больших видео; (2) общий `/tmp/sw-session.{log,mp4}` и однопоточное состояние (`log_offset`/`session_id`/`prev_busy`) рассчитаны на «одна сессия за раз с зазором».
- **Корень:** конвейер = single-session-at-a-time-with-a-gap; быстрое переиспользование (которое ретрай сделал нормой, а не редкой гонкой) инвалидирует допущение.
- **Реализовано:** (1) на грани — синхронный СНИМОК слайса лога в keyed-файл (`/tmp/sw-session-<seq>.log`), upload детачед; (2) видео — recorder-подшелл на токен (`/tmp/sw-rec-<token>.{fifo,mp4}`), сигнал остановки через stop-файл, несущий session id (надёжно известен только на грани), finalize+upload в фоне; (3) fd 9 локален каждому подшеллу — перекрывающиеся recorder'ы не конфликтуют; (4) край цикла теперь быстрый → `idle_offset` снимается вовремя, слайс следующей сессии стартует верно. **Live-тест:** две сессии подряд на одном env (B через ретрай, немедленно) → у каждой свои целые логи (B начинается со своего создания, не контаминирована A) + валидные MP4 разного размера; env пережил переиспользование. Изолированная симуляция подтвердила механику stop-файла/fd на перекрывающихся recorder'ах.
- **Связь:** ретрай (`feat.allocation-retry`) корректен для АЛЛОКАЦИИ, но делает немедленное переиспользование ОЖИДАЕМЫМ путём — поэтому этот фикс становится следующим по важности бэкенд-пунктом. Родственно «session-логи укорочены» ниже (тот же агент).

## Follow-up: graceful-удаление окружения (дать логам/видео живой сессии доехать) — НЕ начато

Вопрос юзера (2026-08-31): если убиваем ОКРУЖЕНИЕ с живой сессией — можно ли gracefully, чтобы её логи/видео успели выгрузиться? Сейчас — НЕТ: delete busy-env → `deprovision` → `docker rm -f` → SIGKILL → агент и сессия гибнут резко, артефакты идущей сессии теряются (UI это честно предупреждает в confirm-диалоге). Почему нетривиально: у агента нет входящего канала (только polls), он не PID 1 (энтрипоинт/supervisord), а finalize+upload видео может превысить короткий docker-stop grace.

Варианты (обсудить при заходе):
1. **Drain-протокол (детерминированный, рекомендую как честную форму):** новое состояние env `draining`, которое агент видит (в ответе на хартбит или отдельным poll) → завершает сессию, отгружает артефакты (уже keyed+backgrounded после `fix.agent-artifacts-reuse-safe`), рапортует «drained» → только тогда воркер `deprovision`. Control-plane-driven, гарантирует доставку.
2. **Graceful docker stop + обработка сигнала:** агент как PID 1 (или форвардинг SIGTERM через supervisord) трапит SIGTERM → drain → exit в пределах `docker stop --time`. Проще инфраструктурно, но ограничено grace-периодом и маршрутизацией сигнала.
3. **Прагматичный best-effort (дёшево):** на delete-if-busy сперва «прибить сессию» — это НАШ серверный вызов к ноде (`webDriverSessionGateway.deleteSession(endpoint, wdSessionId)`, wdSessionId берём с `/status` ноды, механизм как у `sw/alive`/recovery; пользователь по-прежнему шлёт один `DELETE environment`, вся цепочка прячется в `DeprovisionDeletingEnvironments`), агент ловит busy→false и с НОВЫМ фоновым пайплайном бэкграундит отгрузку, подождать ограниченный grace, потом `deprovision`. Не гарантирует, но с keyed+background-пайплайном почти всегда довезёт за копейки. Покрывает только ШТАТНЫЙ путь (наш deprovision); аварийные обрывы (краш, ручной `docker rm`) graceful-путём не покрыть в принципе.

**Решение юзера (2026-08-31): НЕ сейчас и НЕ бросаться на вариант 3.** Отдельной задачей ещё раз взвесить все три (drain-протокол vs сигнальный vs прагматичный best-effort) — с учётом гарантий доставки, стоимости, влияния на модель окружения и на возможный будущий rewrite агента ([[этот же PLAN]]: агент off-bash) — выбрать ЛУЧШИЙ способ и починить именно им. Не лепить дёшево ради галочки.

Связано с UX-пунктом «confirm при удалении busy-env» (там честно пишем «логи/видео не сохранятся» — graceful-путь это предупреждение снимет) и с `fix.agent-artifacts-reuse-safe` (фоновый пайплайн — фундамент для варианта 3).

## Follow-up (подумать, возможно НЕ делать): переписать in-container агента с bash на что-то посерьёзнее — РАССМОТРЕТЬ

Мысль юзера (2026-08-31): `heartbeat-agent.sh` подрастает (~350 строк, и в нём уже нетривиальная логика — reuse-safe recorder-подшеллы с fifo/fd/stop-файлами, слайсинг логов по offset, lazy-резолв caps/session-id, self-fencing). bash такое тянет, но хрупко: нет типов/тестов, fd-жонглирование и подшеллы легко сломать, каждый новый кейс (graceful drain, per-command логи, per-session capture) добавляет риска. Подумать о переписывании — НО взвесить против сильных сторон bash здесь.

**За переписывание:** тестируемость (сейчас проверяем только `bash -n` + симуляции + live), типобезопасность, читаемость растущей логики, переиспользование доменных кодеков (session-route и т.п.).
**Против / нюансы:** (1) агент **доставляется в стоковый selenium-образ на старте** (не бейкается) — сейчас это один `curl` + `bash`, никаких рантаймов; переписав на Go/Rust — **статический бинарь** (без рантайма, годится), на Node/Python — тянуть рантайм в образ или бандлить (тяжелее, ломает «любой стоковый образ без rebuild»); (2) кроссарх (agent качается keyed по arch, как ffmpeg) — для Go/Rust ок (кросс-компиляция + пер-arch download, инфраструктура ffmpeg уже есть); (3) агент по сути дёргает `curl`/`jq`/`ffmpeg`/`pkill` — часть ценности именно в дешёвом вызове CLI.
**Вероятный кандидат, если делать:** **статический Go-бинарь** (нулевой рантайм в образе, кросс-компиляция, доставка как у ffmpeg, нормальные тесты/типы). Триггер к решению: следующая крупная фича агента (graceful drain / per-command логи) — если она снова заметно раздувает bash, это сигнал переписать.

## Follow-up: session-логи укорочены — только lifecycle Grid-ноды, без per-command записей — ПОЧИНИТЬ

Наблюдение юзера (2026-08-31): в логах сессии лишь создание/удаление, навигации нет. Причина: агент отгружает stdout контейнера, а Grid-нода на дефолтном INFO не пишет команды. Проба (2026-08-31, seleniarm + SE_LOG_LEVEL=FINE): образ env подхватывает (`Appending Selenium options: --log-level FINE`), per-request строки появляются (`POST /session/{id}/url HTTP/1.1`), НО тонут в DEBUG-лавине netty/OpenTelemetry (RequestConverter/SpanWrappedHttpHandler/… на каждый чих) — сырым отдавать нельзя, 10MB-кап сожрётся шумом. Варианты фикса (решить при реализации):
1. FINE + **фильтрация на агенте** при отгрузке (вырезать полезные строки: request-line'ы, ошибки, lifecycle) — дёшево, но парсинг чужого формата;
2. **driver/browser-логи chromedriver** (`goog:loggingPrefs` + legacy `/session/{id}/log/{type}` или chromedriver --verbose в свой файл, агент шлёт отдельно/вместе) — честные браузерные логи, но chrome-специфично;
3. **наш wd-прокси как источник командного лога** — каждая команда сессии и так идёт через нас; писать per-session command trail (метод, путь без секрета, статус, тайминг) и отгружать в тот же artifact-стор по отпечатку. Плюс: работает для ЛЮБОЙ платформы (и Appium), формат наш; минус: это новая машинерия периодической отгрузки из wd.

## Follow-up: UI-баг — после создания сессии строка прыгает free → busy, минуя reserved — НЕ начато

Наблюдение юзера (2026-08-31): после fire-and-forget создания (закрытия окна) окружение иногда показывается free, а затем сразу busy — reserved не виден. Диагноз (проверить при фиксе): это семплинг, не данные — для linux окно reserved живёт ~1–2с (reserve → create на ноде → occupy), а поллинг списка — 3с, плюс invalidate стреляет по завершении мутации, т.е. уже после occupy → busy. На android (10–20с) reserved виден. Варианты фикса: (а) оптимистичный локальный маркер «reserving» на строке с момента клика Create до подтверждения серверного состояния (симметрично freeing-маркеру); (б) считать поведением by design (reserved — транзит, и honest-состояние в БД корректно) и ничего не делать. Решить с юзером при заходе.

## Follow-up: окно ~3с после DELETE сессии, когда новую поднять нельзя — СДЕЛАНО (ветка feat.allocation-retry, влито)

**РЕШЕНО ретраем аллокации** (выбран вместо eager-free — wd остался чистым проксёром): create-session ретраит транзитный 409 в пределах бюджета (= окно свежести хартбита, ≥ интервала), так что освободившийся env всегда пойман; перманентные 400/404 — сразу. Ниже — исходная запись обсуждения eager-free vs retry.

Наблюдение юзера (2026-08-31): пользователь получил `OK` на DELETE сессии, но ещё несколько секунд не может создать новую — получает отказ «нет свободных env». Критично для tight-loop create→use→delete→create под высокой нагрузкой: клиент, честно дождавшийся ответа на delete, вправе тут же поднять сессию.

**Точная механика (проверено):** DELETE сессии по W3C синхронный — когда wd вернул `OK`, нода УЖЕ снесла сессию, слот ноды свободен. Но занятость в НАШЕЙ БД (`occupancy`) остаётся `busy` до следующего хартбита агента (~3с, INTERVAL), т.к. delete-путь занятость не трогает. Немедленный повторный create в этом окне не находит free-env → `NoAllocatableEnvironmentError` → **409 ABORTED** (юзер назвал это «too many requests»/429 — по факту 409 ABORTED, retryable; фикс от кода не зависит). Корень — **асимметрия**: на create мы eager-пишем `busy` (`occupy()` — доктрина «две подсказки» в CLAUDE.md), а на delete симметричной eager-free нет; localStorage-«freeing»-маркер чинит только UI-отображение, не серверную аллокацию.

**Два направления (юзер просил обсудить отдельно):**
- **(а) Eager-free на delete (корневой фикс, доктринально-чистый).** wd-путь DELETE (он и так теперь свидетель успешного teardown'а — там уже режем трубы) дополнительно пишет `occupancy=free` для env. Безопасно: W3C DELETE синхронный, слот реально свободен. Симметрично `occupy()` на create; агентский хартбит через ~3с подтверждает/самолечит. Нюансы: (1) wd — capability-прокси без auth/project-контекста, env id в session id нет — только endpoint; нужно резолвить env по endpoint и писать занятость → новая запись в БД на прокси-пути; (2) помогает ТОЛЬКО явному DELETE-через-наш-API (idle-kill нодой / краш / прямой DELETE в wd мимо — по-прежнему на хартбите). Чистая форма: поднять session-DELETE из сырого прокси в настоящий `DeleteSessionUseCase` (проксировать на ноду → на успехе освободить env), а не side-effect в контроллере.
- **(б) Серверный ретрай на 409 с бэкоффом в create-session.** Пере-пробовать аллокацию N раз с небольшим бэкоффом, переживая транзитный дефицит. Band-aid, но общий (спасает любой transient-busy, не только self-delete). Риск: держит запрос открытым; кап по попыткам/времени обязателен.

Родственно [[этому же PLAN]] пункту «строка прыгает free → busy минуя reserved» — та же семья лага occupancy-подсказки. Решить оба вместе.

## Follow-up: sw:logging/sw:video запрошены, но storageDestination не настроен — честный сигнал (API-first) — НЕ начато

Вопрос юзера (2026-08-31) + уточнение «сервис в основном по API, не через UI». Сейчас: сессия создаётся, логи/видео пишутся на ноде, а upload видит `destination=null` → тихий no-op (`stored:false`), агент дропает. Для API-клиента (главная аудитория) это худший вариант: 200 на создание, а логов нет — узнаёт только при чтении (404).
- **Основное (API): fail-fast.** Если запрос содержит `sw:logging`/`sw:video`, а у проекта нет storageDestination → отклонять создание сессии **400 FAILED_PRECONDITION** («requested logging/video but no storage destination configured»). Предсказуемо и честно к явному opt-in. Минус — session-create (wd) начнёт читать storage-конфиг проекта (сейчас не касается); это законная проверка предусловия. **Реализация:** в `CreateSessionUseCase` (или отдельной проверке) при `logging||video` дёрнуть `StorageDestinationRepository.exists/find` по проекту → нет → доменная `...FailedPrecondition`-ошибка.
- **Минимум в UI (решение юзера «хотя бы в UI дизейблить»):** в New session модалке дизейблить тумблеры sw:logging/sw:video, если у проекта нет destination, с подсказкой «configure storage first». — СДЕЛАНО в рамках `feat.settings-storage-ui`.

## Follow-up: удаление проекта (API + UI) — НЕ начато

Вопрос юзера (2026-08-31): удаления проекта нет нигде — ни `DELETE /v1/projects/{p}` в api, ни в UI. Сделать:
- **API**: `DELETE /v1/projects/{project}` (AIP-135), новое право `sw.projects.delete` (только admin-роль). Семантика с детьми — первым заходом **вариант «пустой или отказ»**: при живых окружениях → 409 «delete environments first» (арбитр — FK, как у cloudAccounts); у пустого проекта остальное (iam-биндинги, cloud accounts, storage destination) удаляется каскадом/явно. Каскадный вариант (перевести все env в deleting → воркер депровиженит → потом снести проект) — сложная асинхронная оркестрация, отложить, пока не понадобится. Hard delete — по нашей доктрине (soft отвергнут юзером ранее); для справки: GCP держит проекты 30 дней в soft-delete, нам это осознанно не нужно.
- **UI**: Settings-таб, «Danger zone» внизу: Delete project с confirm-диалогом (паттерн уже есть — confirm busy-env), после удаления — редирект на корень + инвалидация списка проектов в сайдбаре.

## Follow-up: self-verifying session id (подпись в самом id) — различать «удалена» и «не существовала» — НЕ начато

Идея юзера (2026-08-31), подтверждается литературой: Geewax «API Design Patterns» (гл. про resource identification) рекомендует чексумму/подпись внутри идентификатора — сервер БЕЗ похода в базу и БЕЗ хранения выданных id отличает «этот id чеканили мы» от «пользователь прислал выдумку в похожем формате». У нас session id уже составной (`base64url(endpoint).wdSessionId`, не персистится by design) — при создании дочеканивать короткий HMAC-хвост серверным ключом: `…&#46;wdId.tag`, где `tag = HMAC(endpoint|wdId)` (усечённый). Проверка на любой ручке смерти сессии:
- подпись бьётся, но сессия не жива → честное «session is deleted / over» (и можно смело показывать посмертное: логи/видео);
- подпись не бьётся → «такой сессии никогда не существовало» (INVALID_ARGUMENT, а не 404).
Замечания: ключ — серверный секрет (как INTERNAL_API_SECRET); capability-модель не слабеет (тег не заменяет владение id); ломает формат текущих id (breaking ок); wd-прокси может отбрасывать мусорные id ДО похода на ноду — заодно дешёвый анти-probe фильтр.

## Follow-up: VNC-вид не замечает смерть сессии после kill — СДЕЛАНО (ветка fix.vnc-liveness)

Корень подтвердился: живость семплилась один раз (`staleTime: Infinity`), и «редирект на голую vnc-страницу» был не редиректом — iframe на full-screen занимает всё окно, и после внешней смерти сессии noVNC рисовал свою заглушку на весь экран, а страница не замечала. Фикс: **живость — наблюдение, не проба**: лёгкий поллинг `GET /sessions/{id}/url` каждые ~5с, пока сессия жива (смерть терминальна — поллинг останавливается); recovery сидирует первый ответ (лишнего roundtrip'а на deep-link нет); наш Delete флипает вид мгновенно (`setQueryData`). Sessions-таб: VNC-панель сама переключается на «not active»-текст. **Full screen — по финальному решению юзера (2026-08-31) ТУПОЕ окно на VNC-путь**: никакого наблюдения и никаких замен — мёртвая/молчащая сессия выглядит как родная заглушка noVNC (как будто путь построен руками), Delete показывает тост и оставляет страницу как есть; afterlife-вид с Logs|Video на этой странице удалён. Проба живости (там, где она есть — на табе) ходит НЕ в сессию, а в /status ноды через vendor-ручку wd `GET /sessions/{id}/sw/alive` (W3C protocol extensions, наш префикс `sw/` как `se/` у Selenium): команды в сессию сбрасывали бы idle-timeout и оставляли фантомный трафик. Back из full screen — без `view=logs` (машинерия `initialView` выпилена): liveness-дефолт сам сажает живую сессию на VNC, мёртвую на Logs.

## Follow-up: при ЛОКАЛЬНОЙ разработке не пишутся ни логи, ни видео сессий — СДЕЛАНО (ветка feat.local-dev-storage, live-проверено)

Причина была двухслойная: (1) у dev-проекта нет `storageDestination` → upload сознательно no-op'ится; (2) даже с destination дефолтный `LOG_STORAGE=memory` пер-процессный — internal пишет в свою память, api читает из своей. Решение (вариант «а»): **`FsObjectStorageGateway`** (`LOG_STORAGE=fs`, файлы под `LOG_STORAGE_FS_ROOT`, дефолт `.dev-storage/` в gitignore; content-type сайдкаром) — общий диск для всех процессов; `LOG_STORAGE=fs` в `.env.development`. Интеграционный сьют «два приложения, один диск» (internal upload → api readback). **UPDATE 2026-08-31: дев-дефолтный destination-декоратор УБРАН** (`StorageDestinationRepositoryWithDefault` удалён) — он подставлял фиктивный бакет и в GET-путь: в UI висел призрачный дефолт-бакет, а Remove «не липнул» (дефолт возвращался после перезагрузки). Теперь GET честный везде (не настроено → 404, даже в dev), сторадж настраивается один раз через Settings UI, как в проде. Плюс появился `DELETE /storageDestination` (unset). Live: сессия с sw:logging/sw:video на проекте с настроенным destination → kill → логи и mp4 читаются через api.

## Follow-up: current session окружения по запросу (recover capability, ничего не храня) — СДЕЛАНО (current-session PR)

**СДЕЛАНО:** `GET /v1/projects/{p}/environments/{e}/session` (recover live id только создателю сессии; чужим 404), `session_ownership`-синглтон с событийной чисткой, `capabilities.canAccessCurrentSession` в GET environments, UI: серая стрелка на busy-строке → Sessions-таб. Ниже — исходный дизайн.

Идея юзера, согласована: сессию через UI сейчас нельзя ни увидеть, ни убить (id показывается один раз и нигде не хранится — by design). Решение БЕЗ отказа от «не персистим секрет»: **live-восстановление по запросу**. Активный `wdSessionId` уже отдаёт сама нода в `GET {endpoint}/status` (агент не нужен — он сам берёт id оттуда), endpoint окружения в БД есть, а наш session id — детерминированная функция `encode(endpoint, wdSessionId)`. Ручка: `GET /v1/projects/{p}/environments/{e}/session` → env → live-запрос к ноде → id (нет активной сессии → 404). At-rest по-прежнему ничего.

- **Доступ (решение юзера — НЕ смягчать секрет-модель):** восстановить id может **только создатель СЕССИИ** (не окружения! — в pool-модели на «твоём» env может крутиться чужая сессия, и env-creator получил бы контроль над ней). Так как сессии не персистятся, для правила нужны **ownership-метаданные сессии БЕЗ секрета**: владение не секрет, capability по-прежнему живёт только на ноде. Чужим — **404** (не 403: не палим существование сессии). Админский кейс «прибить чужое зависшее» уже покрыт удалением окружения (`environments.delete` → deprovision убивает сессию) — смягчение не нужно.
- **Ownership-строка = синглтон на окружение + событийная чистка (сессия умирает и МИМО нашего api: idle-kill нодой, смерть контейнера, прямой DELETE в wd по capability).** Таблица `(environment_id UNIQUE, created_by, created_at)`: create-session (единственный путь создания — наш wd) делает **upsert** (новая сессия перезаписывает владельца — перехват чужой невозможен); **heartbeat `busy→false`** (internal уже ловит переход) удаляет строку — покрывает idle-kill и capability-DELETE без нового цикла; удаление окружения — FK `ON DELETE CASCADE`. **Арбитр всегда — живой `/status` ноды**: протухшая строка сама по себе доступа не даёт (id восстанавливается только из живого ответа; в окне «сессия умерла, хартбит ещё не дошёл» — честный 404).
- **Реализация:** query-метод на gateway ноды (`WebDriverSessionGateway.fetchCurrent(endpoint)` — gateway-глагол, внешняя система), use case `GetEnvironmentSession`, presenter отдаёт id + interactive-URL. UI: на busy-строке окружения «Current session» → id (+copy) + **Kill** (DELETE через BFF `/api/wd` — добавить DELETE-метод в прокси) + «Open interactive». Вместе с `busy` из GET environments (пункт выше) закрывает весь session-менеджмент в UI.

## Идеологическое (НЕ близкий приоритет): VNC — это фича СЕССИИ или ОКРУЖЕНИЯ? — РЕШИТЬ

Вопрос юзера (2026-08-31): может, VNC вообще не про сессию, а про то, чтобы **зайти на само окружение** (машину/контейнер/устройство), никак не завязываясь на конкретную сессию. Это развилка с зубами — **напрямую конфликтует с уже зашитым `fix.ws-pipe-liveness`**, который жёстко энфорсит «VNC-труба живёт ровно столько, сколько её сессия». Кто зайдёт в эту задачу — сперва решает идеологию, потом, возможно, пересматривает тот энфорсмент.

- **VNC = фича сессии (текущая реализация).** Capability = session id, доступ живёт и умирает с сессией. «Увидеть следующую сессию окружения» — утечка (её и закрыли). Чистая изоляция, если предполагать, что окружение переиспользуется под разных пользователей.
- **VNC = фича окружения (альтернатива юзера).** VNC — это «удалённый рабочий стол в бокс»: даёшь интерактивно зайти в устройство **до/между/без** автоматических сессий (первокласс для Android/Appium-девайс-ферм — так работает live-testing у BrowserStack/Sauce). Тогда: authz — по владению **окружением** (член проекта / создатель env), а не по session id; адресация — по environment id; «труба переживает сессию» становится не багом, а **фичей** (смотришь свой бокс сквозь сессии); ws-liveness-энфорсмент надо инвертировать/снять для env-VNC.
- **Крючок в нашей же модели:** окружение уже project-scoped (`environment.projectId`), сессии аллоцируются ТОЛЬКО из пула своего проекта — кросс-проектного переиспользования нет. Значит «увидеть следующую сессию» — утечка не кросс-тенант, а **внутри проекта** (другой разработчик того же проекта или ты сам). Это ослабляет аргумент изоляции: «зайти в бокс своего проекта» — законное желание, а session-scoping — лишь более строгая трактовка. Возможен гибрид: две двери — session-VNC (по id сессии, для «посмотреть конкретный прогон») и env-VNC (по env, для «зайти в бокс»), с разной authz.
- Решение влияет на: UI (просмотр VNC со строки окружения, не только через сессию), authz-модель, судьбу `fix.ws-pipe-liveness`, и на дизайн опции ниже (`interactive` флаг окружения).

## Follow-up: VNC как опция ОКРУЖЕНИЯ (не всегда включён) — НЕ начато

Вопрос юзера: VNC сейчас не конфигурируется — x11vnc+noVNC стартуют в контейнере всегда (дефолт selenium-образа). Цена в простое небольшая (~20–40 МБ RAM, ≈0 CPU; CPU появляется при активном стриме), но в большинстве прогонов VNC не нужен. **Per-session опцией (как `sw:logging`) быть НЕ может**: VNC — процесс уровня контейнера, а в pool-модели окружение поднимается до сессий. Честная форма — **флаг на create-environment** (`interactive: bool`, дефолт обсудить): адаптер прокидывает `SE_START_VNC`/`SE_START_NO_VNC` в контейнер; wd-presenter НЕ отдаёт `sw:vnc`/`sw:interactive` для окружений без VNC (не светить мёртвые ссылки); UI — чекбокс в New environment. (Будущее: per-session включение потребовало бы машинерию «агент стартует/гасит x11vnc по требованию».)

## Рефактор `CloudAccount` × compute — СДЕЛАНО (PR #55, #56, UI PR feat.cloud-types-and-clouds-ui)

Итоговая модель (уточнена против первоначального плана — `ComputeBinding` как отдельная сущность НЕ понадобился):
- **Облако = кто предоставляет ресурсы** (`CloudAccount.type`: `local` = машина, где живёт sw, через её docker-демон; `yandex-cloud` = YC Compute API). **Вид компьюта = подразделение облака**, наше know-how, пользователь его не выбирает — он подключает облако.
- `CloudAccount(type, config, credentialRef, provides)`; `provides` (стереотипы `platform×execution`) материализуются из инсталляционного каталога (`CloudCatalog`/`RegisteredCloudCatalog`) при connect. Non-overlap-инвариант: у проекта облака с дизъюнктными `provides` (второе пересекающееся → 409).
- Роутинг: env штампует `cloudAccountId`+`cloudType`; адаптер = `облако:platform:execution` (ровно один на пару облако×стереотип). Адаптеры видов компьюта cloud-agnostic за портом **`VmProvisioner`** (`YandexComputeClient` — его YC-реализация). Новое облако = реализация `VmProvisioner` (~100 строк) + запись каталога + строки роутинга; redroid/emulator-адаптеры переиспользуются без изменений.
- ProviderAccount/ProviderCatalog удалены; kubernetes-адаптер удалён (не облако, а вид компьюта; вернётся подразделением при фиче «браузеры в YC»); noop удалён (тест-леса в прод-каталоге); каталог честный: `local→linux/container`, `yandex-cloud→android/container` (emulator убран до live-верификации на KVM).
- API: `cloudAccounts` CRUD + **`GET /v1/cloudTypes`** (read-only каталог по паттерну machineTypes.list/supportedDatabaseFlags.list; AIP-122 `name`, AIP-126 string-тип в kebab-case).

## BYOC-трек (bring your own cloud): «пользователь подключает СВОЁ облако, платит за свои ресурсы, мы на них разворачиваем» — В РАБОТЕ (делегирование, без хранения секретов)

**РЕШЕНИЕ ЮЗЕРА (2026-09-01), важно — supersede-ит прежний «секрет-стор»-план:** BYOC делаем **delegation-only — НИКАКИХ секретов у нас не храним** (ни своих, ни чужих). Симметрично тому, как уже сделан бакет: пользователь **грантит НАШЕЙ identity доступ на своём ресурсе**, мы ходим под собой; хранить нечего. Наше основное облако — **Yandex Cloud**, которое всё умеет, → делаем **YC same-cloud делегирование** основным путём. Прошлый срез «секрет-стор + credential-at-connect» (ветка `feat.byoc-cloud-credentials`) **НЕ вливаем** — остаётся в git-истории как возможный keyed-фолбэк, если появится облако без делегирования/федерации.

**Механика YC-делегирования:** (1) публикуем НАШУ YC service-account; (2) юзер грантит ей роль (compute + сеть) на СВОЙ фолдер; (3) при connect указывает `folderId`(+zone/subnet/image) в `CloudAccount.config`, **секрета нет**, `credentialRef=null`; (4) воркер провижнит в его фолдере под ambient-токеном (metadata), доступ есть благодаря гранту; (5) нет гранта → провайдер reject на провижне → `failed` (наша модель «энфорсит провайдер на провижне»). **Плашка доступности (ask юзера, зеркало `storageDestination:test`):** AIP-136 colon-метод `POST cloudAccounts/{id}:test` → под нашей identity проверяем доступ к фолдеру (`{ok,message?}`); UI показывает зелёную/красную плашку авто-probe на загрузке + recheck.

**Кросс-облачное делегирование (наш YC → чужой GCP/AWS) — future, как S3 п.19:** наша YC-SA НЕ принципал в GCP/AWS, «просто грант» не проходит; достижимо **keyless-федерацией** (WIF / AssumeRole-with-web-identity / OIDC-trust: их облако доверяет нашему issuer, грант федеративному принципалу, наш воркер меняет токен через STS) ИЛИ **нашей per-provider identity** (та же проблема и решение, что для кросс-облачного бакета в п.19). Инвариант «секретов не храним» сохраняется через федерацию (keyless).

Шаги (переориентированы на делегирование):
1. ~~Креды при connect → секрет-стор~~ — **ОТМЕНЕНО решением выше** (delegation-only). Вместо этого: connect БЕЗ секрета, per-account `config` (folderId/…) + грант нашей SA + плашка доступности. = **текущий срез (ветка `feat.byoc-yc-delegation`)**.
2. **Per-account provisioning config** — СДЕЛАНО (ветка `feat.byoc-yc-per-account-folder`). Парсер `androidProvisioningOverrides(config)` читает `folderId/imageId/zone/subnetId/securityGroupId` из `CloudAccount.config` (зеркало `dockerProvisioningOverrides`, невалидное значение → fail-fast), YC-адаптеры (redroid+emulator) мёржат с install-дефолтами; `YandexComputeClient` берёт folderId **per-call** (`folderId ?? this.folderId`) на create/delete/checkAccess. Порт `deprovision(environment, cloudAccount)` (симметрично provision) — **delete-путь и prepare-cleanup грузят аккаунт и валят VM в фолдере юзера** (иначе утечка); reclaim-пути пока `null` + `TODO(byoc)` (фолдер-скоуп-очистка на аварийных путях — follow-up). `checkAccess` теперь фолдер-специфичен (`folder get --id <config.folderId>`) → плашка «available» = «грант на твой фолдер выдан». Sizing (cores/mem/disk) пока install-дефолт. Тесты: unit парсера; мок-верификация проводки — интеграционка зелёная (порт/DI). **Остаётся B2 (уточнено после live-милстоуна 2026-09-01):** (1) **UI-поле `folderId` в Connect-модалке для yandex-cloud** — сейчас его ввести нельзя, подключали по API; (2) **публикация id наших SA** (sw-service `ajelfu131kf0s286v8ug` — compute.editor+vpc.user; sw-object-storage `aje7a4nu70e3qc1r3du6` — storage.editor) + инструкция гранта прямо в модалке (грант юзер делает у себя в YC: `yc resource-manager folder add-access-binding --role ... --subject serviceAccount:<наша SA>`); (3) **ОСТРЫЙ КРАЙ: для hosted-инсталляции folderId должен быть ОБЯЗАТЕЛЬНЫМ на connect** — без него адаптер падает на install-дефолт `COMPUTE_BROWSER_FOLDER_ID` = НАША папка → чужие окружения за наш счёт (в идеале в hosted вообще без install-фолбэка; требуемость — через каталог, напр. `requiresConfig(type)`); (4) кнопка «проверить грант» = уже готовая плашка `:test`. Live-прогон делегирования УЖЕ доказан (см. память yc-single-host-deploy v2).
3. **Каталог с дескрипторами провижна («заранее говорим как»)**: запись `cloudTypes` описывает per-substrate, ЧТО создаётся на окружение и почём по форме («android/container = выделенная Compute VM 8 vCPU/16GB/40GB на окружение»), + схема конфига для формы UI (см. config descriptors ниже).
4. **Выбор вида компьюта на подразделение — настройкой подключения** (юзер: «давай запишем, что хотим дать сконфигурить»). Когда у облака появится второй способ отдавать один стереотип (linux в YC: `kubernetes` = постоянная плата за кластер + секундный старт vs `vm` = pay-per-use + старт ~минуту), выбор делается при connect в `CloudAccount.config` (напр. `linuxCompute: "vm" | "kubernetes"`); create-environment штампует выбранный вид на окружение, ключ роутинга расширяется до `облако:platform:execution:вид`; однозначность сохраняется (один способ на стереотип в каждый момент; смена настройки влияет только на новые окружения). Каталог объявляет варианты с их ценовой формой.
5. ~~**Каталог пер-инсталляцию**~~ — СДЕЛАНО (ветка `feat.per-install-cloud-catalog`). `RegisteredCloudCatalog(enabledTypes?)` фильтрует известную карту по `CLOUD_CATALOG` (CSV; unset = все типы — совместимость/тесты; неизвестный тип → fail-fast `InternalError` на старте), провайдер `RegisteredCloudCatalogProvider` читает env, `.env.development: CLOUD_CATALOG=local`. `GET /v1/cloudTypes` и Connect-дропдаун (уже catalog-driven) в dev показывают только `local`, прод — только реальные. Live: `/v1/cloudTypes` → `['local']`. `local` — ресурсы оператора, в SaaS его предлагать нельзя; прод задаёт `CLOUD_CATALOG=yandex-cloud,...`.
- ~~Будущее~~ **СДЕЛАНО (code-side, ветка `feat.yc-browser-vm`): подразделение `yandex-cloud × (linux, container)`** — VM-на-окружение через `VmProvisioner`: общий базовый `VmEnvironmentProviderGateway` (merge overrides + create/delete/probe в фолдере аккаунта; extract superclass по правилу трёх — redroid/emulator/browser стали тонкими `metadataFor()`), `BrowserVmEnvironmentProviderGateway` (метадата: node-image/session-timeout/internal-url/token), конфиг `COMPUTE_BROWSER_*`, каталог yandex-cloud → +linux/container (local и yandex-cloud теперь пересекаются по linux/container — в одном проекте оба не подключить; per-install каталог это и так исключает), `images/linux-node` (vm-boot.sh: metadata → docker run предзапечённого selenium с agentBootstrap, byte-for-byte схема локального docker-адаптера; bake-runbook в README). Парсер оверрайдов переименован `android-provider-config`→`vm/vm-provider-config`. Live-верификация — на YC-деплое милстоуна. Исходные кандидаты: два кандидата — VM-на-окружение через существующий `VmProvisioner` (нужны только `BrowserVmEnvironmentProviderGateway` + config + golden-образ `images/linux-node`) или k8s (вернуть адаптер из истории, переписав обвязку под per-account креды). Возможно оба — через п.4.

## Follow-up: cloud **config descriptors** (schema-driven форма вместо сырого JSON) — НЕ начато

`CloudAccount.config` — opaque `Record<string,unknown>`, у UI нет схемы → форму не построить. Расширить записи **`GET /v1/cloudTypes`** (ручка уже есть) схемой конфига per cloud type / per substrate (дескрипторы полей: yandex-cloud → `folderId/zone/subnetId/sizing`, local → `image/port`), чтобы фронт рендерил **типизированную форму** вместо ручного JSON. Сюда же — `displayName` подключения (человеческое имя в таблице). Часть BYOC-трека (п.3 выше).

## Follow-up: per-env targeting сессии через `sw:environmentId` (для UI/демо) — НЕ начато (к step 4)

Дефолт остаётся **capability-based** (аллоцировать любой свободный `executing`-env под caps) — основной продуктовый путь. Добавляем **опциональную кастомную капу `sw:environmentId`**: если указана — сессия создаётся на КОНКРЕТНОМ окружении (детерминированно), иначе pool-аллокация как сейчас. Нужно, чтобы UI имел понятную кнопку **«New session» на строке конкретного env** (создание окружения — отдельная кнопка). Реализация — как `sw:execution`: резолвер сессии читает капу → домен кладёт в `SessionAllocationCriteria` доп-фильтр env-id → `findAllocatable` фильтрует по одному кандидату (тот же optimistic pick). **Матчинг caps — СТРОГИЙ.** Семантика ошибок (важно — по HTTP/AIP-смыслу, НЕ всё 409):
- targeted env НЕ несёт запрошенный `browserName` → **400 INVALID_ARGUMENT** (несочетаемый запрос, а не состояние-конфликт);
- env не найден / не в проекте вызывающего → **404 NOT_FOUND** (не течём наружу);
- env существует, но не `executing` (провижнится/failed) → **409 ABORTED/Conflict** (transient состояние);
- env матчит и свободен, но занят/reject ноды → **409 Conflict** (как текущий busy / `NoAllocatableEnvironmentError`).
То есть **409 — только про состояние** (занято/не готово), **400 — про несовместимость запроса** (targeted env без нужного browser). Это опт-ин таргетинг для UI/отладки, НЕ отказ от pool-модели.

## Follow-up: `platform.version` — сделать опциональным (десктоп/браузер не требует) — НЕ начато (всплыло на UI)

`create-environment` сейчас **требует** `platform.version` (`@IsString()`). Но версия платформы осмысленна для **мобильных** (Android 13 / iOS 17 — важна для матчинга), а для **linux-браузера значимая версия — это приложение** (chrome 128); «версия платформы linux» — шум из обобщённого W3C+Appium стереотипа, и заставлять её вводить в UI неудобно. **Фикс:** сделать `platform.version` **опциональным** (`@IsOptional` в request-модели + дефолт/пустое в домене `Platform`; версия обязательна только там, где реально нужна — мобильные). Тогда фронт **убирает поле версии платформы для не-мобильных** платформ (оставляет Application+version + Platform + execution), а показывает его только для mobile.

## Follow-up: каталог поддерживаемого (platforms / applications / versions) → выбор из списка в UI, не свободный ввод — НЕ начато

Сейчас create-environment принимает **свободный текст** `platform.name/version` + `application.name/version`. Пользователь может ввести что угодно; неподдерживаемое (напр. не запечённая версия Android, несуществующий тег браузера) упадёт **позже на провижне**. Хотим, чтобы пользователь **выбирал из готового списка того, что система поддерживает** (Select-ы вместо TextInput): версии Android, приложения, версии приложений.

**Это НЕ enum-ы на бэке** — наборы **динамические**, зависят от того, что запечено/доступно на конкретном провайдере/облаке: версии Android = запечённые redroid-теги (11/13/14); браузеры и их версии = из image-resolver / selenium-тегов; приложения = то, что система умеет провижнить. Поэтому нужен **catalog/discovery API**: бэкенд отдаёт поддерживаемые платформы, приложения по платформе и доступные версии по приложению; UI строит Select-ы. **Провайдер-зависимо:** каталог должен быть provider-aware (доступные версии зависят от провайдера/облака — какие redroid-теги запечены, какие selenium-теги есть) → пер-провайдер либо объединённый вид. Связано с **provider config descriptors** / «GET supported providers» (тот же принцип «UI берёт варианты с бэка»), с **image-resolver** (docker prebuilt / android baked теги) и с рефактором **CloudAccount×ComputeBinding** (каждый вид×облако объявляет, что поддерживает).
