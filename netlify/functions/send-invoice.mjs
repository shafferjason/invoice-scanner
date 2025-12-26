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
    const { pdf, filename, amount } = await req.json();

    if (!pdf || !filename) {
      return new Response(JSON.stringify({ error: "Missing PDF data or filename" }), {
        status: 400,
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

    // Build subject line with amount if available
    const dateStr = new Date().toLocaleDateString();
    const subject = amount 
      ? `Invoice - $${amount} - ${dateStr}`
      : `Invoice - ${dateStr}`;

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
          <p>A new invoice has been scanned and attached to this email.</p>
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
