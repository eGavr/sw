# Мак как pool-host: android-эмуляторы слотами на своей машине

Локальная проверка всей baremetal-вертикали без облака: control plane считает твой мак «машиной
пула» (`local:android:emulator:baremetal`, host-провайдер `byo`), host-агент на маке поднимает
эмуляторы слотами по desired-состоянию из чекина. Это ровно тот же пул/мост/агент-протокол, что и у
арендованного metal-а — отличается только источник машины (её «заказ» = ты сам запускаешь агента).

## Предпосылки (один раз)

- Android SDK с эмулятором (`$ANDROID_HOME/emulator/emulator`, `adb` в PATH; дефолтный путь на маке
  `~/Library/Android/sdk` агент знает сам).
- AVD c именем по контракту **`sw-android-<версия>`** (версия = `platform.version` окружения):

  ```bash
  sdkmanager "system-images;android-34;google_apis;arm64-v8a"
  avdmanager create avd -n sw-android-34 -k "system-images;android-34;google_apis;arm64-v8a"
  ```

- `appium` в PATH (`npm i -g appium && appium driver install uiautomator2`), `node`, `python3`, `curl`.
- Запущенный локальный стек: api :4000, wd :3001, internal :3002, worker, Postgres.

## Прогон

1. **Привязка** (один раз на проект): подключи облако `local` и добавь платформу
   `android / emulator / baremetal` (конфиг пустой; квоту можно поднять ключом `maxEnvironments`).
   Через UI (Settings → Cloud → Add platform) или API `POST …/cloudAccounts/{id}/computeBindings`.

2. **Окружение**: `POST /v1/projects/{p}/environments` с
   `{"platform":{"name":"android","version":"34"},"execution":"emulator","applications":[{"name":"chrome","version":"latest"}]}` —
   окружение повиснет в `PREPARING`, а пул «закажет машину».

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

5. **Сессия**: обычный create-session через wd (`platformName: android` в caps не нужен — матчинг по
   привязке/приложению как всегда). Второе окружение сядет **вторым слотом на ту же машину** — это и
   есть нарезка.

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
