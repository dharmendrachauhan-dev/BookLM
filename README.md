# BookLM

An AI-powered notebook for learning from your own sources. Upload PDFs, websites, YouTube videos, and text — then chat with citations, generate quizzes, flashcards, mind maps, and more.

## Architecture

```
NotebookLLM/
├── client/          # Next.js 16 (App Router) — UI
└── server/          # Express 5 API — auth, RAG, background jobs
```

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, TanStack Query, Zustand |
| Backend | Express 5, Prisma 7, PostgreSQL |
| Auth | [Better Auth](https://www.better-auth.com/) (Google OAuth) |
| AI | OpenAI (`gpt-4o`, `gpt-4o-mini`), Vercel AI SDK |
| Vector DB | Pinecone (RAG embeddings) |
| Background jobs | [Inngest](https://www.inngest.com/) (source processing, artifact generation) |
| Optional | Tavily (web search), Mem0 (long-term memory), Cloudinary (PDF uploads), Firecrawl (web scraping) |

### How requests flow

1. **Browser** → `http://localhost:3000` (Next.js client)
2. Client calls `/api/*` → proxied to Express at `http://localhost:8081` (see `client/next.config.ts`)
3. **Auth** cookies are shared via `credentials: "include"` on API calls
4. **Source upload** → API saves to Postgres → Inngest `source/created` → extract → chunk → embed → Pinecone
5. **Chat** → RAG retrieval from Pinecone → streamed OpenAI response with citations
6. **Learn tools** (quiz, flashcards, etc.) → Inngest `artifact/generate` → structured AI output saved to DB

---

## Prerequisites

- **Node.js** 20+ (client uses npm; server works with npm or Bun)
- **Docker** (recommended for local Postgres)
- API keys (see [Environment variables](#environment-variables))

### External services

| Service | Required? | Purpose |
|---------|-----------|---------|
| PostgreSQL | Yes | App database |
| OpenAI | Yes | Chat, embeddings, artifact generation |
| Pinecone | Yes | Vector search (RAG) |
| Google OAuth | Yes | Sign-in |
| Inngest | Yes (dev server) | Background processing |
| Tavily | Optional | Web search in chat |
| Mem0 | Optional | User memory across sessions |
| Cloudinary | Optional | PDF file hosting |
| Firecrawl | Optional | Website import |

**Pinecone index:** create an index named `bookllm` (or set `PINECONE_INDEX`) with **1536 dimensions** (cosine metric) to match `text-embedding-3-small`.

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/dharmendrachauhan-dev/BookLM.git
cd NotebookLLM
```

### 2. Start PostgreSQL

```bash
cd server
docker compose up -d
```

This starts Postgres on **port 5433** with:

- User: `bookllm`
- Password: `postgres`
- Database: `bookllm`

### 3. Configure the server

```bash
cd server
cp .env.example .env   # create from template below if missing
npm install
npx prisma migrate deploy
npx prisma generate
```

### 4. Run the API + Inngest worker

```bash
cd server
npm run dev:all
```

This runs:

- **API** at `http://localhost:8081`
- **Inngest Dev Server** at `http://localhost:8288` (job dashboard)

Or run separately in two terminals:

```bash
npm run dev          # API only
npm run dev:inngest  # Inngest dev server only
```

### 5. Run the client

```bash
cd client
npm install
npm run dev
```

Open **http://localhost:3000** and sign in with Google.

---

## Environment variables

### Server (`server/.env`)

Create `server/.env` with at least:

```env
# Core
PORT=8081
DATABASE_URL="postgresql://bookllm:postgres@localhost:5433/bookllm"
CLIENT_URL=http://localhost:3000

# Better Auth
BETTER_AUTH_URL=http://localhost:8081
Better_Auth_Secret=your-long-random-secret

# Google OAuth (https://console.cloud.google.com/)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# OpenAI
OPENAI_API_KEY=sk-...

# Pinecone
PINECONE_API_KEY=your-pinecone-key
PINECONE_INDEX=bookllm

# Inngest (local dev)
INNGEST_DEV=1

# Optional
TAVILY_API_KEY=           # Web search in chat
MEM0_API_KEY=             # Memory settings page
FIRECRAWL_API_KEY=        # Website scraping
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UPLOAD_PRESET=bookllm
```

> **Google OAuth redirect URI:** add `http://localhost:8081/api/auth/callback/google` in Google Cloud Console.

> **Note:** `auth.ts` reads `Better_Auth_Secret` (exact casing). Set that variable name in `.env`.

### Client (`client/.env.local`) — optional

Defaults work for local dev (API proxied to `8081`). Override if needed:

```env
NEXT_PUBLIC_APP_URL=http://localhost:8081
NEXT_PUBLIC_API_URL=http://localhost:8081
API_URL=http://localhost:8081
```

---

## Development scripts

### Server (`server/`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Express API with hot reload (`tsx watch`) |
| `npm run dev:inngest` | Start Inngest dev server |
| `npm run dev:all` | Run API + Inngest together |
| `npm run build` | Compile TypeScript to `dist/` |
| `npx prisma migrate dev` | Create/apply migrations (dev) |
| `npx prisma migrate deploy` | Apply migrations (prod/CI) |
| `npx prisma generate` | Regenerate Prisma client |
| `npx prisma studio` | Open database GUI |

### Client (`client/`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server (port 3000) |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npm run lint` | ESLint |

---

## Features guide

### Workspaces

- Create notebooks from the dashboard
- Each workspace has its own sources, chats, and learning artifacts
- Set a **default chat model** in workspace settings (`gpt-4o-mini` or `gpt-4o`)

### Sources

Supported types:

| Type | Input |
|------|--------|
| **PDF** | File upload |
| **Website** | URL (Firecrawl) |
| **YouTube** | Video URL (transcript) |
| **Text** | Plain text paste |
| **Markdown** | Markdown paste |

After adding a source, Inngest processes it: extract → chunk → embed → index in Pinecone. Status moves `PENDING` → `PROCESSING` → `READY` (or `FAILED`).

### Chat

- Ask questions about your indexed sources
- Answers include **citation markers** linked to source excerpts
- Toggle **Web search** (Tavily) in the composer when `TAVILY_API_KEY` is set
- Switch model from the workspace header dropdown
- Export conversations as Markdown

### Learn (artifacts)

Generate from ready sources:

- Summary
- Key takeaways
- Flashcards
- Quiz
- Mind map (interactive React Flow viewer)
- AI report

Generation runs in the background via Inngest. Use **Retry generation** if a job gets stuck.

### Memory

Optional Mem0 integration at `/settings/memory` for persistent user facts across chats.

---

## API overview

Base path: `/api`

| Route | Description |
|-------|-------------|
| `/api/auth/*` | Better Auth (Google OAuth, sessions) |
| `/api/inngest` | Inngest webhook (background jobs) |
| `/api/workspaces` | CRUD workspaces |
| `/api/workspaces/:id/sources` | Sources CRUD, upload, filters |
| `/api/workspaces/:id/chat` | Streaming chat |
| `/api/workspaces/:id/conversations` | Conversation history |
| `/api/workspaces/:id/artifacts` | Learning artifacts |
| `/api/memory` | User memory (Mem0) |

---

## Project structure

### Client (`client/`)

```
app/                    # Next.js App Router pages
features/
  auth/                 # Login, session
  workspaces/           # Dashboard, shell, settings
  sources/              # Source library & detail
  chat/                 # Workspace chat UI
  learn/                # Artifacts (quiz, flashcards, mind map…)
  memory/               # Memory settings
components/ui/          # shadcn components
shared/                 # API client, providers
```

### Server (`server/`)

```
src/
  controllers/          # Route handlers
  services/             # Business logic (chat, sources, artifacts…)
  repositories/         # Prisma data access
  inngest/              # Background job functions
  lib/                  # Auth, OpenAI, Pinecone, Tavily, etc.
  routes/               # Express routers
prisma/
  schema.prisma         # Database schema
  migrations/           # SQL migrations
```

### Inngest functions

| Function | Event | Purpose |
|----------|-------|---------|
| `process-source` | `source/created` | Extract, chunk, embed source |
| `generate-artifact` | `artifact/generate` | AI learning tool generation |
| `summarize-conversation` | `conversation/summarize` | Rolling chat summaries (stub) |

---

## Troubleshooting

### Sources stuck on “Pending” / “Processing”

- Ensure **Inngest dev server** is running (`npm run dev:inngest` or `dev:all`)
- Check Inngest dashboard at http://localhost:8288 for failed runs
- Verify `OPENAI_API_KEY` and `PINECONE_API_KEY` are set

### Chat has no citations

- Sources must be status **READY** (fully indexed)
- Check Pinecone index name and dimension (1536)

### Auth / login fails

- `BETTER_AUTH_URL` must match server URL (`http://localhost:8081`)
- `CLIENT_URL` must be `http://localhost:3000`
- Google OAuth redirect URI must include `/api/auth/callback/google`

### “Generating quiz…” never finishes

- Inngest `generate-artifact` must be running and calling `processArtifactById`
- Use **Retry generation** on the artifact detail page

### Model selector doesn’t update

- Hard refresh after changing workspace default model in settings
- Chat model prefs are stored per-workspace in browser localStorage (`BookLLM-chat-preferences`)

### CORS / conversation ID issues

- Server exposes `X-Conversation-Id` header for new chat tracking
- Client proxies `/api` to backend via `next.config.ts` rewrites

---

## Production notes

1. Run `npm run build` in both `client/` and `server/`
2. Set production URLs in `CLIENT_URL`, `BETTER_AUTH_URL`, and client `NEXT_PUBLIC_*` vars
3. Use a managed Postgres (not Docker) and run `npx prisma migrate deploy`
4. Deploy Inngest functions to [Inngest Cloud](https://www.inngest.com/) instead of `INNGEST_DEV=1`
5. Never commit `.env` files or API keys

---

## Project Inspired

Notebook LLM
