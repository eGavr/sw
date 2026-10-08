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
  [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] конкретный через **`sw:execution`** (`alwaysMatch sw:execution=container` = строго redroid; «любой эмулированный» = W3C `firstMatch:
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
**[→ ИТОГ `projects` (2026-10-08): `projectId` теперь REQUIRED, uid-алиас в URL убран]** **`{resource}_id` (человекочитаемые id) — ПРОЕКТЫ СДЕЛАНЫ (ветка `feat.human-readable-resource-ids`); ОКРУЖЕНИЯ — следующим PR.**
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
   `SessionData`/`fromObject`) — в новой модели сессия не персистится [→ 2026-10-08: метаданные сессии хранятся (ресурс `sessions`), секрет — нет; см. ИТОГ wd-auth] и её lifecycle держит нода; `Session` теперь
   чистый immutable-VO результата аллокации. Свой in-process reaper понадобится только для мульти-инстансной
   политики → см. п.9.

2. ~~**Аутентификация data-plane (`wd`).**~~ **СДЕЛАНО.** Токен требуется только на СОЗДАНИЕ сессии
   (`POST /sessions`): `create-session-use-case` резолвит `User` через `UserRepository` (как `api`),
   поэтому `wd` теперь работает с Postgres. Остальное — без auth [→ 2026-10-08: auth на КАЖДОЙ команде, ИТОГ wd-auth]: доступ по неугадываемому
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

[ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] 23. **Версия приложения окружения обязана быть КОНКРЕТНОЙ; `latest` — только capability сессии — СДЕЛАНО (части «а» и «б»).**
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

- **Подобрать сайзинг browser-VM (запрос юзера 2026-09-01): 2vCPU/4GB/30GB — много для одного chrome.** Дефолты `COMPUTE_BROWSER_{CORES,MEMORY_GB,DISK_GB}` взяты с запасом; для одного chrome+selenium+агента, вероятно, хватит 2vCPU(50% core-fraction?)/2-3GB, диск 15-20GB (golden ~5GB + шапка). Померить на живом env (docker stats/free) и ужать дефолты — это прямые ₽/час каждого окружения. Сore-fraction для env-VM тоже кандидат (нагрузка бёрстовая).
- **Баг UX (прод, 2026-09-01): env BUSY, но стрелка перехода к сессии появляется с запозданием (секунды).** Причина (гипотеза, механика сходится): `busy` ставит ХАРТБИТ агента, увидевший сессию на ноде — он может опередить завершение create-пути в wd (ownership-строка + occupy пишутся ПОСЛЕ ответа ноды) → окно «busy есть, canAccessCurrentSession ещё нет» до следующего 3с-поллинга. Самолечится. Варианты фикса: писать ownership ДО вызова ноды (но busy=false-хартбит при reserved удалит строку — надо не чистить ownership при reserved), либо UI-оптимизм (после успешного createSession форсить refetch до появления capabilities). Решить при следующем заходе в occupancy-полировку (рядом с багом «free→busy минуя reserved»).

- **Обсудить структуру папок/файлов для логов и видео сессий в бакете (запрос юзера 2026-09-01).** Сейчас: `<prefix>/session-logs/<sha256(wdSessionId)>/session.log` и `<prefix>/session-videos/<sha256>/session.mp4` — артефакты ОДНОЙ сессии разнесены по двум корням, ключ — отпечаток (session id — capability-секрет, plaintext в ключах нельзя). Обсудить: (1) группировка per-session (`sessions/<fingerprint>/{session.log,session.mp4}` — оба артефакта рядом); (2) датированные префиксы (`sessions/2026-09-01/…`) — удобные bucket lifecycle-политики ретеншена и листинг «за день»; (3) скоуп по проекту, если один бакет на несколько проектов (`<project>/sessions/…`); (4) человеко-находимость: пользователь в консоли бакета видит только хэши — может, класть рядом небольшой `meta.json` (время, платформа/браузер, env id — БЕЗ секрета) или включать таймстемп в имя папки; (5) ретеншен по умолчанию/рекомендации (артефакты копятся бесконечно). Решение влияет на `StorageDestination.keyFor` и readback-пути api — менять лучше до реальных пользователей.
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
**[→ ИТОГ `projects` (2026-10-08) — главнее этого раздела: Delete, дети, `force`, повтор id]**

Вопрос юзера (2026-08-31): удаления проекта нет нигде — ни `DELETE /v1/projects/{p}` в api, ни в UI. Сделать:
- **[ПОПРАВКА 2026-09-28: при детях — FAILED_PRECONDITION, не 409 (AIP-135 `0135.md:154` MUST); среди детей теперь applications; проект `catalog` удалять нельзя]** **API**: `DELETE /v1/projects/{project}` (AIP-135), новое право `sw.projects.delete` (только admin-роль). Семантика с детьми — первым заходом **вариант «пустой или отказ»**: при живых окружениях → 409 «delete environments first» (арбитр — FK, как у cloudAccounts); у пустого проекта остальное (iam-биндинги, cloud accounts, storage destination) удаляется каскадом/явно. Каскадный вариант (перевести все env в deleting → воркер депровиженит → потом снести проект) — сложная асинхронная оркестрация, отложить, пока не понадобится. Hard delete — по нашей доктрине (soft отвергнут юзером ранее); для справки: GCP держит проекты 30 дней в soft-delete, нам это осознанно не нужно.
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

Идея юзера, согласована: сессию через UI сейчас нельзя ни увидеть, ни убить (id показывается один раз и нигде не хранится [→ 2026-10-08: метаданные сессии хранятся (ресурс `sessions`), секрет — нет; см. ИТОГ wd-auth] — by design). Решение БЕЗ отказа от «не персистим секрет»: **live-восстановление по запросу**. Активный `wdSessionId` уже отдаёт сама нода в `GET {endpoint}/status` (агент не нужен — он сам берёт id оттуда), endpoint окружения в БД есть, а наш session id — детерминированная функция `encode(endpoint, wdSessionId)`. Ручка: `GET /v1/projects/{p}/environments/{e}/session` → env → live-запрос к ноде → id (нет активной сессии → 404). At-rest по-прежнему ничего.

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

## Кубер как вид компьюта + модель computeBindings — КОНТРАКТ ФИНАЛЕН, CODE-SIDE СДЕЛАНО (ветка `feat.linux-compute-kind`)

**Продукт (согласовано с юзером 2026-09-01/02):** окружения на VM = pay-per-use, но старт ~минуты; кубер = постоянный фикс кластера ПОЛЬЗОВАТЕЛЯ (мастер ~2.5К₽/мес + тёплые ноды; кластер и нод-группы он создаёт/сайзит сам в своей папке), зато под стартует ~секунды; холодные старты — на границе тёплой ёмкости. Оба вида равноправны, выбор — per-substrate.

**Финальный API (итерации с юзером: без default/pricing/purpose; вид указывается ЯВНО; массива в connect нет — привязка = суб-ресурс; uid-ключи, не составные):**
- `cloudAccount` = облако + делегированная папка: `POST {type, config:{folderId}}`; `local` — `{type:"local"}`. `provides` с wire УДАЛЁН; `computeKind` на environment НЕ светится (внутренний штамп роутинга).
- **`computeBindings`** — суб-ресурс аккаунта: `POST/GET/PATCH/DELETE …/cloudAccounts/{ca}/computeBindings[/{uid}]`, тело `{platform, execution, kind, config}`. kind-config свой у вида: `kubernetes → {clusterId}` (кластер юзера, где угодно в его облаке), `vm → {}` (папка аккаунта). PATCH = смена вида (новые env — новым видом, старые доживают). Инвариант: одна привязка на субстрат В ПРОЕКТЕ (409). **Авто-привязка** субстратов с единственным бесконфиговым видом (local→docker, yandex android→vm; скип, если субстрат уже привязан в проекте).
- Каталог `cloudTypes.provides[] = {platform, execution, compute:[{kind, requiredConfig, grants:{role,serviceAccountId}}]}` + `connect:{requiredConfig:[folderId], grants}` — UI-форма строится целиком из него.
- Роутинг: `облако:platform:execution:вид` (kindless-ключей нет: local:…:docker, yandex:android:…:vm, yandex:linux:…:vm|kubernetes); env штампует kind из привязки при create.
- `:test` аккаунта агрегирует пробы всех привязок (vm→folder get, kubernetes→get nodes кластера).

**Реализовано:** домен (ComputeBinding VO + агрегат bind/rebind/unbind + инвариант; CloudAccountList.resolveFor→{account,binding}); таблица `compute_binding` (+drop `cloud_account.provides`, +`environment.compute_kind`, миграция 1787900000000); CRUD use-cases (+CloudAccountAccess — общий guard, извлечён по правилу трёх); k8s-адаптер (под со stock selenium + agentBootstrap, endpoint = pod IP через downward API, kubeconfig per-cluster через `yc get-credentials`, deleteByLabel идемпотентно; COMPUTE_K8S_* конфиг с фолбэком на COMPUTE_BROWSER_*); UI CloudsTab = карточка аккаунта + форма-каталог (секция на субстрат: чекбокс для одновидовых, SegmentedControl+поля+грант-команды для мультивидовых; таблиц/Add нет).

**Принцип границы (решение юзера 2026-09-02):** кластер — целиком хозяйство пользователя; мы знаем ТОЛЬКО `clusterId`. Ручки сайзинга нод/автоскейла/тёплой ёмкости в наш API НЕ переносим и «мы создаём кластер за юзера» НЕ планируем — он настраивает свой кластер своей консолью, мы шедулим поды. (Pod-requests/limits — наша install-настройка COMPUTE_K8S_*, это про наш под, не про его кластер.)

**ОСТАЁТСЯ (live, ⚠️ биллится):** кластер в папке юзера + грант k8s.cluster-api.editor нашей SA → e2e под-сессия + замер стартов vs VM; проверить достижимость pod-IP из контрол-плейн-VM (VPC-роутинг managed k8s; фолбэк — NodePort). **Известное ограничение (TODO):** rebind/unbind при живых env этого вида — deprovision не найдёт clusterId (env не хранит кластер); лечится записью кластера на env или запретом rebind при живых env.

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

## Аудит конкурентности существующих механизмов (multi-worker/multi-instance) — НЕ начато

Стоячее правило (см. память design-for-many-workers): не решаем задачи «для одного воркера» — CP масштабируется горизонтально; check-then-act гонки чинятся сразу. Дорогая гонка заказа metal-машин уже починена (`PoolHostDataSource.placeOrCreate` под `pg_advisory_xact_lock` по пулу + параллельный интеграционный тест). Оставшийся долг — пройтись по СУЩЕСТВУЮЩИМ путям с той же линзой и починить найденное:
- create-environment quota-check (появится с квотой окружений) — считать под локом/констрейнтом, не check-then-insert;
- NodePort-резервация k8s-адаптера (in-proc набор занятых портов — что при N инстансах?);
- docker-адаптер: выбор свободного host-порта (reserve → run окно);
- session reservation/allocation — выглядит строго (CAS + нода-арбитр), перепроверить письменно;
- любые in-memory кэши/état в presentation (wd severFor — заявлено per-instance by design, ок).
- per-env VM-пути (browser-vm/redroid/emulator-vm) без полного orphan-sweep: страховка = deprovision на fail-путях + идемпотентность по имени sw-env-<id>; у пула есть sweep по label. Выровнять (label + sweep) при ревизии робастности.

## VNC для baremetal-слотов эмуляторов — СДЕЛАНО (ветка `feat.android-slot-vnc`, был BLOCKER ПРОДА)

Было: слот поднимал только emulator+appium+inline-дверь+env-агент, VNC-конвейера в слоте не было, дверь не роутила se/vnc → на headless-metal Live-VNC пустой. Сделано:
- **Порт-контракт**: `SlotPorts.vnc = 5900+i` (RFB) в домене и в ответе `:heartbeat` (`ports.vnc`); websockify слота — производный `vnc+2000` на loopback, X-дисплей `:100+i` (хост-локальные детали, как adb = console+1).
- **Дверь слота = общая `wd-door.js`** (скачивается `wdDoor:download`) в диалекте `appium` (passthrough — Appium сам W3C-эндпоинт, caps не переписываются): роут `/session/{id}/se/vnc` → websockify слота, обрыв труб на конце сессии, one-session rule, idle-таймаут (`launch.sessionTimeoutSeconds` из инсталляционного `SESSION_IDLE_TIMEOUT` — теперь у android-слота тот же «умный» idle, что у linux-ноды). Inline-дверь из агента удалена.
- **Конвейер пер-слот** в `pool-host-agent.sh`: `scrcpy -s <serial> --fullscreen --max-size=1280 → Xvfb → openbox|fluxbox → x11vnc :vnc → websockify 127.0.0.1:vnc+2000`; геометрия дисплея = экран девайса (`wm size`), масштаб к 1280 по длинной стороне. Нативно, если на хосте есть все четыре инструмента; на хосте без X-стека, но с docker (дев-мак) — тот же конвейер **сайдкар-контейнером** `images/android-vnc-sidecar` (scrcpy 3.3.4 из исходников с pinned prebuilt-сервером — последняя линейка на SDL2, 4.x хочет SDL3, `adb connect host.docker.internal:<console+1>` своим adb-сервером — чужой клиент другой версии убил бы хостовый adb); без того и другого — слот честно без VNC.
- **Env-агент**: `pkill -x x11vnc` на конце сессии → адресно по `SW_VNC_RFB_PORT` (иначе на хосте с N слотами рубил бы чужие вьюеры); без переменной — прежнее поведение контейнера.
- **Golden-образ metal**: требования (`scrcpy ≥ 2.1`, `xvfb`, `x11vnc`, `websockify`, `openbox`, `libgl1-mesa-dri`) записаны в `docs/deploy/self-hosted-machines/README.md` (раздел про linux-хост); live-verify на metal — вместе с S5 (billable).

## Видео сессий на android-слотах — СДЕЛАНО (ветка `feat.android-session-video`, поверх VNC-среза)

Было: рекордер env-агента — только `ffmpeg -f x11grab` с X-дисплея браузерной ноды; у android-слота такого дисплея нет (мак — X-стека нет, metal — Xvfb с зеркалом scrcpy, о котором агент не знает) → `sw:video` давал пустоту. Решение юзера (2026-09-07): писать **с устройства, а не с VNC-зеркала** — прод-решение, не времянка. Сделано:
- **Стратегия рекордера в env-агенте** `SW_VIDEO_RECORDER=x11grab|scrcpy`: `scrcpy -s $SW_ADB_SERIAL --no-playback --no-audio --record=file.mp4 --time-limit=<cap> --max-size=1280` — поток самого девайса, муксится как есть (одно кодирование, нативное разрешение до `--max-size`, ни дисплея, ни ffmpeg; ffmpeg не качается, когда рекордер scrcpy). Стоп/аплоад — прежние stop-файл + `upload_video`, CP не менялся. Остановка — **SIGINT по ГРУППЕ процессов scrcpy** (точная копия Ctrl+C в терминале): сигнал попадает и в дочерний `adb shell`, его смерть валит сервер на устройстве, поток кончается, scrcpy пишет трейлер. SIGINT/SIGTERM одному scrcpy НЕ останавливают запись (проверено: пишет до time-limit; в исходниках 4.1 своих обработчиков нет, SDL-флаг quit не отрабатывает без окна). Фоновые джобы non-interactive shell наследуют SIGINT=ignored, поэтому scrcpy запускается через `perl -e 'setpgrp; $SIG{INT}="DEFAULT"; exec @ARGV'` — своя группа + default-диспозиция; стоп `/bin/kill -INT -<pid>`, добивание тоже по группе. Проверено на маке дважды: выход через 1с, mp4 с moov. Цена своей группы: `kill 0` слота рекордер не заденет — он доживёт до конца записи/потери adb (≤ cap).
- **Слот** передаёт агенту `SW_VIDEO_RECORDER=scrcpy` и `SW_ADB_SERIAL`. Второй scrcpy рядом с VNC-зеркалом на одном девайсе ок: jar сервера scrcpy удаляет с устройства сразу после старта (проверено — `/data/local/tmp/scrcpy-server.jar` отсутствует при живом зеркале), версии 3.3.4 (сайдкар) и 4.1 (brew) не конфликтуют.
- Почему не Xvfb-x11grab с зеркала: два кодирования и потеря качества, ~ядро хоста на пишущий слот (12 слотов), связность с VNC-конвейером (моргнул scrcpy — дырка; выключили VNC опцией — нет видео), на маке невозможно. x11grab остаётся у linux-нод, где X-дисплей и есть правда. Caveat под S5: софтверный энкодер в госте эмулятора несёт два потока (зеркало + запись) — померить на metal, при нужде опустить `--max-size`/fps. scrcpy заканчивает запись, если устройство «моргнуло» (файл финализируется, но обрывается) — сегментирование не делаем заранее.
- Golden-образ metal: требование scrcpy поднято до ≥ 2.2 (`--time-limit`).

## Self-hosted machines (своё железо как облако) — ДИЗАЙН СОГЛАСОВАН, S0 СДЕЛАН (ветка `refactor.machine-pool-vocabulary`)

Полный дизайн и словарь — `docs/design/self-hosted-machines.md`. Суть (решение юзера 2026-09-07): пользователь подключает свои машины (FQDN, наш агент), они становятся инвентарём облака типа `self-hosted`; пул просит у него «дай машину» ровно так же, как заказывает BareMetal у YC; кончились машины → `429 RESOURCE_EXHAUSTED` (`MACHINE_POOL_AT_CAPACITY`), гарантированный синхронной посадкой места на create-environment под пер-пуловым локом. Ничего в пуле по типу облака не ветвится.

Словарь (после двух независимых ревью 2026-09-08): `Machine` (инвентарная коробка, физическая или виртуальная — Cluster API), `MachineLease` (удержание машины пулом; было `PoolHost`), `MachinePool` (было `HostPool`), `SlotAssignment` (было `HostPlacement`), `MachineProviderGateway` (было `HostProviderGateway`; + `headroom`), `machine-agent.sh`. `kind: vm` — НЕ Machine (виртуалка одного окружения, `VmProvisioner`). Табу: голое `agent`, `capabilities` для фактов машины (W3C), `seat` в доках, `Node`/`Host` для машины. Отвергнуто: `Host` (адресное слово + словарь пула), `LeasedHost` (читается как подтип), `NodePool` (Selenium-node), `Server` (наши серверы, adb server, scrcpy-server).

**S0 (сделано)** — только словарь пула, поведение то же: переименования по карте из дизайн-дока, миграция `1789300000000` (переименование таблиц `pool_host → machine_lease`, `host_placement → slot_assignment`, колонок `capacity_slots → slot_capacity`, `host_id → machine_lease_id`, индексов/констрейнтов), internal `poolHosts → machineLeases`, агент `machine-agent.sh` с `SW_LEASE_ID`/`SW_LEASE_TOKEN` (идентичность агента станет `Machine` в S1), конфиг `POOL_HOST_* → MACHINE_POOL_*` (`MACHINE_POOL_SLOTS_PER_MACHINE`, `MACHINE_AGENT_EMULATOR_WINDOW`). Гоча: sed нельзя пускать по старым миграциям — переименованный класс миграции TypeORM считает новой и пытается создать таблицу заново; исторические миграции возвращены из main нетронутыми.

**S1 (сделано, ветка `feat.self-hosted-machines`)** — контекст `machine`: агрегат `Machine` (fqdn, `provides[]`, `state: pending|online|offline`, `admission: open|cordoned|draining`, `conditions[]` из `facts`, `slotCapacity` по `MACHINE_SLOT_CORES` или override, `lease`), таблица `machine` + `machine_lease.machine_id` (миграция 1789400000000); `self-hosted` в каталоге (byo-роут `local` поглощён, `ByoMachineProvider` удалён; `local` = только docker); `SelfHostedMachineProvider` — мост в контекст machine (claim `FOR UPDATE SKIP LOCKED`, release, lease ids, headroom); YC-провайдер регистрирует эфемерную `Machine` при заказе (user-data несёт `SW_MACHINE_ID` + `SW_REGISTRATION_TOKEN`); **одна идентичность агента = Machine**: `POST /internal/machines/{m}:register` (registrationToken → machineToken, audience `sw-internal-machine`) и `POST /internal/machines/{m}:sync` (факты + наблюдаемые слоты → назначения); лизовые токены/guard/контроллер удалены; `machine-agent.sh` синкается как машина, `machine-installer.sh` (`/internal/machines/installer:download`) регистрирует, кладёт `~/.sw/machine.env`, ставит systemd-юнит или запускает в foreground; публичный API `projects/{p}/cloudAccounts/{c}/machines` (create/list/get/delete?force, `:generateRegistrationToken` → `installCommand`, `:cordon`/`:uncordon`/`:drain`); **429 гарантированно**: `EnvironmentProviderGateway.reserve()` — create-environment сажает окружение синхронно под пер-пуловым локом (аренда `enqueued` с оценкой ёмкости `MACHINE_POOL_SLOTS_PER_MACHINE`, лимиты `maxLeases` и `maxAwaitingMachine` = headroom), иначе `MachinePoolExhaustedError` → `RESOURCE_EXHAUSTED` и окружение удаляется; воркер провижнит `enqueued → ordering` атомарно (один заказ на аренду при N воркерах), `adoptMachine` берёт реальную ёмкость машины; молчащие машины → `offline` тиком воркера. Тесты: unit Machine/Headroom/lease, integration `machines.test` (API + internal, 7), `self-hosted-machine-pool.test` (воркер, 4), YC-тесты адаптированы. Ранбук переехал в `docs/deploy/self-hosted-machines/README.md`.

Live на маке (2026-09-08): мак подключён как `Machine` через API (`fqdn 127.0.0.1`, slotCapacity 2), `installCommand` выполнен → `online`/`ready` (12 cores, hvf, эмулятор, AVD-ы, docker, VNC-стек); окружение → аренда на машине → слот → ACTIVE → сессия/VNC через wd (RFB-баннер, труба рвётся на delete); **429 от пула проверен**: два окружения (по слотам) → 201, третье → `machine pool: every machine is full…`. Два бага, пойманные живьём и покрытые тестами: (1) data source аренды не персистил `machineId`/`slotCapacity` (явный список колонок в update); (2) гонка «API сажает (reserve) vs воркер сажает (provision) одно окружение» брала второе место — теперь `placeOrCreate` под пуловым локом сначала ищет место ЭТОГО окружения. Ёмкость новой аренды = слоты машины, которую пул возьмёт следующей (`Headroom.nextSlotCapacity`, claim и headroom смотрят одну и ту же «самую старую свободную»), а не конфиг-оценка; оценка `MACHINE_POOL_SLOTS_PER_MACHINE` остаётся только для YC. Миграция `1789500000000` выбросила аренды ушедшего byo-роута `local` (их некому возвращать).

**S2 (сделано, ветка `feat.self-hosted-ui`)** — UI без новых ручек: `lib/sw.ts` (тип `Machine`, list/attach/detach?force/`:generateRegistrationToken`/`:cordon|:uncordon|:drain`), `lib/use-machines.ts` (поллинг 3с), `components/machines-section.tsx` — на карточке self-hosted облака бейдж «N ready / M attached» и таблица машин (fqdn + facts в tooltip, provides, state + admission, ready с conditions (blocking красные, degrading жёлтые), slots used/total, last sync, agent), кебаб: Install command (пока `pending`), Cordon/Uncordon, Drain (подтверждение), Detach (force-подтверждение, если машина в аренде); модалка Attach machine (fqdn, provides чекбоксами из привязок, слоты override) → сразу `:generateRegistrationToken` → одноразовая `installCommand` с copy; у окружения подпись «on <fqdn>» (обратная связь через `lease.environments`). Проверено: tsc + `next build`; форма API на стенде совпадает.

**S4 (сделано, ветка `feat.self-hosted-any-stereotype`)** — «машина обслуживает любой наш стереотип». Мост (`MachinePoolEnvironmentProviderGateway`) выбирает `launch` по execution окружения: эмуляторный (avd/device/apps) или контейнерный (`kind: container`, образ `linuxNodeProvisioning`, `containerPort`, `command: agentBootstrap`, env нода) — та же сборка, что у docker-адаптера, только выполняет её агент на машине пользователя. `machine-agent.sh`: `run_slot` диспатчит по `SW_SLOT_KIND`, контейнерный лончер делает `docker run --rm` (публикует порт слота на порт нода, добавляет `SW_ENDPOINT`/`SW_INTERNAL_TOKEN`, переписывает loopback CP в `host.docker.internal`, снимает контейнер по SIGTERM); desired.tsv несёт `kind` и base64 всего дескриптора. Каталог `self-hosted` получил `ubuntu/container` на `baremetal`, роутинг — соответствующий ключ; конфиг: `COMPUTE_BAREMETAL_BASE_IMAGE`/`COMPUTE_BAREMETAL_CONTAINER_PORT`/`COMPUTE_BAREMETAL_SCREEN_*`. Новое: `PATCH /v1/projects/{p}/cloudAccounts/{c}/machines/{m}` (`provides`) + `Machine.reprovide` + «What it serves» в UI; `VncStackMissing` теперь судит только эмуляторные машины. Тесты: unit (reprovide, сужённое условие), integration (контейнерный `launch` в ответе sync; PATCH в границах привязок облака; каталог). **Проверено вживую 2026-09-08** (обе площадки, ветка `feat.self-hosted-any-stereotype`): (1) **мак** — привязка `ubuntu/container` перенесена с облака `local` на self-hosted, машина `349e1aae` объявила оба стереотипа, агент поднял контейнерный слот (`sw-slot-<env>`, порт слота 4600 → 4444 нода), окружение ACTIVE, сессия, навигация, `title`, VNC-апгрейд 101. Каталожный chrome под amd64 в arm64-контейнере не идёт (известное ограничение мака) — брали проектную сборку `chromium 140-arm64`, версия определилась как `140.0.7339.16`. (2) **удалённая машина** — dev-хост юзера (32 ядра, kvm, docker, БЕЗ android-SDK): образ `sw-linux-base:24.04` собран там же (`--network host`, иначе apt не резолвит зеркало), машина подключена через ssh-туннели (`-R 3002` для агента, `-L 4600` для wd) и socat на `172.17.0.1:3002` (контейнеры хоста не видят loopback-туннель), окружение с каталожным `chrome 152.0.7977.82` → ACTIVE, сессия, навигация на data- и http-URL, VNC 101. После прогона всё снесено, хост чист. **Найдено и починено живой проверкой:** в `desired.tsv` пустые колонки склеивались (`read` с табом как IFS схлопывает соседние табы) и для контейнерного launch поля съезжали — теперь в строке только всегда непустые поля, а параметры каждый лончер читает из base64-дескриптора (`launch_field`).

**Дальше:** S3 — live на VM юзера (есть `/dev/kvm`); S4 — linux-слоты пула. Follow-ups: mTLS агента, ротация `machineToken`, реальная ёмкость машины vs оценка при провижне YC (после регистрации сервера аренда могла бы взять facts-ёмкость).

## [DESIGN] одна платформа на нескольких облаках проекта, размещение — ЯВНОЕ — СДЕЛАНО (2026-09-09)

Правило «одна привязка платформы на проект» снято: платформу может обслуживать несколько облаков. **Куда поедет
окружение, называет запрос — платформа не выбирает за пользователя** (решение юзера 2026-09-09; тот же принцип, по
которому подключение создаётся пустым, а каждая платформа привязывается руками). Промежуточный вариант с обходом
кандидатов по порядку привязки был сделан и убран: он размещал окружение без ведома вызывающего.

Как сейчас:
- `POST …/environments` принимает `cloudAccount` (uid или resource name — тот же адрес, каким окружение отвечает);
- поле **обязательно ровно тогда, когда платформу обслуживает больше одного облака** проекта. Одно облако — выбирать
  не из чего и скрывать нечего, поле не нужно;
- неоднозначность → `INVALID_ARGUMENT` со списком облаков («name the one to run on (cloudAccount): local (…),
  self-hosted (…)»); названное облако, которое платформу не обслуживает → `INVALID_ARGUMENT`;
- полное облако → 429 по нему, без тихого переезда на соседнее;
- домен: `CloudAccountList.candidatesFor` (что есть на выбор) и `.on(cloudAccountId, …)` (названное облако);
  уникальность привязки осталась внутри облака, проектная снята; у привязки появилось `createdAt` (миграция
  `1789600000000`) и `createTime` в ответе — стабильный порядок перечисления;
- ответ окружения несёт `cloudAccount`/`cloudType`/`computeKind`;
- UI: в форме нового окружения обязательный выбор «Run on», когда облаков больше одного; в строке окружения — где
  приземлилось; в форме привязки платформа, занятая другим облаком, не блокируется, а подписывается «also on …».

**Что за это отдали:** автоматический перелив под пик и автоподхват при недоступности облака. Теперь это политика
КЛИЕНТА: получил 429 — повторил с другим облаком. Если понадобится вернуть, честная форма — явный опт-ин в запросе
(упорядоченный список облаков или флаг «можно перелить»), а не невидимый дефолт.

**Решение по сессиям (юзер, 2026-09-09): облако выбирается при создании ОКРУЖЕНИЯ, сессия остаётся облако-агностичной.**
Сессия не поднимает окружение, она берёт любое свободное подходящее — где оно крутится, её не касается. Пробный фильтр
`sw:cloudType` в запросе сессии был начат и откачен.

Живая проверка (2026-09-09, мак): в `alice-demo` `ubuntu/container` обслуживают self-hosted и `local`. Создание без
`cloudAccount` → 400 со списком обоих облаков; с `cloudAccount` облака `local` → окружение создано на docker-облаке.

**Осталось follow-up:** опт-ин на перелив, если понадобится; в UI показывать список облаков, обслуживающих платформу,
прямо в карточке.

## [AIP] у облачного подключения появились id и displayName, имена ресурсов выровнены — СДЕЛАНО (2026-09-09)

Раз облако теперь называют в запросе создания окружения, писать в нём uuid неприятно. По гугловым правилам это два
РАЗНЫХ поля, и оба у нас уже были на проекте: **идентификатор ресурса** (AIP-133 — задаётся клиентом при создании,
неизменяем, уникален у родителя, стоит последним сегментом `name`) и **`displayName`** (AIP-148 — свободная изменяемая
подпись, не адрес). Подключение получило оба: `cloudAccountId` и `displayName` в connect, колонки + частичный уникальный
индекс на `(project_id, resource_id)` (миграция `1789700000000`), адресация словом ИЛИ uid — в путях
(`/cloudAccounts/{word|uid}`) и в поле `cloudAccount` создания окружения.

Заодно выровнены имена ресурсов: `CloudAccountPresenter`/`ComputeBindingPresenter`/`MachinePresenter` собирали `name` из
**uuid проекта**, тогда как окружения и приложения — из его адреса. Теперь все presenter-ы адресуют проект так же, как
его назвал вызывающий, а подключение — своим словом, если оно есть. Один ресурс — одно имя, где бы он ни появился.

## [AIP] нет метода Update у проекта и у облачного подключения — НЕ начато (замечено 2026-09-09)

Из пяти стандартных методов у **проекта** есть три: Create, Get, List. `PATCH /v1/projects/{project}` отвечает
`404 Cannot PATCH`, Delete тоже нет (см. отдельный пункт про удаление проекта). Практический смысл: **подпись проекта
задаётся один раз навсегда** — опечатался в `displayName`, и исправить нечем, а лишний проект ещё и не удалить.

У **облачного подключения** та же дыра, и это мой недосмотр из среза про имена: `displayName` в домене изменяемый
(`CloudAccount.rename`), но ручки, которая бы его вызвала, я не сделал. Поле выглядит изменяемым и не является им.

Кто Update умеет сегодня: привязка платформы, машина, назначение хранилища. Не умеют: проект, облачное подключение,
окружение (оно неизменяемо по замыслу — пересоздаётся), netbridge-кред [→ ИТОГ tunnels].

Что делать: `PATCH` проекту и подключению, меняющий только `displayName` (и `description`, если заведём). Заодно решить
про **`updateMask`** (AIP-134): сейчас ни один наш PATCH его не принимает, семантика — «меняю поля, которые прислал».
Для двух полей это терпимо, но если решаем «делаем по стандарту», маску надо вводить сразу и одинаково во всех PATCH-ах.

## [AIP] стандартные поля заполнены неровно: `updateTime` почти нигде — НЕ начато (аудит 2026-09-09)

Сами ИМЕНА и форматы по стандарту: `name` — относительное имя ресурса из пар «коллекция/идентификатор» в
lowerCamelCase без ведущего слэша (AIP-122), `uid` — системный uuid рядом с человекочитаемым адресом (AIP-148),
`displayName` — свободная подпись, не адрес (AIP-148), время в RFC 3339 UTC с суффиксом `Time` (AIP-142), поля JSON в
lowerCamelCase (AIP-140), клиентский идентификатор при создании — отдельным полем `{resource}Id` (AIP-133).

Неровности (замер по всем presenter-ам API):
[ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] - **`updateTime` есть только у проекта и облачного подключения.** У окружения, привязки, машины, приложения, версии
  приложения и netbridge-кредa [→ ИТОГ tunnels] есть `createTime`, но нет `updateTime` — а все они изменяемые.
- `displayName` нет там, где он был бы уместен: у окружения и у машины (человеку удобнее «ночная коробка», чем fqdn).
- `uid` нет у `platform`, `storageDelegation`, `storageDestination` — первые два install-статика, третий синглтон
  (AIP-156), для них это допустимо, но стоит решить осознанно.

Правка механическая: добавить `updatedAt` в presenter-ы (в домене он почти везде уже есть) и решить про подписи.

## [AIP] списки без пагинации — НЕ начато (аудит 2026-09-09)

AIP-158 требует, чтобы List-методы отдавали страницы. Постранично у нас: проекты, окружения, приложения проекта.
Целиком отдаются: `cloudAccounts`, `computeBindings`, `machines`, `netBridgeCredentials` [→ ИТОГ tunnels], `cloudTypes`, `platforms`.
Для первых четырёх это осознанный компромисс «их немного» — но `machines` в инсталляции с сотней коробок уже не
«немного», и это первый кандидат на `pageSize`/`pageToken`. `cloudTypes` и `platforms` — install-статика, там
пагинация бессмысленна (гугл такие ресурсы тоже отдаёт целиком).

## [ARCH] одна схема: провайдер даёт МАШИНУ, мы её нарезаем — СОГЛАСОВАНО как целевая (юзер, 2026-09-12)

Сегодня мощности достаются двумя разными способами: «окружение на машину из пула» (`baremetal`) и «отдельная коробка
на каждое окружение» (`docker`, `vm`, `kubernetes`). Отсюда две модели ёмкости, два пути размещения и асимметрия в
диагностике: у пуловых машин видно заранее, что коробка не потянет, у остальных — только когда окружение не поднялось.

**Целевая схема одна: провайдер выдаёт МАШИНУ, пул размещает на ней окружения.** Откуда машина взялась — забота
провайдера: пользователь принёс, облако заказало, или это коробка самого контрол-плейна. С точки зрения потребителя
ничего не меняется: «создай такое-то окружение», а на чьей машине оно оказалось — деталь.

**Форма машины — настройка привязки, а не решение архитектуры (уточнение юзера).** По умолчанию заказываем машину под
ОДНО окружение: схема работает как сегодня, простоя не оплачиваем. Опционально настраиваем форму крупнее: первый
запрос поднимает коробку на N окружений, следующие N−1 стартуют секунды вместо минут. Плата за это — риск простоя,
ограниченный существующим возвратом по idle-TTL (пустая машина возвращается облаку сама). То есть ручка звучит как
«сколько простоя я готов оплатить ради быстрого старта следующего окружения».

**Kubernetes ложится так же, и его «свой нарезатор» этому не мешает.** Под — это машина на одно место. Их планировщик
решает, на каком узле физически окажется под, ровно как гипервизор облака решает, на каком хосте окажется наша
виртуалка: этот уровень НИЖЕ нашей линии, мы его никогда и не моделировали. Если позже захочется, «большой под» на
несколько слотов — это та же ручка формы машины, что и большая виртуалка.

**Что при этом упрощается.** Поле `kind` (`docker | vm | kubernetes | baremetal`) сегодня смешивает две оси и почти
растворяется: остаётся «как машина добыта» (принесена / заказана / коробка контрол-плейна) и «чем является окружение»
(`runtimeKind`: контейнер или эмулятор). Отдельное слово для «vm против baremetal» не нужно — это разные формы машины
у одного провайдера, вопрос размера и цены.

**Что придётся признать честно.**
- Коробка контрол-плейна тоже становится машиной, а не особым адаптером.
- Окружения на одной заказанной виртуалке перестают быть изолированы ядром — делят машину, как уже делят эмуляторы.
- Механика провижна всё равно двух сортов: машины под управлением агента (многослотовые) и машины, которые создаются
  сразу с окружением (однослотовые: под, мелкая vm, контейнер на докере). ОТКРЫТЫЙ ВОПРОС: нужен ли однослотовой
  машине двухуровневый протокол (machine-agent + environment-agent), или для неё они схлопываются в один.
  Довод ревьюера (2026-09-13): не нужны — у Karpenter/CAPI NodeClaim 1:1 с инстансом, ноду регистрирует сам kubelet;
  environment-agent в поде регистрируется как машина с capacity = 1 окружение. ЮЗЕР: обсудить ОТДЕЛЬНО при возврате к
  реализации, хочет услышать аргументы — не решать походя.
- Диагностика заранее (`facts`, `hosts`) есть у любой машины, но у однослотовых она приходит поздно — вместе с самой
  машиной, а не до заказа.

Пункты про ресурсную ёмкость и про группировку фактов — части этой же работы, а не отдельные затеи.

## [DESIGN] ёмкость машины по РЕСУРСАМ вместо счётчика слотов — СОГЛАСОВАНО, делать после переименований (юзер, 2026-09-12)

Сейчас ёмкость машины — скаляр: `slotCapacity = override ?? floor(cores / MACHINE_SLOT_CORES)` с потолком 16, и все
места считаются одинаковыми. Из-за этого браузерный слот стоит столько же, сколько эмуляторный (четыре ядра), а на
32-ядерной коробке выходит восемь мест вместо реальных двух-трёх десятков.

**Решение юзера:** считать ёмкость по фактам машины (`cores`, `memoryMb`, позже диск), у каждого вида окружения
завести заявку на ресурсы, свободное место получать вычитанием суммы заявок размещённых окружений. «Сколько слотов
осталось» перестаёт быть полем и становится производной величиной, РАЗНОЙ для разных видов. Это же открывает
подселение linux- и android-окружений на одну коробку.

Что тянет за собой (всё выявлено при разборе, не забыть):
1. **Инвариант «одна аренда на машину» придётся снять** — сегодня машина захвачена одной арендой, аренда принадлежит
   одной привязке, поэтому смешать виды нельзя независимо от арифметики. Либо у машины несколько аренд, либо аренда
   остаётся только для ЗАКАЗАННЫХ машин (там мы платим за сервер и возвращаем его), а подключённые размещают напрямую.
   Тест `a machine held by one platform's pool is not given to another platform` в этот момент меняет смысл.
2. **Порты.** Сейчас номер слота однозначно задаёт блок портов, а потолок 16 — это adb (консоли эмулятора на чётных
   портах 5554..5584). При разнородных местах порты выдаются по заявке: эмулятору консоль+adb+vnc, контейнеру только
   порт ноды. Потолок 16 остаётся, но только для эмуляторов.
3. **Откуда заявки.** Объявить по паре (платформа, исполнение) на уровне инсталляции, с переопределением в привязке;
   учесть, что размер AVD зависит от модели устройства.
4. **Резерв и переподписка.** Всё железо под окружения отдавать нельзя (ОС, агент, docker). Простейшее v1 —
   фиксированный резерв, без переподписки.
5. **429.** Гарантия сохраняется, но запрос меняется: не «count(*) < capacity», а «влезает ли заявка хоть куда-то» —
   суммирование под тем же пер-аккаунтным локом.
6. **Факты.** Диск сейчас не собираем, а он нужен (образы AVD, браузеры) — расширить `facts`.
7. **API.** Вместо `slotCapacity: 3` — блок `resources{capacity,reserved,allocated}` (форма согласована в пункте
   «ресурсы machine и machineLease» ниже). `fits: {"android/emulator": 1, …}` ОТВЕРГНУТ юзером: это знание про виды
   окружений на коробке; «сколько ещё влезет» — вопрос стороны размещения, если понадобится UI — отдельный запрос.
8. **Оговорка, которую математика не ловит:** эмулятор рядом с браузерами — шумный сосед; по цифрам сойдётся, по
   времени отклика нет.

Этот пункт ПОГЛОЩАЕТ ранее записанную «цену слота по стереотипу» и закрывает follow-up про vector bin-packing.
Порядок работ: сначала переименования (дёшево, те же файлы), сразу после — этот срез на устоявшихся именах.

## [ARCH] машина = общая ёмкость: разные окружения на одной коробке, аренда только у заказанных — РЕШЕНИЕ ЮЗЕРА, ДЕЛАТЬ (2026-09-13)

**Решение юзера:** на одной машине живут окружения РАЗНЫХ runtime/привязок; обратную совместимость ломаем. Это
ПОГЛОЩАЕТ пункт «ёмкость по ресурсам вместо счётчика слотов» (его п.1 «снять инвариант одна аренда на машину» — здесь
решён: аренда остаётся ТОЛЬКО у заказанных машин) и реализует «одну схему» в домене.

**Модель (5 правил):**
1. **Machine — общая ёмкость.** `capacity` (инвентарная: измерено агентом при регистрации; заказанная: из заказа с
   момента заказа), `reserved` (политика инсталляции: ОС/агент/docker; конфиг `MACHINE_RESERVED_{CPU_MILLICORES,
   MEMORY_MB,DISK_GB}`), `allocated` = Σ заявок размещённых окружений. Свободно = capacity − reserved − allocated.
   Единица CPU — `cpuMillicores` везде. `slotCapacity`/override/`MACHINE_SLOT_CORES`/`SlotCapacityPolicy` — снос.
2. **Размещение (`MachinePlacement`) — ребёнок МАШИНЫ, не аренды** (заменяет `SlotAssignment`): envId UNIQUE, runtime,
   заявка ресурсов, slotIndex (для портов), state. Инвариант ёмкости — в `Machine.place(request)`: не влезает →
   доменная ошибка. Порты — по runtime: эмулятору console/adb/vnc/wd/appium из индексов 0..15 (потолок adb),
   контейнеру один порт ноды из отдельного диапазона индексов (16..N) — `SlotPorts.forRuntime(runtime, index)`.
3. **Пригодность машины — по фактам против требований runtime** (`platforms/{p}/runtimes/{r}.requirements.anyOf`),
   `Machine.satisfies(requirements)`; `provides[]` и `judgeConditions` (kvm/docker-правила) — снос. Каталог runtime
   (требования + заявка, размер слота включая overhead) — install-static в PlatformCatalogProvider рядом с versions.
4. **Аренда (`MachineLease`) — только запись о ЗАКАЗЕ**: у машин, которые провайдер изготовил по нашему запросу
   (binding, request, providerContext, state pending|active|releasing|released|failed, времена). У инвентарных машин
   аренды НЕТ (`machine.lease` отсутствует — заказа не было). Строка машины создаётся В МОМЕНТ заказа (capacity из
   заказа, connectivity offline, agent absent) — размещение всегда идёт на строку машины, «enqueued-seat» аренды исчезает.
5. **Правило размещения одно на оба рода:** среди машин ПРОВАЙДЕРА (не привязки!), удовлетворяющих требованиям runtime
   и имеющих свободное место (включая ещё грузящиеся заказанные) — best-fit (наименьшая подходящая; консолидация);
   нет → у заказывающего провайдера привязка заказывает новую (в пределах `limits.maxMachineCount`), у инвентарного —
   429. Всё под пер-аккаунтным advisory-lock (прецедент 429-гарантии). Заказанная машина ДЕЛИТСЯ между привязками
   провайдера (как нода Karpenter: запустил один NodePool, поды любые), считается в лимит заказавшей, возвращается по
   idle-TTL только когда ПУСТА ОТ ВСЕХ окружений.

**Решения юзера по следствиям (2026-09-13):**
- **Соседство — НЕ ручка (юзер, 2026-09-14: `machineSharing: exclusive|shared` ОТМЕНЁН), а в v1 — вообще не вопрос
  (юзер, 2026-09-15: МЕТКИ ТОЖЕ ЗА СКОБКИ).** v1 оперирует только тем, что даёт железо: годность = факты машины ⊨
  `runtime.requirements.anyOf` (есть kvm → можно эмуляторы), место = свободные ресурсы. Селектора на привязке НЕТ,
  `labels` у машины НЕТ. Правило размещения: кандидат = машина провайдера, факты ⊨ требования runtime ∧ хватает
  свободного; best-fit (наименьшая подходящая); нет кандидата → заказывающий провайдер заказывает машину (форма — из
  `machineSelector.resources`… см. ниже), инвентарный → 429. Разделение «эти коробки под эмуляторы, те под браузеры»
  — ОТДЕЛЬНЫЙ ШАГ (метки на машине + `machineSelector.matchLabels`, k8s nodeSelector + well-known labels: cloud
  ставит `shape`/`zone` сам, админ — свои; `matchExpressions`/`In` ещё позже). Форма расширяется добавлением полей,
  не ломая v1.
- **`limits.maxMachineCount` — универсален и REQUIRED, определение одно:** максимум машин, ОДНОВРЕМЕННО несущих
  окружения этой привязки (у заказывающего+exclusive это ровно «сколько может заказать»; у инвентарного — потолок
  разброса по коробкам). Юзер: «пусть будет».
- **Селектор вместо шаблона — юзеру НРАВИТСЯ, докручиваем (2026-09-13).** Принцип юзера: привязка — ДЕКЛАРАЦИЯ, захват
  и потребление ресурсов в ней не происходят → на привязке НЕТ ни `resolvedShape`, ни `machineCapacity` (оба —
  предсказания, а не декларация; прежнее решение про `machineCapacity` OUTPUT_ONLY на привязке ОТМЕНЕНО). Три слоя:
  привязка = `machineSelector` (что должна удовлетворять машина); аренда = что РЕАЛЬНО заказали (`request` — снимок
  селектора/требований, `parameters` — выбранный SKU/spec провайдера: `configurationId`+`hardwarePoolId` или spec VM);
  машина = что получили (`resources.capacity`). Превью для UI («что бы выбрал провайдер сейчас») — НЕ поле привязки,
  а read-метод провайдера: `POST …/computeProviders/{cp}:quoteMachine {runtime, machineSelector}` →
  `{shape, capacity}` (позже `price`); `validateOnly` на привязке остаётся чистой валидацией, полей не выдумывает.
  `folderId`/`zoneId`/`platformId` — настройки соединения провайдера (разобрать в `computeProviders`).

**Срезы (ветка → PR → юзер мержит):**
- **S1 домен:** `MachineResources` VO (cpuMillicores/memoryMb/diskGb; plus/minus/fits), `Machine.{capacity,reserved,
  allocated,place,release,satisfies}`, `MachinePlacement`, `SlotPorts.forRuntime`, каталог runtime с requirements+
  resources, аренда → запись о заказе; unit-тесты (place/release/инвариант/порты/satisfies/best-fit-критерий).
- **S2 персистентность + размещение:** миграция (`machine_placement`; у `machine` capacity-колонки, снос
  slot_capacity/override/provides/lease_id; у `machine_lease` снос assignments/slot_capacity/host_ip, + machine_id,
  request); data sources/репозитории; Place/Release/Reconcile на новой модели; 429 «влезает ли куда-то»; поток
  заказа (строка машины при заказе); desired-state агента из placements; integration blackbox: эмулятор + контейнер
  на одной коробке; 429 при «не влезает»; заказанная машина делится; возврат только когда пуста от всех; молчащая.
- **S3 минимальная поверхность API/UI:** машина отдаёт `resources{capacity,reserved,allocated}` вместо `slotCapacity`,
  attach без `provides`/`slotCapacity`, `maxEnvironments` из config привязки — снос (429 по факту); фронт (таблица
  машин, attach-модалка) и runbook self-hosted. Имена НЕ переименовываем — это волна переименований.
- **Live:** Mac (эмулятор + контейнер на одной коробке), VM `gavryushin-dev` (kvm).

## [DESIGN] ресурсы `machine` и `machineLease` на проводе — СОГЛАСОВАНО поле за полем (юзер, 2026-09-12..13)

Итог разбора ручки `machines` под «одну схему»: машина — только КОРОБКА, ничего про окружения; всё, что было знанием
про виды окружений на коробке, удалено. Проверено по первоисточникам (AIP-121/122/124/133/135, GKE, k8s, Ansible) и
независимым ревьюером; ошибки ревью зафиксированы, чтобы не повторять.

**Machine** — `projects/{p}/computeProviders/{cp}/machines/{uuid}`:
- `providerId` — по стандарту k8s Node / Cluster API `providerID`: `<провайдер>://<где>/<id>`
  (`yandex-cloud://ru-central1-a/<serverId>`, `self-hosted://<address>`). Строка самоописывающаяся.
- `address` (вместо `fqdn` — принимает и IP, имя врало). Self-hosted: обязателен при attach; cloud: absent, пока
  провайдер не выделил интерфейс (агент — fallback). ЕДИНСТВЕННЫЙ адрес: «адрес агента» = адрес той же коробки,
  различаются только написания/интерфейсы — второе поле убрано.
- `connectivity: online|offline`, `schedulability: schedulable|cordoned|draining` (k8s-слова по выбору юзера),
  `ready = online ∧ schedulable` — оставлено сознательно как единственное слово пула/UI: формула удлинится на нашей
  стороне, когда появятся conditions.
- `conditions[]` — ВОЗВРАЩЕНЫ решением юзера 2026-09-13 (см. пункт computeBinding: `DiskPressure` у машины,
  `NoFittingMachine` у привязки). Исходно было убрано: `NotRegistered` дублировал отсутствие `agent.registerTime`,
  `CapacityUnverified`/`CapacityBelowOrder` — недоверие к контракту облака (заказали `bm-epyc-64` — получили его;
  расхождения = наши единицы GB/GiB), `SlotLaunchFailed` — событие ОКРУЖЕНИЯ (`failed` с причиной), не коробки.
  Формат зафиксирован (`{type, severity: error|warning, message}`, GKE-прецедент) и вернётся с первым настоящим
  условием про коробку (`DiskPressure`) — добавление поля обратно совместимо (AIP-180).
- `facts{arch, os{name: ubuntu|debian|macos, version}, virtualization: kvm|hvf|none}` — слово из Ansible/Puppet.
  Cloud: известны из заказа с первой секунды (конфигурация + образ); self-hosted: absent до регистрации.
- `resources{capacity, reserved, allocated}` по `{cores, memoryMb, diskGb}`: capacity — всего у коробки (cloud: форма
  заказа НАВСЕГДА, измерением не перепроверяется; self-hosted: измерено агентом, absent до регистрации); reserved —
  под ОС/агент/docker, политика инсталляции; allocated — сумма ЗАЯВОК размещённых окружений (не измеренное
  потребление). Свободно = вычитание. k8s-аналог `capacity`/`allocatable`/Allocated resources; `reserved` вместо
  `allocatable`, чтобы не публиковать два одинаковых по виду блока.
- `agent{version, registerTime, lastSyncTime}` — про наш демон, absent до регистрации.
- `lease` — полное имя текущей аренды или `null` (OUTPUT_ONLY, голое имя, не embedded).
- `createTime`, `updateTime`.
- УДАЛЕНО: `origin` (выводится из типа провайдера), `provides[]` (требования переезжают в runtime kind и матчатся
  против `facts`, k8s nodeSelector; `judgeConditions` с kvm/docker-правилами исчезает; намерение оператора «сюда не
  селить» — позже через labels+selector), `fqdn`, `state`, `admission`, `slotCapacity`, `agentVersion`, docker/avd/
  emulator/vncStack из facts, `hosts[]`, `fits`, `order` (см. lease).

**MachineLease** — `projects/{p}/computeProviders/{cp}/computeBindings/{b}/machineLeases/{uuid}`:
- Родитель — ПРИВЯЗКА, не машина. Верный AIP-довод (мой «владение/каскад» AIP-ам приписан зря): AIP-124 — ровно один
  канонический родитель, остальные связи полями + `filter`; AIP-133 — create в already-existing collection, а в облаке
  аренда СОЗДАЁТ машину; AIP-135 — detach машины с историей аренд падал бы `FAILED_PRECONDITION`. Прецедент один в
  один — k8s PV/PVC (claim у потребителя, PVC предшествует PV при dynamic provisioning, PV переживает PVC при Retain,
  bi-directional binding), GCE Reservation (`zones/{z}/reservations/{r}`, не под инстансом).
- Аренда = ЗАПРОС, машина = его исполнение; аренда создаётся ПЕРВОЙ (так и в коде: `enqueued` → `ordering` → `ready`).
  Одна форма для всех провайдеров: `request{requirements{…, resources{cores,memoryMb,diskGb}}, parameters{configuration,
  zone} | {}}` (`shape` слит в `requirements.resources` по замечанию юзера), `machine` (absent, пока провайдер не выдал
  коробку), `requestTime`, `acquireTime` (absent до выдачи).
- Требования — ЯВНЫЙ allow-list ПРОВЕРЕННЫХ профилей (юзер): `requirements.anyOf[]`, каждый элемент — конъюнкция
  одиночных значений фактов (`{os, arch, virtualization}`), между элементами — ИЛИ. Прецедент k8s
  `nodeAffinity.nodeSelectorTerms[]` («terms are ORed, expressions within a term are ANDed»), слово `anyOf` — из JSON
  Schema. Отвергнуто: независимые списки по фактам (`os: [..], arch: [..]`) — (а) массив ≠ «или» в индустрии
  (GitHub Actions `runs-on: [self-hosted, linux, x64]` — это И), (б) декартово произведение допускает непроверенные
  комбинации (linux+arm64+hvf). `os` — по имени дистрибутива, как в `facts.os.name` (`ubuntu`, `macos`), без нового
  понятия «семейство»: список — то, на чём реально гоняли; новая коробка (debian, windows) допускается осознанно.
  Пустого требования нет: «все текущие проходят» — не семантика allow-list.
- `environments[]` НА АРЕНДЕ НЕТ (юзер): связь many-to-one, канон AIP-124 — ссылка на стороне окружения
  [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] (`environment.machine`, OUTPUT_ONLY, полное имя, на МАШИНУ, не на аренду — физический факт «где исполняется») +
  `LIST environments?filter=machine=…` (AIP-160, пагинируется). Вложенная коллекция `…/machineLeases/{l}/environments`
  ОТВЕРГНУТА ревьюером как нарушение AIP-124 по букве (второй канонический путь того же ресурса). Прецеденты: k8s
  `pods --field-selector spec.nodeName=`, Spanner `backups.list?filter=database:`; GCE `instanceGroups.listInstances`
  и Pub/Sub `topics.subscriptions.list` отдают ССЫЛКИ/имена, не ресурс под вторым путём. Нагрузку без перечисления
  показывает `machine.resources.allocated`.
- «Что этот пул держит / за что плачу у провайдера» — `LIST …/computeBindings/-/machineLeases` (AIP-159 `-`).
- Ресурс read-only (создаёт/отпускает пул; действия оператора — на машине: `:cordon`/`:drain`). Поля: `state:
  pending|active|releasing|released|failed`, `request`, `machine`, `createTime` (= момент запроса), `acquireTime`,
  `releaseTime`, `updateTime`. `uid` НЕ даём ни аренде, ни машине — id в имени уже uuid.
- `pending` — ТОЛЬКО окно «заказ в пути» у облака. Очереди ожидания нет (принцип гарантированных ресурсов): self-hosted
  без свободной коробки и облако у потолка привязки отвечают 429 синхронно на create-environment, аренда не создаётся;
  отказ облака на заказ → `failed` → окружение `failed`.
- Провайдер ВЫБИРАЕТ исполнимый профиль из `anyOf` (YC → ubuntu/amd64/kvm); macos никуда не «пропихивается».
  Привязка при создании проверяет, что провайдер может исполнить хотя бы один профиль (см. разбор computeBinding).
- `filter` — синтаксис AIP-160 с первого дня (поле = "значение", AND), но ПОДМНОЖЕСТВО полей, задокументированное на
  каждом List; неподдерживаемое выражение → 400 INVALID_ARGUMENT (так делают сами Google API).
- Упрощения: состояние `ordering` становится производным от `machine.connectivity`;
  `Headroom.nextSlotCapacity` — это `requirements.resources` заказываемой машины.

**Ошибки ревью, зафиксированные по ходу:** `facts`/`capacity` дубль; `fits`/`hosts`/`provides`/`SlotLaunchFailed` —
знание окружений на машине; `agent` появился без объявления; `blocking|degraded` — выдумка без прецедента;
«AIP велит вкладывать под владельца» — не велит.

## [DESIGN] ресурс `computeBinding` — два раунда трёх независимых ревьюеров, СВЕДЕНО, ждёт «ок» юзера (2026-09-13)

Три ревьюера (AIP / домен / прецеденты) по восьми вопросам юзера. Сведённые выводы:
- **`uid` вернуть** на привязке: AIP-148 «declarative-friendly resources **should** include» — uid различает инкарнации
  одного имени; нужен ровно потому, что id становится пользовательским (`android-emulator` удалили-создали → name тот же,
  объект другой). Прецеденты: Cloud Run Service, Cloud Deploy Target (user id → uid есть), Dialogflow Agent (uuid в
  имени → uid нет). Отсюда: у машины/аренды (uuid в имени) uid НЕ нужен — прежнее решение верно. Плюс `etag` (AIP-154).
- **Комбинаторика platform × runtime — одно поле-ссылка на каталог** `environmentType: "environmentTypes/android-emulator"`
  (REQUIRED, IMMUTABLE, resource_reference): невалидную пару нельзя ВЫРАЗИТЬ — защита нативная, а не правило сервера,
  которое UI/клиенты дублируют. Декартов enum отпадает по AIP-126 (enum растёт не чаще раза в год). Прецедент GCE
  `machineType` = ссылка `zones/{z}/machineTypes/{t}`. `platform`/`runtime` на привязке — OUTPUT_ONLY для filter.
  Каталожный ресурс и есть место для требований вида окружения: `{platform, runtime, requirements{anyOf}, resources}`.
- **`kind` НЕ растворяется — переезжает.** [ARCH] прав на уровне пула (после `providerId` пулу всё равно, как у CAPI
  `Machine`), но механизм изготовления не исчезает: у YC Compute VM / BareMetal — разные API и параметры, не «размер».
  Все эталоны разводят пул и провайдер-специфичный шаблон: Karpenter NodePool→EC2NodeClass, CAPI Machine→
  InfraMachineTemplate, GitLab executor+секция, Jenkins cloud→template. Наша привязка = Karpenter NodePool, аренда =
  NodeClaim. Форма — inline `oneof` (AIP-146 «least generic», Cloud Deploy Target `gke|run|customTarget`, Secret
  Manager `automatic|userManaged`, сам YC: `bootDiskSpec` «only one of»): `machineTemplate: {vm: {…}} | {baremetal: {…}}`
  (имя — CAPI `MachineTemplate`; `machineSource`/`machineClass` — альтернативы ревьюеров). Дискриминатор = имя
  присутствующего члена, отдельный `machineKind` НЕ нужен. Каталожный `requiredConfig[{key,pattern}]` умирает —
  валидирует схема.
- **`machineKind: attached|builtin|…` — категориальная ошибка**: смешивает тип провайдера (родитель) с рецептом машины
  одного провайдера. У инвентарных провайдеров (self-hosted, builtin) `machineTemplate` ОТСУТСТВУЕТ; выбор коробки —
  селектором требований (Metal3 `hostSelector`).
- **`kubernetes` — не вид машины, а ТИП ПРОВАЙДЕРА** (свой инвентарь, креды, «под = машина на одно окружение»; CAPI
  kubevirt/vcluster — отдельные providers, Jenkins — отдельный cloud). Решать при разборе `computeProviders`.
- **Словарь:** `runtime` (без `Kind`) = container|emulator|device — k8s `runtimeClassName`, Nomad `driver`; конфликт
  ревьюеров закрыт: docker|vm|kubernetes|baremetal — это provisioner/executor, не runtime. Суффикс `Kind` никто не
  пишет (`machineType`, `driver`, `executor`). `machineShape` — неверное слово (OCI shape = размер).
- **`environmentsPerMachine` — выводимо** (k8s: `allocatable ÷ (requests + overhead)`; Karpenter ручки нет). Заявка
  окружения — на `environmentType` (дефолт) с override на привязке; размер машины — в шаблоне (`vm.cores`, у
  baremetal фиксирован конфигурацией). «Первый запрос поднимает коробку на N» = размер шаблона. Опциональный потолок
  `maxEnvironmentsPerMachine` (GKE `maxPodsPerNode`, Selenium `--max-sessions`) — когда ресурсы врут (hvf на Mac).
- **`limits` — одна крышка на деньги**: `maxMachineCount` (конвенция `max<Noun>Count`: GKE `maxNodeCount`, Cloud Run
  `maxInstanceCount`). Закономерность: кто платит за железо — капит billable unit; кто продаёт ёмкость — сессии
  (BrowserStack `parallel_sessions_max_allowed`). `maxEnvironments` счёт не ограничивает → это КВОТА ПРОЕКТА, не
  привязки. Для инвентарных провайдеров `maxMachineCount` не принимается (потолок = инвентарь).
- **`:test` → `GET …:verifyAccess`** (AIP-136 глагол+существительное, чтение = GET; KMS `ekmConnections:verifyConnectivity`).
- **id `android-emulator` — допустимо, но**: свободный `computeBindingId` с дефолтом = id environmentType; уникальность
  «одна привязка на environmentType у провайдера» — серверная проверка ALREADY_EXISTS, не структура id.
- **Факт YC** (ревьюер 3 по api-ref): BareMetal `Server.create` = `folderId, hardwarePoolId, configurationId` — `zone`
  там НЕТ; Compute `Instance.create` = `folderId, zoneId, platformId, resourcesSpec{memory,cores,coreFraction}`.

**Раунд 2 (после правок юзера: без environmentTypes/override/maxEnvironmentsPerMachine; uid везде; вложить resources в
requirements; неудобство от `yandexCloudVm` внутри привязки). Счёт и решение:**
- **Шаблон машины — INLINE oneof, члены по МЕХАНИЗМУ, не по провайдеру** (`machineTemplate: {vm: {…}} | {baremetal: {…}}`).
  2:1 (AIP + прецеденты против домена). Прецеденты 4 ref : 3 inline (GCE MIG/AWS ASG/CAPI/Karpenter — ref; GKE
  `NodeConfig`/EKS/Azure VMSS — inline); решающий фактор ref-стиля — версионируемый переиспользуемый шаблон или тип в
  ЧУЖОЙ API-группе; у нас ни того ни другого. «Утечка родителя» была в ИМЕНИ члена: мульти-провайдерные API держат
  имя провайдера в ребёнке всегда (`nodeClassRef.kind: EC2NodeClass`), single-provider — никогда (`NodeConfig.machineType`);
  наш родитель `computeProviders/{cp}` уже фиксирует провайдера → член `vm`, поля — словарь провайдера-родителя
  (схема члена определяется типом родителя, документируется per type). Вынос в `machineTemplates/*` + ref — по правилу
  трёх, EKS-образец (`launchTemplate` взаимоисключает inline-поля).
- **Имя `machineTemplate`** 3:0 (template ×4: GCE instanceTemplate, AWS launch template, CAPI *MachineTemplate, Jenkins;
  class ×1 Karpenter; домен отозвал `machineClass`).
- **`folderId` — на соединение провайдера** (Crossplane `ProviderConfig.projectID`, Terraform `google.project`), из
  шаблона убрать; несколько папок = второе соединение. Финализировать при разборе `computeProviders`.
- **CPU — `cpuMillicores` int** 2:1 (AIP-141 «unit as suffix», без float и без строк-quantity; Docker `NanoCpus` int64,
  ECS `cpu` int, k8s хранит `MilliValue()`); домен хотел `cores` int («машинный уровень») — отклонено: единица одна на
  capacity/allocated/request и должна вмещать дробь (YC `coreFraction`, полъядра на браузер). `memoryMb`/`diskGb`
  остаются. В шаблоне YC-VM — ИХ поля (`cores`, `coreFraction`): зеркало API провайдера.
- **`runtime` — одно поле-ссылка на ДОЧЕРНЮЮ read-only коллекцию существующего каталога**:
  `runtime: "platforms/android/runtimes/emulator"`. Снимает и «валидируем, а не защищаем» (AIP), и возражение юзера
  против нового топ-левел типа. Отдельного `platform` (OUTPUT_ONLY «для filter») НЕТ — юзер: «зачем обе?»; фильтр по
  префиксу `runtime` (AIP-160 wildcard) закрывает ту же нужду одним полем. `platforms/{p}/runtimes/{r}` = {runtime,
  requirements{anyOf, resources}} — resources ВЛОЖЕНЫ в requirements (одна семантика с арендой: «факты ∈ anyOf И
  свободных ресурсов ≥ resources»); число = размер СЛОТА включая overhead (эмулятор + adb + агент; k8s
  `RuntimeClass.overhead`) — задокументировать, отдельного поля не заводить.
- **Полоса declarative-friendly (AIP-128) — принять для конфигурационных ресурсов** (project, computeProvider,
  computeBinding, machine): опциональный пользовательский `computeBindingId` (AIP-133 MUST на management plane; нет —
  uuid), `uid`, `etag` на PATCH (AIP-154). `uid` на транзиентных (environment, lease) — косметика, но единое правило
  «у каждой строки БД» дешевле исключений; каталоги без uid (`Location`, GCE `MachineType` его не несут).
- **`limits.maxMachineCount` — ОБЯЗАТЕЛЕН у всех провайдеров, включая инвентарные** (юзер: «всегда стоит задавать»).
  Отсутствие = «без потолка» — ровно та неожиданность в счёте, от которой предостерегает Jenkins EC2 (instance cap
  по умолчанию не ограничен); принцип гарантированных, полностью известных ресурсов требует явного потолка. Для
  инвентарных — доля инвентаря, не отдать всё одной привязке. Прежнее «не принимается у self-hosted» снято.
- **Одна привязка на пару (platform, runtime) у провайдера** — уже энфорсит агрегат → `ALREADY_EXISTS` (ResourceInfo
  на существующую); смена механизма — PATCH `machineTemplate`, не вторая привязка (живые аренды доживают на снимке).
- **Межполевая зависимость `runtime × machineTemplate` — НОРМА, не smell (ревьюер, 2026-09-13; юзер сомневался).**
  AIP запрещают лишь неверную аннотацию (AIP-203: условно-обязательное не помечать REQUIRED → `machineTemplate`
  OPTIONAL + документ «обязателен у изготавливающих, запрещён у инвентарных»); AIP-146 — oneof, без каскадов.
  Прецеденты отказа на create из-за двух по отдельности валидных полей: GCE GPU×machineType, Cloud TPU
  `invalid_argument: Accelerator type … is not available in zone`, GKE `400: Accelerator type … does not exist in
  zone`, Cloud SQL `Invalid Tier … for … Edition`, k8s hostPort/hostNetwork и CEL-правила CRD. Правило: **отвергай
  невозможное по конструкции, откладывай зависящее от состояния** (k8s: структурное — на admission, nodeSelector
  без нод — Pending) → асимметрия cloud/self-hosted ПРИНЦИПИАЛЬНА, self-hosted при пустом инвентаре не отвергать.
  Структурно не убрать: связь N:M (ubuntu/container идёт и на vm, и на baremetal); выводить шаблон из runtime —
  скрытый defaulting оплачиваемой конфигурации. Дополнение (b): `computeProviderTypes/{t}` отдаёт
  `machineTemplateKinds[] {kind, facts}`, чтобы UI считал совместимость той же функцией, что сервер (как GKE
  `getServerConfig.validNodeVersions`).
  **Код — `INVALID_ARGUMENT`, не FAILED_PRECONDITION** (code.proto: «problematic regardless of the state of the
  system»; у YC-vm нет состояния, которое можно починить — kvm там не появится; TPU для зоны тоже invalid_argument).
  Details (AIP-193): `ErrorInfo{reason: RUNTIME_MACHINE_TEMPLATE_INCOMPATIBLE, metadata{runtime, templateKind,
  requiredAnyOf, providedFacts}}` + `BadRequest.field_violations[{field: "machineTemplate.vm"}]` — указывать на
  шаблон (его выбирает пользователь; runtime immutable); self-hosted + шаблон → `MACHINE_TEMPLATE_NOT_ALLOWED_FOR_PROVIDER`.
  Прежние упоминания FAILED_PRECONDITION для этой проверки в пункте — считать исправленными.
  **Настоящая дыра по ревьюеру — не зависимость, а отсутствие статуса у привязки**: GKE NodePool имеет `conditions[]`
  + `RUNNING_WITH_ERROR`, Karpenter NodePool — `NodeRegistrationHealthy`. Варианты: `Warning`-header на create
  (k8s RFC 7234 — снимок, не статус) или OUTPUT_ONLY `fittingMachineCount` у инвентарных (0 = «ничего не поедет»).
  РЕШЕНИЕ ЮЗЕРА (2026-09-13): ПОДНЯТЬ — вводим `conditions[]` одним срезом на ОБА ресурса, один формат
  `{type, severity: error|warning, message}` (GKE-прецедент, проверен). Содержимое первой версии:
  · `computeBinding`: `NoFittingMachine` (warning) — ни одна машина провайдера не удовлетворяет
    `runtime.requirements.anyOf` (считается на чтении из текущего инвентаря доменом, не хранится; у изготавливающих
    не бывает — шаблон гарантирует). message: требования + «N attached, 0 fit».
  · `machine`: `DiskPressure` (error → `ready=false`, размещение прекращается; k8s: taint NoSchedule) — свободный
    диск ниже порога; агент присылает `diskFreeGb`, порог — политика домена (VO-критерий), не агента.
  · `ready` машины = online ∧ schedulable ∧ нет condition с severity error (формула удлиняется на нашей стороне).
  · Пустой список у здоровых — `conditions: []` присутствует всегда (как у GKE), это уже не «поле без содержимого».
  Место в очереди: сразу после обзора ручек, ДО волны переименований (форма на проводе должна быть в proto).
- **ПОПРАВКА v1 (юзер, 2026-09-17): `machineSelector.resources{cpuMillicores,memoryMb,diskGb}` ВОЗВРАЩЁН и у
  заказывающих провайдеров ОБЯЗАТЕЛЕН** — пользователь явно видит, что закажет; значение должно быть ИЗГОТОВИМЫМ (металл —
  точный размер SKU, VM — допустимая комбинация YC), иначе `INVALID_ARGUMENT` `MACHINE_SIZE_NOT_AVAILABLE` с перечнем
  доступных; отсутствие → `MACHINE_SIZE_REQUIRED`. **REQUIRED У ВСЕХ (юзер, 2026-09-17)** — и у инвентарных: нижняя
  граница коробки («эмуляторы только на коробках не меньше…»); UI подсказывает размер одного окружения. Единая
  семантика: машина привязки ≥ resources; у заказывающего значение изготовимо, поэтому «≥» = «ровно». Условной
  обязательности нет (AIP-203 доволен).
  SKU-имена (`bm-epyc-48`) на проводе привязки НЕ появляются — размеры публикует `computeProviderTypes/{t}.machineShapes[]
  {facts, resources}` для выбора в UI. `:quoteMachine` не нужен (значение точное). Отвергнутый ранее «абсолютный
  resources — чужая единица» снят: единица показывается списком изготовимых размеров, а не вводится вслепую.
- **ФИНАЛ v1 `computeBinding` — ЗАФИКСИРОВАН юзером (2026-09-16, поправка выше):** `name` (id пользовательский или uuid),
  `uid`, `etag`, `runtime` (ссылка на `platforms/{p}/runtimes/{r}`, REQUIRED, IMMUTABLE), `limits{maxMachineCount}` (REQUIRED),
  `conditions[]` (`NoFittingMachine` warning у инвентарных; `ProvisioningFailing` error у заказывающих), `createTime`,
  `updateTime`. НИЧЕГО провайдер-специфичного и никакого селектора: размер машины = «под одно окружение» (VM режется
  под заявку runtime; металл — наименьший SKU, следующие окружения пакуются на него; инвентарь — любая коробка, где
  влезает), годность — факты ⊨ требования runtime. ОТЛОЖЕНО как additive-блок `machineSelector{minEnvironmentsPerMachine,
  matchLabels}` + `computeProviders/{cp}:quoteMachine` (в v1 котировать нечего). ОТВЕРГНУТО по пути: `machineTemplate`
  oneof, `machineCapacity`, `machineSharing`, точный `environmentsPerMachine` (врёт на fixed-SKU металле),
  абсолютный `machineSelector.resources` (чужая единица для пользователя). Ручки: POST {runtime, limits} (ALREADY_EXISTS
  на повтор пары; FAILED_PRECONDITION, если провайдер не изготовит машину ни под один профиль), GET, LIST (pageSize/
  pageToken, filter=runtime="platforms/android/*"), PATCH ?updateMask (etag), DELETE (?force), GET :verifyAccess.
  **Вердикт независимого ревьюера минимальной v1 (2026-09-16):** направление верное (все аналоги: N-на-машину —
  опциональная ручка с дефолтом 1, лимит — в машинах: Karpenter `limits.nodes`, GKE `maxNodeCount`, Buildkite `MaxSize`,
  GitLab `max_instances`), но «must-ship» до кода:
  1. **Наблюдаемость лимита** — OUTPUT_ONLY `machineCount` на привязке: лимит без счётчика оператор проверить не
     может (CAPI `status.replicas`, GKE). ПРИНЯТО юзером (2026-09-17). `environmentCount` — НЕ добавлять, «в будущем,
     если надо». Почему не в списке машин: машины — ресурс провайдера и общие, «машины привязки» — не поле машины
     (AIP-160 фильтр невыразим), а число считается по правилу привязки (pending включительно, общая — каждой).
  2. **Правило подсчёта лимита:** считаются и ЗАКАЗЫВАЕМЫЕ машины (GitLab: «regardless of the instance state (pending,
     running, deleting)» — иначе параллельные размещения переполняют лимит), общая машина считается КАЖДОЙ привязке,
     чьи окружения на ней; при достижении — 429 + condition `MachineLimitReached`, не тихая очередь. Принять.
     Оговорка: реальный спенд-кэп провайдера = Σ кэпов привязок — задокументировать.
  3. **Политика простоя заказанных машин** — у нас ЕСТЬ (idle-TTL возврат, install-конфиг `HOST_POOL_IDLE_TTL_MS`,
     `retireIfIdle`); ревьюер не видел. Для YC BareMetal (долгий провижн, цена по сроку) — задокументировать дефолт;
     per-binding override (`consolidateAfter` у Karpenter) — позже, additive.
  4. **Формат conditions:** ревьюер — убрать `severity` (следует из `type`), добавить `reason` и `lastTransitionTime`:
     CAPI v1beta2 ОТКАЗАЛСЯ от severity («dropping the Severity field is not an issue anymore», «use of the Reason field
     is required») в пользу k8s `metav1.Condition`; GKE `StatusCondition{code,status,message}`. МОЯ РЕКОМЕНДАЦИЯ:
     `{type, reason, message, lastTransitionTime}` — список активных проблем, без severity (эффект на `ready` — по
     типу), «с какого момента» реально полезно. Единый формат для machine/computeBinding/computeProvider. РЕШЕНИЕ ЗА
     ЮЗЕРОМ (он выбирал severity после нашей проверки Knative/CAPI-v1beta1).
  5. Разделить условия: инвентарь — `NoFittingMachine`; заказывающий — `NoFittingMachineType` (ни один SKU под
     требования — ошибка конфигурации; на create это FAILED_PRECONDITION) и `ProvisioningFailing` (аналог Karpenter
     `NodeRegistrationHealthy=False`); обоим — `MachineLimitReached`.
  6. `labels` (стандартный Google-map метаданных, AIP-148 vs `annotations`) — ревьюер: добавить; МОЯ РЕКОМЕНДАЦИЯ:
     ОТЛОЖИТЬ — нужды нет, и слово столкнётся с будущими selection-`labels` на машине (k8s-смысл), решать вместе.
  7. Отложенную ручку звать `targetEnvironmentsPerMachine`, не `min…` (для fixed-SKU честнее «цель»).
  8. VM-путь реализовать как ОБЫЧНУЮ Machine с арендой и idle-reclaim, НЕ «машина == окружение» (единственный способ
     загнать модель в угол). Соседство по фактам ок, ЕСЛИ агент реально ставит cgroup-лимиты из заявки runtime —
     иначе `allocated` бухгалтерия, не изоляция (follow-up слота).
  `reconciling`/`state` на привязке — не нужны (AIP-128/216: два значения → «avoid states»).
  **РЕШЕНИЕ ЮЗЕРА (2026-09-17): conditions — РОВНО k8s `metav1.Condition`:** `{type, status: True|False|Unknown,
  reason, message, lastTransitionTime}`, в списке ВСЕ известные для ресурса типы всегда (здоровые тоже), сигнал — в
  `status`, полярность по типу как в k8s (`Ready` хорошо-когда-True, `DiskPressure` плохо-когда-True). Верхний
  булев `ready` у машины УБРАН — в k8s его нет, готовность = условие `Ready` (UI/пул выводят). `observedGeneration` не
  берём (нет generation). Наборы типов:
  · machine: `Ready` (True `AgentHealthy` = online ∧ нет pressure; False `AgentSilent`; Unknown `NeverRegistered`),
    `DiskPressure` (True `DiskBelowThreshold` / False `DiskHasSufficientSpace` / Unknown до регистрации).
    Schedulability — отдельное поле, как `spec.unschedulable` в k8s (cordoned нода Ready=True). Пул берёт машину при
    Ready=True ∧ schedulable.
  · computeBinding: `Ready` (агрегат: разместить можно прямо сейчас), `MachinesAvailable` (False: `NoFittingMachine`
    у инвентаря / `NoFittingMachineType` у заказывающего / `MachineLimitReached`), `ProvisioningHealthy` (только у
    заказывающих; False: `OrdersRejected`, `MachinesNotRegistering` — аналог Karpenter `NodeRegistrationHealthy`).
  · computeProvider: `Ready`, `AccessVerified` (только у облачных; False: `GrantMissing`, `OwnershipProofMissing`).
  Тип, неприменимый к ресурсу, просто не перечисляется (k8s-практика).
  **ОТКРЫТО — ОБСУДИТЬ ОТДЕЛЬНО (юзер, 2026-09-17): форма самого условия.** Юзера смущает `status: "True"|"False"|
  "Unknown"` — строковый tri-state enum под именем `status` (k8s `metav1.Condition`, KEP-1623: «one of True, False,
  Unknown»; `Unknown` = контроллер не может судить; имя историческое с k8s 1.0, на него завязаны `kubectl wait
  --for=condition=`, kstatus, Argo). Варианты к обсуждению: (A) k8s дословно — цена «непривычно вне k8s», выигрыш —
  совместимость с инструментами и читаемость для k8s-людей; (B) GKE-форма — список только проблем `{code/type,
  message, lastTransitionTime}` без `status`; (C) k8s-семантика с другим именем поля (нестандарт — худший из трёх).
  Решение отложено, формат conditions одинаков для machine/computeBinding/computeProvider — менять один раз.
- **Иерархия ПОДТВЕРЖДЕНА AIP-ревьюером (2026-09-17):** машины под провайдером, аренды под привязкой — ровно AIP-124
  («at most one canonical parent», остальные связи полями; аренда — ассоциативный саб-ресурс, оправдан метаданными
  заказа). Прецеденты 1:1: Karpenter NodePool → NodeClaim (owner, cascade) + общая Node; GKE nodePool держит только
  `instanceGroupUrls`, ноды — в Compute; PV/PVC. **Глоссарий:** наша `Machine` ≠ CAPI `Machine` (у них один владелец
  = наша аренда/NodeClaim; наша Machine ≈ Node) — записать в словарь, чтобы читатели CAPI не ждали одного владельца.
  Взаимные ссылки `machine.lease` ↔ `lease.machine` — ок (AIP-121 исключает OUTPUT_ONLY); каноническая — `lease.machine`.
  **Две правки DELETE (AIP-135):** (1) `DELETE computeBinding?force` каскадит ТОЛЬКО на детей (аренды): release →
  машина `draining` (cordon) → deprovision, когда опустеет; окружения ДРУГИХ привязок на общей заказанной машине —
  не дети, убивать их через force привязки нельзя (blast radius за пределами ресурса; Karpenter finalizer, k8s drain);
  (2) `DELETE machine` — БЕЗ `force` вовсе (юзер, 2026-09-19: «чисто по букве AIP-135»): у машины нет детей
  (окружения — под project), а AIP-135 определяет `force` только для каскада на детей; расширять слово на «снеси,
  хоть и занята» — натяжка. Пустая → удалена; занятая → FAILED_PRECONDITION «use :drain». Аварийный случай (коробка
  умерла) закрывается механикой живости: агент молчит → offline → окружения умирают по хартбиту → машина пуста →
  detach. `force` остаётся только у провайдера и привязки (у них есть дети). Сегодняшний `?force=true` на detach —
  СНЕСТИ в срезе S3. Мелочи: `platforms/*/runtimes/*`
  ок, пока runtime принадлежит ровно одной платформе (так и есть: `android/container` и `ubuntu/container` — разные
  ресурсы с разными требованиями); AIP-159 `-` — документировать и отдавать канонические имена; `etag` на delete
  — опционально; аренды — только List/Get (Create нет, release — через drain машины).
- **`computeProviders` — разбор, вердикт ревьюера (2026-09-19), ждёт решений юзера:**
  · Встроенных `computeBindings[]` НЕТ (своя коллекция) — согласовано. `conditions[]` на провайдере валидны (паттерн
    статуса на любом ресурсе: k8s Pod/Node/Deployment/CRD, GKE Cluster+NodePool, Cloud Deploy Target, Karpenter).
  · **builtin — заказывающий провайдер («локальное облако»: `docker run` = изготовить машину-контейнер), юзер прав.**
    Семейства совпадают с механикой: инвентарь = self-hosted; заказывающие = builtin | yandex-cloud | kubernetes.
    Дев-стенд гоняет путь заказа (аренды, лимиты, размеры) на docker без YC; тот же Mac как self-hosted — инвентарный.
    Ревьюер поймал КОНФЛИКТ с глоссарием CLAUDE.md («`kind: vm` — виртуалка одного окружения, НЕ `Machine`») — эта
    строка ПРЕДШЕСТВУЕТ решению «одна схема» (коробка на одно окружение — тоже Machine с capacity = 1 окружение);
    глоссарий обновить при волне переименований. Открытый вопрос «нужен ли однослотовой машине machine-agent» — на
    реализацию (юзер); v1-правило для builtin: изготовимый размер = ровно заявка одного окружения.
  · **Форма — (A): плоский oneof, вложение только внутри `kubernetes`** (`kubernetes: {yandexCloud{folderId,
    clusterId} | kubeconfig{secretRef}}`). AIP-146 запрещает только «long series of cascading oneofs»; два уровня —
    норма, прецеденты union-внутри-члена: Cloud Scheduler `Job.target→HttpTarget.authorization_header`, Cloud Build
    `Source→RepoSource.revision`, BigQuery Connection `properties→AwsProperties.authentication_method`, Cloud Deploy
    `Strategy→Canary.mode`. Обёртка-семейство (B: `selfHosted | cloud{…}`) — без прецедента: классификация, не
    настройка; ломается первым провайдером вне дихотомии, а «moving fields into/out of a oneof is breaking».
    Семейство — понятие домена (`ComputeProviderKind`), при нужде OUTPUT_ONLY `family`.
  · `type` — НЕ REQUIRED (два источника правды); OUTPUT_ONLY выведенный — допустимо (AlloyDB `clusterType`), полезен
    для `filter=type=`. Google при oneof дискриминатор не дублирует (Deploy Target, BigQuery Connection, Scheduler Job).
  · **`validateOnly` вместо `:verifyAccess` — легитимен для пре-флайта, но AIP-163 требует ответ, ИДЕНТИЧНЫЙ живому
    Create** → решить семантику живого Create: (i) «принять и показать статус» — 200 + `AccessVerified: False`
    (k8s-стиль, declarative-friendly с conditions; МОЯ РЕКОМЕНДАЦИЯ: подключил → UI показал, чего не хватает → выдал
    грант → реконсилер позеленил) или (ii) отклонять `FAILED_PRECONDITION` + `ErrorInfo{GRANT_MISSING|
    OWNERSHIP_LABEL_MISSING}` (прецедент DMS `connectionProfiles.create?validateOnly` — неудача = ошибка).
    `PATCH ?validateOnly` как «перепроверь» — хак (PATCH без изменений ≠ change validation). Перепроверка
    существующего — РЕКОНСИЛЕР обновляет `conditions` сам (AIP-128: GET «must return the resource's current state»);
    custom `GET :verifyAccess` (KMS `verifyConnectivity`) нужен только без реконсилера → с реконсилером метода НЕТ.
  · **РЕШЕНИЕ ЮЗЕРА (2026-09-19): семантика Create — (i) «принять и показать статус»**: 200, ресурс создан,
    `AccessVerified: False` с причиной; `POST ?validateOnly=true` отвечает идентично (без name/uid/createTime, если id
    автогенерён — AIP-163); `PATCH ?validateOnly=true` — только для валидации изменения, не «кнопка перепроверки»;
    перепроверка — реконсилер; кастомного `:verifyAccess` НЕТ. Форма A, `type` OUTPUT_ONLY, builtin — заказывающий.
  · **ФИНАЛ v1 `computeProvider` — ПОДТВЕРЖДЁН юзером (2026-09-19):** `name`, `uid`, `etag`, `displayName?`, `type`
    (OUTPUT_ONLY), oneof `selfHosted{} | builtin{} | yandexCloud{folderId, zoneId, platformId?} | kubernetes{yandexCloud
    {folderId, clusterId} | kubeconfig{secretRef}}`, `conditions[]` (`Ready`; `AccessVerified` только у облачных:
    GrantMissing / OwnershipProofMissing / NotCheckedYet), времена. Ручки: POST [?computeProviderId][&validateOnly],
    GET, LIST (pageSize/pageToken/filter=type=), PATCH ?updateMask [&validateOnly] (etag), DELETE [?force] (дети:
    привязки, машины). Кастомных методов нет.
- **Каталог `platforms` и дети — вердикт независимого ревьюера (2026-09-19), ждёт «ок» юзера:**
  · Сиблинги `deviceModels` и `runtimes` под `platforms/{p}` — ВЕРНО; связь «какой профиль на каком runtime» —
    many-to-many → не вложение, а repeated-поле `deviceModel.runtimes[]` + `filter=runtimes:` (AIP-124). Прецедент —
    Firebase Test Lab `AndroidDeviceCatalog{models[], versions[]}` с `AndroidModel.supportedVersionIds` и `form` полем.
  · **`versions` — КОЛЛЕКЦИЯ `platforms/{p}/versions/{v}`, не массив строк** (моё «массивом» отменено): AIP-144 «if
    additional data is likely to be needed in the future, repeated fields **should** use a message… proactively»;
    данные точно нужны — `apiLevel` (android 14 ≠ API 34, Appium `platformVersion`), `state`; Firebase
    `AndroidVersion{id, versionString, apiLevel, codeName, releaseDate}`. id = строка версии («13»).
  · **`devices` → `deviceModels`**: device = конкретная коробка (наш будущий инвентарь), ресурс же — модель/профиль;
    совпадает с capability `sw:deviceModel` (один концепт — одно имя). Firebase `AndroidModel`, simctl «device types».
  · **`requirements.anyOf` → `machineProfiles[]`**: JSON-Schema-словарь не для AIP-полей, «или» уже выражен repeated.
    МОЁ ОТКЛОНЕНИЕ от ревьюера: оставить обёртку `requirements{machineProfiles[], resources{}}` — юзер просил одну форму
    с арендой (`request.requirements{…}`); ревьюер плоскую форму предлагал, не зная об этом.
  · `state` (AIP-216 enum, OUTPUT_ONLY) на version и deviceModel: `AVAILABLE | DEPRECATED | UNAVAILABLE` (Compute
    `deprecated.state`, Firebase tags) — закрывает follow-up «показывать только провижнящиеся версии».
  · Добавить: `displayName` (OUTPUT_ONLY у статики) на platform/runtime/deviceModel/version; `platform.defaultVersion`
    [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] (GKE `defaultClusterVersion` — `platformVersion` в create станет необязательным); `platform.aliases: ["linux"]`
    (W3C-алиас объявлен в каталоге, не зашит в границу сессии); `deviceModel.formFactor` (PHONE|TABLET|DESKTOP).
  · Каталоги: top-level коллекции с Get+List (Compute `zones`/`machineTypes`, Vertex `publishers/*/models`), НЕ
    `serverConfig`-документ (до-AIP) и не под locations/projects; без uid/etag/createTime (AIP-148 — только
    declarative-friendly); пагинация обязательна везде (AIP-158 «at the outset»).
  · Для разбора `environments`: ОТМЕНЕНО следующим ревью — ссылаться ГОЛЫМИ id, не resource name (см. ниже).
- **[DESIGN] Каталог platform/models/versions → ПРОЕКТНЫЙ РЕГИСТР (юзер + ревьюер, 2026-09-27):** источник моделей
  должен быть ОДИН (юзер: не нравится, что у эмуляторов и реальных устройств разные источники), ручное заведение
  моделей исключено (юзер), открытое в проекте A не должно светиться проекту B (юзер), лишние таблицы не пугают (юзер).
  **Схема:** единственный путь чтения — `projects/{p}/platforms/{platform}/{models,versions,runtimes}/…`; содержимое
  моделей и версий = builtin (статика кода) ∪ discovered (строки БД ЭТОГО проекта), сшивка на чтении; `runtimes` —
  ТОЛЬКО builtin, никогда discovered. Методы только Get/List, все поля OUTPUT_ONLY, пишет только система.
  `DeviceModel{name, displayName, formFactor, origin: BUILTIN|DISCOVERED, supportedRuntimes[], supportedVersions[],
  availability, deviceCount, lastSeenTime}`.
  · **Глобальный каталог отвергнут** — утечка («у кого-то в инсталляции есть Galaxy S24») и «не забыть отфильтровать в
    каждом read-пути» как ошибка ожидания. Прецедент проектно-квалифицированного имени при вендорском содержимом:
    GCE `GET projects/{project}/zones/{zone}/machineTypes` («available to the specified project», всё `[Output Only]`,
    без insert/delete) и OrgPolicy `projects/{project_number}/constraints/{constraint}`. Firebase глобален, но его
    `projectId` — «For authorization», то есть принципал, а не родитель.
  · **Копировать builtin в каждый проект НЕ надо** — только адресация проектная, хранение общее (N копий статики и
    миграция каждого тенанта на апгрейде — отвергнуто).
  · **`origin: BUILTIN|DISCOVERED` — не смелл**, прямой прецедент в домене: AWS Device Farm держит публичные и
    приватные устройства в одной коллекции `Device` с полем `fleetType: PRIVATE|PUBLIC`.
  · **Discovered — это ПРОЕКЦИЯ фактов machine-agent, а не самостоятельное состояние**: источник правды — инвентарь
    (`…/machines/{m}/devices/{d}`), регистр — его индекс, восстановимый с нуля. Этим снимается возражение «две правды».
  · **Id модели — единое пространство инсталляции** (нормализованный `ro.product.model`): реальный Pixel 7 СЛИВАЕТСЯ с
    builtin AVD-профилем `pixel-7` в одну запись с `supportedRuntimes: [emulator, device]` — это и есть дивиденд
    «одного источника». Префиксы вроде `custom.` НЕ вводим (нужно слияние, а не разведение).
  · **Авторегистрация системой легальна** (kubelet `--register-node`, CSINode «kubelet will automatically populate»),
    НО k8s депрекнул авто-создание ГЛОБАЛЬНЫХ деклараций из node-side discovery (`cluster-driver-registrar`) → отсюда
    правило «runtimes только builtin».
  · **Lifecycle: записи НЕ удалять** (k8s: Node-объект удаляет только человек/контроллер; модель — словарная единица,
    удаление рвёт исторические ссылки). Живость — полями: `availability` (AWS: TEMPORARY_NOT_AVAILABLE|BUSY|AVAILABLE|
    HIGHLY_AVAILABLE), `deviceCount`, `lastSeenTime`; GC — только фоновый снос невиданных N суток И не упомянутых
    ни одним окружением. Тип ≠ экземпляр (AWS: «A device ARN is an identifier representing a type of device rather
    than any specific physical device instance»): экземпляр умирает с машиной, тип остаётся.
  [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] · **Финальные поля каталога (юзер, 2026-09-27):** platform `{name, displayName, aliases[], defaultVersion}`;
    version `{name, displayName, supportedRuntimes[]}`; model `{name, displayName, formFactor, supportedRuntimes[]}`;
    runtime `{name, displayName, requirements{machineProfiles[], resources{}}}`. УБРАНЫ: `origin` (выводится из
    `supportedRuntimes`: есть emulator/container → изготавливаем сами, только device → узнали от железа; значение
    `BUILTIN` вдобавок коллизировало с типом провайдера `builtin`, в пользу `PREDEFINED`, но поле не нужно вовсе),
    `deviceCount`/`lastSeenTime` (агрегат над чужой коллекцией → `LIST …/devices?filter=model=` + `totalSize`;
    «есть ли вообще железо» уже сказано наличием `device` в supportedRuntimes). Записи с пустым `supportedRuntimes`
    (железо унесли, эмулировать нечем) не показываются в списках — уборка без удаления. `formFactor` — дословно
    Firebase (`PHONE|TABLET|WEARABLE|TV|AUTOMOTIVE|DESKTOP|XR`, проверено по discovery), нам нужны PHONE/TABLET/DESKTOP.
  · **Проектный АДРЕС у всего каталога, проектное СОДЕРЖИМОЕ только у моделей и версий** (юзер: рантаймы и платформы
    общие). Глобально их не выносим — иначе у `platforms/android` два имени и дети разъезжаются по разным родителям;
    прецедент GCE `projects/{project}/zones/{zone}/machineTypes` (содержимое одинаково для всех, адрес проектный).
  · **`supportedRuntimes` — ПОЛНЫЕ имена ресурсов** (ссылка между ресурсами), в отличие от значений, пересекающих
    границу W3C. Правило на весь API: ссылка между ресурсами — полное имя; значение для/из capability — голый id.
    Подколлекция `versions/{v}/runtimes` отвергнута: дала бы рантайму несколько имён (нарушение «один канонический
    родитель»), а AIP-124 для many-to-many предписывает именно «repeated field containing a list of resource names».
  · **Матрица `supportedVersions[{version, runtimes[]}]` на МОДЕЛИ — подтверждена ревьюером (2026-09-27)**, т.к.
    тройка (модель × версия × рантайм) должна быть валидна целиком (иначе API обещает `pixel-7 + android 15 + device`,
    когда единственный Pixel 7 на 13). Вложение `models/{m}/versions/{v}` ОТВЕРГНУТО: версия — самостоятельная
    сущность с каноническим родителем-платформой, вложение дало бы ей второе имя (AIP-124 «at most one canonical
    parent», AIP-123 «patterns must be mutually unique»), «список всех версий» превратился бы в fan-out, а рантайм
    потребовал бы третьего уровня. Прецедента «каталожное измерение вложено в другое» у Google нет — везде сиблинги +
    перекрёстная ссылка (Firebase `AndroidModel.supportedVersionIds`, GKE `channels[].validVersions`).
    ВЛОЖЕННЫЙ MESSAGE, НЕ плоский список id: AIP-144 «if additional data is likely to be needed… **should** use a
    message instead of a scalar proactively, to avoid parallel repeated fields» — Firebase наглядный антипример
    (плоский `supportedVersionIds` + позже параллельный `perVersionInfo`).
    **ПРАВКА: внутри матрицы — ПОЛНЫЕ имена ресурсов, не голые id** (отменяет моё «исключение ради компактности»):
    «strictly necessary» по AIP-122 тут нет (холодный каталог, не hot path), а Firebase не оправдывает — у его
    `AndroidModel` вообще нет `name`, это доAIP-шный API. Голые id остаются ТОЛЬКО там, где значение пересекает
    границу W3C-капы.
    Отдельный ресурс `offerings/{…}` на тройку — ОТЛОЖЕН до появления атрибутов комбинации (capacity, цена,
    deprecation) или нужды в коррелированной фильтрации; id тогда системный, НЕ составной `model~version~runtime`
    (AIP-122 «Resources must not expose tuples»).
  · **Ловушка фильтра (ревьюер):** `filter=supportedVersions.runtimes:"device"` синтаксически легален, но AIP-160:
    «Filters can not query a specific element on a repeated field for a value» → `version="13" AND runtimes:"device"`
    сматчит модель, у которой такой СТРОКИ нет. Задокументировать отсутствие корреляции; это же — главный довод за
    будущий `offerings`.
  · **`displayName` → `title` во ВСЁМ каталоге (юзер, 2026-09-27):** AIP-148 определяет `display_name` как «must be a
    mutable, user-settable field», у каталога подпись серверная и неизменяемая → занятое имя с чужой семантикой не
    берём; `title` в стандартных полях AIP отсутствует (AIP молчит) → прецедент IAM `Role.title` (у predefined-ролей
    задаёт сервер). `displayName` остаётся у изменяемых пользователем ресурсов (`projects`, `computeProviders`).
  · **`aliases` — только OUTPUT_ONLY подсказка для матчинга капы, НИКОГДА сегмент пути** (иначе у платформы два имени).
    `formFactor` — нужен `FORM_FACTOR_UNSPECIFIED` первым значением (AIP-126). Отсутствие `uid`/`etag`/`createTime`
    у read-only каталога корректно (AIP-148 привязывает их к declarative-friendly). Глобальный путь `platforms/...`
    НЕ заводить одновременно с проектным — два имени одного объекта.
  · **`totalSize` во ВСЕХ List-ответах — принято юзером как общее правило** (AIP-158: «may provide an `int32
    total_size` field… may be an estimate»); счётчики-агрегаты полями на других ресурсах не заводим.
  [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] · **Ссылки — ГОЛЫЕ id, не resource name** (отменяет прежний совет ревьюера платформ): Firebase `AndroidModel.id` —
    «unique opaque id», а `AndroidDevice.androidModelId/androidVersionId` — голые строки при ресурсном каталоге; GKE
    `validNodeVersions` — строки. Full resource name породил бы две формы (в W3C-капе он невозможен) и разъехался бы с
    матчингом; корректность держится на уникальности id в инсталляции, имя ресурса выводится тривиально. Перевод
    `sw:deviceModel` → VO `DeviceModelId` в request-модели, resource name собирает presenter; в домене имён нет.
- **[ARCH] СЛОТ — единая абстракция места исполнения (юзер, 2026-09-22..26; три независимых ревьюера):**
  [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] Требование юзера: эмулятор, реальный телефон и linux-контейнер НЕ должны различаться абстракциями. Итог: `runtime` —
  это протокол между агентом машины и окружением (docker / adb-tcp / adb-usb; далее simctl, usbmuxd); прецедент —
  `adb devices` показывает `emulator-5554` и серийник одним списком. Место исполнения — ОДИН ресурс
  `…/machines/{m}/slots/{s}`: ровно одно окружение на слот, множественность даёт машина. Рекурсия нашей же оппозиции:
  провайдер→машины (attached | ordered), машина→слоты (физический | изготовленный).
  [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] **Поля слота (ФИНАЛ после 4-го ревью, 2026-09-26):** `name` (id = серийник | `emulator-5554` | id контейнера), `uid`,
  `runtime` (ссылка на каталог), **`stereotype{platform, platformVersion, model, form, device?}`** (OUTPUT_ONLY, снимок
  наблюдённого на момент провижна), `transport: adb-usb | adb-tcp | docker`, `resources{capacity, machineAllocation}`,
  `state: PROVISIONING|READY|ALLOCATED|DRAINING|DELETING`, `conditions[]` (тип `Ready` — здоровье вынесено из state),
  `environment` (отсутствует у свободного физического и у мусора), времена.
  · **Блок `device` → `stereotype`** (ревьюер): контейнер устройством не зовёт никто — AWS Device Farm `Job.device` =
    «phone or tablet», десктоп у них отдельный `TestGridSession` без `device`; Selenium зовёт конфиг слота именно
    stereotype: «the capability set attached to a slot… the minimal set of capabilities a new session request must
    match» — буквально роль блока. `target` отвергнут (перегружен: Cloud Deploy Target), `guest` отвергнут (у телефона
    нет гипервизора, и пару host/guest мы себе запретили). ВНИМАНИЕ: в копилке [NAMING] лежит вердикт другого ревьюера
    «`Stereotype` — false friend, переименовать» — противоречия нет: там ругали использование слова для ПАРЫ
    (платформа+исполнение), которая набором капабилити не является; здесь слово встаёт на своё настоящее место, а пара
    растворяется в `runtime`. Переименование `Stereotype`→`PlacementKey` из копилки СНЯТЬ.
  [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] · **`form`, не `backing`** (ревьюер, решающий довод): `backing` в vSphere — реальное поле, но БЛОК-ссылка
    (`"backing": {"type": "STANDARD_PORTGROUP", "network": "obj-103"}`), libvirt `<backingStore>` — то же; скаляр
    `backing: PHYSICAL` прочтётся как сломанный тип. Мой довод «form off-label из-за контейнеров» развёрнут:
    `formFactor` у Firebase включает DESKTOP → контейнер = `formFactor: DESKTOP` + `form: VIRTUAL` в рамках
    прецедента; соседство form/formFactor придумал Google и живёт с ним 8 лет. Значения: PHYSICAL | EMULATOR | VIRTUAL
    (CONTAINER/VM отвергнуты — дублируют runtime и различают реализацию, а не природу).
  · **`state` — только жизненный цикл** (AIP-216: прогрессия), здоровье — в `conditions[Ready]` (не `healthy: bool`,
    ради единого формата с machine/binding/provider). Двусмысленность «нет environment = свободен ИЛИ мусор» снимается
    без вывода: CP пишет `DELETING` в тот же момент, когда удаляет окружение → READY+нет env = свободный физический,
    DELETING+нет env = мусор под уборку.
  · СПОРЮ с ревьюером: `transport: "docker"` он звал дублем `runtime` и предлагал `docker-exec` — нет: runtime говорит
    «контейнер», транспорт — каким движком дотягиваемся (podman/containerd изменят транспорт, не runtime).
  · **`stereotype` — ФАКТЫ простыми значениями, не ссылки на каталог** (юзер поймал нестыковку): реальный телефон
    приносит модель и версию, которых в install-static каталоге нет и быть не может (`sm-s921b`, Android 15) — полное
    имя ресурса висело бы в пустоту. Правило как в `machine.facts`: факты — значения, ссылки — полные имена
    (единственная ссылка в блоке — `device`). Каталог `platforms/{p}/models/{m}` описывает только ИЗГОТОВИМЫЕ модели
    (профили эмулятора + `desktop`); «какие реальные модели есть» — вопрос к инвентарю (`LIST …/devices`), не к каталогу.
    [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] Следствие для `environments` (решить при его разборе): `platform` — ссылка на каталог (закрытый набор), а
    `platformVersion`/`deviceModel` — простые слова с проверкой по runtime: изготавливаемым обязано быть в каталоге,
    для `device` — совпасть с фактом устройства инвентаря. Это расходится с советом ревьюера платформ «ссылаться
    именами всюду» — он не знал про реальные устройства.
  · **`resources{capacity, machineAllocation}`** вместо `resources`+`machineFootprint` (ревьюер: слова «footprint» как
    имени поля в инфраструктурных API НЕТ — только carbon-домен; в прозе = измеренное, у нас заявленное). Прецедент —
    k8s DRA: `Device.capacity` («reflects the fixed total capacity… The consumed amount is tracked separately») +
    `consumesCounters`; `machineAllocation` — по OpenStack Placement `allocations` (запись потребителя против
    провайдера). Обёртка `resources` у слота — чтобы `resources.capacity` значило одно и то же у машины и слота
    (юзер поймал расхождение). Инвариант виден в именах: `machine.resources.allocated = Σ slots.resources.machineAllocation`.
    ОТВЕРГНУТО: `hostOverhead` (overhead = дельта сверх, у нас не дельта; «host» запрещён словарём), `machineUsage`
    (usage = измеренное), `machineReservation` (reserved = отложено провайдером), `machineResources` (читается как
    «ресурсы машины» = `machine.resources`).
  [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] · **`form` вместо `provenance`** (ревьюер): `provenance` в софте 2020-х = supply-chain attestation (SLSA, in-toto,
    BuildKit, Artifact Analysis) — коллизия рядом с нашими образами и артефактами. `form` — дословный прецедент в
    домене: Firebase Test Lab `AndroidModel.form = PHYSICAL|VIRTUAL|EMULATOR` (+ `DeviceIpBlock.form`), фильтр
    `gcloud firebase test android models list --filter=virtual`. Значения: PHYSICAL — железо (наше или арендованное);
    EMULATOR — эмулируемое устройство (qemu, «equivalent to Android Studio»); VIRTUAL — виртуализованный/
    контейнеризованный экземпляр той же архитектуры (ubuntu-контейнер; позже android в облачной VM с нативной
    виртуализацией). Позже возможен SIMULATOR (iOS). Поле НЕ убирать, хотя выводимо: `runtime` — ссылка на растущий
    каталог, иначе каждый клиент захардкодит таблицу «какие runtime физические»; так же делают BrowserStack
    (`real_mobile`), LambdaTest (`isRealMobile`).
  · **`device` — обычное условное OUTPUT_ONLY поле, БЕЗ oneof, окончательно** (ревьюер: AIP-180 «Existing fields
    **must not** be moved into or out of a oneof» → «потом повысим» ЗАПРЕЩЕНО, решать сейчас; порог «1–2 поля, дальше
    oneof» — моя выдумка: Pub/Sub держит 4 взаимоисключающих поля без oneof, Cloud Tasks имеет oneof из одного члена).
    Будущие вариант-специфичные поля туда не просятся: battery/simState — свойства ресурса `devices`, containerId/
    avdName — уже в имени слота. AIP-203: сервер ОБЯЗАН молча очистить OUTPUT_ONLY на входе и НЕ ошибаться (моя
    оговорка про INVALID_ARGUMENT неверна, пока поле output-only). Прецеденты условных полей: AlloyDB
    `secondaryConfig`/`primaryConfig` (лучший), Pub/Sub `pushConfig`, Compute `ForwardingRule.serviceName`,
    Cloud SQL `replicaConfiguration`; мои `PV.spec.nodeAffinity` и `GKE NodeConfig.accelerators` — НЕГОДНЫЕ.
  · **Инвентарь железа — отдельный ресурс `…/computeProviders/{cp}/devices/{d}`, сиблинг machines/computeBindings**,
    машина — ССЫЛКОЙ (телефон перетыкают в другую коробку: при вложенности менялся бы `name`, рвались история и
    квоты; аналог — cluster-scoped PV при node-локальном томе). В v1 коллекции НЕТ (реальных устройств нет), форма
    слота принимает её добавлением поля `device`.
  · Ресурсы пары (модель × runtime) — ОТЛОЖЕНО (`platforms/{p}/slotTypes/{st}`, прецедент GKE machineType): сегодня
    все эмуляторы стоят одинаково. DRA-атрибуты с селекторами и отдельный фенсинг аллокации — тоже отложены (у нас
    оптимистичный захват под пер-аккаунтным локом + правда от хартбита агента).
  · **АРЕНДОВАННЫЕ у внешней фермы устройства — вердикт ревьюера (2026-09-26): декомпозиция ВЫЖИВАЕТ**, ломается одно
    определение: машина ≠ «коробка с НАШИМ агентом» (определение через реализацию) → машина = ЕДИНИЦА ЁМКОСТИ, АРЕНДЫ
    И ОТКАЗА, агент — способ узнать состояние. Арендованный телефон = машина без агента + один слот (PHYSICAL,
    adb-tcp); роль агента играет адаптер провайдера (прецедент virtual-kubelet: Node-объект есть, kubelet-а нет).
    Отклонено: «вся ферма = одна машина» (убивает `maxMachineCount` — квота фермы это конкурентные устройства, прячет
    отказ и аренду отдельного устройства; Selenium Grid Relay так делает, но у него Node — процесс, не единица аренды)
    и «сиблинг рядом с machines» (форкает размещение). Аренда переиспользуется как есть (наш Karpenter NodeClaim).
    **ПРИНЯТО СЕЙЧАС:** (1) определение машины через роль — правка глоссария при переименованиях; (2)
    `computeBinding.machineSelector` получает рядом с `resources` поле `deviceSelector{model, platformVersion}` —
    «арендовать Pixel 8 / Android 14» сегодня невыразимо; два обычных необязательных поля с валидацией «применимо
    ровно одно», БЕЗ oneof (AIP-180: потом не переложить).
    **ОТНОСИТСЯ К СЕГОДНЯШНЕМУ КОДУ (не к ферме):** (D7) `executing` и `endpoint` пишет хартбит агента → обобщить:
    пишет ТОТ, КТО УЗНАЛ endpoint (агент push | адаптер poll), иначе каждый внешний провайдер = исключение в ядре
    жизненного цикла; (D8) заказывающий провайдер ТОЖЕ отказывает (AWS `LimitExceededException`, YC — нет мощностей
    в зоне) → путь «остаёмся в `enqueued` с backoff», не сразу `failed`; (D9) свежесть: `lastSyncTime` + общий порог
    6с — ложь для POLL-провайдера (несвежесть = сломан наш поллер, не машина) → reclaim по ней запрещён, порог
    объявляет провайдер.
    **ОТЛОЖЕНО (аддитивно, при первом таком провайдере):** `agent` → `statusSource{mode: AGENT_PUSH|PROVIDER_POLL,
    lastSyncTime, agent?}`, `machine.externalRef` (ARN/udid) и `allocationMode`, `lease.expireTime/renewTime/
    connection{endpoint, credentialRef}`, `transport` как строка вместо enum (AIP-126 для часто растущих наборов),
    `slot.connection` для `proprietary-webdriver` (BrowserStack/Sauce — чужой WebDriver-эндпоинт, слот без capacity).
    **СПОРЮ:** `type` → строка + `capabilities{ordersMachines, ordersDevices, runsOurAgent}` — новый провайдер и так
    требует схемной работы (свой блок в oneof); данные для ветвления размещения честнее в каталоге
    `computeProviderTypes` рядом с `machineShapes`.
    **ЦЕНА, которую ревьюер отмахнул:** у арендованного устройства машина и слот почти совпадают (одни и те же
    характеристики телефона в `machine.resources.capacity` и `slot.resources.capacity`, `machineAllocation`
    отсутствует) — одна из строк выглядит церемонией; терпимо ради единого размещения.
    **Firebase Test Lab НЕ моделировать** — там нет ручки устройства и сессии (сдаёшь матрицу тестов); другой порт,
    натягивание на `machine` испортит модель. Арендованное устройство в `devices` НЕ заводить (идентичность — в
    `machine.externalRef`); `devices` остаётся НАШИМ инвентарём (аналог AWS `DeviceInstance`), каталог — аналог AWS `Device`.
- **[DONE] Локальная копия AIP — `docs/reference/aip/`, в репозиторий НЕ коммитится (`.git/info/exclude`, правило в `CLAUDE.local.md`)** (127 файлов, 1 МБ, коммит 23e176e7 от 2026-08-17, CC-BY 4.0):
  ходить в сеть за нормой больше не нужно, `grep -rn "<фраза>" docs/reference/aip/general/`. Правило в CLAUDE.md
  обновлено. В README — команда обновления копии.
- **[TODO] СКВОЗНАЯ AIP-СВЕРКА всех уже разобранных ручек — по правилу CLAUDE.md «строго по AIP» (юзер, 2026-09-27).**
  Правило записано ПОСЛЕ того, как часть ресурсов уже согласована, поэтому пройти их заново одним проходом и
  зафиксировать каждое отклонение (или устранить). Что проверять на каждом: `name`/паттерн (AIP-122/123), один
  канонический родитель (AIP-124), стандартные поля и их семантика (AIP-148: `displayName` только mutable/user-settable
  → иначе `title`; `uid`/`createTime`/`updateTime` только declarative-friendly), `etag` (AIP-154) только при
  конкурентной записи, пагинация + `totalSize` (AIP-158), фильтры (AIP-160, в т.ч. ловушка некоррелированного `:` по
  repeated), стандартные методы и их коды (AIP-131/132/133/134/135, `force` только на каскад по детям), кастомные
  методы (AIP-136: глагол+существительное, GET для чтения), ошибки и details (AIP-193, `ErrorInfo`+`BadRequest`),
  enum-стиль (AIP-126: UPPER_SNAKE_CASE, первое значение `*_UNSPECIFIED`, строка вместо enum для часто растущих
  наборов), единицы в суффиксах (AIP-141), field_behavior (AIP-203), long-running (AIP-151) там, где операции долгие.
  Ресурсы к проверке: `projects`, `computeProviders`, `computeBindings`, `machineLeases`, `machines`, `slots`,
  `devices`, каталог `platforms/*`, `computeProviderTypes`, `environments`, `sessions`, IAM-методы, туннели (бывш. netbridge),
  storage-ручки, internal-контур агентов. Отдельно: наши прецедентные решения, где AIP молчит (k8s-форма
  `conditions[]`, `machineProfiles`, `stereotype`, `form`, `transport`) — пометить как ОСОЗНАННЫЙ выбор по прецеденту
  с записью, что именно AIP не определяет.
- **[DESIGN] `computeProviderTypes` — разбор + вердикт ревьюера (2026-09-27), ждёт «ок» юзера:**
  · **Путь ГЛОБАЛЬНЫЙ `computeProviderTypes/{t}`, не под проектом.** AIP про каталоги молчит (явно проверено), но
    AIP-124 «A resource **must** have at most one canonical parent» (*at most* — ноль допустим) и AIP-132 «A `parent`
    field **must** be included unless the resource being listed is a top-level resource» делают top-level легальным;
    отношения владения с проектом нет, контент идентичен, вложение дало бы одной сущности N имён (AIP-122: имя —
    то, что клиент хранит как каноническое). **Правило, которое из этого выводится: вкладывать в проект, только если
    содержимое или видимость зависят от проекта** — поэтому `projects/{p}/platforms/*` остаются проектными (модели и
    версии выводятся из инвентаря проекта), а типы провайдеров — глобальные. Прецеденты (после AIP): IAM `roles/{role}`
    top-level; GCE `machineTypes` per-project именно потому, что доступность и квоты различаются.
    Появится per-project allowlist — не перевешивать каталог, а добавить отдельный проектный ресурс со ссылкой.
  · **Баги текущей ручки:** LIST без пагинации нарушает MUST AIP-132 («`page_size` and `page_token` … **must** be
    specified on all list request messages»), отсутствует Get (AIP-121: «A resource **must** support at minimum Get»).
  · **`machineSupply: MACHINE_SUPPLY_UNSPECIFIED | INVENTORY | ORDERING` — поле НУЖНО** (юзер сомневался): вывод
    «inventory ⇔ пустой список типов машин» ПРОСТО НЕВЕРЕН — у заказывающего провайдера с параметрическими размерами
    (YC VM) фиксированных SKU тоже нет. Производное поле легально (AIP-203: «Derived or structured information based
    on original user input»); не bool (AIP-126: bool только когда «no further flexibility will be needed»).
  · **`machineShapes` → суб-коллекция `computeProviderTypes/{t}/machineTypes/{mt}`** (юзеру не нравилось и имя, и
    инлайн-массив — прав): AIP-144 MUST «Repeated fields **must not** represent the body of another resource inline»
    (на них ссылается binding) + SHOULD про верхнюю границу («A good rule of thumb is 100 elements… should use a
    sub-resource»; у AWS 700+ типов). `shape` — вокабуляр Oracle OCI; `machineTypes` нейтрально и рифмуется с нашим
    `Machine`. `shapeId` убрать (AIP-122: идентичность — в `name`).
  · **Параметрические размеры** (AIP молчит) — по духу AIP-146 «least generic»: `oneof capacity { fixed |
    configurable }`, где configurable = min/max/step по cpu/memory + memory-per-core; конкретику задаёт
    `computeBinding.machineSelector.resources`, тип — ссылка на `machineTypes/{mt}`.
  · **`grants`/`ownershipProof` — ОБОБЩЁННЫМИ БЫТЬ НЕ МОГУТ** (юзер прав): `{role, serviceAccountId}` разваливается на
    AWS (ARN + externalId + trust policy) и k8s (ServiceAccount/RBAC/kubeconfig); `FOLDER_LABEL`/`CLUSTER_LABEL` —
    словарь YC в generic-энуме, а AIP-126 требует «enums **should** receive new values infrequently… no more than once
    a year», иначе строка. Решение: провайдер-специфичный oneof-member, зеркалящий oneof на `computeProviders`
    (`yandexCloud{requiredGrants[], ownershipLabelKey}`); отсутствие member-поля = доказательства владения нет.
    AIP-146: «Adding additional possible fields to an existing `oneof` is a non-breaking change».
  · Каталог как РЕСУРС — верно: не singleton (AIP-156 требует «exactly one per parent»), не поле на `ComputeProvider`
    (UI нужен каталог ДО создания провайдера — bootstrap). Имя `computeProviderTypes` валидно (AIP-122), тип
    `ComputeProviderType` (AIP-123).
  · **ВТОРОЙ РАУНД ревью proto (2026-09-27) — четыре правки, все «сделать СЕЙЧАС, потом ломающее»:**
    1. **`oneof capacity{fixed|configurable}` → `resources` ВСЕГДА + `oneof sizing{configurable}`** (union-им не
       ёмкость, а ограничение; отсутствие члена = размер фиксирован). Иначе каждый клиент ветвится ради тривиального
       «какого размера машина». Образец — OCI `Shape`: `ocpus`/`memoryInGBs` заполнены всегда, а `ocpuOptions`/
       `memoryOptions` есть только у flex («If the field is null, the shape has a fixed amount of memory equivalent to
       memoryInGBs»); GCE — антипример (лимиты custom-типов в API не публикуются вовсе, клиент хардкодит таблицу).
       Oneof с ОДНИМ членом объявить сразу: добавить член можно (AIP-146 «Adding additional possible fields to an
       existing oneof is a non-breaking change»), перенести поле в/из oneof — нельзя (AIP-180).
    2. **`Range{min,max,step}` — нарушение AIP-145** («A resource or message representing a range **should** ordinarily
       use two separate fields… with prefixes `start_`/`end_`»; `step` AIP не определяет). Плоские
       `min_*`/`max_*`/`*_step` по прецеденту `NodePoolAutoscaling.min_node_count/max_node_count`, инклюзивность — в доке.
    3. **`oneof provider` с пустыми членами — УБРАТЬ с этого ресурса** (юзер сомневался — прав): здесь oneof дублирует
       дискриминатор, который уже в `name` и в `machine_supply`, и заставляет switch-иться ради `ownership_label_key`
       (один концепт в двух членах). Пустое message в union само по себе идиоматично — проблема в дублировании.
       Оставить `oneof access_requirements{yandexCloud|kubernetes}` (только там, где требования реально есть),
       `ownership_label_key` поднять на верхний уровень. На `computeProviders` зеркальный oneof ОСТАЁТСЯ — там члены
       несут типизированные настройки.
    4. **Регион — единственное, что станет ломающим.** AIP-180: «A resource **must not** change its name… the set of
       valid resource names **should** not change either»; GCE держит machineTypes под `projects/*/zones/*` именно
       поэтому. РЕШЕНИЕ: каталог объявить ГЛОБАЛЬНЫМ и зона-агностичным (форма машины от региона не зависит — это
       `…Type`), а реальную доступность отдать подключению `computeProviders` (она зависит от фолдера, квот и
       restrictions). Записать это контрактом в комментарий ресурса.
    Не ломающее и потому откладывается: GPU (`repeated Accelerator` внутри `Resources`, не плоский `gpu_count`),
    цены (`google.type.Money`, отдельным ресурсом — цена региональна), новый провайдер (член union-а).
    **ФИНАЛ после обсуждения с юзером (2026-09-27):**
    · `ownershipLabelKey` — ВНУТРИ члена oneof, не наверху (юзер прав; тот же довод, по которому туда ушли `grants`):
      наверху он всегда пуст у инвентарных и зашивает в общий контракт «доказательство = метка с ключом», что
      сломается на AWS (`externalId` в trust policy — не метка). Одинаковое имя поля в двух сообщениях — не дубль данных.
    · **Объединение `fixedResources|configurableResources` СНЯТО** (юзер: «почему нельзя свести fixed к
      configurable?»): «размер фиксирован» = `minResources == maxResources`, тривиально выводится сравнением — по
      нашему же правилу не публикуем производное. Итог: `minResources`, `maxResources` (границы ВКЛЮЧИТЕЛЬНЫЕ),
      `resourceSteps` (присутствует ВСЕГДА; `0` в измерении = шаг не ограничен, любое целое в `[min, max]` — юзер, 2026-09-27:
      вместо «absent = шага нет». AIP-149: «Services **should not** need to distinguish between the default value and
      unset most of the time; if an alternative design does not require such a distinction, it is usually preferred» —
      поэтому без `optional`; плюс шаг задаётся ПО ИЗМЕРЕНИЮ, валидация одна: `step == 0 || (value - min) % step == 0`;
      presenter выводит нули явно, смысл «0» — в описании поля) — три поля одного типа `Resources`, переиспользованного с машины/слота.
      У ресурса не осталось ни одного oneof по ёмкости, у клиента — ни одной ветки, валидация
      `machineSelector.resources` — одна формула на все типы.
      Вложенный вариант `sizing{cpuMillicores{min,max,step}}` ОТВЕРГНУТ: (а) `resources.cpuMillicores` стало бы то
      числом, то объектом — «одно имя, два смысла»; (б) обёртка-диапазон противоречит AIP-145 «two separate fields of
      the same type». Сверка с AIP-145 (дословно, 2026-09-27): структура СООТВЕТСТВУЕТ («two separate fields of the same type»);
      включительные границы — НЕ отклонение, а раздел Exceptions («significant colloquial precedent for inclusive start
      and end values»), с обязанностью «**must** clearly document each range as inclusive or exclusive» — в описании полей
      писать «границы включительные». ЕДИНСТВЕННОЕ отклонение — префиксы `min`/`max` вместо SHOULD `first_`/`last_`:
      `first`/`last` у Google — для упорядоченных последовательностей (страницы, даты), а `lastResources` читается как
      «последние выданные». Прецеденты самого Google для границ размера (проверено по googleapis master): Cloud Run v2 и
      Cloud Functions v2 `min/max_instance_count`, Vertex AI `min/max_replica_count`, GKE `min/max_node_count`,
      Spanner `min/max_nodes`, Dataproc `min/max_instances`. `step` AIP не рассматривает.
    · Дефолтный размер для семейства НЕ публикуем: `machineSelector.resources` обязателен, значит дефолт никто не
      прочитает — мёртвые данные, к тому же выдуманные нами (у YC у `standard-v3` своего дефолта нет).
    Мелочи к исправлению: добавить `option (google.api.resource)` обоим (AIP-123); `MachineFacts.os.name` → `os.family`
    (AIP-122: «the field name `name` is reserved»); `memory_mb_per_core` меряет отношение к «core», которого в
    `Resources` нет (там millicores) — один якорь; `parent` в ListMachineTypes REQUIRED + `resource_reference
    {child_type}`; поле типа на `computeProviders` должно нести `resource_reference` на `ComputeProviderType`;
    `IDENTIFIER` на `name` верно и OUTPUT_ONLY туда не добавлять (AIP-203); `title` законен (AIP-148: «The string
    `title` field **should** be the official name of an entity… a more formal variant of `display_name`») — то есть
    наш выбор `title` для каталога подтверждён прямой цитатой, а не только прецедентом IAM.
- **[DESIGN] `environments` — разбор (2026-09-27..28), ЗАКРЫТ (итог — пункт «ИТОГ» ниже):**
  [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] · Предложение: `name`, `uid`; заказ плоско теми же словами, что `slot.stereotype` и капы — `platform`,
    `platformVersion`, `model`, `runtime` (голые id каталога; `execution` → `runtime`; `platform{name,…}` убран — AIP-122
    резервирует `name`); `applications[]{appName, appVersion?, detected{appName, appVersion} (OUTPUT_ONLY), oneof
    provided{} | custom{…}}` (AIP-146 вместо `source{type}`); `computeProvider` (полное имя, на create опционально)
    вместо `cloudAccount`/`cloudType`/`computeKind` (производные); `slot` OUTPUT_ONLY; `state: CREATING | ACTIVE |
    DELETING | FAILED` (AIP-216: ENQUEUED+PREPARING → CREATING — «only add states that are useful to customers»;
    `UNHEALTHY` → `conditions[Ready]`, `stateReason` → reason/message условия, `lastHeartbeatTime` → в условие по
    прецеденту k8s NodeCondition; `DELETED` убран — AIP-164 даёт его soft-delete-ресурсам, после DELETING → 404);
    `capabilities.canAccessCurrentSession`; `createTime`, `updateTime`. Update нет → `etag` нет (AIP-154).
    Ручки: POST `?environmentId=` (AIP-133 — сейчас id в ТЕЛЕ, баг), GET, LIST (`totalSize`, `filter`), DELETE.
  · **РЕШЕНО юзером:** `occupancy: FREE | RESERVED | BUSY` остаётся (ревьюерское `allocation` занято
    `slot.resources.machineAllocation`); `GET …/{e}/session` (нарушает AIP-156: синглтон «must always exist») —
    решать в разборе `sessions`; асинхронные create/delete без LRO — вариант (б), ЕСЛИ у Google есть прецеденты.
  · **Прецеденты (проверено по googleapis master, 2026-09-27):** CREATE — ЕСТЬ: Device Streaming v1
    `CreateDeviceSession → DeviceSession` (`devicestreaming/v1/service.proto:53`; REQUESTED→PENDING→ACTIVE — выделение
    физического Android-устройства, ближайший аналог), Document AI `CreateProcessor → Processor` (CREATING), Storage
    Transfer `CreateAgentPool → AgentPool` (CREATING), Logging `CreateBucket`, Vertex/Batch/Workflows jobs. Контр: тяжёлая
    инфраструктура (Redis, Filestore, TPU, Workstations, GKE) — LRO; Logging/Dataproc позже дорастили LRO-вариант.
    → create возвращает ресурс в CREATING: осознанное отклонение от SHOULD AIP-133 с этими прецедентами.
    DELETE — прецедента «ресурс с DELETING» НЕТ: ресурс из Delete у Google только при soft delete (AIP-164) или
    синхронно; асинхронный жёсткий delete без LRO отдаёт `Empty` (Storage Transfer `DeleteAgentPool → Empty`,
    `transfer.proto:174`, при этом у пула есть DELETING). РЕШЕНО (юзер, 2026-09-27; без LRO): `DELETE → {}`, GET показывает
    DELETING до завершения teardown, затем 404 (тип ответа по AIP-135, отклонение только «нет LRO»).
  [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] · **Приложения ↔ W3C — ТРЕБОВАНИЕ ЮЗЕРА (2026-09-28):** у приложения есть МАРКЕР «это браузер». Браузер адресуется
    и стандартными `browserName`/`browserVersion`, и `sw:appName`/`sw:appVersion`; НЕ-браузер — только `sw:appName`/
    `sw:appVersion` (`browserName` для него невалиден). Имя в сессии матчит и пользовательское `appName`, и
    `detectedAppName`; версия — и `appVersion`, и `detectedAppVersion`. На ревью (2026-09-28): `applications[]` массивом vs
    вложенный ресурс; ссылка на ресурс `application` вместо слова `appName`; где место маркера «браузер»; не должны ли
    detected-факты жить на сборке (`builds`), а не на окружении.
  · **КАТАЛОГ ПРИЛОЖЕНИЙ — вариант A′: проект-вендор `catalog`, но ЧЕСТНЫЙ (юзер, 2026-09-28; два ревьюера):**
    прецедент GCE — публичные образы в настоящем проекте `debian-cloud`, свой и вендорский различаются ПОЛНЫМ ИМЕНЕМ
    (`compute/v1/compute.proto:8642` `source_image`), без перекрытия. Публичность — IAM-биндингом
    `allAuthenticatedUsers → roles/sw.applicationViewer` [на приложениях, не на проекте — см. ИТОГ IAM] (google.iam.v1 `policy.proto:172` — специальный участник той же
    спецификации, что наш IAM); админы каталога — узкая роль `roles/sw.applicationPublisher` (только `applications.*`),
    тогда IAM сам запрещает окружения/сессии/… в каталоге → УБРАТЬ 5 `ensureNotCatalogProject`, ветки `isCatalogProject`
    в Get/List, `exposesRefs(handle)` и `appRef`-опциональность по хэндлу (решать permission-ом). ПРАВИЛО ПЕРЕКРЫТИЯ
    own → catalog ОТМЕНЕНО (слово тихо резолвилось в один из двух ресурсов по скрытому состоянию). Id приложений —
    читаемые, задаёт пользователь (AIP-133). Отвергнуто: C (единый проектный реестр — смешение владельцев: свои сборки
    под встроенным ресурсом), B (глобальные `publishers/*` — второе имя платформы). Поправить PLAN «каталог выигрывает
    всегда (docker-правило)» в разделе варки CfT — давно отменено.
  [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] · **Элемент `applications[]` окружения и ключи (юзер, 2026-09-28):** `displayName` у приложения/сборки — ТОЛЬКО
    подпись для UI (AIP-148 `0148.md:41–46`: «must be a mutable, user-settable… should not have uniqueness
    requirements» → ключом W3C-матчинга быть не может). Ключ `sw:appName` — id приложения (задаёт пользователь,
    AIP-133); ключ `sw:appVersion` — отдельное поле сборки, уникальное в пределах приложения (id `113`/`7.1-rc2`
    невалиден: AIP-122 `0122.md:131` — RFC-1034, первый символ буква). Предложение (ждёт юзера): элемент окружения =
    `build` (полное имя, REQUIRED) + `detectedAppName`/`detectedAppVersion` (OUTPUT_ONLY); `appName`/`appVersion` на
    окружении не публикуются — производное от build.
  · **detected-факты — на ОКРУЖЕНИИ (разобрано с юзером, 2026-09-28):** определяет агент ПОСЛЕ установки на узле
    (`linux-node.ts:29` → `/tmp/sw-detected.json`), при регистрации сборки артефакт не открывается. На сборку не
    переносятся: preinstalled (версия = свойство пары сборка × образ платформы), URL (содержимое перекачивается без
    digest). В разборе `applications`: после follow-up «положить в бакет один раз + sha256» сборка получит свои
    факты артефакта (package id / versionName из манифеста при регистрации) — другой факт («что положили»), окружение
    продолжает показывать «что установилось» (совпадение = подтверждение).
  · **`computeProvider` окружения — REQUIRED, IMMUTABLE всегда (юзер, 2026-09-28):** снимает особый случай «один
    провайдер → можно промолчать» (там сервер вписывал бы значение в поле пользователя — нарушение MUST AIP-129,
    `0129.md:24–26,68`); `effectiveComputeProvider` не нужен. Последовательно с «размещение — ЯВНОЕ» (2026-09-09). UI
    при единственном провайдере подставляет его в форму. Ослабить позже (OPTIONAL + `effectiveComputeProvider`) —
    обратно совместимо.
  · **ИТОГ — `environments`, `applications`, `builds` ЗАКРЫТЫ (юзер, 2026-09-28; финальный AIP-аудит, 2 ревьюера).**
    Этот блок ГЛАВНЕЕ соседних пунктов раздела (там — история решений; имена полей — отсюда).
    **Application** `projects/{p}/platforms/{pl}/applications/{application}` — `?applicationId=` REQUIRED (AIP-133
    `0133.md:163` «may be required or optional», эталон `book_id` REQUIRED; RFC-1034 lowercase; id = ключ W3C, не меняется):
    `name` IDENTIFIER · `uid` OUTPUT_ONLY · `displayName` OPTIONAL (mutable, только UI) · [`browser` УБРАН 2026-09-29 — см. `sessions`:
    браузер определяет нода, `detectedBrowserName`] · `etag` · `createTime`/`updateTime` OUTPUT_ONLY. Методы: Create → ресурс (без LRO), Get, List,
    Update (`updateMask` OPTIONAL, `etag` OPTIONAL; меняется только `displayName`), Delete (`force` — каскад по сборкам;
    без force при сборках → FAILED_PRECONDITION, AIP-135 MUST; ссылки окружений → FAILED_PRECONDITION, force НЕ снимает).
    **Build** `…/applications/{a}/builds/{build}` — `?buildId=` OPTIONAL (не задан → серверный id; формат обоих
    документировать): `name` IDENTIFIER · `version` REQUIRED+IMMUTABLE (свободная метка пользователя, уникальна в
    приложении → ALREADY_EXISTS; значение `latest` запрещено; ключ W3C `sw:appVersion`/`browserVersion`) ·
    `artifactUri` OPTIONAL+IMMUTABLE (нет → предустановлен в образе платформы) · `webdriverUri` OPTIONAL+IMMUTABLE ·
    `createTime` OUTPUT_ONLY. Без Update, без uid/displayName/etag. Методы: Create → ресурс, Get, List (`filter`,
    `orderBy` — поля документировать; «последняя» = новейшая по `createTime`, AIP-129 пример «most recent»), Delete
    (ссылки окружений → FAILED_PRECONDITION).
    **Environment** `projects/{p}/environments/{environment}` — `?environmentId=` OPTIONAL (не задан → серверный id):
    `name` IDENTIFIER · `uid` OUTPUT_ONLY · `runtime`, `model`, `platformVersion`, `computeProvider` — полные имена,
    REQUIRED+IMMUTABLE (сервер НЕ подставляет дефолты — AIP-129 MUST; дефолты подставляет UI) · `applications[]`
    REQUIRED+IMMUTABLE, 1..20 элементов: {`application` REQUIRED · `build` OPTIONAL (пусто = новейшая по createTime на
    момент создания) · `effectiveApplicationBuild` OUTPUT_ONLY (всегда заполнен; AIP-129 `effective_`) · `detectedTitle` OUTPUT_ONLY
    (все платформы: Linux `--version`, Android подпись манифеста, iOS `CFBundleDisplayName`) · `detectedPackageId`
    OUTPUT_ONLY (только Android) · `detectedBundleId` OUTPUT_ONLY (только iOS, появится с iOS) · `detectedVersion`
    OUTPUT_ONLY} · `slot` OUTPUT_ONLY · `state` OUTPUT_ONLY (STATE_UNSPECIFIED|CREATING|ACTIVE|DELETING|FAILED) ·
    `conditions[]` OUTPUT_ONLY · `occupancy` OUTPUT_ONLY (OCCUPANCY_UNSPECIFIED|FREE|RESERVED|BUSY; не двигает updateTime)
    · `createTime`/`updateTime` OUTPUT_ONLY. Методы: Create → ресурс в CREATING (без LRO — записанное отклонение), Get,
    List (`filter`: state, occupancy, runtime, slot с `*` ведущим/хвостовым по границе сегмента, applications.application),
    Delete → `{}` (Get показывает DELETING, затем 404).
    **Префикс `app` внутри ресурсов приложения убран** (AIP-140: одно понятие — одно слово, без прилагательных, что
    «always apply»): `version`/`artifactUri`/`detectedTitle`/`detectedPackageId`/`detectedVersion`. `sw:appName`/
    `sw:appVersion` остаются ТОЛЬКО в W3C-капах, перевод — presenter/request-модель.
    **Ссылки между проектами:** `runtime`/`model`/`platformVersion`/`computeProvider` — только проект окружения;
    `application`/`build` — свой проект или `catalog`; иное → INVALID_ARGUMENT. Права на ссылаемое проверяются первыми
    (AIP-211: нет права → PERMISSION_DENIED). `build` не из `application` или приложение не той платформы →
    INVALID_ARGUMENT; у приложения нет сборок → FAILED_PRECONDITION. Платформы сравниваются по id.
    **Блокировка удаления сборки/приложения:** блокирует ЛЮБОЕ существующее окружение со ссылкой, включая FAILED
    (юзер: FAILED сам уйдёт уборщиком — `WORKER_FAILED_TTL_MS`, дефолт 1 ч; или пользователь удалит окружение сразу).
    Ошибка у каталога не перечисляет окружения чужих проектов.
    **W3C-матчинг** (уточнено 2026-09-29, подробности — ИТОГ `sessions`): `browserName` = РЕАЛЬНЫЙ браузер окружения
    `detectedBrowserName` (без учёта регистра + синонимы `microsoftedge↔msedge`), `browserVersion` = `detectedVersion`;
    `sw:appName` = id приложения ИЛИ машинный идентификатор (`detectedPackageId`/`detectedBundleId`), `sw:appVersion` =
    `version` сборки ИЛИ `detectedVersion`; `detectedTitle` не матчится. Инварианты: id приложений уникальны в
    окружении (INVALID_ARGUMENT); совпавший машинный идентификатор → окружение невыбираемо И видно в `conditions`;
    два браузера с одним `detectedBrowserName` различаются по версии. Элемент `applications[]` дополнительно несёт
    `detectedBrowserName` (OUTPUT_ONLY, только браузеры; берёт `wd-door` у драйвера — `capabilities.browserName` — и
    передаёт агентом в хартбит). Доработка агента: на Linux читать название продукта из `--version`.
    **Declarative-friendly — НЕТ ни у одного из трёх** (РЕШЕНО юзером, 2026-09-28): пометка явная (`style:
    DECLARATIVE_FRIENDLY`, `0128.md:36`), у Google редкая (32 proto из ~7254); Create без LRO — прецеденты Secret Manager
    `CreateSecret`, Pub/Sub `CreateTopic`, IAM `CreateRole`. Поддержка Terraform — в следующей версии API.
    **Документировать (DOC-must):** форматы id (application/build/environment, пользовательские и серверные), формы и
    ограничения `filter` (в т.ч. нет корреляции по repeated), поля `orderBy`, что обновляет `updateTime` (переходы
    state/conditions — да, occupancy/хартбит — нет), пустые `detected*` (включая `detectedBrowserName`) по платформам, лимит 1..20, значения `transport`,
    права ролей `roles/sw.applicationViewer`/`roles/sw.applicationPublisher` на builds.
    [РЕШЕНО 2026-09-29 в ИТОГ `sessions`] ОТЛОЖЕНО в `sessions`: ответ New Session, «последняя» у сессии (новейшая detected) — развести с «последней сборкой»;
    `GET …/{e}/session` (AIP-156); замена `capabilities.canAccessCurrentSession` (`:testIamPermissions`).
  [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] · **Итоги AIP-аудита env/app/build (юзер, 2026-09-28):** `appRef`/`webdriverRef` → `appUri`/`webdriverUri` (AIP-140
    `0140.md:145` «should use `uri`»; значения — URI `gs://…`/`https://…`); `etag` у приложения (PATCH `displayName`;
    наше правило «etag на всех PATCH-able»); `browser` — OPTIONAL, IMMUTABLE (AIP-203 «on every field»); `uid` у сборки
    убран (не declarative-friendly); `displayName` у сборки убран (без Update он нарушал бы MUST AIP-148 «mutable»).
    detected-идентичность по платформам (прецедент Firebase Test Lab: `app_package_id` Android / `app_bundle_id` iOS,
    `test_execution.proto:479,521`): Android — `detectedAppPackageId`, iOS позже — `detectedAppBundleId`, Linux — нет
    (идентичности не существует); плюс `detectedAppTitle` у всех (РЕШЕНО). Документировать: формат
    серверного id сборки; формы `filter` (`*`); `force` НЕ снимает запрет удаления сборки со ссылками; платформы
    сравниваются по id.
  · **Сборки — РЕШЕНО (юзер, 2026-09-28):** коллекция `…/applications/{a}/builds/{build}` (вместо `versions`); id
    сборки: `?buildId=` OPTIONAL — не задан → генерирует сервер (ИСПРАВЛЕНО аудитом: «только сервер» нарушало MUST
    AIP-133 `0133.md:136` «An API **must** allow a user to specify the ID component… on the management plane»; OPTIONAL
    разрешён `0133.md:147`; формат серверного id задокументировать, `0122.md:141`; расхождение id с `appVersion`
    (`v113` при `"114"`) допустимо — ключом служит только `appVersion`); ЕДИНСТВЕННЫЙ пользовательский ключ сборки — `appVersion` (REQUIRED, IMMUTABLE, уникален в
    приложении, ALREADY_EXISTS на повтор) — он же ключ W3C `sw:appVersion`/`browserVersion`. Удаление сборки (и
    приложения), на которую ссылается нетерминальное окружение → `FAILED_PRECONDITION` (AIP о ссылках молчит →
    решение юзера; окружению сборка нужна постоянно — ключи W3C-матчинга). Удаление приложения с детьми без `force`
    → `FAILED_PRECONDITION` (AIP-135 MUST).
  · **Ссылки на РЕСУРСАХ — строго по AIP-122: ПОЛНЫЕ ИМЕНА везде, включая каталог (юзер, 2026-09-27):** `0122.md:297`
    «When a field represents another resource, the field **should** be of type `string` and accept the resource name»;
    голый id — только если «strictly necessary», и тогда с суффиксом `_id`. Голые значения живут ТОЛЬКО в W3C-капах
    (сторона W3C), перевод — в presenter/request-модели. Отменяет правило «ссылки — ГОЛЫЕ id» у каталога платформ.
    Окружение: `runtime`, `model`, `platformVersion` — полные имена (`projects/{p}/platforms/android/runtimes/emulator`
    и т.д.), `platform` УБРАН (производное: сидит в имени каждой из трёх ссылок); у слота `runtime` — полное имя.
    Принцип юзера: делаем строго по AIP; видна проблема — приносим на обсуждение (как `min`/`max` vs `first`/`last`).
  · **Ссылка на место — ТОЛЬКО `slot` — РЕШЕНО (юзер, 2026-09-27; два ревьюера единогласно, отклонений от AIP нет):** довод за
    `machine` («AIP-160 без префикса») ложный — `0160.md:116`: «when comparing strings for equality, services **should**
    support wildcards using the `*` character» → «окружения на машине» = `filter=slot="…/machines/{m}/slots/*"`;
    поддерживаемые формы `*` (ведущий и хвостовой, по границе сегмента — пример AIP `a = "*.foo"` как раз ведущий; исправлено 2026-09-28) и `slot:*` («размещено») ДОКУМЕНТИРУЕМ по
    `0160.md:208–214` — не отклонение. Дублировать предка ссылки AIP не требует и не запрещает (AIP-203 MAY) → правило
    проекта «производное не публикуем»: `environment.machine` и `filter=machine=` (решение у PLAN:1457) СНЯТЬ. Страница
    машины отвечает `List …/machines/{m}/slots` (у слота `environment`). Пара `slot.environment` ↔ `environment.slot`
    законна (AIP молчит; каждая сторона — Get своего ресурса), пишется одной транзакцией размещения.
  · **`form` УБРАН СОВСЕМ — и со слота, и из каталога (юзер, 2026-09-27; два ревьюера):** выводим из runtime
    (device→физ., прочие — нет); у Firebase EMULATOR/VIRTUAL различают СПОСОБ виртуализации (вложенная/нативная) —
    наш `emulator` на KVM-железе был бы VIRTUAL: занятое слово с чужим смыслом. Пользователю нужна ось «реальное/нет»
    (BrowserStack `realMobile`, LambdaTest `isRealMobile` — булевы) — её даёт `runtime=device`; капы form нет.
    AIP-203 выводимое допускает (MAY) — отказ по правилу проекта. Инвариант каталога: одна природа на runtime, иная —
    новый runtime. «Все физические» = `filter=runtime="*/runtimes/device"` (AIP-160 `0160.md:116` — ведущий `*`,
    ровно пример AIP; документировать). Отменяет PLAN у слота (form/`PHYSICAL|EMULATOR|VIRTUAL`). `transport` — только
    у слота, СТРОКА kebab-case с задокументированным списком (AIP-126: «must document the allowed values»).
    Попутно исправить: определение `runtime` у слота («протокол между агентом и окружением» — это transport); капа
    `sw:execution` → `sw:runtime` (одно понятие — одно имя).
- **[DESIGN] `sessions` — разбор (2026-09-29), В РАБОТЕ.** Две стороны: `wd` — W3C WebDriver/BiDi/Appium по букве,
  `api` — AIP. Черновик формата — ответ в сессии 2026-09-29 (пути `/session`, ответ New Session поверх ответа ноды,
  `webSocketUrl` вместо `sw:bidi`, проброс не-`sw:*` кап и перебор `firstMatch`, `sw:runtime`/`sw:model`/`sw:netBridge` [→ ИТОГ tunnels],
  ошибки в формате W3C; на `api` — `sessionLogs`/`sessionVideos` + `:download`, `environments/{e}:accessSession`, снос
  `…/sessions/{id}/logs|video`, `…/environments/{e}/session`, `capabilities.canAccessCurrentSession`). РЕШЕНО юзером:
  · **Самопроверяемый id сессии** (follow-up «self-verifying session id» переходит в дизайн): в id — подпись сервера
    (HMAC серверным ключом по содержимому id; прецедент — Geewax «API Design Patterns», контрольная сумма в
    идентификаторе: проверка без базы и без хранения выданных id). Подпись не сходится → «такой сессии не было»,
    подпись сходится, сессия не жива → «сессия завершена» — РАЗНЫЕ коды (отклонение от W3C, где на оба случая один
    `invalid session id` 404 — принято юзером ради точного ответа; документировать).
  · **Нет свободного окружения → HTTP 429** с W3C-телом `session not created` (отклонение от W3C-таблицы, где 500;
    принято юзером: корректнее для клиента «повтори позже»; документировать).
  · **Аутентификация:** нет токена → 401, нет права `session:create` → 403, тело в W3C-форме (W3C аутентификацию не
    покрывает — не отклонение).
  · **`sw:projectId` в капах** (как BrowserStack/Sauce) — отклонение от W3C «recommended … top-level parameters, and not
    as part of the requested capabilities»; top-level `projectId` не принимаем.
  · **Операторы версий** `<`, `<=`, `>`, `>=` в `browserVersion`/`sw:appVersion` ПОДДЕРЖИВАЕМ (W3C: «accept a value that
    places constraints on the version using the "<", "<=", ">", and ">=" operators» — не отклонение): по сегментам для
    определённых версий; для меток сборок (`7.1-rc2`) — порядок по правилам SemVer (pre-release ниже релиза), метка,
    которую не разобрать, — только равенство (документировать).
  · **`browserName` — ТОЧНО по W3C против РЕАЛЬНОГО имени браузера от ноды (юзер, 2026-09-29, вариант b):** W3C
    `browserName` = имя user agent; стоковые клиенты ставят его сами (`ChromeOptions` → `chrome`, `EdgeOptions` →
    `MicrosoftEdge`). Агент при подъёме сообщает новое OUTPUT_ONLY-поле элемента окружения `detectedBrowserName`
    (только у браузеров). Матч `browserName`/`browserVersion` — только с `detectedBrowserName`/`detectedVersion`;
    алиасы (приложение `firefox` с Chrome внутри) — только через `sw:appName`. Отклонений нет, регистр не проблема.
    ПОПРАВКА к закрытому `applications`: маркер `browser` УБРАН — производное (браузер = приложение, у которого нода
    сообщила `browserName`). Ответ New Session: `browserName`/`browserVersion` — фактические от ноды.
- **[DESIGN] `sessions` — решения после финального ревью (юзер, 2026-09-29):**
  · **Коды id сессии — РАЗНЫЕ:** подпись не сошлась («сессии не было») → 400 `invalid argument`; подпись сошлась, сессия
    не жива → 404 `invalid session id` (строго W3C — клиенты особо обрабатывают именно его). Отклонение — только первый
    случай; документировать. Подпись: `timingSafeEqual`, `kid` + набор ключей (ротация без «убийства» живых сессий),
    лучше AEAD (шифрование) — иначе в id открыт внутренний `host:port` ноды.
  · **Нет окружения:** подходящее ЕСТЬ, но занято → 429 + `Retry-After` (отклонение, W3C-тело `session not created`);
    подходящих нет вообще → 400 `session not created` (юзер: проблема параметров запроса, не сервиса; отклонение от
    W3C-таблицы, где 500; документировать).
  · **`browserName`:** сравнение с реальным браузером от ноды (`detectedBrowserName`, хранится в нижнем регистре), без
    учёта регистра + синонимы `microsoftedge ↔ msedge` (клиенты шлют `MicrosoftEdge`/Appium `Chrome`, msedgedriver
    зовёт себя `msedge`) — малое отклонение от W3C «string equal», документировать. В ответе — значение от ноды.
  · **`platformName` в ответе = `linux`** (стандартное значение W3C; Selenium Java может не знать `ubuntu`), платформа
    нашего каталога — отдельной капой `sw:platform: "ubuntu"` (разные понятия: семейство W3C и платформа каталога).
  · **`sw:*` не доходят до драйвера** (W3C «must not be forwarded to the endpoint node»): `wd` вырезает свои
    (`sw:projectId`, `sw:environmentId`, `sw:appName`, `sw:runtime`, …); опции сессии (`sw:logging`, `sw:video`,
    `sw:netBridge` [→ ИТОГ tunnels]) доходят только до `wd-door` (наш посредник в окружении, перед chromedriver/geckodriver/Appium),
    он отдаёт их агенту через свой `/status` и вырезает все `sw:*` перед драйвером (сейчас у Appium passthrough — баг).
  · **Артефакты:** `sessionLogs`/`sessionVideos` — порядок по id, БЕЗ `totalSize`/`orderBy` (AIP везде MAY: `0132.md:138`,
    `0158.md:92`; исключение из нашего правила «totalSize во всех List» — бакет не умеет дешёвый подсчёт/сортировку).
    id — НЕПРОЗРАЧНЫЙ серверный (агент при загрузке не знает полного id сессии — «клиент посчитает сам» снято); в
    ответе New Session — полные имена `sw:sessionLog`/`sw:sessionVideo` (только если logging/video включены).
    `contentType` → `mimeType` (AIP-143 MUST); `:download` → HttpBody (отклонение от SHOULD «…Response», записать).
  · **Сделать без решений (стандарты/гигиена):** `se:cdp` в ответе ПЕРЕПИСАТЬ на наш адрес (стоковые Selenium ищут CDP
    по нему), вычистить внутренние адреса ноды (`ws://<node>`, `debuggerAddress`); `webSocketUrl` строго по BiDi —
    `wss://host/session/{id}`, только по запросу; `firstMatch` по W3C (пустой → invalid argument, валидировать все,
    `null` = не задано, на ноду — только выбранный); `GET /status`; `sw/alive` на мёртвую → 404; `:accessSession`:
    сверка несекретного id сессии (гонка), `Cache-Control: no-store`, `AccessSessionResponse`, порядок проверок IAM →
    окружение → сессия → создатель; права `sw.sessionLogs.{get,list}`, `sw.sessionVideos.{get,list}` (admin/developer/
    viewer), `sw.environments.accessSession` (admin/developer); `project.uid` в ключе хранилища артефактов.
- **ИТОГ `sessions` — ЗАКРЫТ (юзер, 2026-09-29; 2 финальных ревью + ревью oneof).** Главнее пунктов `sessions` выше.
  **`wd` — W3C WebDriver/BiDi/Appium по букве, отклонения перечислены.** Ручки: `POST /session` · `DELETE /session/{id}` и
  `* /session/{id}/…` (прокси) · `GET /status` → `{value:{ready,message}}` · `GET /session/{id}/sw/alive` →
  `{value:{alive:true}}` (мёртвая → 404; неизвестные `/session/{id}/sw/*` → 404 `unknown command`) · WS BiDi
  `wss://host/session/{id}` · WS `/session/{id}/sw/{cdp|vnc}` · `GET /interactive?path=…` [→ вьюер = страница дашборда + `:generateAccessToken`, ИТОГ wd-auth].
  **Аутентификация:** `Authorization: Bearer <токен>` ИЛИ `Basic` (токен в поле пароля — стоковые клиенты:
  `https://acme:<токен>@wd…`, как BrowserStack/Sauce); только HTTPS (+HSTS), `Authorization` не логируется, лимит частоты
  на 401. Отдельный отзываемый ключ проекта для CI вместо пользовательского токена IdP — в разбор IAM [→ РЕШЕНО: только ключи (личные + SA), ИТОГ wd-auth].
  **Запрос:** `sw:projectId` REQUIRED (только `alwaysMatch`; отклонение от «recommended … top-level parameters», как
  BrowserStack) · приложение одним словарём: `browserName`(+`browserVersion`) ↔ `detectedBrowserName`(без учёта
  регистра + синонимы `microsoftedge↔msedge`, малое отклонение)/`detectedVersion`; ИЛИ `sw:appName`(+`sw:appVersion`) ↔
  id приложения или `detectedPackageId`/`detectedBundleId`, версия ↔ `version` сборки или `detectedVersion` · версии:
  операторы `<,<=,>,>=` (сегменты; SemVer для меток; неразбираемая метка — только равенство); нет версии/`latest` =
  новейшая по ВСЕМ подходящим окружениям · `platformName` — ТОЛЬКО семейство W3C (`linux`/`android`/`ios`), без учёта
  регистра (малое отклонение) · `sw:platform` (id платформы каталога, `ubuntu`) · `sw:platformVersion` (синоним
  `appium:platformVersion`) · `sw:model` (синоним `appium:deviceName`; конфликт значений с синонимом → 400) ·
  `sw:runtime` (container|emulator|device, по умолч. container) · `sw:environmentId` (опц., только `alwaysMatch`) ·
  `sw:logging`/`sw:video` · `sw:tunnel: "<имя>"` (бывш. `sw:netBridge`; см. ИТОГ tunnels) · `webSocketUrl: true` (нода без BiDi → окружение не подходит) · прочие капы и
  неизвестные top-level параметры — на ноду · `firstMatch` строго по W3C (пустой → 400, валидировать все, `null` = не
  задано, ключ и в `alwaysMatch`, и в `firstMatch` → 400, на ноду — только выбранный вариант) · `desiredCapabilities`
  без `capabilities` → 400 с объяснением. `sw:*` до драйвера не доходят: `wd` вырезает свои, опции сессии доходят только
  до `wd-door`, он отдаёт их агенту через `/status` и вырезает `sw:*` перед драйвером.
  **Ответ:** капы ноды (внутренние адреса вычищены, `debuggerAddress` убран, `se:cdp` переписан на наш адрес,
  `se:cdpVersion` сохранён) + `platformName` (`linux`/`android`), `sw:platform`, `sw:platformVersion`, `sw:model`,
  `sw:runtime`, `sw:appName` (id приложения), `sw:appVersion` (= `detectedVersion`, документировать: спросил `152` —
  получил `152.0.7977.82`), `sw:projectId`, `sw:environmentId` (что пишет пользователь — коротко и так же возвращается);
  ссылки — ПОЛНЫМИ URL, как принято в W3C-мире (`webSocketUrl`, Grid `se:cdp`; решение юзера): `sw:applicationBuildUrl`
  (`https://api…/v1/projects/…/builds/{b}`), `sw:sessionLogUrl` / `sw:sessionVideoUrl` (`…:download`; только если
  logging/video включены; нужен токен), `webSocketUrl` (если просили), `sw:cdp`, `sw:vnc`, `sw:interactive`. `wd`
  знает публичный адрес `api` из конфига.
  **Ошибки** `{value:{error,message,stacktrace}}`: подпись id не сошлась → 400 `invalid argument`; сессия не жива → 404
  `invalid session id`; подходящее есть, но занято (для `firstMatch` — хоть один вариант) → 429 + `Retry-After`
  `session not created`; подходящих нет → 400 `session not created`; кривые капы → 400 `invalid argument`; нет/битый
  токен → 401 + `WWW-Authenticate: Basic` `unauthenticated`; нет `sw.sessions.create` → 403 `permission denied`.
  Запрошены `sw:logging`/`sw:video`, а хранилище проекта не настроено или его `AccessVerified` ≠ True → 400 `session
  not created`, причина в `message`: `STORAGE_DESTINATION_NOT_CONFIGURED` / `STORAGE_ACCESS_NOT_VERIFIED` (юзер,
  2026-10-04: честный отказ сразу, а не молча без записи; по W3C — запрошенную капу выполнить нельзя).
  **id сессии:** AEAD (AES-GCM) с `kid` открытым префиксом и набором ключей (ротация), случайный nonce; внутренний адрес
  ноды не виден. Маска логов ловит `/session/` и `/sessions/`, а также `?path=` у `/interactive`.
  **`api` — AIP:** `projects/{p}/sessionLogs/{sessionLog}`, `projects/{p}/sessionVideos/{sessionVideo}` — `name`
  IDENTIFIER, `environment` (полное имя) · `mimeType` · `sizeBytes` · `createTime` OUTPUT_ONLY; Get · List (pageSize,
  pageToken, `filter=environment=…`; порядок по id; без totalSize/orderBy — AIP MAY, исключение из нашего правила) ·
  `GET …:download` → HttpBody (text/plain | стрим video/mp4; отклонение от SHOULD «…Response»); id непрозрачный
  серверный (формат документировать); нет Create/Update/Delete; `project.uid` в ключе хранилища.
  `GET projects/{p}/environments/{e}:accessSession` → `AccessSessionResponse{environment, sessionId, sessionLog?,
  sessionVideo?}`; `Cache-Control: no-store`; проверки: IAM → окружение → живая сессия (NOT_FOUND) → создатель
  (PERMISSION_DENIED); защита от гонки — случайный несекретный id сессии в строке владения, `wd-door` отдаёт его в
  `/status`, секрет выдаётся только при совпадении. Снять: `projects/{p}/sessions/{id}/{logs,video}`,
  `projects/{p}/environments/{e}/session`, `environment.capabilities.canAccessCurrentSession` (UI: стрелка на любом
  BUSY, клик → `:accessSession`), право `sw.sessions.get`. Права: `sw.sessionLogs.{get,list}`,
  `sw.sessionVideos.{get,list}` (admin/developer/viewer), `sw.environments.accessSession` (admin/developer),
  `sw.sessions.create` (как есть). `ErrorInfo.reason` на все новые ошибки.
  **Документировать:** все отклонения выше; формат id артефакта и id сессии; `pageSize` по умолчанию/максимум; смысл
  порядка списка; артефакт появляется атомарно после конца сессии; таблицу синонимов браузеров; правило версий.
- **[DESIGN] `sessions`/`environments` — решения 2026-09-29 (продолжение):**
  · **Элемент `applications[]` — ПАРА `application` (REQUIRED) + `build` (OPTIONAL, обязан быть ребёнком application),
    НЕ oneof** (юзер; 2 ревьюера разошлись): AIP-146 oneof допускает (MAY), но по AIP-129 сервер обязан вернуть ввод
    как есть → при заданном `build` поле `application` было бы пустым, ключ «какое приложение» пропал бы у части
    элементов (фильтр `applications.application`, UI). Прецеденты «родитель + ребёнок» у Google — пары: Cloud Run v2
    `secret`+`version` (`k8s.min.proto:162-179`), Functions v2 `secret`+`version`, Vertex `model` + OUTPUT_ONLY
    `model_version_id`; прецедент oneof (Notebooks `image{name|family}`) — не про родителя/ребёнка. Повтор ввода —
    сознательный, несовпадение → INVALID_ARGUMENT. AIP-180: переход в oneof позже — ломающий.
  · **Ошибки аутентификации `wd`:** нет/битый токен → 401 + `WWW-Authenticate: Basic`, `error: "unauthenticated"`;
    нет `sw.sessions.create` → 403, `error: "permission denied"` (свои коды — отклонение, у W3C их нет).
- **[DESIGN] IAM — разбор (2026-09-29), В РАБОТЕ.** Решено юзером:
  · **Публичный каталог — IAM-политика НА РЕСУРСЕ ПРИЛОЖЕНИЯ, без отклонения от Google** (Resource Manager запрещает
    `allUsers`/`allAuthenticatedUsers` в политике проекта — `projects.proto:242`; Compute держит IAM на самих образах —
    `images/{resource}:setIamPolicy`): `…/applications/{a}:getIamPolicy|:setIamPolicy|:testIamPermissions`;
    эффективные права = политика проекта ∪ политика приложения (сборки наследуют). Каталог: политика проекта `catalog`
    — только `roles/sw.applicationPublisher` ← конфиг `CATALOG_ADMIN_MEMBERS` (bootstrap приводит к конфигу и
    добавляет, и убирает); на каждом приложении каталога `allAuthenticatedUsers → roles/sw.applicationViewer`; публичному
    участнику — только роли без изменяющих прав. `catalog` — ОБЫЧНЫЙ проект, «урезанность» выражена только IAM (ни у
    кого нет прав на окружения/сессии/провайдеры/`delete`/`setIamPolicy` в нём) → снять `ensureNotCatalogProject` ×5,
    `isCatalogProject`, `exposesRefs(handle)`; особое — только bootstrap и зарезервированный id. ОТКРЫТО: как публика
    получает LIST приложений каталога — РЕШЕНО (юзер, 2026-10-04, вариант b): List строгий (`list` на проекте; публике →
    403, как у Compute: «Publicly shared images do not appear in the images list»), обнаружение — кастомный метод
    `GET /v1/projects/-/platforms/{pl}/applications:search` (AIP-159 `-` + Search по праву `get` на каждом элементе;
    AIP-132:110 «Search methods are more relaxed»; прецедент `projects:search`). Отвергнуто (a): `allAuthenticatedUsers`
    на проекте `catalog` — запрещено Google (`projects.proto:242`, «cannot share projects… with all authenticated users»).
  · **Каталог ролей `GET /v1/roles[/{role}]`** — глобальный, только Get/List, С ПАГИНАЦИЕЙ (AIP-132/158 — у любого List;
    при 6 ролях одна страница, пустой `nextPageToken` не выводится). **Имена ролей** по схеме Google `roles/{сервис}.{роль}`
    (`admin/v1/iam.proto:1099` «roles/logging.viewer for predefined roles»): `roles/sw.admin|developer|viewer`,
    `roles/sw.applicationViewer|applicationPublisher` (юзер: ок, если по стандарту Google — форму частей проверяет ревью).
  · **«Гейт на вход» — НЕ ДЕЛАЕМ:** `builtin` — только dev-инсталляции (тип провайдера включается конфигом; в проде его
    нет и в `computeProviderTypes`) → чужие ресурсы оператора не расходуются → создание проекта открыто всем вошедшим;
    право `sw.projects.create` и роль `projectCreator` УДАЛИТЬ; пункты плана «гейт на вход / allowlist» закрыты.
- **ИТОГ IAM — ЗАКРЫТ (юзер, 2026-10-04; 2 финальных ревью).** Главнее пунктов IAM выше; уточнения — пункт «УТОЧНЕНИЯ ИТОГ IAM» ниже (главнее этого блока там, где расходятся).
  **Политика проекта:** `GET /v1/projects/{p}:getIamPolicy[?options.requestedPolicyVersion=N]` (GET по AIP-136; google.iam.v1
  объявляет POST — Compute делает GET) → `{version:1, etag, bindings:[{role, members[]}]}` · `POST …:setIamPolicy`
  `{policy:{version?, etag?, bindings}, updateMask?}` (по умолч. `bindings,etag`, `iam_policy.proto:113-119`) · `POST
  …:testIamPermissions {permissions[]}` → `{permissions[]}` (POST законен: `0136.md:54` — может не влезть в URL).
  Ошибки setIamPolicy: etag устарел → 409 ABORTED; не осталось `roles/sw.admin` → 400 FAILED_PRECONDITION; пустой
  `members`, неизвестная роль/участник, `condition`, `version: 3`, `updateMask` кроме bindings/etag → 400
  INVALID_ARGUMENT; нет права → 403 «(or it might not exist)». Не поддерживаем (записать): `auditConfigs`, условия,
  версия 3. etag — хэш содержимого (слабый, AIP-154). Запись политики — под локом (`with(id, cb)`).
  **Политика приложения** (публичность каталога и шаринг отдельного приложения): те же три метода на
  `projects/{p}/platforms/{pl}/applications/{a}`; эффективные права = проект ∪ приложение; сборки наследуют;
  `allAuthenticatedUsers` — только с ролями без изменяющих прав.
  **Каталог ролей:** `GET /v1/roles` (пагинация) · `GET /v1/roles/{role}` → `{name, title, description,
  includedPermissions[]}`; без права (достаточно войти); пользовательских ролей нет. Роли в каталоге: `roles/sw.admin`, `roles/sw.developer`,
  `roles/sw.viewer`, `roles/sw.applicationViewer`, `roles/sw.applicationPublisher`, `roles/sw.tunnelUser` (см. ИТОГ tunnels).
  **Роли** (`roles/{сервис}.{роль}`): `roles/sw.admin` — всё; `roles/sw.developer` — чтение всего + окружения
  (create/delete/accessSession), `sessions.create`, приложения/сборки (create/update/delete); `roles/sw.viewer` — все
  get/list; `roles/sw.applicationViewer` — get/list приложений и сборок; `roles/sw.applicationPublisher` — всё на
  приложения/сборки + `projects.get`. Инфраструктура (провайдеры, привязки, машины: create/update/delete, cordon/
  uncordon/drain, generateRegistrationToken), `storageDestinations.update` (tunnels — НЕ только admin, см. ИТОГ tunnels),
  `serviceAccounts.*`, `serviceAccountKeys.*`, `projects.update|delete|getIamPolicy|setIamPolicy` — только admin.
  **Права** `sw.<коллекция>.<глагол>`: projects {get, update, delete, getIamPolicy, setIamPolicy}; computeProviders,
  computeBindings {get, list, create, update, delete}; machines {get, list, create, delete, generateRegistrationToken,
  cordon, uncordon, drain}; machineLeases, slots {get, list}; applications {get, list, create, update, delete,
  getIamPolicy, setIamPolicy}; builds {get, list, create, delete}; environments {get, list, create, delete,
  accessSession}; sessions {create}; sessionLogs, sessionVideos {get, list}; storageDestinations {get, update, delete};
  tunnels {get, list, delete, connect, use} (см. ИТОГ tunnels); serviceAccounts {get, list, create, delete, disable, enable}; serviceAccountKeys {get, list, create,
  delete, disable}. Снять: `sw.projects.create`, `sw.sessions.get` [→ ВЕРНУЛОСЬ: `sessions {create, get, list, use}`, ИТОГ wd-auth], `sw.cloudAccounts.*` (→ computeProviders),
  `sw.netBridgeCredentials.*` (→ УБРАНЫ: ключи туннеля = ключи сервисных аккаунтов, ИТОГ tunnels), `storageDestinations.set` (→ update). Глобальные каталоги
  (`platforms`, `computeProviderTypes`, `roles`) — без прав, достаточно войти.
  **Участники:** `user:<externalId>`, `group:<groupId>`, `serviceAccount:<sa>@<project>`, `allAuthenticatedUsers`;
  иное (`allUsers`, `domain:`, `deleted:`) → 400. Отклонение: идентификатор — externalId из IdP, а не email.
  **Сервисные аккаунты (CI, стоковые клиенты):** `projects/{p}/serviceAccounts/{sa}` (`?serviceAccountId=`, поля
  `name, uid, member, displayName, disabled, createTime`; `:disable`/`:enable`) и `…/keys/{key}` (id серверный; ответ
  Create один раз содержит `secret` вида `swk_<keyId>_<random>`, хранится только хэш; `expireTime`, `lastUseTime`;
  `:disable`; Delete = отзыв). Ключ работает как `Authorization: Bearer` и как Basic-пароль. Удаление SA каскадно
  чистит его связки.
  **Каталог приложений:** проект `catalog` — обычный; его политика из конфига `CATALOG_ADMIN_MEMBERS` →
  `roles/sw.applicationPublisher` (bootstrap и добавляет, и убирает); на приложениях каталога `allAuthenticatedUsers
  → roles/sw.applicationViewer`; List каталога публике → 403; обнаружение — `projects/-/platforms/{pl}/applications:search`.
  **Создание проекта** — открыто всем вошедшим (`builtin` только в dev); права/роли на создание нет.
  Баги из «[IAM] баги к исправлению» — часть итога.
- **[IAM] решения после финального ревью (юзер, 2026-10-04):**
  · **Шаринг — только каталог:** IAM-политики на приложениях — ради публичности приложений `catalog`; межпроектного
    шаринга своих приложений в v1 НЕТ (окружение берёт приложения только из своего проекта или `catalog`).
  · **Проекты создают только люди** (`user:`; сервисный аккаунт не может); среди admin проекта всегда есть хотя бы один
    `user:`/`group:` (удаление последнего человека-admin или единственного SA-admin → FAILED_PRECONDITION); аварийный
    доступ оператора инсталляции (break-glass) через конфиг — добавить.
  · **Журнал изменений IAM (аудит) — НЕ делаем в v1** (решение юзера; только `lastUseTime` у ключей).
  · **[→ уточнено в ИТОГ `projects`: фильтр по праву, группы, break-glass]** **Список проектов — `GET /v1/projects:search`** (проекты, где у вызывающего есть `sw.projects.get`; прецедент Resource
    Manager `SearchProjects`); обычного List проектов нет (у проекта нет родителя для проверки права).
- **УТОЧНЕНИЯ ИТОГ IAM (финальное ревью, 2026-10-04):**
  · **Публичный участник:** `allAuthenticatedUsers` разрешён ТОЛЬКО в политиках приложений проекта `catalog` и только с
    `roles/sw.applicationViewer`; в политике любого проекта и в приложениях других проектов → 400 FAILED_PRECONDITION (`reason:
    PUBLIC_MEMBER_NOT_ALLOWED`). Аналог best practice Google «запрещено везде, кроме явного исключения» (org policy
    Domain restricted sharing / Public access prevention — по памяти). Значение: любой вошедший через IdP + любой SA.
  · **IAM-методы на приложении — ВЕЗДЕ одинаковы** (юзер, 2026-10-04; как у Google: метод не выключается по родителю,
    ограничение — правило на СОДЕРЖИМОЕ, прецедент org policy Domain restricted sharing → FAILED_PRECONDITION):
    публичный участник вне приложений `catalog` → 400 FAILED_PRECONDITION `PUBLIC_MEMBER_NOT_ALLOWED`. Политика на
    приложении обычного проекта разрешена, но в v1 даёт только ЧТЕНИЕ (Get, `:search`): окружение берёт приложения
    только из своего проекта и `catalog` (межпроектного использования нет) — задокументировать.
  · **Политика приложения** учитывается ТОЛЬКО для прав `applications.*`/`builds.*` на этом ресурсе; на приложении можно
    выдать только `roles/sw.applicationViewer`/`roles/sw.applicationPublisher` (иное → 400 `UNKNOWN_ROLE`/role not
    supported). `applications.getIamPolicy|setIamPolicy` — только admin и applicationPublisher. Инвариант «последний
    admin» — только для политики проекта.
  · **Сервисные аккаунты:** связка хранит `uid` SA (повторное создание SA/проекта с тем же id не наследует старые
    гранты; удалённые — как Google `deleted:serviceAccount:…?uid=`); [ОТМЕНЕНО ИТОГ `projects`, 2026-10-08: id удалённого проекта переиспользуется (AIP-128), от наследования защищает только `uid`] ~~id удалённого проекта не переиспользуется~~;
    `setIamPolicy` проверяет существование SA; удаление SA/проекта каскадно чистит связки во всех политиках (с новым
    etag). `PATCH serviceAccounts/{sa}` (`displayName`, `updateMask`, `etag`) + право `sw.serviceAccounts.update`
    (AIP-148: `displayName` must be mutable). Ключи: `?serviceAccountKeyId=` OPTIONAL (AIP-133 MUST), `:enable` +
    право `serviceAccountKeys.enable`, срок — oneof `expireTime | ttl` (AIP-214), формат `swk_<keyId>_<random>` (keyId
    без `_`), поиск по keyId + `timingSafeEqual` по sha256, `lastUseTime` — не чаще раза в час, ≤10 ключей на SA,
    выключенный/просроченный/удалённый → 401 `unauthenticated`, пароль из URL маскируется в логах; SA-принципал без
    групп; SA с admin может выпускать себе ключи (как у Google, записано).
  · **Политика:** `version` 0/1/3 принимается (google.iam.v1 `options.proto:35-37`; Terraform шлёт 3), ответ `version: 1`;
    отвергается только `condition`. `testIamPermissions`: право не требуется; нет ресурса → пустой список; `*`/`sw.*` →
    400. etag — сильный (хэш канонической формы; иначе по AIP-154 нужен префикс `W/`). Прецедент GET у getIamPolicy —
    Secret Manager / Cloud Run v2 (у Compute плоский `optionsRequestedPolicyVersion`).
  · **ErrorInfo.reason:** `ETAG_MISMATCH` (409), `LAST_ADMIN_REQUIRED` (+`PreconditionFailure`), `UNSUPPORTED_POLICY_VERSION`,
    `UNKNOWN_ROLE`, `INVALID_MEMBER`, `PUBLIC_MEMBER_NOT_ALLOWED` (+`BadRequest.fieldViolations`), `IAM_PERMISSION_DENIED`.
  · **Права — добавки/правки:** `sw.platforms.{get,list}` (проектный реестр — НЕ глобальный; глобальные без прав —
    только `computeProviderTypes`, `storageProviderTypes`, `roles`); `sw.storageDestinations.{get,update}` (`delete` снят — AIP-156:
    синглтон «must not define … Delete»; `test` снят вместе с методом; сброс — `PATCH …?updateMask=*` `{}` — РЕШЕНО в
    ИТОГ storage; get — admin/developer/viewer, update — admin); `machines.update` — только если у машины остаётся PATCH (решить при сквозной
    сверке); [РЕШЕНО в ИТОГ tunnels: отдельных ключей туннеля нет]; `:download` у
    sessionLogs/Videos проверяет `.get`; `:search` приложений проверяет `sw.applications.get` на каждом элементе, шаблон
    пути `projects/*/…` (не хардкод `-`, AIP-159), имена в ответе канонические.
  · **Матрица ролей — выписать ПО КАЖДОМУ ПРАВУ** при реализации (сейчас словами; противоречие «viewer — все get/list»
    против «serviceAccounts/getIamPolicy — только admin» → viewer НЕ видит serviceAccounts(+keys),
    `projects.getIamPolicy`).
  · **Каталог-bootstrap:** конфиг `CATALOG_ADMIN_MEMBERS` — полные строки `Member` (`user:`/`group:`), битое → не
    стартуем, пустое → warn (каталог без издателей, законно); сверка под `with(catalogId, cb)`/FOR UPDATE, запись только
    при отличии (много инстансов; при rolling deploy побеждает последний); seed-приложения получают
    `allAuthenticatedUsers`, новые — явным `setIamPolicy`.
  · **Отклонения (записать):** id роли с заглавной (`applicationViewer`, AIP-122 SHOULD lowercase — как у Google
    `roles/iam.serviceAccountUser`); member — externalId, не email; нет `auditConfigs`/условий; нет пользовательских
    ролей; `GET /v1/roles` всегда полный вид.
  · [СДЕЛАНО] Поправлено в ИТОГ `environments` старые имена `roles/applicationViewer|applicationPublisher` → `roles/sw.*`.
- **[DESIGN] storage — разбор (2026-10-04), В РАБОТЕ.** Решено юзером:
  · **Каталог `storageProviderTypes/{t}`** (Get/List, глобальный, зеркально `computeProviderTypes`) вместо синглтона
    `storageDelegation` с инлайн-массивом `providers[]` (AIP-144); `grant` (наш SA + минимальный набор действий на ОДИН
    бакет, не `storage.editor` на фолдер) — в каталоге, не в настройке проекта (иначе производное).
  · **`projects/{p}/storageDestination`** — синглтон AIP-156: существует всегда (не настроено → 200 с пустыми полями,
    не 404), только Get/Update; `DELETE` снят, сброс — `PATCH ?updateMask=*` `{}` (прецедент KMS `EkmConfig`: «empty
    string removes»); `updateMask` (сейчас PATCH молча стирает `prefix` — баг); `etag` (наше правило «etag на всех
    PATCH-able»); `oneof` по типу хранилища без свободного `endpoint`/`region` (выводятся из типа; закрывает SSRF), в
    v1 только `yandexObjectStorage`, позже `amazonS3{region, roleArn, externalId (OUTPUT_ONLY, генерирует сервер —
    confused deputy)}`; `type` OUTPUT_ONLY; `bucket`, `prefix`; маркер владения — OUTPUT_ONLY (имя на ревью).
  · **`:test` УБРАН → `conditions[AccessVerified]`** (как `computeProviders`): проверка ставится в очередь СРАЗУ после
    PATCH (секунды, тот же воркер с LISTEN/NOTIFY), затем периодически; причины `GrantMissing | BucketNotFound |
    OwnershipProofMissing | NotCheckedYet`; пробная запись — только после подтверждения маркера и только при
    изменении настройки. Права `sw.storageDestinations.{get,update}` (`test` снят).
  · Ошибки New Session при `sw:logging`/`sw:video`: не настроено / не подтверждено → FAILED_PRECONDITION
    `STORAGE_DESTINATION_NOT_CONFIGURED` / `STORAGE_OWNERSHIP_UNVERIFIED` (сейчас ошибочно INVALID_ARGUMENT).
  · [РЕШЕНО — см. ИТОГ storage] имя поля маркера; вложенность oneof; раскладка ключей.
- **ИТОГ storage — ЗАКРЫТ (юзер, 2026-10-04; 2 финальных ревью).** Главнее пункта «storage — разбор» выше; уточнения — «УТОЧНЕНИЯ ИТОГ storage» ниже (главнее там, где расходятся).
  **Каталог `storageProviderTypes/{t}`** (глобальный, только Get/List с пагинацией, без прав — достаточно войти;
  зеркально `computeProviderTypes`): `name` (`storageProviderTypes/yandex-object-storage`), `title`, что выдать
  пользователю на ОДИН бакет — наш сервисный аккаунт + минимальный набор действий (`s3:PutObject`, `s3:GetObject`,
  `s3:AbortMultipartUpload` на `<bucket>/<prefix>/sw/*`; не `storage.editor` на фолдер). Форму требований свести с
  `computeProviderTypes` (там `oneof accessRequirements{yandexCloud{requiredGrants[], ownershipLabelKey}}`).
  Заменяет синглтон `storageDelegation` с инлайн-массивом `providers[]` (AIP-144).
  **`projects/{p}/storageDestination`** — синглтон AIP-156, существует всегда; методы Get / Update (PATCH) — `DELETE`
  нет (AIP-156 must not), кастомных методов нет:
  `name` IDENTIFIER · `type` OUTPUT_ONLY (`storageProviderTypes/…`, выводится из члена oneof) · `bucket` OPTIONAL
  (пусто = не настроено) · `prefix` OPTIONAL · плоский `oneof` по типу (как `computeProviders`; AIP-146 «least
  generic», прецеденты Cloud Deploy `Target`, BigQuery `Connection`): `yandexObjectStorage{ownershipObjectKey
  (OUTPUT_ONLY — ключ объекта, который пользователь кладёт в корень бакета как доказательство владения; проверяется
  только СУЩЕСТВОВАНИЕ — писать в бакет может лишь владелец, ключ уникален для проекта)}`; позже `amazonS3{region,
  roleArn, externalId (OUTPUT_ONLY, генерирует сервер — confused deputy)}` — свободных `endpoint`/`region` нет ·
  `conditions[]` OUTPUT_ONLY: `AccessVerified` — `TRUE` | `FALSE` (`GrantMissing` | `BucketNotFound` |
  `OwnershipProofMissing`) | `UNKNOWN` (`NotCheckedYet`); конкретика (ключ объекта, бакет) — в `message` · `etag`.
  PATCH — с `updateMask` (без маски = заполненные поля; `*` поддерживается), `etag` OPTIONAL. Сброс — `PATCH
  ?updateMask=*` `{}` (прецедент KMS `EkmConfig`); инвариант: пустой `bucket` ⇒ всё остальное пусто, иначе 400.
  **Проверка доступа:** фоновый реконсилер; ставится в очередь СРАЗУ после PATCH (LISTEN/NOTIFY, результат за секунды),
  затем раз в ~15 мин; порядок: маркер → пробная запись (запись только после подтверждения владения и только при
  изменении настройки). Загрузка артефакта проверяет владение (не только создание сессии).
  **Сценарий в UI (юзер: обратная связь как можно быстрее):** (1) «Сохранить» → ответ PATCH сразу содержит
  `AccessVerified: UNKNOWN / NotCheckedYet`; (2) воркер получает сигнал мгновенно (LISTEN/NOTIFY, без ожидания
  расписания) и за секунды пишет результат; UI коротко опрашивает `GET` (раз в 1–2 с, до ~30 с) и показывает `TRUE` или
  причину с подсказкой из `message` (`GrantMissing` / `OwnershipProofMissing` / `BucketNotFound`); (3) дальше —
  перепроверка раз в ~15 мин (заметить отозванный доступ). Пользователь исправил у себя в облаке (выдал доступ,
  положил объект) → повторный быстрый прогон по кнопке «Проверить снова» = `PATCH` без изменений? — НЕТ (AIP: PATCH
  без изменений ≠ проверка); вместо этого реконсилер перепроверяет FALSE-условия чаще (раз в ~30 с первые 10 мин после
  PATCH), так UI увидит исправление без отдельного метода.
  **Раскладка в бакете:** `<prefix>/sw/projects/<project.uid>/sessionLogs/<id>.log`,
  `…/sessionVideos/<id>.mp4` (рисунок CloudTrail/ELB: префикс клиента / корень вендора / владелец / вид / файлы;
  имена — как коллекции API; раздельные префиксы → разные сроки хранения правилами бакета). В записи артефакта —
  снимок назначения.
  **Ошибки:** формат/маска → 400 INVALID_ARGUMENT (`BadRequest`); New Session — см. ИТОГ `sessions`. Права `sw.storageDestinations.{get,update}`.
  **Отклонения/решения:** нет `uid`/`createTime`/`updateTime` (синглтон, не declarative-friendly); «не настроено» —
  пустые поля, не `state` (KMS EkmConfig/Autokey); reason `OwnershipProofMissing` — единый с `computeProviders`.
- **УТОЧНЕНИЯ ИТОГ storage (финальное ревью, 2026-10-04):**
  · **БЛОКЕР закрыт — права на маркер.** Маркер лежит в корне бакета, вне `<prefix>/sw/*`; расширять `PutObject` на него
    нельзя (мы сами смогли бы создать доказательство). Каталог: `oneof accessRequirements{yandexObjectStorage{
    requiredGrants[]}}` (зеркально `computeProviderTypes`), два элемента: `{serviceAccountId, actions: [s3:PutObject,
    s3:GetObject, s3:AbortMultipartUpload], objectKeyPattern: "{prefix}/sw/*"}` и `{serviceAccountId, actions:
    [s3:GetObject], objectKeyPattern: "{ownershipObjectKey}"}` (плейсхолдеры — в доке; конкретная политика проекта —
    в `message` условия). `s3:ListBucket` НЕ выдаём → отсутствующий маркер даёт 403, не 404 (по памяти, проверить на YC)
    → на этапе маркера одна причина `OwnershipProofMissing` с обеими возможностями в `message`; `GrantMissing` — только
    после подтверждённого маркера, когда упала пробная запись.
  · **Пробная запись** — внутри раскладки: `<prefix>/sw/projects/<project.uid>/.probe` (не `.sw-connectivity-check`
    в корне — вне гранта, ложный GrantMissing).
  · **Инвариант ключей в домене + тест:** любой наш ключ записи содержит `sw/projects/<uid>/`, ключ маркера — один
    сегмент без `/` и не начинается с `sw/`; маркер проверяется точным HEAD/GET, не ListObjects. Валидация `bucket`
    (S3: 3–63, `[a-z0-9.-]`), `prefix` (без ведущего/замыкающего `/`, без `..` и пустых сегментов, лимит длины).
  · **Условие привязано к версии настройки:** PATCH в той же транзакции сбрасывает `AccessVerified` в `Unknown/
    NotCheckedYet`; условие хранит отпечаток проверенной настройки, запись результата — условная (проверка старой
    версии не перетирает новую); дедупликация по проекту (`FOR UPDATE SKIP LOCKED`/advisory-lock, много воркеров);
    5xx/таймаут провайдера → причина `CheckFailed` (не False), повтор с backoff. Постановка проверки после PATCH —
    реконсиляция, не побочный эффект Update (как `computeProviders`, AIP-134:121).
  · **Загрузка артефакта:** только при `True` для ТЕКУЩЕЙ версии + живой HEAD маркера (1 запрос на артефакт); иначе
    артефакт не создаётся, метрика `sw_artifact_dropped_total{reason}`. Снимок назначения `{type, bucket, prefix}` в
    записи артефакта; чтение — по снимку, с проверкой маркера по снимку. Отдача артефакта: фиксированный
    `Content-Type`, `X-Content-Type-Options: nosniff` (не доверять типу из бакета).
  · **Маска (AIP-134/203):** присутствие члена oneof (даже пустого `yandexObjectStorage{}`) считается заполнением;
    инвариант двусторонний: непустой `bucket` ⇔ задан ровно один член; пути OUTPUT_ONLY-полей в маске ИГНОРИРУЮТСЯ
    (`0203.md:139` must ignore), 400 — только на несуществующие пути (`0161.md:151`).
  · **etag** считается только по полям пользователя (`bucket`, `prefix`, член oneof), не по `conditions` — иначе
    реконсилер ломал бы read-modify-write ложным ABORTED (`0154.md:24` разрешает); формат в кавычках (RFC 7232).
  · **Условия:** у ненастроенного `conditions: []`; статусы — `True|False|Unknown` (k8s, как у `computeProviders`;
    открытый общий вопрос о форме условия — PLAN «status как tri-state»); у True reason `Verified`;
    `lastTransitionTime`.
  · **Ресурс:** `type` с `resource_reference{type: StorageProviderType}`; `google.api.resource` `singular:
    storageDestination`, `plural: storageDestinations` (`0156.md:60` must); формат `ownershipObjectKey` документировать
    — стабилен (из `project.uid`), не меняется при сбросе/перенастройке (асимметрия с `ownershipLabelKey`: тот задаёт
    тип — живёт в каталоге, этот свой у проекта — на ресурсе).
  · Ошибки New Session при `sw:logging`/`sw:video` и неготовом хранилище — правило СЕССИЙ, перенесено в ИТОГ
    `sessions` (ошибки); здесь — только статус `AccessVerified`, на который оно опирается.
  · **P1, не блокируют (→ [SECURITY] аудит / реализация):** лимиты размера лога/видео и частоты на проект (иначе мы
    бесплатный писатель в чужой бакет); бакет с SSE-KMS — нашему SA нужна роль на ключ (условное требование в каталоге +
    отдельное сообщение); доку: lifecycle-правила отдельно на `sessionLogs/`/`sessionVideos/` +
    `AbortIncompleteMultipartUpload`; объекты удалённого проекта остаются в бакете клиента — мы их не чистим.
  · Устарело: «не настроено → 404» и `DELETE` в ранней истории storage; `sw.storageDestinations.test` в IAM.
- **ИТОГ tunnels (бывш. NetBridge) — ЗАКРЫТ (юзер, 2026-10-04; 2 финальных ревью, уточнения ниже).** `netBridge` (бренд) → `tunnel` (отрасль:
  Sauce `tunnelName`, BrowserStack `localIdentifier`) ВЕЗДЕ: ресурс `tunnels`, права `sw.tunnels.*`, капа `sw:tunnel`, CLI
  `sw-tunnel`, пакеты `@sw/tunnel` / `@sw/tunnel-cli`, `/internal/netbridge:download` → `/internal/tunnelForwarder:download`.
  **Ресурс `projects/{p}/tunnels/{tunnel}`** — существует, пока CLI подключён (создаёт сервер при подключении,
  исчезает при отключении; Create нет — AIP-121 требует минимум Get/List; прецеденты Cloud Run revisions, Sauce tunnels):
  `name` IDENTIFIER (id задаёт CLI, AIP-122 `[a-z0-9-]`, по умолч. `default`) · `connectTime` · `principal` (кто
  подключил: `user:`/`serviceAccount:`) · `shared` (bool) · `clientVersion` — всё OUTPUT_ONLY; без `state` (существование
  и есть состояние), без `uid`/`etag` (не декларативный). Методы: Get, List (pageSize/pageToken/totalSize), Delete
  (принудительно отключить → `{}`).
  **Подключение** (data plane, wd; AIP-136 не применяется): WS `wss://<wd>/v1/projects/{p}/tunnels/{t}:connect
  [?replace=true][&shared=true]`, вход — `Bearer`/`Basic` ключом сервисного аккаунта или личным ключом пользователя [уточнено 2026-10-08], право
  `sw.tunnels.connect`. Имя занято → 409 ALREADY_EXISTS; CLI при СВОЁМ переподключении шлёт `replace=true` (юзер: не пул —
  иначе разные сети под одним именем; пул — позже явным флагом). Forwarder в окружении — `…/tunnels/{t}:forward` с
  пропуском сессии (не голое «agent»). Только `wss` (CLI отказывается от `ws://` к не-loopback).
  **Ключи — одна система с IAM (юзер, как у Google: у IAP-туннелей нет своих ключей):** отдельный ресурс
  `netBridgeCredentials`/`tunnelKeys`, его права и префикс `swnb_` УБРАНЫ; CI — сервисный аккаунт с ролью
  `roles/sw.tunnelUser` (`sw.tunnels.connect`, `sw.tunnels.get`, `sw.projects.get`). Отзыв/выключение ключа рвёт уже
  открытый туннель (перепроверка раз в ~60 с).
  **Кто пользуется туннелем (юзер, как Sauce):** по умолчанию ПРИВАТНЫЙ — им ходят только сессии того же `principal`,
  что подключил; `shared=true` при подключении открывает его сессиям любого участника проекта с `sw.tunnels.use`.
  Права: `sw.tunnels.{get, list}` — admin/developer/viewer; `connect`, `use`, `delete` — admin/developer.
  **Сессия:** капа `sw:tunnel: "<имя>"` (наличие = ходить через туннель) заменяет `sw:netBridge: true`. Туннель не
  подключён / нет доступа (приватный чужой, нет `sw.tunnels.use`) → 400 `session not created` с причиной в `message`.
  Обрыв посреди сессии — сессия живёт, новые соединения через прокси отклоняются, CLI переподключается (`replace`),
  работа восстанавливается.
  **Привязка к сессии (P0, сейчас дыра):** forwarder открыт не всему окружению, а только сессии с `sw:tunnel`:
  control plane выдаёт сессии подписанный пропуск (TTL, `project`, `tunnel`, `session`); локальный прокси в окружении
  (терминирует `wd-door`/агент — Chrome не умеет SOCKS-auth) требует его; на DELETE сессии пропуск гаснет.
  **Политика выхода у CLI:** по умолчанию всё (как BrowserStack) + проверка по ИТОГОВОМУ IP (link-local, метаданные
  облака, IPv4-mapped закрыты), `--allow`/`--deny` с CIDR и масками, явное предупреждение «весь трафик браузера идёт
  через вашу сеть»; для CI рекомендовать `--allow`.
  **Доставка:** контракт «loopback-прокси туннеля в окружении, активный только для сессии с `sw:tunnel`» обязан
  выполнить каждый адаптер (docker — есть; VM, k8s, слоты машин — нет). Капу применяет `wd-door` по браузеру: Chrome/Edge
  `--proxy-server` + `<-loopback>`; Firefox — `network.proxy.*` (socks, `socks_remote_dns`,
  `allow_hijacking_localhost`). Android в v1 НЕ поддерживается — `sw:tunnel` там → 400 (не молча).
  **Эксплуатация:** реестр туннелей — общий для инстансов wd (строка в Postgres с lease + брокер/sticky по
  `project+tunnel`; сейчас в памяти одного процесса — противоречит «design for many workers»); лимиты (каналы, байты/с,
  туннели на проект, rate limit на 401); журнал метаданных на CP (project, tunnel, session, host:port, байты — без
  содержимого). Баги сейчас: два CLI одного проекта вытесняют друг друга (`attachClient`); `hasClient` не используется
  (сессия с туннелем создаётся без туннеля); срок/отзыв ключа проверяется только при подключении; правило выхода —
  строковое (обходится резолвом в 169.254.x.x); демо-ключ на проде — отозвать.
- **УТОЧНЕНИЯ ИТОГ tunnels (2 финальных ревью, 2026-10-04) — главнее ИТОГ tunnels там, где расходятся.**
  · **БЛОКЕР закрыт — перехват через `replace`:** при подключении сервер выдаёт CLI одноразовый resume-токен; `replace`
    принимается только с ним (иначе 409 `TUNNEL_NAME_IN_USE`) — так ни чужой участник, ни второй CI-джоб на том же SA не
    вытеснит туннель; забрать имя чужого — сначала `DELETE` (право `sw.tunnels.delete`). Пропуск сессии привязан к
    конкретному ПОДКЛЮЧЕНИЮ (creator + поколение подключения): при замене туннеля новые каналы старых сессий
    отклоняются, а не уезжают в чужую сеть. Для CI в доке — уникальное имя на запуск, не `default`.
  · **Пропуск сессии — как работает:** его предъявляет forwarder на `:forward` (браузер его не видит; Chrome не умеет
    SOCKS-auth); wd проверяет офлайн на каждый Open-фрейм канала: подпись, `exp` (~60 с, продление в ответе хартбита,
    пока сессия жива), `env` пропуска = `env` из токена окружения (защита от переноса в другое окружение); `:forward`
    требует токен окружения И пропуск. Плечо «браузер → loopback» без аутентификации, поэтому: прокси «взведён» только
    на время сессии и гасится на ЛЮБОМ её конце (DELETE, idle-таймаут, падение ноды); `wd-door` отклоняет
    пользовательские proxy-капы/`--proxy-server`, указывающие на порт туннеля. На общих хостах (слоты машин — общий
    loopback, порт виден чужим проектам) контракт адаптера: отдельный netns на окружение ИЛИ отдельный uid на слот +
    `iptables -m owner`; пока этого нет — `sw:tunnel` на слотах → 400 (unix-сокет не годится — Chrome не принимает).
  · **DNS-rebinding:** CLI соединяется ровно с проверенным IP (свой resolve, проверка всех A/AAAA, connect по адресу);
    в запрете также `0.0.0.0/8`, `::`, NAT64 `64:ff9b::/96`, 6to4, metadata IPv6 `fd00:ec2::254`; числовые/восьмеричные
    формы адреса нормализуются до проверки.
  · **«Тот же создатель»:** поле `principal` → **`creator`** (как Cloud Run `Revision.creator`; значение — строка
    `Member`), сравнение — точная строка `Member` (`user:`/`serviceAccount:`, группы не в счёт; SA — по `uid`, как в
    УТОЧНЕНИЯХ IAM); туннель пользователя ≠ сессия SA (для этого `shared`). Право `use` проверяется ВСЕГДА, и у владельца.
    CI-рецепт: SA с `roles/sw.tunnelUser` + `roles/sw.developer` (роли раздельные; `tunnelUser` НЕ включает
    `sessions.create`); `tunnelUser` = `connect` + `use` + `get` (CLI читает свой туннель) + `projects.get`. Перепроверка
    раз в ~60 с — ключ и право `connect` (вход по ключам, не по токену IdP — см. ИТОГ wd-auth). Зависимость: баг IAM (7).
  · **`DELETE` при живых сессиях:** закрытие отдельным WS close-кодом «deleted» — CLI завершается и НЕ
    переподключается (отзыв ключа/права — тот же код + 401/403 при новом подключении); сессии живут, новые каналы
    отклоняются.
  · **Ошибки `:connect`** (путь в стиле AIP → до WS-upgrade формат AIP-193 с `ErrorInfo`): `TUNNEL_NAME_IN_USE` (409),
    `IAM_PERMISSION_DENIED` (403, «or it might not exist»), `INVALID_TUNNEL_ID` (400). Отказы New Session (W3C, причина в
    `message`): `TUNNEL_NOT_CONNECTED`, `TUNNEL_ACCESS_DENIED`, `TUNNEL_NOT_SUPPORTED` (Android/слоты без изоляции).
  · **id туннеля:** `^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$` (AIP-122), иное → 400, без молчаливой нормализации.
  · **List:** `filter` (`creator="…"`, `shared=true` — «мои/общие»), `totalSize` после фильтра, порядок — по `connectTime`.
  · **Несколько инстансов wd:** lease-строка с поколением (fencing — инстанс, не продливший lease, сам перестаёт
    ретранслировать), адрес владельца + пересылка между инстансами (не sticky-хэш LB); просроченные lease в Get/List не
    видны, имя освобождается по TTL (~30 с) или через resume-токен.
  · Записать как осознанное: viewer видит `creator` чужих туннелей (как Cloud Run); developer может отключить чужой
    приватный туннель (`delete`).
- **ИТОГ internal-контур агентов — ЗАКРЫТ (юзер, 2026-10-04..08; финальные ревью; уточнения — «УТОЧНЕНИЯ ИТОГ internal», «ИТОГ wd-auth» и далее).** Решено юзером:
  · **Канонические имена + `/v1` на internal-хосте** (AIP-122 `0122.md:196`: у сервиса может быть приватная точка
    входа, имена ресурсов те же): `https://internal…/v1/projects/{p}/environments/{e}:…`,
    `…/v1/projects/{p}/computeProviders/{cp}/machines/{m}:…` вместо `/internal/environments/{uuid}`,
    `/internal/machines/{uuid}`; в ответах — полные имена, не голые `uid`.
  · **Один глагол `:sync` для обоих агентов** (оба — цикл согласования: наблюдаемое → желаемое): у окружения
    `:heartbeat` → `:sync`; словарь тел — по решениям (`occupancy`, `detected*`, `environmentAgentToken`, без голого
    «agent»).
  · **`wd-door` → `webdriver-relay`** (термин Selenium Grid 4 «Relay» — нода, ретранслирующая во внешний WebDriver-
    сервис/Appium; `node`/`agent`/`proxy`/`gateway`/`sidecar` заняты или неточны); переменные `SW_DOOR_*` → `SW_RELAY_*`.
  · **Каталог `components/{component}` с версиями** (прецедент Artifact Registry `packages/*/versions/*` + `files:download`,
    проверено по discovery): `components/{c}` {name, title, latestVersion}; `components/{c}/versions/{v}` {name, createTime,
    files[]{architecture AMD64|ARM64, sizeBytes, sha256}}; `GET …/versions/{v}:download?architecture=…` → байты (HttpBody —
    отклонение от SHOULD «…Response», как `sessionLogs:download`). Версия неизменяема (пин, кэш); `machine:sync` отдаёт
    нужную версию + sha256, агент сверяет. Анонимно — только `machine-installer` (отклонение в IAM, записать). id:
    `environment-agent`, `machine-agent`, `machine-installer`, `tunnel-forwarder`, `linux-node`, `webdriver-relay`, `ffmpeg`.
  · **Логи и видео — одна механика, байты у нас НЕ хранятся** (юзер: миллионы сессий × МБ — не в Postgres): ресурс
    `sessionLog`/`sessionVideo` создаётся при New Session (`state` RUNNING → SUCCEEDED | FAILED, `sizeBytes`, `finishTime`;
    id = несекретный id сессии) вместе с S3 multipart-загрузкой; агент окружения по ходу сессии берёт подписанную ссылку на
    часть (`POST …/sessionLogs/{id}:allocatePart {partNumber}` → `{uploadUri, expireTime}`), кладёт часть (≥5 МБ, последняя
    любая) НАПРЯМУЮ в бакет пользователя, в конце `:finalize {parts[]}`; в БД — только `uploadId` и etag'и частей; CP
    байтов не видит. Окружению разрешается выход ровно к хосту хранилища. Живой просмотр лога — `GET
    …/sessionLogs/{id}:tail` (серверный поток, SSE): CP проксирует в окружение, где агент держит лог локально (как
    `kubectl logs -f` через kubelet), ничего не оседает. Видео вживую не смотрим (есть VNC). Окружение умерло — сохраняется
    до последней части, `FAILED`; брошенные загрузки — `AbortMultipartUpload` реконсилером + правило бакета. Лимиты размера.
    `/upload/` не нужен.
  · **Proto СРАЗУ (юзер):** соединение машины — двунаправленный gRPC-поток `ConnectMachine(stream) returns (stream)` без
    промежуточного WebSocket; по AIP-127 рядом остаётся unary `:sync`. Долгий поток: без дедлайна у клиента, keepalive,
    прикладной `sync` в потоке каждые ~15 с (HTTP/2 PING не сбрасывает `stream_idle_timeout` Envoy, по умолч. 5 мин),
    на роуте `timeout: 0`, `max_connection_age` ~45 мин + GOAWAY и переподключение; соединение держит один инстанс (lease с
    поколением), остальные пересылают ему трафик; слоты мультиплексируются кадрами протокола туннелей + новый кадр
    `Credit` (поканальное окно — иначе медленный VNC блокирует WebDriver; касается и туннелей). `machine-agent` → бинарь на
    Go (статический, amd64/arm64, без рантайма; как `tunnel-forwarder`), по правилам архитектуры из CLAUDE.md «Агенты и
    прочие компоненты вне control plane». Агент окружения — REST через транскодирование (`:sync`, `:allocatePart`,
    `:finalize`).
- **[NAMING] `Build` → `ApplicationBuild` (юзер, 2026-10-08; ревью):** по AIP-122 «Nested collections» (`0122.md:85-107`)
  коллекция сокращается (`…/applications/{a}/builds/{b}` — путь НЕ меняется), но «the _message_ and _resource type_ are
  still called `UserEvent`» → тип/сообщение `ApplicationBuild` (`singular: applicationBuild`, `plural:
  applicationBuilds`); поля-ссылки по `0122.md:301` — по имени сообщения: элемент окружения `application`,
  `applicationBuild` (OPTIONAL), `effectiveApplicationBuild` (OUTPUT_ONLY); метаданные сессии, `sessionLogs`,
  `sessionVideos` — `applicationBuild`; капа `sw:applicationBuildUrl`. Довод: «build» у BrowserStack/Sauce в капах =
  группа тестовых прогонов, у нас — сборка golden-образа, `docker build`, варка CfT (AIP-140 «avoid overly general
  names»). Действует во ВСЕХ ИТОГ-блоках: голое поле `build` там читать как `applicationBuild`.
- **Совместный доступ к чужой сессии (`sw:shared`) — НЕ делаем в v1 (юзер, 2026-10-08):** сессией пользуется только её
  создатель; вернуться позже (модель — как `shared` у туннелей + `sw.sessions.use`).
- **УТОЧНЕНИЯ ИТОГ internal (2 финальных ревью, 2026-10-07..08) — главнее ИТОГ internal там, где расходятся.**
  · **Аутентификация internal-методов** — токенами окружения/машины, НЕ IAM (прав `sw.*` у них нет); `sub` токена
    сверяется с ДЕКОДИРОВАННЫМ `name`, fail-closed; токен окружения пускает только к `sessionLogs`/`sessionVideos`, у
    которых `environment` = его окружение; на публичном `api` эти методы не отвечают. В контракт добавить
    `RegisterMachine` (`…/machines/{m}:register`: одноразовый токен регистрации → токен машины + `generation`).
  · **Имена методов (AIP-136/140):** `SyncEnvironment`, `SyncMachine`, `RegisterMachine`, `ConnectMachine`;
    `:allocatePart` → `GenerateSessionLogUploadUrl` (`…/sessionLogs/{id}:generateUploadUrl`, прецедент Cloud Functions);
    `uploadUri` → `uploadUrl` (AIP-140 «url»); `CommitSessionLogPart` (`:commitPart {partNumber, etag, sizeBytes}` — агент
    подтверждает часть СРАЗУ после загрузки → при смерти окружения есть что собрать, права на бакет не расширяются);
    `FinalizeSessionLog` (`:finalize` → сам ресурс, AIP-216); то же для видео; `TailSessionLog`;
    `DownloadComponentVersion`. Сообщения `…Request`/`…Response`. Все поля, `field_behavior` и `ErrorInfo.reason` —
    выписать при переводе в proto.
  · **Подписанные ссылки на части ограничены:** только при `state=RUNNING` и сессии этого окружения; `partNumber` ≤
    лимита (из лимита размера); агент объявляет `sizeBytes`, CP подписывает `host;content-length` и считает сумму против
    квоты проекта; срок ~10 мин (не дефолт; у YC до 30 дней). `CompleteMultipartUpload` делает ТОЛЬКО CP (по
    подтверждённым частям; размер после — HEAD). Лог < 5 МБ к смерти окружения не сохраняется (ни одной полной части) —
    `FAILED` без байтов, записать. `EntityTooSmall` при Complete → `FAILED`, не 500.
  · **Выход окружения к хранилищу:** хост хранилища общий для всех бакетов → открыт ТОЛЬКО процессу агента
    (отдельный пользователь + `iptables -m owner` в netns окружения); всем процессам закрыты 169.254.169.254 и сеть CP;
    для слотов машин части может грузить `machine-agent`. Политику выхода окружений записать явно (браузеру нужен
    интернет до тестируемого сайта).
  · **`ConnectMachine` без обрывов:** плановое пересоздание — «новое до закрытия старого» (агент открывает новый поток,
    новые каналы идут в него, старые доживают в `max_connection_age_grace`) или lease + drain при деплое вместо
    `max_connection_age`. Lease на уровне инстанса (не машины) + маппинг машина → инстанс; fencing поколением на КАЖДОЙ
    записи из потока; пересылка между инстансами — только mTLS, `Credit` проходит через лишний хоп; backoff с full
    jitter, `RESOURCE_EXHAUSTED` + `RetryInfo`, поэтапный drain. Первый кадр несёт `name`, токен — в metadata.
  · **`:tail` — публичный `api`** (право `sw.sessionLogs.get`, GET; SSE — записанное отклонение от транскодированного
    server-streaming): один апстрим на лог в CP, раздача читателям, лимит читателей на лог/проект; апстрим к окружению
    — через поток машины или internal-канал с аутентификацией CP (не открытый слушатель агента — повтор бага wd-door);
    у агента кольцевой буфер с лимитом (tmpfs с квотой); SSE-комментарии раз в ~15 с (idle Envoy); окружение умерло —
    поток закрывается с итоговым `state`.
  · **Согласование с ИТОГ `sessions`:** у `sessionLog`/`sessionVideo` — `state` (`STATE_UNSPECIFIED | RUNNING |
    SUCCEEDED | FAILED`, OUTPUT_ONLY), `finishTime`; `:download` при `RUNNING` → 409 FAILED_PRECONDITION
    `SESSION_LOG_NOT_FINISHED`, при `FAILED` — собранное; «артефакт появляется атомарно после конца сессии» — устарело;
    id = несекретный UUID сессии (НЕ W3C `sessionId`); видео — fragmented MP4 (обрезанный файл проигрывается).
  · **Каталог компонентов:** в список глобальных каталогов IAM; анонимно — только `machine-installer` (отклонение в
    IAM); остальное — токены агентов; `Architecture { ARCHITECTURE_UNSPECIFIED, AMD64, ARM64 }`, обязательный
    параметр `:download`; `latestVersion` — полное имя + `resource_reference`; формат id версии (semver) и `sha256` (hex)
    задокументировать; подписанный манифест (ключ вшит в `machine-installer`/`machine-agent`), минимальная версия против
    отката; неизменяемость версии — ограничением в БД.
  · **`SyncEnvironment`:** в ответе `tunnelPass{token, expireTime}` и ротация `environmentAgentToken`; в запросе
    монотонный `sequence`; endpoint слотов вычисляет CP.
  · **`machine-agent` на Go** (правило CLAUDE.md «Агенты…»): конфиг 0600, каталог состояния 0700 под отдельным
    пользователем, токен не в argv; группа `docker` = root (записать); обновление — отдельный use case за портом:
    скачать в `state/versions/<v>`, проверить sha256 и подпись, атомарно переключить symlink, перезапуск systemd; нет
    успешного `sync` за N с — откат на предыдущую; версию пинит CP, даунгрейд только явный.
  · **Миллионы сессий:** строки логов/видео — части jsonb-массивом в строке; разбивка по дням, удаление старых по TTL
    (согласовать с lifecycle бакета; объект удалён правилом → `:download` 404); частичный индекс `WHERE state='RUNNING'`
    для реконсилера; `AbortMultipartUpload` батчами; правило бакета `AbortIncompleteMultipartUpload` не короче
    максимальной длины сессии.
  · **Устаревшее пометить при сквозной сверке:** `/internal/environments/…/sessionLogs`, `:uploadSessionLogs/Video`,
    `:heartbeat`/`heartbeat-agent.sh`, `wdDoor:download`, `wd-door` (→ `webdriver-relay`), «ответ хартбита» (→ `:sync`),
    `/internal/tunnelForwarder:download` (→ `components/tunnel-forwarder/versions/{v}:download`).
- **ИТОГ wd-auth — аутентификация КАЖДОЙ W3C-команды — ЗАКРЫТ (юзер, 2026-10-08; 3 ревью + 2 исследования).** Как в мире W3C
  (Sauce/BrowserStack/LambdaTest/Grid: долгоживущий отзываемый ключ в URL хаба, стоковые клиенты шлют его на каждом
  запросе — проверено по Selenium Python `remote_connection.py`, Grid `RouterServer` `BasicAuthenticationFilter`):
  · **Чем входит W3C-трафик: ТОЛЬКО ключи** — личный ключ пользователя или ключ сервисного аккаунта (CI); `Basic`
    (ключ в поле пароля, `https://user:swk_…@wd…`) или `Bearer`. Токен входа IdP (OIDC, ~5 мин, стоковые клиенты не
    обновляют) на `wd` в v1 НЕ принимается (отложено: «сессия по токену входа для коротких локальных прогонов»; `sw login`
    по образцу `gcloud auth application-default login`; обмен OIDC-токена CI на временный ключ, как GH Actions → AWS).
  · **Личные ключи пользователя** (модель Sauce/GitHub PAT; у Google личных ключей нет — там OAuth refresh, но стоковые
    WebDriver-клиенты обновлять не умеют): ресурс `users/{user}/accessKeys/{accessKey}` в `api` строго по AIP —
    Create (`?accessKeyId=` OPTIONAL; `displayName`; срок — oneof `expireTime | ttl`, AIP-214), Get, List (пагинация),
    Update (`displayName`, `updateMask`), Delete (отзыв → `{}`); `secret` (`swk_…`) OUTPUT_ONLY и ТОЛЬКО в ответе Create
    (прецедент `ServiceAccountKey.private_key_data`), хранится хэш; `createTime`, `expireTime`, `lastUseTime`. Ключ даёт
    ровно права владельца в IAM на момент запроса (без своей роли). Пользователь управляет своими; админ инсталляции
    может отозвать чужой. Родитель `users/{user}`: Get (`users/me` — алиас AIP-122, ответ с каноническим именем; поля
    `name`, `displayName`), List — только с правом `sw.users.list` (админы инсталляции; иначе 403 — AIP разрешает
    авторизовать List правом).
  · **Проверки на каждой команде и WS-подключении:** (1) учётка (ключ) → иначе 401 `unauthenticated` +
    `WWW-Authenticate: Basic`; (2) подпись/расшифровка id сессии → иначе 400 `invalid argument`; (3) вызывающий =
    создатель сессии (точная строка `Member`, SA по `uid`) → иначе 404 `invalid session id` (не раскрываем
    существование); (4) право `sw.sessions.use` (admin/developer) — ВСЕГДА, и у создателя (снятая роль сразу
    останавливает его сессии) → иначе 403 `permission denied`.
  · **Производительность:** проект/создатель/uid сессии — в AEAD-id (`{v, kid, endpoint, wdSessionId, projectUid,
    sessionUid, creator}`) → на горячем пути БД нет; кэш на инстансе `wd`: ключ → {хэш, владелец, состояние},
    (учётка, проект) → разрешение, TTL ~60 с; отзыв ключа/роли — `NOTIFY` из БД сбрасывает кэш на всех инстансах
    почти мгновенно, TTL — подстраховка. Оценка: ~10–100 мкс на команду при команде 5–100+ мс (< 1–2 %).
  · **WebSocket BiDi/CDP:** стоковые клиенты туда учётку, вероятно, не шлют (проверить на живых Selenium Java/Python,
    WebdriverIO) → если `Authorization` пришёл — полная проверка; иначе узкий тикет в возвращаемом URL
    (`webSocketUrl: wss://wd…/session/{id}?ticket=…`, то же для `sw:cdp`): AEAD `{sessionUid, projectUid, creator,
    credentialRef, purpose: bidi|cdp, exp}`, годен только для своего протокола и сессии, перепроверка раз в ~60 с,
    маска логов на `?ticket=`.
  · **Вьюер `sw:interactive`** = страница дашборда `https://app…/projects/{p}/sessions/{uid}/interactive` (секрета в
    URL нет); человек входит обычным логином, BFF вызывает `POST /v1/projects/{p}/sessions/{uid}:generateAccessToken` →
    `{accessToken, expireTime}` (прецедент Cloud Workstations `:generateAccessToken` + `workstations.use`), одноразовый,
    ~60 с, `purpose: vnc`; noVNC передаёт его в `Sec-WebSocket-Protocol` (не в URL). Сырой `sw:vnc` — по `Authorization`.
  · `GET /status` — анонимный (статичный `{ready, message}`, лимит частоты); `sw/alive` — с полной проверкой.
  · Совместный доступ к чужой сессии (`sw:shared`) — НЕ в v1.
- **УТОЧНЕНИЯ ИТОГ wd-auth / sessions / accessKeys (финальное ревью, 2026-10-08):**
  · **Секрет ключа** содержит СЕРВЕРНЫЙ глобальный `uid` ключа (`swk_<uid>_<random>`), а не `{accessKey}` из имени —
    иначе пользовательские id ключей разных пользователей и SA столкнутся (поиск по ключу секрета).
  · **Админ инсталляции** = break-glass-оператор: конфиг `INSTALLATION_ADMIN_MEMBERS` (полные строки `Member`, тот же
    bootstrap, что у каталога) — записанное отклонение «гейт по конфигу, не IAM-право» (у `users` нет родителя, на
    котором выдать роль). Может: `GET /v1/users` (List), Get чужого `users/{u}`, Delete чужого ключа; остальным → 403
    (AIP-211). Свои ключи и `users/me` — без права, достаточно войти. Право `sw.users.list` не вводим (выдать негде).
  · **`users/{user}`:** id — серверный, формат `[a-z0-9-]` (AIP-122), не externalId; OUTPUT_ONLY `member`
    (`user:<externalId>`, как у SA); подпись — `displayName` приходит из IdP и неизменяема у нас → по нашему правилу
    `title` (AIP-148: displayName must be user-settable). Ответы через `users/me` — с каноническим `name`.
  · **Ключи:** комментарий поля `secret` — «Output only. Populated only in the Create response» (прецедент
    `ServiceAccountKey.private_key_data`; AIP-147 — только для секретов, задаваемых пользователем); `:disable`/`:enable`
    и лимит ≤10 на пользователя — как у ключей SA.
  · **Сессия:** `state` — `STATE_UNSPECIFIED | ACTIVE | ENDED` (двухзначный — оставить ради фильтра и единообразия с
    `sessionLog.state`, записать по AIP-216 «When to avoid states»); `endReason` с `END_REASON_UNSPECIFIED`; одно имя
    времени окончания — `endTime` и у сессии, и у `sessionLog`/`sessionVideo` (вместо `finishTime`); List — фильтр
    `creator=` («мои»), порядок по `createTime` desc, `totalSize`; одна общая константа хранения: TTL строк
    логов/видео ≥ TTL сессий. Права `sw.sessions.{get,list}` → admin/developer/viewer, `use` → admin/developer
    (в матрицу ролей; в список прав IAM `sessions {create, get, list, use}`; `tunnelUser` `use` сессий не получает).
  · **`:generateAccessToken`** — право `sw.sessions.use` + проверка создателя (как `workstations.use`);
    `:accessSession` в ответе дополняется полем `session`. 404 от wd для не-создателя против 403 от `:accessSession` —
    различие плоскостей (W3C не раскрывает существование; AIP-211 — 403), записать.
  · **Тикет WS:** `exp` = до конца жизни сессии + перепроверка `credentialRef`; переписанный `se:cdp` тоже с тикетом
    (иначе обход). Капа `sw:sessionUid` — в список ответа New Session; рассмотреть `sw:sessionUrl` (полный URL).
  · **Туннели:** `:connect` — ключом SA ИЛИ ЛИЧНЫМ КЛЮЧОМ пользователя (не токеном IdP); перепроверка раз в ~60 с — ключ
    и право `connect`. OIDC-вход для CLI — вместе с `sw login`, позже.
- **ИТОГ `projects` — ЗАКРЫТ (юзер, 2026-10-08; 2 ревью + проверка прецедентов break-glass + 2 финальных ревью; уточнения — «УТОЧНЕНИЯ ИТОГ `projects`» ниже, главнее там, где расходятся).**
  Главнее пунктов о проектах выше (п.«`{resource}_id` … ПРОЕКТЫ СДЕЛАНЫ», «Follow-up: удаление проекта», проектные пункты ИТОГ IAM).
  ```
  POST   /v1/projects?projectId=team-a  {"displayName":"Team A"}          → Project
  GET    /v1/projects/{project}                                            → Project
  PATCH  /v1/projects/{project}?updateMask=displayName  {"displayName":"…","etag":"…"} → Project
  DELETE /v1/projects/{project}                                            → {}
  GET    /v1/projects:search?pageSize=&pageToken=                          → {projects[], nextPageToken}
  GET    /v1/projects/{project}:getIamPolicy · POST …:setIamPolicy · POST …:testIamPermissions  (как в ИТОГ IAM)
  Project = {name:"projects/team-a", uid, displayName, etag, createTime, updateTime}
  ```
  · **`projectId` — REQUIRED, в query, не в теле** (AIP-133 `0133.md:161` «The `{resource}_id` field **must** exist on the
    request message, not the resource itself»; прецедент Resource Manager `CreateProjectRequest`: «Project ID is required»).
    Каноническое имя всегда `projects/{projectId}`; **uid как алиас в URL УБРАН** (одно имя на понятие; `uid` — OUTPUT_ONLY,
    внутренний хэндл AEAD-id сессий, ключей объектов в бакете, связок SA). Существующим проектам без id — миграция с
    выдачей id. Формат — AIP-122 `0122.md:133-136`: `^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$` (сейчас пропускается хвостовой `-`);
    uuid-форма запрещена. Зарезервирован `catalog` (создаёт только bootstrap): пользовательский create → 400
    INVALID_ARGUMENT `reason: RESERVED_RESOURCE_ID` (иначе окно «занять `catalog` до первого boot» = подмена каталога).
  · **Ошибки create:** повтор id → **409 ALREADY_EXISTS** `RESOURCE_ALREADY_EXISTS` (AIP-133 `0133.md:174` MUST; сейчас
    ABORTED — баг: отдельная `AlreadyExistsError`, `ABORTED` только `ETAG_MISMATCH`); гонка двух create (unique
    violation 23505 → сейчас 500) маппится в data source в тот же 409. Создают только люди: SA → 403.
  · **Update:** только `displayName` (AIP-148 `0148.md:41` «**must** be a mutable, user-settable field»; ≤63 символа —
    `0148.md:46`, сейчас 64), право `sw.projects.update` (admin). `updateMask` OPTIONAL (без маски — заполненные поля, `*`
    поддерживается, AIP-134). **`etag`** — по нашему правилу «etag на всех PATCH-able» (AIP-154 «may»): OPTIONAL на PATCH,
    считается ТОЛЬКО по полям проекта (`displayName`), не по политике; рассинхрон → 409 ABORTED `ETAG_MISMATCH`.
    **`setIamPolicy` больше НЕ трогает `updateTime`** проекта — у политики свой `etag` (как у Google: политика не поле ресурса).
  · **Delete — hard, `{}`** (AIP-135 `0135.md:40` Empty), право `sw.projects.delete` (admin). **id после удаления можно
    занять снова** — по AIP-128 «Resources **should not** implement soft-delete. If the id cannot be re-used, the resource
    **must** implement soft-delete and the undelete RPC»: soft-delete не нужен → повторное использование разрешено, без
    отклонения. Пересозданный проект ничего не наследует: всё внутреннее завязано на `uid` (AEAD-id, бакет, связки SA,
    ключ кэша `wd` — по uid, проверить).
    · Дети (AIP-135 `0135.md:60` MUST FAILED_PRECONDITION): окружения (с сессиями), cloudAccounts/computeProviders (с
      привязками, машинами, арендами), приложения (со сборками), туннели, сервисные аккаунты → 400 FAILED_PRECONDITION
      `reason: PROJECT_NOT_EMPTY` + `PreconditionFailure.violations[{type:"HAS_CHILDREN", subject:"projects/p/environments",
      description:"3 environments"}]`. У приложений и туннелей FK сейчас `CASCADE` (молча стирает) — проверка явная, в
      data source под локом строки проекта.
    · Синглтон `storage` и IAM-политика удаляются вместе с проектом (`0135.md:63` «If the only child resource type is a
      Singleton, deletion **must** be allowed»); метаданные сессий `projects/{p}/sessions/*` удаление не блокируют.
    · **`force` НЕ делаем — записанное отклонение от SHOULD** (`0135.md:135` «**should** provide a `bool force`»): каскад
      асинхронный (гасить окружения через воркер) — платим ручной очисткой детей, получаем синхронный строгий Delete без
      LRO. Вернуть, если понадобится.
    · `catalog` → 400 FAILED_PRECONDITION `reason: CATALOG_PROJECT_UNDELETABLE` (доменное правило, не только IAM).
    · Инвариант «последний человек-admin» к Delete не относится (политика уходит вместе с проектом).
  · **Search** (`GET /v1/projects:search`, прецедент Resource Manager `SearchProjects` — «projects that the caller has …
    `resourcemanager.projects.get` permission on»): проекты, где у вызывающего ЕСТЬ ПРАВО `sw.projects.get` (набор ролей с
    этим правом формирует домен, data source транслирует), с учётом `group:`-членства. Сейчас два бага: группы не
    учитываются (`pageByMember` только `user:`), фильтр по любой связке (applicationViewer/tunnelUser видят проект, GET → 403).
    `GET /v1/projects` (List) удаляется. `query`/`filter` не вводим, пока не нужны. Отрицательный `pageSize` → 400 (AIP-132 MUST).
  · **Get/IAM-методы:** право проверяется ДО существования — чужой и несуществующий проект → одинаково 403
    «Permission 'sw.projects.get' denied on resource 'projects/x' (or it might not exist)» (AIP-135 `0135.md:222`, AIP-211);
    сейчас 404 раньше 403 → перебор id.
  · **Каноническое имя проекта во ВСЕХ вложенных ресурсах** (AIP-122 `0122.md:156` MUST «all data returned from the API
    **must** use the canonical resource name»): сейчас окружения/cloudAccounts/computeBindings/приложения подставляют хэндл
    из URL, а туннели/storage — uid. Строить из сущности проекта.
  · **Админ инсталляции (break-glass, `INSTALLATION_ADMIN_MEMBERS`) на проектах** — по прецедентам (сверено):
    Google `roles/resourcemanager.organizationAdmin` = `projects.get/list/getIamPolicy/setIamPolicy` на все проекты и БЕЗ
    `compute.*`/`storage.*` («Access to manage IAM policies … for organizations, folders, and projects»); GitHub Enterprise:
    владелец предприятия без членства не видит содержимое, восстанавливает доступ «Join as an organization owner».
    У нас: `projects:search` показывает ему ВСЕ проекты; `:getIamPolicy`/`:setIamPolicy`/Get проекта — на любом проекте
    (вернуть admin в осиротевший проект); содержимое (окружения, сессии, приложения, storage) — ТОЛЬКО через явно
    добавленную себе роль. Отклонение то же, что у `users` (гейт по конфигу, не IAM-право — организации над проектами нет).
    Каждый его `setIamPolicy` на чужом проекте — отдельное структурированное событие в серверном логе (кто, проект, diff
    биндингов) — по совету Google «set up alerts … when a SetIamPolicy() API call is made»; API-журнала IAM в v1 по-прежнему нет.
  · **ErrorInfo.reason:** `RESOURCE_ALREADY_EXISTS`, `RESERVED_RESOURCE_ID`, `INVALID_RESOURCE_ID` (+`BadRequest.fieldViolations`),
    `ETAG_MISMATCH`, `PROJECT_NOT_EMPTY` (+`PreconditionFailure`), `CATALOG_PROJECT_UNDELETABLE`, `LAST_ADMIN_REQUIRED`.
- **УТОЧНЕНИЯ ИТОГ `projects` (2 финальных ревью, 2026-10-08) — главнее ИТОГ `projects` там, где расходятся.**
  · **List ОСТАЁТСЯ** (AIP-121 `0121.md:84` «A resource **must** also support [List][], except for [singleton resources]»;
    `:search` его не заменяет — `0132.md:110-112` «Search methods are more relaxed»): `GET /v1/projects` — только админ
    инсталляции (все проекты), остальным 403, как `GET /v1/users`. Пользователь находит свои проекты через `:search`.
    Пункт «`GET /v1/projects` (List) удаляется» и «обычного List проектов нет» (ИТОГ IAM) — отменены.
  · **Повтор id на create:** 409 ALREADY_EXISTS только если у вызывающего есть `sw.projects.get` на существующем проекте;
    иначе 403 «Permission 'sw.projects.get' denied on resource 'projects/x' (or it might not exist)» (AIP-133 `0133.md:176`
    «if the user making the call does not have permission to see the duplicate resource, the service **must** error with
    `PERMISSION_DENIED` instead»); то же для гонки (23505). Иначе create — перебор чужих id.
  · **Ссылки:** 403-до-существования для Get/IAM-методов — AIP-211 `0211.md:25` и AIP-131 (не 0135:222, тот про Delete);
    формат id — `0122.md:131-136`. AIP-128 о soft-delete — из раздела declarative-friendly, берём как ориентир.
  · **field_behavior:** `name` IDENTIFIER (в теле Create игнорируется, `0133.md:165`) · `uid` OUTPUT_ONLY (UUID4) ·
    `displayName` OPTIONAL · `createTime`/`updateTime` OUTPUT_ONLY · `etag` без аннотации. Пути OUTPUT_ONLY/IDENTIFIER в
    `updateMask` игнорируются (`0203.md:139`), несуществующий путь → 400 — как в УТОЧНЕНИЯХ storage. `etag` сильный, в
    кавычках, как у политики.
  · **ErrorInfo:** + `IAM_PERMISSION_DENIED` для всех 403 (пары reason/domain — как в ИТОГ IAM).
  · **Арбитр Delete — БД:** FK детей на `project` (`environment`, `cloud_account`, `project_application`,
    `net_bridge_credential`/туннели, сервисные аккаунты) — `ON DELETE RESTRICT` (сейчас у приложений и туннелей CASCADE);
    CASCADE только у синглтона `storage_destination`, IAM-связок и следов (метаданные сессий, записи `sessionLogs`/
    `sessionVideos`). Delete берёт `SELECT … FOR UPDATE` строки проекта; вставка ребёнка конфликтует через FK-лок; 23503
    на create ребёнка → тот же ответ, что «проекта нет» (403 по AIP-211), не 500.
  · **Дети уточнены:** окружения в ЛЮБОМ состоянии (вкл. `failed`/`deleting`) блокируют; машины/аренды/слоты покрыты
    блокировкой по computeProviders; объекты в бакете пользователя под `sw/projects/<uid>/` не трогаем — документировать.
    Туннели блокируют своими строками; живое подключение рвётся при удалении туннеля (ИТОГ tunnels); ключ реестра
    подключений `wd` — `project.uid`, не id из URL.
  · **Кэш разрешений `wd` (учётка, проект)** — ключ строго `project.uid`; удаление проекта сбрасывает кэш тем же `NOTIFY`,
    что отзыв роли. В AEAD `creator` для SA — uid SA, не строка `serviceAccount:…@<project>`.
  · **Миграция id:** проектам без `resource_id` — `'p-' || left(replace(id::text,'-',''), 10)` (+суффикс при коллизии),
    затем `NOT NULL` + полный UNIQUE; `catalog`, созданный не системой, → миграция падает. Ссылки по uid ломаются (ок).
  · **`catalog`:** резерв — доменное правило пользовательского create; bootstrap создаёт отдельной фабрикой
    (`Project.createCatalog`); найденный `catalog` не системного происхождения → bootstrap падает (сейчас
    `ensureProject` усыновляет любой). Баг: в коде `CATALOG_ADMIN_EXTERNAL_IDS` → `roles/admin`, по ИТОГ IAM —
    `CATALOG_ADMIN_MEMBERS` → `roles/sw.applicationPublisher`.
  · **Break-glass без прямых `projects.update|delete`** (как `organizationAdmin` — только get/list/getIamPolicy/setIamPolicy):
    всё прочее — через выданную себе роль (событие в логе с `project.uid` рядом с именем). Инвариант последнего
    человека-admin действует и для него; его `setIamPolicy` на `catalog` перезапишет bootstrap — документировать.
  · **Осознанно:** `tunnelUser`/`applicationViewer` без `sw.projects.get` не видят проект в `:search` — ходят по прямому имени.
  · «Секрет сессии в неположенном месте → 400 с подсказкой» — и маскировать его в логах `api`.
- **Группы и увольнения для личных ключей — КОПИЯ КАТАЛОГА ПОЛЬЗОВАТЕЛЕЙ (юзер, 2026-10-08; исследование 10
  источников):** снимок групп «с последнего входа» отвергнут (юзер: в UI заходят редко, основной путь — API/CI; так же
  страдает GitLab SAML Group Sync — «evaluated each time a user signs in»). Как у GitHub/GitLab/AWS с долгими токенами:
  источник правды при запросе с ключом — НАША проекция `user(externalId, providerType, state, syncedAt)` +
  `userGroupMembership(externalId, groupId, syncedAt)`; проверка ключа — только по БД (мгновенно, без похода в IdP).
  Обновление: порт `DirectoryGateway` (`fetchUser` / `listUserGroups` / `listGroupMembers`) с адаптером под IdP; v1 —
  опрос Keycloak Admin REST служебной учёткой (`view-users`, `query-groups`) раз в 5–15 мин для пользователей с активными
  ключами + обход групп из IAM-биндингов; задача безопасна для многих воркеров (advisory lock); вход в UI тоже обновляет
  проекцию. Позже: входящий SCIM 2.0 (`/scim/v2/Users|Groups`, `active=false`) — второй адаптер той же проекции (Okta,
  Entra); Keycloak SSF (CAEP/RISC) — когда выйдет из experimental.
  Ключи: IdP «выключен» → ПРИОСТАНОВЛЕНЫ (включили — снова работают); IdP «нет такого» → ОТОЗВАНЫ навсегда; убрали из
  группы → права пересчитаются при синхронизации (ключ не трогаем); обязательный максимальный срок ключа — страховка.
  IdP недоступен → последнее известное состояние (НЕ блокировать всех — урок GitLab LDAP); старше порога (~24 ч) →
  перестают действовать только права через `group:`, прямые `user:` работают; алерт на устаревание синхронизации
  (урок AWS: истёкший SCIM-токен молча останавливает синхронизацию).
- **Ресурс `projects/{p}/sessions/{session}` — метаданные сессии (юзер, 2026-10-08):** id = несекретный UUID сессии
  (в ответе New Session — капа `sw:sessionUid`); поля `name`, `environment`, `creator`, `applicationBuild`, `state`
  (`ACTIVE | ENDED`), `endReason` (`DELETED | IDLE_TIMEOUT | ENVIRONMENT_LOST`), `createTime`, `endTime`, `sessionLog`,
  `sessionVideo` (ссылки; пусто, если не запрашивали); Get/List (`filter` environment/state/createTime), без
  Create/Update/Delete (создаётся при New Session); права `sw.sessions.{get,list}`; сырые капы НЕ храним (в них бывают
  пароли); хранение 30–90 дней, разбивка по дням. Секрет `sessionId` — только в W3C-ответе и `:accessSession`
  (документировать как «секрет сессии»; сервер распознаёт его формат в неположенном месте → 400 с подсказкой).
  **Логи/видео остаются на верхнем уровне** `projects/{p}/sessionLogs|sessionVideos/{id}` (id = тот же UUID) + поле
  `session`; вложенность отвергнута: синглтон `sessions/{s}/log` нарушает AIP-156 (существует не всегда), коллекция
  `sessions/{s}/logs` привязала бы ресурс лога к сроку жизни метаданных сессии (AIP-135), а владелец жизненного цикла
  артефакта — проект (бакет). Ресурс артефакта живёт не меньше метаданных сессии; `session` может указывать на уже
  истёкшую сессию (404) — документировать.
- **[SECURITY] аудит безопасности — ПОСЛЕ проектирования всех ручек (юзер, 2026-09-29; не прод — не срочно):**
  · **P0 — `wd` = открытый прокси во внутреннюю сеть:** `SessionRoute.decode` принимает любой адрес из id (base64url без
    подписи), `WebDriverProxy.forward` делает `fetch` туда любым методом и отдаёт ответ; `/sessions/:id/*`, WS-прокси и
    `sw/alive` без аутентификации → SSRF (метаданные облака 169.254.169.254, `/internal`, Docker/k8s API). Фикс:
    подписанный/шифрованный id (HMAC/AEAD ключом инсталляции — уже в ИТОГ `sessions`), проверка ДО прокси.
  · **Защита в глубину:** egress-allowlist из `wd` — только сеть окружений; запрет 169.254.169.254 и локальных адресов.
  · **Internal-контур (ревью 2026-10-04) — ИСПРАВЛЯТЬ ПЕРВЫМИ в аудите (юзер):** P0 обход `InternalMachineTokenGuard`
    через URL-кодирование (`/internal/machines/%33fa…:sync` — регэксп по сырому пути не находит uuid, guard пропускает
    любой валидный токен машины, а параметр декодируется в чужую машину → токены окружений чужой машины, в т.ч. другого
    проекта): сверять `sub` с ДЕКОДИРОВАННЫМ параметром, fail-closed, тест на `%33…`; `InternalAgentTokenGuard` — на ту
    же схему. P0 `wd-door` слушает `0.0.0.0` без аутентификации, `/status` отдаёт живой id сессии → секрет CP на каждый
    запрос, `/status` без id, слушать только сеть окружений. Токен окружения 48 ч без ротации (окружения старше 2 суток,
    вероятно, перестают хартбитить) и без отзыва. Токены в argv `curl` (видны в `ps`), `sync.json` в `/tmp` с правами по
    умолчанию. Загрузка артефакта не привязана к сессии этого окружения, размер не ограничен. Endpoint окружения задаёт
    агент (для слотов должен вычислять CP). Хартбит без `seq` (запоздавший `busy=false` рушит владение живой сессией),
    время с инстанса, не из БД. Исполняемые компоненты без проверки целостности. `sendBinary` — голый `.pipe()`;
    presigned-URL в логе ошибки.
  · **Storage (ревью 2026-10-04):** владение бакетом проверяется только при создании сессии — загрузка логов/видео и
    read-back пишут/читают без проверки (можно переключить назначение на чужой бакет посреди сессии); пробная запись
    `:test` идёт ДО проверки маркера; свободный `endpoint` — SSRF (`S3ObjectStorageGateway.clientFor` ходит на любой URL,
    `:test` возвращает сырое сообщение — сканирование портов; утекают `AccessKeyId`/session token); пользователю
    советуют `storage.editor` (весь фолдер) вместо политики на один бакет; комментарий про префикс `sw-verify/`
    расходится с реальным ключом маркера; инвариант «ключ записи ≠ ключ маркера» неявный — закрепить в домене + тест;
    в записи артефакта хранить снимок назначения (после смены бакета читать из старого).
  · **P1 — SSRF через `appRef` своей сборки** (роль developer): `ApplicationSource.refKind` считает любой `https?://`
    URL-ом, control plane качает произвольный адрес и отдаёт байты в окружение. Фикс: у своих сборок — только ключ в
    бакете проекта (инвариант в домене).
- **[IAM] баги к исправлению (ревью 2026-09-29):** (1) `setIamPolicy` отвергает честный read-modify-write: `version`
  и `updateMask` в теле → 400 (`forbidNonWhitelisted`); (2) гонка записи политики — два писателя с одним etag проходят
  оба (нужен `with(id, cb)` под `FOR UPDATE` или условная запись); (3) можно удалить последнего admin → нужен
  FAILED_PRECONDITION (прецедент Resource Manager); (4) binding без участников принимается (`policy.proto:137` «must
  contain at least one principal»); (5) `listProjects` не учитывает группы (`pageByMember(Member.user(...))`);
  (6) утечка существования проекта: чужой несуществующий → 404, существующий → 403 (AIP-211: PERMISSION_DENIED «or it
  might not exist»); (7) ownership сессии сравнивается по `externalId` → перевести на строку `Member` (сервисные
  аккаунты); (8) админы каталога только добавляются из конфига и не отзываются, пустой конфиг — каталог без админов.
- **[AIP] ошибки без `ErrorInfo` — СКВОЗНОЕ, НЕ начато (финальный аудит, 2026-09-28):** AIP-193 `0193.md:84` «All error
  responses **must** include an `ErrorInfo` within `details`». В `apps/backend/src` `ErrorInfo` нет вообще. Сделать
  единым механизмом для всех ресурсов: `ErrorInfo.reason` на каждую ошибку, `PreconditionFailure` для
  FAILED_PRECONDITION (что мешает), `BadRequest.fieldViolations` для INVALID_ARGUMENT.
- **ОЧЕРЕДЬ ОБЗОРА «ручка за ручкой» (юзер смотрит каждую подробно; 2026-09-13):** `machines` ✓, `machineLeases` ✓,
  `computeBindings` ✓ (с правками выше). ДАЛЬШЕ по порядку:
  1. `computeProviders/{cp}` — `kubernetes` как ТИП провайдера (не вид машины), `folderId` на соединении (не в
     шаблоне), где живёт `:verifyAccess` (креды провайдера vs папка привязки), `resourceId`/`displayName`, `uid`/`etag`.
  2. `computeProviderTypes/{t}` — `machineTemplateKinds[] {kind, facts}` (совместимость UI = сервер), снос
     `provides[]` (пары выводятся из требований runtime) и `requiredConfig[]` (валидирует типизированная схема
     `machineTemplate`), `grants`/`ownershipProof` остаются.
  3. `platforms/{p}` + новая дочерняя `platforms/{p}/runtimes/{r}` — `requirements{anyOf, resources}` (размер слота
     включая overhead), `versions[]`, `devices[]`.
  [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] 4. Затем — модель приложения окружения (`nameAlias`/`versionAlias` → `appName`/`appVersion` + `detected{}`),
     `environments` (`UNHEALTHY` внутри state, `occupancy`, `machine` OUTPUT_ONLY + `filter=machine=`), `sessions`,
     IAM (`roles/wizard`), netbridge [→ ИТОГ tunnels], enum-casing.
  Каждый пункт — по формату «было / предлагается, JSON со всеми `|`, ручки с curl».
- **Какие runtime предлагает провайдер — НЕ захардкожено по типу провайдера** (юзер: android/container на self-hosted
  «ничего не мешает» — верно, redroid на Linux-коробке с docker). Под одной схемой предложение выводится из
  требований runtime против того, что провайдер может дать: у изготавливающего — решаемо при создании привязки
  (YC `vm` не даёт kvm → `FAILED_PRECONDITION` для эмулятора); у инвентарного — НЕ решаемо заранее (инвентарь
  меняется: Mac не поднимет android/container — нет binder в ядре Docker Desktop, Linux-VM поднимет) → привязка
  создаётся, решает размещение (нет подходящей коробки → `FAILED_PRECONDITION` на create-environment с перечнем
  требований). Каталог `computeProviderTypes.provides[]` с ручным списком пар на тип провайдера — упраздняется в
  пользу этого правила; профиль android/container = {ubuntu/amd64}, {ubuntu/arm64} (не macos).
- **`platforms/ubuntu` — ПОДТВЕРЖДЕНО юзером повторно (2026-09-13)**, решение №9 от 2026-09-05 в силе: платформа =
  конкретная ОС с честной версией (`ubuntu 24.04`, `android 14`), `linux` — только family-алиас W3C `platformName` на
  границе сессии (уже реализовано в RequestedPlatform). Разобранная альтернатива: `platforms/linux` БЕЗ версий (как Sauce)
  — законно, но это отмена №9 и потеря оси версии; переименование оси в `os`/`osVersion` (BrowserStack) — разъезд с
  W3C-именами капов, не стоит того. Не переоткрывать без новой причины.
- **Статика у self-hosted (юзер: «не должны ли требовать, как у vm/baremetal?»)** — развилка верна по РОДУ: шаблон =
  «как изготовить», у инвентаря аналог — «как ВЫБРАТЬ» (селектор), не «какой формы» (объявленная форма дублировала
  бы измеренные факты и врала). Обязательный селектор уже есть — требования runtime; необязательное сужение
  (labels / минимальные ресурсы) — отложенный пункт labels+selector, поле `machineSelector` (не член `machineTemplate`:
  template ≠ selector). Не требовать. Общая статика обоих родов — только `limits.maxMachineCount`.
- **Снимок шаблона в аренду**: `machineLease.request` копирует `machineTemplate` в момент заказа — замена/удаление
  шаблона не меняет смысл живых аренд.
- **`etag` — внедрять ЕДИНООБРАЗНО** на всех PATCH-able ресурсах (project, computeProvider, computeBinding, machine)
  одним механизмом (etag = хеш версии/updateTime; в запросе опционален — AIP-154), в том же срезе, что Update-методы
  и `updateMask` (см. [AIP] «Update methods missing»). Не точечно.
- **`validateOnly` (AIP-163) — В ПЕРВОЙ ВЕРСИИ НЕ НУЖЕН (юзер, 2026-09-13):** его задачу (превью в наших терминах до
  создания) забрал `computeProviders/{cp}:quoteMachine`; ошибки формы отдаёт настоящий POST структурно. Вернуть при
  реальном dry-run-сценарии (обратно совместимо). Ниже — исходная запись, оставлена как обоснование формата: ввёл конфиг, ничего не создал, а сервер уже
  отдал `machineCapacity` в наших терминах — расчёт НЕ дублируется на клиенте. AIP-163 дословно: API «**may** provide
  an option to validate, but not actually execute, a request, and provide the same response (status code, headers,
  and response body) that it would have provided if the request was actually executed»; «**must** perform permission
  checks and any other validation that would be performed on a 'live' request»; «a request using validate_only
  **must** fail if … the actual request would fail»; поля вроде автогенерённого id — omit. Для declarative-friendly
  (AIP-128) поле обязательно «on methods that mutate the resource» — то есть это ТА ЖЕ полоса, что uid/etag: делать
  одним срезом на Create/Update всех конфигурационных ресурсов. Форма: `POST …/computeBindings?validateOnly=true`
  и `PATCH …/{b}?validateOnly=true` → тело ресурса без `name`/`uid`/`createTime`, с `machineCapacity`.
- **`baremetal.configurationId` — оставить SKU входом**, а рядом отдавать OUTPUT_ONLY `resources` (разрешено из
  каталога провайдера), чтобы пользователь видел, что получит. Сахар «скажи cores/memory — система выберет SKU»
  ОТКРЫТ (юзер спросил): против — SKU дискретны и дороги, «ближайший подходящий» прячет ценовое решение (60 ядер →
  64-ядерный, 65 → 128-ядерный за ×2), GPU/NVMe/пул в три числа не влезают; за — единая модель «говорю, сколько нужно».
  Если делать — как опциональный селектор `minResources` поверх явного `configurationId`, не вместо.
- **`coreFraction`** — не стандарт, а поле самого YC (`resourcesSpec.coreFraction`, 5|20|50|100 — гарантированная
  доля vCPU, аналог AWS burstable / GCE shared-core); в члене `vm` зеркалим словарь провайдера. НО в ёмкость он
  ВХОДИТ: `capacity.cpuMillicores = cores × coreFraction/100 × 1000` (4 vCPU по 50% = 2000m гарантированного
  компьюта) — иначе 4000m-эмулятор «влезет» на коробку, которая даёт половину. Разрешённая ёмкость — ОТДЕЛЬНЫМ
  OUTPUT_ONLY полем привязки `machineCapacity{cpuMillicores,memoryMb,diskGb}` (юзер: не внутри template — это не
  конфиг, а вычисленное из конфига), у `vm` считается из полей, у `baremetal` — из каталога SKU; absent у инвентарных.
  Дубль памяти/диска с `vm`-полями юзера НЕ смущает при чётком разведении: template — «в терминах системы, которая
  выдаёт ресурсы», machineCapacity — «что фактически получишь в наших терминах».
- **Как считается заявка окружения:** НЕ измеряется в рантайме — это ДЕКЛАРИРОВАННЫЙ размер слота на runtime
  (k8s `requests`-семантика: гарантированный компьют + память + диск, включая overhead), выбранный нами из опыта
  (эмулятор ≈ 4000m/8 ГБ, браузерный контейнер ≈ 1000–2000m/2–4 ГБ); пул вычитает его из `capacity` при размещении.

## [ARCH] control-plane API на protobuf/gRPC, HTTP/JSON — через Envoy-транскодер — РЕШЕНО: всё сразу на proto (юзер, 2026-10-07; было «ИДЕЯ, НЕ начато», 2026-09-13)

**Идея юзера:** все НЕ-WebDriver ручки (control plane `api`, internal для агентов) описать протобуфами — proto и есть
документация API; для клиентов, говорящих HTTP/1.1+JSON, поставить Envoy, который принимает HTTP-запрос и сам
превращает его в gRPC (HTTP/2) и обратно. WebDriver/Appium (`wd`) и туннели (`:connect`/`:forward`, data plane) остаются как есть — W3C диктует
HTTP/JSON.

**Как это устроено у Google и почему ложится на нас без натяжки:**
- Envoy `grpc_json_transcoder` работает ровно по `google.api.http`-аннотациям в proto (`get: "/v1/{name=projects/*/…}"`,
  `post: "/v1/{parent=…}/computeBindings" body: "compute_binding"`, кастом-методы `post: "/v1/{name=…}:cordon"`),
  на вход берёт descriptor set (`protoc --descriptor_set_out --include_imports`). Это тот же механизм, что
  Google ESPv2/Cloud Endpoints.
- Всё, что мы сейчас выверяем по AIP руками, становится МАШИННО ПРОВЕРЯЕМЫМ: `google.api.field_behavior`
  (REQUIRED/IMMUTABLE/OUTPUT_ONLY), `google.api.resource`/`resource_reference` (имена ресурсов, ссылки
  `platforms/*/runtimes/*`), `google.protobuf.FieldMask update_mask`, `validate_only`, `etag`, `page_token`,
  `google.rpc.Status` с `PreconditionFailure.violations` (AIP-193 — транскодер сам мапит в HTTP-код) — и всё это
  линтуется `api-linter` (официальный линтер AIP) + `buf lint`/`buf breaking` (детект ломающих изменений) в CI.
- Стиль JSON на проводе не меняется: proto3-JSON даёт lowerCamel, oneof — сиблинги, `Timestamp` — RFC 3339.
  Закрывает пункт копилки «три стиля enum-значений»: proto-энумы SCREAMING_SNAKE с `*_UNSPECIFIED`, правило CLAUDE.md
  (прятать `*_UNSPECIFIED` в presentation) остаётся.
- Серверная сторона: NestJS gRPC-транспорт (`@nestjs/microservices` + `@grpc/grpc-js`) либо nice-grpc (прецедент
  hyperenv, там же middlewares); TS-типы — `ts-proto`. Структура `presentation/server/grpc/services/<scope>/<version>/
  services/<service>/handlers/` в CLAUDE.md УЖЕ заложена под это. Request-модели/presenter-ы остаются: proto-message
  не проходит в use case (правило CLAUDE.md), handler конвертирует.
- Агенты (internal): gRPC даёт server-streaming вместо полла `:sync`/`:heartbeat` — отдельное решение, не обязательное
  для первого шага; можно оставить unary.

**Место в очереди:** ПОСЛЕ словарного обзора и ВМЕСТЕ с волной переименований — proto пишется один раз с финальными
именами. Более того, естественный артефакт текущего обзора «ручка за ручкой» — это и есть `.proto` файлы: спека
в формате, который линтер проверит на AIP, прежде чем писать код. Предложение: следующий срез после обзора —
`proto/sw/v1/*.proto` + `api-linter` зелёный + Envoy в compose, затем переименования реализуются уже против proto.

**Цена/риски:** ещё один контейнер (Envoy) в single-VM проде и в dev-compose; descriptor set надо пересобирать при
каждом изменении proto (шаг сборки); отладка через transcoder добавляет слой (логи Envoy); интеграционные blackbox-тесты
гоняются через Envoy, чтобы проверять реальный HTTP-контракт, а не gRPC напрямую (или оба).

## [NAMING] переименования, копящиеся под один PR — НЕ начато (решение слов за юзером)

Механические правки без изменения поведения; копим и делаем одним заходом.

**1. Один концепт — два имени: `Stereotype` и `Substrate`** (юзер, 2026-09-08)

Пара «платформа + исполнение» (`ubuntu/container`, `android/emulator`) — ключ матчинга: облако её `provides`,
окружение её запрашивает, машина её обслуживает. В домене она называется `Stereotype`
(`domain/entities/cloud-account/stereotype.ts`, появилась в `b2e8a8d`), а в каталоге, в типах API и во фронтенде та же
пара зовётся `Substrate` — причём в `registered-cloud-catalog.ts` они соседствуют: тип `SubstrateOffer`, поле внутри
`stereotype`. В `apps/backend/src` ~200 упоминаний первого слова и ~108 второго. Это нарушение нашего же правила
«один концепт называется одинаково во всех слоях», и слово реально спотыкает читателя (реакция юзера).

Происхождение: `stereotype` — штатный термин Selenium Grid (набор капабилити, который нода объявляет и по которому её
матчат). Заимствование осмысленное, но у Grid это полная карта капабилити, а у нас только два поля — термин взят шире,
чем наполнен.

Варианты (выбрать ОДИН, отдельным механическим коммитом без изменения поведения, лучше на чистом `main`):
1. **Оставить `Stereotype`, убрать `Substrate` из имён типов** — меньше переименований (108 против 200), слово знакомо
   пришедшим из Grid, и «субстрат» честно описывает только вторую половину пары (контейнер/эмулятор), а не платформу.
2. **`EnvironmentProfile`** — нейтральное имя, если `stereotype` не нравится как таковое; переименований больше всего.
3. НЕ брать `EnvironmentKind`: `kind` уже занят вычислительным субстратом (`docker`/`vm`/`kubernetes`/`baremetal`).

На провод не влияет: в JSON поля называются `platform` и `execution`, слова `substrate`/`stereotype` там нет.

**2. Одно имя — два концепта: `name` у проекта** (всплыло 2026-09-09 при ревизии ручки создания проекта). На проводе
`name` — это АДРЕС ресурса (`projects/mobile-team`), а подпись лежит в `displayName` (AIP-148). В домене наоборот:
`Project.name` и value object `ProjectName` — это ПОДПИСЬ, и presenter делает `displayName: this.project.name`. Одно
слово означает разное в зависимости от слоя. Правка: в домене `Project.name` → `displayName`, `ProjectName` →
`DisplayName`; три файла плюс тесты, на провод не влияет.

**3. Ссылка на тип облака — именем ресурса, а не голым словом** (решение юзера 2026-09-09). Сейчас каталог отдаёт и
`name: "cloudTypes/local"`, и дублирующее `type: "local"`, а подключение создаётся словом (`{"type": "local"}`) и
словом же отвечает. Делаем так: из каталога поле `type` УБИРАЕМ, клиент берёт `name` целиком и передаёт его —
`POST …/cloudAccounts {"cloudType": "cloudTypes/local", …}`, и подключение отвечает `"cloudType": "cloudTypes/local"`.
Принимать оба варианта НЕ будем: два способа сказать одно и то же — та самая двусмысленность, от которой уходим.
Домен не трогается, внутри остаётся слово `local`; разбор и сборку имени делает presentation, как уже делает для
адресов проектов и окружений. Затронуто четыре места: presenter каталога, presenter подключения, presenter окружения
(поле `cloudType`) и фронт (поиск записи каталога и сравнение с `self-hosted`).

Открытый вопрос ТОГО ЖЕ рода, отложен по просьбе юзера до ревизии платформ: внутри `provides` лежит
`"platform": "ubuntu"` — тоже ссылка на существующий ресурс (`GET /v1/platforms` отдаёт `platforms/ubuntu` и рядом
дублирующее `platform`). Либо ссылаемся именами и там, либо признаём, что у install-статики `name` — украшение;
половинчатый вариант (облако именем, платформа словом) хуже обоих.

Заодно (тоже к ревизии окружения): поле `cloudType` в ответе окружения, возможно, просто ЛИШНЕЕ — тип однозначно
выводится из `cloudAccount`, ссылка на который там уже есть; и сейчас окружение отдаёт подключение в форме uuid, тогда
как само подключение отвечает своим словом.

**4. `cloud` → `compute provider`** (решено юзером 2026-09-09 после независимого ревью двумя агентами).
Слово «облако» неверно для двух видов из трёх: `local` — docker-демон коробки самого контрол-плейна, `self-hosted` — в
индустрии буквально противоположность облачному хостингу. Ревьюер дополнительно нашёл конфликт с вендором: у Yandex
Cloud есть сущность **Cloud** в иерархии Organization → Cloud → Folder (а мы храним `folderId`), и «cloud account» в
AWS/GCP/YC читается как БИЛЛИНГОВЫЙ аккаунт. Оба ревьюера независимо выбрали `compute provider`; голое `provider`
отвергли (уже заняты storage provider и identity provider), как и `runtime`, `execution target`, `fleet`, `host pool`,
`workspace`.

Решено:
- `GET /v1/cloudTypes` → `GET /v1/computeProviderTypes`, элементы `computeProviderTypes/{type}`;
- `projects/{p}/cloudAccounts` → `projects/{p}/computeProviders`, дочерние `computeBindings` и `machines` — без изменений;
- поле выбора при создании окружения `cloudAccount` → `computeProvider`, ответ окружения — тоже (поле `cloudType`
  скорее всего просто убрать: тип выводится из ссылки на провайдер);
- значение `local` → **`builtin`** (в размещённой инсталляции ничего «локального» для вызывающего нет; на дев-стенде
  `local` и `self-hosted` — вообще одна и та же коробка, слово путает сильнее всего);
- значения `self-hosted` и `yandex-cloud` остаются;
- НИКОГДА не сокращать до голого `compute`: у нас три существительных на это слово (провайдер, привязка, вид);
  строго различать `type` (какой провайдер) и `kind` (как привязка исполняет) — одной строкой в глоссарии.
- Цена: ~700 ссылок в коде, переезд таблицы `cloud_account` и колонок `cloud_account_id`/`cloud_type` миграцией,
  правки ранбуков и UI. Делать ОТДЕЛЬНЫМ PR-ом после того, как соберём остальные решения по словам.

**5. [ОТКРЫТО, из того же ревью] `yandex-cloud` смешивает две оси.** Виртуалки и арендованный металл — мощности,
которые мы создаём и которыми владеем; managed-кластер Kubernetes — мощности ПОЛЬЗОВАТЕЛЯ, которыми мы только правим по
гранту: другие креды, другой жизненный цикл, другие отказы. Сейчас разница спрятана в `kind: kubernetes` под вендором;
с появлением EKS/GKE `kubernetes` захочет стать отдельным провайдером. Это про нарезку концепта, а не про слово —
решать отдельно.

**6. Итоги ревизии словаря двумя независимыми ревьюерами (2026-09-09).** Один смотрел публичную поверхность, второй —
домен и приватный протокол. Ниже всё, что они нашли, сгруппировано по силе сигнала.

**Сошлись оба (сильнейший сигнал):**
- `admission` (open|cordoned|draining) у машины — ложный друг: в Kubernetes admission это контроллеры валидации
  запросов, а не планируемость. Значения верные, врёт ярлык → `schedulability` (`schedulable|cordoned|draining`).
- Корень `execut*` перегружен: `Execution` (container|emulator|device) — это РОД хоста, а не акт исполнения;
  `Environment.executing` означает «поднялось и простаивает» (окружение `executing` + `free` не исполняет ничего);
  исполняет на самом деле `Session`. Три несвязанных смысла в одном грепе.
- `facts` у машины — ОСТАВИТЬ. Устоявшееся заимствование (Puppet/Ansible) и сознательный уход от коллизии с
  W3C `capabilities`.

**Публичная поверхность (ревьюер 1):**
- ХУДШЕЕ: `nameAlias`/`versionAlias` рядом с определёнными `name`/`version` у приложения. `name` зарезервировано
  правилами под ИМЯ РЕСУРСА, а мы кладём туда определённый идентификатор пакета; плюс «alias» перевёрнут — адресуемся
  мы как раз алиасом → `appName`/`appVersion` + вложенный `detected{...}` (совпадёт с капабилити `sw:appName`).
- `UNHEALTHY` внутри `state` — здоровье не фаза жизненного цикла; у машины мы уже сделали правильно (`ready` +
  `conditions[]`) → состояние оставить про жизненный цикл, здоровье вынести в conditions.
- `roles/wizard` не сообщает ни объёма прав, ни места в иерархии → `roles/operator`.
- `occupancy` читается как метрика-число (occupancy rate) → `allocation: AVAILABLE|RESERVED|IN_USE`.
- `sw.environments.teleport` — чужой бренд (Teleport = продукт infra-access) → `sw.environments.attach`.
- `netBridgeCredentials` — бренд вместо отраслевого слова (BrowserStack Local, Sauce Connect) → [РЕШЕНО 2026-10-04: ресурс убран, туннели — `projects/{p}/tunnels`, ключи — сервисных аккаунтов].
- `sw:netbridge` — единственная капабилити в нижнем регистре среди lowerCamel-соседей. [РЕШЕНО: `sw:tunnel`]
- Три стиля значений в одном API: `ENQUEUED` / `online` / `self-hosted`; kebab не ложится в proto-энумы.
- Один корень «provide» в трёх смыслах: `computeProviders`, `source.type: provided`, `machine.provides[]`.
- Устройство названо четырьмя способами: `sw:deviceModel`, `platform.deviceModel`, `platforms.devices[].id`,
  appium `deviceName`.
- `ENQUEUED` и `PREPARING` обе значат «ещё не готово»; `DELETED` как состояние сомнительно (есть `deleteTime`).
- Одно и то же на разных высотах: machine `pending` ↔ env `ENQUEUED`, machine `offline` ↔ env `UNHEALTHY`.

**Домен и протокол (ревьюер 2):**
- `EnvironmentProviderGateway` → `ComputeProviderGateway`: публично концепт теперь compute provider, а порт назван по
  Environment и читается как репозиторий.
- `agentToken` → `environmentToken` + печатные префиксы токенов (`swr_`/`swm_`/`swe_`, как `ghp_` у GitHub): агентов
  два, и ровно в одном месте (ответ `:sync`) machine-токен и env-токен лежат рядом.
- `Stereotype` — false friend: у Selenium это ПОЛНЫЙ шаблон capability, у нас два поля → `PlacementKey` или
  `RuntimeTarget`. (Закрывает пункт 1 этой копилки: ни `Stereotype`, ни `Substrate`.)
- ~~`MachineLease` → `MachineClaim`~~ ОТМЕНЕНО (независимый ревьюер, 2026-09-13): наша семантика — «удержание,
  продлеваемое использованием, истекает по idle TTL» — это буквально k8s `coordination.k8s.io/Lease`
  (`holderIdentity`/`acquireTime`/`renewTime`); claim (PVC) по простою не истекает. Остаётся `MachineLease`, глаголы
  `acquire`/`release` (AWS `AllocateHosts`/`ReleaseHosts`). `SlotAssignment` назван лучше всех, `MachinePool` нормально.
- `launch` → `runtimeSpec`: глагол в роли существительного, и это дискриминированное объединение спецификаций, а не
  непрозрачный мешок; его `kind` должен браться из того же перечисления, что и род хоста.
- `Headroom` держит два понятия (остаток + форма следующей машины) → расщепить при следующем касании.
- `ProvisionedMachine` — четвёртое machine-существительное; если это исход провижна, так и назвать.
- Девять `XxxCriteria`, из них три почти-синонима «пора вернуть» и две формы одного stage-таймаута; сам ПАТТЕРН
  окупается (держит пороги вне SQL), популяция — нет. Схлопнуть до 4-5 — это ревизия поведения, не переименование.
- `:heartbeat` у env-агента и `:sync` у machine-агента — одна форма взаимодействия, два имени.
- `applications/{app}:downloadApp` заикается; `agentScript:download` против `machines/agent:download` — две формы;
  снова голое «agent»; W3C пишет `WebDriver`.
- «seat» в комментариях про `SlotAssignment` — слово, которое мы сами себе запретили.

**КОНФЛИКТ между ревьюерами, решать юзеру:** оба хотят слово `runtime`, но для РАЗНОГО. Публичный — для `kind`
привязки (docker|vm|kubernetes|baremetal), внутренний — для нашего `Execution` (container|emulator|device). Обоим
отдать нельзя. Нужен третий словарь для одной из двух осей.

**Заодно (не переименование, а пропуск):** `description` — отдельное стандартное поле для длинного текста про ресурс,
оно НЕ альтернатива `displayName`, а дополнение. У нас его нет нигде; добавлять, только когда появится, что писать.

## [BUG] гарантия 429 не держится между привязками одного self-hosted облака — СДЕЛАНО (2026-09-08)

Симптом: на одном self-hosted облаке привязаны две платформы и свободна одна машина — оба create отвечали 201, машину
забирал тот пул, чей воркер провижнил первым, второе окружение падало в `failed` вместо синхронного 429.

Причина — несовпадение областей. Посадка считала «аренд, ждущих машину» по СВОЕЙ привязке, а инвентарь машин общий на
облако; и пер-пуловый advisory-лок не сериализовал две привязки одного облака между собой, так что обе видели одну и ту
же свободную машину своей. Теперь: лок берётся на облако (спорный ресурс — его инвентарь), потолок аренд остаётся
пер-привязку (это спенд-лимит квоты платформы), а бюджет ожидающих машину считается по всему облаку.

Тест: `machines.test` — «two platforms on one cloud draw from the same machines: the second is refused, not queued»
(android занимает единственную машину → браузерное окружение получает 429 на создании). Проверено обратным ходом: со
старой пер-привязочной областью тест падает на 201.

## [BUG] процесс падает от разовой ошибки Postgres — СДЕЛАНО (2026-09-08, ветка `feat.self-hosted-any-stereotype`)

Симптом: вспышка `error: password authentication failed for user "sw"` от `pg` убила воркер (после 2.5 ч работы), потом
api под nodemon, потом прогон `cloud-types.test.integration`; между вспышками соединения с теми же кредами проходили, а
в логе самого `sw-db` отказов аутентификации НЕ БЫЛО.

**ПРИЧИНА НАЙДЕНА (2026-09-09): конфликт порта 5433.** На порту сидели ДВА слушателя: наш `sw-db` через проброс Lima на
`*:5433` и **embedded-Postgres проекта hyperenv**, который биндится прицельно на `127.0.0.1:5433`. Петлевые соединения
уходят к более специфичному биндингу, то есть к чужой базе, где роли `sw` нет — отсюда «неверный пароль» ровно тогда,
когда у юзера запущен hyperenv. Лечение на стенде: наш контейнер пересоздан на **порт 5435** (тот же том, данные на
месте), `POSTGRES_PORT` в `env/.env.development` и `env/.env.integration_test` обновлён. Чужой Postgres не трогали.

Наша часть починена: разовая ошибка соединения больше не роняет процесс.
- `WorkerConnection` (`infrastructure/data-sources/database/postgres/worker-connection.ts`) — собственная сессия
  воркера: держит `LISTEN` и сторожевые advisory-локи свипов (и то и другое живёт в сессии), слушает `error`,
  переподключается с растущей паузой (0.5 c → 30 c) и на каждом (пере)подключении звонит сама себе, добирая
  пропущенные уведомления (`NOTIFY` не durable). Таймер переподключения СПЕЦИАЛЬНО не `unref`-ится: пока сокета нет,
  процесс держать больше некому — с `unref` воркер тихо завершался «clean exit» (поймано живой проверкой).
- `PostgresModule` вешает обработчик `error` на пул TypeORM: фоновая смерть простаивающего соединения логируется, пул
  сам выбрасывает битого клиента и открывает нового.
- Тест: unit на расчёт паузы. Живая проверка: `pg_terminate_backend` всех бэкендов базы → воркер, api и internal живы,
  в логе видно потерю сессии и ошибки пула, сессия воркера вернулась (видна в `pg_stat_activity` на снятии лока),
  созданное после обрыва окружение подхвачено тем же процессом по `NOTIFY`.

## [BUG] internal падает на таймауте потоковой отдачи артефакта — СДЕЛАНО (2026-09-08, ветка `feat.self-hosted-any-stereotype`)

Два дефекта в одном пути. (1) `AbortSignal.timeout(30s)` в `HttpRemoteArtifactGateway` вопреки собственному комментарию
резал не ожидание заголовков, а всю передачу: большая сборка рвалась на середине. Теперь дедлайн — свой
`AbortController`, снимаемый в тот момент, когда заголовки пришли. (2) Ручка отдавала тело через голый
`artifact.body.pipe(response)`, и ошибку потока никто не слушал — а на неуслышанной ошибке потока node завершает
процесс (за сессию это дважды уронило `internal` на стенде). Теперь `pipeline`: обе стороны закрываются, причина
логируется.

Тест: `application-artifacts.test` — «survives a store that hangs up mid-download» (фейковый стор отдаёт первый кусок и
рвёт соединение); со старым кодом прогон повисает на упавшем воркере jest, с фиксом проходит и сервер продолжает
отвечать.

## Follow-up: поиск в селектах приложений и версий (new-environment) — НЕ начато (юзер, 2026-09-07)

Селект приложений в модалке нового окружения (и селект версий/билдов) сегодня — плоский список. Приложений
и билдов в проекте может стать много (свои сборки + каталог) → нужен поиск/фильтр по слову и по ярлыку билда
(Mantine `Select searchable` поверх серверной пагинации `pageSize`/`pageToken` списков реестра, а не полной
выгрузки). Сделать вместе: приложения и версии. Визуальное деление селекта на «This project» / «Catalog»
(группы, как секции в kebab-меню окружения) — сделано в S1d-фиксах.

## Follow-up: таблица окружений — платформа и устройство в разных колонках — НЕ начато (юзер, 2026-09-07)

Сейчас строка окружения показывает `linux (ubuntu) 24.04 · pixel-7` одной ячейкой. Разнести на две колонки:
**Platform** (`linux (ubuntu) 24.04`, `android 14`) и **Device** (`desktop`, `pixel-7` — с displayName из линейки
платформ, когда каталог устройств отдаёт его). Вместе с этим пересмотреть ширины колонок таблицы.

## Follow-up: строка окружения показывает приложение алиасами (`chrome 113`), detected — вторым планом — НЕ начато (юзер, 2026-09-07)

Сейчас в таблице окружений приложение подписано словом + detected-версией (`chrome 113.0.5672.136`), а во вкладке
[ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] Applications и в модалке — ярлыком билда (`113`). Для консистентности показывать `nameAlias versionAlias`
(`chrome 113`), а detected-правду (`com.android.chrome 113.0.5672.136`) — тултипом/второй строкой. Делать
вместе с разнесением платформы и устройства на две колонки.
## Follow-up: варка каталога — регулярные АКТУАЛЬНЫЕ сборки Chrome из Chrome for Testing — НЕ начато (решение юзера 2026-09-07: отдельная задача, сейчас не делаем)

Сейчас каталожный `chrome` на ubuntu — один билд, зарегистрированный руками при сиде (`152.0.7977.82`, на момент
записи = текущий Stable), артефакты — публичные URL-ы Chrome for Testing (`chrome-linux64.zip` + ровно парный
`chromedriver-linux64.zip`). Задача — чтобы каталог следил за Chrome сам, через обычный API каталога, без новой модели.

Согласованная рамка (обсуждено 2026-09-07):
1. **Источник** — фид CfT (`last-known-good-versions.json` / `known-good-versions-with-downloads.json`): полные версии по
   каналам, парные chrome+chromedriver на каждую.
2. **Политика** — какие каналы (предложение: Stable + Beta) и сколько мажоров держать (последние N); старые билды не удалять —
   [ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] окружения снапшотят рефы, но история версий нужна пользователям. `versionAlias` билда = мажор (`153`), полная версия —
   detected на окружении, как у всех.
3. **Периодичность** — тик воркера (раз в сутки), идемпотентный: билд с таким ярлыком уже есть → пропуск; регистрация через
   `POST /projects/catalog/platforms/ubuntu/applications/chrome/versions` (варка — обычный клиент каталога от лица его
   админа, не спецпуть).
4. **Зеркало артефактов в бакет инсталляции** (предложение: делать сразу): варка один раз скачивает архив к себе и регистрирует
   СВОЙ URL/ключ — доставка на ноду не зависит от `storage.googleapis.com` в рантайме (из RU-облака может не работать), там
   же считается **sha256**; digest сверяется агентом при доставке — единственная защита целостности артефактов (см.
   «мисматч-чека нет» в модели детектированной идентичности).
[ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] 5. Post-hoc коллизия слов: варка добавляет слово, занятое чьим-то кастомом → каталог выигрывает всегда (docker-правило);
   при варке — отказаться добавлять занятое слово или хотя бы предупредить в лог (решить при реализации).

НЕ входит: базовый образ (он про ОС, не про браузер), android (публичного chrome-APK у Google нет — там кастомы и
preinstalled), firefox/geckodriver (следующая линейка по тому же образцу).

## Follow-up: URL-реф билда = «положить в бакет проекта один раз», а не «качать при каждом старте» — НЕ начато (юзер, 2026-09-07)

[ЗАМЕНЕНО 2026-09-28 → см. «ИТОГ — `environments`, `applications`, `builds`»] Сейчас `appRef`/`webdriverRef` билда — ключ в делегированном бакете проекта ИЛИ https-URL; URL при каждом старте
окружения тянет control plane (не слот) и стримит в слот: без кэша, без sha256, доступность = доступность у CP
(из RU-облака GitHub/googleapis могут не открываться). Сделать: регистрация билда по URL → CP скачивает артефакт
один раз в бакет проекта (под ключ вида `sw/apps/<app>/<versionAlias>/…`), считает sha256 и хранит уже ключ +
digest; доставка на слот всегда из бакета, слот сверяет digest. Тот же механизм, что зеркало в варке каталога
(см. выше) — делать одним куском. Для кастомов без бакета (storageDestination не настроен) регистрация по URL
даёт честный 400 «настрой хранилище».

## Ограничение: Chrome на android в каталоге = Chrome системного образа, версия не выбирается — ЗАПИСАНО (2026-09-07)

Google не публикует Chrome-APK, поэтому каталожный `chrome` на android — preinstalled из образа `google_apis`
(API 34 → Chrome 113.0.5672.136): билд каталога = ярлык-мажор + chromedriver того же мажора под хост, сам браузер
в рантайме НЕ доставляется. Версия Chrome следует за версией android-образа, а не за каталогом. Если понадобятся
конкретные версии: (а) Chromium-снапшоты (`chromium-browser-snapshots/Android_Arm64/<rev>/chrome-android.zip`,
~430 МБ, tip-of-tree, без стабильных версий и парного драйвера), (б) свой источник APK в бакете инсталляции,
(в) кастомы проекта — как сейчас. Держим (в); решать при варке каталога.

## Follow-up: показывать только те версии платформы, которые инсталляция реально может поднять — НЕ начато (юзер, 2026-09-07)

Линейка платформ install-static (`PlatformCatalogProvider`: android 13 и 14), а на дев-маке запечён только базовый AVD
`sw-android-14` → в UI можно выбрать `android 13`, окружение уходит в `PROVISIONING_TIMEOUT`. Правило: **версия
предлагается, только если её можно провизионить** — то же, что сегодня сделано для execution (селект сужен до
привязанных субстратов). Как: (а) линейка платформ — из конфига инсталляции (env/файл), а не из кода, чтобы каждая
инсталляция объявляла запечённое; (б) для пул-хостов — хост при регистрации рапортует, какие базовые AVD у него есть
(`avdmanager list avd` → `sw-android-<v>`), CP сужает версии по живым хостам привязки; (в) для docker/k8s/VM — наличие
`sw-linux-base:<v>` в registry/кэше — как минимум конфиг. UI прячет недоступные версии, API отвечает 400 с перечнем
доступных (сейчас `UnsupportedPlatformError` знает только линейку).

## Follow-up: расширить список устройств — не только Pixel — НЕ начато (юзер, 2026-09-07)

Каталог устройств (`devices` в линейке платформы) сегодня: `pixel-7`, `pixel-3a` (android), `desktop` (ubuntu). Расширить:
(а) android-эмуляторы — весь актуальный Pixel-ряд из device definitions SDK (`pixel_8`, `pixel_8_pro`, `pixel_fold`,
`pixel_tablet`…) плюс generic-профили (`medium_phone`, `small_phone`, `tablet`); (б) профили под чужие модели (Samsung Galaxy
S/A, Xiaomi) — свои device definitions (devices.xml: экран/dpi/RAM) в golden-образе хоста, id вида `galaxy-s24`; для
эмулятора это форм-фактор («похожий на»), прошивка остаётся SDK-образом — честно писать в displayName/описании;
(в) реальные устройства (`execution: device`) — те же id, но detected с железа (`ro.product.model`); (г) iOS — device types
`simctl` при появлении платформы. `displayName` уже в API/UI — показывать его вместо id в селекте и строке окружения.
