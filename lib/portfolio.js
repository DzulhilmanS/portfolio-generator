/**
 * portfolio.js
 * Portfolio construction: selects top-N stocks, allocates capital,
 * calculates lot sizes (Bursa Malaysia: 100 shares/lot),
 * and generates execution strategy for each position.
 */

const BURSA_LOT_SIZE = 100; // shares per lot on Bursa Malaysia
const BROKERAGE_RATE = 0.08 / 100; // 0.08% brokerage (M+ / typical online broker)
const CLEARING_FEE = 0.03 / 100;   // 0.03% clearing fee (max RM1,000)
const STAMP_DUTY = 1.5 / 1000;     // RM1.50 per RM1,000 (rounded to nearest RM1)
const FIXED_CONTRACT_STAMP = 10;   // RM10 per contract (fixed)

/**
 * Calculate all-in transaction cost for buying shares.
 */
export function transactionCost(priceRM, shares) {
  const grossValue = priceRM * shares;

  const brokerage = Math.max(grossValue * BROKERAGE_RATE, 8); // min RM8
  const clearing = Math.min(grossValue * CLEARING_FEE, 1000); // max RM1,000
  const stamp = Math.round((grossValue / 1000) * 1.5);         // RM1.50 per RM1,000
  const contractStamp = FIXED_CONTRACT_STAMP;

  const totalFees = brokerage + clearing + stamp + contractStamp;
  const totalCost = grossValue + totalFees;

  return {
    grossValue: parseFloat(grossValue.toFixed(2)),
    brokerage: parseFloat(brokerage.toFixed(2)),
    clearing: parseFloat(clearing.toFixed(2)),
    stamp: parseFloat(stamp.toFixed(2)),
    contractStamp,
    totalFees: parseFloat(totalFees.toFixed(2)),
    totalCost: parseFloat(totalCost.toFixed(2)),
  };
}

/**
 * For a given budget and share price, calculate the maximum whole lots
 * that can be purchased (accounting for transaction fees).
 */
export function maxLots(budget, priceRM) {
  if (priceRM <= 0) return 0;

  // Binary search for max lots within budget (fees are non-linear)
  let lo = 0;
  let hi = Math.floor(budget / (priceRM * BURSA_LOT_SIZE));

  if (hi === 0) return 0;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const shares = mid * BURSA_LOT_SIZE;
    const cost = transactionCost(priceRM, shares).totalCost;
    if (cost <= budget) lo = mid;
    else hi = mid - 1;
  }

  return lo;
}

/**
 * Select the top-N stocks by totalScore, then allocate capital evenly.
 *
 * @param {Array}  scoredStocks   - Array of scored stock objects (with .scores.totalScore)
 * @param {number} totalCapital   - Total available capital in RM
 * @param {number} numStocks      - Number of stocks to select
 * @returns {Object}              - { selected, cashRemaining, totalInvested, portfolioSummary }
 */
export function buildPortfolio(scoredStocks, totalCapital, numStocks) {
  // Sort descending by total score; skip stocks with errors
  const eligible = scoredStocks
    .filter((s) => !s.error && s.scores?.totalScore != null)
    .sort((a, b) => b.scores.totalScore - a.scores.totalScore);

  const selected = eligible.slice(0, numStocks);

  if (selected.length === 0) {
    return {
      selected: [],
      cashRemaining: totalCapital,
      totalInvested: 0,
      portfolioSummary: null,
    };
  }

  // Equal-weight allocation (adjust later if lot rounding leaves cash)
  const allocationPerStock = totalCapital / selected.length;

  let totalInvested = 0;
  const allocations = [];

  for (const stock of selected) {
    const price = stock.levels.entry ?? stock.chart.currentPrice;
    const lots = maxLots(allocationPerStock, price);
    const shares = lots * BURSA_LOT_SIZE;

    if (lots === 0) {
      // Not enough budget for even 1 lot — show as 0 with a note
      allocations.push({
        ...stock,
        allocation: {
          lots: 0,
          shares: 0,
          entry: parseFloat(price.toFixed(3)),
          invested: 0,
          fees: 0,
          note: `Insufficient budget for 1 lot (min needed: RM${(price * BURSA_LOT_SIZE).toFixed(0)})`,
        },
      });
      continue;
    }

    const cost = transactionCost(price, shares);
    totalInvested += cost.totalCost;

    const projectedTP1Gain = ((stock.levels.tp1 - price) / price) * cost.grossValue;
    const projectedTP2Gain = ((stock.levels.tp2 - price) / price) * cost.grossValue;
    const maxLoss = ((price - stock.levels.sl) / price) * cost.grossValue;

    allocations.push({
      ...stock,
      allocation: {
        lots,
        shares,
        entry: parseFloat(price.toFixed(3)),
        grossValue: cost.grossValue,
        fees: cost.totalFees,
        invested: cost.totalCost,
        feeBreakdown: {
          brokerage: cost.brokerage,
          clearing: cost.clearing,
          stamp: cost.stamp,
          contractStamp: cost.contractStamp,
        },
        projectedTP1Gain: parseFloat(projectedTP1Gain.toFixed(2)),
        projectedTP2Gain: parseFloat(projectedTP2Gain.toFixed(2)),
        maxLoss: parseFloat(maxLoss.toFixed(2)),
        projectedTP1GainPct: parseFloat(stock.levels.rewardPct.toFixed(2)),
        projectedTP2GainPct: parseFloat(stock.levels.reward2Pct.toFixed(2)),
        maxLossPct: parseFloat(stock.levels.riskPct.toFixed(2)),
      },
    });
  }

  const cashRemaining = parseFloat((totalCapital - totalInvested).toFixed(2));

  // Portfolio-level summary
  const avgScore = parseFloat(
    (selected.reduce((sum, s) => sum + (s.scores?.totalScore ?? 0), 0) / selected.length).toFixed(1)
  );

  const avgRR = parseFloat(
    (allocations.reduce((sum, s) => sum + (s.levels?.rrRatio ?? 0), 0) / allocations.length).toFixed(2)
  );

  const totalProjectedTP1 = allocations.reduce((sum, s) => sum + (s.allocation.projectedTP1Gain ?? 0), 0);
  const totalMaxLoss = allocations.reduce((sum, s) => sum + (s.allocation.maxLoss ?? 0), 0);

  return {
    selected: allocations,
    cashRemaining,
    totalInvested: parseFloat(totalInvested.toFixed(2)),
    portfolioSummary: {
      avgScore,
      avgRR,
      totalProjectedTP1Gain: parseFloat(totalProjectedTP1.toFixed(2)),
      totalMaxLoss: parseFloat(totalMaxLoss.toFixed(2)),
      portfolioRR: totalMaxLoss > 0 ? parseFloat((totalProjectedTP1 / totalMaxLoss).toFixed(2)) : 0,
      numStocksSelected: allocations.filter((s) => s.allocation.lots > 0).length,
    },
  };
}

/**
 * Generate a plain-language execution strategy for a single stock.
 */
export function generateExecutionPlan(stock) {
  const { levels, scores, tech, allocation } = stock;
  const lines = [];

  // Entry instruction
  const entryZone = `RM${levels.buyZoneLow} – RM${levels.buyZoneHigh}`;
  lines.push(`📌 Entry: Place a limit buy order between ${entryZone}. ${allocation.lots} lot(s) = ${allocation.shares} shares.`);

  // Stop loss
  lines.push(`🛑 Stop Loss: Set hard stop at RM${levels.sl} (${levels.riskPct}% downside). Do not average down below SL.`);

  // Targets
  lines.push(`🎯 TP1: Take 50–60% profits at RM${levels.tp1} (+${levels.rewardPct}%). Move SL to breakeven after TP1 is hit.`);
  lines.push(`🎯 TP2: Let remaining 40–50% ride to RM${levels.tp2} (+${levels.reward2Pct}%). Trail stop below TP1 level.`);

  // Risk/Reward note
  lines.push(`📊 R:R Ratio: ${levels.rrRatio}:1. Expected gain at TP1: RM${allocation.projectedTP1Gain.toFixed(0)}, Max loss: RM${allocation.maxLoss.toFixed(0)}.`);

  // Technical context
  if (tech?.rsi !== null) {
    lines.push(`📈 RSI: ${tech.rsi} (${tech.rsiLabel}). Trend: ${tech.trend?.replace('_', ' ')}. Volume: ${tech.volumeRatio}× average.`);
  }

  // MACD
  if (tech?.macd) {
    const macdNote = tech.macd.bullishCross
      ? 'MACD bullish crossover just fired — confirm entry quickly.'
      : tech.macd.bullish
      ? 'MACD momentum is positive.'
      : 'MACD still bearish — consider waiting for crossover.';
    lines.push(`🔄 ${macdNote}`);
  }

  // Sector/broker note
  const brokerList = stock.brokers?.slice(0, 3).join(', ');
  if (brokerList) {
    lines.push(`🏦 Broker coverage: ${brokerList}${stock.brokerCount > 3 ? ` +${stock.brokerCount - 3} more` : ''}.`);
  }

  return lines;
}
