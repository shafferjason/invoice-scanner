import { getStore } from "@netlify/blobs";

const ADMIN_PASSWORD_KEY = "ADMIN_PASSWORD";

// Verify admin password
async function verifyAdmin(password) {
  const adminPassword = Netlify.env.get(ADMIN_PASSWORD_KEY);
  return adminPassword && password === adminPassword;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace("/api/admin", "");

  // All admin routes require POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  const body = await req.json();
  const store = getStore("settings");

  // Login - verify admin password
  if (path === "/login") {
    const isValid = await verifyAdmin(body.password);
    if (isValid) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ error: "Invalid password" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  // All other routes require admin authentication
  if (!await verifyAdmin(body.adminPassword)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Get settings
  if (path === "/settings") {
    const pin = await store.get("userPin") || "1234";
    const rateLimit = await store.get("rateLimit") || "20";
    return new Response(JSON.stringify({ pin, rateLimit }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Update PIN
  if (path === "/set-pin") {
    if (!body.pin || !/^\d{4,6}$/.test(body.pin)) {
      return new Response(JSON.stringify({ error: "PIN must be 4-6 digits" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    await store.set("userPin", body.pin);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Update rate limit
  if (path === "/set-rate-limit") {
    const limit = parseInt(body.rateLimit);
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return new Response(JSON.stringify({ error: "Rate limit must be 1-1000" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    await store.set("rateLimit", String(limit));
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" }
  });
};

export const config = {
  path: "/api/admin/*"
};
