async function sendWhatsAppMessage(phone, mainText, date, imageUrl) {
  try {
    const PHONE_NUMBER_ID = "1039766262557024";
    const ACCESS_TOKEN =
      "EAAM2ahtGe0cBREUIeCrd3OGshwQrhythX8uNZBgZA48gMC06ZCg56GOHk2BzZB4xq0TBd1ZBwEo78sCvFZCiK7EG1CCBZCaFQ8mzxYw7Uvxnxecgxd0I33uT3NQ4y6Hx9jM7l2SygqbdRN81ohrIV5loWBcJVBfPwm5ZBT0VGqMQLSg9prJBt2jMGIp3PZAC9HRb3h1QvfsjrjeIZCBqfy";
    const baseUrl = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;
    const headers = {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    };

    // STEP 1: Send template with FLAT (no newlines) params
    const components = [];

    if (imageUrl) {
      components.push({
        type: "header",
        parameters: [{ type: "image", image: { link: imageUrl } }],
      });
    }

    const templateRes = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "clinic_offer_v2",
          language: { code: "ar" },
          components,
        },
      }),
    });

    const templateResult = await templateRes.json();
    addDebugLog(
      `📩 Template Response for ${phone}: ${JSON.stringify(templateResult)}`,
    );

    if (!templateResult.messages?.[0]?.id) {
      addDebugLog(`❌ Template failed for ${phone}`, "error");
      return false;
    }

    // Wait 2 seconds before sending real text
    await new Promise((r) => setTimeout(r, 2000));

    // STEP 2: Send full offer as a free-form text message (newlines allowed here)
    const fullText = `${mainText}\n\n⏰ صالح حتى: ${date}\n\nاحجزي الآن!`;

    const textRes = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: fullText },
      }),
    });

    const textResult = await textRes.json();
    addDebugLog(`📩 Text Response for ${phone}: ${JSON.stringify(textResult)}`);

    if (textResult.messages?.[0]?.id) {
      addDebugLog(`✅ Full message sent to ${phone}`, "success");
      return true;
    } else {
      addDebugLog(`⚠️ Text message failed for ${phone}`, "warning");
      return false;
    }
  } catch (err) {
    addDebugLog(`❌ Exception: ${err.message}`, "error");
    return false;
  }
}

// Strips ALL newlines, tabs, and collapses spaces — safe for template params
function flattenText(text) {
  return String(text)
    .replace(/[\r\n\t]/g, " ") // remove all newlines and tabs
    .replace(/ {2,}/g, " ") // collapse multiple spaces into one
    .trim();
}
