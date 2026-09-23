# Stock Compass

Long-term technical research dashboard: three risk profiles, top five ranked stocks, transparent signals, budget allocation, fractional-share estimates, cash reserves and per-position caps. Balanced is the default, not an empirically proven best strategy.

## Data and coverage

Scans the Nasdaq Trader U.S. exchange listing directories, excluding ETFs, warrants, rights, units, preferred shares and funds by directory flags/name heuristics. OTC and unsupported symbols are outside coverage. Requires 253 price observations, latest price at least $5, and 20-day average dollar volume at least $5 million. Missing histories are counted and excluded. The dashboard displays attempted/downloaded/eligible counts. This is broad exchange coverage, not a promise of every U.S. security.

Yahoo data is retrieved through yfinance without an API key. Availability, throttling and provider terms apply; no guaranteed data service. Do not redistribute data commercially without checking licensing. Adjusted historical prices drive signals; the displayed latest adjusted close is indicative, not an executable quote. Prices are end-of-day, not real-time.

## Model

Custom, hand-selected weights for trend, 6/12-month momentum, Wilder-style RSI, MACD histogram, volume, proximity to support and annualized volatility. Weights vary by style; see `dist/app.js`. A score is not a probability or expected return. Only scores >=65 with price above SMA50 above SMA200 qualify for allocation. Sizing uses score excess divided by volatility with strict per-position caps. Unallocated money remains cash, including when fewer than five qualify. Data older than five calendar days pauses allocations.

Conservative: 20% reserve / 20% position cap. Balanced: 10% / 24%. Aggressive: 5% / 28%. Five stocks are not a complete diversified portfolio. No trading or brokerage integration.

No fabricated prices, backtest results or performance claims. Historical backtesting and fundamental analysis are not implemented; weights have not been validated as predictive. Forward paper portfolios freeze each risk profile’s initial picks and compare them with SPY. Entries occur at the next trading session close with 0.1% cost; all returns use matching adjusted-price histories. Missing holding prices suppress the portfolio result instead of dropping losers. This is a forward observational comparison, not a randomized causal A/B experiment.

## Operation

`Scan and publish Stock Compass` runs on pushes, manual dispatch, and weekdays at 22:30 UTC. It scans then deploys in the same workflow (bot commits alone do not trigger another Pages build). A failed or incomplete scan retains the prior file, publishes the last available dashboard, and fails the workflow visibly. First launch shows an honest empty state until data arrives. GitHub scheduling can be delayed; holidays have no new close.

Set Settings → Pages → Source to GitHub Actions. Local preview: `python -m http.server 8000 --directory dist`. Tests: `node tests/allocation.cjs`. Scanner: `pip install -r requirements.txt && python scripts/update_market.py`.
