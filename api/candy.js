export default async function handler(req, res) {
  try {
    console.log("🔥 Webhook HIT!");

    // Supabase Webhook body
    const payload = req.body.record;

    if (!payload) {
      return res.status(400).json({ error: "No record received" });
    }

    const name = payload.name;
    const phone = payload.phone;
    const service = payload.service;

    const messageText = `
    NEW BOOKING
    Name: ${name}
    Phone: ${phone}
    Service: ${service}
    `;

    console.log("📩 Sending WhatsApp:", messageText);

    await fetch("https://whatsapp-test-rosy.vercel.app/sendWhatsApp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Smile Clinic",
        phone: "962785050875",
        service: "Booking",
        appointment: messageText,
      }),
    });

    console.log("✅ WhatsApp sent from webhook");

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
