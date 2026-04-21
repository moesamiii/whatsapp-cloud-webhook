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

  try {
    // STEP 1: Send offer template (with title+desc + date)
    const templateRes = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "clinic_offer", // <-- your NEW template name
          language: { code: "ar" }, // or ar_AE (must match dashboard)
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: `${title} - ${desc}`, // {{1}}
                },
                {
                  type: "text",
                  text: date, // {{2}}
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

    // STEP 2: Send images WITHOUT caption (caption causes truncation)
    if (images && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 1500));

        const imgRes = await fetch(baseUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "image",
            image: {
              link: images[i],
            },
          }),
        });

        const imgData = await imgRes.json();
        console.log("IMAGE RESPONSE:", imgData);

        if (!imgRes.ok) {
          console.error("Image failed:", imgData);
        }
      }
    } else {
      // No images — do nothing (template already sent)
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("sendWhatsApp error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
