import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════
   MORNING WATCH — LEAN EDITION
   St. Petersburg, FL  ·  5 sections  ·  Live weather  ·  No frills
   ═══════════════════════════════════════════════════════════════════ */

const TODAY = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

const SECTIONS = [
  { key: "local",    label: "ST. PETE / TAMPA BAY",  icon: "\u2693", color: "#c9a84c", query: "St. Petersburg Tampa Bay Florida local news today" },
  { key: "national", label: "NATIONAL",               icon: "\ud83c\uddfa\ud83c\uddf8", color: "#5b8fb9", query: "United States national news today important" },
  { key: "marine",   label: "MARINE INDUSTRY",        icon: "\u26f5", color: "#c9a84c", query: "yacht boat sailing marine industry news today" },
  { key: "ai",       label: "ARTIFICIAL INTELLIGENCE", icon: "\ud83e\udd16", color: "#00d4aa", query: "artificial intelligence AI news today breakthroughs tools" },
  { key: "health",   label: "HEALTH & WELLNESS",      icon: "\ud83d\udcaa", color: "#e07050", query: "men health over 60 arthritis back pain sleep research news today" },
];

const API_PATH = "/api/claude";

// ── API CALL ──────────────────────────────────────────────────────
async function callClaude(body, apiKey) {
  const isArtifact = typeof window !== "undefined" && window.location.hostname.includes("claude.ai");
  const url = isArtifact ? "https://api.anthropic.com/v1/messages" : API_PATH;
  const headers = { "Content-Type": "application/json" };
  if (!isArtifact && apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("HTTP " + res.status + ": " + res.statusText);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data;
}

// ── RETRY WRAPPER ─────────────────────────────────────────────────
async function withRetry(fn, attempts = 2) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) { if (i === attempts - 1) throw e; await new Promise(r => setTimeout(r, 800)); }
  }
}

// ── SEARCH + PARSE (single-stage, Haiku) ──────────────────────────
async function fetchStories(query, apiKey, count = 3) {
  return withRetry(async () => {
    const data = await callClaude({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: "You are a concise news assistant. Today is " + TODAY + ". Return ONLY raw JSON, no markdown, no backticks. Format: {\"stories\":[{\"headline\":\"...\",\"summary\":\"...\",\"source\":\"...\",\"sourceType\":\"wire|trade|pr|single-outlet\"}]}. Keep summaries under 40 words. Flag PR content. Be skeptical.",
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: "Search the web for " + count + " important recent news stories about: " + query + ". Return JSON only." }]
    }, apiKey);

    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
    if (!text) throw new Error("Empty response");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("No JSON found");
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed.stories)) throw new Error("Missing stories");
    return parsed.stories;
  });
}

// ── WEATHER (Open-Meteo, no API key needed) ───────────────────────
async function fetchWeather() {
  const res = await fetch(
    "https://api.open-meteo.com/v1/forecast?latitude=27.7676&longitude=-82.6403" +
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code" +
    "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max" +
    "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America/New_York&forecast_days=5"
  );
  if (!res.ok) throw new Error("Weather API error");
  return await res.json();
}

function weatherDesc(code) {
  if (code <= 1) return "Clear";
  if (code <= 3) return "Partly Cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow Showers";
  if (code >= 95) return "Thunderstorm";
  return "Mixed";
}

function windArrow(deg) {
  const arrows = ["\u2193", "\u2199", "\u2190", "\u2196", "\u2191", "\u2197", "\u2192", "\u2198"];
  return arrows[Math.round(deg / 45) % 8];
}

function beaufort(mph) {
  if (mph < 1) return "Calm";
  if (mph < 4) return "Light Air";
  if (mph < 8) return "Light Breeze";
  if (mph < 13) return "Gentle Breeze";
  if (mph < 19) return "Moderate Breeze";
  if (mph < 25) return "Fresh Breeze";
  if (mph < 32) return "Strong Breeze";
  if (mph < 39) return "Near Gale";
  return "Gale+";
}

// ── SOURCE BADGE ──────────────────────────────────────────────────
function Badge({ type }) {
  const map = {
    wire:           { bg: "#1a5276", label: "WIRE" },
    trade:          { bg: "#1a6040", label: "TRADE" },
    pr:             { bg: "#8b4513", label: "PR" },
    "single-outlet":{ bg: "#6a4080", label: "SINGLE" },
    independent:    { bg: "#2a6070", label: "INDEP" },
  };
  const m = map[type] || { bg: "#444", label: type?.toUpperCase() || "?" };
  return (
    <span style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "3px", background: m.bg, color: "#dde4ec", fontFamily: "monospace", letterSpacing: "1px", marginLeft: "8px", verticalAlign: "middle" }}>
      {m.label}
    </span>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────
export default function MorningWatch() {
  const [sections, setSections]       = useState({});
  const [loading, setLoading]         = useState({});
  const [errors, setErrors]           = useState({});
  const [weather, setWeather]         = useState(null);
  const [wxError, setWxError]         = useState(null);
  const [generating, setGenerating]   = useState(false);
  const [generated, setGenerated]     = useState(false);
  const [apiKey, setApiKey]           = useState(() => {
    try { return localStorage.getItem("mw_api_key") || ""; } catch { return ""; }
  });
  const [showKey, setShowKey]         = useState(false);
  const apiKeyRef = useRef(apiKey);

  useEffect(() => { apiKeyRef.current = apiKey; try { localStorage.setItem("mw_api_key", apiKey); } catch {} }, [apiKey]);

  // ── Fetch one section ───────────────────────────────────────────
  const loadSection = async (sec) => {
    setLoading(p => ({ ...p, [sec.key]: true }));
    setErrors(p => ({ ...p, [sec.key]: null }));
    try {
      const stories = await fetchStories(sec.query, apiKeyRef.current);
      setSections(p => ({ ...p, [sec.key]: stories }));
    } catch (e) {
      setErrors(p => ({ ...p, [sec.key]: e.message }));
    }
    setLoading(p => ({ ...p, [sec.key]: false }));
  };

  // ── Generate all ────────────────────────────────────────────────
  const generate = async () => {
    setGenerating(true);
    setGenerated(false);
    // Weather first (parallel)
    fetchWeather().then(w => setWeather(w)).catch(e => setWxError(e.message));
    // Sections sequentially with 500ms gap
    for (const sec of SECTIONS) {
      await loadSection(sec);
      await new Promise(r => setTimeout(r, 500));
    }
    setGenerating(false);
    setGenerated(true);
  };

  // ── Is running inside claude.ai? ────────────────────────────────
  const isArtifact = typeof window !== "undefined" && window.location.hostname.includes("claude.ai");

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(165deg, #0a1628 0%, #0e2040 50%, #0a1628 100%)", color: "#edf0f4", fontFamily: "'Georgia', 'Times New Roman', serif" }}>

      {/* ── HEADER ──────────────────────────────── */}
      <div style={{ textAlign: "center", padding: "40px 20px 24px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "4px", color: "#c9a84c", marginBottom: "6px", fontFamily: "monospace" }}>ST. PETERSBURG, FL</div>
        <h1 style={{ fontSize: "36px", fontWeight: 300, letterSpacing: "6px", margin: "0 0 6px", color: "#edf0f4" }}>MORNING WATCH</h1>
        <div style={{ fontSize: "13px", color: "#7a9ab5", fontFamily: "monospace" }}>{TODAY}</div>
      </div>

      {/* ── API KEY (hidden inside claude.ai) ───── */}
      {!isArtifact && (
        <div style={{ maxWidth: "700px", margin: "0 auto 16px", padding: "0 20px" }}>
          <div style={{ background: "rgba(26,82,118,0.08)", border: "1px solid rgba(26,82,118,0.2)", borderRadius: "6px", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "10px", letterSpacing: "2px", color: "#5b8fb9", fontFamily: "monospace", flexShrink: 0 }}>API KEY</span>
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              style={{ flex: 1, minWidth: "180px", background: "rgba(0,0,0,0.3)", border: "1px solid #1a3a5a", borderRadius: "4px", padding: "6px 10px", color: "#dde4ec", fontSize: "12px", fontFamily: "monospace" }}
            />
            <button onClick={() => setShowKey(!showKey)} style={{ background: "none", border: "1px solid #1a3a5a", borderRadius: "4px", padding: "4px 10px", color: "#7a9ab5", fontSize: "10px", fontFamily: "monospace", cursor: "pointer" }}>
              {showKey ? "HIDE" : "SHOW"}
            </button>
            {apiKey && <span style={{ fontSize: "9px", color: "#1a7a2a", fontFamily: "monospace" }}>{"\u2713"} SAVED</span>}
          </div>
        </div>
      )}

      {/* ── GENERATE BUTTON ─────────────────────── */}
      <div style={{ textAlign: "center", padding: "0 20px 24px" }}>
        <button
          onClick={generate}
          disabled={generating}
          style={{ background: generating ? "#1a3a5a" : "linear-gradient(135deg, #c9a84c, #a08030)", border: "none", borderRadius: "6px", padding: "14px 48px", color: generating ? "#7a9ab5" : "#0a1628", fontSize: "13px", fontWeight: 700, letterSpacing: "3px", fontFamily: "monospace", cursor: generating ? "default" : "pointer", transition: "all 0.2s" }}
        >
          {generating ? "\u25f7 GENERATING\u2026" : generated ? "\u21bb REFRESH BRIEFING" : "\u25b6 GENERATE BRIEFING"}
        </button>
      </div>

      <div style={{ maxWidth: "700px", margin: "0 auto", padding: "0 20px 60px" }}>

        {/* ── WEATHER ─────────────────────────────── */}
        {weather && weather.current && (
          <div style={{ background: "rgba(20,50,80,0.5)", border: "1px solid rgba(90,140,180,0.15)", borderRadius: "8px", padding: "20px", marginBottom: "28px", animation: "fadeIn 0.4s ease" }}>
            <div style={{ fontSize: "11px", letterSpacing: "3px", color: "#5b8fb9", fontFamily: "monospace", marginBottom: "12px" }}>{"\u2600\ufe0f"} WEATHER — ST. PETERSBURG</div>
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ fontSize: "42px", fontWeight: 300, color: "#edf0f4" }}>{Math.round(weather.current.temperature_2m)}{"\u00b0"}F</span>
              <div style={{ fontSize: "13px", color: "#aabbc8", lineHeight: 1.8 }}>
                <div>{weatherDesc(weather.current.weather_code)}</div>
                <div>Wind {Math.round(weather.current.wind_speed_10m)} mph {windArrow(weather.current.wind_direction_10m)} {"\u00b7"} {beaufort(weather.current.wind_speed_10m)}</div>
                <div>Humidity {weather.current.relative_humidity_2m}%</div>
              </div>
            </div>
            {weather.daily && (
              <div style={{ display: "flex", gap: "8px", marginTop: "16px", overflowX: "auto" }}>
                {weather.daily.time.map((day, i) => (
                  <div key={day} style={{ flex: "1 0 90px", background: "rgba(10,30,60,0.5)", borderRadius: "6px", padding: "10px", textAlign: "center", fontSize: "11px", color: "#aabbc8", fontFamily: "monospace" }}>
                    <div style={{ fontWeight: 700, marginBottom: "4px", color: "#dde4ec" }}>
                      {new Date(day + "T12:00").toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                    <div>{Math.round(weather.daily.temperature_2m_max[i])}{"\u00b0"}/{Math.round(weather.daily.temperature_2m_min[i])}{"\u00b0"}</div>
                    <div style={{ fontSize: "10px", marginTop: "2px" }}>{weatherDesc(weather.daily.weather_code[i])}</div>
                    <div style={{ fontSize: "10px", color: "#5a9aaa" }}>{weather.daily.precipitation_probability_max[i]}% rain</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {wxError && (
          <div style={{ background: "rgba(120,40,40,0.3)", border: "1px solid rgba(180,60,60,0.3)", borderRadius: "6px", padding: "12px 16px", marginBottom: "20px", fontSize: "12px", color: "#e88" }}>
            Weather unavailable: {wxError}
          </div>
        )}

        {/* ── NEWS SECTIONS ──────────────────────── */}
        {SECTIONS.map(sec => {
          const stories = sections[sec.key];
          const isLoading = loading[sec.key];
          const error = errors[sec.key];

          return (
            <div key={sec.key} style={{ marginBottom: "28px", animation: stories ? "fadeIn 0.5s ease" : "none" }}>
              {/* Section header */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <span style={{ fontSize: "18px" }}>{sec.icon}</span>
                <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "3px", color: sec.color, fontFamily: "monospace" }}>{sec.label}</span>
                {stories && !isLoading && (
                  <button
                    onClick={() => loadSection(sec)}
                    style={{ marginLeft: "auto", background: "none", border: "1px solid rgba(90,140,180,0.2)", borderRadius: "4px", padding: "3px 10px", color: "#5b8fb9", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", letterSpacing: "1px" }}
                  >
                    {"\u21bb"} REFRESH
                  </button>
                )}
              </div>

              {/* Loading indicator */}
              {isLoading && (
                <div style={{ padding: "20px", textAlign: "center", fontSize: "12px", color: "#5b8fb9", fontFamily: "monospace", letterSpacing: "2px", animation: "pulse 1.2s infinite" }}>
                  SEARCHING{"\u2026"}
                </div>
              )}

              {/* Error */}
              {error && !isLoading && (
                <div style={{ background: "rgba(120,40,40,0.2)", border: "1px solid rgba(180,60,60,0.2)", borderRadius: "6px", padding: "12px 16px", fontSize: "12px", color: "#e88" }}>
                  {error} {" \u2014 "}
                  <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => loadSection(sec)}>retry</span>
                </div>
              )}

              {/* Stories */}
              {stories && stories.map((s, i) => (
                <div key={i} style={{ background: "rgba(20,50,80,0.35)", border: "1px solid rgba(90,140,180,0.1)", borderRadius: "6px", padding: "14px 16px", marginBottom: "8px" }}>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "#edf0f4", lineHeight: 1.4, marginBottom: "6px" }}>
                    {s.headline}
                    <Badge type={s.sourceType} />
                  </div>
                  <div style={{ fontSize: "13px", color: "#aabbc8", lineHeight: 1.7 }}>{s.summary}</div>
                  <div style={{ fontSize: "10px", color: "#5b8fb9", fontFamily: "monospace", marginTop: "6px" }}>{s.source}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* ── FOOTER ──────────────────────────────── */}
      <div style={{ textAlign: "center", padding: "20px", fontSize: "10px", color: "#3a5a7a", fontFamily: "monospace", letterSpacing: "2px", borderTop: "1px solid rgba(90,140,180,0.1)" }}>
        {"\u2693"} MORNING WATCH {"\u00b7"} ST. PETERSBURG FL {"\u00b7"} {new Date().getFullYear()}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
