"use client";

import { useEffect, useRef, useState } from "react";
import { CitationText, Tag } from "./ui";
import type { AskResult, Contradiction, RetrievalTrace, RetrievedChunk, StreamEvent } from "@/lib/types";

type Retrieval = {
  sources: RetrievedChunk[];
  trace: RetrievalTrace;
  contradictions: Contradiction[];
};

type Message = {
  id: string;
  question: string;
  status: "retrieving" | "composing" | "ready" | "error";
  retrieval?: Retrieval;
  result?: AskResult;
  error?: string;
};

type Tab = "sources" | "trace" | "conflicts";

type Props = {
  mode: "extractive" | "claude";
  model: string;
  stats: { documents: number; chunks: number };
  prompts: string[];
  onOpenConnectors: () => void;
};

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function AnswerBody({ result, onCite }: { result: AskResult; onCite: (marker: string) => void }) {
  const { answer, mode, guardrail, trace, contradictions } = result;
  return (
    <div className="answer">
      {answer.blocks.map((block, index) => {
        if (block.kind === "list") {
          return (
            <ul className="answer__list" key={index}>
              {(block.items ?? []).map((item, itemIndex) => (
                <li key={itemIndex}>
                  <CitationText text={item} onCite={onCite} />
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === "note") {
          return (
            <div className="answer__note" key={index}>
              <CitationText text={block.text ?? ""} onCite={onCite} />
            </div>
          );
        }
        return (
          <p className={block.kind === "direct" ? "answer__direct" : "answer__paragraph"} key={index}>
            <CitationText text={block.text ?? ""} onCite={onCite} />
          </p>
        );
      })}

      <div className="answer__meta">
        {guardrail.citationsTotal > 0 && (
          <span>
            {guardrail.citationsValid}/{guardrail.citationsTotal} citations verified
          </span>
        )}
        <span>confidence {trace.confidence.toFixed(2)}</span>
        {contradictions.length > 0 && <Tag tone="danger">{contradictions.length} conflict</Tag>}
      </div>
      {guardrail.note !== null && <p className="answer__guardrail">{guardrail.note}</p>}
    </div>
  );
}

function SourceCard({
  source,
  active,
  conflict,
  onSelect,
}: {
  source: RetrievedChunk;
  active: boolean;
  conflict: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      id={`source-${source.chunkId}`}
      className={`source ${active ? "source--active" : ""}`}
      onClick={onSelect}
    >
      <div className="source__top">
        <span className="marker">S{source.rank}</span>
        <span className="source__doc">{source.id}</span>
        {conflict && <Tag tone="danger">conflict</Tag>}
      </div>
      <p className="source__section">{source.section}</p>
      <p className="source__text">{source.preview}</p>
      <div className="source__bars">
        <i style={{ width: `${Math.round(source.bm25Normalized * 100)}%` }} />
        <i className="source__bars--dense" style={{ width: `${Math.round((source.cosine ?? 0) * 100)}%` }} />
      </div>
      <div className="source__scores">
        <span>bm25 {source.bm25Normalized.toFixed(2)}</span>
        <span>cos {source.cosine === null ? "—" : source.cosine.toFixed(2)}</span>
        <span>v{source.version}</span>
        <span>{source.effective}</span>
      </div>
    </button>
  );
}

function EvidencePanel({
  message,
  tab,
  setTab,
  activeMarker,
  setActiveMarker,
}: {
  message: Message | undefined;
  tab: Tab;
  setTab: (tab: Tab) => void;
  activeMarker: string | null;
  setActiveMarker: (marker: string | null) => void;
}) {
  const retrieval = message?.retrieval;
  const trace = retrieval?.trace;
  const sources = retrieval?.sources ?? [];
  const conflicts = retrieval?.contradictions ?? [];
  const conflicting = new Set(conflicts.flatMap((entry) => [entry.left.marker, entry.right.marker]));

  return (
    <aside className="evidence">
      <div className="evidence__head">
        <span className="eyebrow">Evidence</span>
        {trace !== undefined && <span className="mono">{trace.mode}</span>}
      </div>

      <div className="tabs" role="tablist" aria-label="Evidence views">
        <button type="button" className={tab === "sources" ? "is-active" : ""} onClick={() => setTab("sources")}>
          Sources <b>{sources.length}</b>
        </button>
        <button type="button" className={tab === "trace" ? "is-active" : ""} onClick={() => setTab("trace")}>
          Trace
        </button>
        <button type="button" className={tab === "conflicts" ? "is-active" : ""} onClick={() => setTab("conflicts")}>
          Conflicts <b>{conflicts.length}</b>
        </button>
      </div>

      {message === undefined && (
        <div className="evidence__empty">
          <p>Ask a question to see the chunks behind the answer.</p>
          <p className="muted">
            Retrieval scores, query coverage and conflicting document versions stay visible. An answer you cannot audit
            is not an answer.
          </p>
        </div>
      )}

      {message !== undefined && retrieval === undefined && (
        <div className="evidence__loading">
          <span />
          <span />
          <span />
          <p>{message.status === "retrieving" ? "Searching the corpus…" : "Grounding the answer…"}</p>
        </div>
      )}

      {trace !== undefined && (
        <>
          {trace.refusal && (
            <div className="refusal">
              <b>No grounded answer.</b>
              <span>
                Coverage {trace.coverage.toFixed(2)} · best cosine {trace.bestCosine.toFixed(2)} · confidence{" "}
                {trace.confidence.toFixed(2)}
              </span>
            </div>
          )}

          {tab === "sources" && (
            <div className="sources">
              {sources.map((source) => (
                <SourceCard
                  key={source.chunkId}
                  source={source}
                  active={activeMarker === `S${source.rank}`}
                  conflict={conflicting.has(`S${source.rank}`)}
                  onSelect={() => {
                    setActiveMarker(`S${source.rank}`);
                    document
                      .getElementById(`source-${source.chunkId}`)
                      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                  }}
                />
              ))}
            </div>
          )}

          {tab === "trace" && (
            <div className="trace">
              <div className="trace__grid">
                <div>
                  <b>{trace.confidence.toFixed(2)}</b>
                  <span>confidence</span>
                </div>
                <div>
                  <b>{trace.coverage.toFixed(2)}</b>
                  <span>coverage</span>
                </div>
                <div>
                  <b>{trace.bestCosine.toFixed(2)}</b>
                  <span>best cosine</span>
                </div>
                <div>
                  <b>{trace.candidates}</b>
                  <span>candidates</span>
                </div>
              </div>

              <div className="trace__block">
                <span className="eyebrow">Query tokens</span>
                <div className="token-list">
                  {trace.tokens
                    .filter((token) => !trace.unknownTerms.includes(token))
                    .map((token) => (
                      <span key={token}>{token}</span>
                    ))}
                  {trace.unknownTerms.map((token) => (
                    <span className="token-list__unknown" key={token}>
                      {token} ?
                    </span>
                  ))}
                </div>
              </div>

              <div className="trace__block">
                <span className="eyebrow">Timing</span>
                <div className="trace__lines">
                  <span>
                    <b>{trace.latencyMs.toFixed(0)} ms</b> total
                  </span>
                  <span>
                    <b>{trace.denseLatencyMs.toFixed(0)} ms</b> query embedding
                  </span>
                  <span>
                    <b>{trace.signals.bm25Top.toFixed(1)}</b> top BM25
                  </span>
                  <span>
                    <b>{trace.signals.denseTop === null ? "—" : trace.signals.denseTop.toFixed(2)}</b> top cosine
                  </span>
                </div>
              </div>

              {trace.denseError !== null && <p className="trace__error">Dense retrieval fallback: {trace.denseError}</p>}
            </div>
          )}

          {tab === "conflicts" && (
            <div className="conflicts">
              {conflicts.length === 0 && (
                <div className="evidence__empty">
                  <p>No numeric conflicts in the retrieved set.</p>
                  <p className="muted">
                    The scanner compares figures with compatible units across documents. Prose contradictions are not
                    detected.
                  </p>
                </div>
              )}
              {conflicts.map((conflict, index) => (
                <article className="conflict" key={`${conflict.left.marker}-${conflict.right.marker}-${index}`}>
                  <p className="conflict__title">Sources disagree</p>
                  <div className="conflict__rows">
                    <div>
                      <span>
                        {conflict.left.docId} §{conflict.left.section}
                      </span>
                      <b>{conflict.left.value}</b>
                      <em>[{conflict.left.marker}]</em>
                    </div>
                    <div>
                      <span>
                        {conflict.right.docId} §{conflict.right.section}
                      </span>
                      <b>{conflict.right.value}</b>
                      <em>[{conflict.right.marker}]</em>
                    </div>
                  </div>
                  <p className="conflict__resolution">
                    <b>{conflict.preferred}</b> takes precedence — {conflict.reason}.
                  </p>
                </article>
              ))}
            </div>
          )}

          <div className="evidence__foot">
            <span>{sources.length} sources</span>
            <span>{trace.latencyMs.toFixed(0)} ms</span>
            <span>{trace.unknownTerms.length} unknown terms</span>
          </div>
        </>
      )}
    </aside>
  );
}

export default function AskView({ mode, model, stats, prompts, onOpenConnectors }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMarker, setActiveMarker] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("sources");
  const threadEnd = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function submit(question: string) {
    const trimmed = question.replace(/\s+/g, " ").trim();
    if (trimmed.length < 3 || trimmed.length > 400 || busy) return;

    const id = newId();
    setBusy(true);
    setActiveId(id);
    setActiveMarker(null);
    setTab("sources");
    setInput("");
    setMessages((current) => [...current, { id, question: trimmed, status: "retrieving" }]);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });

      if (!response.ok || response.body === null) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "The assistant is unavailable.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const apply = (event: StreamEvent) => {
        if (event.type === "retrieval") {
          setMessages((current) =>
            current.map((message) =>
              message.id === id
                ? {
                    ...message,
                    status: "composing",
                    retrieval: {
                      sources: event.sources,
                      trace: event.trace,
                      contradictions: event.contradictions,
                    },
                  }
                : message,
            ),
          );
        } else if (event.type === "answer") {
          setMessages((current) =>
            current.map((message) =>
              message.id === id ? { ...message, status: "ready", result: event.result } : message,
            ),
          );
        } else {
          setMessages((current) =>
            current.map((message) =>
              message.id === id ? { ...message, status: "error", error: event.message } : message,
            ),
          );
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line.length > 0) {
            try {
              apply(JSON.parse(line) as StreamEvent);
            } catch {
              // ignore malformed line; the next event still applies
            }
          }
          newline = buffer.indexOf("\n");
        }
      }
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === id
            ? { ...message, status: "error", error: error instanceof Error ? error.message : "Request failed." }
            : message,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  const selected = messages.find((message) => message.id === activeId) ?? messages[messages.length - 1];

  function cite(marker: string, messageId: string) {
    setActiveId(messageId);
    setActiveMarker(marker);
    setTab("sources");
    const message = messages.find((entry) => entry.id === messageId);
    const source = message?.retrieval?.sources.find((entry) => `S${entry.rank}` === marker);
    if (source !== undefined) {
      requestAnimationFrame(() => {
        document.getElementById(`source-${source.chunkId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
  }

  return (
    <div className="ask">
      <div className="ask__main">
        <div className="ask__thread">
          {messages.length === 0 && (
            <div className="empty">
              <p className="eyebrow">Grounded retrieval</p>
              <h2>Ask the operations corpus.</h2>
              <p className="empty__lede">
                Nine documents, one answer at a time. Every claim carries the section it came from. If the evidence is
                not there, the assistant refuses.
              </p>

              <div className="prompts">
                {prompts.map((prompt) => (
                  <button key={prompt} type="button" className="prompt" onClick={() => void submit(prompt)}>
                    <span>{prompt}</span>
                    <i aria-hidden="true">→</i>
                  </button>
                ))}
              </div>

              <div className="empty__meta">
                <span>{stats.documents} documents</span>
                <span>{stats.chunks} chunks</span>
                <span>{mode === "claude" ? model : "local extraction"}</span>
                <button type="button" className="link-button" onClick={onOpenConnectors}>
                  Connectors
                </button>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <article
              key={message.id}
              className={`turn ${selected?.id === message.id ? "turn--active" : ""}`}
              onClick={() => setActiveId(message.id)}
            >
              <div className="turn__question">
                <span className="role">You</span>
                <p>{message.question}</p>
              </div>

              <div className="turn__answer">
                <div className="turn__head">
                  <span className="role role--accent">Groundtruth</span>
                  {message.result !== undefined && (
                    <Tag tone={message.result.mode === "refusal" ? "danger" : message.result.mode === "claude" ? "ok" : "neutral"}>
                      {message.result.mode === "refusal" ? "refused" : message.result.mode}
                    </Tag>
                  )}
                </div>

                {message.status === "retrieving" && (
                  <div className="thinking">
                    <span />
                    <span />
                    <span />
                    <p>Searching the corpus…</p>
                  </div>
                )}
                {message.status === "composing" && (
                  <div className="thinking">
                    <span />
                    <span />
                    <span />
                    <p>Grounding the answer…</p>
                  </div>
                )}
                {message.status === "error" && <p className="turn__error">{message.error ?? "Request failed."}</p>}
                {message.result !== undefined && (
                  <AnswerBody result={message.result} onCite={(marker) => cite(marker, message.id)} />
                )}
              </div>
            </article>
          ))}
          <div ref={threadEnd} />
        </div>

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(input);
          }}
        >
          <div className="composer__box">
            <input
              ref={inputRef}
              id="question"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about incidents, SLAs, cold chain…"
              maxLength={400}
              autoComplete="off"
            />
            <span className="composer__count">{input.length}/400</span>
            <button type="submit" disabled={busy || input.trim().length < 3}>
              {busy ? "Working" : "Ask"}
            </button>
          </div>
          <div className="composer__hints">
            <span>⌘K focus</span>
            <span>Enter to ask</span>
            <span>Answers cite chunk markers</span>
          </div>
        </form>
      </div>

      <EvidencePanel
        message={selected}
        tab={tab}
        setTab={setTab}
        activeMarker={activeMarker}
        setActiveMarker={setActiveMarker}
      />
    </div>
  );
}
