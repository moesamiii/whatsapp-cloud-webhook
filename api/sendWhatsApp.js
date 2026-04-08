/**
 * api/sendWhatsApp.js
 * Vercel Serverless Function - WhatsApp sender for campaigns/offers
 */

export default async function handler(req, res) {
  // ✅ Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, phone, service, appointment, image } = req.body || {};

  if (!phone) {
    return res.status(400).json({ error: "Missing phone" });
  }

  const clinicName = name || "Clinic";

  const messageText = appointment
    ? appointment
    : `👋 مرحبًا!\nرسالة من ${clinicName}`;

  const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  };

  try {
    // 🖼️ IMAGE MESSAGE
    if (image && image.startsWith("http")) {
      console.log("📤 Sending image message to:", phone);

      const imagePayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "image",
        image: {
          link: image,
          caption: messageText,
        },
      };

      const imageResponse = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(imagePayload),
      });

      const imageData = await imageResponse.json();

      if (!imageResponse.ok || imageData.error) {
        console.error("❌ Image failed, fallback to text:", imageData);

        // Fallback to text
        const textPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: messageText },
        };

        const textResponse = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(textPayload),
        });

        const textData = await textResponse.json();
        return res
          .status(200)
          .json({
            success: true,
            fallback: true,
            textData,
            imageError: imageData,
          });
      }

      return res.status(200).json({ success: true, imageData });
    }

    // 💬 TEXT ONLY
    const textPayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: messageText },
    };

    const textResponse = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(textPayload),
    });

    const textData = await textResponse.json();

    if (!textResponse.ok) {
      console.error("❌ Text message failed:", textData);
      return res.status(500).json({ success: false, error: textData });
    }

    return res.status(200).json({ success: true, textData });
  } catch (error) {
    console.error("🚨 sendWhatsApp error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
