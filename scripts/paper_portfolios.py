"""Forward-only, buy-and-hold paper comparison. No backtest or actual trades."""
import json
import subprocess
from pathlib import Path
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / 'dist/data/paper.json'
START = 10000
COST = .001

def performance(values):
    if len(values) == 0: return None
    drawdown = (values / values.cummax() - 1).min() * 100
    return {'equity':round(float(values.iloc[-1]),2),
            'returnPct':round(float(values.iloc[-1]/START-1)*100,2),
            'drawdownPct':round(float(drawdown),2),'sessions':len(values)}

def main():
    market=json.loads((ROOT/'dist/data/stocks.json').read_text())
    if not market.get('asOf') or not market['stocks']: return
    book=json.loads(FILE.read_text()) if FILE.exists() else {}
    if not book.get('portfolios'):
        portfolios=json.loads(subprocess.check_output(['node','scripts/paper_snapshot.cjs'],cwd=ROOT,text=True))
        book={'signalDate':market['asOf'],'asOf':market['asOf'],'portfolios':portfolios,'benchmark':None}
    signal=book['signalDate']
    if market['asOf'] <= signal:
        for p in book['portfolios']: p.update(status='Awaiting next session close',metrics=None)
    else:
        tickers=sorted({'SPY'} | {o['ticker'] for p in book['portfolios'] for o in p['orders']})
        data=yf.download(tickers,start=signal,group_by='ticker',auto_adjust=True,threads=2,progress=False,timeout=20)
        histories={}
        for ticker in tickers:
            try:
                series=data[ticker]['Close'].dropna()
                series=series[(series.index.date>pd.Timestamp(signal).date()) & (series.index.date<=pd.Timestamp(market['asOf']).date())]
                histories[ticker]=series
            except (KeyError,TypeError): pass
        spy=histories.get('SPY',pd.Series(dtype=float))
        if spy.empty or spy.index[-1].date().isoformat()!=market['asOf']:
            raise RuntimeError('Benchmark unavailable; retaining prior paper report')
        entry=spy.index[0]
        calendar=spy.index
        benchmark=START*(1-COST)*spy/spy.iloc[0]
        # Include pre-entry capital so entry cost counts in drawdown.
        base=pd.Series([START],index=[pd.Timestamp(signal)])
        book['benchmark']=performance(pd.concat([base,benchmark]))
        book['entryDate']=entry.date().isoformat()
        for p in book['portfolios']:
            values=pd.Series(p['cash'],index=calendar,dtype=float)
            missing=[]
            for order in p['orders']:
                series=histories.get(order['ticker'],pd.Series(dtype=float)).reindex(calendar)
                if series.isna().any() or series.iloc[0]<=0:
                    missing.append(order['ticker']); continue
                values += order['amount']*(1-COST)*series/series.iloc[0]
            p['metrics']=None if missing else performance(pd.concat([base,values]))
            p['status']='Unpriced holdings: '+', '.join(missing) if missing else 'Tracking buy-and-hold'
        book['asOf']=market['asOf']
    temp=FILE.with_suffix('.tmp');temp.write_text(json.dumps(book,indent=2,allow_nan=False));temp.replace(FILE)

if __name__=='__main__': main()
