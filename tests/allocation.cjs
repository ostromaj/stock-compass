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
