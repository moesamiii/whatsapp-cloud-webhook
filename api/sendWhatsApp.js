export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { phone } = req.body;

  const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      },
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

    const data = await response.json();

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
