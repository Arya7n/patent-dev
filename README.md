# Patent research workspace

Analyst workspace for reading a patent, splitting its claims into clauses, finding corresponding passages in prior art or reference documents, and exporting a two-column claim chart.

The browser talks only to the API. Model keys, database URLs, and storage credentials stay in the root `.env` used by the API and the worker. They are never sent to the frontend.

The product records potentially relevant evidence. It does not state that a patent is invalid, infringed, or patentable. Every classification can be overridden by an analyst.

## What you can do

Create an organization and a matter, then work through one project:

1. Upload the target patent PDF and one or more prior-art or reference PDFs.
2. Process each PDF so the text is extracted, split into passages, and embedded for search.
3. Identify claims from the target patent, or add a claim by hand.
4. Decompose each claim into clauses in the claim's own wording.
5. Search prior art. Each processed prior-art or reference document is searched on its own.
6. Review the claim chart. The same highlight color marks a phrase in the clause and the matching words in the cited passage.
7. Export the chart as Word or PDF.

A claim chart has two columns, **Claims** and **Mapping**. The mapping cell quotes a retrieved passage, names the page, and adds a correspondence note. The note ends with one of: the passage reads on the clause, the passage does not read on the clause, or analyst review is required. Column and line numbers are not invented.

## Repository layout

| Path | Role |
| --- | --- |
| `apps/web` | Next.js workspace. Port 3000. |
| `apps/api` | NestJS HTTP API. Port 3001. Swagger is at `/docs`. |
| `apps/worker` | BullMQ worker. Runs document processing, claim identification, decomposition, evidence search, and report rendering. |
| `packages/shared` | Schemas, claim parsing, and chart types. |
| `packages/db` | Drizzle schema and SQL migrations. |
| `packages/storage` | Local disk or S3-compatible file storage. |
| `packages/pipeline` | PDF extraction, embeddings, evidence mapping, and report rendering. |
| `services/pdf-worker` | Python script (`extract_pdf.py`) used by the worker when PyMuPDF is installed. |

The web app does not import the server packages. Those packages publish compiled `dist/` output. `pnpm dev` builds them first. If you change `packages/shared`, `packages/db`, `packages/storage`, or `packages/pipeline` and you started the API or worker on their own, rebuild those packages and restart the process that imports them. The worker does not reload `dist/` by itself.

## Requirements

- Node.js 20 or newer
- pnpm 9.15.0 (`corepack enable`, then `corepack prepare pnpm@9.15.0 --activate`)
- Docker, for Postgres with pgvector and Redis 7
- Python 3 on `PATH` as `python` (Windows) or whatever you set in `PYTHON_BIN`

Python packages for text PDFs:

```bash
python -m pip install -r services/pdf-worker/requirements.txt
```

That installs PyMuPDF and OCRmyPDF. Scanned PDFs also need Tesseract and Ghostscript installed on the machine. Text PDFs do not. If Python or PyMuPDF is missing, the worker falls back to PDF.js. If a PDF still has too little text, its status becomes **Needs OCR**.

## First-time setup

From the repository root:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
```

On Windows PowerShell, use `Copy-Item .env.example .env` and `Copy-Item apps/web/.env.example apps/web/.env`.

Generate a session secret and put it in the root `.env` as `AUTH_SECRET`:

```bash
openssl rand -base64 48
```

Add a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) as `GEMINI_API_KEY` in the root `.env` only. Leave `apps/web/.env` as the public API URL. Do not commit either `.env` file.

Start the databases, install dependencies, and apply migrations. Docker must be running.

```bash
pnpm db:up
pnpm install
pnpm db:migrate
pnpm dev
```

Open the workspace at [http://localhost:3000](http://localhost:3000) and the API docs at [http://localhost:3001/docs](http://localhost:3001/docs). Register on the site. That creates the first user and organization. Later sign-ins use the same email and password.

`pnpm db:up` starts:

| Service | Image | Address |
| --- | --- | --- |
| Postgres 16 with pgvector | `pgvector/pgvector:pg16` | `localhost:5432`, database `patent`, user `patent`, password `patent` |
| Redis 7 | `redis:7-alpine` | `localhost:6380` |

Redis is on 6380 so it does not collide with another Redis already using 6379. BullMQ needs Redis 5 or newer. Stop the databases with `pnpm db:down`. The Postgres volume `patent_pg` keeps data across restarts.

## Environment

Root `.env` is loaded by the API and the worker. `apps/web/.env` is loaded by Next.js.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Web | API origin the browser calls. Locally `http://localhost:3001`. Changing it requires a web restart. |
| `API_PORT` | API | Listen port. Default 3001. |
| `DATABASE_URL` | API, worker | Postgres connection string. |
| `DIRECT_DATABASE_URL` | Migrations | Non-pooled Postgres URL. Same as `DATABASE_URL` on this Docker setup. |
| `REDIS_URL` | API, worker | `redis://localhost:6380` locally. |
| `AUTH_SECRET` | API | Signs the session cookie. Required. |
| `AUTH_COOKIE_NAME` | API | Cookie name. Default `patent_session`. |
| `AUTH_CORS_ORIGINS` | API | Comma-separated browser origins allowed to send the session cookie. Locally `http://localhost:3000`. |
| `AI_PROVIDER` | API, worker | `gemini`. Without `GEMINI_API_KEY`, decomposition and evidence search use a local fallback and the chart will not be useful. |
| `GEMINI_API_KEY` | API, worker | Google AI Studio key. Backend only. |
| `GEMINI_MODEL` | Worker | Chat model. Default `gemini-3.5-flash-lite`. |
| `GEMINI_EMBEDDING_MODEL` | Worker | Default `gemini-embedding-001`. |
| `EMBEDDING_DIMENSIONS` | Worker, database | `768`. Must match the vectors already stored. |
| `STORAGE_PROVIDER` | API, worker | `local` or `s3`. |
| `STORAGE_LOCAL_PATH` | API, worker | Directory for uploads and generated reports when storage is local. API and worker must see the same path. |
| `PYTHON_BIN` | Worker | `python` on Windows, `python3` on many Linux images. |
| `MAX_UPLOAD_BYTES` | API | Upload limit. Default 40 MB. |

S3-compatible storage (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`) is used when `STORAGE_PROVIDER=s3`. Use that when the API and worker are on different machines.

`OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are unused. The active provider is Gemini.

## Run one process at a time

`pnpm dev` starts the web app, API, and worker together. To run them separately, in three terminals:

```bash
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

The worker must stay up. Uploads, claim identification, decomposition, prior-art search, and report generation are queued on Redis. If the worker is down, the screen stays on "queued" or "working" until the job times out. Start it with `pnpm dev:worker` and try the action again.

Other scripts:

| Command | What it does |
| --- | --- |
| `pnpm build` | Production build of every package and app. |
| `pnpm typecheck` | Typecheck every package that defines the script. |
| `pnpm test` | Unit tests. Builds `shared` and `storage` first. |
| `pnpm lint` | ESLint. |
| `pnpm db:migrate` | Apply `packages/db/drizzle/*.sql` in order. |

Production start commands, after `pnpm build` and with the root `.env` loaded:

```bash
pnpm --filter @patent/api start
pnpm --filter @patent/worker start
pnpm --filter @patent/web start
```

## Using a matter

Sign in, create a project, and follow the overview checklist.

**Documents.** Upload a PDF as **Target patent**, **Prior art**, or **Reference**. Prior art and reference documents are both searched. Click **Process** and wait until the status is **Ready**. A target patent must be ready before claims can be identified from it.

**Claims.** **Identify claims** reads the claims section of the target patent. Claims that follow "what is claimed is", "I claim", "we claim", or a bare "claim" heading are kept. Numbered sentences from the description are not treated as claims. You can also add or edit a claim, then **Decompose** it into clauses. **Search prior art** maps one clause. **Search all elements** maps every clause. Search is available after at least one prior-art or reference PDF is ready.

**Claim chart.** One row per clause. The left cell is the clause. The right cell lists each reference, the best retrieved quote, the page, and the correspondence note. Highlight colors pair phrases. **Export report** goes to the reports page.

**Reports.** Generate a report after search has stored evidence. Download DOCX or PDF when the status is **Ready**. Generating again after a new search picks up the latest evidence. Older saved evidence has no phrase colors until you search again.

**Settings.** Shows which model is active and recent token usage. It does not display secrets.

Evidence labels:

| Label | Meaning |
| --- | --- |
| Potentially relevant — strong correspondence | The passage closely tracks the clause. |
| Possible partial match | Some of the clause is present. |
| Weak / possible match | Loose or incomplete overlap. |
| No evidence identified | No corresponding passage was stored. |
| Analyst review required | The model output could not be validated, or the passage needs a person. |

An analyst note and an override replace the model's label in the chart. Viewers can read a matter. Owners, admins, and analysts can edit it.

## How a PDF becomes a chart

1. The API stores the file and enqueues `process_document`.
2. The worker extracts text with `services/pdf-worker/extract_pdf.py`. Thin pages can be sent through OCRmyPDF when Tesseract and Ghostscript exist.
3. Text is split into sections and passages. Passages are embedded with Gemini and stored in Postgres with pgvector.
4. `extract_claims` parses the claims section. If that finds nothing, the model is asked for a claim list.
5. `decompose_claim` splits one claim into ordered clauses without paraphrasing.
6. `map_element` embeds the clause and retrieves the closest passages from each searchable document, then asks the model for a quote, phrase alignments, and a commentary.
7. `generate_report` loads the chart and writes a DOCX and a PDF into storage.

Phrase colors used in the chart are `FFFFCC`, `C5E0B3`, `FFCCFF`, `BDD6EE`, `F7CAAC`, `F4B083`, `FFE599`, `FFDBB7`, `00B0F0`, `66FFFF`, `EF89A1`, `D0CECE`, and `9CC2E5`. The same color is applied to the claim phrase and the source phrase.

## Sharing the local app

The site is port 3000 and the API is port 3001. Both have to be reachable. Do not publish Postgres (`5432`) or Redis (`6380`).

With ngrok, add both ports to the agent config and start them together:

```yaml
endpoints:
  - name: web
    upstream:
      url: 3000
  - name: api
    upstream:
      url: 3001
```

```bash
ngrok start --all
```

Set `NEXT_PUBLIC_API_URL` to the HTTPS address for port 3001 and `AUTH_CORS_ORIGINS` to the HTTPS address for port 3000, then restart the web app and the API. The session cookie is `SameSite=Lax` and is marked `Secure` only when `NODE_ENV=production`, so login across two different public hostnames will not stick. For a real share, put the site and the API on one parent domain over HTTPS.

## Production

Run Postgres with pgvector, Redis 7, the API, the worker, and the web app as long-lived processes. Python with PyMuPDF must be available to the worker. Use HTTPS. Set `NODE_ENV=production`, a new `AUTH_SECRET`, and `AUTH_CORS_ORIGINS` to the public site origin. Build the web app with `NEXT_PUBLIC_API_URL` set to the public API origin, because that value is included at build time.

The site and the API need to share a parent domain so the session cookie is sent. Example hostnames are `app.example.com` for port 3000 and `api.example.com` for port 3001. Keep the worker running on the same machine as local storage, or switch `STORAGE_PROVIDER` to `s3` if the API and worker do not share a disk. Change the Docker database password before Postgres is reachable from the internet, and do not publish ports 5432 or 6380.

## Troubleshooting

**Identify claims, search, or report generation sits on "queued".** The worker is not running or it was started without the root `.env`, so it is not listening on Redis at port 6380. Start `pnpm dev:worker` from the repository root.

**The workspace says the API did not respond.** Start `pnpm dev:api`. On some Windows setups, `localhost` resolves to IPv6 and the request hangs. Use `http://127.0.0.1:3001` as `NEXT_PUBLIC_API_URL` and restart the web app.

**A PDF stays on Needs OCR.** The file has almost no text layer. Install Tesseract and Ghostscript, confirm `python -m ocrmypdf --version` works, and process the document again.

**Search says no prior-art documents are available.** Process the prior-art or reference PDF until it is **Ready**. The target patent is not searched.

**The chart has clauses but no colored quotes.** Run **Search all elements** again, then generate a new report. Evidence saved before phrase alignments existed has an empty mapping.

**A document fails with "quota was reached" or a 429.** Gemini rate-limited the request. The worker already retries with a pause, so wait a minute and click **Retry** on the Documents page. Free-tier keys hit this most often on long PDFs.

**Model output looks generic.** Settings should show Gemini as the active provider. An empty `GEMINI_API_KEY` selects the local fallback.
