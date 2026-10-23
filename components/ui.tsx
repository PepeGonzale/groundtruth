"use client";

import type { ReactNode } from "react";

export function CitationText({ text, onCite }: { text: string; onCite: (marker: string) => void }) {
  const parts = text.split(/(\[S\d+\])/g);
  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/^\[(S\d+)\]$/);
        if (match && match[1] !== undefined) {
          const marker = match[1];
          return (
            <button key={`${marker}-${index}`} type="button" className="cite" onClick={() => onCite(marker)}>
              {marker}
            </button>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "danger" | "ok" }) {
  return <span className={`tag tag--${tone}`}>{children}</span>;
}

export function Metric({
  value,
  label,
  note,
  tone = "neutral",
}: {
  value: string;
  label: string;
  note?: string;
  tone?: "neutral" | "ok" | "danger" | "accent";
}) {
  return (
    <div className={`metric metric--${tone}`}>
      <b>{value}</b>
      <span>{label}</span>
      {note !== undefined && <small>{note}</small>}
    </div>
  );
}

export function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div className="code">
      {label !== undefined && <span className="code__label">{label}</span>}
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function SourceBadge({ type }: { type: string }) {
  return <span className={`source-badge source-badge--${type}`}>{type}</span>;
}
