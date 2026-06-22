# Схема архитектуры приложения FoodDash Web-Shop

Документ описывает текущую архитектуру приложения по структуре проекта: клиентская часть React/Vite, сервер Express, общий слой типов и схем, PostgreSQL через Drizzle ORM, файловое хранилище изображений и модули заказов/доставки.

Готовая SVG-схема находится в файле [architecture-diagram.svg](architecture-diagram.svg). Ниже оставлены Mermaid-версии схем, чтобы их было удобно редактировать в Markdown.

![Схема архитектуры FoodDash Web-Shop](architecture-diagram.svg)

## Общая схема

```mermaid
flowchart TB
  subgraph Users["Пользователи"]
    Guest["Гость"]
    Customer["Покупатель"]
    Courier["Курьер"]
    Admin["Администратор"]
  end

  subgraph Client["Клиентский слой: client"]
    Browser["Браузер"]
    Router["React SPA + wouter\nclient/src/App.tsx"]
    Pages["Страницы\nStorefront, CustomerAccount,\nCourierPage, Dashboard,\nProducts, Orders, Reports, Users"]
    Components["Компоненты UI и бизнес-компоненты\nSidebar, ProductForm,\nCourierDelivery, OrderMap"]
    Hooks["React Query hooks\nuse-auth, use-products,\nuse-orders, use-courier,\nuse-customer, use-admin"]
    QueryClient["queryClient/apiRequest\nclient/src/lib/queryClient.ts"]
  end

  subgraph Shared["Общий слой контрактов: shared"]
    SharedRoutes["API-контракты и URL\nshared/routes.ts"]
    SharedSchema["Drizzle-схема, Zod-схемы и типы\nshared/schema.ts"]
  end

  subgraph Server["Серверный слой: server"]
    Entry["Express bootstrap\nserver/index.ts"]
    Middleware["Middleware\nJSON, session, hydrateSessionUser,\n/uploads, логирование"]
    Auth["Аутентификация и роли\nserver/auth.ts"]
    ApiRoutes["Основной API\nserver/routes.ts"]
    AdminOrders["Админ-заказы\nserver/routes-admin-orders.ts"]
    CourierDelivery["Доставка курьера\nserver/routes-courier-delivery.ts"]
    Cancellation["Отмены и возвраты\nserver/routes-cancellation.ts"]
    Storage["Слой доступа к данным\nserver/storage.ts"]
    DeliverySequence["Сервис маршрута доставок\nserver/delivery-sequence.ts"]
    Reports["Excel-отчеты\nserver/excel-report.ts"]
    StaticBuild["Продакшен-статика\nserver/static.ts"]
    ViteDev["Vite dev middleware\nserver/vite.ts"]
  end

  subgraph Data["Данные и файлы"]
    Postgres[("PostgreSQL")]
    Drizzle["Drizzle ORM + pg pool\nserver/db.ts"]
    Uploads[("uploads/\nизображения товаров")]
    Dist[("dist/public\nсобранный фронтенд")]
    Excel["XLSX-файл отчета"]
  end

  subgraph External["Внешние/платформенные сервисы"]
    Geo["Геолокация браузера\nGPS курьера"]
    Maps["Карта в интерфейсе\nOrderMap"]
    Messenger["MAX / Telegram\nконтакт менеджера"]
    Marketplaces["Статусы маркетплейсов\nWildberries, Ozon, Yandex"]
  end

  Guest --> Browser
  Customer --> Browser
  Courier --> Browser
  Admin --> Browser

  Browser --> Router
  Router --> Pages
  Pages --> Components
  Pages --> Hooks
  Components --> Hooks
  Hooks --> QueryClient
  QueryClient -->|"HTTP JSON / cookies / SSE"| Entry

  SharedRoutes -. "пути API" .-> QueryClient
  SharedRoutes -. "пути API" .-> ApiRoutes
  SharedSchema -. "типы и валидация" .-> Pages
  SharedSchema -. "таблицы и типы" .-> Storage

  Entry --> Middleware
  Middleware --> Auth
  Auth --> ApiRoutes
  Auth --> AdminOrders
  Auth --> CourierDelivery
  Auth --> Cancellation

  ApiRoutes --> Storage
  AdminOrders --> Storage
  CourierDelivery --> DeliverySequence
  CourierDelivery --> Storage
  Cancellation --> Storage
  ApiRoutes --> Reports

  Storage --> Drizzle
  DeliverySequence --> Drizzle
  AdminOrders --> Drizzle
  CourierDelivery --> Drizzle
  Cancellation --> Drizzle
  Drizzle --> Postgres

  ApiRoutes --> Uploads
  Entry --> StaticBuild
  StaticBuild --> Dist
  Entry --> ViteDev
  Reports --> Excel

  Components --> Maps
  Components --> Geo
  Geo --> ApiRoutes
  ApiRoutes --> Messenger
  ApiRoutes --> Marketplaces
```

## Поток оформления и доставки заказа

```mermaid
sequenceDiagram
  actor Customer as Покупатель
  participant UI as React SPA
  participant API as Express API
  participant Auth as Session/Role guard
  participant Storage as DatabaseStorage
  participant DB as PostgreSQL
  actor Courier as Курьер
  actor Admin as Администратор

  Customer->>UI: Выбирает товары и оформляет заказ
  UI->>API: POST /api/orders
  API->>Auth: requireRole("customer")
  Auth-->>API: Пользователь подтвержден
  API->>Storage: createOrder(customerId, payload)
  Storage->>DB: transaction: orders, order_items, products stock, saved_addresses, bonus_transactions, order_events
  DB-->>Storage: Заказ и событие создания
  Storage-->>API: OrderWithItems
  API-->>UI: 201 Created

  Courier->>UI: Берет доступный заказ
  UI->>API: POST /api/courier/delivery/accept
  API->>Auth: requireRole("courier")
  API->>DB: courier_deliveries + orders.courier_id/status + order_events
  API-->>UI: Активная доставка

  Courier->>UI: Меняет статус или отправляет GPS
  UI->>API: PUT /api/courier/delivery/:id/status или POST /api/courier/location
  API->>DB: courier_deliveries, orders, courier_locations, order_events
  API-->>UI: Обновленный статус

  Customer->>UI: Открывает историю/отслеживание
  UI->>API: GET /api/customer/orders/:id/events/stream
  API-->>UI: SSE-события заказа
  UI->>API: GET /api/orders/:id/courier-location
  API-->>UI: Последняя GPS-точка курьера

  Admin->>UI: Управляет заказом при необходимости
  UI->>API: /api/admin/orders, reassign, unassign, remove item
  API->>DB: orders, courier_deliveries, order_items_removed, order_cancellations, order_events
  API-->>UI: Обновленное состояние заказа
```

## Зоны ответственности

| Зона | Основные файлы | Назначение |
| --- | --- | --- |
| Клиентское приложение | `client/src/App.tsx`, `client/src/pages/*`, `client/src/components/*` | Маршрутизация, экраны витрины, личного кабинета, панели курьера и админ-панели. |
| Клиентский доступ к API | `client/src/hooks/*`, `client/src/lib/queryClient.ts` | Запросы через React Query, мутации, кэширование и обновление интерфейса. |
| Общие контракты | `shared/schema.ts`, `shared/routes.ts` | Типы ролей, статусов, таблиц, Zod-валидация и константы API-путей. |
| Запуск сервера | `server/index.ts` | Express-приложение, middleware, сессии, загрузка API, Vite dev server или production static. |
| Безопасность | `server/auth.ts` | Cookie-сессии, хэширование паролей, проверка авторизации и ролей. |
| Основной API | `server/routes.ts` | Авторизация, пользователи, товары, заказы, кабинет покупателя, бонусы, график, GPS, аналитика, чат. |
| Управление заказами | `server/routes-admin-orders.ts`, `server/routes-cancellation.ts` | Назначение курьеров, отмены, возвраты, удаление позиций, причины отмен. |
| Доставка | `server/routes-courier-delivery.ts`, `server/delivery-sequence.ts` | Активные доставки курьера, очередность маршрута, статусы доставки, ограничения до 3 активных доставок. |
| Доступ к данным | `server/storage.ts`, `server/db.ts` | Транзакции, CRUD-операции, аналитические выборки, подключение к PostgreSQL. |
| Отчеты и файлы | `server/excel-report.ts`, `uploads/`, `dist/public` | Генерация XLSX-отчетов, хранение изображений, раздача production-сборки. |

## Основные сущности базы данных

```mermaid
erDiagram
  users ||--o{ orders : customer
  users ||--o{ orders : courier
  users ||--o{ courier_schedule : has
  users ||--o{ courier_locations : sends
  users ||--o{ bonus_transactions : has
  users ||--o{ courier_applications : reviews

  products ||--o{ order_items : included
  orders ||--o{ order_items : contains
  orders ||--o{ order_events : logs
  orders ||--o{ courier_locations : tracked_by
  orders ||--o{ courier_deliveries : delivered_as
  orders ||--o{ order_cancellations : may_have
  orders ||--o{ order_items_removed : may_have

  users ||--o{ saved_addresses : stores
  users ||--o{ manager_contacts : updates
  delivery_reasons ||--o{ order_cancellations : explains
```

Ключевая идея архитектуры: клиент работает как единое SPA-приложение, сервер предоставляет REST/SSE API с ролевой защитой, а бизнес-логика заказов и доставки фиксируется транзакциями PostgreSQL и событиями `order_events`.
