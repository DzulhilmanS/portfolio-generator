/**
 * yahooFinance.js
 * Server-side Yahoo Finance data fetcher.
 *
 * Ticker resolution strategy:
 *   1. Try the ticker from the CSV directly (e.g. WPRTS.KL)
 *   2. If 404, search Yahoo Finance by stock NAME → get correct .KL ticker
 *   3. No static mapping needed — works for any Bursa stock automatically
 *
 * Fundamentals strategy:
 *   Uses v7/finance/quote (query1 → query2 fallback) instead of v10/quoteSummary.
 *   Railway datacenter IPs are blocked by Yahoo Finance for all fundamentals endpoints.
 *   Fundamentals return null gracefully — scoring engine handles this via technical + risk-reward.
 */

const BASE_CHART  = 'https://query1.finance.yahoo.com/v8/finance/chart';
const BASE_SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';

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
 * Tries query1 first, falls back to query2 if blocked.
 */
export async function fetchChartData(ticker) {
  const path = `/${encodeURIComponent(ticker)}?interval=1d&range=6mo&includePrePost=false`;

  const tryChart = async (base) => {
    try {
      const res = await fetch(`${base}${path}`, { headers: HEADERS });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.chart?.result?.[0] ?? null;
    } catch {
      return null;
    }
  };

  const result =
    await tryChart('https://query1.finance.yahoo.com/v8/finance/chart') ??
    await tryChart('https://query2.finance.yahoo.com/v8/finance/chart');

  if (!result) {
    throw new Error(`Yahoo Finance chart fetch failed for ${ticker}: HTTP 404`);
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
 * Fetch fundamental data using v7/finance/quote.
 *
 * Note: Railway datacenter IPs are blocked by Yahoo Finance for all data endpoints.
 * This function returns null for all fields silently — the scoring engine handles
 * nulls gracefully and falls back to technical + risk-reward scoring only.
 */
export async function fetchFundamentals(ticker) {
  const fields = [
    'trailingPE', 'forwardPE', 'priceToBook',
    'trailingAnnualDividendYield', 'trailingAnnualDividendRate', 'payoutRatio',
    'marketCap', 'beta', 'fiftyTwoWeekHigh', 'fiftyTwoWeekLow',
    'epsTrailingTwelveMonths', 'epsForward', 'bookValue',
  ].join(',');

  const tryFetch = async (base) => {
    try {
      const url = `${base}/v7/finance/quote?symbols=${encodeURIComponent(ticker)}&fields=${fields}`;
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.quoteResponse?.result?.[0] ?? null;
    } catch {
      return null;
    }
  };

  try {
    const q =
      await tryFetch('https://query1.finance.yahoo.com') ??
      await tryFetch('https://query2.finance.yahoo.com');

    if (!q) return buildEmptyFundamentals();

    return {
      peRatio:                  q.trailingPE                  ?? null,
      forwardPE:                q.forwardPE                   ?? null,
      pbRatio:                  q.priceToBook                 ?? null,
      dividendYield:            q.trailingAnnualDividendYield ?? null,
      dividendRate:             q.trailingAnnualDividendRate  ?? null,
      payoutRatio:              q.payoutRatio                 ?? null,
      marketCap:                q.marketCap                   ?? null,
      beta:                     q.beta                        ?? null,
      fiftyTwoWeekHigh:         q.fiftyTwoWeekHigh            ?? null,
      fiftyTwoWeekLow:          q.fiftyTwoWeekLow             ?? null,
      // Not available from v7/quote — nulls handled by scoring engine
      profitMargin:             null,
      operatingMargin:          null,
      roe:                      null,
      roa:                      null,
      revenueGrowth:            null,
      earningsGrowth:           null,
      earningsQuarterlyGrowth:  null,
      debtToEquity:             null,
      currentRatio:             null,
      quickRatio:               null,
      totalCash:                null,
      totalDebt:                null,
      freeCashflow:             null,
      analystScore:             null,
      strongBuy:                0,
      buy:                      0,
      hold:                     0,
      sell:                     0,
      strongSell:               0,
      totalAnalysts:            0,
      recommendationKey:        null,
      sector:                   null,
      industry:                 null,
    };
  } catch {
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
