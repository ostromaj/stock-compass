const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let source=fs.readFileSync('dist/app.js','utf8').split('document.querySelectorAll(\'input[name="risk"]\')')[0];
const ctx=vm.createContext({Intl,Math,Date,Number,String});
vm.runInContext(source+`;this.test=(profile,stocks,budget)=>{activeProfile=profile;return calculateAllocation(stocks,budget)};this.config=profiles`,ctx);
for(const profile of Object.keys(ctx.config)) for(const count of [0,1,2,5]) for(const budget of [0,1,10,100,5000,10000000]) {
 const stocks=Array.from({length:count},(_,i)=>({score:i?70:100,volatility:i?60:15,trend:'Above 50 & 200 day'}));
 const a=ctx.test(profile,stocks,budget),p=ctx.config[profile];
 assert(a.investable<=budget*(1-p.reserve)+.001);
 assert(Math.abs(a.cash+a.investable-budget)<.001);
 a.amounts.forEach(n=>assert(Number.isFinite(n)&&n>=0&&n<=budget*p.maxPosition+.001));
}
assert.equal(ctx.test('balanced',[{score:64,volatility:20,trend:'Mixed'}],5000).investable,0);
console.log('Allocation caps, cash conservation, empty universe and watch-only gates passed');
const nodes={};
ctx.document={querySelector:s=>nodes[s]??=( {value:'5000',textContent:'',innerHTML:'',setCustomValidity(){},reportValidity(){}}),querySelectorAll:()=>[]};
vm.runInContext(`market={asOf:new Date().toISOString().slice(0,10),stocks:[{ticker:'TEST',name:'<script>bad</script>',price:100,return12m:10,rsi:55,volatility:25,trend:'Above 50 & 200 day',signals:{trend:90,momentum:90,rsi:90,macd:90,volume:90,support:90,stability:90}}]};render();`,ctx);
assert(nodes['#stockList'].innerHTML.includes('&lt;script&gt;'));
assert(!nodes['#stockList'].innerHTML.includes('<script>bad'));
assert(nodes['#allocationBars'].innerHTML.includes('shares'));
vm.runInContext(`market.asOf='2000-01-01';render();`,ctx);
assert.equal(nodes['#invested'].textContent,'$0.00');
vm.runInContext(`market.stocks=[];render();`,ctx);
assert(nodes['#stockList'].innerHTML.includes('Awaiting'));
console.log('Rendering, escaped company names and stale-data allocation checks passed');
