import express from "express";
import axios from "axios";
import Groq from "groq-sdk";

const app = express();
app.use(express.json());

// ==============================
// 🤖 GROQ AI SETUP
// ==============================
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

function detectLanguage(text) {
  const arabic = /[\u0600-\u06FF]/;
  return arabic.test(text) ? "ar" : "en";
}

async function askAI(userMessage) {
  try {
    console.log("🤖 DEBUG => Sending message to AI:", userMessage);
    const lang = detectLanguage(userMessage);
    console.log("🌐 Detected language:", lang);

    const arabicPrompt = `أنت موظف خدمة عملاء ذكي وودود في "عيادة ابتسامة الطبيّة".
📍 الموقع: عمّان – عبدون، خلف بنك الإسكان، الطابق الأول.
🕒 مواعيد العمل: يوميًا من الساعة 2 ظهرًا حتى الساعة 10 مساءً (الجمعة مغلق).

تتحدث العربية الفصحى فقط، ومهمتك هي مساعدة العملاء في:
- الحجز أو تعديل الموعد.
- الاستفسار عن العروض.
- شرح الخدمات العلاجية الشائعة والمعروفة في طب الأسنان فقط.
- الإجابة عن الأسئلة العامة حول العيادة (الموقع، الأطباء، الدوام).

قواعد:
1. لا تخرج عن مواضيع العيادة أو خدمات طب الأسنان المعروفة.
2. كن مهذبًا وبأسلوب موظف استقبال حقيقي.
3. الأسعار تختلف حسب الحالة، ويحدّدها الطبيب بعد الفحص.

الخدمات المتاحة:
- تنظيف الأسنان
- تبييض الأسنان
- حشوات الأسنان
- علاج العصب (سحب العصب)
- تقويم الأسنان
- خلع الأسنان
- ابتسامة هوليوود (فينير/لومينير)
- زراعة الأسنان
- تركيبات الأسنان (جسور/تيجان)
- علاج التهاب اللثة`;

    const englishPrompt = `You are a smart and friendly customer service assistant at "Smile Medical Clinic".
📍 Location: Amman – Abdoun, behind Housing Bank, First Floor.
🕒 Working hours: Daily from 2:00 PM to 10:00 PM (Closed on Fridays).

You only speak English. Your job is to help clients with:
- Booking or rescheduling appointments.
- Providing information about offers.
- Explaining services or treatments.
- Answering general questions about the clinic.

Rules:
1. Stay strictly within clinic-related topics.
2. Be polite and warm.
3. Prices vary depending on the case. The doctor will confirm the cost after the consultation.

Available services:
- Cleaning
- Whitening
- Fillings
- Root canal treatment
- Braces / orthodontics
- Tooth extraction
- Hollywood smile (veneers/lumineers)
- Dental implants
- Crowns / bridges
- Treatment of gum inflammation`;

    const systemPrompt = lang === "ar" ? arabicPrompt : englishPrompt;

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_completion_tokens: 512,
    });

    const reply =
      completion.choices[0]?.message?.content ||
      (lang === "ar"
        ? "عذرًا، لم أفهم سؤالك تمامًا."
        : "Sorry, I didn't quite understand that.");

    console.log("🤖 DEBUG => AI Reply:", reply);
    return reply;
  } catch (err) {
    console.error("❌ DEBUG => AI Error:", err.response?.data || err.message);
    return "⚠️ حدث خطأ في نظام المساعد الذكي.";
  }
}

// ==============================
// ✅ ROOT ROUTE
// ==============================
app.get("/", (req, res) => {
  res.send("WhatsApp Webhook is running 🚀");
});

// ==============================
// 1️⃣ VERIFY WEBHOOK (Meta)
// ==============================
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ==============================
// 2️⃣ RECEIVE WHATSAPP MESSAGES
// ==============================
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body;

    if (!text) {
      return res.sendStatus(200);
    }

    console.log("📩 Incoming WhatsApp message:", text);

    // 🤖 Use AI to respond
    const aiResponse = await askAI(text);
    await sendMessage(from, aiResponse);

    return res.sendStatus(200);
  } catch (error) {
    console.error("❌ WhatsApp error:", error);
    return res.sendStatus(200);
  }
});

// ==============================
// 3️⃣ SEND WHATSAPP MESSAGE
// ==============================
async function sendMessage(to, text) {
  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
  const TOKEN = process.env.WHATSAPP_TOKEN;

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

// ==============================
// 🍬 WEBHOOK CANDY (WEBSITE / SUPABASE)
// ==============================
app.options("/webhook-candy", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return res.status(200).end();
});

app.post("/webhook-candy", async (req, res) => {
  try {
    console.log("🔥 Candy webhook received");
    console.log("Body:", JSON.stringify(req.body, null, 2));

    const payload = req.body.record || req.body;
    const { name, phone, service } = payload;

    if (!name || !phone || !service) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const messageText = `📢 عميل جديد من الموقع:
👤 الاسم: ${name}
📞 الهاتف: ${phone}
💊 الخدمة: ${service}`;

    const response = await fetch(
      "https://whatsapp-test-rosy.vercel.app/api/sendWhatsApp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Smile Clinic",
          phone: "962781685210",
          service: "Booking",
          appointment: messageText,
        }),
      }
    );

    const data = await response.json();
    console.log("✅ WhatsApp sent from Candy:", data);

    return res.status(200).json({
      success: true,
      whatsappResult: data,
    });
  } catch (err) {
    console.error("❌ Candy webhook error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ==============================
// 🚀 START SERVER
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
