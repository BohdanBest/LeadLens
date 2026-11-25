# Архітектура платформи LeadLens

## 1. Компоненти

1. **Frontend (`frontend/`)** — React + Vite + TypeScript + Sass (CSS Modules). Взаємодіє з Core API через REST `/api/v1` (Bearer JWT, курсорна пагінація, RFC 7807 Problem Details).
2. **Backend API (`backend/`)** — ASP.NET Core 8 Web API + EF Core (`PostgreSQL`) + `Hangfire (Redis)`. Відповідає за автентифікацію, ізоляцію даних за `user_id`, квоти, кампанії, скоринг-метадані, CRM та оркестрацію задач.
3. **Python FastAPI сервіси (`services/`):**
   - `crawler` (`:8001`) — пошук сайтів (Google Places API / CSV / ручний список), нормалізація доменів, перевірка доступності, SSRF-захист, `robots.txt` та обмеження `≤ 1 req/s`.
   - `audit` (`:8002`) — рендеринг у Playwright (`1366×768` та `390×844`), Node.js + Lighthouse CLI, `axe-core`, виконання 31 перевірки, зняття скріншотів і контактів, завантаження артефактів у MinIO.
   - `ml` (`:8003`) — детермінована шаблонна генерація листів (`EmailDraft` + `EmailClaim`) із прив'язкою до знахідок.
4. **Сховища:**
   - `PostgreSQL` — реляційні дані;
   - `Redis` — черги Hangfire та стан проміжних задач Python;
   - `MinIO` — скріншоти та згенеровані PDF-звіти.

## 2. Взаємодія `.NET (Hangfire)` ↔ `Python (FastAPI)`

Щоб уникнути довгих HTTP-з'єднань (до 120 с на аудит) та забезпечити ідемпотентність:
1. Hangfire-воркер у `.NET` відправляє `POST /internal/jobs/audit` (заголовок `X-Internal-Token`) із унікальним ключем `audit_id` і параметрами профілю.
2. Python повертає `202 Accepted` з `job_id` (якщо задача з цим `audit_id` вже виконується або завершена — повертає наявний стан).
3. Python зберігає скріншоти у `MinIO`, а фінальний JSON-результат фіксує в Redis/callback.
4. Hangfire-воркер опитує `GET /internal/jobs/{job_id}` (або приймає callback) і транзакційно зберігає `Audit`, `Finding`, `Evidence`, `Contact` у PostgreSQL.

## 3. Безпека краулера

- **SSRF-захист:** перед кожним HTTP-запитом (і на кожному редиректі, макс. 5) виконується DNS-резолв і перевірка, що IP не належить до `localhost`, loopback, private (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`) або зарезервованих діапазонів.
- **Етичний краулінг:** дотримання `robots.txt` для `LeadLensBot`, затримка між HTML-запитами до одного домену `≥ 1 с`, робота лише з публічними сторінками без обходу CAPTCHA чи авторизації.
