"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface BacktestResult {
  id: string;
  ticker: string;
  start_date: string;
  end_date: string;
  total_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  trades_count: number;
  created_at: string;
}

export default function BacktestPage() {
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/backtest")
      .then((r) => r.json())
      .then((data) => setResults(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const bestReturn = results.length
    ? Math.max(...results.map((r) => r.total_return))
    : 0;
  const avgSharpe = results.length
    ? results.reduce((a, r) => a + r.sharpe_ratio, 0) / results.length
    : 0;
  const avgWinRate = results.length
    ? results.reduce((a, r) => a + r.win_rate, 0) / results.length
    : 0;
  const totalTrades = results.reduce((a, r) => a + r.trades_count, 0);

  const chartData = results.map((r) => ({
    name: `${r.ticker} ${r.end_date}`,
    return: +(r.total_return * 100).toFixed(2),
    ticker: r.ticker,
  }));

  const metrics = [
    { title: "Best Return", value: `${(bestReturn * 100).toFixed(1)}%` },
    { title: "Avg Sharpe", value: avgSharpe.toFixed(2) },
    { title: "Avg Win Rate", value: `${(avgWinRate * 100).toFixed(1)}%` },
    { title: "Total Trades", value: totalTrades },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Backtest Results</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Card key={m.title}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground">{m.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <p className="text-2xl font-bold">{m.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Return % by Ticker</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={10} />
                <YAxis tickFormatter={(v: number) => `${v}%`} fontSize={10} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Legend />
                <Line type="monotone" dataKey="return" stroke="#2563eb" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticker</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Return</TableHead>
            <TableHead>Sharpe</TableHead>
            <TableHead>Max DD</TableHead>
            <TableHead>Win Rate</TableHead>
            <TableHead>Trades</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            : results.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.ticker}</TableCell>
                  <TableCell className="text-xs">
                    {r.start_date} &rarr; {r.end_date}
                  </TableCell>
                  <TableCell className={r.total_return >= 0 ? "text-green-600" : "text-red-600"}>
                    {(r.total_return * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell>{r.sharpe_ratio.toFixed(2)}</TableCell>
                  <TableCell>{(r.max_drawdown * 100).toFixed(1)}%</TableCell>
                  <TableCell>{(r.win_rate * 100).toFixed(0)}%</TableCell>
                  <TableCell>{r.trades_count}</TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
