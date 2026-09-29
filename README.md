# pilotarbuza.com

Сайт-визитка. Статика без сборки: `index.html`, `404.html`, `assets/`.

- Портфолио: https://pilotarbuza.ru
- Облако (Nextcloud): https://m.pilotarbuza.com

## Локально

```sh
python3 -m http.server 8080
# открыть http://localhost:8080
```

## Деплой

Репозиторий готов к GitHub Pages: `CNAME` указывает на `pilotarbuza.com`,
`404.html` подхватывается автоматически. В настройках репозитория включите
Pages → Source: `main` / root.

## Что править

- Тексты, ссылки и контакты — прямо в `index.html` (секции `hero`, `links`, `about`, `contacts`).
- Палитра и шрифты — переменные в начале `assets/style.css`.
- Слова в точечном заголовке — массив `LINES` в `assets/main.js`.
