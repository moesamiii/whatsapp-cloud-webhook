import { createClient } from "@supabase/supabase-js";

// ✅ Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ✅ Global variable to store clinic settings
let clinicSettings = null;

// ✅ Load clinic settings
async function loadClinicSettings() {
  try {
    const { data, error } = await supabase
      .from("clinic_settings")
      .select("*")
      .eq("clinic_id", "default")
      .single();

    if (!error) {
      clinicSettings = data;
    }
  } catch (err) {
    console.error(err.message);
  }
}

loadClinicSettings();

// ==============================
// ✅ MAIN FUNCTION
// ==============================
async function sendWhatsApp(req, res) {
  // ✅ CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { phone } = req.body || {};

  if (!phone) {
    return res.status(400).json({ error: "Missing phone" });
  }

  const url = `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  };

  try {
    // ✅ TEMPLATE MESSAGE (THIS IS THE FIX)
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: "hello_world",
        language: { code: "en_US" },
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ WhatsApp Error:", data);
      return res.status(500).json({ success: false, error: data });
    }

    return res.status(200).json({
      success: true,
      data,
      message: "Template sent successfully",
    });
  } catch (error) {
    console.error("🚨 Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export { sendWhatsApp };
