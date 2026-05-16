import { useState, useRef, useEffect } from 'react';

/* ─────────────────────────────────────────────
   HELPER COMPONENTS
───────────────────────────────────────────── */

function ScoreBar({ score, color = 'green' }) {
  const colorMap = {
    green: 'bg-purple-500',
    emerald: 'bg-emerald-500',
    yellow: 'bg-yellow-400',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    gray: 'bg-gray-400',
  };
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${colorMap[color] ?? 'bg-gray-400'} transition-all duration-700`}
        style={{ width: `${Math.min(Math.max(score ?? 0, 0), 100)}%` }}
      />
    </div>
  );
}

function GradeBadge({ grade }) {
  if (!grade) return null;
  const map = {
    green: 'bg-purple-100 text-purple-800 border-purple-200',
    emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    orange: 'bg-orange-100 text-orange-800 border-orange-200',
    red: 'bg-red-100 text-red-800 border-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold ${map[grade.color] ?? 'bg-gray-100 text-gray-800'}`}>
      {grade.grade} · {grade.label}
    </span>
  );
}

function MetricRow({ label, value, sub }) {
  return (
    <div className="flex justify-between items-baseline py-1 border-b border-gray-50">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-900">{value ?? <span className="text-gray-300">—</span>}</span>
      {sub && <span className="text-xs text-gray-400 ml-1">{sub}</span>}
    </div>
  );
}

function Pill({ label, color = 'gray' }) {
  const map = {
    green: 'bg-purple-100 text-purple-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    blue: 'bg-blue-100 text-blue-700',
    orange: 'bg-orange-100 text-orange-700',
    gray: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${map[color]}`}>
      {label}
    </span>
  );
}

/* ─────────────────────────────────────────────
   STOCK CARD
───────────────────────────────────────────── */

function StockCard({ stock, rank }) {
  const [open, setOpen] = useState(false);
  const { scores, tech, fundamentals, levels, allocation, executionPlan, brokers, sentiment } = stock;

  const fmt = (n, dp = 3) => (n != null ? `RM${Number(n).toFixed(dp)}` : '—');
  const fmtPct = (n) => (n != null ? `${Number(n).toFixed(2)}%` : '—');
  const fmtNum = (n, dp = 2) => (n != null ? Number(n).toFixed(dp) : '—');

  const rsiColor =
    tech?.rsiColor === 'green' ? 'text-purple-600' :
    tech?.rsiColor === 'red' ? 'text-red-600' :
    tech?.rsiColor === 'blue' ? 'text-blue-600' :
    tech?.rsiColor === 'orange' ? 'text-orange-500' :
    'text-gray-600';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-50 border border-purple-200 flex items-center justify-center">
          <span className="text-sm font-bold text-purple-700">{rank}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{stock.stockName}</span>
            <span className="text-xs text-gray-400 font-mono">{stock.yahooTicker}</span>
            {scores?.grade && <GradeBadge grade={scores.grade} />}
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {brokers?.map((b) => (
              <span key={b} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{b}</span>
            ))}
            {stock.fundamentals?.sector && (
              <span className="text-xs text-gray-400">{stock.fundamentals.sector}</span>
            )}
          </div>

          {sentiment && <p className="text-xs text-gray-500 mt-1 leading-snug">{sentiment}</p>}
        </div>

        <div className="text-right flex-shrink-0">
          <div className="text-lg font-bold text-gray-900">{fmt(stock.chart?.currentPrice)}</div>
          <div className="text-xs text-gray-400">current</div>
        </div>
      </div>

      {/* Score bars */}
      <div className="px-4 pb-3 space-y-1.5">
        <div className="grid grid-cols-4 gap-3 text-center mb-1">
          <div>
            <div className="text-xs text-gray-400">Total</div>
            <div className="text-sm font-bold text-gray-900">{scores?.totalScore ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Fund.</div>
            <div className="text-sm font-semibold text-blue-600">{scores?.fundamentalScore ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Tech.</div>
            <div className="text-sm font-semibold text-purple-600">{scores?.technicalScore ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">R:R</div>
            <div className="text-sm font-semibold text-orange-600">{scores?.rrScore ?? '—'}</div>
          </div>
        </div>
        <ScoreBar score={scores?.totalScore} color={scores?.grade?.color ?? 'gray'} />
      </div>

      {/* Allocation summary (always visible) */}
      {allocation && (
        <div className="mx-4 mb-3 p-3 bg-purple-50 border border-green-100 rounded-lg">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Lots / Shares</span>
              <span className="font-semibold text-gray-900">{allocation.lots} lots ({allocation.shares.toLocaleString()} shares)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Capital Used</span>
              <span className="font-semibold text-gray-900">RM{allocation.invested.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Entry Price</span>
              <span className="font-semibold text-gray-900">{fmt(allocation.entry)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fees</span>
              <span className="font-semibold text-orange-600">RM{allocation.fees.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Trading levels (always visible) */}
      {levels && (
        <div className="mx-4 mb-3 grid grid-cols-4 gap-2 text-center">
          <div className="p-2 bg-blue-50 rounded-lg">
            <div className="text-xs text-gray-400">Entry</div>
            <div className="text-xs font-bold text-blue-700">{fmt(levels.entry)}</div>
          </div>
          <div className="p-2 bg-purple-50 rounded-lg">
            <div className="text-xs text-gray-400">TP1 (+{fmtPct(levels.rewardPct)})</div>
            <div className="text-xs font-bold text-purple-700">{fmt(levels.tp1)}</div>
          </div>
          <div className="p-2 bg-emerald-50 rounded-lg">
            <div className="text-xs text-gray-400">TP2 (+{fmtPct(levels.reward2Pct)})</div>
            <div className="text-xs font-bold text-emerald-700">{fmt(levels.tp2)}</div>
          </div>
          <div className="p-2 bg-red-50 rounded-lg">
            <div className="text-xs text-gray-400">SL (-{fmtPct(levels.riskPct)})</div>
            <div className="text-xs font-bold text-red-600">{fmt(levels.sl)}</div>
          </div>
        </div>
      )}

      {/* R:R + projected P&L */}
      {allocation && levels && (
        <div className="mx-4 mb-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 bg-gray-50 rounded">
            <div className="text-gray-400">R:R Ratio</div>
            <div className={`font-bold ${levels.rrRatio >= 2 ? 'text-purple-600' : levels.rrRatio >= 1.5 ? 'text-yellow-600' : 'text-red-500'}`}>
              {fmtNum(levels.rrRatio, 1)}:1
            </div>
          </div>
          <div className="p-2 bg-purple-50 rounded">
            <div className="text-gray-400">Gain @ TP1</div>
            <div className="font-bold text-purple-700">+RM{allocation.projectedTP1Gain?.toFixed(0)}</div>
          </div>
          <div className="p-2 bg-red-50 rounded">
            <div className="text-gray-400">Max Loss</div>
            <div className="font-bold text-red-600">-RM{allocation.maxLoss?.toFixed(0)}</div>
          </div>
        </div>
      )}

      {/* Expand/collapse button */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2 text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100 flex items-center justify-center gap-1 transition-colors"
      >
        {open ? '▲ Hide details' : '▼ Show fundamentals, technicals & execution plan'}
      </button>

      {/* Expanded details */}
      {open && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {/* Fundamentals */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Fundamentals</h4>
            <div className="grid grid-cols-2 gap-x-6">
              <div>
                <MetricRow label="P/E Ratio" value={fmtNum(fundamentals?.peRatio, 1)} />
                <MetricRow label="Forward P/E" value={fmtNum(fundamentals?.forwardPE, 1)} />
                <MetricRow label="Dividend Yield" value={fundamentals?.dividendYield != null ? fmtPct(fundamentals.dividendYield * 100) : null} />
                <MetricRow label="Profit Margin" value={fundamentals?.profitMargin != null ? fmtPct(fundamentals.profitMargin * 100) : null} />
              </div>
              <div>
                <MetricRow label="Revenue Growth" value={fundamentals?.revenueGrowth != null ? fmtPct(fundamentals.revenueGrowth * 100) : null} />
                <MetricRow label="ROE" value={fundamentals?.roe != null ? fmtPct(fundamentals.roe * 100) : null} />
                <MetricRow label="Debt/Equity" value={fundamentals?.debtToEquity != null ? fmtNum(fundamentals.debtToEquity / 100, 2) : null} />
                <MetricRow label="52-Week Range" value={fundamentals?.fiftyTwoWeekRange} />
              </div>
            </div>
            {fundamentals?.totalAnalysts > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                Analyst consensus: <span className="font-medium text-gray-700 capitalize">{fundamentals.recommendationKey?.replace('_', ' ')}</span>
                <span className="text-gray-400 ml-1">({fundamentals.totalAnalysts} analysts)</span>
              </div>
            )}
          </div>

          {/* Technicals */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Technical Analysis</h4>
            <div className="grid grid-cols-2 gap-x-6">
              <div>
                <MetricRow label="RSI (14)" value={
                  tech?.rsi != null ? (
                    <span className={rsiColor}>{fmtNum(tech.rsi, 1)} — {tech.rsiLabel}</span>
                  ) : null
                } />
                <MetricRow label="Trend" value={tech?.trend?.replace('_', ' ')} />
                <MetricRow label="Volume Ratio" value={tech?.volumeRatio != null ? `${fmtNum(tech.volumeRatio, 1)}×` : null} />
              </div>
              <div>
                <MetricRow label="EMA 20" value={tech?.ema20 != null ? `RM${tech.ema20.toFixed(3)}` : null} />
                <MetricRow label="EMA 50" value={tech?.ema50 != null ? `RM${tech.ema50.toFixed(3)}` : null} />
                <MetricRow label="MACD Signal" value={
                  tech?.macd ? (
                    <span className={tech.macd.bullish ? 'text-purple-600' : 'text-red-500'}>
                      {tech.macd.bullishCross ? 'Bullish Cross 🔥' : tech.macd.bullish ? 'Bullish' : 'Bearish'}
                    </span>
                  ) : null
                } />
              </div>
            </div>

            {/* Bollinger Bands */}
            {tech?.bollingerBands && (
              <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                <span className="text-gray-400 mr-2">Bollinger Bands:</span>
                <span className="text-red-500">L: RM{tech.bollingerBands.lower.toFixed(3)}</span>
                <span className="text-gray-400 mx-2">|</span>
                <span className="text-gray-600">M: RM{tech.bollingerBands.middle.toFixed(3)}</span>
                <span className="text-gray-400 mx-2">|</span>
                <span className="text-purple-600">U: RM{tech.bollingerBands.upper.toFixed(3)}</span>
              </div>
            )}
          </div>

          {/* Execution Plan */}
          {executionPlan?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Execution Plan</h4>
              <div className="space-y-1.5">
                {executionPlan.map((line, i) => (
                  <p key={i} className="text-xs text-gray-700 leading-snug bg-gray-50 px-3 py-1.5 rounded">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Fee breakdown */}
          {allocation?.feeBreakdown && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Transaction Cost Breakdown</h4>
              <div className="text-xs space-y-0.5 text-gray-600">
                <div className="flex justify-between"><span>Gross value</span><span>RM{allocation.grossValue?.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Brokerage (0.08%)</span><span>RM{allocation.feeBreakdown.brokerage?.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Clearing fee</span><span>RM{allocation.feeBreakdown.clearing?.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Stamp duty</span><span>RM{allocation.feeBreakdown.stamp?.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Contract stamp</span><span>RM{allocation.feeBreakdown.contractStamp?.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold border-t border-gray-200 pt-1 mt-1">
                  <span>Total paid</span><span>RM{allocation.invested?.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   PORTFOLIO SUMMARY HEADER
───────────────────────────────────────────── */

function PortfolioSummary({ portfolio, capital }) {
  const { portfolioSummary: ps, totalInvested, cashRemaining, selected } = portfolio;
  if (!ps) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
      <h2 className="text-base font-semibold text-gray-800 mb-4">Portfolio Summary</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">Total Invested</div>
          <div className="text-lg font-bold text-purple-700">RM{totalInvested.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">Cash Remaining</div>
          <div className="text-lg font-bold text-blue-700">RM{cashRemaining.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">Avg Score</div>
          <div className="text-lg font-bold text-purple-700">{ps.avgScore}/100</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">Portfolio R:R</div>
          <div className="text-lg font-bold text-orange-700">{ps.portfolioRR}:1</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Projected gain (TP1)</span>
          <span className="font-semibold text-purple-600">+RM{ps.totalProjectedTP1Gain.toFixed(0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Max portfolio loss (SL hit)</span>
          <span className="font-semibold text-red-500">-RM{ps.totalMaxLoss.toFixed(0)}</span>
        </div>
      </div>

      {/* Capital utilisation bar */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Capital utilisation</span>
          <span>{((totalInvested / capital) * 100).toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 rounded-full"
            style={{ width: `${Math.min((totalInvested / capital) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   ALLOCATION TABLE (printable overview)
───────────────────────────────────────────── */

function AllocationTable({ selected }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-800">Allocation Overview</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              <th className="text-left px-4 py-2">#</th>
              <th className="text-left px-4 py-2">Stock</th>
              <th className="text-right px-4 py-2">Score</th>
              <th className="text-right px-4 py-2">Price</th>
              <th className="text-right px-4 py-2">Lots</th>
              <th className="text-right px-4 py-2">TP1</th>
              <th className="text-right px-4 py-2">SL</th>
              <th className="text-right px-4 py-2">R:R</th>
              <th className="text-right px-4 py-2">Invested</th>
              <th className="text-right px-4 py-2">Gain@TP1</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {selected.map((s, i) => (
              <tr key={s.yahooTicker} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-800">{s.stockName}</div>
                  <div className="text-gray-400 font-mono">{s.yahooTicker}</div>
                </td>
                <td className="px-4 py-2 text-right font-semibold text-purple-600">{s.scores?.totalScore ?? '—'}</td>
                <td className="px-4 py-2 text-right">RM{s.chart?.currentPrice?.toFixed(3) ?? '—'}</td>
                <td className="px-4 py-2 text-right font-medium">{s.allocation?.lots ?? '—'}</td>
                <td className="px-4 py-2 text-right text-purple-600">RM{s.levels?.tp1?.toFixed(3) ?? '—'}</td>
                <td className="px-4 py-2 text-right text-red-500">RM{s.levels?.sl?.toFixed(3) ?? '—'}</td>
                <td className="px-4 py-2 text-right font-medium">{s.levels?.rrRatio?.toFixed(1) ?? '—'}:1</td>
                <td className="px-4 py-2 text-right">RM{s.allocation?.invested?.toFixed(0) ?? '—'}</td>
                <td className="px-4 py-2 text-right text-purple-600">+RM{s.allocation?.projectedTP1Gain?.toFixed(0) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */

export default function Home() {
  const [capital, setCapital] = useState('100000');
  const [numStocks, setNumStocks] = useState('10');
  const [csvText, setCsvText] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [csvStatus, setCsvStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const fileRef = useRef();

  // Auto-fetch CSV from Telegram on page load
  useEffect(() => {
    const autoFetch = async () => {
      setCsvStatus('loading');
      try {
        const res = await fetch('/api/fetch-csv');
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error);
        setCsvText(data.csvText);
        setCsvFileName(data.fileName ?? 'buycalls.csv');
        setCsvStatus('ready');
      } catch (err) {
        console.warn('Auto-fetch failed:', err.message);
        setCsvStatus('error');
      }
    };
    autoFetch();
  }, []);

  // Admin: manual CSV upload override
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFileName(file.name);
    setCsvStatus('ready');
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file);
  };

  const handleGenerate = async () => {
    setError('');
    setResult(null);

    if (!csvText) {
      setError('No buycall data loaded. Please wait for auto-fetch or upload a CSV.');
      return;
    }
    const cap = parseFloat(capital);
    const ns = parseInt(numStocks);
    if (isNaN(cap) || cap <= 0) { setError('Enter a valid total capital.'); return; }
    if (isNaN(ns) || ns < 1 || ns > 30) { setError('Number of stocks must be between 1 and 30.'); return; }

    setLoading(true);
    setLoadingStep('Parsing broker buycalls...');

    try {
      setLoadingStep('Fetching market data from Yahoo Finance (may take 20–40s)...');
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, totalCapital: cap, numStocks: ns }),
      });

      setLoadingStep('Running scoring & portfolio construction...');
      const data = await res.json();

      if (!res.ok || data.error) throw new Error(data.error ?? 'Generation failed');
      setResult(data);
    } catch (err) {
      setError(err.message ?? 'An unexpected error occurred.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">P</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-none">Portfolio Generator</h1>
              <p className="text-xs text-gray-400 leading-none mt-0.5">Powered by MWMVIP Group</p>
            </div>
          </div>

          {/* Admin Upload CSV — top right */}
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:border-purple-400 hover:text-purple-600 transition-colors bg-white"
              title="Admin: override with manual CSV upload"
            >
              📁 Upload CSV
            </button>
            {csvFileName && (
              <span className="text-xs text-purple-600 hidden sm:block">✅ {csvFileName}</span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Input Form */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Portfolio Settings</h2>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Total Capital (RM)</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm text-gray-400">RM</span>
                <input
                  type="number"
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="100000"
                  min="1000"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Number of Stocks</label>
              <input
                type="number"
                value={numStocks}
                onChange={(e) => setNumStocks(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="10"
                min="1"
                max="30"
              />
            </div>
          </div>

          {/* CSV status indicator */}
          <div className="mb-4">
            {csvStatus === 'loading' && (
              <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg">
                <div className="w-3 h-3 border-2 border-gray-300 border-t-purple-500 rounded-full animate-spin" />
                Loading latest broker buycalls...
              </div>
            )}
            {csvStatus === 'ready' && (
              <div className="flex items-center gap-2 text-xs text-purple-700 bg-purple-50 px-3 py-2 rounded-lg border border-purple-100">
                ✅ {csvFileName} loaded and ready
              </div>
            )}
            {csvStatus === 'error' && (
              <div className="text-xs text-orange-700 bg-orange-50 px-3 py-2 rounded-lg border border-orange-100">
                ⚠️ Could not auto-load buycalls. Use the Upload CSV button (top right) to load manually.
              </div>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading || csvStatus !== 'ready'}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors"
          >
            {loading ? loadingStep || 'Generating...' : '🚀 Generate Portfolio'}
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
            <div className="inline-block w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-3" />
            <p className="text-sm text-gray-500">{loadingStep}</p>
            <p className="text-xs text-gray-400 mt-1">Analysing stocks and fetching market data from Yahoo Finance...</p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div>
            {/* Meta info */}
            <div className="flex items-center gap-3 mb-4 text-xs text-gray-400 flex-wrap">
              <span>📊 {result.meta.totalStocksInCSV} stocks in CSV</span>
              <span>·</span>
              <span>✅ {result.meta.tickersFetched} fetched</span>
              {result.meta.tickersFailed > 0 && (
                <>
                  <span>·</span>
                  <span className="text-orange-500">⚠️ {result.meta.tickersFailed} failed</span>
                </>
              )}
              <span>·</span>
              <span>Generated {new Date(result.meta.generatedAt).toLocaleString('en-MY')}</span>
            </div>

            {/* Portfolio summary */}
            <PortfolioSummary portfolio={result.portfolio} capital={parseFloat(capital)} />

            {/* Allocation table */}
            {result.portfolio.selected?.length > 0 && (
              <AllocationTable selected={result.portfolio.selected} />
            )}

            {/* Individual stock cards */}
            <h2 className="text-base font-semibold text-gray-800 mb-3">
              Selected Stocks ({result.portfolio.selected?.length})
            </h2>
            <div className="space-y-4">
              {result.portfolio.selected?.map((stock, i) => (
                <StockCard key={stock.yahooTicker} stock={stock} rank={i + 1} />
              ))}
            </div>

            {/* All scored stocks (below the fold) */}
            {result.allScored?.length > 0 && (
              <details className="mt-8">
                <summary className="text-sm font-semibold text-gray-500 cursor-pointer hover:text-gray-700 mb-3">
                  All screened stocks ({result.allScored.length}) ▼
                </summary>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="text-left px-4 py-2">Stock</th>
                        <th className="text-right px-4 py-2">Score</th>
                        <th className="text-right px-4 py-2">Price</th>
                        <th className="text-right px-4 py-2">Grade</th>
                        <th className="text-left px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {result.allScored
                        .sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1))
                        .map((s) => (
                          <tr key={s.yahooTicker} className="hover:bg-gray-50">
                            <td className="px-4 py-2">
                              <div className="font-medium text-gray-800">{s.stockName}</div>
                              <div className="text-gray-400 font-mono">{s.yahooTicker}</div>
                            </td>
                            <td className="px-4 py-2 text-right font-bold text-purple-600">
                              {s.totalScore ?? '—'}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {s.currentPrice != null ? `RM${s.currentPrice.toFixed(3)}` : '—'}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {s.grade ? <GradeBadge grade={s.grade} /> : '—'}
                            </td>
                            <td className="px-4 py-2">
                              {s.error ? (
                                <span className="text-orange-500 text-xs">⚠️ {s.error.slice(0, 60)}</span>
                              ) : (
                                <span className="text-green-500 text-xs">✓ Analysed</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-12 py-6 text-center text-xs text-gray-400">
        <p>Portfolio Generator · For informational purposes only. Not financial advice.</p>
        <p className="mt-1">Data sourced from Yahoo Finance. Bursa Malaysia lot size: 100 shares.</p>
      </footer>
    </div>
  );
}