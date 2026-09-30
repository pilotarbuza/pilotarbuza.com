# pilotarbuza.com

Сайт-визитка Максима Ахмадулина (pilot_arbuza). Статика без сборки: `index.html`, `404.html`, `assets/`.

- Портфолио и фото: https://pilotarbuza.ru
- Облако (Nextcloud): https://m.pilotarbuza.com

## Локально

```sh
python3 -m http.server 8080
# открыть http://localhost:8080
```

## Деплой

GitHub Pages: `CNAME` указывает на `pilotarbuza.com`, `404.html` подхватывается
автоматически. В настройках репозитория включите Pages → Source: `main` / root.

## Структура

- `index.html` — все секции: точечное табло, имя и DEPARTURES, контакты, обо мне, маршрут, проекты, навыки, вершины, магазин.
- `assets/style.css` — палитра и шрифты в `:root`, адаптив в конце файла.
- `assets/main.js` — динамика: точки в hero, перещёлкивание табло, маршрут по скроллу, счётчики, карусели, курсор-самолёт.
- `assets/img/` — портрет и текстура зерна.

## Что править

- Ники Telegram и Instagram, цены футболок и фото вершин помечены квадратными скобками.
- Слова в точечном табло — функция `linesFor` в `assets/main.js`.
