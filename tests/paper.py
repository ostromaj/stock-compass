import importlib.util,json,sys,tempfile,types
from pathlib import Path
import pandas as pd
sys.modules['yfinance']=types.SimpleNamespace(download=None)
spec=importlib.util.spec_from_file_location('paper',Path(__file__).resolve().parents[1]/'scripts/paper_portfolios.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as folder:
    m.ROOT=Path(folder);m.FILE=m.ROOT/'dist/data/paper.json';m.FILE.parent.mkdir(parents=True)
    market=m.FILE.parent/'stocks.json'
    market.write_text(json.dumps({'asOf':'2026-09-21','stocks':[{}]}))
    m.subprocess.check_output=lambda *a,**k: json.dumps([{'key':'balanced','label':'Balanced','cash':8000,'orders':[{'ticker':'TEST','amount':2000}]}])
    m.main();book=json.loads(m.FILE.read_text());assert book['portfolios'][0]['metrics'] is None
    # Same close cannot fill; first future close is the entry, not signal close.
    dates=pd.to_datetime(['2026-09-21','2026-09-22','2026-09-23'])
    frame=pd.DataFrame({('TEST','Close'):[5.,100.,110.],('SPY','Close'):[50.,100.,105.]},index=dates)
    m.yf.download=lambda *a,**k:frame
    market.write_text(json.dumps({'asOf':'2026-09-23','stocks':[{}]}));m.main()
    book=json.loads(m.FILE.read_text());assert book['entryDate']=='2026-09-22'
    assert book['portfolios'][0]['metrics']['equity']==10197.8
    assert book['benchmark']['equity']==10489.5
    frame.loc[dates[-1],('TEST','Close')]=float('nan');m.main()
    book=json.loads(m.FILE.read_text());assert book['portfolios'][0]['metrics'] is None
print('Paper test passed: no same-day fill, next-close pricing, costs and missing-holding suppression')
