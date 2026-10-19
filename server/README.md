# Предзаказы: сервис и админка

`orders.py` — маленький сервис на чистом Python 3.9+ (без зависимостей). Он принимает форму предзаказа
со страницы `/shop/`, хранит заказы в SQLite и отдаёт их странице `/admin/` после входа по паролю.
Сам сайт остаётся статикой; Caddy передаёт сервису только адреса `/api/*`.

Пока сервис не запущен, форма на сайте показывает «не получилось отправить» и ссылку на Telegram,
а `/admin/` — «сервер заказов недоступен».

## Установка на сервере

1. Пароль админки. Команда спросит пароль (от 10 символов) и напечатает строку с хешем — сам пароль нигде не хранится:

   ```sh
   python3 server/orders.py hash
   ```

2. Настройки — файл `/etc/pilotarbuza/orders.env` (права `600`, владелец — пользователь сервиса), по образцу `example.env`.
   Базу держите вне папки сайта, иначе её можно будет скачать по ссылке.

3. Служба systemd — `/etc/systemd/system/pilotarbuza-orders.service` (путь к репозиторию и пользователя подставьте свои):

   ```ini
   [Unit]
   Description=pilotarbuza.com preorders
   After=network.target

   [Service]
   User=www-data
   ExecStart=/usr/bin/python3 /srv/pilotarbuza.com/server/orders.py --env-file /etc/pilotarbuza/orders.env
   Restart=on-failure

   [Install]
   WantedBy=multi-user.target
   ```

   ```sh
   sudo mkdir -p /var/lib/pilotarbuza && sudo chown www-data /var/lib/pilotarbuza
   sudo systemctl daemon-reload && sudo systemctl enable --now pilotarbuza-orders
   ```

4. Caddy — в блок `pilotarbuza.com` добавьте перед `file_server`:

   ```caddy
   @private path /server/* /.git/*
   respond @private 404

   handle /api/* {
       reverse_proxy 127.0.0.1:8787
   }
   ```

   ```sh
   sudo systemctl reload caddy
   curl https://pilotarbuza.com/api/health     # {"ok": true}
   ```

## План и CRM

`crm.py` подключается к тому же сервису и хранит план работ, контакты, историю общения и календарь
в той же базе (`ORDERS_DB`, таблица `records`). При первом запуске с пустой таблицей в неё загружается
`crm_seed.json` — двухлетний план ANY1. Страница — `/admin/plan/`, вход тем же паролем.
Резервная копия — кнопка «Скачать резервную копию» в меню страницы (`/api/admin/crm/export.json`).

После обновления кода службу нужно перезапустить, иначе страница скажет, что план не загрузился:

```sh
sudo systemctl restart pilotarbuza-orders
```

## Как это защищено

- Пароль проверяется на сервере (PBKDF2-SHA256), в коде страницы его нет. После 5 неверных попыток вход с этого адреса закрыт на 15 минут.
- Сессия — cookie `HttpOnly; Secure; SameSite=Strict` на 12 часов; перезапуск службы разлогинивает.
- Форма: проверка всех полей на сервере, не больше 5 заявок за 10 минут с одного адреса, поле-ловушка от ботов.
- Сервис слушает только `127.0.0.1`.

## Уведомления и резервная копия

- Если в настройках заданы `TG_BOT_TOKEN` и `TG_CHAT_ID`, о каждом новом предзаказе придёт сообщение в Telegram.
- Заказы лежат в одном файле `ORDERS_DB`; копия — `sqlite3 orders.db ".backup orders-copy.db"`. В админке есть выгрузка в CSV.

## Локально

```sh
python3 server/orders.py hash                       # вставьте строку в dev.env
python3 server/orders.py --env-file dev.env --static .
# сайт и API на http://localhost:8787, админка — /admin/
```

Списки принтов, расцветок и размеров продублированы в `orders.py` и `assets/shop.js` — меняйте в обоих местах.
