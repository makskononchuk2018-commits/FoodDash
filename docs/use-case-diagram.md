# Диаграмма вариантов использования FoodDash Web-Shop

Готовый SVG-рисунок находится в файле [use-case-diagram.svg](use-case-diagram.svg). Редактируемый UML-исходник находится в файле [use-case-diagram.puml](use-case-diagram.puml). Его можно открыть в PlantUML-плагине для IDE или отрендерить командой:

```bash
plantuml docs/use-case-diagram.puml
```

Диаграмма составлена по текущей структуре проекта: маршрутам приложения, серверным API, ролям из схемы БД и реализованным страницам.

![Диаграмма вариантов использования](use-case-diagram.svg)

## Акторы

- **Гость**: просматривает каталог, использует ИИ-помощника, регистрируется, входит в систему, подает заявку на роль курьера.
- **Покупатель**: оформляет заказ, применяет промокоды и бонусы, смотрит историю, повторяет и отменяет заказы, отслеживает доставку на карте.
- **Курьер**: берет заказы в доставку, ведет активные доставки, меняет их статус, передает GPS-координаты, заполняет график и смотрит статистику.
- **Администратор**: управляет пользователями, товарами, заказами, заявками курьеров, графиком курьеров, контактами менеджера, аналитикой и отчетами.
- **Внешние системы**: маркетплейсы, сервис карт и геолокации, мессенджер для связи с менеджером.

## Mermaid-обзор

```mermaid
flowchart LR
  Guest([Гость])
  Customer([Покупатель])
  Courier([Курьер])
  Admin([Администратор])
  Marketplaces([Маркетплейсы])
  Geo([Карты и геолокация])
  Messenger([MAX / Telegram])

  subgraph System["FoodDash Web-Shop"]
    Browse((Просмотр каталога))
    Auth((Регистрация / вход))
    ApplyCourier((Заявка курьера))
    Chat((ИИ-помощник))

    Cart((Корзина))
    Checkout((Оформление заказа))
    Bonuses((Промокоды и бонусы))
    History((История заказов))
    Track((Отслеживание доставки))

    Available((Доступные заказы))
    CourierDelivery((Ведение доставок))
    CourierSchedule((График курьера))
    CourierStats((Статистика курьера))

    Users((Пользователи))
    Products((Товары и остатки))
    Orders((Управление заказами))
    Applications((Заявки курьеров))
    AdminSchedule((График курьеров))
    Analytics((Аналитика и отчеты))
    ManagerContact((Контакт менеджера))
  end

  Guest --- Browse
  Guest --- Auth
  Guest --- ApplyCourier
  Guest --- Chat

  Customer --- Browse
  Customer --- Cart
  Customer --- Checkout
  Customer --- History
  Customer --- Track
  Checkout -. include .-> Cart
  Checkout -. extend .-> Bonuses

  Courier --- Available
  Courier --- CourierDelivery
  Courier --- CourierSchedule
  Courier --- CourierStats
  Available -. include .-> CourierDelivery

  Admin --- Users
  Admin --- Products
  Admin --- Orders
  Admin --- Applications
  Admin --- AdminSchedule
  Admin --- Analytics
  Admin --- ManagerContact

  Products --- Marketplaces
  Track --- Geo
  CourierDelivery --- Geo
  ManagerContact --- Messenger
```

## Источники в проекте

- `shared/schema.ts`: роли пользователей, статусы заказов, таблицы заказов, бонусов, доставок, заявок курьеров и GPS-локаций.
- `client/src/App.tsx`: маршруты витрины, профиля покупателя, панели курьера и административной панели.
- `server/routes.ts`, `server/routes-admin-orders.ts`, `server/routes-courier-delivery.ts`, `server/routes-cancellation.ts`: серверные сценарии для авторизации, заказов, товаров, аналитики, курьеров и отмен.
- `client/src/pages/*` и `client/src/components/*`: реализованные пользовательские экраны.
