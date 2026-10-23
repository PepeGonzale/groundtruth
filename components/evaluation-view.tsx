"use client";

import { useMemo, useState } from "react";
import { Metric, Tag } from "./ui";
import type { EvalFile } from "@/lib/types";

const METRICS = [
  { key: "retrievalRecallAt5", label: "Recall @ 5", note: "expected document retrieved" },
  { key: "mrr", label: "MRR", note: "rank of the first relevant chunk" },
  { key: "citationValidity", label: "Citation validity", note: "markers resolve to chunks" },
  { key: "refusalAccuracy", label: "Refusal accuracy", note: "answer vs abstain" },
  { key: "contradictionRecall", label: "Contradiction recall", note: "superseded values found" },
  { key: "keywordAccuracy", label: "Answer keywords", note: "required value present" },
] as const;

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export default function EvaluationView({ evaluation }: { evaluation: EvalFile }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return evaluation.results;
    return evaluation.results.filter(
      (row) => row.question.toLowerCase().includes(needle) || row.id.includes(needle) || row.retrievedDocs.join(" ").toLowerCase().includes(needle),
    );
  }, [evaluation.results, query]);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <p className="eyebrow">Regression suite</p>
          <h1>Evaluation</h1>
          <p className="page__lede">
            {evaluation.totals.questions} authored questions: {evaluation.totals.answerable} answerable,{" "}
            {evaluation.totals.refusals} out of scope, {evaluation.totals.contradictions} with conflicting sources.
            Written against this corpus — a smoke test, not a benchmark.
          </p>
        </div>
        <dl className="page__stats">
          <div>
            <dt>Last run</dt>
            <dd>{formatDate(evaluation.generatedAt)}</dd>
          </div>
          <div>
            <dt>Answer mode</dt>
            <dd>{evaluation.answersMode}</dd>
          </div>
          <div>
            <dt>Index</dt>
            <dd>{evaluation.index.chunks} chunks</dd>
          </div>
        </dl>
      </header>

      <div className="metrics">
        {METRICS.map((metric) => (
          <Metric
            key={metric.key}
            value={pct(evaluation.metrics[metric.key])}
            label={metric.label}
            note={metric.note}
            tone={evaluation.metrics[metric.key] >= 0.9 ? "ok" : "danger"}
          />
        ))}
      </div>

      <div className="toolbar">
        <input
          className="filter"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter questions or documents…"
          aria-label="Filter evaluation rows"
        />
        <span className="toolbar__count">{rows.length} rows</span>
      </div>

      <div className="table-card">
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th>Question</th>
              <th>Expected</th>
              <th>Retrieved</th>
              <th>Citations</th>
              <th>Conflict</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pass = row.kind === "refusal" ? row.refused : row.hitAt5 && !row.refused;
              return (
                <tr key={row.id}>
                  <td>
                    <span className="eval-question">{row.question}</span>
                    <span className="eval-id">{row.id}</span>
                  </td>
                  <td className="mono">{row.expectedDocs.join(", ") || "refuse"}</td>
                  <td className="mono">{row.retrievedDocs.slice(0, 2).join(", ") || "—"}</td>
                  <td className="mono">{row.citationsTotal === 0 ? "—" : `${row.citationsValid}/${row.citationsTotal}`}</td>
                  <td className="mono">
                    {row.contradictionExpected ? (row.contradictionDetected ? "found" : "missed") : "—"}
                  </td>
                  <td>
                    <Tag tone={pass ? "ok" : "danger"}>{pass ? "pass" : "review"}</Tag>
                    <span className="eval-mode">{row.mode}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="page__foot">
        Metrics come from <code>data/eval.json</code>. <code>npm run eval</code> rebuilds the index, runs every question
        and rewrites the report. Citation validity only checks that markers resolve; it does not judge prose.
      </p>
    </div>
  );
}
