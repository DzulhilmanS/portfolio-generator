/**
 * scoring.js
 * Scores each stock across three dimensions:
 *   • Fundamental  (35% weight)
 *   • Technical    (40% weight)
 *   • Risk/Reward  (25% weight)
 *
 * Each dimension produces a 0–100 score.
 * The weighted sum is the "Total Score" used for portfolio selection.
 */

/* ─────────────────────────────────────────────
   FUNDAMENTAL SCORING  (max 100)
───────────────────────────────────────────── */

function scoreInRange(value, ranges) {
  // ranges: array of { max, score } sorted ascending; last entry catches all above
  if (value === null || value === undefined || isNaN(value)) return null;
  for (const { max, score } of ranges) {
    if (value <= max) return score;
  }
  return ranges[ranges.length - 1].score;
}

/**
 * Score a stock's fundamental data.
 * Returns { rawScore (0–56), fundamentalScore (0–100), breakdown }
 */
export function scoreFundamentals(f) {
  const breakdown = {};

  // PE Ratio (lower is better for value; 0 or negative = problem)
  // Max 10 pts
  let peScore;
  if (f.peRatio === null) peScore = 3; // unknown — neutral
  else if (f.peRatio <= 0) peScore = 0; // loss-making
  else if (f.peRatio <= 10) peScore = 10;
  else if (f.peRatio <= 15) peScore = 8;
  else if (f.peRatio <= 20) peScore = 6;
  else if (f.peRatio <= 25) peScore = 4;
  else if (f.peRatio <= 35) peScore = 2;
  else peScore = 1;
  breakdown.pe = peScore;

  // Dividend Yield (higher is generally better for income)
  // Max 8 pts
  const dyPct = f.dividendYield !== null ? f.dividendYield * 100 : null;
  let dyScore;
  if (dyPct === null) dyScore = 1;
  else if (dyPct >= 6) dyScore = 8;
  else if (dyPct >= 4) dyScore = 7;
  else if (dyPct >= 3) dyScore = 6;
  else if (dyPct >= 2) dyScore = 4;
  else if (dyPct >= 1) dyScore = 2;
  else dyScore = 1;
  breakdown.dividendYield = dyScore;

  // Profit Margin (higher is better)
  // Max 10 pts
  const pmPct = f.profitMargin !== null ? f.profitMargin * 100 : null;
  let pmScore;
  if (pmPct === null) pmScore = 3;
  else if (pmPct >= 20) pmScore = 10;
  else if (pmPct >= 12) pmScore = 8;
  else if (pmPct >= 6) pmScore = 6;
  else if (pmPct >= 0) pmScore = 3;
  else pmScore = 0; // loss
  breakdown.profitMargin = pmScore;

  // Revenue Growth YoY
  // Max 8 pts
  const rgPct = f.revenueGrowth !== null ? f.revenueGrowth * 100 : null;
  let rgScore;
  if (rgPct === null) rgScore = 3;
  else if (rgPct >= 25) rgScore = 8;
  else if (rgPct >= 15) rgScore = 7;
  else if (rgPct >= 8) rgScore = 5;
  else if (rgPct >= 0) rgScore = 3;
  else rgScore = 1;
  breakdown.revenueGrowth = rgScore;

  // Return on Equity (higher is better)
  // Max 8 pts
  const roePct = f.roe !== null ? f.roe * 100 : null;
  let roeScore;
  if (roePct === null) roeScore = 3;
  else if (roePct >= 20) roeScore = 8;
  else if (roePct >= 15) roeScore = 6;
  else if (roePct >= 10) roeScore = 5;
  else if (roePct >= 5) roeScore = 3;
  else roeScore = 1;
  breakdown.roe = roeScore;

  // Debt-to-Equity (lower is safer)
  // Yahoo returns this as a percentage (e.g. 50 = 0.5x). Normalize.
  // Max 8 pts
  const de = f.debtToEquity !== null ? f.debtToEquity / 100 : null; // convert to ratio
  let deScore;
  if (de === null) deScore = 3;
  else if (de <= 0.2) deScore = 8;
  else if (de <= 0.5) deScore = 6;
  else if (de <= 1.0) deScore = 4;
  else if (de <= 2.0) deScore = 2;
  else deScore = 1;
  breakdown.debtToEquity = deScore;

  // Analyst Score (1–5 from our calculation)
  // Max 4 pts
  let analystScore;
  if (f.analystScore === null) analystScore = 2;
  else if (f.analystScore >= 4.5) analystScore = 4;
  else if (f.analystScore >= 3.8) analystScore = 3;
  else if (f.analystScore >= 3) analystScore = 2;
  else analystScore = 1;
  breakdown.analyst = analystScore;

  const rawScore = peScore + dyScore + pmScore + rgScore + roeScore + deScore + analystScore;
  const maxScore = 10 + 8 + 10 + 8 + 8 + 8 + 4; // = 56
  const fundamentalScore = parseFloat(((rawScore / maxScore) * 100).toFixed(1));

  return { rawScore, maxScore, fundamentalScore, breakdown };
}

/* ─────────────────────────────────────────────
   RISK/REWARD SCORING  (max 100)
───────────────────────────────────────────── */

/**
 * Score based on R:R ratio, downside risk, and broker consensus.
 */
export function scoreRiskReward(levels, brokerCount) {
  const breakdown = {};

  // R:R ratio (TP1 vs SL)
  // Max 12 pts
  let rrScore;
  const rr = levels.rrRatio;
  if (rr >= 3.0) rrScore = 12;
  else if (rr >= 2.5) rrScore = 10;
  else if (rr >= 2.0) rrScore = 8;
  else if (rr >= 1.5) rrScore = 6;
  else if (rr >= 1.0) rrScore = 4;
  else rrScore = 2;
  breakdown.rrRatio = rrScore;

  // Downside risk (% from entry to SL — smaller is better)
  // Max 8 pts
  let riskScore;
  const riskPct = levels.riskPct;
  if (riskPct <= 3) riskScore = 8;
  else if (riskPct <= 5) riskScore = 6;
  else if (riskPct <= 7) riskScore = 4;
  else if (riskPct <= 10) riskScore = 2;
  else riskScore = 1;
  breakdown.riskPct = riskScore;

  // Broker consensus (more brokers recommending = stronger signal)
  // Max 5 pts
  let brokerScore;
  if (brokerCount >= 4) brokerScore = 5;
  else if (brokerCount === 3) brokerScore = 4;
  else if (brokerCount === 2) brokerScore = 3;
  else brokerScore = 1;
  breakdown.brokerConsensus = brokerScore;

  const rawScore = rrScore + riskScore + brokerScore;
  const maxScore = 12 + 8 + 5; // = 25
  const rrScore100 = parseFloat(((rawScore / maxScore) * 100).toFixed(1));

  return { rawScore, maxScore, rrScore: rrScore100, breakdown };
}

/* ─────────────────────────────────────────────
   COMPOSITE SCORING
───────────────────────────────────────────── */

const WEIGHTS = {
  fundamental: 0.35,
  technical: 0.40,
  riskReward: 0.25,
};

/**
 * Compute the weighted total score for a stock.
 * Returns an object with all subscores and the final totalScore (0–100).
 */
export function computeTotalScore(fundamentalResult, technicalResult, rrResult) {
  const { fundamentalScore } = fundamentalResult;
  const { technicalScore } = technicalResult;
  const { rrScore } = rrResult;

  const totalScore = parseFloat(
    (
      fundamentalScore * WEIGHTS.fundamental +
      technicalScore * WEIGHTS.technical +
      rrScore * WEIGHTS.riskReward
    ).toFixed(1)
  );

  return {
    fundamentalScore,
    technicalScore,
    rrScore,
    totalScore,
    weights: WEIGHTS,
    grade: gradeFromScore(totalScore),
  };
}

/**
 * Convert numeric score to letter grade.
 */
export function gradeFromScore(score) {
  if (score >= 75) return { grade: 'A', label: 'Strong Buy', color: 'green' };
  if (score >= 60) return { grade: 'B', label: 'Buy', color: 'emerald' };
  if (score >= 45) return { grade: 'C', label: 'Watch', color: 'yellow' };
  if (score >= 30) return { grade: 'D', label: 'Weak', color: 'orange' };
  return { grade: 'F', label: 'Avoid', color: 'red' };
}

/**
 * Sentiment summary based on technicals + fundamentals.
 * Returns a short string for the UI.
 */
export function marketSentimentSummary(tech, fund) {
  const signals = [];

  // RSI signal
  if (tech.rsi !== null) {
    if (tech.rsi < 35) signals.push('Oversold — potential bounce');
    else if (tech.rsi > 70) signals.push('Overbought — caution');
    else if (tech.rsi >= 40 && tech.rsi <= 55) signals.push('RSI in buy zone');
  }

  // MACD signal
  if (tech.macd) {
    if (tech.macd.bullishCross) signals.push('MACD bullish crossover');
    else if (tech.macd.bullish && tech.macd.strengthening) signals.push('MACD momentum building');
  }

  // Trend
  if (tech.trend === 'uptrend') signals.push('Price in confirmed uptrend');
  else if (tech.trend === 'recovering') signals.push('Recovering from pullback');
  else if (tech.trend === 'downtrend') signals.push('Downtrend — wait for reversal');

  // Volume
  if (tech.volumeRatio >= 1.5) signals.push(`Volume surge (${tech.volumeRatio}× avg)`);

  // Fundamental positives
  if (fund.dividendYield !== null && fund.dividendYield * 100 >= 4) {
    signals.push(`High dividend yield (${(fund.dividendYield * 100).toFixed(1)}%)`);
  }
  if (fund.profitMargin !== null && fund.profitMargin * 100 >= 15) {
    signals.push('Strong profit margins');
  }

  if (signals.length === 0) signals.push('Neutral — limited signals');

  return signals.slice(0, 3).join(' · ');
}
