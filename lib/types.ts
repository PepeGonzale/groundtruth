export type DocMeta = {
  id: string;
  title: string;
  owner: string;
  version: string;
  effective: string;
  classification: string;
  supersedes?: string;
};

export type Chunk = DocMeta & {
  chunkId: string;
  section: string;
  sectionIndex: number;
  part: number;
  text: string;
};

export type IndexedChunk = Chunk & {
  vector: number[];
};

export type ConnectorType = "local" | "confluence" | "sharepoint" | "gdrive";

export type SourceInfo = {
  connectorId: string;
  type: ConnectorType;
  externalId: string;
  url?: string;
  updatedAt?: string;
};

export type DocSummary = DocMeta & {
  sections: string[];
  chunks: number;
  source?: SourceInfo;
};

export type IndexFile = {
  builtAt: string;
  model: string;
  dimensions: number;
  docs: DocSummary[];
  chunks: IndexedChunk[];
  stats: {
    documents: number;
    chunks: number;
    averageChunkChars: number;
    averageChunkTokens: number;
  };
};

export type RetrievedChunk = Chunk & {
  rank: number;
  bm25: number;
  bm25Normalized: number;
  cosine: number | null;
  fused: number;
  preview: string;
};

export type RetrievalTrace = {
  query: string;
  tokens: string[];
  mode: "hybrid" | "lexical";
  candidates: number;
  coverage: number;
  bestCosine: number;
  unknownTerms: string[];
  confidence: number;
  refusal: boolean;
  latencyMs: number;
  denseLatencyMs: number;
  denseError: string | null;
  signals: {
    bm25Top: number;
    denseTop: number | null;
  };
};

export type Citation = {
  marker: string;
  chunkId: string;
  docId: string;
  docTitle: string;
  section: string;
  effective: string;
  version: string;
};

export type AnswerBlock = {
  kind: "direct" | "paragraph" | "list" | "note";
  text?: string;
  items?: string[];
};

export type Contradiction = {
  subject: string;
  left: { docId: string; docTitle: string; section: string; effective: string; value: string; marker: string };
  right: { docId: string; docTitle: string; section: string; effective: string; value: string; marker: string };
  preferred: string;
  reason: string;
};

export type Guardrail = {
  citationsChecked: boolean;
  citationsTotal: number;
  citationsValid: number;
  invalidMarkers: string[];
  note: string | null;
};

export type AskResult = {
  question: string;
  mode: "extractive" | "claude" | "refusal";
  answer: {
    blocks: AnswerBlock[];
    citations: Citation[];
  };
  sources: RetrievedChunk[];
  trace: RetrievalTrace;
  contradictions: Contradiction[];
  guardrail: Guardrail;
};

export type StreamEvent =
  | { type: "retrieval"; sources: RetrievedChunk[]; trace: RetrievalTrace; contradictions: Contradiction[] }
  | { type: "answer"; result: AskResult }
  | { type: "error"; message: string };

export type EvalRow = {
  id: string;
  question: string;
  kind: "answer" | "refusal";
  mode: string;
  refused: boolean;
  expectedDocs: string[];
  retrievedDocs: string[];
  hitAt5: boolean;
  reciprocalRank: number;
  citationsTotal: number;
  citationsValid: number;
  keywords: string[];
  keywordsHit: string[];
  contradictionExpected: boolean;
  contradictionDetected: boolean;
  latencyMs: number;
  answerPreview: string;
};

export type EvalFile = {
  generatedAt: string;
  answersMode: string;
  index: { model: string; builtAt: string; chunks: number; documents: number };
  totals: { questions: number; answerable: number; refusals: number; contradictions: number };
  metrics: {
    retrievalRecallAt5: number;
    mrr: number;
    refusalAccuracy: number;
    falseAnswerRate: number;
    citationValidity: number;
    contradictionRecall: number;
    keywordAccuracy: number;
  };
  results: EvalRow[];
};

export type ConnectorView = {
  id: string;
  type: ConnectorType;
  label: string;
  configured: boolean;
  documents: number;
  lastSyncAt: string | null;
  error: string | null;
  detail: string | null;
  requirement: string;
};

export type CorpusView = {
  documents: DocSummary[];
  stats: {
    documents: number;
    chunks: number;
    averageChunkChars: number;
    averageChunkTokens: number;
  };
  builtAt: string;
  model: string;
};
