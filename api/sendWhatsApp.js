// api/sendWhatsApp.js
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { phone, service, appointment, image, name } = req.body;

  const PHONE_NUMBER_ID = "1039766262557024"; // from your Meta screenshot
  const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN; // store in Vercel env vars

  try {
    // Step 1: Send template to open conversation window
    await fetch(
      `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: { name: "hello_world", language: { code: "en_US" } },
        }),
      },
    );

    // Wait 2 seconds before sending free-form
    await new Promise((r) => setTimeout(r, 2000));

    // Step 2: Send the actual offer (image + text)
    if (image) {
      await fetch(
        `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "image",
            image: { link: image, caption: appointment },
          }),
        },
      );
    } else {
      await fetch(
        `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "text",
            text: { body: appointment },
          }),
        },
      );
    }

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
