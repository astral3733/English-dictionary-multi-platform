const CAMBRIDGE_BASE = "https://dictionary.cambridge.org";
const LONGMAN_BASE = "https://www.ldoceonline.com";
const ETYMONLINE_BASE = "https://www.etymonline.com";
const CACHE_SCHEMA_VERSION = 14;

const UPSTREAM_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; VocabularyExplorer/2.6; +https://workers.dev)",
  "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
  "Accept": "text/html,application/xhtml+xml"
};

function json(payload, status=200){
  return new Response(JSON.stringify(payload), {status, headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}
function normalizeWord(v){return String(v||"").toLowerCase().replace(/[^a-z0-9 '\-]/g,"").trim();}
function slug(v){return normalizeWord(v).replace(/\s+/g,"-");}
function decodeEntities(s){
  return String(s||"")
    .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function textOnly(s){
  return decodeEntities(String(s||"").replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<br\s*\/?>/gi,"\n").replace(/<[^>]+>/g," "))
    .replace(/\u00a0/g," ").replace(/\s+/g," ").replace(/\s*([，、。；：！？）】』」》〉])\s*/g,"$1").replace(/\s*([（【『「《〈])\s*/g,"$1").trim();
}
function uniq(a){const seen=new Set(); return a.filter(x=>{x=textOnly(x); const k=x.toLowerCase(); if(!x||seen.has(k)) return false; seen.add(k); return true;});}
function classList(tag){const m=tag.match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/i); return m?m[2].split(/\s+/).filter(Boolean).map(x=>x.toLowerCase()):[];}
function hasToken(tag,tokens){const c=new Set(classList(tag)); return tokens.some(t=>c.has(t.toLowerCase()));}
function balancedBlocks(src, tag, tokens, limit=100){
  const out=[]; const re=new RegExp(`<${tag}\\b[^>]*>`,`ig`); let m;
  while((m=re.exec(src)) && out.length<limit){
    if(!hasToken(m[0],tokens)) continue;
    const start=m.index; const scan=new RegExp(`<\\/?${tag}\\b[^>]*>`,`ig`); scan.lastIndex=start; let depth=0, q;
    while((q=scan.exec(src))){ const closing=/^<\//.test(q[0]); if(closing) depth--; else if(!/\/>$/.test(q[0])) depth++; if(depth===0){out.push(src.slice(start,scan.lastIndex)); re.lastIndex=scan.lastIndex; break;} }
  }
  return out;
}
function textsByClass(src, tag, tokens, limit=100){return balancedBlocks(src,tag,tokens,limit).map(textOnly).filter(Boolean);}
function bestText(values, requireCjk=false){
  const arr=values.filter(v=>v && (!requireCjk || /[\u3400-\u9fff]/.test(v)));
  if(!arr.length) return "";
  const score=v=>[(v.match(/[\u3400-\u9fff]/g)||[]).length,v.length];
  return arr.sort((a,b)=>{const A=score(a),B=score(b); return B[0]-A[0] || B[1]-A[1];})[0];
}
function removeBlocksByClass(src,tag,tokens){let out=src; for(const b of balancedBlocks(src,tag,tokens,100)) out=out.replace(b," "); return out;}
function makeCambridgeUrl(word){return `${CAMBRIDGE_BASE}/dictionary/english-chinese-traditional/${encodeURIComponent(normalizeWord(word))}`;}
function makeThesaurusUrl(word){return `${CAMBRIDGE_BASE}/thesaurus/${encodeURIComponent(normalizeWord(word))}`;}
function makeLongmanUrl(word){return `${LONGMAN_BASE}/dictionary/${encodeURIComponent(slug(word))}`;}
function makeEtymonlineUrl(word){return `${ETYMONLINE_BASE}/word/${encodeURIComponent(slug(word))}`;}
async function fetchHtml(url){
  const u=new URL(url); // Always absolute; prevents Safari/Worker URL-pattern SyntaxError.
  const r=await fetch(u.toString(),{headers:UPSTREAM_HEADERS,redirect:"follow"});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}
function normalizeCambridgeAudioUrl(src){
  let value=decodeEntities(String(src||"")).trim().replace(/\\\//g,"/");
  if(!value) return "";
  // Cambridge sometimes embeds escaped query separators or protocol-relative paths.
  value=value.replace(/\\u0026/gi,"&");
  try{
    const u=new URL(value,CAMBRIDGE_BASE);
    if(!/^https?:$/.test(u.protocol)) return "";
    return u.toString();
  }catch(_){return "";}
}
function findAudioSources(source){
  const found=[];
  const add=(raw)=>{
    const url=normalizeCambridgeAudioUrl(raw);
    if(url && !found.includes(url)) found.push(url);
  };
  const patterns=[
    /<source[^>]+src=["']([^"']+\.(?:mp3|ogg)[^"']*)["']/ig,
    /<audio[^>]+src=["']([^"']+\.(?:mp3|ogg)[^"']*)["']/ig,
    /data-src-mp3=["']([^"']+\.mp3[^"']*)["']/ig,
    /data-src-ogg=["']([^"']+\.ogg[^"']*)["']/ig,
    /audioUrl["']?\s*[:=]\s*["']([^"']+\.(?:mp3|ogg)[^"']*)["']/ig,
    /["']([^"']*\/(?:uk_pron|us_pron)\/[^"']+\.(?:mp3|ogg)[^"']*)["']/ig,
    /((?:https?:)?\/\/dictionary\.cambridge\.org\/media\/english\/(?:uk_pron|us_pron)\/[^\s"'<>]+\.(?:mp3|ogg)(?:\?[^\s"'<>]*)?)/ig,
    /(\/media\/english\/(?:uk_pron|us_pron)\/[^\s"'<>]+\.(?:mp3|ogg)(?:\?[^\s"'<>]*)?)/ig,
    /(\\\/media\\\/english\\\/(?:uk_pron|us_pron)\\\/[^\s"'<>]+?\.(?:mp3|ogg)(?:\\?[^\s"'<>]*)?)/ig
  ];
  for(const re of patterns){
    let m;
    while((m=re.exec(source))){add(m[1]);}
  }
  return found;
}
function normalizeLongmanAudioUrl(src){
  let value=decodeEntities(String(src||"")).trim().replace(/\\\//g,"/");
  if(!value) return "";
  value=value.replace(/\\u0026/gi,"&");
  try{
    const u=new URL(value,LONGMAN_BASE);
    if(u.protocol!=="https:") return "";
    if(!/^(?:www\.)?ldoceonline\.com$/i.test(u.hostname)) return "";
    if(!u.pathname.startsWith("/media/english/")) return "";
    return u.toString();
  }catch(_){return "";}
}
function attrValue(tag,name){
  const rx=new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,`i`);
  const m=String(tag||"").match(rx);
  return m?m[2]:"";
}
function longmanPronunciation(page){
  const uk=[], us=[];
  const add=(bucket,raw)=>{
    const url=normalizeLongmanAudioUrl(raw);
    if(url && !bucket.includes(url)) bucket.push(url);
  };

  // Current LDOCE pages mark headword recordings with speaker+brefile / speaker+amefile.
  const tagRe=/<(?:span|a)\b[^>]*>/ig;
  let m;
  while((m=tagRe.exec(page))){
    const tag=m[0];
    const classes=new Set(classList(tag));
    const raw=attrValue(tag,"data-src-mp3") || attrValue(tag,"src") || attrValue(tag,"href");
    if(classes.has("brefile")) add(uk,raw);
    if(classes.has("amefile")) add(us,raw);
  }

  // Fallback for markup variants where class parsing is incomplete.
  const fallbackPatterns=[
    [/data-src-mp3=["']([^"']*\/breProns\/[^"']+\.mp3[^"']*)["']/ig,uk],
    [/data-src-mp3=["']([^"']*\/ameProns\/[^"']+\.mp3[^"']*)["']/ig,us],
    [/((?:https?:)?\/\/(?:www\.)?ldoceonline\.com\/media\/english\/breProns\/[^\s"'<>]+\.mp3(?:\?[^\s"'<>]*)?)/ig,uk],
    [/((?:https?:)?\/\/(?:www\.)?ldoceonline\.com\/media\/english\/ameProns\/[^\s"'<>]+\.mp3(?:\?[^\s"'<>]*)?)/ig,us],
    [/(\/media\/english\/breProns\/[^\s"'<>]+\.mp3(?:\?[^\s"'<>]*)?)/ig,uk],
    [/(\/media\/english\/ameProns\/[^\s"'<>]+\.mp3(?:\?[^\s"'<>]*)?)/ig,us]
  ];
  for(const [re,bucket] of fallbackPatterns){
    let x;
    while((x=re.exec(page))) add(bucket,x[1]);
  }
  return {uk_audio:uk[0]||"",us_audio:us[0]||""};
}

function firstRegexText(patterns, source){
  for(const re of patterns){
    const m=source.match(re);
    if(m && m[1]){
      const value=textOnly(m[1]);
      if(value) return value;
    }
  }
  return "";
}
function preferAudioSource(sources, region){
  const regionRx=new RegExp(`/${region}_pron/`,`i`);
  const regionSources=sources.filter(x=>regionRx.test(x)||new RegExp(`${region}_pron`,`i`).test(x));
  const pool=regionSources.length?regionSources:sources;
  return pool.find(x=>/\.mp3(?:$|[?#])/i.test(x))
    ||pool.find(x=>/\.ogg(?:$|[?#])/i.test(x))
    ||pool[0]
    ||"";
}
function nearbyRegionAudio(page,region){
  const regionRx=region==="uk"
    ? /(?:\bUK\b|class=["'][^"']*\buk\b[^"']*["'])/ig
    : /(?:\bUS\b|class=["'][^"']*\bus\b[^"']*["'])/ig;
  let m;
  while((m=regionRx.exec(page))){
    const begin=Math.max(0,m.index-600);
    const block=page.slice(begin,Math.min(page.length,m.index+6500));
    const sources=findAudioSources(block);
    const preferred=preferAudioSource(sources,region);
    if(preferred) return preferred;
  }
  return "";
}
function pronunciation(page){
  const uk_ipa=firstRegexText([
    /class=["'][^"']*uk[^"']*["'][\s\S]{0,3500}?class=["'][^"']*ipa[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    /<span[^>]+class=["'][^"']*ipa[^"']*["'][^>]*>(\/[^<]+\/)<\/span>[\s\S]{0,1200}?<span[^>]+class=["'][^"']*region[^"']*["'][^>]*>\s*UK\s*<\/span>/i
  ],page);
  const us_ipa=firstRegexText([
    /class=["'][^"']*us[^"']*["'][\s\S]{0,3500}?class=["'][^"']*ipa[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    /<span[^>]+class=["'][^"']*ipa[^"']*["'][^>]*>(\/[^<]+\/)<\/span>[\s\S]{0,1200}?<span[^>]+class=["'][^"']*region[^"']*["'][^>]*>\s*US\s*<\/span>/i
  ],page);
  const sources=findAudioSources(page);
  let uk_audio=preferAudioSource(sources,"uk");
  let us_audio=preferAudioSource(sources,"us");
  if(!uk_audio) uk_audio=nearbyRegionAudio(page,"uk");
  if(!us_audio) us_audio=nearbyRegionAudio(page,"us");
  return {uk_ipa,us_ipa,uk_audio,us_audio};
}

function parseCambridge(page,word){
  const q=normalizeWord(word); const pr=pronunciation(page);
  let entries=balancedBlocks(page,"div",["entry-body__el"],20);
  if(entries.length){const exact=entries.filter(e=>textsByClass(e,"span",["hw","dhw"],10).some(h=>normalizeWord(h)===q)); if(exact.length) entries=exact; else entries=entries.slice(0,1);} else entries=[page];
  const parsed=[];
  for(const entry of entries.slice(0,8)){
    const pos=bestText(textsByClass(entry,"span",["pos","dpos"],20));
    const senseBlocks=balancedBlocks(entry,"div",["def-block","ddef_block"],20);
    const senses=[];
    for(const block of senseBlocks.slice(0,14)){
      const noExamples=removeBlocksByClass(removeBlocksByClass(block,"div",["examp"]),"div",["dexamp"]);
      const definition=bestText([...textsByClass(noExamples,"div",["def","ddef","ddef_d"],20),...textsByClass(noExamples,"span",["def","ddef","ddef_d"],20)]);
      const translation=bestText(textsByClass(noExamples,"span",["trans","dtrans"],30),true);
      const examples=[];
      const exBlocks=[...balancedBlocks(block,"div",["examp"],10),...balancedBlocks(block,"div",["dexamp"],10)];
      for(const ex of exBlocks.slice(0,4)){
        const en=bestText(textsByClass(ex,"span",["eg","deg"],10));
        const zh=bestText(textsByClass(ex,"span",["trans","dtrans"],10),true);
        if(en||zh) examples.push({en,zh});
      }
      if(definition||translation||examples.length) senses.push({definition_en:definition,translation_zh:translation,examples});
    }
    if(pos||senses.length) parsed.push({part_of_speech:pos,senses});
  }
  const related=[]; const ar=/<a\b([^>]*)>([\s\S]*?)<\/a>/ig; let a;
  while((a=ar.exec(page))){const hm=a[1].match(/href\s*=\s*(["'])(.*?)\1/i); if(!hm||!hm[2].includes("/dictionary/english-chinese-traditional/")) continue; const t=textOnly(a[2]); if(/^[A-Za-z][A-Za-z '\-]{1,35}$/.test(t)&&normalizeWord(t)!==q) related.push(t);}
  return {word:q,headword:q,source_url:makeCambridgeUrl(q),...pr,entries:parsed,synonyms:[],antonyms:[],related:uniq(related).slice(0,24),error:parsed.length?"":"Cambridge 有回應，但沒有解析到詞義。",cache_schema_version:CACHE_SCHEMA_VERSION};
}
function parseThesaurus(page,word){
  const syn=[],ant=[]; const re=/<a\b([^>]*)>([\s\S]*?)<\/a>/ig; let m; const q=normalizeWord(word);
  while((m=re.exec(page))){const hm=m[1].match(/href\s*=\s*(["'])(.*?)\1/i); if(!hm) continue; const href=decodeEntities(hm[2]); if(!/\/thesaurus\//i.test(href)) continue; const w=textOnly(m[2]); if(!/^[A-Za-z][A-Za-z '\-]{1,39}$/.test(w)||normalizeWord(w)===q) continue; if(/opposite|antonym|\/opposites\//i.test(href)) ant.push(w); else syn.push(w);}
  return {synonyms:uniq(syn).slice(0,30),antonyms:uniq(ant).slice(0,30)};
}
function parseLongman(page,word){
  const q=normalizeWord(word); const pr=longmanPronunciation(page); let entries=balancedBlocks(page,"span",["entry"],10); if(!entries.length) entries=balancedBlocks(page,"div",["entry"],10); if(!entries.length) entries=[page];
  const out=[];
  for(const entry of entries.slice(0,6)){
    const pos=bestText(textsByClass(entry,"span",["pos"],20))||"Longman";
    let defs=textsByClass(entry,"span",["def"],50).map(x=>x.replace(/\b(Examples from the Corpus|Register|Grammar|Collocations?)\b/gi,"").trim());
    defs=uniq(defs).slice(0,16); const examples=uniq(textsByClass(entry,"span",["example","examples"],50)).slice(0,32);
    const senses=defs.map((d,i)=>({definition_en:d,translation_zh:"",examples:examples.slice(i*2,i*2+2).map(en=>({en,zh:""}))}));
    if(senses.length) out.push({part_of_speech:pos,senses});
  }
  return {word:q,headword:q,source:"longman",source_url:makeLongmanUrl(q),...pr,entries:out,error:out.length?"":"Longman 有回應，但沒有解析到英英解釋。",cache_schema_version:CACHE_SCHEMA_VERSION};
}
function parseEtymology(page,word){
  const q=normalizeWord(word); let text=page.replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<\/?(?:h1|h2|h3|p|li|blockquote|div|section|article|main|br)\b[^>]*>/gi,"\n").replace(/<[^>]+>/g," ");
  const lines=decodeEntities(text).split(/\n+/).map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
  const startRx=new RegExp(`(?:origin and history of|etymology of)\\s+${q.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}`,"i"); let start=Math.max(0,lines.findIndex(x=>startRx.test(x))+1); if(start===0) start=0;
  let stop=lines.length; for(let i=start;i<lines.length;i++){if(/^(entries linking to|more to explore|share|trending|dictionary entries near|see all related words)\b/i.test(lines[i])){stop=i;break;}}
  const content=lines.slice(start,stop).filter(x=>!/^(advertisement|remove ads|log in|search|copy|cite|close)$/i.test(x)); const sections=[]; let cur=null;
  for(const line of content){if(/^also from /i.test(line)) continue; if(/^[A-Za-z][A-Za-z0-9 '\-]*\([A-Za-z.]+\)$/.test(line)){cur={title:line,paragraphs:[]};sections.push(cur);continue;} if(!cur){cur={title:q,paragraphs:[]};sections.push(cur);} if(line.length>=18&&cur.paragraphs.length<4) cur.paragraphs.push(line); if(sections.length>=4&&sections[3].paragraphs.length>=4) break;}
  const cleaned=sections.filter(s=>s.paragraphs.length).slice(0,4); return {word:q,headword:q,source:"etymonline",source_url:makeEtymonlineUrl(q),sections:cleaned,error:cleaned.length?"":"Etymonline 有回應，但沒有解析到乾淨字源正文。",cache_schema_version:CACHE_SCHEMA_VERSION};
}
function parseSingleByteRange(rangeHeader,totalLength){
  if(!rangeHeader || !Number.isFinite(totalLength) || totalLength<=0) return null;
  const m=String(rangeHeader).match(/^bytes=(\d*)-(\d*)$/i);
  if(!m) return null;
  let start=m[1]?Number(m[1]):null;
  let end=m[2]?Number(m[2]):null;
  if(start===null){
    const suffix=end;
    if(!Number.isFinite(suffix) || suffix<=0) return null;
    start=Math.max(0,totalLength-suffix);
    end=totalLength-1;
  }else{
    if(!Number.isFinite(start) || start<0 || start>=totalLength) return null;
    if(end===null || !Number.isFinite(end) || end>=totalLength) end=totalLength-1;
    if(end<start) return null;
  }
  return {start,end};
}
function audioContentType(upstream,url){
  const type=upstream.headers.get("content-type");
  if(type && /^audio\//i.test(type)) return type;
  if(/\.ogg(?:$|[?#])/i.test(url)) return "audio/ogg";
  return "audio/mpeg";
}
async function proxyDictionaryAudio(request){
  const requestUrl=new URL(request.url);
  const src=requestUrl.searchParams.get("src")||"";
  let audioUrl;
  try{audioUrl=new URL(src);}catch(_){return new Response("Invalid audio URL",{status:400});}
  const isCambridge=audioUrl.protocol==="https:" && audioUrl.hostname==="dictionary.cambridge.org" && audioUrl.pathname.startsWith("/media/english/");
  const isLongman=audioUrl.protocol==="https:" && /^(?:www\.)?ldoceonline\.com$/i.test(audioUrl.hostname) && audioUrl.pathname.startsWith("/media/english/");
  if(!isCambridge && !isLongman){
    return new Response("Audio source is not allowed",{status:403});
  }

  const incomingRange=request.headers.get("range");
  const upstreamHeaders={
    "User-Agent":UPSTREAM_HEADERS["User-Agent"],
    "Accept":"audio/mpeg,audio/ogg,audio/*;q=0.9,*/*;q=0.1",
    "Referer":isLongman?"https://www.ldoceonline.com/":"https://dictionary.cambridge.org/"
  };
  if(incomingRange) upstreamHeaders["Range"]=incomingRange;

  const upstream=await fetch(audioUrl.toString(),{
    method:request.method==="HEAD"?"HEAD":"GET",
    headers:upstreamHeaders,
    redirect:"follow"
  });
  if(upstream.status!==200 && upstream.status!==206){
    return new Response(`Audio upstream HTTP ${upstream.status}`,{status:502});
  }

  const commonHeaders=new Headers();
  commonHeaders.set("content-type",audioContentType(upstream,audioUrl.toString()));
  commonHeaders.set("cache-control","public, max-age=86400");
  commonHeaders.set("accept-ranges","bytes");
  for(const name of ["etag","last-modified"]){
    const value=upstream.headers.get(name); if(value) commonHeaders.set(name,value);
  }

  // Best path: Cambridge honored Safari/Chrome's Range request. Preserve 206 metadata.
  if(upstream.status===206){
    for(const name of ["content-range","content-length"]){
      const value=upstream.headers.get(name); if(value) commonHeaders.set(name,value);
    }
    return new Response(request.method==="HEAD"?null:upstream.body,{status:206,headers:commonHeaders});
  }

  // Some origins ignore Range and return 200. Synthesize a standards-compliant 206
  // so iOS/iPadOS Safari, Android Chrome and desktop media stacks all behave consistently.
  if(incomingRange && request.method!=="HEAD"){
    const full=await upstream.arrayBuffer();
    const total=full.byteLength;
    const range=parseSingleByteRange(incomingRange,total);
    if(!range){
      const h=new Headers(commonHeaders); h.set("content-range",`bytes */${total}`);
      return new Response(null,{status:416,headers:h});
    }
    const slice=full.slice(range.start,range.end+1);
    const h=new Headers(commonHeaders);
    h.set("content-range",`bytes ${range.start}-${range.end}/${total}`);
    h.set("content-length",String(slice.byteLength));
    return new Response(slice,{status:206,headers:h});
  }

  const len=upstream.headers.get("content-length"); if(len) commonHeaders.set("content-length",len);
  return new Response(request.method==="HEAD"?null:upstream.body,{status:200,headers:commonHeaders});
}
async function handleApi(request){
  const url=new URL(request.url);
  if(url.pathname==="/api/audio"){
    try{return await proxyDictionaryAudio(request);}catch(e){return new Response(`Audio proxy failed: ${e?.message||String(e)}`,{status:502});}
  }
  const word=normalizeWord(url.searchParams.get("word")||"");
  if(!word) return json({error:"請輸入英文單字。"},400);
  try{
    if(url.pathname==="/api/lookup"){
      const [dict,th]=await Promise.all([fetchHtml(makeCambridgeUrl(word)),fetchHtml(makeThesaurusUrl(word)).catch(()=>"")]);
      const data=parseCambridge(dict,word); if(th){const t=parseThesaurus(th,word); data.synonyms=t.synonyms; data.antonyms=t.antonyms;} return json(data);
    }
    if(url.pathname==="/api/longman") return json(parseLongman(await fetchHtml(makeLongmanUrl(word)),word));
    if(url.pathname==="/api/etymology") return json(parseEtymology(await fetchHtml(makeEtymonlineUrl(word)),word));
    return json({error:"Unknown API"},404);
  }catch(e){return json({word,error:`查詢來源失敗：${e?.message||String(e)}`},502);}
}

export default {async fetch(request,env){const url=new URL(request.url); if(url.pathname.startsWith("/api/")) return handleApi(request); return env.ASSETS.fetch(request);}};
