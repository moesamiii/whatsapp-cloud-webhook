export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { phone, appointment, image } = req.body;

    // 🔴 Replace these with YOUR values from Meta
    const ACCESS_TOKEN =
      "EAAM2ahtGe0cBREUIeCrd3OGshwQrhythX8uNZBgZA48gMC06ZCg56GOHk2BzZB4xq0TBd1ZBwEo78sCvFZCiK7EG1CCBZCaFQ8mzxYw7Uvxnxecgxd0I33uT3NQ4y6Hx9jM7l2SygqbdRN81ohrIV5loWBcJVBfPwm5ZBT0VGqMQLSg9prJBt2jMGIp3PZAC9HRb3h1QvfsjrjeIZCBqfy";
    const PHONE_NUMBER_ID = "1039766262557024";

    // Format phone (must be international without +)
    const formattedPhone = phone.replace("+", "").trim();

    let body;

    // ✅ If image exists → send image message
    if (image) {
      body = {
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "image",
        image: {
          link: image,
          caption: appointment,
        },
      };
    } else {
      // ✅ Text message
      body = {
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "text",
        text: {
          body: appointment,
        },
      };
    }

    // 🚀 Send request to WhatsApp API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        error: data,
      });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
