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
- Запущенный локальный стек: api :4000, wd :3001, internal :3002, worker, Postgres.

## Прогон

1. **Привязка** (один раз на проект): подключи облако `local` и добавь платформу
   `android / emulator / baremetal` (конфиг пустой; квоту можно поднять ключом `maxEnvironments`).
   Через UI (Settings → Cloud → Add platform) или API `POST …/cloudAccounts/{id}/computeBindings`.

2. **Окружение**: `POST /v1/projects/{p}/environments` с
   `{"platform":{"name":"android","version":"14"},"execution":"emulator","applications":[{"name":"settings"}]}` —
   окружение повиснет в `PREPARING`, а пул «закажет машину». `settings` — предустановленное системное
   приложение (доставлять нечего). Чтобы доставить **свой APK**: положи его в бакет проекта (в dev с
   `LOG_STORAGE=fs` это `apps/backend/.dev-storage/<bucket>/<key>`), настрой storageDestination
   проекта, зарегистрируй приложение и билд, затем сошлись на него в окружении:

   ```bash
   curl -X POST …/projects/{p}/platforms/android/applications -d '{"name":"myapp"}'
   curl -X POST …/platforms/android/applications/myapp/versions -d '{"alias":"v1","appRef":"builds/app.apk"}'
   # applications:[{"name":"myapp"}] в create-environment
   ```

   Слот скачает APK через CP-ручку `…:downloadApp`, измерит его манифест (`aapt2`) и поставит
   `adb install`; измеренные package id + версия появятся в строке окружения (`measuredName`,
   `version`). Браузерный билд с парным webdriver (`webdriverRef`) слот отдаст Appium как
   `appium:chromedriverExecutable`.

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
   wd-дверь слота (Grid-`/status` + прокси на appium) → штатный env-агент. Окружение перейдёт в
   `ACTIVE` c endpoint `http://127.0.0.1:46xx`.

5. **Сессия**: обычный create-session через wd. Приложение называется `browserName`/`browserVersion`
   или (любое, не только браузер) `sw:appName`/`sw:appVersion`; стереотип — `sw:platformName` /
   `sw:platformVersion` (префикс) / `sw:deviceModel` (`Pixel 7` в любом написании), принимаются и
   стандартные `platformName` / `appium:platformVersion` / `appium:deviceName`. Все опциональны:
   не указано — любое; указано — матч на окружение (обязательно по смыслу, когда одно слово, напр.
   `chrome`, стоит и на ubuntu, и на android). Второе окружение сядет **вторым слотом на ту же
   машину** — это и есть нарезка.

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
- **VNC нет**: конвейер scrcpy→Xvfb→x11vnc линуксовый. На маке эмулятор можно смотреть напрямую —
  убери `-no-window` в слот-режиме скрипта.
- Гетерогенная ёмкость (мак-1 на 8 слотов, мак-2 на 12) — пока одна на всех из `POOL_HOST_SLOTS`.
