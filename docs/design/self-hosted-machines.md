# Self-hosted machines: своё железо как облако

Пользователь приносит не только облако, но и **свои машины** (железо есть, софта по нарезке и управлению
нет): N больших коробок с сетью и FQDN. Мы ставим на каждую своего агента, машины становятся инвентарём
его облака, а поверх — тот же пул, что нарезает арендованный metal на слоты и запускает в них окружения.
Кончились машины — `429 RESOURCE_EXHAUSTED`.

Ключевое решение (юзер, 2026-09-07): **self-hosted — это ещё одно облако с конечным инвентарём, а не
особый режим пула.** Пул просит «дай машину» одинаково у Yandex Cloud (заказ BareMetal-сервера) и у
self-hosted (взять свободную подключённую машину). Возврат по idle-TTL, списание за молчание,
orphan-sweep — всё как с metal; ничего в пуле не ветвится по типу облака.

## Словарь

Согласован 2026-09-08 после двух независимых ревью (слепое предложение + критика с проверкой репо).

| Понятие | Имя | Что это бизнесово |
| --- | --- | --- |
| Тип облака из своих машин | **`self-hosted`** (`CloudAccount.type`) | «мои машины» — как self-hosted runners у GitHub/GitLab. `local` остаётся строго «docker-демон коробки, где живёт CP»; byo-роут `local` для эмуляторов уходит в self-hosted (дев-мак = self-hosted облако с автоподключённой машиной) |
| Машина в инвентаре | **`Machine`** — `projects/{p}/cloudAccounts/{c}/machines/{m}` | Коробка, которую мы знаем: подключённая пользователем или заказанная у YC (тогда живёт ровно пока её держит пул). Физическая или виртуальная — неважно (Cluster API `Machine`). Единственная идентичность агента |
| Удержание машины пулом | **`MachineLease`** (было `PoolHost`) | Факт «пул сейчас держит одну машину под свою привязку»: у YC — заказ сервера, у self-hosted — взятая из инвентаря машина. Одна машина за жизнь порождает много аренд |
| Пул привязки | **`MachinePool`** (было `HostPool`) | Все аренды одной привязки; растёт по спросу до потолка, ужимается на простое, сажает окружения best-fit |
| Место окружения на машине | **`SlotAssignment`** (было `HostPlacement`) | Какое окружение, какой слот, с какими параметрами запуска |
| Раскладка портов слота | `SlotPorts` | Контракт CP с лончером: wd `4600+i`, appium `4700+i`, console `5554+2i`, vnc `5900+i` |
| Порт «кто даёт пулу машины» | **`MachineProviderGateway`** (было `HostProviderGateway`) | По образцу `EnvironmentProviderGateway`. `provision(lease) → Machine`, `deprovision(lease)`, `listProvisionedMachineIds`, `headroom(): Headroom = unbounded \| count` |
| Демон на машине | **`machine-agent.sh`** | Чекинится как машина, сводит слоты к желаемому набору. Env-агент в слоте — по-прежнему environment agent. Голое «agent» — табу |

Что НЕ `Machine`: VM под одно окружение (`kind: vm`, `VmProvisioner`) — это собственная виртуалка одного
окружения, без пула и без machine-agent. Граница проходит по роли («пул нарезает» vs «окружение занимает
целиком»), а не по физичности.

### Поля `Machine`

| Поле | Смысл |
| --- | --- |
| `fqdn` | Как до машины дотягиваются сессии; задаёт пользователь при подключении (агент адрес не определяет — на маке автоопределение врёт) |
| `provides[{platform, execution}]` | Какие стереотипы машина обслуживает (то же имя и форма, что `cloudTypes[].provides[]`). Хранится при подключении; пусто в запросе = все привязки облака на тот момент. Аренда эксклюзивна — смешивания на машине нет |
| `state: pending \| online \| offline` | Связность: агент ещё не пришёл / синхронизируется / замолчал. Факт, без оценок |
| `admission: open \| cordoned \| draining` | Намерение оператора: даём места / не даём (обратимо) / опустошаем перед отключением (необратимо) |
| `conditions[] {type, status, reason, message, lastTransitionTime}` | Пригодность, выведенная доменом из фактов: блокеры (`KvmMissing`, `AvdMissing`) и деградации (`VncStackMissing`) |
| `facts` | Сырой рапорт агента: cores, memory, `/dev/kvm`, emulator, AVD-ы, docker, scrcpy-стек, версия агента. Не `capabilities` — это слово W3C |
| `slotCapacity`, `slotCapacityOverride` | Слотов на машине: домен считает из cores по политике стереотипа; override — если оператор знает лучше |
| `lease: {binding, environments[], since} \| null` | Занята ли и кем — витрина; внутренняя аренда наружу не отдаётся |
| `ready` (производное) | `online` ∧ `open` ∧ нет блокирующих conditions — единственное, что смотрит пул при выделении |

### Состояния `MachineLease`

`enqueued → ordering → ready → deleting | failed`. `enqueued` — место окружению выдано синхронно на
create-environment, машина ещё не заказана/не взята (даёт честный 429); `ordering` — заказ ушёл или машина
берётся из инвентаря, ждём регистрацию; `ready` — раздаём слоты; `deleting` — возвращаем; `failed` —
списана (не приехала / замолчала).

## Как это ложится на существующий пул

| Пул просит | Yandex Cloud | self-hosted |
| --- | --- | --- |
| `provision(lease)` | заказать сервер, зарегистрировать эфемерную `Machine` | атомарно взять свободную `ready`-машину нужного стереотипа (`UPDATE … WHERE lease IS NULL … SKIP LOCKED`); нет свободных → `NoCapacity` |
| `deprovision(lease)` | удалить сервер и его `Machine` | снять аренду с машины; машина остаётся в инвентаре, агент продолжает чекиниться |
| `listProvisionedMachineIds` | серверы с нашим лейблом | машины с арендой, чью строку пул забыл |
| `headroom()` | unbounded (кап — квота) | число `ready`-машин без аренды |

Потолок пула = `min(квота привязки, headroom)`.

## Гарантия 429

Единица ёмкости — место (`SlotAssignment`) в аренде, и оно занимается **синхронно на create-environment
под пер-пуловым локом** (тот же advisory-lock, что сериализует `placeOrCreate`): есть место на `ready`-аренде
→ занято; нет — создаётся аренда `enqueued`, если строк меньше потолка; иначе `MachinePoolExhaustedError` →
`RESOURCE_EXHAUSTED` 429 с reason `MACHINE_POOL_AT_CAPACITY` (потолок пула, не квота тенанта — у квоты свой
429). Воркер потом заказывает/берёт машину для `enqueued`-аренд (посадка идемпотентна по env id).
Инвариант «строк пула ≤ потолка» держится под локом, поэтому две параллельные create не пройдут обе.
Единственный не-429-исход — машина исчезла между посадкой и выделением (detach / потеря агента): такое
окружение уходит в `failed`; это реальное событие, а не ошибка учёта. Цифры в UI («слотов занято/всего»)
и 429 читают одни и те же строки.

## Агент и авторизация

Одна идентичность — `Machine`, в обоих облаках. `POST /internal/machines:register` меняет одноразовый
`registrationToken` (выдаётся `:generateRegistrationToken`, вшит в `installCommand`) на долгоживущий
`machineToken`; `POST /internal/machines/{m}:sync` каждые ~3 с: агент шлёт факты и наблюдаемые слоты,
получает желаемые назначения своей текущей аренды (или пусто). CP по ssh не ходит: установка — одна
команда на машине (pull-модель, как `kubeadm join`); хосту нужен исходящий доступ к CP и входящие wd-порты
слотов. Follow-up: mTLS (агент генерирует ключ, CP подписывает клиентский серт с SAN `spiffe://sw/machine/<uid>`
на сутки, авторотация) — v2, форма зафиксирована.

## API

- `POST/GET/LIST/DELETE projects/{p}/cloudAccounts/{c}/machines[/{m}]` — подключить / посмотреть / отключить.
  `DELETE` под арендой — `FAILED_PRECONDITION`; `force=true` гасит окружения.
- `POST …/machines/{m}:generateRegistrationToken` → `{token, expireTime, installCommand}`.
- `POST …/machines/{m}:cordon` / `:uncordon` / `:drain`.
- `self-hosted` в `GET /v1/cloudTypes`; привязки как у всех (`android/emulator/baremetal`, позже `ubuntu/container/baremetal`).

## UI

Settings → Clouds: «Add cloud → Self-hosted» (конфига нет); карточка облака с платформами как у всех, бейдж
«N machines ready / M attached»; секция **Machines** (только у self-hosted): FQDN, Provides, State,
Admission, Conditions, Slots `used/total`, Last sync, Agent version; действия Cordon / Drain / Detach;
модалка **Attach machine** (FQDN, provides, slots override) → команда установки показывается один раз с
copy. Строка окружения на self-hosted получает подпись Machine.

## Срезы

- **S0 (сделано, ветка `refactor.machine-pool-vocabulary`)** — словарь пула без изменения поведения:
  `PoolHost → MachineLease`, `HostPool → MachinePool`, `HostPlacement → SlotAssignment`,
  `HostProviderGateway → MachineProviderGateway`, `poolHosts → machineLeases` (internal), `pool-host-agent.sh →
  machine-agent.sh`, `POOL_HOST_* → MACHINE_POOL_*`, таблицы `pool_host → machine_lease`, `host_placement →
  slot_assignment`. Идентичность агента (пока аренда: `SW_LEASE_ID`/`SW_LEASE_TOKEN`) меняется в S1.
- **S1 (сделано, ветка `feat.self-hosted-machines`)** — контекст `machine`: агрегат `Machine`, `self-hosted` в каталоге, `SelfHostedMachineProvider`
  (мост), `headroom` на порту, состояние `enqueued` + синхронная посадка → 429, `:register`/`:sync`, факты и
  conditions, публичный API машин, поглощение byo-роута `local`; интеграционные тесты (две машины → третье
  окружение 429; молчание → offline → возврат → online).
- **S2 (сделано, ветка `feat.self-hosted-ui`)** — UI: секция Machines на карточке self-hosted облака (бейдж
  «N ready / M attached», таблица с state/admission/ready/conditions/slots/last sync/agent), Attach machine с
  одноразовой командой установки, cordon/uncordon/drain/detach(force), подпись «on <fqdn>» у окружения.
- **S3** — live на VM юзера (есть `/dev/kvm`): attach, установка агента, env android → сессия → VNC → видео,
  429 при исчерпании, detach.
- **S4** — linux-слоты пула (`ubuntu/container/baremetal`): мост + docker-лончер слота на `sw-linux-base`.
- Follow-ups: mTLS агента; ротация `machineToken`; сегментирование записи scrcpy при «моргании» девайса.
