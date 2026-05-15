/**
 * pages/api/generate.js
 *
 * Main portfolio generation endpoint.
 *
 * POST body:
 * {
 *   csvText: string,        // raw CSV content
 *   totalCapital: number,   // RM
 *   numStocks: number,      // how many stocks to select
 * }
 *
 * Response:
 * {
 *   portfolio: { selected, cashRemaining, totalInvested, portfolioSummary },
 *   allScored: [...],       // all stocks with scores (for transparency)
 *   meta: { ... }
 * }
 */

import { parseCSV } from '../../lib/csvParser';
import { fetchAllStockData } from '../../lib/yahooFinance';
import { analyseChart, suggestTradingLevels } from '../../lib/technical';
import { scoreFundamentals, scoreRiskReward, computeTotalScore, marketSentimentSummary } from '../../lib/scoring';
import { buildPortfolio, generateExecutionPlan } from '../../lib/portfolio';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
    responseLimit: false,
  },
};

// Increase timeout for Vercel (60s for pro, 10s for hobby — use streaming or client polling for large sets)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { csvText, totalCapital, numStocks } = req.body;

  // --- Validate inputs ---
  if (!csvText || typeof csvText !== 'string') {
    return res.status(400).json({ error: 'csvText is required.' });
  }
  if (!totalCapital || totalCapital <= 0) {
    return res.status(400).json({ error: 'totalCapital must be a positive number.' });
  }
  if (!numStocks || numStocks < 1 || numStocks > 30) {
    return res.status(400).json({ error: 'numStocks must be between 1 and 30.' });
  }

  // --- Step 1: Parse CSV ---
  let stocks;
  try {
    stocks = parseCSV(csvText);
  } catch (parseErr) {
    return res.status(400).json({ error: `CSV parse error: ${parseErr.message}` });
  }

  if (stocks.length === 0) {
    return res.status(400).json({ error: 'No valid stocks found in CSV.' });
  }

  // Collect unique Yahoo Finance tickers
  const uniqueTickers = [...new Set(stocks.map((s) => s.yahooTicker))];

  // --- Step 2: Fetch market data from Yahoo Finance ---
  let marketDataList;
  try {
    marketDataList = await fetchAllStockData(uniqueTickers);
  } catch (fetchErr) {
    return res.status(500).json({ error: `Market data fetch error: ${fetchErr.message}` });
  }

  // Build a lookup map: yahooTicker → market data
  const marketDataMap = {};
  for (const md of marketDataList) {
    marketDataMap[md.ticker] = md;
  }

  // --- Step 3: Score each stock ---
  const scoredStocks = [];

  for (const stock of stocks) {
    const md = marketDataMap[stock.yahooTicker];

    // If data fetch failed, mark the stock but still include it (with low scores)
    if (!md || md.error || !md.chart) {
      scoredStocks.push({
        ...stock,
        error: md?.error ?? 'No market data returned',
        scores: null,
        tech: null,
        levels: null,
        executionPlan: [],
        allocation: null,
      });
      continue;
    }

    const { chart, fundamentals } = md;

    // Technical analysis
    const tech = analyseChart(chart);

    // Trading levels (use CSV values where available, fill in technicals otherwise)
    const levels = suggestTradingLevels(
      chart,
      stock.entry,
      stock.tp1,
      stock.tp2,
      stock.sl
    );

    // Scoring
    const fundResult = scoreFundamentals(fundamentals);
    const rrResult = scoreRiskReward(levels, stock.brokerCount);

    const scores = computeTotalScore(fundResult, { technicalScore: tech.technicalScore }, rrResult);
    scores.fundamentalBreakdown = fundResult.breakdown;
    scores.rrBreakdown = rrResult.breakdown;

    const sentiment = marketSentimentSummary(tech, fundamentals);

    // 52-week position display
    let w52label = null;
    if (fundamentals.fiftyTwoWeekHigh && fundamentals.fiftyTwoWeekLow) {
      w52label = `RM${fundamentals.fiftyTwoWeekLow} – RM${fundamentals.fiftyTwoWeekHigh}`;
    }

    scoredStocks.push({
      ...stock,
      error: null,
      chart: {
        currentPrice: chart.currentPrice,
        currency: chart.currency,
        longName: chart.longName,
      },
      fundamentals: {
        peRatio: fundamentals.peRatio,
        forwardPE: fundamentals.forwardPE,
        dividendYield: fundamentals.dividendYield,
        dividendRate: fundamentals.dividendRate,
        profitMargin: fundamentals.profitMargin,
        revenueGrowth: fundamentals.revenueGrowth,
        roe: fundamentals.roe,
        debtToEquity: fundamentals.debtToEquity,
        marketCap: fundamentals.marketCap,
        sector: fundamentals.sector,
        industry: fundamentals.industry,
        analystScore: fundamentals.analystScore,
        recommendationKey: fundamentals.recommendationKey,
        totalAnalysts: fundamentals.totalAnalysts,
        fiftyTwoWeekRange: w52label,
      },
      tech,
      levels,
      scores,
      sentiment,
    });
  }

  // --- Step 4: Build portfolio ---
  const portfolio = buildPortfolio(scoredStocks, totalCapital, numStocks);

  // Attach execution plans to selected stocks
  for (const stock of portfolio.selected) {
    stock.executionPlan = stock.allocation?.lots > 0
      ? generateExecutionPlan(stock)
      : ['Insufficient capital for even 1 lot at this price.'];
  }

  // --- Step 5: Return results ---
  return res.status(200).json({
    portfolio,
    allScored: scoredStocks.map((s) => ({
      stockName: s.stockName,
      ticker: s.ticker,
      yahooTicker: s.yahooTicker,
      brokers: s.brokers,
      brokerCount: s.brokerCount,
      currentPrice: s.chart?.currentPrice ?? null,
      totalScore: s.scores?.totalScore ?? null,
      grade: s.scores?.grade ?? null,
      error: s.error,
    })),
    meta: {
      totalStocksInCSV: stocks.length,
      tickersAttempted: uniqueTickers.length,
      tickersFetched: marketDataList.filter((m) => !m.error).length,
      tickersFailed: marketDataList.filter((m) => m.error).length,
      generatedAt: new Date().toISOString(),
    },
  });
}
