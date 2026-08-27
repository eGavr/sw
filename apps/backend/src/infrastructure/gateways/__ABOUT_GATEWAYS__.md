# О gateway-ах (и чем они отличаются от репозиториев)

Этот документ — пара к [`../repositories/`](../repositories/) (репозитории) и объясняет **вторую разновидность
driven-порта** нашего data-слоя — **gateway**. Источники в конце.

Коротко: **репозиторий — это «коллекция МОИХ доменных сущностей» (хранилище); gateway — это «обёртка над ЧУЖОЙ
внешней системой» (интеграция).** Оба — driven-порты (их вызывает use-case), но абстрагируют они разное.

---

## 1. Что такое gateway

Определение Мартина Фаулера (PoEAA): **Gateway — это объект, инкапсулирующий доступ к внешней системе или
ресурсу.** Идея дословно: «интересный софт редко живёт в изоляции — приходится ходить во внешние штуки (БД чужого
сервиса, платёжный провайдер, докер-демон, очередь, стороннее API). У этих штук свои — часто корявые — API. Оберни
весь этот специфичный API в класс, интерфейс которого выглядит как обычный объект **в твоём словаре**, а он уже
транслирует твои простые вызовы в специфичный API внешней системы» ([Fowler, Gateway](https://martinfowler.com/eaaCatalog/gateway.html),
[Fowler 2021](https://martinfowler.com/articles/gateway-pattern.html)).

То есть gateway абстрагирует **чужую систему** (её протокол/SDK/формат), пряча её за простым интерфейсом и работая
как **anti-corruption layer**: наружу — наш язык, внутрь — чужой API.

```text
use-case  ──►  PaymentGateway.charge(payment)      // наш словарь
                     │
                     ▼
               Stripe SDK: POST /v1/charges {...}   // чужой корявый API спрятан внутри
```

## 2. Gateway vs Repository — ключевое различие

Оба «инкапсулируют доступ к чему-то внешнему», но:

| | **Repository** | **Gateway** |
|---|---|---|
| Что абстрагирует | хранилище(а) **МОЕЙ** доменной сущности | **ЧУЖУЮ** внешнюю систему/ресурс |
| Метафора | «in-memory коллекция моих агрегатов» | «фасад/переводчик к внешнему API» |
| Словарь методов | словарь ХРАНИЛИЩА: `get`/`find`/`list`/`save`/`create`/`delete` | словарь ОПЕРАЦИИ над чужой системой: `charge`/`send`/`fetch`/`provision`/… |
| Имя | `<Сущность>Repository` (сущность обязана быть в `domain/entities`) | `<ЧтоАбстрагирует>Gateway` |
| Возвращает | **всегда мою доменную сущность** (реконституирует из хранилища) | результат операции / `void` / чужие данные (см. §3) — **НЕ реконституирует мой агрегат** |

Правило большого пальца: **если это хранение/получение МОЕГО агрегата → Repository; если это команда/запрос к
ЧУЖОЙ системе → Gateway.** (Fowler даже отмечает: репозиторий может *использовать* gateway-и внутри — gateway
переводит в конкретный источник, репозиторий сверху даёт collection-фасад. У нас низкоуровневую роль играет
data-source, а gateway — сосед репозитория для актуации внешней системы.)

Разграничение — по **назначению**, а не по типам аргументов (gateway тоже может принимать доменные объекты, см. §3).

## 3. Что gateway принимает на вход и что возвращает (главный вопрос)

**На вход** — что нужно операции: часто **доменные сущности/VO** (как и репозиторий), иногда примитивы.
**Возвращает** — **результат операции**: `void` (побочный эффект), доменно-осмысленный результат, или чужие данные,
**смапленные в домен**. Чего он НЕ делает — не «достаёт/сохраняет мой агрегат из хранилища» (это репозиторий).

Псевдокод (не реальный код):

```text
// Платёжный gateway: принимает доменный Payment, возвращает доменный результат (успех/отказ + чужой charge id)
PaymentGateway.charge(payment: Payment): PaymentResult
    → внутри: перевести payment в тело запроса Stripe → POST → распарсить ответ → смапить в PaymentResult

// Почтовый gateway: принимает доменное сообщение, возвращает void (эффект «письмо ушло»)
EmailGateway.send(message: EmailMessage): void

// Read-gateway: принимает VO, возвращает VO (чужой JSON смаплен в домен)
WeatherGateway.currentTemperature(city: City): Temperature
```

Ответ на «принимает/возвращает доменные сущности как репо, или что?»:
- **вход** — да, может принимать доменные сущности/VO (не обязан — бывает и примитив);
- **выход** — НЕ «мой агрегат из хранилища», а **исход операции** (`void`/результат/смапленные чужие данные).

Сравни:
```text
Repository:  save(environment: Environment): void          // положил МОЙ агрегат в МОЁ хранилище
Repository:  get(id): Environment                          // достал МОЙ агрегат из МОЕГО хранилища
Gateway:     provision(environment: Environment): void     // скомандовал ЧУЖОЙ системе поднять контейнер
```
Первые два — про хранение МОЕЙ сущности. Третий — про действие над ЧУЖОЙ системой (Docker), хотя на вход тоже
доменная сущность.

## 4. Наш пример: `EnvironmentProviderGateway`

Внешняя система, которая **реально поднимает/гасит окружения** (сейчас Docker, в будущем облако), — это ЧУЖАЯ
система. Хранение самого окружения (реестр, состояние) — это Postgres, им заведует `EnvironmentRepository`.
Актуация контейнера — это `EnvironmentProviderGateway`.

```text
EnvironmentProviderGateway (порт)
    provision(environment: Environment): void      // поднять контейнер под окружение (идемпотентно)
    deprovision(environment: Environment): void     // снести контейнер

DockerEnvironmentProviderGateway (адаптер)
    → внутри: image из resolver-а, labels из environment.id/accountId → DockerClient.run/remove
```

Use-case воркера зависит **и от репозитория, и от gateway-я** (это канон Clean/Hexagonal — application-сервис
зависит от нескольких driven-портов):
```text
env = environmentRepository.withNextEnqueued(e => e.claim())   // ХРАНИЛИЩЕ: забрал мой агрегат под локом
environmentProviderGateway.provision(env)                       // ЧУЖАЯ СИСТЕМА: поднял контейнер
env.markDispatched(); environmentRepository.save(env)           // ХРАНИЛИЩЕ: сохранил новое состояние
```

## 5. Именование и методы

- **Имя** — `<ЧтоАбстрагирует>Gateway`: `PaymentGateway`, `EmailGateway`, `EnvironmentProviderGateway`. Суффикс
  `Gateway` явно говорит «это интеграция с внешней системой», а не хранилище.
- **Методы** — в **нашем** словаре, по смыслу операции над внешней системой: `charge`, `refund`, `send`, `fetch`,
  `provision`, `deprovision`. Именно те глаголы (`send`/`start`/`stop`/`execute`/…), которые **запрещены**
  репозиторию (см. `__ABOUT_REPOSITORIES__.md` §4), у gateway-я **уместны** — потому что gateway и есть «действие
  над чужой системой».
- **Что прячем внутри адаптера** — весь backend-специфичный клиент (SDK/CLI/HTTP), маппинг форматов и изоляцию
  ошибок; наружу порт отдаёт доменно-осмысленный результат.

## 6. Где хранить (папка) — порт vs адаптер

Каноничный hexagonal: **порт (интерфейс) — в ядре** (`application`/`domain`, `ports/out`), **адаптер — в
`infrastructure`**; зависимости смотрят внутрь, generic-папку `data` для порта не советуют
([hexagonal folder structure](https://codeartify.substack.com/p/folder-structures),
[scalastic: ports & adapters](https://scalastic.io/en/hexagonal-architecture/)).

Мы приняли именно строгий вариант (рефактор R2): **все driven-порты — абстрактные классы в `application/interfaces/`,
их реализации — в `infrastructure/`**. Это касается и репозиториев, и gateway-ев одинаково:
```text
src/application/interfaces/
    gateways/<что>-gateway.ts               # порт gateway: абстрактный класс, методы в нашем словаре
    repositories/<сущность>-repository.ts   # порт репозитория: абстрактный класс

src/infrastructure/gateways/<что-абстрагируем>/
    <backend>/<backend>-<что>-gateway.ts    # адаптер (клиент внешней системы внутри)
    <что>-gateway-provider.ts               # фабрика адаптера (по конфигу/провайдеру), если их несколько
src/infrastructure/repositories/<сущность>-repository-impl.ts   # реализация репозитория
```
Абстрактный класс (а не TS-`interface`) — потому что в NestJS он служит одновременно типом и **DI-токеном**:
`{ provide: EnvironmentProviderGateway, useClass: DockerEnvironmentProviderGateway }` (для репозиториев —
`{ provide: <X>Repository, useClass: <X>RepositoryImpl }`). Use-case инжектит порт по абстракции, композит-рут
(модуль) связывает его с реализацией. Порт зависит только от `domain`; реализация — от `domain` + свои data-source-ы/клиент.

## 7. Зависимости: что во что инжектится

**Repository и Gateway — сиблинги-адаптеры одного уровня; НИ ОДИН не инжектит другого.** Их координирует
**use-case** (application-сервис), который инжектит ОБА
([Ardalis: single level of abstraction](https://ardalis.com/should-controllers-reference-repositories-services/),
[Application-layer orchestrators](https://hector-reyesaleman.medium.com/application-layer-orchestrators-service-facades-9b71b6e2ff7f)):

| Компонент | Инжектит |
|---|---|
| use-case | репозитории **+** gateway-и (оба, через абстракции) — оркестратор |
| repository | ТОЛЬКО свои data-source-ы (части своего агрегата) |
| gateway | ТОЛЬКО свой backend-клиент (SDK/CLI внешней системы) |
| data-source | клиент своего backend-а |

Явно на твои вопросы:
- **gateway в репозиторий — НЕЛЬЗЯ.** Репозиторий хранит МОЙ агрегат; командовать чужой системой — не его дело.
- **репозиторий в gateway — НЕЛЬЗЯ.** Gateway оборачивает чужую систему; грузить/писать МОИ агрегаты — не его дело.

Признак ошибки (Ardalis): если захотелось «репозиторий зовёт gateway» (или наоборот) — координацию надо поднять
в use-case. Наша цепочка:
```text
presentation → use-case ─┬─► repository → data-source(s)      // МОИ данные
                         └─► gateway    → backend-client       // ЧУЖАЯ система
                         (repo и gateway друг друга НЕ видят)
```

## 8. Когда gateway, а когда repository — решалка

```text
Оперирую МОИМ агрегатом (создать/достать/сохранить/удалить), храня его в одном/нескольких источниках?
    → Repository (вернёт мой агрегат)
Командую/спрашиваю ЧУЖУЮ систему (оплатить, отправить, поднять, забрать её данные)?
    → Gateway (вернёт исход операции / чужие данные, смапленные в домен)
```

Классический тест: попробуй назвать метод в словаре ХРАНИЛИЩА. Ложится (`get`/`save`) → репозиторий. Не ложится
(`charge`/`provision`/`send`) → это действие над чужой системой → gateway.

---

## Источники
- Martin Fowler, *Patterns of Enterprise Application Architecture* — [Gateway](https://martinfowler.com/eaaCatalog/gateway.html),
  [Repository](https://martinfowler.com/eaaCatalog/repository.html), расширенная статья [Gateway (2021)](https://martinfowler.com/articles/gateway-pattern.html).
- [Gateway classes: a pattern for interacting with external services](https://theconversation.com/gateway-classes-a-pattern-for-interacting-with-external-services-65633).
- [The Gateway Pattern — Matt Brictson](https://mattbrictson.com/blog/gateway-pattern).
- Clean/Hexagonal (use-case зависит от нескольких driven-портов: repo + gateway): [Vaadin: DDD + Hexagonal](https://vaadin.com/blog/ddd-part-3-domain-driven-design-and-the-hexagonal-architecture),
  [Hexagonal by example (allegro.tech)](https://blog.allegro.tech/2020/05/hexagonal-architecture-by-example.html).
