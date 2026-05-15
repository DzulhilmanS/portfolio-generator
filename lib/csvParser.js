/**
 * csvParser.js
 * Parses the broker buycall tracker CSV format.
 *
 * CSV structure (row 1: date header, row 2: blank, row 3: column headers, row 4+: data):
 * BROKER, STOCK, TICKER, Last Price (RM), Entry (RM), TP1/R1 (RM), TP2/R2 (RM), Stop Loss (RM), P&L (%), Status
 */

/**
 * Normalize a Bursa Malaysia ticker to Yahoo Finance format.
 * Numeric codes (e.g. "1295") → "1295.KL"
 * Letter tickers (e.g. "WPRTS") → "WPRTS.KL"
 * Already has .KL → return as-is
 */
export function normalizeTicker(ticker) {
  if (!ticker || ticker.trim() === '') return null;
  ticker = ticker.trim().toUpperCase();

  // Already formatted
  if (ticker.endsWith('.KL')) return ticker;

  // Skip clearly invalid tickers
  if (ticker.length === 0) return null;

  return `${ticker}.KL`;
}

/**
 * Parse a float value from a CSV cell. Returns null for empty/zero/"0.000" entries.
 */
function parsePrice(val) {
  if (!val || val.trim() === '') return null;
  const n = parseFloat(val);
  // Treat 0.000 as "no data" (the CSV uses 0.000 for unfilled cells)
  if (isNaN(n) || n === 0) return null;
  return n;
}

/**
 * Main CSV parser. Returns an array of deduplicated stock objects.
 */
export function parseCSV(text) {
  // Normalize line endings and split
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Find the header row (contains "BROKER")
  const headerIdx = lines.findIndex((l) =>
    l.toUpperCase().includes('BROKER') && l.toUpperCase().includes('STOCK')
  );

  if (headerIdx === -1) {
    throw new Error(
      'Invalid CSV format: could not find header row. Expected a row with BROKER, STOCK, TICKER columns.'
    );
  }

  const rawStocks = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;

    // Split by comma. Note: some fields may be empty, producing consecutive commas.
    const cols = line.split(',');

    const broker = cols[0]?.trim();
    const stockName = cols[1]?.trim();
    const ticker = cols[2]?.trim();

    // Skip rows without broker and stock name
    if (!broker || !stockName) continue;
    // Skip rows with no ticker (some entries like "AEM Holdings" have no ticker)
    if (!ticker) continue;

    const entry = parsePrice(cols[4]);
    const tp1 = parsePrice(cols[5]);
    const tp2 = parsePrice(cols[6]);
    const sl = parsePrice(cols[7]);
    const pnl = cols[8]?.trim() !== '' ? parseFloat(cols[8]) : null;
    const statusRaw = cols[9]?.trim();
    const status = statusRaw ? parseInt(statusRaw, 10) : null;

    const yahooTicker = normalizeTicker(ticker);
    if (!yahooTicker) continue;

    rawStocks.push({
      broker,
      stockName,
      ticker,
      yahooTicker,
      entry,
      tp1,
      tp2,
      sl,
      pnl: isNaN(pnl) ? null : pnl,
      status,
    });
  }

  if (rawStocks.length === 0) {
    throw new Error('No valid stock entries found in CSV. Check the file format.');
  }

  // Deduplicate by stock name (case-insensitive, whitespace-normalised)
  // When the same stock appears from multiple brokers, merge and count broker coverage
  const stockMap = new Map();

  for (const s of rawStocks) {
    const key = s.stockName.toLowerCase().replace(/\s+/g, '');

    if (stockMap.has(key)) {
      const existing = stockMap.get(key);

      // Add broker if not already listed
      if (!existing.brokers.includes(s.broker)) {
        existing.brokers.push(s.broker);
      }

      // Use first non-null values for trading levels (earliest/most complete call wins)
      existing.entry = existing.entry ?? s.entry;
      existing.tp1 = existing.tp1 ?? s.tp1;
      existing.tp2 = existing.tp2 ?? s.tp2;
      existing.sl = existing.sl ?? s.sl;

      // Keep the most recent status (lower number = newer in this CSV)
      if (s.status !== null && (existing.status === null || s.status < existing.status)) {
        existing.status = s.status;
      }
    } else {
      stockMap.set(key, {
        ...s,
        brokers: [s.broker],
        brokerCount: 1,
      });
    }
  }

  // Compute final broker count
  const stocks = Array.from(stockMap.values()).map((s) => ({
    ...s,
    brokerCount: s.brokers.length,
  }));

  return stocks;
}

/**
 * Parse CSV from a Buffer (for Telegram file download use case).
 */
export function parseCSVBuffer(buffer) {
  const text = buffer.toString('utf-8');
  return parseCSV(text);
}
