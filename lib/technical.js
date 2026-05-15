/**
 * technical.js
 * Pure JavaScript technical analysis calculations.
 * All functions are stateless and deterministic given the same input.
 */

/* ─────────────────────────────────────────────
   MOVING AVERAGES
───────────────────────────────────────────── */

/**
 * Simple Moving Average over last `period` prices.
 */
export function sma(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Exponential Moving Average — returns full array aligned to input.
 * First `period` values use SMA seed; subsequent values use EMA formula.
 */
export function emaArray(prices, period) {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const result = new Array(prices.length).fill(null);

  // Seed with SMA
  const seed = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = seed;

  for (let i = period; i < prices.length; i++) {
    result[i] = prices[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

/**
 * Get the last EMA value for a given period.
 */
export function emaLast(prices, period) {
  const arr = emaArray(prices, period);
  return arr[arr.length - 1] ?? null;
}

/* ─────────────────────────────────────────────
   RSI
───────────────────────────────────────────── */

/**
 * Wilder's RSI. Returns the latest RSI value (0–100) or null if insufficient data.
 */
export function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;

  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  // Initial average gain/loss (simple average over first `period` changes)
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining changes
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

/**
 * Interpret RSI for scoring purposes.
 */
export function interpretRSI(rsi) {
  if (rsi === null) return { label: 'N/A', score: 2, color: 'gray' };
  if (rsi < 30) return { label: 'Oversold', score: 4, color: 'blue' };      // potential bounce
  if (rsi < 45) return { label: 'Buy Zone', score: 5, color: 'green' };     // ideal entry
  if (rsi < 60) return { label: 'Neutral', score: 3, color: 'yellow' };
  if (rsi < 70) return { label: 'Elevated', score: 2, color: 'orange' };
  return { label: 'Overbought', score: 1, color: 'red' };
}

/* ─────────────────────────────────────────────
   MACD
───────────────────────────────────────────── */

/**
 * Standard MACD (12, 26, 9).
 * Returns { macd, signal, histogram, bullishCross, bullish, strengthening }
 */
export function calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
  if (prices.length < slow + signal) return null;

  const ema12 = emaArray(prices, fast);
  const ema26 = emaArray(prices, slow);

  // MACD line = EMA12 - EMA26 (only where both are defined)
  const macdLine = ema12.map((v, i) => (v !== null && ema26[i] !== null ? v - ema26[i] : null));
  const validMacd = macdLine.filter((v) => v !== null);

  if (validMacd.length < signal) return null;

  const signalArr = emaArray(validMacd, signal);
  const histogram = validMacd.map((m, i) => (signalArr[i] !== null ? m - signalArr[i] : null));

  const n = histogram.length;
  const lastHist = histogram[n - 1];
  const prevHist = histogram[n - 2] ?? null;
  const lastMACD = validMacd[validMacd.length - 1];
  const lastSignal = signalArr[signalArr.length - 1];

  return {
    macd: parseFloat(lastMACD?.toFixed(5) ?? 0),
    signal: parseFloat(lastSignal?.toFixed(5) ?? 0),
    histogram: parseFloat(lastHist?.toFixed(5) ?? 0),
    bullishCross: lastHist > 0 && prevHist !== null && prevHist <= 0,
    bullish: lastHist > 0,
    strengthening: prevHist !== null && lastHist > prevHist,
  };
}

/**
 * Score MACD result (0–5).
 */
export function scoreMACDResult(macd) {
  if (!macd) return 2;
  if (macd.bullishCross) return 5;
  if (macd.bullish && macd.strengthening) return 4;
  if (macd.bullish) return 3;
  if (macd.strengthening) return 2; // narrowing bearish gap — potential reversal
  return 1;
}

/* ─────────────────────────────────────────────
   BOLLINGER BANDS
───────────────────────────────────────────── */

/**
 * Bollinger Bands (20, 2σ).
 * Returns { upper, middle, lower, bandwidth, percentB }
 */
export function calculateBollingerBands(prices, period = 20, stdMult = 2) {
  if (prices.length < period) return null;

  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
  const std = Math.sqrt(variance);

  const upper = mean + stdMult * std;
  const lower = mean - stdMult * std;
  const current = prices[prices.length - 1];

  return {
    upper: parseFloat(upper.toFixed(4)),
    middle: parseFloat(mean.toFixed(4)),
    lower: parseFloat(lower.toFixed(4)),
    bandwidth: parseFloat(((upper - lower) / mean).toFixed(4)),
    percentB: std > 0 ? parseFloat(((current - lower) / (upper - lower)).toFixed(4)) : 0.5,
  };
}

/* ─────────────────────────────────────────────
   VOLUME ANALYSIS
───────────────────────────────────────────── */

/**
 * Volume ratio: today's volume vs 20-day average.
 */
export function volumeRatio(volumes, period = 20) {
  if (volumes.length < period + 1) return 1;
  const avg = volumes.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / period;
  const current = volumes[volumes.length - 1];
  return avg > 0 ? parseFloat((current / avg).toFixed(2)) : 1;
}

/**
 * Score volume ratio (1–4).
 */
export function scoreVolumeRatio(ratio) {
  if (ratio >= 2.0) return 4;
  if (ratio >= 1.5) return 3;
  if (ratio >= 1.0) return 2;
  return 1;
}

/* ─────────────────────────────────────────────
   TREND ANALYSIS
───────────────────────────────────────────── */

/**
 * Determine trend direction using price vs EMA20 vs EMA50.
 */
export function trendDirection(prices) {
  if (prices.length < 51) return 'insufficient';
  const price = prices[prices.length - 1];
  const e20 = emaLast(prices, 20);
  const e50 = emaLast(prices, 50);

  if (!e20 || !e50) return 'insufficient';
  if (price > e20 && e20 > e50) return 'uptrend';
  if (price < e20 && e20 < e50) return 'downtrend';
  if (price > e20 && e20 < e50) return 'recovering';
  if (price < e20 && e20 > e50) return 'weakening';
  return 'sideways';
}

/**
 * Score trend direction (1–5).
 */
export function scoreTrend(trend) {
  const map = {
    uptrend: 5,
    recovering: 4,
    sideways: 3,
    weakening: 2,
    downtrend: 1,
    insufficient: 2,
  };
  return map[trend] ?? 2;
}

/* ─────────────────────────────────────────────
   52-WEEK POSITION
───────────────────────────────────────────── */

/**
 * Where is the current price relative to its 52-week range? (0 = low, 1 = high)
 */
export function fiftyTwoWeekPosition(prices) {
  const year = prices.slice(-252);
  if (year.length < 10) return null;
  const high = Math.max(...year);
  const low = Math.min(...year);
  const current = prices[prices.length - 1];
  if (high === low) return 0.5;
  return parseFloat(((current - low) / (high - low)).toFixed(3));
}

/* ─────────────────────────────────────────────
   TRADING LEVEL SUGGESTIONS
───────────────────────────────────────────── */

/**
 * Suggest entry, TP1, TP2 and stop loss based on technicals.
 * Uses broker-provided values where available; fills in the rest from BB + recent structure.
 *
 * @param {Object} ohlcv   - { open, high, low, close, volume }
 * @param {number|null} csvEntry
 * @param {number|null} csvTP1
 * @param {number|null} csvTP2
 * @param {number|null} csvSL
 */
export function suggestTradingLevels(ohlcv, csvEntry, csvTP1, csvTP2, csvSL) {
  const { close, high, low } = ohlcv;
  const currentPrice = close[close.length - 1];

  const bb = calculateBollingerBands(close);
  const recentHigh20 = Math.max(...high.slice(-20));
  const recentLow20 = Math.min(...low.slice(-20));
  const recentHigh10 = Math.max(...high.slice(-10));
  const recentLow10 = Math.min(...low.slice(-10));
  const e20 = emaLast(close, 20);
  const e50 = emaLast(close, 50);

  // Entry: use CSV value, or current price (assume buy near current level)
  const entry = csvEntry ?? currentPrice;

  // Stop Loss: CSV value > lower BB > 5% below entry > recent 10-day low
  let sl;
  if (csvSL) {
    sl = csvSL;
  } else if (bb && bb.lower < entry) {
    sl = parseFloat(Math.max(bb.lower, entry * 0.94).toFixed(3));
  } else {
    sl = parseFloat(Math.max(recentLow10, entry * 0.95).toFixed(3));
  }

  // TP1: CSV value > upper BB > recent 20-day high > 8% above entry
  let tp1;
  if (csvTP1) {
    tp1 = csvTP1;
  } else if (bb && bb.upper > entry) {
    tp1 = parseFloat(Math.min(bb.upper, entry * 1.10).toFixed(3));
  } else {
    tp1 = parseFloat(Math.max(recentHigh20, entry * 1.07).toFixed(3));
  }

  // TP2: CSV value > extend TP1 by the same distance again > 15% above entry
  let tp2;
  if (csvTP2) {
    tp2 = csvTP2;
  } else {
    const tp1Distance = tp1 - entry;
    tp2 = parseFloat((tp1 + tp1Distance * 0.8).toFixed(3));
  }

  // Clamp: tp1 must be > entry, tp2 > tp1, sl < entry
  tp1 = Math.max(tp1, entry * 1.03);
  tp2 = Math.max(tp2, tp1 * 1.03);
  sl = Math.min(sl, entry * 0.97);

  const riskAmount = entry - sl;
  const rewardAmount = tp1 - entry;
  const rrRatio = riskAmount > 0 ? parseFloat((rewardAmount / riskAmount).toFixed(2)) : 0;
  const riskPct = parseFloat(((entry - sl) / entry * 100).toFixed(2));
  const rewardPct = parseFloat(((tp1 - entry) / entry * 100).toFixed(2));
  const reward2Pct = parseFloat(((tp2 - entry) / entry * 100).toFixed(2));

  // Execution zone: entry ±1% for limit order range
  const buyZoneLow = parseFloat((entry * 0.99).toFixed(3));
  const buyZoneHigh = parseFloat((entry * 1.01).toFixed(3));

  return {
    entry: parseFloat(entry.toFixed(3)),
    tp1: parseFloat(tp1.toFixed(3)),
    tp2: parseFloat(tp2.toFixed(3)),
    sl: parseFloat(sl.toFixed(3)),
    rrRatio,
    riskPct,
    rewardPct,
    reward2Pct,
    buyZoneLow,
    buyZoneHigh,
    currentPrice: parseFloat(currentPrice.toFixed(3)),
    support: parseFloat(recentLow20.toFixed(3)),
    resistance: parseFloat(recentHigh20.toFixed(3)),
    ema20: e20 ? parseFloat(e20.toFixed(3)) : null,
    ema50: e50 ? parseFloat(e50.toFixed(3)) : null,
  };
}

/* ─────────────────────────────────────────────
   FULL TECHNICAL ANALYSIS BUNDLE
───────────────────────────────────────────── */

/**
 * Run all technical analysis on a price/volume dataset.
 * Returns a single object with all indicators and scores.
 */
export function analyseChart(ohlcv) {
  const { close, volume } = ohlcv;

  const rsi = calculateRSI(close);
  const rsiInterp = interpretRSI(rsi);
  const macdResult = calculateMACD(close);
  const macdScore = scoreMACDResult(macdResult);
  const bb = calculateBollingerBands(close);
  const volRatio = volumeRatio(volume);
  const volScore = scoreVolumeRatio(volRatio);
  const trend = trendDirection(close);
  const trendScore = scoreTrend(trend);
  const w52pos = fiftyTwoWeekPosition(close);

  const e20 = emaLast(close, 20);
  const e50 = emaLast(close, 50);
  const currentPrice = close[close.length - 1];

  const priceVsEMA20 = e20 ? (currentPrice > e20 ? 1 : 0) : null;
  const priceVsEMA50 = e50 ? (currentPrice > e50 ? 1 : 0) : null;

  // Composite technical score (max 25 raw points → normalised to 0–100)
  const rawTechnical =
    rsiInterp.score +        // 1–5
    macdScore +               // 1–5
    volScore +                // 1–4
    trendScore +              // 1–5
    (priceVsEMA20 ?? 0.5) * 3 + // 0–3
    (priceVsEMA50 ?? 0.5) * 3;  // 0–3
  // Max = 5+5+4+5+3+3 = 25

  const technicalScore = parseFloat(((rawTechnical / 25) * 100).toFixed(1));

  return {
    rsi,
    rsiLabel: rsiInterp.label,
    rsiScore: rsiInterp.score,
    rsiColor: rsiInterp.color,
    macd: macdResult,
    macdScore,
    bollingerBands: bb,
    volumeRatio: volRatio,
    volumeScore: volScore,
    trend,
    trendScore,
    priceVsEMA20,
    priceVsEMA50,
    fiftyTwoWeekPosition: w52pos,
    technicalScore,
    ema20: e20,
    ema50: e50,
    currentPrice,
  };
}
