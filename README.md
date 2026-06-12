# Resume Screener

An AI-powered resume screening platform. Define your hiring bar, calibrate it on a sample, then screen hundreds of resumes in minutes — with GPT evaluating each one against your exact criteria.

---

## Table of Contents

1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Getting Started](#getting-started)
6. [Environment Variables](#environment-variables)
7. [Backend API Reference](#backend-api-reference)
8. [Frontend Architecture](#frontend-architecture)
9. [Data Persistence](#data-persistence)
10. [Share Feature](#share-feature)
11. [Deployment](#deployment)
12. [Cost Tracking](#cost-tracking)

---

## Overview

Resume Screener is a full-stack SPA that automates the resume shortlisting process. Instead of keyword matching, it uses a two-pass LLM evaluation:

1. **Compress** — Extract structured signals from the resume (work history, skills, pedigree, projects)
2. **Evaluate** — Score those signals against a calibrated evaluator prompt specific to your role

Candidates are rated **P0** (strong hire), **P1** (interview-worthy), or **Reject**, with reasons and concerns attached to each decision.

---

## How It Works

The app runs a three-step flow per role.

### Step 1 — Define Role & Criteria

- Paste a job description or describe the role in plain language (Hinglish supported)
- The AI extracts structured hiring criteria: hard requirements, P0 signals, P1 signals, red flags, and role context
- You review and edit criteria in a form — adjusting seniority, experience bar, education/company pedigree, adjacent-role policy, and more
- The app detects vague criteria (e.g., "good communication skills") and asks clarifying questions to sharpen them
- Once confirmed, the backend builds a full **evaluator prompt** — the system message GPT will use to rate every resume

### Step 2 — Calibrate Taste

- Upload 5–20 sample resumes you have opinions on
- The AI screens them and shows you the results in a card-by-card review
- You agree or disagree with each rating, optionally specifying the right tier (P0/P1/Reject)
- The app calls **recalibrate** with your feedback → the evaluator prompt is surgically updated
- Repeat until the AI's decisions match your intuition
- Calibration status is saved permanently on the role

### Step 3 — Screen the Full Pool

- Upload as many resumes as you want (hundreds supported)
- The app parses and evaluates them concurrently (6 at a time)
- Results stream back in real time with name, email, rating, reject reason, reasoning, and concerns
- You can override individual ratings manually
- When done, confirm the shortlist — each candidate is assigned a final status (Shortlisted / Rejected / Saved)

---

## Tech Stack

### Backend

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express 4 |
| LLM | OpenAI API — `gpt-4.1-mini` (screening), `gpt-4o` (vision OCR fallback) |
| PDF Parsing | `pdf-parse` → `pdfjs-dist` → GPT Vision (three-layer cascade) |
| Word Parsing | `mammoth` (.docx / .doc) |
| File Uploads | `multer` (memory storage) |
| Security | `helmet`, `cors`, `express-rate-limit` |
| Dev Server | `ts-node-dev` (hot reload) |

### Frontend

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS 3 |
| Animations | Framer Motion |
| Icons | Lucide React |
| PDF Viewer | `pdfjs-dist` |
| Persistence | IndexedDB (browser native) + `localStorage` |

---

## Project Structure

```
resume-screener/
├── backend/
│   ├── src/
│   │   ├── index.ts                  # Express app, CORS, rate limits, route registration
│   │   ├── costTracker.ts            # Per-request LLM token + cost logging
│   │   ├── pedigreeLists.ts          # Tier 1/2 college and company reference lists
│   │   └── routes/
│   │       ├── generatePrompt.ts     # All prompt-related endpoints
│   │       ├── parsePdf.ts           # PDF/Word parsing endpoint
│   │       ├── mockFlow.ts           # Streaming evaluation endpoints
│   │       └── share.ts              # Shareable role link endpoints
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                   # Root component — all state, flow logic, screener UI
│   │   ├── RolesList.tsx             # Roles dashboard + ATSRole / ATSCandidate types
│   │   ├── RoleDetail.tsx            # Single role view — candidates table, tabs, share
│   │   ├── CreateRole.tsx            # New role creation form
│   │   ├── SendShortlistModal.tsx    # Shortlist confirmation modal
│   │   ├── PdfViewer.tsx             # Embedded PDF viewer
│   │   ├── api.ts                    # Typed API client + SSE streaming helpers
│   │   ├── types.ts                  # Shared TypeScript types
│   │   ├── idbFiles.ts               # IndexedDB helpers for resume file persistence
│   │   └── main.tsx                  # React DOM entry point
│   ├── vercel.json                   # SPA routing rewrite (serves index.html for all paths)
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
│
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- An OpenAI API key

### 1. Clone the repository

```bash
git clone <repo-url>
cd resume-screener
```

### 2. Set up the backend

```bash
cd backend
npm install
cp .env.example .env          # or create .env manually
# Add your OPENAI_API_KEY to .env
npm run dev                   # starts on http://localhost:3001
```

### 3. Set up the frontend

```bash
cd frontend
npm install
npm run dev                   # starts on http://localhost:5173
```

The frontend dev server proxies all `/api` requests to `localhost:3001`, so no additional configuration is needed locally.

### 4. Open the app

Navigate to `http://localhost:5173` in your browser.

---

## Environment Variables

### Backend — `backend/.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | Yes | — | OpenAI API key. The server will not start without this. |
| `PORT` | No | `3001` | Port the Express server listens on. Render sets this automatically. |
| `ALLOWED_ORIGINS` | No | `http://localhost:5173` | Comma-separated list of allowed CORS origins. Set to your Vercel domain in production. |

### Frontend — build-time

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_BASE` | No | `/api` | Base URL for all API calls. Set to your Render backend URL in production (e.g. `https://your-app.onrender.com/api`). |

---

## Backend API Reference

All routes are prefixed `/api`. Rate limits apply to LLM routes (300 req / 15 min) and upload routes (2000 req / 15 min).

---

### Prompt Generation

#### `POST /api/generate-jd`
Converts a casual role description into a structured job description.

**Request**
```json
{
  "role_name": "Senior Product Manager",
  "statement": "We need someone who has shipped 0-to-1 products at a startup..."
}
```

**Response**
```json
{ "jd": "We are hiring a Senior PM to lead...\n- Own the roadmap..." }
```

---

#### `POST /api/generate-prompt`
Extracts structured hiring criteria from a job description and returns the compressor and evaluator prompts.

**Request**
```json
{
  "jd": "Full job description text...",
  "role_title_override": "Senior PM"
}
```

**Response**
```json
{
  "extracted_params": {
    "role_title": "Senior PM",
    "seniority": "senior",
    "min_experience_months": 48,
    "hard_requirements": [...],
    "p0_signals": [...],
    "p1_signals": [...],
    "red_flags": [...]
  },
  "compressor_prompt": "Extract resume signals as JSON...",
  "evaluator_prompt": ""
}
```

---

#### `POST /api/build-evaluator-prompt`
Builds a complete evaluator prompt from a criteria object. Called after the user reviews and edits criteria in the UI.

**Request**
```json
{
  "criteria": {
    "role_title": "Senior PM",
    "seniority": "senior",
    "min_experience_months": 48,
    "p0_text": "Led a 0-to-1 product with measurable outcomes...",
    "p1_text": "2+ years PM experience at a growth-stage startup...",
    "dealbreakers": "Never shipped a product end-to-end",
    "skills": ["roadmapping", "SQL", "user research"],
    "education_pedigree": ["tier_1"],
    "adjacent_roles_policy": "strict_reject"
  }
}
```

**Response**
```json
{ "evaluator_prompt": "You are a senior hiring manager evaluating resumes for..." }
```

---

#### `POST /api/compress-eval-prompt`
Summarizes an evaluator prompt into a structured overview for display in the UI.

**Response**
```json
{
  "must_have": ["3+ years PM experience", "shipped 0-to-1 product"],
  "p0": ["owned full roadmap", "measurable growth impact"],
  "p1": ["B2B SaaS experience", "cross-functional leadership"],
  "reject": ["no product ownership", "only analyst experience"],
  "background": ["engineering or design background a plus"]
}
```

---

#### `POST /api/recalibrate-prompt`
Adjusts the evaluator prompt based on HR feedback on misclassified resumes.

**Request**
```json
{
  "evaluator_prompt": "Current prompt text...",
  "feedback": [
    {
      "filename": "candidate_a.pdf",
      "decision": "P1",
      "reasoning": ["Has PM experience", "Led team of 3"],
      "hr_agrees": false,
      "hr_direction": "higher",
      "hr_target": "P0"
    }
  ]
}
```

**Response**
```json
{ "new_evaluator_prompt": "Updated prompt text with surgical adjustments..." }
```

---

#### `POST /api/generate-clarifying-questions`
Identifies vague phrases in criteria and generates targeted clarifying questions.

**Response**
```json
{
  "needs_clarification": true,
  "questions": [
    {
      "id": "q1",
      "field": "p0",
      "question": "What does 'strong product sense' mean for this role?",
      "context": "This phrase appears in your P0 criteria",
      "options": ["Has shipped features based on user research", "Owns full roadmap decisions", "Has run A/B tests with measurable outcomes"]
    }
  ]
}
```

---

### Resume Parsing

#### `POST /api/parse-pdf`
Parses text from a PDF or Word document using a three-layer cascade.

**Request** — `multipart/form-data` with field `pdf`

Supported formats: `.pdf`, `.docx`, `.doc`

**Parsing cascade:**
1. `pdf-parse` — fast text extraction
2. `pdfjs-dist` — fallback for complex/scanned PDFs
3. `gpt-4o` Vision — final fallback for image-only PDFs

**Response**
```json
{
  "text": "Extracted resume text including embedded links...",
  "error": null
}
```

---

### Streaming Evaluation

These endpoints return **Server-Sent Events** (SSE). Each event is a JSON line prefixed `data: `.

#### `POST /api/bulk-screen-stream`
Screens a batch of resumes. Processes 6 concurrently.

**Request**
```json
{
  "resumes": [{ "text": "Resume text...", "filename": "candidate.pdf" }],
  "compressor_prompt": "...",
  "evaluator_prompt": "...",
  "label": "FULL POOL — Screen All"
}
```

**SSE Events**
```
data: { "type": "start", "total": 50 }
data: { "type": "result", "completed": 1, "total": 50, "data": { "filename": "...", "name": "Jane Doe", "rating": "P0", "score": 87, "reasoning": [...], "concerns": [...], "reject_reason": null, "signal_json": {...} } }
data: { "type": "done" }
```

#### `POST /api/bulk-eval-stream`
Re-evaluates pre-parsed candidates (with existing `signal_json`) using a new evaluator prompt. Used during recalibration to avoid re-parsing.

#### `POST /api/screen-and-sample`
Screens all resumes then selects a diverse calibration sample (prioritises P0 → edge cases → P1 → borderline → weak rejects).

---

### Share

#### `POST /api/share`
Creates a shareable snapshot of a role. Returns a human-readable token derived from the role title.

**Request**
```json
{ "role": { ...ATSRole object... } }
```

**Response**
```json
{ "token": "senior-product-manager-a3f2b1" }
```

#### `GET /api/share/:token`
Returns the role data and list of uploaded file names.

```json
{
  "role": { ...ATSRole... },
  "availableFiles": ["candidate_a.pdf", "candidate_b.pdf"]
}
```

#### `PUT /api/share/:token`
Updates the role data (candidate status changes, new screening results, etc.).

#### `POST /api/share/:token/files`
Uploads resume files to the share store. `multipart/form-data` with field `files` (multiple).

#### `GET /api/share/:token/file/:filename`
Serves a specific uploaded resume file inline.

---

### Monitoring

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Returns `{ "status": "ok" }` |
| `/costs` | GET | HTML cost dashboard (auto-refreshes every 4s) |
| `/costs/data` | GET | Raw JSON cost log |
| `/costs/clear` | POST | Clears the in-memory cost log |

---

## Frontend Architecture

### State Management

All state lives in `App.tsx` — no external state library. The component is large by design: the 3-step screener is a tightly coupled flow where sharing state across steps is a requirement.

Key state groups:

| Group | State |
|---|---|
| Step 1 | `jd`, `describeRole`, `generatedJd`, `criteria`, `paramsData`, `compressedView` |
| Step 2 | `tasteResumes`, `tasteResults`, `feedback`, `disagreeStage`, `calibrationComplete` |
| Step 3 | `bulkResumes`, `bulkResults`, `screening`, `bulkProgress`, `manualRatingOverrides` |
| ATS | `appView`, `activeRoleId`, `roles`, `showShortlistModal` |
| UI | `step`, `vaguenessModal`, `resumeModal`, `clarifyingQuestions` |

### Views

`AppView` is a union type controlling which top-level component renders:

```
"roles"        → RolesList       — all roles dashboard
"create-role"  → CreateRole      — new role form
"role-detail"  → RoleDetail      — candidates table for one role
"screener"     → App (inline)    — 3-step screener sidebar + content
```

### Per-Role Persistence

Each role in `rs:roles` localStorage carries:

```typescript
interface ATSRole {
  id: string;
  title: string;
  department?: string;
  createdAt: string;
  status: "active" | "draft";
  candidates: ATSCandidate[];
  params?: GeneratePromptResponse;       // evaluator + compressor prompts
  tasteCalibrated?: boolean;             // true after taste calibration is done
  screenerState?: Record<string, any>;   // jd, criteria, compressedView, etc.
  shareToken?: string;                   // set once the owner creates a share link
}
```

When a user navigates back to a role's screener, `restoreRoleScreenerState()` hydrates all 40+ state variables from the saved `screenerState` and `params`, so nothing is ever lost.

### Candidate Model

```typescript
interface ATSCandidate {
  filename: string;
  name: string;
  email: string | null;
  phone: string | null;
  aiRating: "P0" | "P1" | "Reject" | "Error";
  finalRating: string;
  status: "new" | "shortlisted" | "rejected" | "saved";
  reason: string | null;
  reasoning: string[];
  concerns: string[];
  collegeName?: string | null;
  collegeTier?: string | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  yearsExperience?: number | null;
  runAt: string;
}
```

---

## Data Persistence

The app uses three storage layers, accessed in priority order.

### 1. `localStorage` — Role & Criteria

Key `rs:roles` stores the full `ATSRole[]` array, including candidates, params, and screener state. Survives page refresh indefinitely.

Key `rs:state` stores transient session state (criteria, compressedView) as a secondary backup.

### 2. IndexedDB — Resume Files

Database: `rs-files-v1`, store: `resumes`.

Every uploaded file is written to IndexedDB immediately via `idbSaveFile(filename, file)`. On any subsequent session, `findResumeFile(filename)` checks:

1. In-memory `allFilesRef` (fastest, cleared on page close)
2. `idbGetFile(filename)` (survives page refresh, survives across sessions)
3. Backend share store via `GET /api/share/:token/file/:filename` (for shared-link recipients who never uploaded the files themselves)

This means the "View" button on every candidate always works — even after closing and reopening the tab.

### 3. Backend In-Memory — Shared Roles

The share store (`Map<token, ShareEntry>`) lives in backend process memory. It is ephemeral — data is lost on server restart or redeploy. For a production-grade version, replace with a persistent store (Redis, Postgres, S3 for files).

---

## Share Feature

Every role can be shared via a clean URL. The recipient gets full access — they can view candidates, update statuses, screen more resumes, and view PDFs.

### Flow

1. Owner clicks **Share** on any role (in the roles table or the role detail page)
2. Backend creates a share: `POST /api/share` with the role data
3. Token is generated as `slugify(role.title) + '-' + 6-char-hex`
   - Example: `senior-product-manager-a3f2b1`
4. Share URL is constructed as `https://yourdomain.com/role/senior-product-manager-a3f2b1`
5. Owner copies and sends the link

### Recipient Experience

1. Browser navigates to `/role/senior-product-manager-a3f2b1`
2. Vercel's SPA rewrite serves `index.html` (configured in `frontend/vercel.json`)
3. App detects the `/role/` path on mount, calls `GET /api/share/:token`
4. Fetched role is added to the recipient's local state; app navigates to role-detail
5. Any mutations (status changes, new shortlists) sync back to the backend via `PUT /api/share/:token`
6. Newly screened resume files are uploaded to the share store via `POST /api/share/:token/files`

### Sync Rules

| Action | Sync trigger |
|---|---|
| Candidate status change | `PUT /api/share/:token` immediately |
| Bulk status update | `PUT /api/share/:token` immediately |
| Shortlist confirmed | `PUT /api/share/:token` + upload new PDFs |
| Navigate away from screener | `PUT /api/share/:token` + upload new PDFs |

---

## Deployment

### Frontend — Vercel

1. Connect the `frontend/` directory to a Vercel project
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Add environment variable: `VITE_API_BASE=https://your-backend.onrender.com/api`
5. The `vercel.json` in `frontend/` handles SPA routing — all paths (including `/role/*`) serve `index.html`

### Backend — Render

1. Create a new **Web Service** on Render pointing to the `backend/` directory
2. Set build command: `npm install && npm run build`
3. Set start command: `node dist/index.js`
4. Add environment variables:
   - `OPENAI_API_KEY` — your OpenAI key
   - `ALLOWED_ORIGINS` — your Vercel frontend URL (e.g. `https://your-app.vercel.app`)
5. Render automatically assigns `PORT`

### CORS

The backend reads `ALLOWED_ORIGINS` as a comma-separated list. In production, set it to exactly your Vercel domain. Multiple origins are supported:

```
ALLOWED_ORIGINS=https://your-app.vercel.app,https://custom-domain.com
```

---

## Cost Tracking

Every LLM call is logged in the in-memory cost tracker with:

- Timestamp
- Label (e.g. "FULL POOL — Screen All")
- Group (e.g. "Step 1 — Setup", "Taste Calibration", "Full Pool")
- Model
- Input tokens, output tokens
- Estimated cost in USD

Access the dashboard at `https://your-backend.onrender.com/costs`.

The dashboard auto-refreshes every 4 seconds and shows subtotals per group and a grand total. Click **Clear** to reset.

Typical cost per resume screened: **$0.002–$0.008** depending on resume length and prompt complexity.

---

## Rate Limits

| Route group | Limit |
|---|---|
| All LLM routes (`/generate-prompt`, `/recalibrate-prompt`, `/bulk-screen-stream`, etc.) | 300 requests / 15 min per IP |
| PDF upload (`/parse-pdf`, `/share/:token/files`) | 2000 requests / 15 min per IP |

Exceeding limits returns HTTP 429 with `{ "error": "Too many requests. Please wait and try again." }`.
