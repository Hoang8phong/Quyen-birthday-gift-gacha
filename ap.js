const STORAGE_KEY = "wuwa_gacha_pure_v6";
const GEM_PER_ROLL = 160;
const START_ROLLS = 80;
const START_GEMS = START_ROLLS * GEM_PER_ROLL;
const VIDEO_TIMEOUT_MS = 15000;

const ITEMS = [
  { id: "Hatsune_Miku", name: "Hatsune Miku",  rarity: 5, type: "character", image: "/gachaimage/rate5saotrung.png" },
  { id: "char_lyra_a",   name: "Random-name A", rarity: 5, type: "character", image: "/gachaimage/rate5saolech.png" },
  { id: "char_lyra_b",   name: "Random-name B", rarity: 5, type: "character", image: "/gachaimage/rate5saolech2.png" },
  { id: "char_lyra_c",   name: "Random-name C", rarity: 5, type: "character", image: "/gachaimage/rate5saolech3.png" },

  { id: "char_vex",      name: "Cartethyia", rarity: 4, type: "character", image: "/gachaimage/rate4sao.png" },


  { id: "wep_steel",  name: "Muki-fvck-u1", rarity: 3, type: "weapon", image: "/gachaimage/rate3sao.png" },
  { id: "wep_bronze", name: "Muki-fvck-u2", rarity: 3, type: "weapon", image: "/gachaimage/rate3sao.png" },
  { id: "wep_oak",    name: "Muki-fvck-u3", rarity: 3, type: "weapon", image: "/gachaimage/rate3sao.png" },
];

const ITEM_MAP = Object.fromEntries(ITEMS.map(i => [i.id, i]));

const RATES = {
  base: { r5: 0.008, r4: 0.06, r3: 0.932 },
  hardPity5: 80,
  pity4: 10,
  softPity: { enabled: true, startAt: 66, mode: "linear", perStep: 0.012 },
  event5050: { enabled: true, featured5Id: "Hatsune_Miku", guaranteeNextIfLost: true }
};

const VIDEO_SRC = { r3: "/gachavideo/gacha3star.mp4", r4: "/gachavideo/gacha4star.mp4", r5: "/gachavideo/gacha5star.mp4" };

// ===== Preload assets (video + images) =====
const PRELOAD_ASSETS = [
  VIDEO_SRC.r3, VIDEO_SRC.r4, VIDEO_SRC.r5,
  ...ITEMS.map(i => i.image).filter(Boolean)
];

function preloadAssets() {
  // Preload qua <link rel="preload">
  PRELOAD_ASSETS.forEach(src => {
    if (!src) return;
    const l = document.createElement('link');
    l.rel = 'preload';
    l.as = src.endsWith('.mp4') ? 'video' : 'image';
    if (src.endsWith('.mp4')) l.type = 'video/mp4';
    l.href = src;
    l.crossOrigin = 'anonymous';
    document.head.appendChild(l);
  });

  // Warm cache ảnh
  ITEMS.forEach(i => {
    if (!i.image) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = i.image;
  });

  // Warm cache nhẹ cho video
  [VIDEO_SRC.r3, VIDEO_SRC.r4, VIDEO_SRC.r5].forEach(v => {
    if (!v) return;
    const vEl = document.createElement('video');
    vEl.preload = 'auto';
    vEl.src = v;
  });
}


let state = {
  pity5: 0,
  pity4: 0,
  lost5050: false,
  history: [],
  inventory: {},
  pulls: 0,
  gems: START_GEMS,
  rolling: false,
  pendingBatch: null,
  lastBatchSize: 1
};

function rand01(){ const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2**32; }

function softP5Prob(k){
  const base = RATES.base.r5;
  if(!RATES.softPity.enabled) return base;
  const sp = RATES.softPity;
  if(sp.mode==="linear"){
    if(k < sp.startAt) return base;
    const steps = (k - sp.startAt + 1);
    return Math.min(0.999999, base + (sp.perStep||0)*steps);
  }
  return base;
}

const fivePool = ITEMS.filter(i=>i.rarity===5);
const fourPool = ITEMS.filter(i=>i.rarity===4);
const threePool = ITEMS.filter(i=>i.rarity===3);
function pick(arr){ return arr[Math.floor(rand01()*arr.length)] }

function pickFiveStarWith5050(){
  const cfg = RATES.event5050;
  const featured = cfg?.enabled ? fivePool.find(i => i.id === cfg.featured5Id) : null;
  const off = featured ? fivePool.filter(i => i.id !== featured.id) : fivePool;

  if (!cfg?.enabled || !featured) {
    const item = pick(fivePool);
    return { item, featuredHit: item.id === featured?.id, nextLost5050: state.lost5050 };
  }
  if (cfg.guaranteeNextIfLost && state.lost5050) {
    return { item: featured, featuredHit: true, nextLost5050: false };
  }
  if (rand01() < 0.5) {
    return { item: featured, featuredHit: true, nextLost5050: false };
  } else {
    const chosen = off.length > 0 ? pick(off) : featured;
    const isFeatured = chosen.id === featured.id;
    return { item: chosen, featuredHit: isFeatured, nextLost5050: cfg.guaranteeNextIfLost ? !isFeatured : state.lost5050 };
  }
}

function rollOne(globalIndex){
  if(state.pity5 + 1 >= RATES.hardPity5){
    const p5 = pickFiveStarWith5050();
    return { rarity:5, item:p5.item, featuredHit:p5.featuredHit, nextLost5050:p5.nextLost5050, pity5:0, pity4:0, index:globalIndex, ts:Date.now() };
  }
  const k = state.pity5 + 1;
  if(rand01() < softP5Prob(k)){
    const p5 = pickFiveStarWith5050();
    return { rarity:5, item:p5.item, featuredHit:p5.featuredHit, nextLost5050:p5.nextLost5050, pity5:0, pity4:0, index:globalIndex, ts:Date.now() };
  }
  if(state.pity4 + 1 >= RATES.pity4){
    const it = pick(fourPool);
    return { rarity:4, item:it, pity5:state.pity5+1, pity4:0, index:globalIndex, ts:Date.now() };
  }
  if(rand01() < RATES.base.r4){
    const it = pick(fourPool);
    return { rarity:4, item:it, pity5:state.pity5+1, pity4:0, index:globalIndex, ts:Date.now() };
  }
  const it = pick(threePool);
  return { rarity:3, item:it, pity5:state.pity5+1, pity4:state.pity4+1, index:globalIndex, ts:Date.now() };
}

function doBatch(n){
  const out=[]; let idxBase = state.pulls;
  let pity5 = state.pity5, pity4 = state.pity4, lost5050 = state.lost5050;
  for(let i=0;i<n;i++){
    const bak = { ...state };
    state.pity5 = pity5; state.pity4 = pity4; state.lost5050 = lost5050;
    const r = rollOne(idxBase + i + 1);
    state = bak;

    pity5 = (r.pity5!==undefined)? r.pity5 : 0;
    pity4 = (r.pity4!==undefined)? r.pity4 : (r.rarity===5?0: state.pity4);
    if(r.rarity===5 && RATES.event5050?.enabled && RATES.event5050.guaranteeNextIfLost){
      if (typeof r.nextLost5050 === "boolean") lost5050 = r.nextLost5050;
      else lost5050 = r.featuredHit ? false : true;
    }
    out.push(r);
  }
  if(n===10){
    const has4up = out.some(x=>x.rarity>=4);
    if(!has4up){
      const forced = pick(fourPool);
      const i = out.length-1;
      out[i] = { rarity:4, item:forced, index: idxBase + 10, ts: Date.now(), pity5: (pity5+1), pity4: 0 };
      pity5 = pity5 + 1; pity4 = 0;
    }
  }
  return { out, np: { pity5, pity4, lost5050 } };
}

const $ = s => document.querySelector(s);
const ratesList = $("#ratesList");
const pity5El = $("#pity5");
const pity4El = $("#pity4");
const nextP5El = $("#nextP5");
const guaranteeRow = $("#guaranteeRow");
const guaranteeText = $("#guaranteeText");
const totalPullsEl = $("#totalPulls");
const resultsWrap = $("#results");
const resultsEmpty = $("#resultsEmpty");
const invWrap = $("#inventory");
const invEmpty = $("#invEmpty");
const hisWrap = $("#history");
const hisEmpty = $("#hisEmpty");
const themeBtn = $("#themeBtn");
const resetBtn = $("#resetBtn");
const pull1Btn = $("#pull1");
const pull10Btn = $("#pull10");
const gemBalanceEl = $("#gemBalance");
const rollsLeftEl = $("#rollsLeft");
const fsOverlay = $("#fsOverlay");
const fsVideo = $("#fsVideo");
const fsSkipBtn = $("#fsSkipBtn");
const fsUnmuteBtn = $("#fsUnmuteBtn");

let videoTimer = null;
function clearVideoTimer(){ if(videoTimer){ clearTimeout(videoTimer); videoTimer = null; } }
function showOverlay(){ fsOverlay.classList.add("active"); }
function hideOverlay(){ fsOverlay.classList.remove("active"); }

function rarityPill(r){ const cls = r===5?'gold':(r===4?'violet':'silver'); return `<span class="pill ${cls}">${r}★</span>`; }

function renderButtons(){
  pull1Btn && (pull1Btn.disabled = state.rolling || state.gems < GEM_PER_ROLL);
  pull10Btn && (pull10Btn.disabled = state.rolling || state.gems < GEM_PER_ROLL*10);
}

function renderRates(){
  const li = [];
  li.push(`<li>5★ base: <strong>${(RATES.base.r5*100).toFixed(2)}%</strong> (soft pity enabled)</li>`);
  li.push(`<li>4★ base: <strong>${(RATES.base.r4*100).toFixed(2)}%</strong> (guarantee every ${RATES.pity4})</li>`);
  li.push(`<li>3★ base: <strong>${(RATES.base.r3*100).toFixed(2)}%</strong></li>`);
  li.push(`<li>Hard pity (5★): <strong>${RATES.hardPity5}</strong></li>`);
  li.push(`<li>Soft pity start: <strong>${RATES.softPity.startAt}</strong> (mode: ${RATES.softPity.mode})</li>`);
  li.push(`<li>Ten-pull guarantee: <strong>at least one 4★</strong> per 10 pulls</li>`);
  if(RATES.event5050?.enabled){
    li.push(`<li>5★ 50/50: Featured <strong>vs</strong> Off-banner (featured: <code>${RATES.event5050.featured5Id}</code>; guarantee next if lost: <strong>${RATES.event5050.guaranteeNextIfLost?"Yes":"No"}</strong>)</li>`);
  }
  ratesList.innerHTML = li.join("");
}

function renderPity(){
  pity5El.textContent = state.pity5;
  pity4El.textContent = state.pity4;
  nextP5El.textContent = (softP5Prob(state.pity5+1)*100).toFixed(2)+"%";
  totalPullsEl.textContent = state.pulls;
  guaranteeRow.style.display = RATES.event5050?.enabled ? "block" : "none";
  guaranteeText.textContent = state.lost5050 ? "Yes" : "No";
  gemBalanceEl.textContent = state.gems.toLocaleString();
  rollsLeftEl.textContent = Math.floor(state.gems / GEM_PER_ROLL).toLocaleString();
  renderButtons();
}

function renderResults(batch){
  if(!batch || batch.length===0){
    resultsWrap.style.display="none"; resultsEmpty.style.display="block"; return;
  }
  resultsWrap.innerHTML = batch.map(r=>{
    const it = r.item;
    return `<div class="result">
      <div style="margin-bottom:6px">${rarityPill(r.rarity)}</div>
      <div class="square">${it.image ? `<img src="${it.image}" alt="${it.name}" style="width:100%;height:100%;object-fit:cover">` : `<div class="muted">${it.name}</div>`}</div>
      <div style="margin-top:6px;font-size:12px">${it.name}</div>
      ${r.rarity===5 && RATES.event5050?.enabled ? `<div class="muted" style="font-size:11px;margin-top:4px">${r.featuredHit?"":""}</div>` : ""}
    </div>`;
  }).join("");
  resultsEmpty.style.display="none"; resultsWrap.style.display="grid";
}

function renderInventory(){
  const entries = Object.entries(state.inventory).filter(([id]) => !!ITEM_MAP[id]);
  if(entries.length===0){ invEmpty.style.display="block"; invWrap.innerHTML=""; return; }
  invEmpty.style.display="none";
  invWrap.innerHTML = entries.map(([id,c])=>{
    const it = ITEM_MAP[id];
    return `<div class="result">
      <div style="display:flex;align-items:center;gap:8px">
        ${rarityPill(it.rarity)}
        <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.name}</div>
        <div style="margin-left:auto" class="muted">×${c}</div>
      </div>
    </div>`;
  }).join("");
}

function renderHistory(){
  const arr = state.history;
  if(arr.length===0){ hisEmpty.style.display="block"; hisWrap.innerHTML=""; return; }
  hisEmpty.style.display="none";
  hisWrap.innerHTML = arr.slice().reverse().map(r=>{
    const it = r.item;
    return `<div class="rowi">
      ${rarityPill(r.rarity)}
      <div style="font-weight:600">${it.name}</div>
      <div class="muted">#${r.index}</div>
      <div style="margin-left:auto" class="muted">${new Date(r.ts).toLocaleString()}</div>
    </div>`;
  }).join("");
}

function save(){
  const data = {
    version:6, rates:RATES,
    pity:{ pity5:state.pity5, pity4:state.pity4, lost5050:state.lost5050 },
    history:state.history, inventory:state.inventory,
    pulls: state.pulls, gems: state.gems
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return;
  try{
    const p = JSON.parse(raw);
    if(p && (p.version>=1 && p.version<=6)){
      state.pity5 = p.pity?.pity5 ?? 0;
      state.pity4 = p.pity?.pity4 ?? 0;
      state.lost5050 = p.pity?.lost5050 ?? false;
      state.history = Array.isArray(p.history)? p.history : [];
      state.inventory = p.inventory || {};
      state.pulls = Number.isFinite(p.pulls) ? p.pulls : state.history.length;
      state.gems = Number.isFinite(p.gems) ? p.gems : START_GEMS;
      for (const id of Object.keys(state.inventory)) if (!ITEM_MAP[id]) delete state.inventory[id];
    }
  }catch{}
}

function highestRarity(batch){ return Math.max(...batch.map(b=>b.rarity)) }
function chooseVideo(batchSize, batch){
  if(batchSize===1){
    const r = batch[0].rarity; return r===5? VIDEO_SRC.r5 : r===4? VIDEO_SRC.r4 : VIDEO_SRC.r3;
  }else{
    const maxR = highestRarity(batch); return maxR>=4 ? (maxR===5? VIDEO_SRC.r5 : VIDEO_SRC.r4) : null;
  }
}

async function playVideoFullscreen(src){
  if(!src) return false;
  clearVideoTimer(); showOverlay();
  fsVideo.src = src; fsVideo.currentTime = 0; fsVideo.muted = false;
  try{ await fsVideo.play(); }catch{ fsVideo.muted = true; try{ await fsVideo.play(); }catch{} }
  clearVideoTimer(); videoTimer = setTimeout(()=>{ onVideoErrored(); }, VIDEO_TIMEOUT_MS);
  return true;
}

function stopVideoReveal(){
  clearVideoTimer();
  try{ fsVideo.pause(); }catch{}
  fsVideo.removeAttribute("src"); fsVideo.load(); hideOverlay();
}

function applyBatch(batch, np){
  state.pulls += batch.length;
  state.pity5 = np.pity5; state.pity4 = np.pity4; state.lost5050 = np.lost5050;
  batch.forEach(r=>{ state.history.push(r); state.inventory[r.item.id] = (state.inventory[r.item.id]||0) + 1; });
  save(); renderPity(); renderResults(batch); renderInventory(); renderHistory();
}

function costFor(n){ return n * GEM_PER_ROLL }

async function startRoll(n){
  if(state.rolling) return;
  const cost = costFor(n);
  if(state.gems < cost){ alert("Not enough gem."); return; }
  state.rolling = true; state.lastBatchSize = n; state.gems -= cost; renderPity();

  const { out, np } = doBatch(n);
  state.pendingBatch = { batch:out, np };
  const vsrc = chooseVideo(n, out);

  if(vsrc){
    const started = await playVideoFullscreen(vsrc);
    if(!started){ applyBatch(out, np); state.pendingBatch = null; state.rolling = false; renderButtons(); }
  }else{
    applyBatch(out, np); state.pendingBatch = null; state.rolling = false; renderButtons();
  }
}

function onVideoEnded(){
  if(!state.pendingBatch){ stopVideoReveal(); state.rolling = false; renderButtons(); return; }
  stopVideoReveal(); applyBatch(state.pendingBatch.batch, state.pendingBatch.np);
  state.pendingBatch = null; state.rolling = false; renderButtons();
}

function onVideoErrored(){
  if(state.rolling){
    if(state.pendingBatch){ stopVideoReveal(); applyBatch(state.pendingBatch.batch, state.pendingBatch.np); state.pendingBatch = null; }
    else{ stopVideoReveal(); }
    state.rolling = false; renderButtons();
  }
}

function onSkip(){
  if(!state.pendingBatch){ stopVideoReveal(); state.rolling = false; renderButtons(); return; }
  stopVideoReveal(); applyBatch(state.pendingBatch.batch, state.pendingBatch.np);
  state.pendingBatch = null; state.rolling = false; renderButtons();
}

function hardReset(){
  state = { pity5:0, pity4:0, lost5050:false, history:[], inventory:{}, pulls:0, gems:START_GEMS, rolling:false, pendingBatch:null, lastBatchSize:1 };
  save(); renderPity(); renderResults([]); renderInventory(); renderHistory(); stopVideoReveal(); renderButtons();
}

function on(el, ev, fn){ if(el) el.addEventListener(ev, fn); }

function init(){
  load(); hideOverlay(); renderRates(); renderPity(); renderResults([]); renderInventory(); renderHistory();
  on(document.getElementById("pull1"), "click", ()=>startRoll(1));
  on(document.getElementById("pull10"), "click", ()=>startRoll(10));
  on(fsVideo, "ended", onVideoEnded); on(fsVideo, "error", onVideoErrored);
  on(fsSkipBtn, "click", onSkip);
  on(fsUnmuteBtn, "click", ()=>{ fsVideo.muted = !fsVideo.muted; fsUnmuteBtn.textContent = fsVideo.muted ? "🔇" : "🔈"; });
  on(themeBtn, "click", ()=>{ document.body.classList.toggle("dark"); });
  on(resetBtn, "click", hardReset);
  renderButtons();
}



document.addEventListener("DOMContentLoaded", init);
document.addEventListener("DOMContentLoaded", preloadAssets);

