import { getStore } from "@netlify/blobs";

const RECIPIENT_EMAIL = "cfa3043@gmail.com";
const FROM_EMAIL = "invoices@bespokes.ai";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const { pdf, filename, amount, docType } = await req.json();

    if (!pdf || !filename) {
      return new Response(JSON.stringify({ error: "Missing PDF data or filename" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Get client IP for rate limiting
    const clientIP = context.ip || req.headers.get("x-forwarded-for") || "unknown";
    const store = getStore("rate-limits");
    const settingsStore = getStore("settings");
    
    // Get rate limit setting (default 20 per hour)
    const rateLimitSetting = await settingsStore.get("rateLimit") || "20";
    const maxPerHour = parseInt(rateLimitSetting);
    
    // Check rate limit
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const rateLimitKey = `sends:${clientIP}`;
    
    let sends = [];
    try {
      const sendsData = await store.get(rateLimitKey);
      if (sendsData) {
        sends = JSON.parse(sendsData);
      }
    } catch (e) {
      sends = [];
    }
    
    // Filter to only sends in the last hour
    sends = sends.filter(timestamp => timestamp > oneHourAgo);
    
    if (sends.length >= maxPerHour) {
      return new Response(JSON.stringify({ 
        error: `Rate limit exceeded. Maximum ${maxPerHour} invoices per hour.` 
      }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      });
    }

    const apiKey = Netlify.env.get("RESEND_API_KEY");
    if (!apiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Build subject line with doc type and amount
    const dateStr = new Date().toLocaleDateString();
    const typeLabel = docType === 'paidout' ? 'Paid Out' : 'Invoice';
    const subject = amount 
      ? `${typeLabel} - $${amount} - ${dateStr}`
      : `${typeLabel} - ${dateStr}`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [RECIPIENT_EMAIL],
        subject: subject,
        html: `
          <p>A new ${typeLabel.toLowerCase()} has been scanned and attached to this email.</p>
          ${amount ? `<p><strong>Total Amount:</strong> $${amount}</p>` : ''}
          <p><strong>Scanned on:</strong> ${new Date().toLocaleString()}</p>
        `,
        attachments: [
          {
            filename: filename,
            content: pdf
          }
        ]
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Resend API error:", result);
      return new Response(JSON.stringify({ 
        error: result.message || "Failed to send email" 
      }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Record successful send for rate limiting
    sends.push(now);
    await store.set(rateLimitKey, JSON.stringify(sends));

    return new Response(JSON.stringify({ 
      success: true, 
      messageId: result.id 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Error sending invoice:", error);
    return new Response(JSON.stringify({ 
      error: "Internal server error" 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/send-invoice"
};
