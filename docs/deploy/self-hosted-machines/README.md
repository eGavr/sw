# Self-hosted machines: свои машины как облако (мак как первая машина)

Пользователь приносит не облако, а железо: одну или N машин с сетью и FQDN. Мы ставим на каждую
**machine agent**, машины становятся инвентарём облака типа `self-hosted`, а поверх — тот же пул,
что нарезает арендованный metal на слоты и запускает в них окружения. Кончились машины — `429`.
Дизайн и словарь — `docs/design/self-hosted-machines.md`. Здесь — как проверить всё локально, где
первая машина — твой мак (та же дорожка ляжет на любую linux-VM с `/dev/kvm`).

## Предпосылки на машине (один раз)

- Android SDK с эмулятором (`emulator`, `adb`); агент сам экспортит `ANDROID_HOME` (дефолт
  `~/Library/Android/sdk`, переопределяется env) и кладёт `platform-tools`/`emulator` в PATH.
- **Базовый** AVD c именем по контракту **`sw-android-<версия>`**, где версия — ПОЛЬЗОВАТЕЛЬСКАЯ версия
  Android (`platform.version` окружения: `14`, не API level 34). На маке `avdmanager` требует JDK 17+:

  ```bash
  sdkmanager "system-images;android-34;google_apis;arm64-v8a"
  JAVA_HOME=/opt/homebrew/opt/openjdk \
    avdmanager create avd -n sw-android-14 -k "system-images;android-34;google_apis;arm64-v8a" --device pixel_3a
  ```

  Без базового AVD машина будет `online`, но не `ready` — condition `BaseAvdMissing` в карточке машины.
- **Модель устройства** окружения (`platform.deviceModel`: `pixel-7`, `pixel-3a`) — hardware-профиль
  эмулятора: слот при первом запросе сам создаёт AVD **`sw-android-<версия>-<модель>`** из базового.
  Для `avdmanager` из слота агенту нужен `JAVA_HOME` (экспортировать перед запуском агента).
- `appium` + драйвер: `npm i -g appium && appium driver install uiautomator2`.
- SDK **build-tools** (`sdkmanager "build-tools;34.0.0"`) — слот измеряет доставленный APK через `aapt2`.
- `node`, `curl`, `perl` (в macOS и linux есть). **python3 не нужен.**
- **Live-VNC (опционально)** — конвейер `scrcpy → Xvfb → x11vnc → websockify` линуксовый; на маке слот
  поднимает его сайдкар-контейнером (docker/colima), если собран образ:

  ```bash
  docker build -t sw-android-vnc-sidecar images/android-vnc-sidecar
  ```

  Без образа машина `ready`, но с condition `VncStackMissing` (не блокирует: сессии работают, VNC пуст).
- **Видео сессий** пишет `scrcpy` с устройства — `brew install scrcpy` (тот же adb, что у SDK).
- Запущенный локальный стек: api :4000, wd :3001, internal :3002, worker, Postgres. В каталоге
  инсталляции должен быть тип `self-hosted` (`CLOUD_CATALOG=local,self-hosted` в `env/.env.development`;
  если api запущен с переменной окружения `CLOUD_CATALOG`, добавь `self-hosted` туда).

## Прогон

1. **Облако и платформа** (один раз на проект): Settings → Cloud → Add cloud → **Self-hosted**
   (конфига нет) → Add platform `android / emulator` (квота — `maxEnvironments`). Или API:

   ```bash
   curl -X POST "$API/v1/projects/$P/cloudAccounts" -H "Authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{"type":"self-hosted"}'
   curl -X POST "$API/v1/projects/$P/cloudAccounts/$C/computeBindings" -H "Authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' \
     -d '{"platform":"android","execution":"emulator","kind":"baremetal","config":{"maxEnvironments":2}}'
   ```

2. **Подключить машину**: `POST …/machines` с её адресом; `provides` по умолчанию — все платформы
   облака; `slotCapacity` — если хочешь задать слоты руками (иначе домен посчитает из cores /
   `MACHINE_SLOT_CORES`, дефолт 4). Для мака, где CP живёт на той же машине, адрес `127.0.0.1`.

   ```bash
   curl -X POST "$API/v1/projects/$P/cloudAccounts/$C/machines" -H "Authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{"fqdn":"127.0.0.1","slotCapacity":2}'
   # -> { "name": ".../machines/<uid>", "state": "pending", "admission": "open", "ready": false, ... }
   ```

3. **Токен регистрации и установка** — одноразовый токен показывается один раз вместе с готовой
   командой; она регистрирует машину, кладёт долгоживущий machine-токен в `~/.sw/machine.env`,
   скачивает агента и запускает его (на linux с systemd от root — как `sw-machine-agent.service`,
   иначе в foreground):

   ```bash
   curl -X POST "$API/v1/projects/$P/cloudAccounts/$C/machines/$M:generateRegistrationToken" \
     -H "Authorization: Bearer $TOKEN"
   # -> { "registrationToken": "…", "expireTime": "…", "installCommand": "curl -fsSL … | SW_INTERNAL_URL=… SW_MACHINE_ID=… SW_REGISTRATION_TOKEN=… bash" }
   ```

   На маке выполни `installCommand` в терминале (агент останется в foreground; для фона — `nohup`,
   как подсказывает установщик). Экспортируй перед этим `JAVA_HOME` и, если нужно,
   `SW_HOST_IP=127.0.0.1`. Адрес CP в команде — `SELF_HOSTED_INTERNAL_URL` инсталляции (дефолт
   `http://127.0.0.1:3002`) — должен быть достижим С МАШИНЫ.

4. **Машина online**: через ~3 с `GET …/machines/$M` покажет `state: online`, `ready: true`, факты
   (cores, virtualization `hvf`/`kvm`, emulator, AVD-ы, docker, VNC-стек), `slotCapacity`, и
   `conditions` — что мешает или деградирует. Агент синкается каждые ~3 с (`POST /internal/machines/{m}:sync`).

5. **Окружение**: как обычно, `POST /v1/projects/$P/environments` с `android/emulator`. Место
   занимается **синхронно**: нет свободной машины — сразу `429 RESOURCE_EXHAUSTED`, окружение не
   создаётся. Есть — окружение `PREPARING`, воркер берёт машину под аренду, агент на следующем синке
   получает слот: эмулятор → appium → VNC-конвейер → wd-дверь → env-агент → `ACTIVE`. В карточке
   машины появляется `lease` (привязка + окружения).

6. **Сессия / VNC / видео** — как у любого android-окружения (см. `images/android-vnc-sidecar/README.md`).

7. **Уборка**: `DELETE` окружения → слот гаснет на следующем синке; аренда живёт пустой
   `MACHINE_POOL_IDLE_TTL_MS` и возвращается — машина снова свободна (агент продолжает синкаться).
   `:cordon` / `:uncordon` — закрыть/открыть машину для новых аренд; `:drain` — опустошить и забыть
   (необратимо); `DELETE …/machines/$M` — отключить (под арендой — `FAILED_PRECONDITION`, с
   `?force=true` — сразу; агент получит 404 и погасит слоты).

## Дев-ручки

`MACHINE_POOL_SLOTS_PER_MACHINE` — оценка слотов на машину до её регистрации (на что сажаем
enqueued-аренду; после регистрации аренда берёт реальную ёмкость машины), `MACHINE_SLOT_CORES`
(ядер на слот), `MACHINE_POOL_IDLE_TTL_MS` (не возвращать пустую аренду посреди отладки),
`SELF_HOSTED_INTERNAL_URL`, `SW_HOME` у установщика (дефолт `~/.sw`), `SW_STATE_DIR` у агента
(дефолт `/tmp/sw-machine/<machine-id>`; там же `slots/<envId>/session.log`).

## Известные ограничения мак-машины (v1)

- **VNC — только через сайдкар-контейнер**: нативный конвейер линуксовый. Пояс «env-агент перезапускает
  x11vnc на конце сессии» в контейнер не дотягивается — на маке трубы рвёт только дверь.
- Эмулятор можно смотреть и напрямую: `SW_EMULATOR_WINDOW=1` в окружении агента при запуске из Terminal
  (работает только в десктоп-сессии, не под nohup/launchd).

## Linux-машина (VM или metal): что должно быть на ней

Тот же агент на linux поднимает VNC-конвейер нативно, если есть все четыре инструмента (проверка
`command -v`): **`scrcpy` ≥ 2.2** (Android 14 и `--time-limit` для записи видео; дистрибутивный 1.25
не годится — собрать как в `images/android-vnc-sidecar/Dockerfile`), **`xvfb`**, **`x11vnc`**,
**`websockify`**, плюс оконный менеджер (`openbox` или `fluxbox`) и `libgl1-mesa-dri`. Каждый слот
получает свой дисплей `:100+i`, x11vnc на `5900+i`, websockify на `127.0.0.1:7900+i`; наружу — только
wd-порты слотов `4600+i`. Плюс `/dev/kvm`, Android SDK с эмулятором и базовым AVD, appium, `node`,
`curl`, `perl`. Установщик при systemd и root ставит `sw-machine-agent.service`.
