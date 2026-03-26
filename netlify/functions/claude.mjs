/**
 * Morning Watch — Anthropic API Proxy
 * Netlify Function (NOT edge function) at netlify/functions/claude.mjs
 *
 * The browser sends requests to /api/claude → this function forwards
 * them to api.anthropic.com with the required headers.
 * The API key comes from the client's x-api-key header.
 */

export async function handler(event) {
  // Only POST allowed
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Get the API key from the request header
  const apiKey = event.headers["x-api-key"];
  if (!apiKey || !apiKey.startsWith("sk-ant-")) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: { message: "Missing or invalid Anthropic API key." } })
    };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
         headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: event.body
    });

    const data = await res.text();

    return {
      statusCode: res.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: data
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: { message: "Proxy error: " + err.message } })
    };
  }
}
