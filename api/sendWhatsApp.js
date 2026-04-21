export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { phone, service, appointment, image } = req.body;

  const PHONE_NUMBER_ID = "1039766262557024";
  const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

  const headers = {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };

  const baseUrl = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;

  try {
    // Step 1: Send template to open conversation window
    await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "offer_open",
          language: { code: "ar" },
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: service || "عميلنا",
                },
              ],
            },
          ],
        },
      }),
    });

    await new Promise((r) => setTimeout(r, 2000));

    // Step 2: Send offer content
    await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: appointment },
      }),
    });

    // Step 3: Send image (if exists)
    if (image) {
      await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "image",
          image: { link: image },
        }),
      });
    }
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
