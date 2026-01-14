/**
 * webhookCandy.js
 *
 * Website / Supabase webhook
 * Sends WhatsApp notification on new booking
 */

async function webhookCandy(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("🔥 Candy webhook received");
    console.log("Body:", JSON.stringify(req.body, null, 2));

    const payload = req.body.record || req.body;
    const { name, phone, service } = payload;

    if (!name || !phone || !service) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const messageText = `📢 عميل جديد من الموقع:
👤 الاسم: ${name}
📞 الهاتف: ${phone}
💊 الخدمة: ${service}`;

    const response = await fetch(
      "https://whatsapp-test-rosy.vercel.app/api/sendWhatsApp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Smile Clinic",
          phone: "962781685210",
          service: "Booking",
          appointment: messageText,
        }),
      }
    );

    const data = await response.json();

    console.log("📤 WhatsApp response:", data);

    return res.status(200).json({
      success: true,
      whatsappResult: data,
    });
  } catch (err) {
    console.error("❌ Candy webhook error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export { webhookCandy };
