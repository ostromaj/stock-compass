"""Daily, no-key market scanner for Stock Compass.

Downloads U.S.-listed symbols, filters for liquid common stocks, computes the
technical signals used by the front end, and writes the latest eligible set.
"""
from __future__ import annotations

import io
import json
import math
from datetime import date, datetime, timezone
import time
import re
from pathlib import Path

import pandas as pd
import requests
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist" / "data" / "stocks.json"
NASDAQ_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"


def symbols() -> list[str]:
    frames = []
    for url in (NASDAQ_URL, OTHER_URL):
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        frames.append(pd.read_csv(io.StringIO(response.text), sep="|"))
    first = frames[0]
    first = first[(first["Test Issue"] == "N") & (first["ETF"] == "N")]
    second = frames[1]
    second = second[(second["Test Issue"] == "N") & (second["ETF"] == "N")]
    rows = list(zip(first['Symbol'], first['Security Name'])) + list(zip(second['ACT Symbol'], second['Security Name']))
    excluded = re.compile(r"warrant|preferred|depositary shares|\bunits?\b|\bright[s]?\b|\bfund\b|\betn\b|\betf\b", re.I)
    return {str(t).replace('.', '-'):str(name) for t,name in rows
            if isinstance(t,str) and re.fullmatch(r'[A-Z]+(?:[.-][A-Z])?',t) and not excluded.search(str(name))}



def scaled(value: float, low: float, high: float, reverse: bool = False) -> float:
    result = max(0.0, min(100.0, (value - low) / (high - low) * 100))
    return 100 - result if reverse else result


def scan(tickers: list[str]):
    downloaded = 0
    results: list[dict] = []
    for start in range(0, len(tickers), 100):
        batch = tickers[start:start + 100]
        try:
            data = yf.download(batch, period="2y", interval="1d", group_by="ticker", auto_adjust=True, threads=4, timeout=15, progress=False)
        except Exception:
            continue
        for ticker in batch:
            try:
                frame = data[ticker].dropna() if isinstance(data.columns, pd.MultiIndex) else data.dropna()
                close = frame["Close"].astype(float)
                volume = frame["Volume"].astype(float)
                if len(close) > 0: downloaded += 1
                if len(close) < 253 or close.iloc[-1] < 5 or (close.tail(20) * volume.tail(20)).mean() < 5_000_000:
                    continue
                if (date.today() - close.index[-1].date()).days > 5: continue
                delta = close.diff()
                gains = delta.clip(lower=0).ewm(alpha=1/14, adjust=False, min_periods=14).mean()
                losses = (-delta.clip(upper=0)).ewm(alpha=1/14, adjust=False, min_periods=14).mean()
                rsi = float(100 - 100 / (1 + gains.iloc[-1] / max(losses.iloc[-1], 1e-9)))
                sma50, sma200 = float(close.tail(50).mean()), float(close.tail(200).mean())
                ema12, ema26 = close.ewm(span=12).mean(), close.ewm(span=26).mean()
                macd_series = ema12 - ema26
                macd = float((macd_series - macd_series.ewm(span=9,adjust=False).mean()).iloc[-1])
                momentum6 = float(close.iloc[-1] / close.iloc[-127] - 1)
                momentum12 = float(close.iloc[-1] / close.iloc[-253] - 1)
                annual_vol = float(close.pct_change().std() * math.sqrt(252) * 100)
                support = float(close.iloc[-1] / close.tail(60).min() - 1)
                vol_ratio = float(volume.tail(10).mean() / max(volume.tail(60).mean(), 1))
                price = float(close.iloc[-1])
                results.append({
                    "ticker": ticker,
                    "asOf": close.index[-1].date().isoformat(),
                    "name": ticker,
                    "price": round(price, 2),
                    "return12m": round(momentum12 * 100, 1),
                    "rsi": round(rsi, 1),
                    "trend": "Above 50 & 200 day" if price > sma50 > sma200 else "Above 200 day" if price > sma200 else "Mixed",
                    "volatility": round(annual_vol, 1),
                    "sector": "U.S. listed",
                    "signals": {
                        "trend": round((scaled(price / sma200, .88, 1.20) + scaled(sma50 / sma200, .92, 1.12)) / 2),
                        "momentum": round((scaled(momentum6, -.15, .45) + scaled(momentum12, -.20, .70)) / 2),
                        "rsi": round(max(0, 100 - abs(rsi - 57) * 3.1)),
                        "macd": round(scaled(macd / price, -.025, .035)),
                        "volume": round(scaled(vol_ratio, .65, 1.8)),
                        "support": round(scaled(support, .02, .45, reverse=True)),
                        "stability": round(scaled(annual_vol, 15, 65, reverse=True)),
                    },
                })
            except (KeyError, IndexError, TypeError, ValueError):
                continue
        time.sleep(1)
    return results, downloaded


def main() -> None:
    universe = symbols()
    if len(universe) < 1000: raise RuntimeError('Symbol directory incomplete; preserving prior scan')
    stocks, downloaded = scan(list(universe))
    if downloaded < len(universe) * .70 or len(stocks) < 100:
        raise RuntimeError(f'Insufficient coverage: {downloaded}/{len(universe)} histories; preserving prior scan')
    latest = max(s['asOf'] for s in stocks)
    stocks = [s for s in stocks if s['asOf'] == latest]
    if len(stocks) < 100: raise RuntimeError('Too few current histories; preserving prior scan')
    for stock in stocks: stock['name'] = universe[stock['ticker']]
    payload = {'asOf':latest, 'generatedAt':datetime.now(timezone.utc).isoformat(),
               'universe':len(universe),'downloaded':downloaded,'stocks':stocks}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, indent=2,allow_nan=False), encoding='utf-8')
    temporary.replace(OUTPUT)
    print(f'Wrote {len(stocks)} eligible stocks from {len(universe)} listings; {downloaded} downloaded')



if __name__ == "__main__":
    main()
