import assert from "node:assert/strict";
import test from "node:test";
import { chunkDocuments, parseDocument } from "../lib/chunk";
import { contentTokens, splitSentences, termsMatch } from "../lib/text";
import { buildBm25, searchBm25 } from "../lib/retrieval/bm25";
import { loadDocuments, summarizeDocuments } from "../lib/corpus";
import { composeAnswer, prepareAnswer, sanitizeQuestion } from "../lib/answer/engine";
import { detectContradictions, filterContradictions } from "../lib/answer/contradictions";
import { toBlocks } from "../lib/answer/claude";
import { REFUSAL_SENTENCE } from "../lib/answer/prompt";
import { chunkDocuments as buildChunks } from "../lib/chunk";
import type { IndexedChunk } from "../lib/types";

const RAW = `---
id: TST-001
title: Test policy
owner: QA
version: 1.0
effective: 2025-01-01
classification: internal
---

## 1. Scope

Alpha beta gamma. The retention window is 12 months for test records.

## 2. Procedure

1. Open the case.
2. Record the outcome.
3. Close the case.

${"Long paragraph about calibration and temperature. ".repeat(40)}
`;

test("frontmatter becomes chunk metadata", () => {
  const parsed = parseDocument(RAW, "tst.md");
  assert.equal(parsed.meta.id, "TST-001");
  assert.equal(parsed.meta.effective, "2025-01-01");
  const chunks = chunkDocuments([parsed]);
  assert.ok(chunks.length >= 3, "long section should split");
  assert.ok(chunks.every((chunk) => chunk.id === "TST-001"));
  assert.ok(chunks.every((chunk) => chunk.title === "Test policy"));
  assert.ok(chunks.some((chunk) => chunk.section === "2. Procedure"));
  assert.ok(chunks.some((chunk) => chunk.chunkId.includes("p2")), "long section has a second part");
});

test("tokenizer stems plurals and matches prefixes", () => {
  assert.deepEqual(contentTokens("How do policies handle delivery records?"), ["policy", "handle", "delivery", "record"]);
  assert.equal(termsMatch("approve", "approved"), true);
  assert.equal(termsMatch("laptop", "laptops"), true);
  assert.equal(termsMatch("cat", "catalog"), false);
});

test("sentence splitter keeps bullets and joins wrapped lines", () => {
  const sentences = splitSentences("- Delivery window: the agreed\n  arrival range.\n\nA second paragraph.");
  assert.ok(sentences.some((sentence) => sentence.includes("agreed arrival range")));
  assert.ok(sentences.some((sentence) => sentence === "A second paragraph."));
});

test("bm25 ranks the retention document first", async () => {
  const documents = await loadDocuments();
  const chunks = chunkDocuments(documents);
  const index = buildBm25(chunks);
  const hits = searchBm25(index, contentTokens("delivery records retention"), 5);
  const top = chunks[hits[0]?.index ?? -1];
  assert.equal(top?.id, "DAT-305");
});

test("claims question cites the amendment and flags the conflict", async () => {
  const prepared = await prepareAnswer("What is the claims window?");
  assert.equal(prepared.trace.refusal, false);
  assert.ok(prepared.sources.some((source) => source.id === "OPS-101-A"));
  const contradictions = filterContradictions(
    "What is the claims window?",
    detectContradictions(prepared.sources, prepared.citations),
  );
  assert.ok(contradictions.length > 0);
  const values = contradictions.flatMap((entry) => [entry.left.value, entry.right.value]);
  assert.ok(values.some((value) => value.startsWith("14")));
  assert.ok(values.some((value) => value.startsWith("21")));

  const result = await composeAnswer(prepared);
  const text = result.answer.blocks.map((block) => block.text ?? block.items?.join(" ") ?? "").join(" ");
  assert.match(text, /21 calendar days/);
  assert.equal(result.guardrail.citationsValid, result.guardrail.citationsTotal);
  assert.ok(result.guardrail.citationsTotal > 0);
});

test("out-of-scope question refuses with the exact sentence", async () => {
  const prepared = await prepareAnswer("What is the stock price today?");
  assert.equal(prepared.trace.refusal, true);
  const result = await composeAnswer(prepared);
  assert.equal(result.mode, "refusal");
  assert.equal(result.answer.blocks[0]?.text, REFUSAL_SENTENCE);
});

test("extractive answers always carry a resolving marker", async () => {
  const prepared = await prepareAnswer("What temperature range do we transport chilled product at?");
  const result = await composeAnswer(prepared);
  assert.notEqual(result.mode, "refusal");
  const text = result.answer.blocks.map((block) => `${block.text ?? ""} ${(block.items ?? []).join(" ")}`).join(" ");
  const markers = [...text.matchAll(/\[(S\d+)\]/g)].map((match) => match[1]);
  assert.ok(markers.length > 0);
  for (const marker of markers) {
    assert.ok(result.answer.citations.some((citation) => citation.marker === marker));
  }
});

test("question sanitizer rejects empty, short and oversized input", () => {
  assert.equal(sanitizeQuestion("  hi "), null);
  assert.equal(sanitizeQuestion(42), null);
  assert.equal(sanitizeQuestion("x".repeat(401)), null);
  assert.equal(sanitizeQuestion("  What is the claims window?  "), "What is the claims window?");
});

test("claude block parser strips Sources and keeps list items", () => {
  const blocks = toBlocks(
    "The window is 21 days [S1].\n\n- First bullet [S1]\n- Second bullet [S2]\n\nSources\n- OPS-101-A",
  );
  assert.equal(blocks[0]?.kind, "direct");
  assert.equal(blocks[1]?.kind, "list");
  assert.deepEqual(blocks[1]?.items, ["First bullet [S1]", "Second bullet [S2]"]);
  assert.ok(!JSON.stringify(blocks).includes("OPS-101-A"));
});

test("indexed chunks are stable when only metadata is requested", async () => {
  const documents = await loadDocuments();
  const chunks = buildChunks(documents);
  const summaries = summarizeDocuments(documents, chunks);
  const indexed: IndexedChunk[] = chunks.map((chunk) => ({ ...chunk, vector: [] }));
  assert.equal(summaries.length, documents.length);
  assert.equal(indexed.length, chunks.length);
  assert.ok(summaries.every((summary) => summary.chunks > 0));
  assert.ok(summaries.every((summary) => summary.sections.length > 0));
});
