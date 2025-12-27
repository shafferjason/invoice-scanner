import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const { action, credentialId, pin, challenge } = await req.json();
    const store = getStore("webauthn");
    const settingsStore = getStore("settings");

    // Register new WebAuthn credential
    if (action === "register") {
      const storedPin = await settingsStore.get("userPin") || "1234";
      if (pin !== storedPin) {
        return new Response(JSON.stringify({ error: "Invalid PIN" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (!credentialId) {
        return new Response(JSON.stringify({ error: "Missing credential ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Store credential ID
      await store.set(credentialId, JSON.stringify({ 
        created: Date.now(),
        lastUsed: Date.now()
      }));

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Verify credential exists
    if (action === "verify") {
      if (!credentialId) {
        return new Response(JSON.stringify({ valid: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        const data = await store.get(credentialId);
        if (!data) {
          return new Response(JSON.stringify({ valid: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Update last used
        const parsed = JSON.parse(data);
        parsed.lastUsed = Date.now();
        await store.set(credentialId, JSON.stringify(parsed));

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

    // Generate challenge for WebAuthn
    if (action === "challenge") {
      const challenge = crypto.randomUUID() + crypto.randomUUID();
      // Store challenge temporarily (5 min expiry)
      await store.set(`challenge:${challenge}`, JSON.stringify({ 
        expiry: Date.now() + (5 * 60 * 1000) 
      }));
      return new Response(JSON.stringify({ challenge }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("WebAuthn error:", error);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/webauthn"
};
