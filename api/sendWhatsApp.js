export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { phone, service, appointment, image } = req.body;

  const PHONE_NUMBER_ID = "1039766262557024";
  const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

  const headers = {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };

  // ⚠️ Use stable version (important)
  const baseUrl = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

  try {
    // ==============================
    // ✅ STEP 1: SEND TEMPLATE
    // ==============================
    const response1 = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "hello_world",
          language: { code: "en_US" },
        },
      }),
    });

    const data1 = await response1.json();
    console.log("STEP 1 STATUS:", response1.status);
    console.log("STEP 1 RESPONSE:", data1);

    // ❌ Stop if template failed
    if (!response1.ok) {
      return res.status(500).json({
        success: false,
        step: "template",
        error: data1,
      });
    }

    // ⏳ wait 2 seconds
    await new Promise((r) => setTimeout(r, 2000));

    // ==============================
    // ✅ STEP 2: SEND MESSAGE
    // ==============================
    let response2;

    if (image) {
      response2 = await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "image",
          image: {
            link: image,
            caption: appointment,
          },
        }),
      });
    } else {
      response2 = await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: {
            body: appointment,
          },
        }),
      });
    }

    const data2 = await response2.json();
    console.log("STEP 2 STATUS:", response2.status);
    console.log("STEP 2 RESPONSE:", data2);

    // ❌ Stop if message failed
    if (!response2.ok) {
      return res.status(500).json({
        success: false,
        step: "message",
        error: data2,
      });
    }

    // ==============================
    // ✅ SUCCESS
    // ==============================
    return res.status(200).json({
      success: true,
      step1: data1,
      step2: data2,
    });
  } catch (err) {
    console.error("SERVER ERROR:", err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
