"use client";

import { CodeBlock, Tag } from "./ui";
import type { CorpusView, EvalFile } from "@/lib/types";

const PIPELINE = [
  {
    step: "01",
    title: "Ingest",
    body: "Four connectors normalize documents to title, owner, version, effective date and body. Local Markdown keeps its frontmatter; Confluence, SharePoint and Drive are mapped from their APIs.",
  },
  {
    step: "02",
    title: "Chunk",
    body: "Split on H2 headings, then at paragraph boundaries above 780 characters. Every chunk keeps its document and section identity, and PDFs become one section per page.",
  },
  {
    step: "03",
    title: "Retrieve",
    body: "BM25 over stemmed content tokens plus a 384-dimension MiniLM embedding. Both rank the full corpus independently, with prefix matching for morphology.",
  },
  {
    step: "04",
    title: "Fuse",
    body: "Reciprocal rank fusion with k = 60. The top eight chunks survive. RRF avoids normalising incomparable lexical and cosine scores.",
  },
  {
    step: "05",
    title: "Ground",
    body: "A confidence gate can refuse before generation. Extractive answers quote sentences with chunk markers; Claude answers are validated against the retrieved set.",
  },
];

const LIMITS = [
  {
    title: "Synthetic corpus",
    body: "The nine documents describe a fictional cold-chain operator. They exist to exercise procedures, figures and contradictory versions, not to represent a real company.",
  },
  {
    title: "Extractive by default",
    body: "Without an API key, the answer is assembled from quoted sentences. It is grounded and citable, but it does not paraphrase across documents the way an LLM does.",
  },
  {
    title: "Numeric contradictions",
    body: "The scanner compares figures with compatible units. It catches a changed SLA target or claims window, not two prose policies that disagree semantically.",
  },
  {
    title: "Text, not layout",
    body: "PDFs are extracted page by page; scanned documents need OCR and complex DOCX layouts lose structure. The pipeline preserves text, not visual fidelity.",
  },
  {
    title: "Regression, not benchmark",
    body: "The 27 questions were written against this corpus. A perfect score means the pipeline still behaves as designed, not that retrieval generalises.",
  },
  {
    title: "No tenancy or ACLs",
    body: "Every question sees every chunk. A production deployment needs chunk-level access control, per-tenant indexes and an audit trail.",
  },
];

const GATE = `confidence = 0.50 · coverage
           + 0.35 · bestCosine
           + 0.15 · normalisedBM25

refuse if:
  no chunk retrieved
  confidence < 0.50
  bestCosine < 0.25
  coverage < 0.80 and bestCosine < 0.40
  unknown query term and bestCosine < 0.42`;

export default function SystemView({ corpus, evaluation }: { corpus: CorpusView; evaluation: EvalFile }) {
  return (
    <div className="page">
      <header className="page__head">
        <div>
          <p className="eyebrow">Architecture</p>
          <h1>System</h1>
          <p className="page__lede">
            A small, typed pipeline: retrieval is deterministic, generation is optional, and the refusal path is part of
            the design rather than a prompt instruction. The inspector exposes every score behind an answer.
          </p>
        </div>
        <dl className="page__stats">
          <div>
            <dt>Documents</dt>
            <dd>{corpus.stats.documents}</dd>
          </div>
          <div>
            <dt>Chunks</dt>
            <dd>{corpus.stats.chunks}</dd>
          </div>
          <div>
            <dt>Eval questions</dt>
            <dd>{evaluation.totals.questions}</dd>
          </div>
        </dl>
      </header>

      <section className="panel">
        <div className="panel__head">
          <p className="eyebrow">Pipeline</p>
          <h2>Five steps, each one inspectable.</h2>
        </div>
        <div className="pipeline">
          {PIPELINE.map((item) => (
            <article key={item.step}>
              <span className="flow__step">{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel panel--split">
        <div>
          <div className="panel__head">
            <p className="eyebrow">Refusal gate</p>
            <h2>Refusal happens before generation.</h2>
          </div>
          <p className="panel__text">
            The gate is cheap, deterministic and auditable. An LLM cannot see the retrieval scores, so asking it to
            decide whether the evidence is sufficient is a hope, not a control.
          </p>
          <CodeBlock label="lib/retrieval/hybrid.ts">{GATE}</CodeBlock>
        </div>
        <div>
          <div className="panel__head">
            <p className="eyebrow">Generation</p>
            <h2>Two modes, one contract.</h2>
          </div>
          <div className="mode-card">
            <Tag tone="neutral">extractive</Tag>
            <p>
              Ranks sentences by weighted query overlap, figures, section relevance and answer-type signals. Each
              sentence keeps the chunk marker it came from. No key, no network.
            </p>
          </div>
          <div className="mode-card">
            <Tag tone="ok">claude</Tag>
            <p>
              The retrieved chunks are passed as XML with id, section, version and effective date. Every citation is
              validated against the retrieved set; an unverifiable answer is replaced by quoted evidence.
            </p>
          </div>
          <CodeBlock label="API">{`POST /api/ask  { "question": "..." }
  → { "type": "retrieval", "sources": [...] }
  → { "type": "answer", "result": {...} }

GET /api/health
  → mode, model, index metadata`}</CodeBlock>
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <p className="eyebrow">Limits</p>
          <h2>What this is not.</h2>
        </div>
        <div className="limit-grid">
          {LIMITS.map((limit) => (
            <article key={limit.title}>
              <h3>{limit.title}</h3>
              <p>{limit.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
