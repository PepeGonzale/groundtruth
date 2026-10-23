import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ask } from "../lib/answer/engine";
import { getIndex } from "../lib/retrieval/store";
import { QUESTIONS, type EvalQuestion } from "./questions";

type Row = {
  id: string;
  question: string;
  kind: EvalQuestion["kind"];
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

function answerText(result: Awaited<ReturnType<typeof ask>>): string {
  return result.answer.blocks
    .map((block) => `${block.text ?? ""} ${(block.items ?? []).join(" ")}`)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const index = getIndex();
  const rows: Row[] = [];

  for (const item of QUESTIONS) {
    const startedAt = performance.now();
    const result = await ask(item.question);
    const text = answerText(result);
    const retrievedDocs = [...new Set(result.sources.map((source) => source.id))];
    const firstHit = retrievedDocs.findIndex((docId) => item.expectedDocs.includes(docId));
    const keywordsHit = item.keywords.filter((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));
    const refused = result.mode === "refusal";
    const citationTotal = result.guardrail.citationsTotal;
    const citationValid = result.guardrail.citationsValid;

    rows.push({
      id: item.id,
      question: item.question,
      kind: item.kind,
      mode: result.mode,
      refused,
      expectedDocs: item.expectedDocs,
      retrievedDocs,
      hitAt5: firstHit !== -1 && firstHit < 5,
      reciprocalRank: firstHit === -1 ? 0 : 1 / (firstHit + 1),
      citationsTotal: citationTotal,
      citationsValid: citationValid,
      keywords: item.keywords,
      keywordsHit,
      contradictionExpected: item.contradiction === true,
      contradictionDetected: result.contradictions.length > 0,
      latencyMs: Number((performance.now() - startedAt).toFixed(1)),
      answerPreview: text.slice(0, 260),
    });
  }

  const answerable = rows.filter((row) => row.kind === "answer");
  const refusals = rows.filter((row) => row.kind === "refusal");
  const contradictions = rows.filter((row) => row.contradictionExpected);
  const cited = answerable.filter((row) => row.mode !== "refusal");

  const ratio = (numerator: number, denominator: number) =>
    denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));

  const metrics = {
    retrievalRecallAt5: ratio(answerable.filter((row) => row.hitAt5).length, answerable.length),
    mrr: Number((answerable.reduce((sum, row) => sum + row.reciprocalRank, 0) / Math.max(1, answerable.length)).toFixed(4)),
    refusalAccuracy: ratio(
      refusals.filter((row) => row.refused).length + answerable.filter((row) => !row.refused).length,
      rows.length,
    ),
    falseAnswerRate: ratio(answerable.filter((row) => row.refused).length, answerable.length),
    citationValidity: ratio(
      cited.reduce((sum, row) => sum + row.citationsValid, 0),
      Math.max(1, cited.reduce((sum, row) => sum + row.citationsTotal, 0)),
    ),
    contradictionRecall: ratio(contradictions.filter((row) => row.contradictionDetected).length, contradictions.length),
    keywordAccuracy: ratio(
      answerable.filter((row) => row.keywordsHit.length === row.keywords.length).length,
      answerable.length,
    ),
  };

  const output = {
    generatedAt: new Date().toISOString(),
    answersMode: process.env["ANTHROPIC_API_KEY"] ? "claude" : "extractive",
    index: { model: index.model, builtAt: index.builtAt, chunks: index.stats.chunks, documents: index.stats.documents },
    totals: { questions: rows.length, answerable: answerable.length, refusals: refusals.length, contradictions: contradictions.length },
    metrics,
    results: rows,
  };

  const target = path.join(process.cwd(), "data", "eval.json");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`eval: ${rows.length} questions, ${answerable.length} answerable, ${refusals.length} refusals`);
  console.log(metrics);
  for (const row of rows) {
    const flag = row.kind === "answer" ? (row.hitAt5 && !row.refused ? "ok " : "!!!") : row.refused ? "ok " : "!!!";
    console.log(
      `${flag} ${row.id.padEnd(22)} recall5=${row.hitAt5 ? "y" : "n"} rr=${row.reciprocalRank.toFixed(2)} cit=${row.citationsValid}/${row.citationsTotal} kw=${row.keywordsHit.length}/${row.keywords.length} ${row.answerPreview.slice(0, 90)}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
