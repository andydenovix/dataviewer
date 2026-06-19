# DeNovix Data Vault

A cloud-based laboratory data management platform built for DeNovix instruments. Data Vault centralises spectrophotometry, fluorometry, and cell-counting results in one place, applies automated QC logic, and provides analytical tools that would otherwise require a dedicated LIMS or hours of manual Excel work.

---

## Features

### 1. Data Upload & Parsing
Drag-and-drop upload of CSV or text files exported directly from DeNovix DS-11, QFX, and CellDrop instruments. The parser automatically detects sample names, measurement types, concentrations, 260/280 and 260/230 ratios, and spectral data. Multiple files can be uploaded in a single batch.

**Real-world relevance:** Eliminates manual data transcription, a common source of error in labs running 20–100 samples per day. Results are in the cloud within seconds of measurement.

---

### 2. Automated QC Evaluation
Every sample is evaluated against a QC profile the moment it is uploaded. Five built-in presets cover the most common applications:

| Preset | 260/280 | 260/230 | Min Conc |
|---|---|---|---|
| dsDNA | 1.80 – 2.00 | 2.00 – 2.30 | 10 ng/µL |
| RNA | 2.00 – 2.20 | 2.00 – 2.30 | 50 ng/µL |
| Protein | — | — | 0.1 µg/mL |
| Cell Counting | — | — | viability ≥ 80 %, count ≥ 500 K |
| General | 1.70 – 2.10 | 1.80 – 2.30 | 1 ng/µL |

Samples are tagged **PASS / WARN / FAIL** in the table with violation details. Personal and lab-wide profiles can be customised.

**Real-world relevance:** Immediately flags samples that will underperform in downstream assays such as NGS library prep, qPCR, or transfection, before reagents and time are wasted.

---

### 3. Protocol Templates
Named protocols (e.g. *gDNA Extraction — DNeasy Kit*) bundle a QC preset, expected application, required metadata fields, kit name, and operator notes. When a file is uploaded under a protocol, the correct QC thresholds are applied automatically and the protocol name is stored with every sample for traceability.

**Real-world relevance:** Enforces SOPs at the point of data entry. New operators cannot accidentally apply the wrong QC criteria. Satisfies GLP documentation requirements for kit lot traceability.

---

### 4. SmartQC (Spectrophotometry vs. Fluorometry Pairing)
Matches UV-Vis spectrophotometry results against fluorometry results (e.g. Qubit or QFX) for the same sample. The method delta is computed as:

```
delta % = |conc_spectro − conc_fluor| / mean × 100
```

Pairs that exceed the configured threshold (default 20 %) are flagged as a fail. The QC view shows both measurements side by side with a verdict.

**Real-world relevance:** Spectrophotometry measures all UV-absorbing material including contaminants. Fluorometry is nucleic-acid-specific. A large delta reveals that a sample is impure even when the 260/280 ratio appears acceptable — a critical check before expensive downstream workflows.

---

### 5. Spectral Fingerprinting & Anomaly Detection
Stores reference spectra for each application and computes cosine similarity between new samples and the reference library. Six rule-based anomaly checks run automatically on every spectro sample:

| Rule | Threshold | Likely cause |
|---|---|---|
| Particulates / aggregation | A₃₂₀ > 5 % of A₂₆₀ | Insoluble debris — centrifuge and re-measure |
| Guanidinium / EDTA carryover | A₂₃₀ / A₂₆₀ > 1.4 | Incomplete column wash — repeat wash steps |
| Phenol contamination | A₂₇₀ / A₂₆₀ > 0.72 | TRIzol residue — ethanol precipitate |
| Residual ethanol / IPA | A₂₃₀ / A₂₆₀ > 1.9 | Incomplete drying — air-dry pellet longer |
| Protein co-purification | A₂₈₀ / A₂₆₀ > 0.56 | Protein contamination — add proteinase K step |
| Aromatic shoulder | 0.88 < A₂₅₀ / A₂₆₀ < 0.99 | Phenolic / aromatic contaminant |

Samples with a cosine similarity below 0.97 against reference spectra fail the fingerprint check regardless of whether their ratios pass — catching contaminants that do not shift the classic ratios.

**Real-world relevance:** Ratio-based QC misses many real contamination scenarios. Spectral fingerprinting replicates the expert eye of an experienced analyst who can recognise an unusual spectral shape at a glance.

---

### 6. Trend & Drift Analytics
Time-series charts of concentration, 260/280, 260/230, viability, and total cell count, grouped by application. A linear regression trend line and a drift summary card highlight when a metric is drifting more than 2 % per month.

**Real-world relevance:** Detects reagent lot changes, instrument calibration drift, or seasonal temperature effects weeks before results fall out of specification.

---

### 7. Levey-Jennings Run Control Charts
Plots QC control samples over time with ±1 SD, ±2 SD, and ±3 SD bands. Six Westgard multi-rule violations are detected automatically:

| Rule | Trigger | Action |
|---|---|---|
| 1-2s | One point > ±2 SD | Warning — investigate |
| 1-3s | One point > ±3 SD | Reject run |
| 2-2s | Two consecutive > ±2 SD same side | Reject run |
| R-4s | Range within run > 4 SD | Reject run |
| 4-1s | Four consecutive > ±1 SD same side | Warning |
| 10x | Ten consecutive on same side of mean | Warning — systematic bias |

**Real-world relevance:** Standard in clinical and regulated research labs (CLIA, CAP, ISO 15189). Replaces manual Levey-Jennings spreadsheets that are error-prone and version-controlled informally.

---

### 8. Batch QC Summary Report (PDF)
Generates a printable one-page batch report with run date, operator, instrument, pass/fail summary, per-sample results table, and a signature block. Supports custom date-range filtering (quick presets or specific From/To dates). An AI-generated 2–3 sentence QC narrative is optionally inserted using Claude Haiku.

**Real-world relevance:** Many labs still produce batch QC reports manually in Word or Excel. This replaces that process with a print-to-PDF workflow taking under 30 seconds.

---

### 9. Dilution Plate Planner
Takes a list of samples with their current concentrations and computes per-well dilution volumes to reach a target concentration and total volume. Supports 96-, 48-, and 24-well formats. Results export as a CSV compatible with liquid-handling robots (Hamilton, Tecan, etc.).

**Real-world relevance:** Dilution calculation errors are one of the most common causes of NGS library failure. Automating the calculation and exporting directly to a liquid handler eliminates both manual error and time.

---

### 10. Replicate Management
Groups replicate samples, computes mean, SD, and CV% across replicates, and surfaces any outlier replicates that exceed the CV threshold.

---

### 11. Lab Groups & Collaboration
Users can create named lab groups, invite colleagues by join code, and share sample batches with the group. Shared samples are visible to all group members in a separate view. Notifications are sent when samples are shared.

---

### 12. QR Code Report
Generates a QR code linking to a mobile-friendly summary report for any sample or batch. Useful for attaching a scan-able label to a tube or sample box that retrieves the full analytical record.

---

### 13. REST API Endpoint for Direct Instrument Integration

Data Vault exposes a POST endpoint that instruments or middleware can call directly, removing the need to manually export CSV files:

```
POST /api/ingest
Content-Type: application/json
Authorization: Bearer <api-key>
```

```json
{
  "userId": "lab-service-account-uid",
  "samples": [
    {
      "sampleName": "Sample_001",
      "sampleType": "spectro",
      "application": "DNA",
      "concentration": 142.5,
      "ratios": { "260/280": 1.88, "260/230": 2.14 },
      "measuredAt": "2025-06-19T14:32:00Z",
      "data": {
        "wavelengths": [220, 222, 224, "..."],
        "absorbance":  [0.42, 0.40, 0.39, "..."]
      },
      "metadata": { "unit": "ng/µL", "instrument": "DS-11 #4421" }
    }
  ]
}
```

The endpoint validates the payload, writes to Firestore, and returns sample IDs. Any instrument with network access and a middleware script (Python, Node, or instrument-native scripting) can post results without user interaction.

**Real-world relevance:** Bridges the gap between standalone bench instruments and a centralised data platform without requiring full LIMS integration. Labs running automated pipelines can push results from liquid handlers, plate readers, or sequencers directly.

> **Implementation note:** The `/api/ingest` endpoint is described here as an integration pattern. Adding it requires creating the route at `src/app/api/ingest/route.ts` with Bearer token verification middleware. The architecture is already in place — it uses the same Firestore write path as the upload parser.

---

### 14. Demo Mode
A one-click demo data seed loads 45 realistic sample records across three protocols, spanning 60 days of history. Demo data exercises every analytical feature: passing and failing QC samples, control charts with Westgard violations, spectral anomalies, paired fluorometry with passing and failing method deltas, and declining cell viability batches. All demo records are tagged and can be removed with a single click.

---

## Architecture

### Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router, React 19) |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Charts | Plotly.js (async-loaded) |
| Icons | Lucide React |
| Auth | Firebase Auth (Google OAuth 2.0) |
| Database | Cloud Firestore (Firebase 12) |
| AI | Anthropic Claude Haiku 4.5 |
| Hosting | Netlify (serverless edge functions) |

---

### System Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                           │
│                                                                     │
│   Next.js App (React 19 / Tailwind)                                 │
│   ┌────────────┐  ┌──────────────┐  ┌─────────────────────────┐    │
│   │ FileUpload │  │ SampleDash   │  │  Analytical Overlays    │    │
│   │ (parsers)  │  │ (table, QC)  │  │  Trend/LJ/Spectral/Batch│    │
│   └─────┬──────┘  └──────┬───────┘  └────────────┬────────────┘    │
│         │                │                        │                 │
│         └────────────────┴────────────────────────┘                 │
│                          │  Firestore SDK (real-time onSnapshot)    │
└──────────────────────────┼──────────────────────────────────────────┘
                           │
           ┌───────────────▼───────────────┐
           │       Firebase Platform        │
           │                               │
           │  ┌────────────┐  ┌─────────┐  │
           │  │  Firebase  │  │  Cloud  │  │
           │  │   Auth     │  │Firestore│  │
           │  │(Google SSO)│  │         │  │
           │  └────────────┘  └─────────┘  │
           │     Google-managed infra       │
           │     Multi-region replication   │
           └───────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        SERVER (Netlify)                             │
│                                                                     │
│   Next.js API Routes (Edge / Serverless Functions)                  │
│                                                                     │
│   POST /api/batch-summary  ──────────────────────────────────────┐  │
│   POST /api/ingest (integration pattern)                         │  │
│                                                                  │  │
└──────────────────────────────────────────────────────────────────┼──┘
                                                                   │
                           ┌───────────────▼────────────────┐
                           │       Anthropic Claude API      │
                           │                                 │
                           │  claude-haiku-4-5-20251001      │
                           │  Batch QC narrative generation  │
                           │  (API key stored server-side,   │
                           │   never exposed to client)      │
                           └─────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                 Instrument / Middleware (optional)                  │
│                                                                     │
│   DeNovix DS-11 / QFX / CellDrop                                    │
│     → CSV export → browser upload (current)                        │
│                                                                     │
│   OR: direct REST POST to /api/ingest (Python / Node script)        │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Firebase Integration

**Authentication** uses Firebase Auth with Google OAuth 2.0 as the sole identity provider. JWTs are issued by Google and verified by Firebase on every request. No passwords are stored — the identity burden is entirely delegated to Google's infrastructure.

**Firestore** is the primary database. The client SDK subscribes to data with `onSnapshot`, giving real-time updates to all open browser tabs without polling. Data is structured as flat top-level collections (`samples`, `protocols`, `referenceSpectra`, `labs`, `userSettings`, etc.) rather than deep nesting, keeping queries simple and indexes minimal.

Writes use `writeBatch` for atomic multi-document operations (e.g. seeding demo data, pairing samples). Large deletions chunk batches at 490 operations to stay within Firestore's 500-write limit.

---

### Anthropic Claude Integration

The AI summary feature uses a **Next.js API route** (`/api/batch-summary`) as a proxy. The Anthropic API key is stored in an environment variable (`ANTHROPIC_API_KEY`) on the server and is never sent to the browser. The API route:

1. Receives a JSON payload of batch statistics from the client
2. Constructs a structured prompt (batch dates, operator, pass/fail counts, mean ratios)
3. Calls `claude-haiku-4-5-20251001` via the Anthropic Messages API
4. Returns the generated narrative to the client

If no API key is configured the route returns HTTP 503, and the UI falls back gracefully without breaking the rest of the report.

---

### Netlify Hosting

The Next.js app is deployed on Netlify using the `@netlify/plugin-nextjs` adapter, which maps:

- **Static assets** → Netlify CDN edge nodes (global, <20 ms TTFB)
- **React Server Components / pages** → Netlify serverless functions (on-demand)
- **API routes** → Netlify edge functions (runs close to the user)

Environment variables (`ANTHROPIC_API_KEY`, Firebase config) are set in the Netlify dashboard and injected at build/runtime. No secrets touch the repository.

---

## Security

### Authentication & Authorisation

- **Google OAuth only.** There are no username/password credentials to phish, brute-force, or rotate. Account recovery is handled entirely by Google.
- **Firestore Security Rules** enforce ownership at the database layer — the client SDK cannot bypass them. Key rules:
  - `samples`: owners can read/write their own; lab members can read shared samples
  - `labs`: only existing members can update a lab document (prevents self-invitation attacks)
  - `protocols`, `referenceSpectra`, `userSettings`: strict owner-only CRUD
  - Personal QC profiles stored in `userSettings/{uid}`, accessible only by the matching UID
- Rules are deployed separately from application code and take effect immediately without a redeployment.

### API Security

- The Anthropic API key lives exclusively in Netlify environment variables. It is never bundled into client JavaScript.
- The `/api/batch-summary` route accepts only POST requests and validates the body shape before forwarding to Anthropic.
- The planned `/api/ingest` endpoint uses Bearer token authentication against a service-account UID stored in environment variables.

### Data Isolation

- Every Firestore document carries a `userId` field. All security rules check `request.auth.uid == resource.data.userId` before allowing access.
- Lab sharing is explicit and opt-in. Samples are only visible to lab members when the owner explicitly shares them by setting `sharedWithLabId`.
- Demo data is tagged `isDemo: true` and can be bulk-deleted independently of real data.

### Transport Security

- All traffic is HTTPS-only (enforced by Netlify and Firebase).
- Firebase SDK communicates over HTTPS/WebSocket TLS.
- No sensitive data is stored in `localStorage` or cookies — Firebase Auth tokens are managed in-memory by the SDK.

---

## Scalability

### Firestore

Firestore is a horizontally partitioned, multi-region NoSQL database. It handles:

- **1 million concurrent connections** per project
- **1 billion reads per day** on the Blaze (pay-as-you-go) plan
- **Automatic sharding** — no manual capacity planning required
- **Multi-region replication** available for production workloads requiring < 5 ms read latency

For a platform serving thousands of users and hundreds of labs:

- Each lab's samples sit in the same flat `samples` collection, filtered by `userId` or `sharedWithLabId`. Firestore indexes scale independently of data volume.
- High-volume labs (>100 K samples) can add a composite index on `(userId, measuredAt DESC)` for fast paginated queries — the current `PAGE_SIZE = 100` + `loadMore` pattern is already in place.
- Write throughput for a single document path is 1 write/second; for parallel sample uploads across many users this is never a bottleneck because each sample is a distinct document.

### Netlify / Next.js

Netlify serverless functions scale to **zero when idle** and spin up instances in parallel under load with no configuration. There is no fixed server to provision or maintain.

- The Next.js App Router statically pre-renders pages where possible; only authenticated routes and API endpoints are serverless.
- Cold start time for Netlify functions is typically 50–200 ms; the Anthropic API call dominates latency in the batch-summary route.

### Firebase Auth

Firebase Auth is Google-managed global infrastructure with no per-project user limits. Thousands of concurrent sign-ins are handled transparently.

### Multi-Lab Isolation at Scale

The `labs` collection stores member lists. The `isLabMember` Firestore function reads the lab document on every shared-sample query. At very high scale (>500 members per lab) this can be replaced with a custom claim written to the Firebase Auth JWT at sign-in time, eliminating the per-query lookup entirely.

### Cost Profile (Firestore Blaze plan)

| Action | Unit cost |
|---|---|
| Document reads | $0.06 / 100 K |
| Document writes | $0.18 / 100 K |
| Storage | $0.18 / GB / month |
| Netlify functions | First 125 K invocations/month free |

A lab running 500 samples/day with 50 active users costs approximately **$2–5/month** in Firestore operations. The platform can serve hundreds of independent labs with costs scaling linearly with usage.

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Netlify env / `.env.local` | Claude Haiku API access for batch summaries |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Netlify env / `.env.local` | Firebase project identifier (not a secret) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Netlify env / `.env.local` | Firebase Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Netlify env / `.env.local` | Firestore project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Netlify env / `.env.local` | Firebase Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Netlify env / `.env.local` | Firebase Messaging |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Netlify env / `.env.local` | Firebase App ID |

Firebase config values are **not secrets** — they identify the project but access is controlled entirely by Firestore Security Rules and Firebase Auth. The Anthropic key is the only value that must be kept server-side.

---

## Local Development

```bash
npm install
# Create .env.local with ANTHROPIC_API_KEY and Firebase config values
npm run dev
# → http://localhost:3000
```

Deploy Firestore Security Rules after any changes:

```bash
firebase deploy --only firestore:rules
```
