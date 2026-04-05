import express from "express";
import axios from "axios";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

// ==============================
// 🔑 SUPABASE SETUP
// ==============================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ✅ Global variable to store clinic settings
let clinicSettings = null;

// ✅ Load clinic settings from database
async function loadClinicSettings() {
  try {
    const { data, error } = await supabase
      .from("clinic_settings")
      .select("*")
      .eq("clinic_id", "default")
      .single();

    if (error) {
      console.error("❌ Error loading clinic settings:", error);
      return;
    }

    clinicSettings = data;
    console.log("✅ Clinic settings loaded:", clinicSettings?.clinic_name);
  } catch (err) {
    console.error("❌ Exception loading clinic settings:", err.message);
  }
}

// ✅ Load settings on startup
loadClinicSettings();

// ==============================
// 📸 DOCTOR DATA (TEXT ONLY)
// ==============================
const DOCTOR_INFO = [
  { name: "د. شيماء عبدالستار", specialization: "طبيب أسنان" },
  { name: "د. اسراء النقيب", specialization: "طبيب أسنان" },
];

// ==============================
// 🛡️ SPAM PROTECTION - DUPLICATE MESSAGE DETECTION
// ==============================
const userMessageTimestamps = {}; // Track message timestamps per user
const userLastMessages = {}; // Track last message content per user
const processingMessages = {}; // Track messages currently being processed

const RATE_LIMIT_CONFIG = {
  DUPLICATE_WINDOW_MS: 5000, // Ignore duplicate messages within 5 seconds
  MAX_MESSAGES_PER_WINDOW: 10, // Max messages allowed in time window
  TIME_WINDOW_MS: 30000, // 30 seconds
  PROCESSING_TIMEOUT_MS: 10000, // Max time to process a message
};

function isDuplicateMessage(userId, messageText) {
  const now = Date.now();

  // Initialize tracking if not exists
  if (!userLastMessages[userId]) {
    userLastMessages[userId] = { text: "", timestamp: 0 };
  }

  // Check if this is a duplicate message
  const lastMsg = userLastMessages[userId];
  const isDuplicate =
    lastMsg.text === messageText &&
    now - lastMsg.timestamp < RATE_LIMIT_CONFIG.DUPLICATE_WINDOW_MS;

  // Update last message
  userLastMessages[userId] = { text: messageText, timestamp: now };

  return isDuplicate;
}

function checkRateLimit(userId) {
  const now = Date.now();

  // Initialize user tracking if not exists
  if (!userMessageTimestamps[userId]) {
    userMessageTimestamps[userId] = [];
  }

  // Remove timestamps outside the time window
  userMessageTimestamps[userId] = userMessageTimestamps[userId].filter(
    (timestamp) => now - timestamp < RATE_LIMIT_CONFIG.TIME_WINDOW_MS,
  );

  // Check if user exceeded rate limit
  if (
    userMessageTimestamps[userId].length >=
    RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_WINDOW
  ) {
    console.log(`⚠️ Rate limit exceeded for ${userId} - silently ignoring`);
    return {
      allowed: false,
      rateLimited: true,
    };
  }

  // Add current timestamp
  userMessageTimestamps[userId].push(now);

  return {
    allowed: true,
    rateLimited: false,
  };
}

function isMessageBeingProcessed(userId, messageId) {
  const now = Date.now();

  // Clean up old processing entries
  for (const key in processingMessages) {
    if (
      now - processingMessages[key] >
      RATE_LIMIT_CONFIG.PROCESSING_TIMEOUT_MS
    ) {
      delete processingMessages[key];
    }
  }

  const processingKey = `${userId}:${messageId}`;

  // Check if message is already being processed
  if (processingMessages[processingKey]) {
    return true;
  }

  // Mark message as being processed
  processingMessages[processingKey] = now;
  return false;
}

function markMessageProcessed(userId, messageId) {
  const processingKey = `${userId}:${messageId}`;
  delete processingMessages[processingKey];
}

// Clean up old data every 2 minutes
setInterval(() => {
  const now = Date.now();

  // Clean up message timestamps
  for (const userId in userMessageTimestamps) {
    userMessageTimestamps[userId] = userMessageTimestamps[userId].filter(
      (timestamp) => now - timestamp < RATE_LIMIT_CONFIG.TIME_WINDOW_MS,
    );

    if (userMessageTimestamps[userId].length === 0) {
      delete userMessageTimestamps[userId];
    }
  }

  // Clean up last messages
  for (const userId in userLastMessages) {
    if (
      now - userLastMessages[userId].timestamp >
      RATE_LIMIT_CONFIG.DUPLICATE_WINDOW_MS * 2
    ) {
      delete userLastMessages[userId];
    }
  }

  // Clean up processing messages
  for (const key in processingMessages) {
    if (
      now - processingMessages[key] >
      RATE_LIMIT_CONFIG.PROCESSING_TIMEOUT_MS
    ) {
      delete processingMessages[key];
    }
  }
}, 120000); // 2 minutes

async function insertBookingToSupabase(booking) {
  try {
    await supabase.from("bookings").insert([
      {
        name: booking.name,
        phone: booking.phone,
        service: booking.service,
        appointment: booking.appointment,
        status: "new",
      },
    ]);
    return true;
  } catch (err) {
    console.error("❌ Supabase error:", err.message);
    return false;
  }
}

// ✅ NEW: Find booking by phone
async function findBookingByPhone(phone) {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", phone)
      .eq("status", "new")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error("❌ Find booking error:", error);
      return null;
    }

    return data;
  } catch (err) {
    console.error("❌ Find booking exception:", err.message);
    return null;
  }
}

// ✅ NEW: Cancel booking
async function cancelBooking(id) {
  try {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "canceled" })
      .eq("id", id);

    if (error) {
      console.error("❌ Cancel booking error:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("❌ Cancel booking exception:", err.message);
    return false;
  }
}

// ==============================
// 🤖 GROQ AI
// ==============================
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

function detectLanguage(text) {
  return /[\u0600-\u06FF]/.test(text) ? "ar" : "en";
}

async function askAI(userMessage) {
  try {
    const lang = detectLanguage(userMessage);

    // ✅ Get dynamic clinic name or use default

    const clinicName = clinicSettings?.clinic_name || "عيادات بيفرلي هيلز";

    const systemPrompt =
      lang === "ar"
        ? `أنت موظف خدمة عملاء في ${clinicName}. لا تبدأ الحجز إلا إذا طلب المستخدم ذلك صراحة.`
        : `You are a clinic assistant at ${clinicName}. Do not start booking unless user asks explicitly.`;

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_completion_tokens: 300,
    });

    return completion.choices[0]?.message?.content || "";
  } catch {
    return "⚠️ حدث خطأ.";
  }
}

// ==============================
// 📞 WHATSAPP
// ==============================
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

async function sendTextMessage(to, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    { messaging_product: "whatsapp", to, text: { body: text } },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } },
  );
}

// ✅ Send image message
async function sendImageMessage(to, imageUrl, caption) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: {
          link: imageUrl,
          caption: caption,
        },
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } },
    );
  } catch (err) {
    console.error("❌ Image send error:", err.message);
  }
}

// ✅ Send doctor info
async function sendDoctorInfo(to) {
  await sendTextMessage(to, "👨‍⚕️ فريق الأطباء لدينا:");

  for (let i = 0; i < DOCTOR_INFO.length; i++) {
    const doctor = DOCTOR_INFO[i];
    const caption = `${doctor.name}\n${doctor.specialization}`;

    await sendTextMessage(to, caption);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function sendAppointmentOptions(to) {
  // ✅ Get dynamic booking times or use defaults
  const bookingTimes = clinicSettings?.booking_times || [
    "3 PM",
    "6 PM",
    "9 PM",
  ];

  // ✅ Build buttons dynamically from database settings
  const buttons = bookingTimes.slice(0, 3).map((time) => ({
    type: "reply",
    reply: {
      id: `slot_${time.toLowerCase().replace(/\s/g, "")}`,
      title: time,
    },
  }));

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "📅 اختر الموعد المناسب لك:" },
        action: { buttons },
      },
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } },
  );
}

async function sendServiceList(to) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: "اختر نوع الخدمة:" },
        action: {
          button: "الخدمات",
          sections: [
            {
              title: "الخدمات",
              rows: [
                { id: "service_فحص عام", title: "فحص عام" },
                { id: "service_تنظيف الأسنان", title: "تنظيف الأسنان" },
                { id: "service_تبييض الأسنان", title: "تبييض الأسنان" },
              ],
            },
          ],
        },
      },
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } },
  );
}

// ==============================
// 🧠 BOOKING & CANCEL STATE
// ==============================
const tempBookings = {};
const cancelSessions = {}; // NEW: Track users waiting to cancel

// ✅ Booking intent detection
function isBookingRequest(text) {
  return /(حجز|موعد|احجز|book|appointment|reserve)/i.test(text);
}

// ✅ Cancel intent detection
function isCancelRequest(text) {
  return /(الغاء|إلغاء|الغي|كنسل|cancel)/i.test(text);
}

// ✅ Doctor request detection
function isDoctorRequest(text) {
  return /(طبيب|اطباء|أطباء|الاطباء|الأطباء|دكتور|دكاترة|doctor|doctors)/i.test(
    text,
  );
}

// ✅ NEW: Reset/Start request detection
function isResetRequest(text) {
  return /(reset|start|عيد من اول|ابدا من جديد|ابدأ من جديد|من البداية|بداية جديدة|restart|new chat|ابدا|ابدأ|عيد)/i.test(
    text,
  );
}

// ==============================
// 📩 WEBHOOK
// ==============================
app.post("/webhook", async (req, res) => {
  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(200);

  const from = message.from;
  const messageId = message.id;

  // ✅ CHECK IF MESSAGE IS ALREADY BEING PROCESSED
  if (isMessageBeingProcessed(from, messageId)) {
    console.log(
      `🔄 Message ${messageId} from ${from} is already being processed - ignoring duplicate`,
    );
    return res.sendStatus(200);
  }

  try {
    // ✅ DUPLICATE MESSAGE DETECTION
    if (message.type === "text") {
      const text = message.text.body;

      if (isDuplicateMessage(from, text)) {
        console.log(`🔁 Duplicate message from ${from}: "${text}" - ignoring`);
        markMessageProcessed(from, messageId);
        return res.sendStatus(200);
      }
    }

    // ✅ RATE LIMIT CHECK
    const rateLimitCheck = checkRateLimit(from);

    if (!rateLimitCheck.allowed) {
      console.log(`⚠️ Rate limited user ${from} - silently ignoring`);
      markMessageProcessed(from, messageId);
      return res.sendStatus(200);
    }

    // ---------------- BUTTONS ----------------
    if (message.type === "interactive") {
      const id =
        message.interactive?.list_reply?.id ||
        message.interactive?.button_reply?.id;

      if (id.startsWith("slot_")) {
        tempBookings[from] = {
          appointment: id.replace("slot_", "").toUpperCase(),
        };
        await sendTextMessage(from, "👍 أرسل اسمك:");
        markMessageProcessed(from, messageId);
        return res.sendStatus(200);
      }

      if (id.startsWith("service_")) {
        const booking = tempBookings[from];
        booking.service = id.replace("service_", "");

        await insertBookingToSupabase(booking);

        await sendTextMessage(
          from,
          `✅ تم تأكيد الحجز:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`,
        );

        delete tempBookings[from];
        markMessageProcessed(from, messageId);
        return res.sendStatus(200);
      }
    }

    // ---------------- TEXT ----------------
    if (message.type === "text") {
      const text = message.text.body;

      console.log("📩 Message from:", from, "Text:", text);

      // ✅ PRIORITY 0: RESET/START DETECTION (HIGHEST PRIORITY!)
      if (isResetRequest(text)) {
        console.log("🔄 Reset request detected!");

        // Clear all user sessions
        delete tempBookings[from];
        delete cancelSessions[from];

        const lang = detectLanguage(text);
        const clinicName =
          clinicSettings?.clinic_name ||
          (lang === "ar" ? "عيادات بيفرلي هيلز" : "Beverly Hills Clinic");

        const greeting =
          lang === "ar"
            ? `👋 مرحباً بك في ${clinicName}!\n\nكيف يمكنني مساعدتك اليوم؟`
            : `👋 Hello! Welcome to ${clinicName}!\n\nHow can I help you today?`;

        await sendTextMessage(from, greeting);
        markMessageProcessed(from, messageId);
        return res.sendStatus(200);
      }

      // ✅ PRIORITY 1: CANCEL DETECTION (MUST BE FIRST!)
      if (isCancelRequest(text) && !tempBookings[from]) {
        console.log("🚫 Cancel request detected!");

        cancelSessions[from] = true;

        // Clear any ongoing booking
        if (tempBookings[from]) {
          delete tempBookings[from];
        }

        await sendTextMessage(from, "📌 أرسل رقم الجوال المستخدم في الحجز:");
        markMessageProcessed(from, messageId);
        return res.sendStatus(200);
      }

      // ✅ PRIORITY 2: User is in cancel flow - waiting for phone
      if (cancelSessions[from]) {
        const phone = text.replace(/\D/g, "");

        if (phone.length < 8) {
          await sendTextMessage(from, "⚠️ رقم الجوال غير صحيح. حاول مجددًا:");
          markMessageProcessed(from, messageId);
          return res.sendStatus(200);
        }

        // Find booking
        const booking = await findBookingByPhone(phone);

        if (!booking) {
          await sendTextMessage(from, "❌ لا يوجد حجز مرتبط بهذا الرقم.");
          delete cancelSessions[from];
          markMessageProcessed(from, messageId);
          return res.sendStatus(200);
        }

        // Cancel it
        const success = await cancelBooking(booking.id);

        if (success) {
          await sendTextMessage(
            from,
            `🟣 تم إلغاء الحجز:\n👤 ${booking.name}\n💊 ${booking.service}\n📅 ${booking.appointment}`,
          );
        } else {
          await sendTextMessage(from, "⚠️ حدث خطأ أثناء الإلغاء.");
        }

        delete cancelSessions[from];
        markMessageProcessed(from, messageId);
        return res.sendStatus(200);
      }

      // ✅ PRIORITY 3: Doctor request
      if (!tempBookings[from] && isDoctorRequest(text)) {
        await sendDoctorInfo(from);
        markMessageProcessed(from, messageId);
        return res.sendStatus(200);
      }

      // ✅ PRIORITY 4: Start booking
      if (!tempBookings[from] && isBookingRequest(text)) {
        console.log("📅 Starting booking for:", from);
        tempBookings[from] = {};
        await sendAppointmentOptions(from);
        markMessageProcessed(from, messageId);
        return res.sendStatus(200);
      }

      // ✅ PRIORITY 5: In booking flow - collect name
      if (tempBookings[from] && !tempBookings[from].name) {
        tempBookings[from].name = text;
        await sendTextMessage(from, "📱 أرسل رقم الجوال:");
        markMessageProcessed(from, messageId);
        return res.sendStatus(200);
      }

      // ✅ PRIORITY 6: In booking flow - collect phone
      if (tempBookings[from] && !tempBookings[from].phone) {
        tempBookings[from].phone = text.replace(/\D/g, "");
        await sendServiceList(from);
        markMessageProcessed(from, messageId);
        return res.sendStatus(200);
      }

      // ✅ PRIORITY 7: General question - send to AI
      // ✅ PRIORITY 7: General question - send to AI
      // ✅ PRIORITY 7: General question - send to AI
      // ✅ PRIORITY 7: General question - send to AI
      // ✅ PRIORITY 7: General question - send to AI
      if (!tempBookings[from]) {
        // ✅ Phone number
        if (/(رقم|جوال|هاتف|اتصال|phone|number|contact)/i.test(text)) {
          await sendTextMessage(from, "📞 رقم العيادة: 0590450555");
          markMessageProcessed(from, messageId);
          return res.sendStatus(200);
        }

        // ✅ Location
        if (/(موقع|لوكيشن|وين|اين|العنوان|location|map|address)/i.test(text)) {
          await sendTextMessage(
            from,
            "📍 موقعنا:\nعيادات بيفرلي هيلز - حي السليمانية\nhttps://maps.app.goo.gl/hDHSJMRJ6hWShciB7?g_st=ic",
          );
          markMessageProcessed(from, messageId);
          return res.sendStatus(200);
        }

        // ✅ Working hours
        if (
          /(دوام|ساعات|متى تفتح|متى تقفل|مواعيد|hours|open|time)/i.test(text)
        ) {
          await sendTextMessage(
            from,
            "🕒 ساعات العمل:\nمن 2 ظهراً إلى 10 مساءً",
          );
          markMessageProcessed(from, messageId);
          return res.sendStatus(200);
        }

        // ✅ Services
        if (
          /(خدمات|service|services|وش عندكم|ايش تقدمون|what do you offer)/i.test(
            text,
          )
        ) {
          await sendTextMessage(
            from,
            `💎 خدماتنا:

• فيلر  
• بوتكس  
• محفزات الكولاجين  
• ليزر  
• هيدرافيشل  
• تشقير حواجب  
• تشقير وجه  
• فيلر الجسم  
• تنظيف الأسنان  
• تنظيف البشرة`,
          );
          markMessageProcessed(from, messageId);
          return res.sendStatus(200);
        }

        // ✅ Prices
        if (/(سعر|اسعار|الاسعار|كم|price|prices|cost)/i.test(text)) {
          await sendTextMessage(
            from,
            `💰 الأسعار:

• 1 مل فيلر — 610 ر.س  
• 1 مل بوتكس — 540 ر.س  
• اسكلبترا (10 مل) — 2350 ر.س  
• ريتش (5 مل) — 1699 ر.س  
• بروفايلو — 999 ر.س  
• مورفيس مع بلازما — 850 ر.س  
• فراكشنال جلسة — 250 ر.س  
• ابرة السالمون (2.5 مل) — 1199 ر.س  
• هيدرافيشل — 260 ر.س  
• هيدرافيشل الملكي — 326 ر.س  
• ديرما بن — 399 ر.س  
• ابرة تفتيح التصبغات — 699 ر.س`,
          );
          markMessageProcessed(from, messageId);
          return res.sendStatus(200);
        }

        // ✅ Offers
        if (/(عرض|عروض|offer|offers|discount)/i.test(text)) {
          await sendTextMessage(
            from,
            `🔥 العروض الحالية:

❤️ 4 جلسات ليزر جسم + 4 رتوش (630) + تشقير حواجب هدية  
❤️ ابرة سكلبترا لشد وتحفيز الكولاجين — 1999  
❤️ 2 مل فيلر ألماني 1299 والثالث مجاناً  
❤️ جلسة مورفيس 899 والثانية بريال  
• جلستين بلازما + جلستين ترانزيمك اسيد 599 + تنظيف بشرة مجاناً  
❤️ تنظيف أسنان — 99  
❤️ جلسة اكسوزوم مع ديرمابن — 499  
• ابرة انوفيال تحت العين (1 مل) — 450  
❤️ تنظيف بشرة هايدرافيشل 250 + ماسك + تشقير حواجب مجاناً  
❤️ 3 جلسات تشقير حواجب — 79  

📞 للحجز:
0536990405  
0569064964  

💳 يوجد تمارا وتابي وتحويل بنكي`,
          );
          markMessageProcessed(from, messageId);
          return res.sendStatus(200);
        }

        // ✅ Payment methods
        if (/(دفع|طريقة الدفع|طرق الدفع|pay|payment|visa|mada)/i.test(text)) {
          await sendTextMessage(
            from,
            `💳 طرق الدفع المتاحة:

• كاش  
• فيزا  
• مدى  
• تحويل بنكي  
• تابي  
• تمارا`,
          );
          markMessageProcessed(from, messageId);
          return res.sendStatus(200);
        }

        // ✅ Social Media (NEW 📱🔥)
        if (
          /(انستقرام|انستغرام|instagram|سوشيال|تواصل|social|حساب)/i.test(text)
        ) {
          await sendTextMessage(
            from,
            `📱 حساباتنا على مواقع التواصل:

Instagram:
https://www.instagram.com/beverlyhills.clinic?igsh=MXlyM21vcXlkdW5m&utm_source=qr`,
          );
          markMessageProcessed(from, messageId);
          return res.sendStatus(200);
        }

        // 🤖 AI fallback
        const reply = await askAI(text);
        await sendTextMessage(from, reply);
        markMessageProcessed(from, messageId);
        return res.sendStatus(200);
      }
    }

    markMessageProcessed(from, messageId);
  } catch (error) {
    console.error("❌ Error processing message:", error);
    markMessageProcessed(from, messageId);
  }

  res.sendStatus(200);
});

// ✅ Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running on port", PORT));
