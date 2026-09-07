# Мак как pool-host: android-эмуляторы слотами на своей машине

Локальная проверка всей baremetal-вертикали без облака: control plane считает твой мак «машиной
пула» (`local:android:emulator:baremetal`, host-провайдер `byo`), host-агент на маке поднимает
эмуляторы слотами по desired-состоянию из чекина. Это ровно тот же пул/мост/агент-протокол, что и у
арендованного metal-а — отличается только источник машины (её «заказ» = ты сам запускаешь агента).

## Предпосылки (один раз)

- Android SDK с эмулятором (`emulator`, `adb`); слот сам экспортит `ANDROID_HOME`
  (дефолт `~/Library/Android/sdk`, переопределяется env) и кладёт `platform-tools`/`emulator` в PATH.
- **Базовый** AVD c именем по контракту **`sw-android-<версия>`**, где версия — ПОЛЬЗОВАТЕЛЬСКАЯ версия
  Android (`platform.version` окружения: `14`, не API level 34 — маппинг на API-образ живёт здесь, при
  создании AVD). На маке `avdmanager` требует JDK 17+ — задать `JAVA_HOME`:

  ```bash
  sdkmanager "system-images;android-34;google_apis;arm64-v8a"
  JAVA_HOME=/opt/homebrew/opt/openjdk \
    avdmanager create avd -n sw-android-14 -k "system-images;android-34;google_apis;arm64-v8a" --device pixel_3a
  ```

  Существующий `sw-android-34` переименовать: `avdmanager rename avd -n sw-android-34 --new-name sw-android-14`
  (или пересоздать).

- **Модель устройства** окружения (`platform.deviceModel`: `pixel-7`, `pixel-3a` — линейка в
  `PlatformCatalogProvider`) — это hardware-профиль эмулятора: слот при первом запросе сам создаёт AVD
  **`sw-android-<версия>-<модель>`** из базового (системный образ читается из его `config.ini`) с
  `--device pixel_7` — экран, плотность, RAM, сенсоры, кнопки Pixel 7. Прошивка при этом остаётся
  SDK-образом (`ro.product.model=sdk_gphone…`) — «похожий на Pixel», не Pixel. Для `avdmanager` из
  слота агенту нужен `JAVA_HOME` (экспортировать перед запуском агента). Базовый AVD на устройство не
  влияет — его `--device` лишь дефолт для ручных запусков.

- `appium` + драйвер: `npm i -g appium && appium driver install uiautomator2`. **Гоча свежего appium 3.7:**
  драйвер `uiautomator2` может упасть с `Cannot find module '@appium/logger'` (пакет не хойстится) —
  лечится `cd ~/.appium/node_modules/appium-uiautomator2-driver && npm i @appium/logger`.
- SDK **build-tools** (`sdkmanager "build-tools;34.0.0"`) — слот измеряет доставленный APK через
  `aapt2` из build-tools (честная идентичность: package id + versionName). Без build-tools доставка
  всё равно работает, но приложение установится «неизмеренным» (в строке окружения не будет
  measured-полей).
- `node` и `curl`. **python3 НЕ нужен** — агент парсит JSON и спавнит слоты через `node` (единственный
  рантайм, который и так обязателен: wd-дверь и Appium — это node).
- **Live-VNC (опционально)** — конвейер `scrcpy → Xvfb → x11vnc → websockify` линуксовый; на маке слот
  поднимает его **сайдкар-контейнером** (docker/colima), если собран образ:

  ```bash
  docker build -t sw-android-vnc-sidecar images/android-vnc-sidecar
  ```

  Без образа слот честно живёт без VNC (сессии работают, вьюер скажет «route unavailable»). Подробности
  и контракт — `images/android-vnc-sidecar/README.md`.
- Запущенный локальный стек: api :4000, wd :3001, internal :3002, worker, Postgres.

## Прогон

1. **Привязка** (один раз на проект): подключи облако `local` и добавь платформу
   `android / emulator / baremetal` (конфиг пустой; квоту можно поднять ключом `maxEnvironments`).
   Через UI (Settings → Cloud → Add platform) или API `POST …/cloudAccounts/{id}/computeBindings`.

2. **Окружение**: `POST /v1/projects/{p}/environments` с
   `{"platform":{"name":"android","version":"14","deviceModel":"pixel-7"},"execution":"emulator","applications":[{"nameAlias":"settings"}]}` —
   окружение повиснет в `PREPARING`, а пул «закажет машину». `settings` — предустановленное системное
   приложение (доставлять нечего). Чтобы доставить **свой APK**: положи его в бакет проекта (в dev с
   `LOG_STORAGE=fs` это `apps/backend/.dev-storage/<bucket>/<key>`), настрой storageDestination
   проекта, зарегистрируй приложение и билд, затем сошлись на него в окружении:

   ```bash
   curl -X POST …/projects/{p}/platforms/android/applications -d '{"nameAlias":"myapp"}'
   curl -X POST …/platforms/android/applications/myapp/versions -d '{"versionAlias":"v1","appRef":"builds/app.apk"}'
   # applications:[{"name":"myapp"}] в create-environment
   ```

   Слот скачает APK через CP-ручку `…:downloadApp`, прочитает его манифест (`aapt2`) и поставит
   `adb install`; detected package id + версия появятся в строке окружения (`name`, `version` рядом с
   `nameAlias`/`versionAlias`). Предустановленное приложение (билд без артефакта) слот находит на
   девайсе по слову — пакет, чей последний сегмент равно слову (`chrome` → `com.android.chrome`) — и
   репортит его версию из `dumpsys package`. Браузерный билд с парным webdriver (`webdriverRef`, zip
   или голый бинарь) слот распакует и отдаст Appium как `appium:chromedriverExecutable`.

   **Каталожный Chrome на android** — это Chrome, предустановленный в образе `google_apis` (публичного
   Chrome-APK у Google нет): билд каталога = ярлык-мажор + chromedriver того же мажора **под хост**
   (на маке — `chromedriver_mac_arm64`, на metal — linux64; сид per-install). Узнать мажор образа:
   зарегистрировать билд без рефов, поднять окружение с `chrome` — слот отрапортует
   `com.android.chrome 113.0.5672.136`; мажоры ≤114 берутся из legacy-стора
   (`https://chromedriver.storage.googleapis.com/LATEST_RELEASE_113`), ≥115 — из Chrome for Testing.
   Сессия: `sw:appName: chrome` (+ `sw:platformName: android`) — CP даёт Appium `browserName: Chrome`
   для любого билда с парным webdriver.

3. **Смотри лог воркера** — byo-провайдер напечатал креды и готовую команду:

   ```text
   byo host provider: host <uuid> ordered — start the host agent on the machine:
     SW_HOST_ID=<uuid> \
     SW_HOST_TOKEN=<jwt> \
     SW_INTERNAL_URL=http://127.0.0.1:3002 \
     bash pool-host-agent.sh
   ```

4. **Скачай и запусти агента** (или запусти прямо из репо —
   `apps/backend/src/presentation/http/internal/controllers/pool-hosts/pool-host-agent.sh`):

   ```bash
   curl -H "Authorization: Bearer $SW_HOST_TOKEN" \
        "$SW_INTERNAL_URL/internal/poolHosts/agent:download" -o pool-host-agent.sh
   SW_HOST_ID=… SW_HOST_TOKEN=… SW_INTERNAL_URL=http://127.0.0.1:3002 bash pool-host-agent.sh
   ```

   Агент чекинится каждые ~3с, стартует слот: эмулятор (`-read-only`, console-порт слота) → appium →
   VNC-конвейер слота (нативно или сайдкаром, см. предпосылки) → wd-дверь слота (та же `wd-door.js`,
   что у linux-ноды, в диалекте `appium`: Grid-`/status`, одна сессия, idle-таймаут, роут
   `/session/{id}/se/vnc`) → штатный env-агент. Окружение перейдёт в `ACTIVE` c endpoint
   `http://127.0.0.1:46xx`. Порты слота — контракт CP (`SlotPorts`): wd `4600+i`, appium `4700+i`,
   console `5554+2i`, vnc (RFB) `5900+i`; websockify слота — `vnc+2000` на loopback.

5. **Сессия**: обычный create-session через wd. Приложение называется `browserName`/`browserVersion`
   или (любое, не только браузер) `sw:appName`/`sw:appVersion`; стереотип — `sw:platformName` /
   `sw:platformVersion` (префикс) / `sw:deviceModel` (`Pixel 7` в любом написании), принимаются и
   стандартные `platformName` / `appium:platformVersion` / `appium:deviceName`. Все опциональны:
   не указано — любое; указано — матч на окружение (обязательно по смыслу, когда одно слово, напр.
   `chrome`, стоит и на ubuntu, и на android). Второе окружение сядет **вторым слотом на ту же
   машину** — это и есть нарезка. **Live-VNC**: у сессии есть `sw:interactive`/`sw:vnc`, как у
   браузерной, — вкладка Sessions → VNC в UI показывает экран эмулятора и рулит им (клики, клавиатура);
   на конце сессии дверь рвёт трубы (вьюер не переживает сессию), а env-агент перезапускает x11vnc
   слота адресно по его RFB-порту (`SW_VNC_RFB_PORT`), не трогая соседние слоты.

6. **Уборка**: `DELETE` окружения → слот гаснет на следующем чекине; пустая машина живёт
   `POOL_HOST_IDLE_TTL_MS` (для дев-цикла удобно поднять) и затем забывается — агент получает 404 и
   выходит (сам мак, разумеется, остаётся твоим). Новый прогон = новые креды из лога.

## Дев-ручки

`POOL_HOST_SLOTS=2` (мак ≠ 48 ядер), `POOL_HOST_IDLE_TTL_MS=3600000` (не забывать машину посреди
отладки), `SW_HOST_IP` (переопределить адрес, по умолчанию мак определяет свой en0; для CP на этой же
машине правильно `127.0.0.1`), `SW_STATE_DIR` (по умолчанию `/tmp/sw-pool-host/<host-id>`; там же
`slots/<envId>/session.log`).

## Известные ограничения mac-слотов (v1)

- **Видео сессий нет**: рекордер env-агента грабит X-дисплей линуксового образа, на маке его нет
  (`sw:video` вернёт пустоту, окружение не пострадает — best effort).
- **VNC — только через сайдкар-контейнер** (см. предпосылки): нативный конвейер линуксовый. Пояс
  «env-агент перезапускает x11vnc на конце сессии» в контейнер не дотягивается — на маке трубы рвёт
  только дверь (для дев-стенда достаточно). Эмулятор можно смотреть и напрямую —
  `SW_EMULATOR_WINDOW=1` при запуске агента из Terminal.
- Гетерогенная ёмкость (мак-1 на 8 слотов, мак-2 на 12) — пока одна на всех из `POOL_HOST_SLOTS`.

## Linux-хост (арендованный metal): что должно быть в golden-образе для VNC

Тот же слот-скрипт на linux поднимает конвейер нативно, если на хосте есть все четыре инструмента
(проверка `command -v`): **`scrcpy` ≥ 2.1** (Android 14; дистрибутивный 1.25 не годится — брать
официальный x86_64-tarball, как в `images/android-node/Dockerfile`, либо собрать как в
`images/android-vnc-sidecar/Dockerfile`), **`xvfb`**, **`x11vnc`**, **`websockify`**, плюс оконный
менеджер (`openbox` или `fluxbox` — держит фокус клавиатуры на окне scrcpy) и `libgl1-mesa-dri`
(софтверный GL для scrcpy под Xvfb). Каждый слот получает свой дисплей `:100+i`, x11vnc на
`5900+i`, websockify на `127.0.0.1:7900+i`; наружу — только wd-порт слота.
