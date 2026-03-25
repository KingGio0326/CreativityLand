"use client";

import { useEffect, useState } from "react";
import { TICKERS } from "@/lib/constants";

/* ── types ─────────────────────────────────────────────── */

interface CorrelationPair {
  ticker1: string;
  ticker2: string;
  correlation: number;
  type?: string;
}

interface CorrelationData {
  matrix: Record<string, Record<string, number>>;
  high_correlations: CorrelationPair[];
  low_correlations: CorrelationPair[];
  computed_at: string | null;
}

/* ── helpers ───────────────────────────────────────────── */

function corrColor(v: number): string {
  if (Number.isNaN(v)) return "bg-neutral-800 text-neutral-400";
  if (v >= 0.7) return "bg-red-600 text-white";
  if (v >= 0.4) return "bg-red-400/70 text-white";
  if (v >= 0.2) return "bg-orange-300/50 text-black";
  if (v > -0.2) return "bg-neutral-700 text-neutral-300";
  if (v > -0.4) return "bg-sky-300/50 text-black";
  if (v > -0.7) return "bg-blue-500/70 text-white";
  return "bg-blue-700 text-white";
}

function fmt(v: number): string {
  if (Number.isNaN(v)) return "-";
  return v.toFixed(2);
}

/* ── component ─────────────────────────────────────────── */

export default function CorrelationPage() {
  const [data, setData] = useState<CorrelationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/correlation")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <p className="text-center text-muted-foreground py-20">
        Caricamento matrice di correlazione...
      </p>
    );

  if (!data || !data.matrix || Object.keys(data.matrix).length === 0)
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">
          Nessun dato di correlazione disponibile.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          La matrice viene calcolata ad ogni run del bot.
        </p>
      </div>
    );

  const tickers = TICKERS.filter((t) => t in data.matrix);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Matrice di Correlazione
        </h1>
        {data.computed_at && (
          <p className="text-xs text-muted-foreground mt-1">
            Ultimo aggiornamento:{" "}
            {new Date(data.computed_at).toLocaleString("it-IT")}
          </p>
        )}
      </div>

      {/* Heatmap */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-2" />
              {tickers.map((t) => (
                <th
                  key={t}
                  className="p-2 text-xs font-mono font-semibold text-center min-w-[64px]"
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickers.map((row) => (
              <tr key={row}>
                <td className="p-2 text-xs font-mono font-semibold whitespace-nowrap">
                  {row}
                </td>
                {tickers.map((col) => {
                  const v =
                    row === col
                      ? 1
                      : data.matrix[row]?.[col] ?? NaN;
                  return (
                    <td
                      key={col}
                      className={`p-2 text-center text-xs font-mono min-w-[64px] ${
                        row === col
                          ? "bg-neutral-900 text-neutral-500"
                          : corrColor(v)
                      }`}
                    >
                      {fmt(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 rounded bg-red-600" />
          Alta positiva (&gt;0.7)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 rounded bg-red-400/70" />
          Moderata positiva
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 rounded bg-neutral-700" />
          Neutro
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 rounded bg-blue-500/70" />
          Moderata negativa
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 rounded bg-blue-700" />
          Alta negativa (&lt;-0.7)
        </span>
      </div>

      {/* Panels */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* High correlations */}
        <div className="border rounded-lg p-4">
          <h2 className="font-semibold mb-3">
            Coppie altamente correlate (&gt;0.7)
          </h2>
          {data.high_correlations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessuna coppia con correlazione &gt; 0.7
            </p>
          ) : (
            <ul className="space-y-2">
              {data.high_correlations.map((c, i) => (
                <li
                  key={i}
                  className="flex justify-between items-center text-sm"
                >
                  <span className="font-mono">
                    {c.ticker1} &harr; {c.ticker2}
                  </span>
                  <span
                    className={`font-mono font-semibold ${
                      c.type === "positive"
                        ? "text-red-400"
                        : "text-blue-400"
                    }`}
                  >
                    {c.correlation > 0 ? "+" : ""}
                    {c.correlation.toFixed(3)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Rischio concentrazione: segnali simili si muovono insieme.
          </p>
        </div>

        {/* Low correlations */}
        <div className="border rounded-lg p-4">
          <h2 className="font-semibold mb-3">
            Coppie decorrelate (&lt;0.2) — diversificazione ottimale
          </h2>
          {data.low_correlations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessuna coppia con correlazione &lt; 0.2
            </p>
          ) : (
            <ul className="space-y-2">
              {data.low_correlations.map((c, i) => (
                <li
                  key={i}
                  className="flex justify-between items-center text-sm"
                >
                  <span className="font-mono">
                    {c.ticker1} &harr; {c.ticker2}
                  </span>
                  <span className="font-mono text-green-400 font-semibold">
                    {c.correlation > 0 ? "+" : ""}
                    {c.correlation.toFixed(3)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Diversificazione: queste coppie si muovono indipendentemente.
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground border-t pt-4">
        Nota: in periodi di crisi le correlazioni tendono a convergere
        verso 1, riducendo i benefici della diversificazione. La matrice
        viene ricalcolata sui rendimenti degli ultimi 90 giorni.
      </p>
    </div>
  );
}
