/* Города на глобусе. visited — красный пин, wish: true — синий (хочу побывать).
   Добавить город: одна строка { en, ru, tr?, c: код страны, lat, lon }. Статистика считается автоматически. */
window.PLACES = [
  // Россия
  { en: 'Saint Petersburg', ru: 'Санкт-Петербург', tr: 'Sankt-Peterburg', c: 'RU', lat: 59.94, lon: 30.31 },
  { en: 'Moscow', ru: 'Москва', tr: 'Moskova', c: 'RU', lat: 55.75, lon: 37.62 },
  { en: 'Shchyolkovo', ru: 'Щёлково', tr: 'Şçolkovo', c: 'RU', lat: 55.92, lon: 37.98 },
  { en: 'Ukhta', ru: 'Ухта', tr: 'Uhta', c: 'RU', lat: 63.57, lon: 53.68 },
  { en: 'Kazan', ru: 'Казань', tr: 'Kazan', c: 'RU', lat: 55.80, lon: 49.11 },
  { en: 'Samara', ru: 'Самара', tr: 'Samara', c: 'RU', lat: 53.20, lon: 50.15 },
  { en: 'Omsk', ru: 'Омск', tr: 'Omsk', c: 'RU', lat: 54.99, lon: 73.37 },
  { en: 'Sochi', ru: 'Сочи', tr: 'Soçi', c: 'RU', lat: 43.60, lon: 39.73 },
  { en: 'Tuapse', ru: 'Туапсе', tr: 'Tuapse', c: 'RU', lat: 44.10, lon: 39.07 },
  { en: 'Gurzuf', ru: 'Гурзуф', tr: 'Gurzuf', c: 'RU', lat: 44.55, lon: 34.28 },
  { en: 'Terskol', ru: 'Терскол', tr: 'Terskol', c: 'RU', lat: 43.26, lon: 42.51 },
  // Грузия
  { en: 'Tbilisi', ru: 'Тбилиси', tr: 'Tiflis', c: 'GE', lat: 41.72, lon: 44.79 },
  { en: 'Stepantsminda', ru: 'Степанцминда', tr: 'Stepantsminda', c: 'GE', lat: 42.66, lon: 44.64 },
  // Турция
  { en: 'Istanbul', ru: 'Стамбул', tr: 'İstanbul', c: 'TR', lat: 41.01, lon: 28.98 },
  { en: 'Ankara', ru: 'Анкара', tr: 'Ankara', c: 'TR', lat: 39.93, lon: 32.86 },
  { en: 'Konya', ru: 'Конья', tr: 'Konya', c: 'TR', lat: 37.87, lon: 32.49 },
  { en: 'Antalya', ru: 'Анталья', tr: 'Antalya', c: 'TR', lat: 36.90, lon: 30.70 },
  { en: 'Kemer', ru: 'Кемер', tr: 'Kemer', c: 'TR', lat: 36.60, lon: 30.56 },
  { en: 'Doğubayazıt', ru: 'Догубаязит', tr: 'Doğubayazıt', c: 'TR', lat: 39.55, lon: 44.08 },
  // Тунис
  { en: 'Monastir', ru: 'Монастир', tr: 'Monastir', c: 'TN', lat: 35.78, lon: 10.83 },
  // Хочу побывать
  { en: 'Shiraz', ru: 'Шираз', tr: 'Şiraz', c: 'IR', lat: 29.59, lon: 52.58, wish: true },
  { en: 'Isfahan', ru: 'Исфахан', tr: 'İsfahan', c: 'IR', lat: 32.65, lon: 51.68, wish: true },
  { en: 'Tehran', ru: 'Тегеран', tr: 'Tahran', c: 'IR', lat: 35.69, lon: 51.39, wish: true },
  { en: 'Yerevan', ru: 'Ереван', tr: 'Erivan', c: 'AM', lat: 40.18, lon: 44.51, wish: true },
  { en: 'Baku', ru: 'Баку', tr: 'Bakü', c: 'AZ', lat: 40.41, lon: 49.87, wish: true }
];
