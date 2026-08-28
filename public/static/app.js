const $ = id => document.getElementById(id);
let currentWord = "";
let currentAudio = { uk: "", us: "" };
let sessionTrail = [];
let lastCambridgeData = null;
let lastLongmanData = null;
let lastEtymologyData = null;
let currentSourceMode = "cambridge";

function escapeHtml(text){return String(text||"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));}
function setStatus(text,isError=false){const el=$("status"); if(!el) return; if(isError){el.textContent=text||"";el.className="status error";}else{renderSessionTrail();}}

function scrollToTopArea(){
  const target = $("topAnchor") || $("wordInput") || document.body;
  target.scrollIntoView({behavior:"smooth", block:"start"});
}

function addToSessionTrail(word){
  const w = String(word||"").trim();
  if(!w) return;
  const key = w.toLowerCase();
  sessionTrail = sessionTrail.filter(x => x.toLowerCase() !== key);
  sessionTrail.push(w);
  renderSessionTrail();
}

function sessionChip(word){
  const s=document.createElement("button");
  s.className="chip trailChip";
  s.textContent=word;
  s.onclick=()=>lookup(word,false,true);
  return s;
}

function renderSessionTrail(){
  const box=$("status");
  if(!box) return;
  box.innerHTML="";
  box.className="status trailBox";
  if(!sessionTrail.length){
    const e=document.createElement("span");
    e.className="empty";
    e.textContent="本次查詢紀錄會顯示在這裡";
    box.appendChild(e);
    return;
  }
  const label=document.createElement("span");
  label.className="trailLabel";
  label.textContent="本次查詢";
  box.appendChild(label);
  sessionTrail.forEach(w=>box.appendChild(sessionChip(w)));
  const clearBtn=document.createElement("button");
  clearBtn.className="secondary small clearTrailBtn";
  clearBtn.textContent="清除本次查詢";
  clearBtn.onclick=clearSessionTrail;
  box.appendChild(clearBtn);
}

function clearSessionTrail(){
  sessionTrail=[];
  renderSessionTrail();
}

function speakBrowser(word, lang){
  if(!("speechSynthesis" in window)){
    setStatus("此瀏覽器不支援內建發音；也沒有抓到 Cambridge 音訊。", true);
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(word);
  utter.lang = lang;
  utter.rate = 0.82;
  const voices = window.speechSynthesis.getVoices() || [];
  const prefix = lang.toLowerCase().startsWith("en-gb") ? "en-gb" : "en-us";
  const voice = voices.find(v => (v.lang || "").toLowerCase().startsWith(prefix));
  if(voice) utter.voice = voice;
  window.speechSynthesis.speak(utter);
}


function makeLongmanUrl(word){
  const slug = String(word||"").trim().toLowerCase().replace(/\s+/g,"-");
  return `https://www.ldoceonline.com/dictionary/${encodeURIComponent(slug)}`;
}

function makeEtymonlineUrl(word){
  const slug = String(word||"").trim().toLowerCase().replace(/\s+/g,"-");
  return `https://www.etymonline.com/word/${encodeURIComponent(slug)}`;
}

function playPronunciation(kind){
  const url = currentAudio[kind];
  if(url){
    // Play through our same-origin Worker proxy. This avoids Safari/hotlink issues
    // while keeping Cambridge as the actual pronunciation source.
    const proxied = `/api/audio?src=${encodeURIComponent(url)}`;
    const audio = new Audio(proxied);
    audio.preload = "auto";
    audio.play().catch(() => speakBrowser(currentWord, kind === "uk" ? "en-GB" : "en-US"));
    return;
  }
  speakBrowser(currentWord, kind === "uk" ? "en-GB" : "en-US");
}

function chip(word){const s=document.createElement("button");s.className="chip";s.textContent=word;s.onclick=()=>lookup(word,false,true);return s;}
function renderChips(id,words){const box=$(id);box.innerHTML="";if(!words||!words.length){const e=document.createElement("span");e.className="empty";e.textContent="目前沒有資料";box.appendChild(e);return;}words.forEach(w=>box.appendChild(chip(w)));}
function renderEntries(entries, mode="cambridge"){const root=$("entries");root.innerHTML="";root.className=mode==="longman"?"longmanEntries":"";if(!entries||!entries.length){root.innerHTML='<div class="empty">沒有可顯示的詞義。</div>';return;}entries.forEach(entry=>{const div=document.createElement("div");div.className="entry";const pos=document.createElement("div");pos.className="pos";pos.textContent=entry.part_of_speech||"詞性未解析到";div.appendChild(pos);(entry.senses||[]).forEach(sense=>{const s=document.createElement("div");s.className="sense";const zh=sense.translation_zh?`<div class="zh">${escapeHtml(sense.translation_zh||"")}</div>`:"";s.innerHTML=`${zh}<div class="def">${escapeHtml(sense.definition_en||"")}</div>`;if(sense.examples&&sense.examples.length){const ul=document.createElement("ul");ul.className="examples";sense.examples.forEach(ex=>{const li=document.createElement("li");const zhEx=ex.zh?`<span class="zhEx">${escapeHtml(ex.zh||"")}</span>`:"";li.innerHTML=`<span>${escapeHtml(ex.en||"")}</span>${zhEx}`;ul.appendChild(li);});s.appendChild(ul);}div.appendChild(s);});root.appendChild(div);});}

function setSourceMode(mode){
  currentSourceMode = mode;
  const camBtn=$("cambridgeViewBtn"), longBtn=$("longmanViewBtn"), etymBtn=$("etymologyViewBtn"), label=$("sourceModeLabel");
  if(camBtn) camBtn.classList.toggle("activeSource", mode==="cambridge");
  if(longBtn) longBtn.classList.toggle("activeSource", mode==="longman");
  if(etymBtn) etymBtn.classList.toggle("activeSource", mode==="etymology");
  if(label){
    if(mode==="longman") label.textContent = "目前顯示 Longman 英英";
    else if(mode==="etymology") label.textContent = "目前顯示 Etymonline 乾淨字源";
    else label.textContent = "目前顯示 Cambridge 繁中";
  }
}

function renderCambridgeView(){
  if(!lastCambridgeData) return;
  setSourceMode("cambridge");
  renderEntries(lastCambridgeData.entries||[], "cambridge");
  renderChips("synonyms",lastCambridgeData.synonyms||[]);
  renderChips("antonyms",lastCambridgeData.antonyms||[]);
  renderChips("related",lastCambridgeData.related||[]);
}

async function renderLongmanView(force=false){
  if(!currentWord) return;
  setSourceMode("longman");
  const label=$("sourceModeLabel");
  if(label) label.textContent="正在讀取 Longman 英英...";
  try{
    const res=await fetch(`/api/longman?word=${encodeURIComponent(currentWord)}&force=${force?"1":"0"}`);
    const data=await res.json();
    lastLongmanData=data;
    if(data.error) setStatus(data.error,true); else renderSessionTrail();
    renderEntries(data.entries||[], "longman");
    // Longman 本身不提供穩定的同義字／反義字／相關字解析。
    // 切到 Longman 時，保留下方 Cambridge 詞彙關聯區，讓英英定義與詞彙延伸可以並用。
    renderChips("synonyms", lastCambridgeData?.synonyms || []);
    renderChips("antonyms", lastCambridgeData?.antonyms || []);
    renderChips("related", lastCambridgeData?.related || []);
    if(label) label.textContent="目前顯示 Longman 英英；下方詞彙關聯保留 Cambridge 資料";
  }catch(err){
    setStatus(`Longman 查詢失敗：${err}`, true);
    if(label) label.textContent="Longman 英英載入失敗";
  }
}


function renderEtymology(data){
  const root=$("entries");
  root.innerHTML="";
  root.className="etymologyEntries";
  const sections=data.sections||[];
  if(!sections.length){
    root.innerHTML='<div class="empty">沒有可顯示的字源正文。</div>';
    return;
  }
  sections.forEach(sec=>{
    const div=document.createElement("div");
    div.className="etymSection";
    const h=document.createElement("div");
    h.className="etymTitle";
    h.textContent=sec.title||"Etymology";
    div.appendChild(h);
    (sec.paragraphs||[]).forEach(p=>{
      const para=document.createElement("p");
      para.className="etymPara";
      para.textContent=p;
      div.appendChild(para);
    });
    root.appendChild(div);
  });
}

async function renderEtymologyView(force=false){
  if(!currentWord) return;
  setSourceMode("etymology");
  const label=$("sourceModeLabel");
  if(label) label.textContent="正在讀取 Etymonline 乾淨字源...";
  try{
    const res=await fetch(`/api/etymology?word=${encodeURIComponent(currentWord)}&force=${force?"1":"0"}`);
    const data=await res.json();
    lastEtymologyData=data;
    if(data.error) setStatus(data.error,true); else renderSessionTrail();
    renderEtymology(data);
    // 字源頁不另抓同反義；保留 Cambridge 的詞彙關聯，避免學生看到原站廣告/推薦內容。
    renderChips("synonyms", lastCambridgeData?.synonyms || []);
    renderChips("antonyms", lastCambridgeData?.antonyms || []);
    renderChips("related", lastCambridgeData?.related || []);
    if(label) label.textContent="目前顯示 Etymonline 乾淨字源；下方詞彙關聯保留 Cambridge 資料";
  }catch(err){
    setStatus(`Etymonline 查詢失敗：${err}`, true);
    if(label) label.textContent="Etymonline 字源載入失敗";
  }
}

function renderResult(data){
  lastCambridgeData=data;
  currentWord=data.word||data.headword||"";
  currentAudio={uk:data.uk_audio||"",us:data.us_audio||""};
  $("result").classList.remove("hidden");
  $("headword").textContent=data.word||data.headword||"";
  $("ukIpa").textContent=data.uk_ipa?`UK ${data.uk_ipa}`:"UK 音標未解析到";
  $("usIpa").textContent=data.us_ipa?`US ${data.us_ipa}`:"US 音標未解析到";

  $("ukAudio").classList.remove("hidden");
  $("usAudio").classList.remove("hidden");
  $("ukAudio").textContent=data.uk_audio?"UK 發音":"UK 發音（瀏覽器）";
  $("usAudio").textContent=data.us_audio?"US 發音":"US 發音（瀏覽器）";
  $("ukAudio").onclick=()=>playPronunciation("uk");
  $("usAudio").onclick=()=>playPronunciation("us");

  const sourceUrl=data.source_url||`https://dictionary.cambridge.org/dictionary/english-chinese-traditional/${encodeURIComponent(currentWord)}`;
  const sourceLink=$("sourceLink");
  sourceLink.href=sourceUrl;
  sourceLink.textContent=`Cambridge：${currentWord}`;
  sourceLink.classList.add("active");

  const longmanLink=$("longmanLink");
  if(longmanLink){
    longmanLink.href=makeLongmanUrl(currentWord);
    longmanLink.textContent=`Longman：${currentWord}`;
    longmanLink.classList.add("active","longmanActive");
  }

  const etymologyLink=$("etymologyLink");
  if(etymologyLink){
    etymologyLink.href=makeEtymonlineUrl(currentWord);
    etymologyLink.textContent=`Etymonline：${currentWord}`;
    etymologyLink.classList.add("active","etymologyActive");
  }
  if(data.error){setStatus(data.error,true);}else{addToSessionTrail(currentWord);}
  setSourceMode("cambridge");
  renderEntries(data.entries||[], "cambridge");
  renderChips("synonyms",data.synonyms||[]);
  renderChips("antonyms",data.antonyms||[]);
  renderChips("related",data.related||[]);
  loadLists();
}

async function lookup(word,force=false,scrollTop=false){
  const q=(word||$("wordInput").value||"").trim();
  if(!q)return setStatus("請輸入英文單字。",true);
  $("wordInput").value=q;
  if(scrollTop) scrollToTopArea();
  try{
    const res=await fetch(`/api/lookup?word=${encodeURIComponent(q)}&force=${force?"1":"0"}`);
    const data=await res.json();
    renderResult(data);
    if(!data.error){ rememberHistory(data.word||q); loadLists(); }
    if(scrollTop) setTimeout(scrollToTopArea, 60);
  }catch(err){setStatus(`查詢失敗：${err}`,true);}
}
const STORAGE_HISTORY="vocabExplorer.history.session.v2";
const LEGACY_STORAGE_HISTORY="vocabExplorer.history.v1";
const STORAGE_FAVORITES="vocabExplorer.favorites.v1";

function readSession(key){try{return JSON.parse(sessionStorage.getItem(key)||"[]")}catch(e){return []}}
function writeSession(key,value){sessionStorage.setItem(key,JSON.stringify(value));}
function readLocal(key){try{return JSON.parse(localStorage.getItem(key)||"[]")}catch(e){return []}}
function writeLocal(key,value){localStorage.setItem(key,JSON.stringify(value));}

// 2.4 migration: old Cloudflare builds stored query history permanently.
// Remove only that legacy history; favorites remain persistent in localStorage.
try{localStorage.removeItem(LEGACY_STORAGE_HISTORY);}catch(e){}

function rememberHistory(word){
  const w=String(word||"").trim(); if(!w)return;
  let list=readSession(STORAGE_HISTORY).filter(x=>String(x).toLowerCase()!==w.toLowerCase());
  list.unshift(w); writeSession(STORAGE_HISTORY,list.slice(0,80));
}
async function loadLists(){
  const h=readSession(STORAGE_HISTORY), f=readLocal(STORAGE_FAVORITES);
  $("history").innerHTML=""; h.forEach(w=>$("history").appendChild(chip(w)));
  if(!h.length) $("history").innerHTML='<span class="empty">目前沒有資料</span>';
  $("favorites").innerHTML=""; f.forEach(w=>$("favorites").appendChild(chip(w)));
  if(!f.length) $("favorites").innerHTML='<span class="empty">目前沒有資料</span>';
}
async function addFavorite(){
  if(!currentWord)return; let f=readLocal(STORAGE_FAVORITES);
  if(!f.some(w=>String(w).toLowerCase()===currentWord.toLowerCase())) f.unshift(currentWord);
  writeLocal(STORAGE_FAVORITES,f); loadLists();
}
async function clearHistory(){writeSession(STORAGE_HISTORY,[]);loadLists();}
async function exportFavorites(){
  const data=readLocal(STORAGE_FAVORITES).map(word=>({word}));
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="vocabulary-favorites.json";a.click();URL.revokeObjectURL(url);
}
$("searchBtn").onclick=()=>lookup();
$("refreshBtn").onclick=()=>lookup($("wordInput").value,true);
$("favBtn").onclick=addFavorite;
$("exportBtn").onclick=exportFavorites;
$("clearHistoryBtn").onclick=clearHistory;
if($("cambridgeViewBtn")) $("cambridgeViewBtn").onclick=renderCambridgeView;
if($("longmanViewBtn")) $("longmanViewBtn").onclick=()=>renderLongmanView(false);
if($("etymologyViewBtn")) $("etymologyViewBtn").onclick=()=>renderEtymologyView(false);
$("wordInput").addEventListener("keydown",e=>{if(e.key==="Enter")lookup();});
if("speechSynthesis" in window){ window.speechSynthesis.getVoices(); }
renderSessionTrail();
loadLists();
