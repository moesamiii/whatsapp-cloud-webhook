/**
 * detectionHelpers.js (FINAL – Doctors / Booking FIXED)
 */

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

// ✅ Initialize Supabase
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

// ✅ Load settings on module initialization
loadClinicSettings();

// ---------------------------------------------
// 🔧 Helper Functions
// ---------------------------------------------
function includesAny(list, text) {
  const lower = String(text || "").toLowerCase();
  return list.some((word) => lower.includes(word));
}

function getRandomIndex(length) {
  const randomBuffer = crypto.randomBytes(2);
  const randomNumber = parseInt(randomBuffer.toString("hex"), 16);
  return randomNumber % length;
}

// ---------------------------------------------
// 👋 Greeting Detector and Random Response
// ---------------------------------------------
function getGreeting(isEnglish = false) {
  // ✅ Get dynamic clinic name or use default

  const clinicName = "عيادات بيفرلي هيلز";

  const englishGreetings = [
    `👋 Hello! Welcome to *${clinicName}*! How can I assist you today?`,
    `Hi there! 😊 How can I help you book an appointment or learn more about our services?`,
    `Welcome to *${clinicName}*! How can I support you today?`,
    `Hey! 👋 Glad to see you at *${clinicName}*! What can I do for you today?`,
    `✨ Hello and welcome to *${clinicName}*! Are you interested in our offers or booking a visit?`,
    `Good day! 💚 How can I assist you with your dental needs today?`,
    `😊 Hi! You've reached *${clinicName}*, your smile is our priority!`,
    `👋 Hello there! Would you like to see our latest offers or book an appointment?`,
    `Welcome! 🌸 How can I help you take care of your smile today?`,
    `💬 Hi! How can I help you find the right service or offer at *${clinicName}*?`,
  ];

  const arabicGreetings = [
    `👋 أهلاً وسهلاً في *${clinicName}*! 📞 رقمنا: 0590450555 كيف نقدر نخدمك؟`,
    `مرحباً بك في عيادتنا 💚 هل ترغب بحجز موعد أو الاستفسار عن خدمة؟`,
    `أهلاً بك 👋 يسعدنا تواصلك مع *${clinicName}*، كيف نقدر نخدمك اليوم؟`,
    `🌸 حيّاك الله! وش أكثر خدمة حاب تستفسر عنها اليوم؟`,
    `✨ أهلاً وسهلاً! هل ترغب بالتعرف على عروضنا أو حجز موعد؟`,
    `💚 يسعدنا تواصلك مع *${clinicName}*! كيف ممكن نساعدك اليوم؟`,
    `😊 مرحباً بك! تقدر تسأل عن أي خدمة أو عرض متوفر حالياً.`,
    `👋 أهلين وسهلين فيك! وش الخدمة اللي حاب تعرف عنها أكثر؟`,
    `🌷 يا مرحبا! كيف نقدر نساعدك اليوم في *${clinicName}*؟`,
    `💬 أهلاً بك! هل ترغب بحجز موعد أو الاطلاع على عروضنا الحالية؟`,
  ];

  const replies = isEnglish ? englishGreetings : arabicGreetings;
  return replies[getRandomIndex(replies.length)];
}

function isGreeting(text = "") {
  const greetingsKeywords = [
    "hi",
    "hello",
    "hey",
    "morning",
    "evening",
    "good",
    "welcome",
    "هلا",
    "مرحبا",
    "السلام",
    "اهلا",
    "أهلاً",
    "اهلين",
    "هاي",
    "شلونك",
    "صباح",
    "مساء",
  ];
  return includesAny(greetingsKeywords, text);
}

// ---------------------------------------------
// 🗺️ Location Detection
// ---------------------------------------------
function isLocationRequest(text = "") {
  const keywords = [
    "موقع",
    "مكان",
    "عنوان",
    "وين",
    "فين",
    "أين",
    "location",
    "where",
    "address",
    "maps",
    "وينكم",
    "فينكم",
  ];
  return includesAny(keywords, text);
}

// ---------------------------------------------
// 🎁 Offers Detection
// ---------------------------------------------
function isOffersRequest(text = "") {
  const keywords = [
    "عروض",
    "عرض",
    "خصم",
    "خصومات",
    "تخفيض",
    "باقات",
    "باكيج",
    "بكج",
    "offer",
    "offers",
    "discount",
    "deal",
  ];
  return includesAny(keywords, text);
}

function isOffersConfirmation(text = "") {
  const normalizedText = String(text || "")
    .replace(/\u0640/g, "")
    .replace(/[^\u0600-\u06FFa-zA-Z0-9 ]/g, "")
    .toLowerCase();

  const patterns = [
    "ارسل",
    "رسل",
    "ابي",
    "ابغى",
    "نعم",
    "ايه",
    "ايوه",
    "yes",
    "ok",
    "send",
    "show",
  ];

  return patterns.some((p) => normalizedText.includes(p));
}

// ---------------------------------------------
// 👨‍⚕️ Doctors Detection (IMPORTANT)
// ---------------------------------------------
function isDoctorsRequest(text = "") {
  const keywords = [
    "الأطباء",
    "اطباء",
    "أطباء",
    "الدكاترة",
    "دكاترة",
    "دكتور",
    "طبيب",
    "طاقم طبي",
    "فريق طبي",
    "doctor",
    "doctors",
    "dr",
  ];
  return includesAny(keywords, text);
}

// ---------------------------------------------
// 📅 Booking Detection (ONLY booking words)
// ---------------------------------------------
function isBookingRequest(text = "") {
  const keywords = [
    "حجز",
    "احجز",
    "موعد",
    "ابي احجز",
    "ابغى احجز",
    "book",
    "booking",
    "appointment",
    "reserve",
  ];
  return includesAny(keywords, text);
}

// ---------------------------------------------
// ❌ Cancel Booking Detection
// ---------------------------------------------
function isCancelRequest(text = "") {
  const keywords = [
    "الغاء",
    "إلغاء",
    "الغي",
    "كنسل",
    "cancel",
    "cancel booking",
    "cancel appointment",
    "ابغى الغي",
    "ابي الغي",
  ];
  return includesAny(keywords, text);
}

// ---------------------------------------------
// 🌐 Language Detection
// ---------------------------------------------
function isEnglish(text = "") {
  const arabicPattern = /[\u0600-\u06FF]/;
  return !arabicPattern.test(text);
}

// ---------------------------------------------
module.exports = {
  isLocationRequest,
  isOffersRequest,
  isOffersConfirmation,
  isDoctorsRequest,
  isBookingRequest,
  isCancelRequest,
  isEnglish,
  isGreeting,
  getGreeting,
};
