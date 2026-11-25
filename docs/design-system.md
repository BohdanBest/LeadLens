# LeadLens Design System («Frost & Slate»)

Документ описує актуальну дизайн-систему, архітектуру стилів, іконографіку, типографіку та правила доступності фронтенду **LeadLens**.

## 1. Палітра кольорів (Light / Dark, `light-dark()`)

Стилізація побудована на CSS-функції `light-dark()` із керуванням через `<meta name="color-scheme">` та CSS-мапінг `:root:has(> head > meta[name="color-scheme"][content="dark"|"light"])` (визначено у `frontend/src/styles/_tokens.scss`).

- **Базові поверхні (90–95% нейтральні):**
  - Полотно (`--bg-canvas`): `#f4f7f8` (light) / `#0b0f13` (dark)
  - Картки (`--bg-surface`): `#ffffff` (light) / `#121820` (dark) з `1px` тонкою межею (`--border-subtle`) та верхнім внутрішнім відблиском
  - Підняті поверхні (`--bg-elevated`): `#ecf0f2` (light) / `#19222d` (dark)
- **Текст (WCAG 2.2 AA >= 4.5:1):**
  - Основний (`--text-primary`): `#162228` (light) / `#edf2f5` (dark)
  - Другорядний (`--text-secondary`): `#475861` (light) / `#9aaab4` (dark)
- **Єдиний архітектурний акцент (~3% екрану):**
  - Глибокий teal (`--accent`): `#0d7480` (light) / `#2dd4bf` (dark)
- **Семантика (ніколи не покладається лише на колір — завжди іконка + локалізований підпис):**
  - `Healthy` / `Pass`: зелений (`#157347` / `#4ade80`) + `CheckCircle`
  - `Moderate` / `Warning`: бурштиновий (`#a16207` / `#facc15`) + `Warning`
  - `Weak`: помаранчевий (`#c2410c` / `#fb923c`) + `WarningOctagon`
  - `Critical` / `Fail`: червоний (`#b91c1c` / `#f87171`) + `XCircle`
  - `Pending` / `Unavailable`: сланцевий (`#475569` / `#94a3b8`) + `MinusCircle`

## 2. Типографіка та іконки

- **UI шрифт:** `Manrope` (`400–800`, повна підтримка української кирилиці), щільний трекінг заголовків `-0.02em`.
- **Моноширинний шрифт:** `JetBrains Mono` (`400–600`) із `font-variant-numeric: tabular-nums` для доменів, кодів перевірок (`PERF-04`), HTML-сніпетів, URL і числових метрик.
- **Іконки:** `@phosphor-icons/react` (`duotone` для KPI-карток, порожніх станів і заголовків; `regular`/`bold` для кнопок, навігації й бейджів).

## 3. Архітектура стилів і анімацій

- **1-to-1 SCSS Modules:** кожен компонент у `src/components/*` та кожна сторінка в `src/pages/*` має власний co-located `.module.scss` файл.
- **0 inline-стилів:** у JSX не використовується атрибут `style={{ ... }}`. Динамічні шкали, індикатори вкладок і кільце `ScoreGauge` керуються через GPU-трансформації GSAP (`scaleX`, `x`, `strokeDashoffset`).
- **GSAP-хореографія (`src/hooks/motion/`):** `usePageEntrance`, `useCountUp`, `useSlidingIndicator` із `power3.out` та повною підтримкою `(prefers-reduced-motion: reduce)`.

## 4. Доступність (WCAG 2.2 AA) та адаптивність (360px+)

- Мінімальна зона кліку інтерактивних елементів — `44×44 px` (`--touch-target`).
- Усі таблиці використовують `DataTable` (`role="region"`, `tabIndex={0}`, `container-type: inline-size`) з автоматичною трансформацією у картковий вигляд при ширині контейнера `< 640px`.
- Модальні діалоги та Lightbox побудовані на нативному `<dialog>` (`showModal()`, `overscroll-behavior: contain`, `autoFocus` на безпечній кнопці «Скасувати»).
- Графіки дашборду мають перемикач у таблицю-альтернативу (`FR-DSH-02`).
