/**
 * yahooFinance.js
 * Server-side Yahoo Finance data fetcher.
 *
 * Ticker resolution strategy:
 *   1. Try the ticker from the CSV directly (e.g. WPRTS.KL)
 *   2. If 404, search Yahoo Finance by stock NAME → get correct .KL ticker
 *   3. No static mapping needed — works for any Bursa stock automatically
 */

const BASE_CHART   = 'https://query1.finance.yahoo.com/v8/finance/chart';
const BASE_SUMMARY = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary';
const BASE_SEARCH  = 'https://query1.finance.yahoo.com/v1/finance/search';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// In-memory cache: stockName → resolvedTicker
const tickerCache = new Map();

/**
 * Search Yahoo Finance by stock name → return first .KL ticker found.
 */
export async function lookupTickerByName(stockName) {
  if (!stockName) return null;

  const cacheKey = stockName.toLowerCase().trim();
  if (tickerCache.has(cacheKey)) return tickerCache.get(cacheKey);

  try {
    const params = new URLSearchParams({
      q: stockName,
      lang: 'en-US',
      region: 'MY',
      quotesCount: '10',
      newsCount: '0',
      enableFuzzyQuery: 'true',
    });

    const res = await fetch(`${BASE_SEARCH}?${params}`, { headers: HEADERS });
    if (!res.ok) return null;

    const data = await res.json();
    const quotes = data?.quotes ?? [];

    for (const q of quotes) {
      const symbol = q?.symbol ?? '';
      if (symbol.endsWith('.KL')) {
        console.log(`Yahoo search "${stockName}" → ${symbol}`);
        tickerCache.set(cacheKey, symbol);
        return symbol;
      }
    }

    tickerCache.set(cacheKey, null);
    return null;
  } catch (err) {
    console.warn(`Yahoo search failed for "${stockName}": ${err.message}`);
    return null;
  }
}

/**
 * Fetch 6 months of daily OHLCV data for a ticker.
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
  const meta  = result.meta ?? {};

  const cleanedData = { timestamps: [], open: [], high: [], low: [], close: [], volume: [] };
  for (let i = 0; i < timestamps.length; i++) {
    if (quote.close[i] != null && quote.open[i] != null && quote.high[i] != null && quote.low[i] != null) {
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
 * Fetch fundamental data. Fails gracefully — returns empty object on error.
 */
export async function fetchFundamentals(ticker) {
  const modules = [
    'summaryDetail', 'financialData', 'defaultKeyStatistics',
    'recommendationTrend', 'assetProfile',
  ].join(',');

  try {
    const res = await fetch(
      `${BASE_SUMMARY}/${encodeURIComponent(ticker)}?modules=${modules}`,
      { headers: HEADERS }
    );

    if (!res.ok) return buildEmptyFundamentals();

    const data = await res.json();
    const r = data?.quoteSummary?.result?.[0];
    if (!r) return buildEmptyFundamentals();

    const sd = r.summaryDetail ?? {};
    const fd = r.financialData ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const rt = r.recommendationTrend?.trend?.[0] ?? {};
    const ap = r.assetProfile ?? {};
    const v  = (obj, key) => obj?.[key]?.raw ?? null;

    const strongBuy  = rt.strongBuy ?? 0;
    const buy        = rt.buy ?? 0;
    const hold       = rt.hold ?? 0;
    const sell       = rt.sell ?? 0;
    const strongSell = rt.strongSell ?? 0;
    const totalAnalysts = strongBuy + buy + hold + sell + strongSell;
    const analystScore = totalAnalysts > 0
      ? (strongBuy * 5 + buy * 4 + hold * 3 + sell * 2 + strongSell * 1) / totalAnalysts
      : null;

    return {
      peRatio: v(sd, 'trailingPE'),
      forwardPE: v(sd, 'forwardPE'),
      pbRatio: v(ks, 'priceToBook'),
      dividendYield: v(sd, 'dividendYield'),
      dividendRate: v(sd, 'dividendRate'),
      payoutRatio: v(sd, 'payoutRatio'),
      marketCap: v(sd, 'marketCap'),
      beta: v(sd, 'beta'),
      profitMargin: v(fd, 'profitMargins'),
      operatingMargin: v(fd, 'operatingMargins'),
      roe: v(fd, 'returnOnEquity'),
      roa: v(fd, 'returnOnAssets'),
      revenueGrowth: v(fd, 'revenueGrowth'),
      earningsGrowth: v(fd, 'earningsGrowth'),
      earningsQuarterlyGrowth: v(ks, 'earningsQuarterlyGrowth'),
      debtToEquity: v(fd, 'debtToEquity'),
      currentRatio: v(fd, 'currentRatio'),
      quickRatio: v(fd, 'quickRatio'),
      totalCash: v(fd, 'totalCash'),
      totalDebt: v(fd, 'totalDebt'),
      freeCashflow: v(fd, 'freeCashflow'),
      fiftyTwoWeekHigh: v(sd, 'fiftyTwoWeekHigh'),
      fiftyTwoWeekLow: v(sd, 'fiftyTwoWeekLow'),
      analystScore, strongBuy, buy, hold, sell, strongSell,
      totalAnalysts,
      recommendationKey: fd.recommendationKey ?? null,
      sector: ap.sector ?? null,
      industry: ap.industry ?? null,
    };
  } catch (err) {
    console.warn(`Fundamentals failed for ${ticker}: ${err.message}`);
    return buildEmptyFundamentals();
  }
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
 * Fetch all data for one ticker. Auto-retries with name search if ticker 404s.
 */
export async function fetchStockData(ticker, stockName = '') {
  try {
    const [chart, fundamentals] = await Promise.all([
      fetchChartData(ticker),
      fetchFundamentals(ticker),
    ]);
    return { ticker, resolvedTicker: ticker, chart, fundamentals, error: null };
  } catch (firstErr) {
    const is404 = firstErr.message.includes('404') || firstErr.message.includes('No chart data');

    if (is404 && stockName) {
      console.log(`${ticker} returned 404 — searching by name "${stockName}"...`);
      const resolved = await lookupTickerByName(stockName);

      if (resolved && resolved !== ticker) {
        try {
          const [chart, fundamentals] = await Promise.all([
            fetchChartData(resolved),
            fetchFundamentals(resolved),
          ]);
          console.log(`Resolved ${ticker} → ${resolved}`);
          return { ticker, resolvedTicker: resolved, chart, fundamentals, error: null };
        } catch (secondErr) {
          return { ticker, resolvedTicker: resolved, chart: null, fundamentals: null, error: secondErr.message };
        }
      }
    }

    return { ticker, resolvedTicker: ticker, chart: null, fundamentals: null, error: firstErr.message };
  }
}

/**
 * Batch fetch with rate-limit-friendly staggering.
 */
export async function fetchAllStockData(items, onProgress = null) {
  const results = [];
  const BATCH_SIZE = 5;
  const DELAY_MS = 600;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(({ ticker, stockName }) => fetchStockData(ticker, stockName))
    );
    results.push(...batchResults);

    if (onProgress) onProgress(Math.min(i + BATCH_SIZE, items.length), items.length);
    if (i + BATCH_SIZE < items.length) await sleep(DELAY_MS);
  }

  return results;
}