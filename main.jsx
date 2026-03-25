/**
 * Morning Watch — Anthropic API proxy
 * Netlify Function: netlify/functions/claude.mjs
 *
 * Forwards POST /api/claude → https://api.anthropic.com/v1/messages
 * The client sends its API key in the x-api-key header.
 */

export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || !apiKey.startsWith("sk-ant-")) {
    return new Response(
      JSON.stringify({ error: { message: "Missing or invalid Anthropic API key." } }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await request.text();

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta":    "web-search-20250305",
      },
      body,
    });

    const responseText = await upstream.text();

    return new Response(responseText, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { message: `Proxy error: ${err.message}` } }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = { path: "/api/claude" };
