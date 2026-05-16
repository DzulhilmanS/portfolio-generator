/**
 * yahooFinance.js
 * Server-side Yahoo Finance data fetcher.
 * Uses the unofficial query1/query2 endpoints — no API key needed.
 *
 * IMPORTANT: Run only in Next.js API routes (server-side), NOT in browser code.
 *
 * Ticker resolution strategy:
 *   1. Try the ticker from the CSV directly (e.g. WPRTS.KL)
 *   2. If 404, search Yahoo Finance by stock NAME (e.g. "Westports") → get correct .KL ticker
 *   3. No static mapping needed — works for any Bursa stock automatically
 */

const BASE_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const BASE_SUMMARY = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary';
const BASE_SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

// In-memory cache: stockName → resolvedTicker (e.g. "Westports" → "5246.KL")
// Avoids repeated search API calls within the same request batch
const tickerCache = new Map();

/**
 * Search Yahoo Finance by stock name and return the first Bursa (.KL) ticker found.
 * Equivalent to the Python lookup_ticker_by_name() function.
 *
 * @param {string} stockName  - e.g. "Westports", "CelcomDigi", "Gamuda"
 * @returns {string|null}     - e.g. "5246.KL" or null if not found
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
    if (!res.ok) {
      console.warn(`Yahoo search failed for "${stockName}": HTTP ${res.status}`);
      return null;
    }

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

    console.warn(`Yahoo search "${stockName}" → no .KL result found`);
    tickerCache.set(cacheKey, null); // cache the miss too
    return null;
  } catch (err) {
    console.warn(`Yahoo search exception for "${stockName}": ${err.message}`);
    return null;
  }
}

/**
 * Small helper: sleep for ms milliseconds (used to avoid rate-limiting).
 */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─────────────────────────────────────────────
   YAHOO FINANCE AUTHENTICATION (Cookie + Crumb)
   Required for server-side requests since 2023.
   Yahoo blocks datacenter IPs without a valid session.
───────────────────────────────────────────── */

let _cookie = null;
let _crumb = null;
let _authExpiry = 0;

async function getYahooAuth() {
  const now = Date.now();
  // Reuse cached auth for 30 minutes
  if (_cookie && _crumb && now < _authExpiry) {
    return { cookie: _cookie, crumb: _crumb };
  }

  try {
    // Step 1: Hit Yahoo Finance to get session cookies
    const homeRes = await fetch('https://finance.yahoo.com/', {
      headers: {
        'User-Agent': HEADERS['User-Agent'],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    // Extract cookies from response
    const rawCookies = homeRes.headers.get('set-cookie') ?? '';
    // Parse multiple Set-Cookie headers — Next.js fetch joins them with commas
    const cookieStr = rawCookies
      .split(/,(?=[^;])/)
      .map(c => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    _cookie = cookieStr || 'YahooSession=1';

    // Step 2: Get the crumb using the session cookie
    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        ...HEADERS,
        'Cookie': _cookie,
      },
    });

    if (crumbRes.ok) {
      const crumbText = await crumbRes.text();
      _crumb = crumbText.trim();
    } else {
      // Try query2 as fallback
      const crumbRes2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: { ...HEADERS, 'Cookie': _cookie },
      });
      _crumb = crumbRes2.ok ? (await crumbRes2.text()).trim() : '';
    }

    _authExpiry = now + 30 * 60 * 1000; // 30 minutes
    console.log(`Yahoo auth OK — crumb: ${_crumb?.slice(0, 8)}...`);
    return { cookie: _cookie, crumb: _crumb };

  } catch (err) {
    console.warn('Yahoo auth failed:', err.message);
    return { cookie: '', crumb: '' };
  }
}

/**
 * Authenticated fetch to Yahoo Finance.
 * Automatically injects cookie + crumb.
 */
async function yahooFetch(url) {
  const { cookie, crumb } = await getYahooAuth();

  // Append crumb to URL if we have one
  const separator = url.includes('?') ? '&' : '?';
  const finalUrl = crumb ? `${url}${separator}crumb=${encodeURIComponent(crumb)}` : url;

  const res = await fetch(finalUrl, {
    headers: {
      ...HEADERS,
      ...(cookie ? { 'Cookie': cookie } : {}),
    },
  });

  // If we get 401/403, clear auth cache and retry once
  if (res.status === 401 || res.status === 403) {
    _cookie = null;
    _crumb = null;
    _authExpiry = 0;

    const { cookie: newCookie, crumb: newCrumb } = await getYahooAuth();
    const retrySep = url.includes('?') ? '&' : '?';
    const retryUrl = newCrumb ? `${url}${retrySep}crumb=${encodeURIComponent(newCrumb)}` : url;

    return fetch(retryUrl, {
      headers: {
        ...HEADERS,
        ...(newCookie ? { 'Cookie': newCookie } : {}),
      },
    });
  }

  return res;
}

/**
 * Fetch 6 months of daily OHLCV data for a ticker.
 * Returns { timestamps, open, high, low, close, volume, currentPrice, currency }
 */
export async function fetchChartData(ticker) {
  const url = `${BASE_CHART}/${encodeURIComponent(ticker)}?interval=1d&range=6mo&includePrePost=false`;

  const res = await yahooFetch(url);
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

  const res = await yahooFetch(url);
  if (!res.ok) {
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
 * Fetch all data for a single ticker.
 * If the ticker returns 404, automatically searches Yahoo Finance by stock name
 * and retries with the resolved ticker — no static mapping needed.
 *
 * @param {string} ticker     - Yahoo Finance ticker e.g. "WPRTS.KL"
 * @param {string} stockName  - Human name e.g. "Westports" (used for fallback search)
 * @returns {{ ticker, resolvedTicker, chart, fundamentals, error }}
 */
export async function fetchStockData(ticker, stockName = '') {
  // ── Attempt 1: use the ticker as provided ──────────────────────────────────
  try {
    const [chart, fundamentals] = await Promise.all([
      fetchChartData(ticker),
      fetchFundamentals(ticker),
    ]);
    return { ticker, resolvedTicker: ticker, chart, fundamentals, error: null };
  } catch (firstErr) {
    const is404 = firstErr.message.includes('404') || firstErr.message.includes('No chart data');

    // ── Attempt 2: search by stock name → get correct .KL ticker ─────────────
    if (is404 && stockName) {
      console.log(`Ticker ${ticker} returned 404 — searching by name "${stockName}"...`);
      const resolved = await lookupTickerByName(stockName);

      if (resolved && resolved !== ticker) {
        try {
          const [chart, fundamentals] = await Promise.all([
            fetchChartData(resolved),
            fetchFundamentals(resolved),
          ]);
          console.log(`Resolved ${ticker} → ${resolved} via name search`);
          return { ticker, resolvedTicker: resolved, chart, fundamentals, error: null };
        } catch (secondErr) {
          console.error(`fetchStockData retry failed for ${resolved}:`, secondErr.message);
          return {
            ticker,
            resolvedTicker: resolved,
            chart: null,
            fundamentals: null,
            error: `Name search found ${resolved} but fetch failed: ${secondErr.message}`,
          };
        }
      }
    }

    // ── All attempts failed ────────────────────────────────────────────────────
    console.error(`fetchStockData failed for ${ticker}:`, firstErr.message);
    return {
      ticker,
      resolvedTicker: ticker,
      chart: null,
      fundamentals: null,
      error: firstErr.message,
    };
  }
}

/**
 * Batch fetch stock data with rate-limit-friendly staggering.
 * Processes in groups of 5 with a 500ms pause between groups.
 *
 * @param {Array<{ticker: string, stockName: string}>} items
 * @param {Function} onProgress
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

    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, items.length), items.length);
    }

    if (i + BATCH_SIZE < items.length) {
      await sleep(DELAY_MS);
    }
  }

  return results;
}