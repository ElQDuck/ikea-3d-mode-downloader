# AGENT.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

A web app that downloads GLB (3D model) files from IKEA product pages. The user pastes an IKEA product URL; the backend uses Playwright to open the page, click the 3D viewer button, and intercept the `.glb` network request. The file is saved server-side and served to the browser for download.

## Running with Docker (primary workflow)

```bash
docker compose up --build
```

Frontend available at `http://localhost:8080`. The nginx container proxies `/api/*` to the backend on port 3001.

## Local development (without Docker)

**Backend** (port 3001 by default, or set `PORT` env var):
```bash
cd backend
npm install
npx playwright install chromium
npm run dev       # ts-node-dev with --respawn
npm run build     # tsc → dist/
npm start         # runs dist/server.js
```

**Frontend** (Vite dev server proxies `/api` → `http://localhost:8000`):
```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc -b && vite build
```

Note: The Vite proxy target is `http://localhost:8000` but the backend default port is `3001`. Adjust `vite.config.ts` proxy target or `PORT` env var to match when running locally.

## Architecture

The app has two services that only communicate through the browser → nginx → backend HTTP path:

```
Browser → nginx (:8080) → /api/* → Express backend (:3001) → Playwright → IKEA
```

**Job lifecycle** (`backend/src/store/jobStore.ts`): Jobs are held in an in-memory `Map`. Status progresses: `pending → navigating → waiting_for_3d → downloading → done | error`. Jobs are never persisted — a backend restart loses all jobs.

**GLB extraction strategies** (`backend/src/services/playwrightService.ts`): Two parallel approaches run on every request:
1. **Network interception** — `page.route('**/*.glb*', ...)` intercepts the actual fetch when the 3D viewer loads the model. This is the primary path.
2. **JSON-LD extraction** — Parses `<script type="application/ld+json">` for a `3DModel` entry. Used as fallback if the network intercept never fires (e.g., no 3D viewer on the page).

**Download flow**: After the file is written to `DOWNLOADS_DIR`, `GET /api/download/:id` streams it to the browser then deletes it from disk.

**Frontend polling**: `StatusPanel` polls `GET /api/status/:id` every 1.5 seconds while a job is active, then stops when `status` reaches `done` or `error`.

## Key env vars (backend)

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `3001` | Express listen port |
| `DOWNLOADS_DIR` | `/app/downloads` | Where GLB files are written before download |
