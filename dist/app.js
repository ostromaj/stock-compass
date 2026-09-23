const profiles = {
  conservative: {
    label: "Conservative quality",
    note: "Lower volatility and wider diversification",
    reserve: 0.20,
    maxPosition: 0.20,
    weights: { trend: .27, momentum: .13, rsi: .13, macd: .12, volume: .08, support: .12, stability: .15 },
    guardrails: ["20% cash reserve", "20% maximum per position", "Low-volatility stocks favored"]
  },
  balanced: {
    label: "Balanced opportunity",
    note: "Trend strength with volatility guardrails",
    reserve: 0.10,
    maxPosition: 0.24,
    weights: { trend: .25, momentum: .20, rsi: .12, macd: .14, volume: .10, support: .09, stability: .10 },
    guardrails: ["10% cash reserve", "24% maximum per position", "Volatility-adjusted sizing"]
  },
  aggressive: {
    label: "Aggressive growth",
    note: "Momentum prioritized; larger price swings expected",
    reserve: 0.05,
    maxPosition: 0.28,
    weights: { trend: .20, momentum: .29, rsi: .09, macd: .17, volume: .13, support: .05, stability: .07 },
    guardrails: ["5% cash reserve", "28% maximum per position", "Momentum and volume favored"]
  }
};

let market = { stocks: [], asOf: "", universe: 0 };
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const priceMoney = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
let activeProfile = "balanced";

const $ = (selector) => document.querySelector(selector);
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function modelScore(stock, profile) {
  const w = profiles[profile].weights;
  return Math.round(Object.keys(w).reduce((score, key) => score + stock.signals[key] * w[key], 0));
}

function getRanked() {
  return market.stocks.filter(stock => Number.isFinite(stock.price) && stock.price > 0)
    .map(stock => ({ ...stock, score: modelScore(stock, activeProfile) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function signalLabel(score) {
  if (score >= 84) return "Strong setup";
  if (score >= 77) return "Attractive";
  return "Watch closely";
}

function calculateAllocation(stocks, budget) {
  const profile = profiles[activeProfile];
  const amounts = stocks.map(() => 0);
  let remaining = budget * (1 - profile.reserve);
  const cap = budget * profile.maxPosition;
  const weights = stocks.map(stock => stock.score >= 65 && stock.trend === 'Above 50 & 200 day'
    ? Math.max(1, stock.score - 60) / Math.max(15, stock.volatility) : 0);
  for (let pass = 0; pass < stocks.length + 1 && remaining > .001; pass++) {
    const eligible = weights.map((w, i) => amounts[i] < cap - .001 ? w : 0);
    const total = eligible.reduce((a, b) => a + b, 0);
    if (!total) break;
    const available = remaining;
    eligible.forEach((w, i) => {
      const add = Math.min(cap - amounts[i], available * w / total);
      amounts[i] += add;
      remaining -= add;
    });
  }
  const rounded = amounts.map(a => Math.floor(a * 100) / 100);
  const invested = rounded.reduce((a,b) => a+b,0);
  return { amounts: rounded, investable: invested, cash: budget - invested };
}

function render() {
  const stocks = getRanked();
  const budget = Number($("#budget").value);
  if (!Number.isFinite(budget) || budget < 0 || budget > 10000000) {
    $("#budget").setCustomValidity("Enter a budget between $0 and $10,000,000.");
    $("#budget").reportValidity(); return;
  }
  $("#budget").setCustomValidity("");
  const stale = !market.asOf || (Date.now() - Date.parse(market.asOf)) > 5*86400000;
  const allocation = stale ? {amounts: stocks.map(()=>0), investable:0,cash:budget} : calculateAllocation(stocks, budget);
  const profile = profiles[activeProfile];
  $("#stance").textContent = profile.label;
  $("#stanceNote").textContent = profile.note;
  $("#invested").textContent = money(allocation.investable);
  $("#cashText").textContent = `${money(allocation.cash)} held as cash buffer`;
  $("#allocationNote").textContent = `Based on a ${money(budget)} budget`;
  $("#guardrails").innerHTML = profile.guardrails.map(item => `<li>${item}</li>`).join("");

  $("#stockList").innerHTML = stocks.length ? stocks.map((stock, index) => `
    <article class="stock-row" data-ticker="${escapeHTML(stock.ticker)}">
      <span class="rank">${index + 1}</span>
      <div class="identity"><span class="ticker-icon">${escapeHTML(stock.ticker.slice(0, 2))}</span><span><strong>${escapeHTML(stock.ticker)}</strong><small>${escapeHTML(stock.name)}</small></span></div>
      <div class="stock-metric"><strong>${priceMoney(stock.price)}</strong><small>Latest close</small></div>
      <div class="stock-metric"><strong>${stock.return12m > 0 ? "+" : ""}${stock.return12m}%</strong><small>12-month return</small></div>
      <div class="score"><span class="score-ring" style="--score:${stock.score}"><b>${stock.score}</b></span><span class="score-copy"><strong>${signalLabel(stock.score)}</strong><small>Compass score</small></span></div>
      <button class="row-toggle" type="button" aria-label="Show details for ${escapeHTML(stock.ticker)}" aria-expanded="false">⌄</button>
      <div class="stock-detail">
        <div class="detail-pill"><span>RSI (14)</span><strong>${stock.rsi}</strong></div>
        <div class="detail-pill"><span>Trend</span><strong>${stock.trend}</strong></div>
        <div class="detail-pill"><span>Volatility</span><strong>${stock.volatility}%</strong></div>
        <div class="detail-pill"><span>Sector</span><strong>${escapeHTML(stock.sector || "Not supplied")}</strong></div>
      </div>
    </article>`).join("") : '<p class="empty">Awaiting the first successful market scan. No buy signals or allocations are available yet.</p>';

  const maxAmount = Math.max(...allocation.amounts, 1);
  $("#allocationBars").innerHTML = stocks.map((stock, index) => {
    const amount = allocation.amounts[index];
    return `<div class="allocation-bar"><strong>${escapeHTML(stock.ticker)}</strong><div class="bar-track"><div class="bar-fill" style="width:${amount / maxAmount * 100}%"></div></div><span class="allocation-amount"><strong>${money(amount)}</strong><small>${budget ? Math.round(amount / budget * 100) : 0}% · ${(amount / stock.price).toFixed(3)} shares</small></span></div>`;
  }).join("");

  document.querySelectorAll(".row-toggle").forEach(button => button.addEventListener("click", () => {
    const row = button.closest(".stock-row");
    const open = row.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
    button.textContent = open ? "⌃" : "⌄";
  }));
}

async function init() {
  try {
    const response = await fetch("./data/stocks.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Market data unavailable");
    market = await response.json();
    $("#asOf").textContent = market.asOf || "No scan yet";
    $("#scanStatus").textContent = !market.asOf ? "Awaiting data" : (Date.now()-Date.parse(market.asOf)>5*86400000 ? "Stale data · allocations paused" : "Latest available scan");
    $("#coverage").textContent = `${market.downloaded || 0} histories downloaded / ${market.universe || 0} listings attempted · ${market.stocks.length} eligible · NYSE / Nasdaq / NYSE American, excluding OTC. Missing histories are excluded.`;
    $("#universe").textContent = new Intl.NumberFormat("en-US").format(market.universe);
    render();
  } catch (error) {
    $("#stockList").innerHTML = `<p style="padding:24px;color:#ff8d8d">The market scan could not be loaded. Please try again shortly.</p>`;
  }
}

document.querySelectorAll('input[name="risk"]').forEach(input => input.addEventListener("change", event => {
  activeProfile = event.target.value;
  render();
}));
$("#allocateButton").addEventListener("click", render);
$("#budget").addEventListener("keydown", event => { if (event.key === "Enter") render(); });
$("#methodButton").addEventListener("click", () => {
  const panel = $("#methodPanel");
  const open = panel.hidden;
  panel.hidden = !open;
  $("#methodButton").setAttribute("aria-expanded", String(open));
  $("#methodButton span").textContent = open ? "−" : "+";
});
init();
