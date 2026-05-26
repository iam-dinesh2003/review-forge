# ReviewForge

AI-powered GitHub PR reviewer and developer evaluation platform. Built with Java Spring Boot + Gemini 2.5 Flash.

> **Live demo concept:** Open a PR → watch AI comments appear inline within 30 seconds. Paste any GitHub username → get a full code quality assessment with AI-detection scoring.
## Status: Live on localhost with Gemini AI review enabled
---

## What it does

**PR Review mode** — Install the GitHub App on any repo. Every time a PR is opened or updated, ReviewForge:
1. Receives the webhook from GitHub
2. Fetches the diff and sends it to Gemini 2.5 Flash
3. Posts inline code review comments directly on the PR (CRITICAL / WARNING / INFO)
4. Saves the review to PostgreSQL and updates the quality trend dashboard

**Candidate Evaluation mode** — Paste any GitHub username. ReviewForge:
1. Fetches their public repos and recent merged PRs via the GitHub API
2. Sends the code diffs to Gemini for skill assessment
3. Returns a scored profile with language breakdown, detected skills, AI-written code risk, and per-PR comments

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend | Java 17 + Spring Boot 3.3 |
| AI | Google Gemini 2.5 Flash (JSON mode) |
| Database | PostgreSQL (Railway / local) |
| Cache | Redis (installation token caching, 55-min TTL) |
| Frontend | React 18 + Vite + TypeScript + TailwindCSS + Recharts |
| GitHub integration | GitHub App (JWT + installation tokens, HMAC-SHA256 webhook validation) |
| Deployment | Railway (backend + PG + Redis) + Vercel (frontend) |

---

## Architecture

```
GitHub PR opened
      │
      ▼
POST /webhook  ← GitHub sends signed webhook
      │
      ├─ Validate HMAC-SHA256 signature
      ├─ Return 200 immediately (< 1s)
      │
      └─ CompletableFuture.runAsync() ─────────────────────────────────────┐
                                                                            │
            ┌───────────────────────────────────────────────────────────────┘
            │
            ├─ Idempotency check  (skip if headSha already in DB)
            ├─ Fetch installation token  (Redis-cached 55 min)
            ├─ GET /repos/{owner}/{repo}/pulls/{pr}  (Accept: diff)
            ├─ Filter to .java files, max 5 files × 200 lines
            ├─ POST to Gemini 2.5 Flash  (JSON mode, temp=0.1)
            ├─ Parse response → { score, summary, comments[] }
            ├─ POST /repos/.../pulls/{pr}/reviews  (single review call)
            └─ Save ReviewSession + ReviewComment[] to PostgreSQL
```

---

## Key engineering decisions

- **Async webhook processing** — GitHub requires a 200 response within 10 seconds. The webhook endpoint validates the signature and returns immediately; the actual review runs in a thread pool via `@Async`.
- **Two-token GitHub auth** — GitHub Apps use an App JWT (signed with RSA private key) to get an installation token scoped to a specific repo. Installation tokens expire in 1 hour; ReviewForge caches them in Redis for 55 minutes.
- **Single Review API call** — Instead of posting one comment per issue (which spams notifications), all comments are batched into a single `POST /reviews` call.
- **Diff filtering** — Large PRs are trimmed to 5 Java files × 200 lines × 12,000 chars before sending to Gemini to avoid context window issues while keeping costs low.
- **JSON mode** — Gemini's `responseMimeType: application/json` forces structured output, but markdown fences are still stripped defensively before parsing.
- **Idempotency** — Each review is keyed on `(repoFullName, prNumber, headSha)`. Re-running the webhook for the same commit is a no-op.

---

## Local setup

### Prerequisites
- Java 17 (Amazon Corretto recommended)
- Maven 3.9+
- PostgreSQL 15+
- Redis 7+
- Node.js 20+
- ngrok (free) — GitHub needs a public URL to send webhooks

### 1. Create a GitHub App

Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**.

| Field | Value |
|-------|-------|
| Homepage URL | `http://localhost:8080` |
| Webhook URL | `https://your-ngrok-id.ngrok.io/webhook` (fill in after step 3) |
| Webhook secret | Any random string — copy it |
| Permissions → Pull requests | Read & Write |
| Permissions → Contents | Read-only |
| Subscribe to events | Pull request |

After creating the app:
- Copy the **App ID**
- Generate a **Private key** (downloads as `.pem`)
- Convert to PKCS8 format (required by Java):
  ```bash
  openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in original.pem -out private-key.pem
  ```
- Install the app on your test repo

### 2. Configure environment variables

Create `backend/src/main/resources/application-local.properties`:

```properties
github.app.id=YOUR_APP_ID
github.app.private-key=-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkq...(your key, newlines as \n)-----END PRIVATE KEY-----
github.app.webhook-secret=your-webhook-secret

gemini.api.key=your-gemini-api-key

# Optional: increases GitHub API rate limit for candidate analysis from 60 to 5000 req/hr
github.pat=ghp_your_personal_access_token

spring.datasource.url=jdbc:postgresql://localhost:5432/reviewforge
spring.datasource.username=postgres
spring.datasource.password=postgres

spring.data.redis.host=localhost
spring.data.redis.port=6379
```

### 3. Start ngrok

```bash
ngrok http 8080
```

Copy the `https://` URL and paste it into your GitHub App's webhook URL field as `https://your-id.ngrok.io/webhook`.

### 4. Run the backend

```bash
cd backend
JAVA_HOME=/path/to/java17 mvn spring-boot:run -Dspring-boot.run.profiles=local
```

Or set `JAVA_HOME` globally if Maven defaults to a newer JDK.

### 5. Run the frontend

```bash
cd frontend
npm install
echo "VITE_API_BASE_URL=http://localhost:8080" > .env.local
npm run dev
```

Open `http://localhost:5173`. The dashboard will connect to the backend automatically.

### 6. Test it

Open a PR in your test repo. Within 30 seconds you should see:
- ReviewForge comments appear inline on the PR
- The dashboard at `localhost:5173` shows the new review with score and issues

---

## Candidate evaluation API

```bash
curl -X POST http://localhost:8080/api/candidates/analyze \
  -H "Content-Type: application/json" \
  -d '{"githubLogin": "torvalds"}'
```

Returns a full `CandidateProfile` with skill signals, AI detection score, per-PR comments, and an overall quality score.

Note: without `GITHUB_PAT`, the GitHub API rate limit is 60 req/hr (unauthenticated). Add a PAT to analyze multiple candidates.

---

## Dashboard API

| Endpoint | Description |
|----------|-------------|
| `GET /api/dashboard/stats` | Total PRs, avg score, total issues |
| `GET /api/dashboard/reviews?page=0&size=20` | Paginated PR review list |
| `GET /api/dashboard/reviews/{id}` | Full review with all inline comments |
| `GET /api/dashboard/repositories` | Per-repo stats (avg score, issue counts) |
| `GET /api/dashboard/trends?days=30` | Daily avg score for trend chart |
| `POST /api/candidates/analyze` | Analyze a GitHub user's code |
| `GET /api/candidates` | List all analyzed candidates |
| `GET /api/candidates/{id}` | Single candidate profile |
| `GET /actuator/health` | Health check (used by Railway) |

---

## Deployment (Railway + Vercel)

### Backend on Railway

1. Push the `backend/` folder to a GitHub repo
2. Create a Railway project → Add service → GitHub repo
3. Add PostgreSQL and Redis plugins
4. Set environment variables:
   ```
   GITHUB_APP_ID=...
   GITHUB_APP_PRIVATE_KEY=...  (full PEM, newlines as \n)
   GITHUB_APP_WEBHOOK_SECRET=...
   GEMINI_API_KEY=...
   GITHUB_PAT=...              (optional but recommended)
   CORS_ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
   DATABASE_URL=               (auto-set by Railway PG plugin)
   REDIS_HOST=                 (auto-set by Railway Redis plugin)
   ```
5. Update your GitHub App's webhook URL to the Railway URL

### Frontend on Vercel

```bash
cd frontend
npx vercel --prod
```

Set env var `VITE_API_BASE_URL=https://your-railway-app.up.railway.app` in Vercel's project settings.

---

## Project structure

```
reviewforge/
├── backend/
│   └── src/main/java/com/reviewforge/
│       ├── controller/
│       │   ├── WebhookController.java       ← POST /webhook
│       │   ├── DashboardController.java     ← REST API
│       │   └── CandidateController.java     ← POST /api/candidates/analyze
│       ├── service/
│       │   ├── GitHubAppService.java        ← JWT auth + token cache + API calls
│       │   ├── GitHubProfileService.java    ← Public profile + PR diff fetching
│       │   ├── AIReviewService.java         ← Gemini prompt + JSON parse (PR mode)
│       │   ├── CandidateAnalysisService.java← Full candidate evaluation pipeline
│       │   ├── PullRequestService.java      ← PR review pipeline orchestration
│       │   ├── DashboardService.java        ← Dashboard query aggregation
│       │   └── WebhookValidationService.java← HMAC-SHA256 signature verification
│       ├── entity/
│       │   ├── ReviewSession.java           ← One PR review run
│       │   ├── ReviewComment.java           ← One inline comment
│       │   ├── Installation.java            ← GitHub App installation record
│       │   └── CandidateProfile.java        ← Analyzed developer profile
│       └── dto/
│           ├── ai/                          ← Gemini response DTOs
│           ├── dashboard/                   ← Dashboard API response DTOs
│           ├── candidate/                   ← Candidate API DTOs
│           └── webhook/                     ← GitHub webhook payload DTOs
└── frontend/
    └── src/
        ├── pages/
        │   ├── Dashboard.tsx               ← Stats + quality trend + recent reviews
        │   ├── ReviewsPage.tsx             ← All PR reviews with pagination
        │   ├── PRDetailPage.tsx            ← Single review + inline comments
        │   ├── RepositoriesPage.tsx        ← Connected repos + per-repo stats
        │   ├── CandidatesPage.tsx          ← Search + analyze GitHub profiles
        │   ├── CandidateDetailPage.tsx     ← Full candidate report
        │   ├── RankingPage.tsx             ← Rank candidates by score/JD match
        │   └── BatchCandidatePage.tsx      ← Bulk candidate processing
        ├── hooks/                          ← Data fetching hooks (real API + mock fallback)
        └── api/                            ← Type-safe API client functions
```

## AI Review Test
Testing ReviewForge Gemini integration.
