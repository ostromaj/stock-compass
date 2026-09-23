const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('dist/app.js','utf8').split('document.querySelectorAll(\'input[name="risk"]\')')[0];
const ctx=vm.createContext({Intl,Math,Date,Number,String});
vm.runInContext(source+`;this.snapshot=(data)=>{market=data;return Object.keys(profiles).map(key=>{activeProfile=key;const stocks=getRanked();const plan=calculateAllocation(stocks,10000);return {key,label:profiles[key].label,cash:plan.cash,orders:stocks.map((s,i)=>({ticker:s.ticker,amount:plan.amounts[i]})).filter(s=>s.amount>0)}})}`,ctx);
console.log(JSON.stringify(ctx.snapshot(JSON.parse(fs.readFileSync('dist/data/stocks.json','utf8')))));
