# pilotarbuza.com

[ English | [Русский](README.ru.md) ]

Personal site of Maksim Akhmadulin (pilot_arbuza). I study mechanical engineering, write CAD automation tools and spend the rest of my time around aviation.

The site is plain static files with no build step: `index.html`, `404.html` and `assets/`.

- Site: https://pilotarbuza.com
- Cloud storage: https://m.pilotarbuza.com

## Running locally

```sh
python3 -m http.server 8080
# Open http://localhost:8080
```

## Deployment

Every commit to `main` is published by Cloudflare Pages / GitHub Pages.
