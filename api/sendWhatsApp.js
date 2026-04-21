export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { phone, name, title, desc, date, images } = req.body;

  const PHONE_NUMBER_ID = "1039766262557024";
  const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

  const headers = {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };

  const baseUrl = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;
  const fullOfferText = `📢 ${title}\n\n${desc}\n\n⏰ صالح حتى: ${date}`;

  try {
    // STEP 1: Send template to open conversation window
    const templateRes = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "offer_open",
          language: { code: "ar_AE" },
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: name || "عميلنا",
                  parameter_name: "name",
                },
              ],
            },
          ],
        },
      }),
    });

    const templateData = await templateRes.json();
    console.log("TEMPLATE RESPONSE:", templateData);

    if (!templateRes.ok) {
      throw new Error(templateData.error?.message || "Template failed");
    }

    await new Promise((r) => setTimeout(r, 2000));

    // STEP 2: Send offer — image with caption (never truncated) or plain text
    if (images && images.length > 0) {
      // First image carries the full offer text as caption
      await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "image",
          image: {
            link: images[0],
            caption: fullOfferText,
          },
        }),
      });

      // Remaining images form a slider
      for (let i = 1; i < images.length; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        await fetch(baseUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "image",
            image: { link: images[i] },
          }),
        });
      }
    } else {
      // No images — plain text fallback
      await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: fullOfferText, preview_url: false },
        }),
      });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("sendWhatsApp error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
