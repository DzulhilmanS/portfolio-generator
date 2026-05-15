/**
 * yahooFinance.js
 * Server-side Yahoo Finance data fetcher.
 * Uses the unofficial query1/query2 endpoints — no API key needed.
 *
 * IMPORTANT: Run only in Next.js API routes (server-side), NOT in browser code.
 */

const BASE_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const BASE_SUMMARY = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Small helper: sleep for ms milliseconds (used to avoid rate-limiting).
 */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch 6 months of daily OHLCV data for a ticker.
 * Returns { timestamps, open, high, low, close, volume, currentPrice, currency }
 */
export async function fetchChartData(ticker) {
  const url = `${BASE_CHART}/${encodeURIComponent(ticker)}?interval=1d&range=6mo&includePrePost=false`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Yahoo Finance chart fetch failed for ${ticker}: HTTP ${res.status}`);
  }

  const data = await res.json();
  const result = data?.chart?.result?.[0];

  if (!result) {
    throw new Error(`No chart data returned for ${ticker}`);
  }

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const meta = result.meta ?? {};

  // Filter out null values (market holidays / missing data)
  const cleanedData = { timestamps: [], open: [], high: [], low: [], close: [], volume: [] };
  for (let i = 0; i < timestamps.length; i++) {
    if (
      quote.close[i] != null &&
      quote.open[i] != null &&
      quote.high[i] != null &&
      quote.low[i] != null
    ) {
      cleanedData.timestamps.push(timestamps[i]);
      cleanedData.open.push(quote.open[i]);
      cleanedData.high.push(quote.high[i]);
      cleanedData.low.push(quote.low[i]);
      cleanedData.close.push(quote.close[i]);
      cleanedData.volume.push(quote.volume[i] ?? 0);
    }
  }

  if (cleanedData.close.length < 20) {
    throw new Error(`Insufficient price history for ${ticker} (got ${cleanedData.close.length} days)`);
  }

  return {
    ...cleanedData,
    currentPrice: meta.regularMarketPrice ?? cleanedData.close[cleanedData.close.length - 1],
    currency: meta.currency ?? 'MYR',
    exchangeName: meta.exchangeName ?? '',
    longName: meta.longName ?? ticker,
  };
}

/**
 * Fetch fundamental data (PE, dividend, margins, growth, analyst ratings).
 * Returns a flat object with key metrics. Missing fields are null.
 */
export async function fetchFundamentals(ticker) {
  const modules = [
    'summaryDetail',
    'financialData',
    'defaultKeyStatistics',
    'recommendationTrend',
    'assetProfile',
  ].join(',');

  const url = `${BASE_SUMMARY}/${encodeURIComponent(ticker)}?modules=${modules}`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    // Non-fatal: return empty fundamentals instead of crashing
    console.warn(`Fundamentals fetch failed for ${ticker}: HTTP ${res.status}`);
    return buildEmptyFundamentals();
  }

  const data = await res.json();
  const r = data?.quoteSummary?.result?.[0];

  if (!r) {
    return buildEmptyFundamentals();
  }

  const sd = r.summaryDetail ?? {};
  const fd = r.financialData ?? {};
  const ks = r.defaultKeyStatistics ?? {};
  const rt = r.recommendationTrend?.trend?.[0] ?? {}; // most recent period
  const ap = r.assetProfile ?? {};

  // Helper to safely extract raw value
  const v = (obj, key) => obj?.[key]?.raw ?? null;

  // Analyst consensus
  const strongBuy = rt.strongBuy ?? 0;
  const buy = rt.buy ?? 0;
  const hold = rt.hold ?? 0;
  const sell = rt.sell ?? 0;
  const strongSell = rt.strongSell ?? 0;
  const totalAnalysts = strongBuy + buy + hold + sell + strongSell;
  const analystScore =
    totalAnalysts > 0
      ? (strongBuy * 5 + buy * 4 + hold * 3 + sell * 2 + strongSell * 1) / totalAnalysts
      : null;

  return {
    peRatio: v(sd, 'trailingPE'),
    forwardPE: v(sd, 'forwardPE'),
    pbRatio: v(ks, 'priceToBook'),
    dividendYield: v(sd, 'dividendYield'), // decimal, e.g. 0.05 = 5%
    dividendRate: v(sd, 'dividendRate'), // absolute RM amount
    payoutRatio: v(sd, 'payoutRatio'),
    marketCap: v(sd, 'marketCap'),
    beta: v(sd, 'beta'),

    // Profitability
    profitMargin: v(fd, 'profitMargins'), // decimal
    operatingMargin: v(fd, 'operatingMargins'),
    roe: v(fd, 'returnOnEquity'),
    roa: v(fd, 'returnOnAssets'),

    // Growth
    revenueGrowth: v(fd, 'revenueGrowth'), // YoY decimal
    earningsGrowth: v(fd, 'earningsGrowth'),
    earningsQuarterlyGrowth: v(ks, 'earningsQuarterlyGrowth'),

    // Financial health
    debtToEquity: v(fd, 'debtToEquity'), // ratio (e.g. 50 = 0.5x)
    currentRatio: v(fd, 'currentRatio'),
    quickRatio: v(fd, 'quickRatio'),
    totalCash: v(fd, 'totalCash'),
    totalDebt: v(fd, 'totalDebt'),
    freeCashflow: v(fd, 'freeCashflow'),

    // 52-week range
    fiftyTwoWeekHigh: v(sd, 'fiftyTwoWeekHigh'),
    fiftyTwoWeekLow: v(sd, 'fiftyTwoWeekLow'),

    // Analyst recommendations
    analystScore, // 1-5 (5 = strong buy)
    strongBuy,
    buy,
    hold,
    sell,
    strongSell,
    totalAnalysts,
    recommendationKey: fd.recommendationKey ?? null,

    // Sector
    sector: ap.sector ?? null,
    industry: ap.industry ?? null,
  };
}

function buildEmptyFundamentals() {
  return {
    peRatio: null, forwardPE: null, pbRatio: null,
    dividendYield: null, dividendRate: null, payoutRatio: null,
    marketCap: null, beta: null,
    profitMargin: null, operatingMargin: null, roe: null, roa: null,
    revenueGrowth: null, earningsGrowth: null, earningsQuarterlyGrowth: null,
    debtToEquity: null, currentRatio: null, quickRatio: null,
    totalCash: null, totalDebt: null, freeCashflow: null,
    fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null,
    analystScore: null, strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0,
    totalAnalysts: 0, recommendationKey: null,
    sector: null, industry: null,
  };
}

/**
 * Fetch all data for a single ticker. Catches and returns errors gracefully.
 */
export async function fetchStockData(ticker) {
  try {
    const [chart, fundamentals] = await Promise.all([
      fetchChartData(ticker),
      fetchFundamentals(ticker),
    ]);
    return { ticker, chart, fundamentals, error: null };
  } catch (err) {
    console.error(`fetchStockData error for ${ticker}:`, err.message);
    return { ticker, chart: null, fundamentals: null, error: err.message };
  }
}

/**
 * Batch fetch stock data with rate-limit-friendly staggering.
 * Processes in groups of 5 with a 500ms pause between groups.
 */
export async function fetchAllStockData(tickers, onProgress = null) {
  const results = [];
  const BATCH_SIZE = 5;
  const DELAY_MS = 600;

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(batch.map((t) => fetchStockData(t)));
    results.push(...batchResults);

    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, tickers.length), tickers.length);
    }

    // Don't sleep after the last batch
    if (i + BATCH_SIZE < tickers.length) {
      await sleep(DELAY_MS);
    }
  }

  return results;
}
