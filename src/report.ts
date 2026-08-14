import type { CorpusResult, JsonValue, TraceAnalysis } from "./types.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pretty(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}

export function corpusResultJson(result: CorpusResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export function corpusResultHtml(result: CorpusResult): string {
  const status = result.failed === 0 ? "PASS" : "FAIL";
  const rows = result.results
    .map(
      (item) => `
        <tr>
          <td><code>${escapeHtml(item.id)}</code></td>
          <td>${escapeHtml(item.title)}</td>
          <td><span class="pill ${item.passed ? "pass" : "fail"}">${
            item.passed ? "PASS" : "FAIL"
          }</span></td>
          <td><details><summary>Expected / actual</summary><pre>${escapeHtml(
            pretty({ expected: item.expected, actual: item.actual }),
          )}</pre></details></td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ClosureProbe ${escapeHtml(result.corpusVersion)} evidence</title>
  <style>
    :root { color-scheme: light; --ink:#15231c; --muted:#5c6b63; --paper:#f4f7f5; --card:#fff; --ok:#17643a; --bad:#a1252b; --line:#d7e0da; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { max-width:1100px; margin:0 auto; padding:48px 24px 72px; }
    h1 { margin:0 0 8px; font-size:clamp(2rem,5vw,4rem); letter-spacing:-.045em; }
    .subtitle { color:var(--muted); font-size:1.05rem; margin:0 0 30px; }
    .summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:28px; }
    .metric { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; }
    .metric strong { display:block; font-size:1.8rem; }
    .metric span { color:var(--muted); }
    table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); }
    th,td { text-align:left; vertical-align:top; padding:13px 14px; border-bottom:1px solid var(--line); }
    th { color:var(--muted); font-size:.78rem; text-transform:uppercase; letter-spacing:.07em; }
    .pill { display:inline-block; border-radius:999px; padding:3px 9px; font-size:.75rem; font-weight:700; }
    .pass { color:var(--ok); background:#e5f4eb; }
    .fail { color:var(--bad); background:#fae8e9; }
    pre { max-width:520px; overflow:auto; padding:12px; background:#101a15; color:#e8f3ec; border-radius:8px; font-size:.78rem; }
    footer { margin-top:24px; color:var(--muted); }
    @media (max-width:720px) { .summary { grid-template-columns:repeat(2,1fr); } th:nth-child(2),td:nth-child(2) { display:none; } }
  </style>
</head>
<body>
<main>
  <h1>ClosureProbe <span class="pill ${status === "PASS" ? "pass" : "fail"}">${status}</span></h1>
  <p class="subtitle">Deterministic negative-evidence integrity conformance · ${escapeHtml(
    result.corpusVersion,
  )}</p>
  <section class="summary" aria-label="Summary">
    <div class="metric"><strong>${result.total}</strong><span>cases</span></div>
    <div class="metric"><strong>${result.passed}</strong><span>passed</span></div>
    <div class="metric"><strong>${result.failed}</strong><span>failed</span></div>
    <div class="metric"><strong>${escapeHtml(result.toolVersion)}</strong><span>tool version</span></div>
  </section>
  <table>
    <thead><tr><th>Case</th><th>Meaning</th><th>Result</th><th>Evidence</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <footer>This report validates the frozen corpus oracle. It does not prove source truth, legal compliance, or real-world absence.</footer>
</main>
</body>
</html>\n`;
}

export function traceResultJson(result: TraceAnalysis): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
