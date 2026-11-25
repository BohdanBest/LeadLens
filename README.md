# LeadLens

Вебплатформа автоматизованого аудиту сайтів і підготовки доказових комерційних пропозицій для веб-студій та фрілансерів.

## Архітектура

- **Frontend:** React, Vite, TypeScript, Sass (CSS Modules), React Router, TanStack Query (`frontend/`)
- **Backend API & Черга:** ASP.NET Core 8 Web API, EF Core, Hangfire + Redis (`backend/`)
- **Python-сервіси:** FastAPI (`services/crawler`, `services/audit`, `services/ml`), Playwright, Node.js + Lighthouse CLI, `axe-core`
- **Сховища:** PostgreSQL (`leadlens`), Redis, MinIO (S3 для скріншотів і PDF)

## Швидкий старт через Docker Compose

1. Скопіюйте змінні середовища:
   ```bash
   cp .env.example .env
   ```
2. Запустіть усю систему однією командою:
   ```bash
   docker-compose up --build
   ```
3. Перевірте сервіси після старту:
   - Frontend: `http://localhost:5173`
   - Backend API & Swagger: `http://localhost:5000/swagger`
   - Health check API: `http://localhost:5000/api/v1/health`
   - Hangfire Dashboard (Dev): `http://localhost:5000/hangfire`
   - MinIO Console: `http://localhost:9001`
   - Crawler / Audit / ML health: `http://localhost:8001/health`, `8002/health`, `8003/health`

## Структура документації

- [Архітектура системи](docs/architecture.md)
- [Дизайн-система](docs/design-system.md)
- [Каталог перевірок та формула Need score](docs/checks-catalog.md)
