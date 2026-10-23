# Architecture

## The problem

A document assistant that always answers is a liability. In operations, a
plausible sentence with no source is worse than an empty answer: it gets copied
into a runbook, a customer email or an escalation. The system is therefore
designed around one invariant:

> Every factual sentence in an answer must be traceable to a retrieved chunk,
> and the system must be able to refuse before generation.

Everything else — hybrid retrieval, RRF, the inspector, the evaluation suite —
exists to make that invariant testable.

## Constraints

- **Demoable with no API key.** A portfolio system that only works after a
  billing setup is a screenshot, not a system.
- **No hosted vector database.** 55 chunks do not justify a service dependency.
- **No orchestration framework.** The pipeline is small enough to read; a
  framework would hide the interesting decisions.
- **Synthetic corpus.** No customer documents, no private endpoints. The corpus
  is written to contain procedures, figures, dates and deliberate
  contradictions.
- **One Node process.** Local embeddings, in-memory index, no background jobs.

## Module map

```
local folder · Confluence · SharePoint · Google Drive
   │  connectors (lib/ingest/*) → SourceDocument { meta, body, source }
   ▼
normalize + ensureUniqueIds
   │
   ├── data/documents.json  (committed store, one entry per external id)
   │
   ▼
chunkDocument (H2 sections, 780-char target, paragraph boundaries)
   │
   ├── data/index.json (chunks + 384d vectors, built by scripts/build-index.ts)
   │
   ▼
retrieve (lib/retrieval/hybrid.ts)
   ├── BM25 (lib/retrieval/bm25.ts)
   ├── MiniLM query embedding (lib/retrieval/dense.ts)
   ├── RRF, confidence gate
   ▼
prepareAnswer (lib/answer/engine.ts)
   ├── citations (marker → chunk)
   ├── contradiction scan
   ▼
composeAnswer
   ├── refusal blocks, or
   ├── Claude generation + citation validation, or
   └── extractive composer
   ▼
POST /api/ask → NDJSON: retrieval event, then answer event
```

The split between `prepareAnswer` and `composeAnswer` is deliberate: retrieval is
fast and deterministic, generation is slow and optional. The API emits the
retrieval event first so the inspector is populated before the answer exists.

## Data model

A chunk carries the document metadata with it:

```ts
type Chunk = {
  id: string;            // OPS-101-A
  title: string;
  owner: string;
  version: string;
  effective: string;     // ISO date, used to resolve conflicts
  classification: string;
  supersedes?: string;   // free text, e.g. "OPS-101 sections 3.1, 3.4 and 5.2"
  chunkId: string;       // OPS-101-A#s2-p1
  section: string;       // "2. Updated service levels"
  sectionIndex: number;
  part: number;
  text: string;
}
```

Duplicating metadata per chunk is intentional. A citation is a chunk, not a
document: two sections of the same policy can disagree, and the answer must be
able to point at the section. `effective` and `supersedes` make precedence part
of the data rather than a convention in the prompt.

## Ingestion

Every source implements the same contract:

```ts
type Connector = {
  id: string;
  type: "local" | "confluence" | "sharepoint" | "gdrive";
  configured(): boolean;
  sync(): Promise<SourceDocument[]>;
};
```

A `SourceDocument` is metadata (`id`, `title`, `owner`, `version`, `effective`,
`classification`, `supersedes`), a body, and a source reference (`connectorId`,
`externalId`, `url`, `updatedAt`, `hash`). The retrieval layer never imports a
connector; it reads the normalized store and the index.

**Mapping choices**

| Source | ID | Version | Effective | Body |
| --- | --- | --- | --- | --- |
| Local Markdown | frontmatter `id` | frontmatter | frontmatter | Markdown |
| Local PDF/DOCX/TXT | `LOCAL-<slug>` | `1.0` or sidecar | file mtime or sidecar | extracted text, PDF pages as H2 |
| Confluence | `CONF-<title slug>` | page version | version timestamp | storage XHTML → headings/lists |
| SharePoint | `SP-<title slug>` | `1.0` | `lastModifiedDateTime` | file text; PDF/DOCX extraction |
| Google Drive | `GD-<title slug>` | Drive `version` | `modifiedTime` | Docs as text, Sheets as CSV |

Confluence page IDs are stable but unreadable; title slugs are readable but
change when a page is renamed. The project chooses readability and keeps the
external id as the sync key, so a rename creates a new document ID instead of
silently rewriting citations. Title collisions are resolved deterministically
by appending the external id.

**Incremental sync**

Each sync fetches the source's current document set, normalizes it and compares
SHA-256 hashes per `connectorId:externalId`. The report distinguishes added,
changed, unchanged and removed documents. This is content-hash incremental sync,
not cursor-based incremental fetch: a large Confluence space still lists every
page. The store is small enough that the difference does not matter here; a real
tenant would use `lastModified` cursors and a job queue.

A failed sync keeps the previous documents for that connector and records the
error in `data/connectors`. A connector that is not configured reports zero
documents and the missing environment variables; it does not block the local
corpus.

**Normalization edge cases**

- PDF pages become `## Page N`, so citations can point at a page.
- Sidecar `<file>.meta.json` can supply `id`, `owner`, `version`, `effective`,
  `classification` and `supersedes` for formats without frontmatter.
- Markdown embedded in Confluence or Drive keeps its frontmatter and overrides
  the API metadata.
- Empty bodies are skipped. Unsupported extensions are ignored.
- The local walker ignores hidden directories and caps at 2,000 files; Graph
  and Drive walks cap at 1,000 items and depth 6.
- Credentials are read from the environment by the ingest process. The page
  receives booleans, counts and sync timestamps — never tokens.

## Retrieval

### BM25

Content tokens are lowercased, accent-stripped, stopword-filtered and lightly
stemmed (`ies → y`, plural `s`, `ing`, `ed`). Matching uses exact equality plus
a prefix rule for tokens of at least five characters, which catches
`approve/approved` and `notify/notification` without a full Porter stemmer.

Scoring is standard BM25 with `k1 = 1.5`, `b = 0.75`. Document frequency is
computed per query because the corpus is tiny; there is no inverted index to
maintain. That is a deliberate simplification, not a scalable design.

### Dense

`Xenova/all-MiniLM-L6-v2` runs locally through `@huggingface/transformers`, q8
ONNX, mean pooling and L2 normalisation. The 384-dimension vectors are
precomputed at index time. At query time only the question is embedded.

The embedding model is a singleton with a cached failure. If the model cannot
load, retrieval degrades to lexical-only and the trace says so; the UI does not
pretend the dense signal exists.

### Fusion

Reciprocal rank fusion:

```
score(chunk) = Σ 1 / (60 + rank_in_signal)
```

RRF is chosen over a weighted sum because BM25 scores and cosine similarities
are not comparable. Normalising them per query makes the weights unstable when
the candidate set changes. RRF only uses ranks, so adding a third signal later
does not require re-tuning. The top 30 from each signal contribute; the top
eight chunks survive.

The index is capped at eight rather than six because a contradiction may live
in the seventh chunk. That happened during development: the SLA table (97.5%)
sat just outside a top-six window dominated by the amendment. The answer looked
confident and was incomplete. Widening the window fixed the failure and is why
the inspector shows eight sources.

## The refusal gate

Refusal is decided from retrieval signals, before any model call:

```
confidence = 0.50 · coverage + 0.35 · bestCosine + 0.15 · normalisedBM25
```

- `coverage`: fraction of unique query terms present anywhere in the top chunks.
- `bestCosine`: highest dense similarity in the top chunks.
- `normalisedBM25`: top BM25 score divided by the best BM25 score for the query.

Refuse when any of these holds:

1. no chunk was retrieved;
2. `confidence < 0.50`;
3. `bestCosine < 0.25`;
4. `coverage < 0.80` and `bestCosine < 0.40`;
5. an unknown query term exists and `bestCosine < 0.42`.

The thresholds came from the 27-question suite, not from theory. The hardest
separation was an exact lexical match with a weak embedding
(`excursion → classification`, cosine 0.29) versus an out-of-scope question
whose words happen to appear in the corpus (`request a new laptop`; “laptop”
appears in the on-call equipment list, cosine 0.22). Coverage alone cannot
separate them. The absolute cosine floor can. The numbers are documented
because they are corpus-specific; swapping the corpus invalidates them.

In lexical-only mode the gate is different: `coverage < 0.60` or
`normalisedBM25 < 0.25`. Dense retrieval is the semantic safety net, so without
it the system is more conservative.

## Answer composition

### Extractive mode

This is the default when no API key is present. It is not a fake LLM: it is a
sentence selection problem over retrieved chunks.

Candidates are sentences from the top chunks. Score:

```
weighted query overlap        (token weight = min(length, 10))
+ 0.30 if the sentence has a quantity
- 0.35 if the question is quantitative and the sentence does not
+ 0.12 per query token in the document title or section heading (max 0.36)
+ 0.16 / 0.06 for rank 1 / rank 2
+ answer-type boosts:
    who questions  → role nouns (+0.40), primary (+0.80), secondary (+0.25)
    procedural     → imperative verbs (+0.35)
- 0.70 for meta sentences ("this amendment updates…")
```

The direct answer is the top candidate. Up to three bullets follow, with
per-source limits and near-duplicate suppression. Procedural questions prefer
enumerated steps from the top section. Superseded values are not shown as
bullets; they appear in the contradiction note instead.

This is heuristic and it shows. The 27-question suite exists partly to keep the
heuristics honest: a change that improves one class of question tends to break
another. The test suite caught the postmortem answer selecting “Every
postmortem produces owned actions” instead of “It is due within 5 business
days”; merging anaphoric sentences fixed it.

### Claude mode

When `ANTHROPIC_API_KEY` is set, the retrieved chunks are formatted as XML with
id, document, section, version and effective date. The system prompt is a
grounding contract: answer only from context, cite markers, refuse with an exact
sentence when the context is insufficient.

The output is **not streamed**. This is a tradeoff: streaming would make the UI
feel faster but would prevent validating citations before display. Instead the
route emits the retrieval event immediately and the answer after validation.
Every `[S#]` marker must resolve to a retrieved chunk. If the model returns an
answer with no markers, or with a marker that was not retrieved, the answer is
discarded and replaced by the extractive composition with a visible guardrail
note. An unverifiable answer is treated as a failed answer.

The prompt asks for a `Sources` section because the original specification did;
the parser strips it and the UI renders sources from markers. Keeping the
instruction and removing the duplication server-side was less fragile than
asking the model to ignore its own output format.

## Contradiction detection

The scanner is numeric and deliberately narrow:

1. Split each retrieved chunk into sentences.
2. Extract claims matching `number + optional qualifier + unit`
   (`4 business hours`, `97.5%`, `21 calendar days`, `2°C`).
3. Compare sentence pairs from different documents. Similarity is Jaccard over
   content tokens with numeric tokens removed, because the numbers are the
   thing that differs.
4. Require at least two shared content tokens and unit groups that match
   (`%`, time, temperature, money).
5. If values differ, emit a contradiction with both markers and a preferred
   document: explicit supersession first, otherwise the later `effective` date.
6. Filter to contradictions relevant to the question: at least one shared query
   token, and either the contradiction appears in the top two sources or it
   shares two query tokens.

The filter matters. Without it, the SLA amendment's credit-rate change (2% →
3%) surfaced on every question that mentioned delivery, because the scanner saw
two different percentages in the same document pair. The dedupe key includes
the value pair for the same reason: an earlier version deduped by document pair
and unit group, which hid the 97.5% → 98.2% change behind the credit change.

This is not semantic entailment. “Notify within 2 hours” and “notify within 4
business hours” are caught because the units are compatible. “Escalate to the
on-call manager” and “escalate to the duty director” would not be, because there
is no number to compare.

## Evaluation

The suite is a list of authored questions with expected documents, required
keywords and a refusal label. Metrics are computed from the actual pipeline:

- **Recall @ 5** — expected document in the top five.
- **MRR** — reciprocal rank of the first expected document.
- **Refusal accuracy** — refusal questions refused plus answerable questions
  answered, over all questions.
- **False answer rate** — answerable questions wrongly refused.
- **Citation validity** — valid markers over total markers.
- **Contradiction recall** — expected conflicts detected.
- **Answer keywords** — required value present in the answer text.

The keyword check is intentionally crude. It catches the failure that matters
for operations (the number is missing or the wrong one is quoted) without
pretending to judge prose quality. The suite does not measure helpfulness,
conciseness or tone; those are review questions, not regression tests.

Results live in `data/eval.json`, are committed, and are rendered on the case
page. The page says “regression suite, not benchmark” because that is what it
is.

## Security and failure modes

- **Prompt injection.** Retrieved chunks are wrapped in XML and labelled as
  data. A document that says “ignore previous instructions” is still just text.
  The extractive path is immune; the Claude path relies on the system prompt and
  citation validation.
- **Key exposure.** The Anthropic key is read server-side only. `/api/health`
  reports the mode, never the key. The client receives no provider details
  beyond the model name.
- **Input.** Questions are capped at 400 characters, control characters
  stripped, and rate limited to 24 per minute per client. The limiter is an
  in-memory map: correct for one process, not a distributed rate limiter.
- **Citation drift.** Markers are validated against the retrieved set. A model
  cannot cite a chunk that was not retrieved, even if it hallucinates the id.
- **Model unavailability.** Claude failure or a missing key falls back to the
  extractive composer with a visible note. The system prefers a quoted answer
  over an error.
- **Embedding unavailability.** Dense retrieval degrades to lexical-only; the
  trace exposes `denseError` and the mode becomes `lexical`.

## Rejected alternatives

**A hosted vector database (Pinecone, pgvector).** Correct at scale, wrong at 55
chunks. It would add credentials, latency and a second source of truth for
metadata without changing the grounding argument.

**LangChain or LlamaIndex.** The pipeline is roughly 400 lines of retrieval and
composition. A framework would hide rank fusion, the refusal gate and citation
validation — the parts worth reviewing.

**A connector platform (Airbyte, Fivetran).** Correct if the job is moving data
into a warehouse. Here the connector's output must keep document identity,
version and effective date for citations; a generic row sync loses exactly the
metadata the grounding argument depends on.

**Fetching SaaS APIs from the browser.** It would expose credentials and make
the browser responsible for normalization. Connectors run in the ingest process
and write a normalized store.

**Weighted BM25 + cosine instead of RRF.** Requires per-query normalisation and
re-tuning whenever the corpus changes. RRF is less precise but stable and
explainable.

**Always call an LLM and trust it to refuse.** The model does not see the
retrieval scores. A confidence gate is cheaper, deterministic and auditable.
The LLM is a composer, not the safety mechanism.

**Fine-tuning or a reranker.** Both need labelled relevance data that does not
exist for a synthetic corpus. A cross-encoder reranker is the first upgrade I
would add with real queries.

**PDF ingestion and OCR.** A separate failure domain. Markdown keeps the
experiment on retrieval and grounding.

## Next steps

1. A cross-encoder reranker over the top 20, measured against the same suite.
2. Chunk-level ACLs and per-tenant indexes before any real document set.
3. Cursor-based incremental fetch and a background sync queue instead of a
   full listing per connector.
4. OAuth refresh-token flows for Drive and delegated SharePoint access.
5. Streaming Claude output with server-side buffering for citation validation.
6. A larger evaluation set with paraphrases and adversarial near-misses.
7. A CI job that fails when recall or refusal accuracy drops below the
   committed baseline.
