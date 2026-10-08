# Patent research workspace

Analyst workspace for patent document processing, claim decomposition, prior-art evidence mapping, and claim-chart export.

The frontend and backend are separate applications. The browser talks to the API over HTTP and never receives provider secrets.

| App | Path | Run |
| --- | --- | --- |
| Web | `apps/web` | `pnpm dev:web` |
| API | `apps/api` | `pnpm dev:api` |
| Worker | `apps/worker` | `pnpm dev:worker` |
| PDF tools | `services/pdf-worker` | Used by the worker when Python and PyMuPDF are installed |

Shared packages (`packages/shared`, `packages/db`, `packages/storage`, `packages/pipeline`) are server-side. The web app does not import them.

## Local setup

1. Copy `.env.example` to `.env` and fill in values. Do not commit `.env`.
2. Start Postgres with pgvector: `pnpm db:up` (Docker Desktop must be running). Redis is expected at `redis://localhost:6379`.
3. Install and migrate:

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

`pnpm dev` starts the API, worker, and web together. Use the individual scripts when you only need one side.

API docs: `http://localhost:3001/docs`

Web: `http://localhost:3000`

## AI output

The product records potentially relevant evidence. It does not state that a patent is invalid, infringed, or patentable. Analysts can override every classification.

## Credentials

See `.env.example`. `GEMINI_API_KEY`, database URLs, and storage secrets belong in the root `.env` used by the API and worker only.
