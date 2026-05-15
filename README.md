# Portfolio Generator

A broker buycall portfolio generator for Bursa Malaysia. Fetches the latest CSV from Telegram, scores stocks using fundamental + technical + risk/reward analysis, and builds an optimised portfolio with full execution strategy.

---

## Stack

- **Frontend**: Next.js 14 + React + Tailwind CSS
- **Backend**: Next.js API routes (Node.js)
- **Data**: Yahoo Finance (unofficial API, no key needed)
- **CSV source**: Telegram Bot API or manual upload
- **Hosting**: Vercel (free tier works)

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHANNEL_USERNAME=MyBrokerBuycalls
```

### 3. Telegram Bot Setup (required for auto-fetch)

1. Open Telegram, search for **@BotFather**
2. Send `/newbot` and follow the steps
3. Copy the bot token → paste into `TELEGRAM_BOT_TOKEN`
4. Go to your channel **@MyBrokerBuycalls**
5. Click the channel name → Administrators → Add Admin
6. Search for your bot's username and add it as admin
7. The bot can now receive channel posts and download files

> **Note**: The bot only sees messages posted AFTER it was added as admin. If the CSV was posted before, post it again or use manual upload.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploy to Vercel (Free)

### Option A: Vercel CLI

```bash
npm i -g vercel
vercel
```

Follow the prompts. When asked about environment variables, enter your `TELEGRAM_BOT_TOKEN`.

### Option B: GitHub → Vercel (recommended)

1. Push this project to a GitHub repository
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import your GitHub repo
4. Under **Environment Variables**, add:
   - `TELEGRAM_BOT_TOKEN` = your bot token
   - `TELEGRAM_CHANNEL_USERNAME` = MyBrokerBuycalls
5. Click **Deploy**

Your site will be live at `https://your-project.vercel.app`

---

## How It Works

### Scoring System

Each stock is scored across three dimensions:

| Dimension | Weight | Factors |
|-----------|--------|---------|
| **Fundamental** | 35% | P/E ratio, dividend yield, profit margin, revenue growth, ROE, debt/equity, analyst consensus |
| **Technical** | 40% | RSI, MACD, trend direction (EMA20/50), volume ratio, price structure |
| **Risk/Reward** | 25% | R:R ratio, downside risk %, broker consensus count |

**Grade scale**:
- A (≥75): Strong Buy
- B (60–74): Buy
- C (45–59): Watch
- D (30–44): Weak
- F (<30): Avoid

### Portfolio Construction

1. Parse CSV → deduplicate stocks (same stock from multiple brokers merged)
2. Fetch 6 months of OHLCV data + fundamentals from Yahoo Finance
3. Score all stocks
4. Select top-N by total score
5. Allocate capital equally, round to Bursa lot sizes (100 shares/lot)
6. Calculate transaction fees (brokerage 0.08%, clearing 0.03%, stamp duty)
7. Generate execution plan per stock (entry zone, TP1/TP2, SL, MACD/RSI context)

### Trading Level Logic

- **Entry**: Uses broker-provided entry price if available; otherwise current price
- **TP1**: Uses broker target if available; otherwise upper Bollinger Band (capped at +10%)
- **TP2**: Uses broker target if available; otherwise TP1 + 80% of TP1 distance
- **SL**: Uses broker stop loss if available; otherwise lower Bollinger Band (floored at -6%)

---

## CSV Format

The app expects the broker buycall CSV in this format:

```
Day,Friday,,Date,15 May 2026

BROKER,STOCK,TICKER,Last Price (RM),Entry (RM),TP1/R1 (RM),TP2/R2 (RM),Stop Loss (RM),P&L (%),Status
Maybank,WPRTS,WPRTS,,5.500,6.200,6.800,5.200,,45
RHB,Public Bank,1295,,5.300,5.800,,5.100,,30
```

- Numeric tickers (e.g. `1295`) are automatically converted to `1295.KL` for Yahoo Finance
- Letter tickers (e.g. `WPRTS`) become `WPRTS.KL`
- Empty Entry/TP/SL fields are computed from technical analysis

---

## Known Limitations

1. **Yahoo Finance rate limits**: With 30+ unique tickers, the fetch takes 20–40 seconds. Vercel Hobby plan has a 10s function timeout — upgrade to Pro (or use the manual upload + client-side batching workaround).

2. **Ticker mapping**: Some Bursa tickers don't map cleanly to Yahoo Finance (e.g. `GAM` vs `GAMUDA.KL`). Stocks that fail to fetch are shown with a warning but excluded from the portfolio.

3. **Telegram "old messages"**: Telegram Bot API only returns updates since the bot was added. If the CSV was posted before the bot was added as admin, upload it manually.

4. **No persistent storage**: The app is stateless. Each generation fetches fresh data.

---

## Adjusting Fee Structure

Edit `lib/portfolio.js`:

```js
const BROKERAGE_RATE = 0.08 / 100;  // 0.08% — change to your broker's rate
const CLEARING_FEE = 0.03 / 100;    // 0.03% clearing
const STAMP_DUTY = 1.5 / 1000;      // RM1.50 per RM1,000
const FIXED_CONTRACT_STAMP = 10;    // RM10 per contract
```

---

## Disclaimer

This tool is for informational and educational purposes only. It does not constitute financial advice. Always do your own due diligence before making investment decisions.
