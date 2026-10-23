import { ask } from "../lib/answer/engine";

function render(result: Awaited<ReturnType<typeof ask>>): string {
  const lines: string[] = [];
  lines.push(`Q: ${result.question}`);
  lines.push(`mode: ${result.mode} | confidence ${result.trace.confidence} (coverage ${result.trace.coverage}, cosine ${result.trace.bestCosine})`);
  lines.push("");
  for (const block of result.answer.blocks) {
    if (block.text !== undefined) lines.push(block.text);
    if (block.items !== undefined) block.items.forEach((item) => lines.push(`  - ${item}`));
  }
  lines.push("");
  lines.push("sources:");
  for (const source of result.sources) {
    lines.push(`  S${source.rank} ${source.id} §${source.section} — bm25 ${source.bm25Normalized}, cosine ${source.cosine ?? "n/a"}`);
  }
  if (result.contradictions.length > 0) {
    lines.push("");
    lines.push("contradictions:");
    for (const contradiction of result.contradictions) {
      lines.push(`  ${contradiction.left.docId} ${contradiction.left.value} vs ${contradiction.right.docId} ${contradiction.right.value}`);
    }
  }
  lines.push("");
  lines.push(`guardrail: ${result.guardrail.note ?? "none"}`);
  return lines.join("\n");
}

const question = process.argv.slice(2).join(" ").trim();
if (question.length === 0) {
  console.error('usage: npm run ask -- "How long do we keep delivery records?"');
  process.exitCode = 1;
} else {
  ask(question)
    .then((result) => console.log(render(result)))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
