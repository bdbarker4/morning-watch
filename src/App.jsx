import { useState, useRef, useEffect, useCallback } from "react";

const SECTIONS = [
  { key: "local",         label: "ST. PETE / TAMPA BAY",      icon: "⚓", query: "St. Petersburg Tampa Bay Florida local news today" },
  { key: "national",      label: "NATIONAL",                  icon: "🇺🇸", query: "US national news headlines today" },
  { key: "international", label: "INTERNATIONAL",             icon: "🌐", query: "international world news headlines today" },
  { key: "listings",      label: "YACHT LISTINGS & PRICES",   icon: "⛵", query: "new yacht listings price changes brokerage market 2025" },
  { key: "manufacturers", label: "MANUFACTURERS & BUILDERS",  icon: "🔧", query: "yacht boat manufacturer builder news 2025" },
  { key: "boatyard",      label: "BOATYARD & SERVICE",        icon: "🛥️", query: "boatyard marine service industry news 2025" },
  { key: "ai",            label: "ARTIFICIAL INTELLIGENCE",   icon: "🤖", query: "AI artificial intelligence new capabilities model releases announcements today 2025 Anthropic OpenAI Google xAI Mistral" },
  { key: "wildcard",      label: "WILD CARD",                 icon: "🎲", query: "surprising unexpected interesting news stories today unrelated to politics — science discovery, human interest, business innovation, unusual events" },
  { key: "health",        label: "HEALTH & WELLNESS",          icon: "🩺", query: "men's health news 2025 — hip arthritis treatment relief, lower back pain pinched nerve sciatic management, sleep disorders insomnia older men, anti-inflammatory research, physical therapy advances, pain management non-opioid, supplements joint health, exercise for joint pain" },
];

// ── WEATHER ──────────────────────────────────────────────
const WEATHER_API =
  "https://api.open-meteo.com/v1/forecast?latitude=27.7676&longitude=-82.6403" +
  "&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,relative_humidity_2m" +
  "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,weather_code" +
  "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=5";
const WIND_DIR = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
const windDir  = deg => WIND_DIR[Math.round(deg / 22.5) % 16];
const WX_CODE  = { 0:"Clear",1:"Mostly Clear",2:"Partly Cloudy",3:"Overcast",45:"Foggy",48:"Icy Fog",51:"Light Drizzle",53:"Drizzle",55:"Heavy Drizzle",61:"Light Rain",63:"Rain",65:"Heavy Rain",80:"Rain Showers",81:"Showers",82:"Heavy Showers",95:"Thunderstorm" };
const wxLabel  = c => WX_CODE[c] || "Unknown";
const wxEmoji  = c => { if(c===0)return"☀️";if(c<=2)return"⛅";if(c===3)return"☁️";if(c<=48)return"🌫️";if(c<=67)return"🌧️";if(c<=77)return"🌨️";if(c<=82)return"🌦️";return"⛈️"; };
const beaufort = s => { if(s<1)return{n:0,label:"Calm"};if(s<4)return{n:1,label:"Light Air"};if(s<8)return{n:2,label:"Light Breeze"};if(s<13)return{n:3,label:"Gentle Breeze"};if(s<19)return{n:4,label:"Moderate Breeze"};if(s<25)return{n:5,label:"Fresh Breeze"};if(s<32)return{n:6,label:"Strong Breeze"};if(s<39)return{n:7,label:"Near Gale"};return{n:8,label:"Gale"}; };

// ── API HELPERS ───────────────────────────────────────────
const TODAY = new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
const sleep  = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, maxAttempts=3) {
  let lastErr;
  for (let i=1; i<=maxAttempts; i++) {
    try { return await fn(); }
    catch(e) {
      lastErr = e;
      const retry = /internal|overload|timeout|500|529/i.test(e.message||"");
      if (!retry || i===maxAttempts) throw e;
      await sleep(i*2000);
    }
  }
  throw lastErr;
}

async function callClaude(body, apiKey) {
  if (!apiKey) throw new Error("No API key — enter your Anthropic key above.");
  const res  = await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey},body:JSON.stringify(body)});
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message||JSON.stringify(data.error));
  return data;
}

async function searchNews(query, apiKey, count="3-4") {
  return withRetry(async () => {
    const data = await callClaude({
      model:"claude-sonnet-4-20250514", max_tokens:1500,
      tools:[{type:"web_search_20250305",name:"web_search"}],
      messages:[{role:"user",content:`Today is ${TODAY}. Search the web and find ${count} important recent news stories about: ${query}.\n\nFor each story provide: headline, 1-2 sentence factual summary, source name, source type (wire/independent/trade/single-outlet/pr), and a video URL if one exists.\n\nSKEPTICISM RULES:\n- Flag PR content and unverified single-source claims.\n- FRESHNESS CHECK: If a story is written in future tense about an event that has clearly already occurred given today\'s date, label it STALE PREVIEW and note the original publish date if known. Include it but flag it visibly so the reader knows it is outdated.\n- Prefer recap or results coverage over preview coverage when both exist for the same event.\n- For health topics: reader is a 62-year-old active male with hip arthritis, lower back pinched nerve, and sleep difficulties. Prioritize evidence-based findings. Flag supplement marketing or non-peer-reviewed claims.\n\nWrite as plain prose. Be skeptical.`}]
    }, apiKey);
    const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n").trim();
    if (!text) throw new Error("Empty search response");
    return text;
  });
}

async function formatToJSON(prose, label, apiKey) {
  return withRetry(async () => {
    const data = await callClaude({
      model:"claude-sonnet-4-20250514", max_tokens:1200,
      system:"You are a JSON formatter. Output ONLY a raw JSON object. No markdown, no backticks, no explanation. Start with { end with }.",
      messages:[{role:"user",content:`Convert to JSON: {"stories":[{"headline":"...","summary":"...","source":"...","sourceType":"wire|independent|trade|single-outlet|pr","videoUrl":"https://... or null","videoLabel":"label or null"}]}\n\nRules: sourceType one of wire/independent/trade/single-outlet/pr/stale-preview. videoUrl null if not found. Summaries under 50 words.\n\n${prose}`}]
    }, apiKey);
    const text  = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start===-1||end<=start) throw new Error("No JSON in response");
    const parsed = JSON.parse(text.slice(start,end+1));
    if (!Array.isArray(parsed.stories)) throw new Error("Missing stories array");
    return parsed.stories;
  });
}

async function deepDiveStory(headline, summary, sectionLabel, apiKey) {
  return withRetry(async () => {
    const data = await callClaude({
      model:"claude-sonnet-4-20250514", max_tokens:2000,
      tools:[{type:"web_search_20250305",name:"web_search"}],
      messages:[{role:"user",content:`Today is ${TODAY}. I need a deep-dive briefing on this news story from the "${sectionLabel}" section:\n\nHeadline: ${headline}\nSummary: ${summary}\n\nPlease search for more information and provide:\n1. BACKGROUND: 2-3 sentences of context — why does this matter, what led to it?\n2. KEY DETAILS: The most important specific facts, figures, names, dates\n3. OTHER ANGLES: What are 2-3 different perspectives or angles on this story?\n4. RELATED STORIES: 2-3 other recent stories connected to this topic\n5. WHAT TO WATCH: What should we expect next? Any upcoming dates or decisions?\n\nBe factual and skeptical. Flag anything unverified. Note source quality.`}]
    }, apiKey);
    const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n").trim();
    if (!text) throw new Error("Empty deep dive response");
    return text;
  });
}

// ── STYLE CONSTANTS ───────────────────────────────────────
const ACCENT = {
  news:   {color:"#1a5276",alpha:"rgba(26,82,118,"},
  marine: {color:"#8b6914",alpha:"rgba(139,105,20,"},
  ai:     {color:"#0277a8",alpha:"rgba(2,119,168,"},
  wild:   {color:"#7b2fa0",alpha:"rgba(123,47,160,"},
  health: {color:"#1a7a2a",alpha:"rgba(26,122,42,"},
};
const SOURCE_BADGE = {
  "wire":          {label:"WIRE",          bg:"#dff5df",color:"#1a6a1a"},
  "independent":   {label:"INDEPENDENT",   bg:"#ddeef5",color:"#1a5a7a"},
  "trade":         {label:"TRADE PRESS",   bg:"#f5f0dd",color:"#6a6a1a"},
  "single-outlet": {label:"⚠ SINGLE SRC",  bg:"#f5e8dd",color:"#b06a1a"},
  "pr":            {label:"⚠ PR / PROMO",  bg:"#f5dddd",color:"#aa3333"},
  "stale-preview": {label:"⚠ STALE PREVIEW", bg:"#eeddf5",color:"#7a3aaa"},
};

function getAccent(key) {
  if (["listings","manufacturers","boatyard"].includes(key)) return ACCENT.marine;
  if (key==="ai")       return ACCENT.ai;
  if (key==="wildcard") return ACCENT.wild;
  if (key==="health")   return ACCENT.health;
  return ACCENT.news;
}

function SourceBadge({type}) {
  const b = SOURCE_BADGE[(type||"").toLowerCase()] || SOURCE_BADGE["independent"];
  return <span style={{display:"inline-block",padding:"2px 7px",borderRadius:"3px",fontSize:"9px",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"1px",fontWeight:"700",background:b.bg,color:b.color}}>{b.label}</span>;
}

// ── DEEP DIVE PANEL ───────────────────────────────────────
function DeepDivePanel({story, sectionLabel, onClose, apiKey}) {
  const [content,   setContent]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const load = async () => {
    setLoading(true); setError(null); setContent(null);
    try {
      const text = await deepDiveStory(story.headline, story.summary, sectionLabel, apiKey);
      setContent(text);
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const parseSection = (text, label) => {
    const re = new RegExp(`${label}[:\\s]+([\\s\\S]*?)(?=\\n[0-9A-Z]+[.:]|$)`, "i");
    const m  = text?.match(re);
    return m ? m[1].trim() : null;
  };

  return (
    <div style={{position:"fixed",top:0,right:0,width:"min(480px,95vw)",height:"100vh",background:"#f5f0e8",borderLeft:"2px solid rgba(2,119,168,0.3)",zIndex:1000,overflowY:"auto",display:"flex",flexDirection:"column",boxShadow:"-8px 0 40px rgba(0,0,0,0.15)"}}>
      <div style={{position:"sticky",top:0,background:"#f5f0e8",borderBottom:"1px solid rgba(2,119,168,0.2)",padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:10}}>
        <div>
          <div style={{fontSize:"9px",letterSpacing:"3px",color:"#0277a8",fontFamily:"'IBM Plex Mono',monospace",marginBottom:"4px"}}>DEEP DIVE · {sectionLabel}</div>
          <div style={{fontSize:"16px",fontWeight:"700",color:"#1a2a3a",lineHeight:1.35}}>{story.headline}</div>
        </div>
        <button onClick={onClose} style={{background:"rgba(2,119,168,0.08)",border:"1px solid rgba(2,119,168,0.25)",color:"#0277a8",borderRadius:"3px",padding:"6px 12px",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace",fontSize:"11px",flexShrink:0,marginLeft:"12px"}}>✕ CLOSE</button>
      </div>

      <div style={{padding:"20px",flex:1}}>
        <div style={{background:"rgba(26,82,118,0.04)",border:"1px solid rgba(26,82,118,0.1)",borderRadius:"4px",padding:"12px",marginBottom:"20px"}}>
          <div style={{fontSize:"14px",color:"#3a4a5a",lineHeight:1.75,marginBottom:"10px"}}>{story.summary}</div>
          <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
            <span style={{fontSize:"10px",color:"#6a7a8a",fontFamily:"'IBM Plex Mono',monospace"}}>SOURCE: {story.source}</span>
            <SourceBadge type={story.sourceType}/>
          </div>
          {story.videoUrl && (
            <a href={story.videoUrl} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:"6px",marginTop:"8px",fontSize:"11px",color:"#b06a1a",fontFamily:"'IBM Plex Mono',monospace",textDecoration:"none",border:"1px solid rgba(176,106,26,0.3)",borderRadius:"3px",padding:"3px 10px"}}>
              ▶ {story.videoLabel||"VIDEO REPORT"}
            </a>
          )}
        </div>

        {loading && (
          <div style={{textAlign:"center",padding:"40px 20px",color:"#5a6a7a",fontFamily:"'IBM Plex Mono',monospace",fontSize:"12px"}}>
            <div style={{fontSize:"24px",marginBottom:"12px",animation:"pulse 1s infinite"}}>⚡</div>
            Searching for deeper coverage…
          </div>
        )}
        {error && (
          <div style={{color:"#aa3333",fontFamily:"'IBM Plex Mono',monospace",fontSize:"12px",padding:"12px",border:"1px solid rgba(170,51,51,0.25)",borderRadius:"4px",background:"rgba(204,85,85,0.06)"}}>
            ⚠ {error} — <span style={{cursor:"pointer",textDecoration:"underline"}} onClick={load}>retry</span>
          </div>
        )}
        {content && (
          <div style={{fontSize:"15px",color:"#3a4a5a",lineHeight:1.9,whiteSpace:"pre-wrap"}}>
            {content}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────
export default function MorningBriefing() {
  const [sections,     setSections]     = useState({});
  const [loading,      setLoading]      = useState({});
  const [moreLoading,  setMoreLoading]  = useState({});
  const [status,       setStatus]       = useState({});
  const [errors,       setErrors]       = useState({});
  const [generatedAt,  setGeneratedAt]  = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSpeaking,   setIsSpeaking]   = useState(false);
  const [speakLine,    setSpeakLine]    = useState("");
  const [voiceName,    setVoiceName]    = useState("");
  const speakingRef = useRef(false);
  const voicesRef   = useRef([]);

  useEffect(() => {
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length) {
        voicesRef.current = v;
        const picked = pickBritishFemale(v);
        setVoiceName(picked ? picked.name : "Default voice");
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);
  const [weather,      setWeather]      = useState(null);
  const [wxLoading,    setWxLoading]    = useState(false);
  const [wxError,      setWxError]      = useState(null);
  const [panel,        setPanel]        = useState(null);
  const [apiKey,       setApiKey]       = useState(() => localStorage.getItem("mw_api_key") || "");
  const [showKey,      setShowKey]      = useState(false);

  const saveKey = (k) => { setApiKey(k); localStorage.setItem("mw_api_key", k); };

  const fetchSection = async (section) => {
    setLoading(prev=>({...prev,[section.key]:true}));
    setErrors(prev=>({...prev,[section.key]:null}));
    setStatus(prev=>({...prev,[section.key]:"Searching sources…"}));
    setSections(prev=>({...prev,[section.key]:undefined}));
    try {
      const prose   = await searchNews(section.query, apiKey);
      setStatus(prev=>({...prev,[section.key]:"Formatting…"}));
      const stories = await formatToJSON(prose, section.label, apiKey);
      setSections(prev=>({...prev,[section.key]:stories}));
    } catch(e) {
      setErrors(prev=>({...prev,[section.key]:e.message}));
      setSections(prev=>({...prev,[section.key]:[]}));
    } finally {
      setLoading(prev=>({...prev,[section.key]:false}));
      setStatus(prev=>({...prev,[section.key]:null}));
    }
  };

  const loadMore = async (section) => {
    setMoreLoading(prev=>({...prev,[section.key]:true}));
    try {
      const prose   = await searchNews(section.query + " additional recent stories different from main coverage", apiKey, "3");
      const stories = await formatToJSON(prose, section.label, apiKey);
      setSections(prev => {
        const existing = prev[section.key] || [];
        const existingHeads = new Set(existing.map(s=>s.headline.toLowerCase()));
        const fresh = stories.filter(s=>!existingHeads.has(s.headline.toLowerCase()));
        return {...prev, [section.key]: [...existing, ...fresh]};
      });
    } catch(e) { /* silently fail on more */ }
    setMoreLoading(prev=>({...prev,[section.key]:false}));
  };

  const fetchWeather = async () => {
    setWxLoading(true); setWxError(null);
    try {
      const res    = await fetch(WEATHER_API);
      if (!res.ok) throw new Error(`Weather API error ${res.status}`);
      const parsed = await res.json();
      if (!parsed.current || !parsed.daily) throw new Error("Incomplete weather data");
      setWeather(parsed);
    } catch(e) { setWxError(e.message || "Unable to load weather"); }
    setWxLoading(false);
  };

  const generateAll = async () => {
    stopSpeaking();
    setIsGenerating(true);
    setSections({}); setErrors({}); setStatus({});
    setGeneratedAt(null); setPanel(null);
    fetchWeather();
    for (let i=0; i<SECTIONS.length; i++) {
      if (i>0) await sleep(600);
      await fetchSection(SECTIONS[i]);
    }
    setGeneratedAt(new Date());
    setIsGenerating(false);
  };

  const pickBritishFemale = (voices) =>
    voices.find(v => v.name === "Google UK English Female") ||
    voices.find(v => v.lang === "en-GB" && v.name.toLowerCase().includes("female")) ||
    voices.find(v => v.lang === "en-GB") ||
    null;

  const keepAliveRef = useRef(null);

  const stopSpeaking = () => {
    speakingRef.current = false;
    window.speechSynthesis.cancel();
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
    setIsSpeaking(false);
    setSpeakLine("");
  };

  const readBriefing = () => {
    if (speakingRef.current) { stopSpeaking(); return; }

    const lines = [`Morning Watch. ${new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}.`];
    for (const s of SECTIONS) {
      const st = sections[s.key];
      if (!st?.length) continue;
      lines.push(s.label + ".");
      st.forEach((x,i) => lines.push(`Story ${i+1}. ${x.headline}. ${x.summary} Source: ${x.source}.`));
    }
    lines.push("End of Morning Watch.");

    window.speechSynthesis.cancel();
    speakingRef.current = true;
    setIsSpeaking(true);

    const voice = pickBritishFemale(voicesRef.current);
    let idx = 0;

    if (keepAliveRef.current) clearInterval(keepAliveRef.current);
    keepAliveRef.current = setInterval(() => {
      if (!speakingRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; return; }
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }, 10000);

    const next = () => {
      if (!speakingRef.current || idx >= lines.length) {
        speakingRef.current = false;
        if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
        setIsSpeaking(false);
        setSpeakLine("");
        return;
      }
      const u = new SpeechSynthesisUtterance(lines[idx]);
      u.rate  = 0.90;
      u.pitch = 1.05;
      if (voice) u.voice = voice;
      setSpeakLine(lines[idx]);
      u.onend   = () => { idx++; next(); };
      u.onerror = () => { idx++; next(); };
      window.speechSynthesis.speak(u);
    };
    next();
  };

  const anyLoaded = Object.values(sections).some(s=>Array.isArray(s)&&s.length>0);
  const dateStr   = new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  const DAYS      = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#f5f0e8 0%,#faf7f2 50%,#f0ece4 100%)",fontFamily:"'Segoe UI','Helvetica Neue',Arial,sans-serif",color:"#2c3e50",paddingBottom:"60px"}}>

      {panel && <DeepDivePanel story={panel.story} sectionLabel={panel.sectionLabel} onClose={()=>setPanel(null)} apiKey={apiKey}/>}
      {panel && <div onClick={()=>setPanel(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.2)",zIndex:999}}/>}

      {/* HEADER */}
      <div style={{borderBottom:"3px double #8b6914",padding:"28px 40px 20px",textAlign:"center",background:"rgba(255,255,255,0.5)"}}>
        <div style={{fontSize:"11px",letterSpacing:"4px",color:"#8b6914",marginBottom:"6px",fontFamily:"'IBM Plex Mono',monospace"}}>ST. PETERSBURG, FL</div>
        <h1 style={{fontSize:"clamp(28px,5vw,52px)",fontWeight:"900",letterSpacing:"2px",margin:"0",color:"#1a2a3a",lineHeight:1.1}}>⚓ MORNING WATCH</h1>
        <div style={{fontSize:"12px",letterSpacing:"3px",color:"#34607a",marginTop:"8px",fontFamily:"'IBM Plex Mono',monospace"}}>DAILY INTELLIGENCE BRIEFING</div>
        <div style={{display:"flex",justifyContent:"center",gap:"24px",marginTop:"14px",fontSize:"12px",color:"#5a6a7a",fontFamily:"'IBM Plex Mono',monospace",flexWrap:"wrap"}}>
          <span>📅 {dateStr}</span>
          {generatedAt&&<span>🕐 Generated {generatedAt.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}</span>}
        </div>
      </div>
      <div style={{height:"1px",background:"linear-gradient(90deg,transparent,#8b6914,transparent)"}}/>

      {/* LEGEND */}
      <div style={{display:"flex",justifyContent:"center",gap:"16px",padding:"12px 20px 4px",flexWrap:"wrap"}}>
        {[{label:"General News",color:"#1a5276"},{label:"Marine Industry",color:"#8b6914"},{label:"AI & Tech",color:"#0277a8"},{label:"Wild Card",color:"#7b2fa0"},{label:"Health",color:"#1a7a2a"}].map(t=>(
          <div key={t.label} style={{display:"flex",alignItems:"center",gap:"6px",fontSize:"10px",fontFamily:"'IBM Plex Mono',monospace",color:t.color,letterSpacing:"1px"}}>
            <div style={{width:"10px",height:"10px",background:t.color,borderRadius:"2px",opacity:0.7}}/>{t.label}
          </div>
        ))}
      </div>

      {/* WEATHER */}
      <div style={{maxWidth:"960px",margin:"0 auto",padding:"12px 20px 0"}}>
        {wxLoading&&<div style={{background:"rgba(26,82,118,0.04)",border:"1px solid rgba(26,82,118,0.15)",borderRadius:"4px",padding:"14px 20px",fontFamily:"'IBM Plex Mono',monospace",fontSize:"12px",color:"#5a6a7a",textAlign:"center",animation:"pulse 1s infinite"}}>⚡ Loading weather…</div>}
        {wxError&&<div style={{background:"rgba(204,85,85,0.06)",border:"1px solid rgba(204,85,85,0.2)",borderRadius:"4px",padding:"10px 20px",fontFamily:"'IBM Plex Mono',monospace",fontSize:"12px",color:"#aa3333"}}>⚠ {wxError} — <span style={{cursor:"pointer",textDecoration:"underline"}} onClick={fetchWeather}>retry</span></div>}
        {weather&&!wxLoading&&(()=>{
          const c=weather.current, d=weather.daily, bf=beaufort(c.wind_speed_10m);
          const condLabel = c.condition || wxLabel(c.weather_code);
          return (
            <div style={{background:"rgba(26,82,118,0.04)",border:"1px solid rgba(26,82,118,0.15)",borderRadius:"4px",overflow:"hidden",marginBottom:"4px"}}>
              <div style={{background:"rgba(26,82,118,0.06)",borderBottom:"1px solid rgba(26,82,118,0.12)",padding:"8px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:"11px",fontWeight:"700",letterSpacing:"3px",color:"#1a5276",fontFamily:"'IBM Plex Mono',monospace"}}>🌤 ST. PETE LOCAL WEATHER</span>
                <span style={{fontSize:"10px",color:"#5a6a7a",fontFamily:"'IBM Plex Mono',monospace",cursor:"pointer"}} onClick={fetchWeather}>↺ REFRESH</span>
              </div>
              <div style={{padding:"14px 18px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px"}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"10px"}}>
                    <span style={{fontSize:"36px"}}>{wxEmoji(c.weather_code)}</span>
                    <div>
                      <div style={{fontSize:"28px",fontWeight:"700",color:"#1a2a3a",lineHeight:1}}>{Math.round(c.temperature_2m)}°F</div>
                      <div style={{fontSize:"13px",color:"#3a4a5a",fontFamily:"'IBM Plex Mono',monospace"}}>{condLabel}</div>
                      <div style={{fontSize:"12px",color:"#4a5a6a",fontFamily:"'IBM Plex Mono',monospace"}}>Feels like {Math.round(c.apparent_temperature)}°F · Humidity {c.relative_humidity_2m}%</div>
                    </div>
                  </div>
                  <div style={{background:"rgba(139,105,20,0.06)",border:"1px solid rgba(139,105,20,0.15)",borderRadius:"4px",padding:"10px 12px"}}>
                    <div style={{fontSize:"10px",letterSpacing:"2px",color:"#8b6914",fontFamily:"'IBM Plex Mono',monospace",marginBottom:"6px"}}>WIND</div>
                    <div style={{display:"flex",alignItems:"baseline",gap:"8px"}}>
                      <span style={{fontSize:"22px",fontWeight:"700",color:"#1a2a3a"}}>{Math.round(c.wind_speed_10m)}</span>
                      <span style={{fontSize:"12px",color:"#4a5a6a",fontFamily:"'IBM Plex Mono',monospace"}}>mph {windDir(c.wind_direction_10m)}</span>
                    </div>
                    <div style={{fontSize:"12px",color:"#8b6914",fontFamily:"'IBM Plex Mono',monospace",marginTop:"4px"}}>Gusts {Math.round(c.wind_gusts_10m)} mph · Beaufort {bf.n} — {bf.label}</div>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:"10px",letterSpacing:"2px",color:"#1a5276",fontFamily:"'IBM Plex Mono',monospace",marginBottom:"8px"}}>5-DAY OUTLOOK</div>
                  {(d.time||[]).slice(0,5).map((ds,i)=>{
                    const dt=new Date(ds+"T12:00:00");
                    const dayCondition = (d.condition&&d.condition[i]) || wxLabel(d.weather_code[i]);
                    return (
                      <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:i<4?"1px solid rgba(0,0,0,0.06)":"none"}}>
                        <span style={{fontSize:"12px",fontFamily:"'IBM Plex Mono',monospace",color:i===0?"#8b6914":"#3a4a5a",width:"40px"}}>{i===0?"Today":DAYS[dt.getDay()]}</span>
                        <span style={{fontSize:"14px"}}>{wxEmoji(d.weather_code[i])}</span>
                        <span style={{fontSize:"12px",color:"#4a5a6a",fontFamily:"'IBM Plex Mono',monospace",width:"68px",textAlign:"center"}}>{Math.round(d.wind_speed_10m_max[i])}mph {windDir(d.wind_direction_10m_dominant[i])}</span>
                        <span style={{fontSize:"12px",fontFamily:"'IBM Plex Mono',monospace",color:"#2c3e50"}}>{Math.round(d.temperature_2m_max[i])}°<span style={{color:"#7a8a9a"}}>/{Math.round(d.temperature_2m_min[i])}°</span></span>
                        <span style={{fontSize:"10px",color:d.precipitation_probability_max[i]>40?"#1a5276":"#5a7a8a",fontFamily:"'IBM Plex Mono',monospace"}}>{d.precipitation_probability_max[i]}%🌧</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* API KEY */}
      <div style={{maxWidth:"960px",margin:"0 auto",padding:"8px 20px 0"}}>
        <div style={{background:"rgba(26,82,118,0.04)",border:"1px solid rgba(26,82,118,0.15)",borderRadius:"4px",padding:"10px 16px",display:"flex",alignItems:"center",gap:"12px",flexWrap:"wrap"}}>
          <span style={{fontSize:"10px",letterSpacing:"2px",color:"#1a5276",fontFamily:"'IBM Plex Mono',monospace",flexShrink:0}}>🔑 ANTHROPIC KEY</span>
          <input
            type={showKey?"text":"password"}
            value={apiKey}
            onChange={e=>saveKey(e.target.value)}
            placeholder="sk-ant-…"
            style={{flex:1,minWidth:"220px",background:"rgba(255,255,255,0.8)",border:"1px solid rgba(26,82,118,0.25)",borderRadius:"3px",padding:"6px 10px",fontSize:"12px",fontFamily:"'IBM Plex Mono',monospace",color:"#1a2a3a",outline:"none"}}
          />
          <button onClick={()=>setShowKey(s=>!s)} style={{background:"transparent",border:"1px solid rgba(26,82,118,0.2)",color:"#1a5276",borderRadius:"3px",padding:"5px 10px",fontSize:"10px",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace",flexShrink:0}}>
            {showKey?"HIDE":"SHOW"}
          </button>
          {apiKey&&<span style={{fontSize:"9px",color:"#1a7a2a",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"1px"}}>✓ SAVED</span>}
        </div>
      </div>

      {/* CONTROLS */}
      <div style={{display:"flex",justifyContent:"center",gap:"14px",padding:"20px 20px 16px",flexWrap:"wrap"}}>
        <button onClick={generateAll} disabled={isGenerating} style={{background:isGenerating?"rgba(139,105,20,0.1)":"linear-gradient(135deg,#8b6914 0%,#6a5010 100%)",color:isGenerating?"#8b6914":"#fff",border:"2px solid #8b6914",borderRadius:"3px",padding:"13px 36px",fontSize:"13px",fontWeight:"700",letterSpacing:"3px",cursor:isGenerating?"not-allowed":"pointer",fontFamily:"'IBM Plex Mono',monospace",boxShadow:isGenerating?"none":"0 4px 24px rgba(139,105,20,0.2)"}}>
          {isGenerating?"⚡ SCANNING SOURCES…":anyLoaded?"↺  REFRESH":"▶  GENERATE BRIEFING"}
        </button>
        {anyLoaded&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}>
            <button onClick={readBriefing} style={{background:isSpeaking?"rgba(2,119,168,0.08)":"transparent",color:"#0277a8",border:"2px solid #0277a8",borderRadius:"3px",padding:"13px 28px",fontSize:"13px",fontWeight:"700",letterSpacing:"3px",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace",boxShadow:isSpeaking?"0 0 16px rgba(2,119,168,0.2)":"none"}}>
              {isSpeaking?"⏹  STOP READING":"🔊  READ ALOUD"}
            </button>
            {voiceName&&<span style={{fontSize:"9px",color:"#5a7a8a",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"1px"}}>VOICE: {voiceName}</span>}
          </div>
        )}
      </div>

      {isSpeaking&&speakLine&&(
        <div style={{margin:"0 auto 16px",maxWidth:"960px",padding:"10px 20px",background:"rgba(2,119,168,0.06)",border:"1px solid rgba(2,119,168,0.2)",borderRadius:"4px",fontSize:"13px",color:"#0277a8",fontFamily:"'IBM Plex Mono',monospace",textAlign:"center",animation:"pulse 2s infinite"}}>
          🔊 {speakLine}
        </div>
      )}

      {!anyLoaded&&!isGenerating&&Object.keys(sections).length===0&&(
        <div style={{textAlign:"center",color:"#5a6a7a",fontFamily:"'IBM Plex Mono',monospace",fontSize:"13px",marginTop:"8px"}}>Press the button above to fetch your morning briefing.</div>
      )}

      {/* SECTIONS */}
      <div style={{maxWidth:"960px",margin:"0 auto",padding:"8px 20px 0"}}>
        {SECTIONS.map((section,idx)=>{
          const stories   = sections[section.key];
          const isLoading = loading[section.key];
          const isMoreLoading = moreLoading[section.key];
          const errMsg    = errors[section.key];
          const statusMsg = status[section.key];
          const {color,alpha} = getAccent(section.key);
          if (stories===undefined&&!isLoading) return null;

          return (
            <div key={section.key} style={{marginBottom:"26px",border:`1px solid ${alpha}0.2)`,borderRadius:"4px",overflow:"hidden",background:"rgba(255,255,255,0.5)",animation:"fadeIn 0.5s ease-in both",animationDelay:`${idx*0.05}s`}}>

              <div style={{background:`linear-gradient(90deg,${alpha}0.08) 0%,${alpha}0.02) 100%)`,borderBottom:`1px solid ${alpha}0.15)`,padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <span style={{fontSize:"16px"}}>{section.icon}</span>
                  <span style={{fontSize:"12px",fontWeight:"700",letterSpacing:"3px",color,fontFamily:"'IBM Plex Mono',monospace"}}>{section.label}</span>
                </div>
                <button onClick={()=>fetchSection(section)} disabled={isLoading} style={{background:"transparent",border:`1px solid ${alpha}0.2)`,color,borderRadius:"3px",padding:"3px 10px",fontSize:"10px",cursor:isLoading?"not-allowed":"pointer",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"1px"}}>
                  {isLoading?"…":"↺ REFRESH"}
                </button>
              </div>

              {isLoading&&(
                <div style={{padding:"24px 20px",textAlign:"center",color:"#5a6a7a",fontFamily:"'IBM Plex Mono',monospace",fontSize:"12px"}}>
                  <div style={{marginBottom:"8px",fontSize:"18px",animation:"pulse 1s infinite"}}>⚡</div>
                  {statusMsg||"Loading…"}
                </div>
              )}

              {!isLoading&&errMsg&&(
                <div style={{padding:"16px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px"}}>
                  <span style={{color:"#aa3333",fontFamily:"'IBM Plex Mono',monospace",fontSize:"12px"}}>⚠ {errMsg}</span>
                  <button onClick={()=>fetchSection(section)} style={{background:"rgba(204,85,85,0.06)",border:"1px solid rgba(204,85,85,0.2)",color:"#aa3333",borderRadius:"3px",padding:"4px 12px",fontSize:"10px",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"1px",flexShrink:0}}>↺ RETRY</button>
                </div>
              )}

              {!isLoading&&stories&&stories.map((story,i)=>(
                <div key={i} style={{padding:"20px 24px",borderBottom:"1px solid rgba(0,0,0,0.06)",transition:"background 0.15s",cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(26,82,118,0.03)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                >
                  <div style={{display:"flex",alignItems:"flex-start",gap:"10px"}}>
                    <span style={{color,fontFamily:"'IBM Plex Mono',monospace",fontSize:"11px",marginTop:"3px",flexShrink:0}}>{String(i+1).padStart(2,"0")}</span>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"12px"}}>
                        <div style={{fontSize:"clamp(16px,2vw,18px)",fontWeight:"700",color:"#1a2a3a",lineHeight:1.4,marginBottom:"6px"}}>{story.headline}</div>
                        <button
                          onClick={()=>setPanel({story,sectionLabel:section.label})}
                          style={{background:"rgba(2,119,168,0.06)",border:"1px solid rgba(2,119,168,0.2)",color:"#0277a8",borderRadius:"3px",padding:"3px 9px",fontSize:"9px",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"1px",flexShrink:0,whiteSpace:"nowrap"}}
                          title="Open deep dive panel"
                        >
                          ⬡ DEEP DIVE
                        </button>
                      </div>
                      <div style={{fontSize:"15px",color:"#3a4a5a",lineHeight:1.75,marginBottom:"10px"}}>{story.summary}</div>
                      <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:"8px",marginBottom:story.videoUrl?"10px":"0"}}>
                        <span style={{fontSize:"11px",color:"#6a7a8a",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"1px"}}>SOURCE: {story.source}</span>
                        <SourceBadge type={story.sourceType}/>
                      </div>
                      {story.videoUrl&&(
                        <a href={story.videoUrl} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{display:"inline-flex",alignItems:"center",gap:"6px",fontSize:"11px",color:"#b06a1a",fontFamily:"'IBM Plex Mono',monospace",textDecoration:"none",border:"1px solid rgba(176,106,26,0.3)",borderRadius:"3px",padding:"3px 10px",letterSpacing:"1px"}}>
                          ▶ {story.videoLabel||"VIDEO REPORT"}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {!isLoading&&stories&&stories.length>0&&(
                <div style={{padding:"10px 22px",borderTop:"1px solid rgba(0,0,0,0.04)",display:"flex",justifyContent:"center"}}>
                  <button
                    onClick={()=>loadMore(section)}
                    disabled={isMoreLoading}
                    style={{background:"transparent",border:`1px solid ${alpha}0.2)`,color,borderRadius:"3px",padding:"5px 20px",fontSize:"10px",cursor:isMoreLoading?"not-allowed":"pointer",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"2px",opacity:isMoreLoading?0.5:1}}
                  >
                    {isMoreLoading?"⚡ LOADING…":"+ MORE STORIES"}
                  </button>
                </div>
              )}

              {!isLoading&&!errMsg&&stories&&stories.length===0&&(
                <div style={{padding:"16px 22px",color:"#5a6a7a",fontFamily:"'IBM Plex Mono',monospace",fontSize:"12px"}}>
                  No stories found — <span style={{cursor:"pointer",textDecoration:"underline"}} onClick={()=>fetchSection(section)}>try again</span>
                </div>
              )}
              {section.key==="health"&&!isLoading&&stories&&stories.length>0&&(
                <div style={{padding:"10px 20px",borderTop:"1px solid rgba(26,122,42,0.12)",background:"rgba(26,122,42,0.04)"}}>
                  <span style={{fontSize:"9px",color:"#2a6a2a",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"1px"}}>⚕ FOR INFORMATIONAL PURPOSES ONLY · CONSULT YOUR PHYSICIAN BEFORE ACTING ON ANY HEALTH INFORMATION</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {anyLoaded&&!isGenerating&&(
        <div style={{textAlign:"center",padding:"20px",fontSize:"10px",color:"#5a6a7a",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"2px"}}>
          ⚓ MORNING WATCH · ST. PETERSBURG FL<br/>
          <span style={{color:"#7a8a9a"}}>FOR PROFESSIONAL USE · GENERATED BY AI · VERIFY BEFORE ACTING</span>
        </div>
      )}

      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        button:hover:not(:disabled){opacity:0.85}
        a:hover{opacity:0.75!important}
        *{box-sizing:border-box}
      `}</style>
    </div>
  );
}
