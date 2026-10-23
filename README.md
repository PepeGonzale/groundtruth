# Groundtruth

Grounded question answering over operational documents. The interesting part is
not the chat box. It is the refusal path: **the assistant is allowed to say it
does not know, and the retrieval pipeline decides that before a model speaks.**

```
question
   │
   ├─ BM25 (content tokens, k1 1.5, b 0.75)  ─┐
   │                                          ├─ reciprocal rank fusion → top 8
   └─ MiniLM (384d, local ONNX, cosine)     ─┘
                                                │
                                     confidence gate
                                      │            │
                                   refuse       ground
                                      │            │
                                      │      citations + contradiction scan
                                      │            │
                                      │      extractive composer
                                      │      or Claude (validated)
                                      ▼            ▼
                                   "not enough information"   cited answer
```

The demo corpus is nine synthetic operations documents for a cold-chain
logistics company: SLAs, incident response, cold-chain procedure, on-call,
access control, retention, supplier onboarding and change management. It
contains deliberate contradictions: the 2025 SLA amendment changes the on-time
target and the claims window, and the cold-chain playbook sets a stricter
customer-notification time than the SLA. The assistant is expected to surface
both values and say which document prevails.

## Try it

```bash
npm install
npm run dev          # http://localhost:3000
```

No API key is required. The default answer is assembled from quoted sentences,
with the document and section attached. To enable Claude generation:

```bash
cp .env.example .env.local
# set ANTHROPIC_API_KEY
npm run dev
```

The interface is an operations console with five views: Ask, Library,
Evaluation, Connectors and System. Every answer exposes the retrieval trace:
query tokens, BM25 and cosine scores, reciprocal-rank fusion, confidence,
coverage, chunk metadata and contradictions. Click a citation marker to
highlight the chunk it resolves to.

## Connectors

Documents enter through a single contract — fetch, normalize, hash, store —
regardless of where they come from. `npm run ingest` syncs configured sources
into `data/documents.json`; `npm run index` rebuilds the retrieval index.

| Connector | What it reads | Credentials |
| --- | --- | --- |
| `local` | Markdown, TXT, PDF, DOCX from a folder. PDFs split by page; optional sidecar `.meta.json`. | none |
| `confluence` | Confluence Cloud pages via REST. Storage XHTML becomes headings and lists. | `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`, optional `CONFLUENCE_SPACE_KEYS` |
| `sharepoint` | A SharePoint document library via Microsoft Graph, folders walked recursively. | `SHAREPOINT_TENANT_ID`, `SHAREPOINT_CLIENT_ID`, `SHAREPOINT_CLIENT_SECRET`, `SHAREPOINT_SITE_ID` (or hostname/path) |
| `gdrive` | Google Docs, Sheets, PDFs and Office files from a folder. Docs export as text; Sheets as CSV. | `GOOGLE_DRIVE_FOLDER_ID` plus `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_DRIVE_ACCESS_TOKEN` |

```bash
npm run sync                                        # all configured sources + index
npm run ingest -- --source=confluence && npm run index
npm run ingest -- --source=local --path=./docs && npm run index
```

The sync compares SHA-256 hashes per external id, so unchanged documents keep
their metadata and the report says how many were added, changed or removed.
Credentials stay in the environment; the browser receives only document
metadata, counts and sync status. Confluence, SharePoint and Drive are capped
at 1,000 documents per sync (2,000 for local folders) and fetch sequentially —
enough for a demo, not for a large tenant.

## Evaluation

```bash
npm run eval
```

27 authored questions: 23 answerable, 4 out of scope, 3 with conflicting
sources. The last run on the committed index:

| Metric | Result | What it measures |
| --- | --- | --- |
| Recall @ 5 | 1.00 | expected document appears in the top five |
| MRR | 1.00 | rank of the first expected document |
| Refusal accuracy | 1.00 | answer when supported, abstain when not |
| False answer rate | 0.00 | answerable questions wrongly refused |
| Citation validity | 1.00 | every marker resolves to a retrieved chunk |
| Contradiction recall | 1.00 | conflicting versions detected |
| Answer keywords | 1.00 | required value present in the answer |

This is a regression suite written against this corpus, not a benchmark. A 1.00
means the pipeline still behaves as designed; it says nothing about general
retrieval quality. `data/eval.json` keeps every row and `npm run eval` rewrites
it.

## Tests

```bash
npm test             # node:test, dense retrieval disabled
npm run typecheck
npm run build
```

The tests cover frontmatter and chunking, tokenisation, BM25 ranking, the
refusal path, citation resolution, contradiction detection, input sanitisation,
the Claude output parser and all four connectors (Confluence, SharePoint and
Drive use mocked HTTP; the local connector reads a real PDF fixture). They run
without downloading the embedding model.

## Stack

- Next.js 16 (App Router, one dynamic console page, two API routes)
- React 19, TypeScript strict with `noUncheckedIndexedAccess`
- No UI framework; hand-written CSS tokens
- `@huggingface/transformers` with `Xenova/all-MiniLM-L6-v2` (q8 ONNX)
- Anthropic SDK only when `ANTHROPIC_API_KEY` is set; dynamic import
- `node:test` for unit tests, `tsx` for scripts

There is no vector database. Fifty-five chunks with 384 dimensions fit in an
~200 KB JSON file, so the index is a build artifact, not a service. A real
deployment with a larger corpus would swap the store, not the retrieval
contract.

## How it works

1. **Ingest.** Connectors normalize documents to `title`, `owner`, `version`,
   `effective`, `classification`, optional `supersedes`, body and source URL.
   Local Markdown keeps its frontmatter; SaaS sources map their metadata.
2. **Chunk.** Split on `##` headings, then at paragraph boundaries above 780
   characters. Each chunk keeps its document and section identity.
3. **Retrieve.** BM25 over stemmed content tokens (prefix matching for
   morphology) and a local MiniLM embedding. Both rank the corpus independently.
4. **Fuse.** Reciprocal rank fusion (`k = 60`) avoids normalising incomparable
   scores. Top eight chunks survive.
5. **Gate.** Confidence combines query coverage, best cosine and normalised
   BM25. Unknown query terms, low cosine and low coverage can force a refusal
   before generation.
6. **Compose.** The extractive composer ranks sentences by weighted query
   overlap, figures, section relevance and answer-type signals (who questions
   prefer roles, procedural questions prefer imperative steps). Each sentence
   carries the chunk marker it came from.
7. **Check.** The contradiction scanner compares numeric claims with matching
   units across documents, then prefers the newer document or an explicit
   supersession. In Claude mode, every `[S#]` marker is validated against the
   retrieved set; an unverifiable answer is replaced by quoted evidence.

## Environment

| Variable | Default | Effect |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | unset | enables Claude generation with citation validation |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` | generation model |
| `GROUNDTRUTH_EMBEDDINGS` | `on` | `off` forces lexical-only retrieval |
| `GROUNDTRUTH_MODEL_CACHE` | `.cache/transformers` | local model cache |
| `CONFLUENCE_*` | unset | Confluence base URL, email, token and optional space keys |
| `SHAREPOINT_*` | unset | tenant, client, secret, site id (or hostname/path), optional drive id |
| `GOOGLE_DRIVE_*` | unset | folder id, service account JSON or access token |

See `.env.example` for the full list. Credentials are read only by the ingest
script and never exposed to the client.

The embedding model is downloaded on first use. `npm run index` warms the cache
and writes `data/index.json`; `predev`, `prebuild` and `preeval` run the local ingest and then the index.

## API

`POST /api/ask` accepts `{ "question": "..." }` and streams newline-delimited
JSON:

```json
{"type":"retrieval","sources":[...],"trace":{...},"contradictions":[...]}
{"type":"answer","result":{...}}
```

The retrieval event is emitted before generation so the inspector fills in
while the answer is being composed. Input is capped at 400 characters and rate
limited to 24 questions per minute per client.

`GET /api/health` reports the generation mode, embedding model and index
metadata. It never returns the API key.

## Layout

```
app/
  page.tsx                 dynamic console page: loads index, store and connectors
  api/ask/route.ts         NDJSON stream: retrieval, then answer
  api/health/route.ts      mode and index metadata
components/
  console.tsx              shell, navigation and view switching (client)
  ask-view.tsx             chat + evidence panel: sources, trace, conflicts
  library-view.tsx         documents, versions and ingestion source
  evaluation-view.tsx      metrics and per-question report
  connectors-view.tsx      source status, credentials and sync commands
  system-view.tsx          pipeline, refusal gate and limits
lib/
  chunk.ts                 frontmatter, H2 sections, long-section splitting
  text.ts                  tokeniser, stemmer, prefix match, sentence splitter
  retrieval/               BM25, MiniLM, RRF, confidence gate
  answer/                  prepare → compose, refusal, citations, contradictions
  ingest/                  connectors, normalization, store, PDF/DOCX extraction
corpus/                    nine markdown documents (local connector)
ingest.config.json         connector list; secrets come from the environment
data/documents.json        normalized store (all sources), committed
data/index.json            generated index, committed for reproducible demos
data/eval.json             generated evaluation report
scripts/                   ingest, build-index, eval, ask CLI
tests/                     node:test suite + PDF fixture
docs/architecture.md       decision record
```

## Deliberate omissions

No OCR for scanned PDFs, no reranker, no multi-tenant ACLs, no conversation
memory, no streaming generation. Connectors fetch sequentially and cap at 1,000
documents; a real tenant needs cursor-based sync and a job queue. Each omission
would add surface area without making the grounding argument clearer. The seams
are discussed in [`docs/architecture.md`](docs/architecture.md).

## Scope

Independent portfolio project. The company, documents and figures are invented.
No customer data, no external corpus and no private endpoints are used.
