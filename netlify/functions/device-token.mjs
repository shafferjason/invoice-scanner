import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const { action, token, pin } = await req.json();
    const store = getStore("devices");
    const settingsStore = getStore("settings");

    // Generate and save a new device token
    if (action === "register") {
      const storedPin = await settingsStore.get("userPin") || "1234";
      if (pin !== storedPin) {
        return new Response(JSON.stringify({ error: "Invalid PIN" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Generate random token
      const newToken = crypto.randomUUID() + "-" + crypto.randomUUID();
      const expiry = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days

      await store.set(newToken, JSON.stringify({ expiry }));

      return new Response(JSON.stringify({ success: true, token: newToken }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Verify existing token
    if (action === "verify") {
      if (!token) {
        return new Response(JSON.stringify({ valid: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        const data = await store.get(token);
        if (!data) {
          return new Response(JSON.stringify({ valid: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        const { expiry } = JSON.parse(data);
        if (Date.now() > expiry) {
          // Token expired, delete it
          await store.delete(token);
          return new Response(JSON.stringify({ valid: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ valid: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ valid: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Revoke token (logout)
    if (action === "revoke") {
      if (token) {
        try {
          await store.delete(token);
        } catch (e) {
          // Ignore if token doesn't exist
        }
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Device token error:", error);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/device-token"
};
