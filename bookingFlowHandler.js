/**
 * bookingFlowHandler.js (FINAL — Stable)
 *
 * Responsibilities:
 * - Handle booking flow (name → phone → service)
 * - Handle cancel flow (detect → ask for phone → cancel)
 * - Handle interactive buttons (slots + services)
 * - AI fallback when no active flow
 */

const {
  askAI,
  sendTextMessage,
  sendAppointmentOptions,
  insertBookingToSupabase,
  askForCancellationPhone,
  processCancellation,
} = require("./helpers");

const { isBookingRequest, isCancelRequest } = require("./messageHandlers");

const {
  handleNameStep,
  handlePhoneStep,
  handleServiceStep,
} = require("./bookingSteps");

// ---------------------------------------------
// 🧠 Sessions (per user)
// ---------------------------------------------
const sessions = {}; // { userId: { waitingForCancelPhone: boolean } }

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = {
      waitingForCancelPhone: false,
    };
  }
  return sessions[userId];
}

/**
 * ===========================
 *  📌 HANDLE INTERACTIVE (BUTTON / LIST)
 * ===========================
 */
async function handleInteractiveMessage(message, from, tempBookings) {
  const type = message.interactive?.type;
  const id =
    type === "list_reply"
      ? message.interactive?.list_reply?.id
      : message.interactive?.button_reply?.id;

  if (!id) return;

  console.log("🔘 Interactive:", from, id);

  // ---------------- SLOT ----------------
  if (id.startsWith("slot_")) {
    const appointment = id.replace("slot_", "").toUpperCase();

    tempBookings[from] = { appointment };

    await sendTextMessage(from, "👍 تم اختيار الموعد! الآن أرسل اسمك:");
    return;
  }

  // ---------------- SERVICE ----------------
  if (id.startsWith("service_")) {
    const booking = tempBookings[from];

    if (!booking || !booking.phone) {
      await sendTextMessage(from, "⚠️ يجب إكمال خطوات الحجز بالترتيب أولاً.");
      return;
    }

    booking.service = id.replace("service_", "");

    // 🔒 SAVE ONLY ONCE
    await insertBookingToSupabase(booking);

    await sendTextMessage(
      from,
      `✅ تم حفظ حجزك بنجاح:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`,
    );

    delete tempBookings[from];
    return;
  }
}

/**
 * ===========================
 *  💬 HANDLE TEXT MESSAGES
 * ===========================
 */
async function handleTextMessage(text, from, tempBookings) {
  const session = getSession(from);

  /**
   * ---------------------------------------------
   * ❌ CANCEL FLOW
   * ---------------------------------------------
   */
  if (isCancelRequest(text)) {
    session.waitingForCancelPhone = true;

    // cancel any active booking
    if (tempBookings[from]) delete tempBookings[from];

    await askForCancellationPhone(from);
    return;
  }

  if (session.waitingForCancelPhone) {
    const phone = text.replace(/\D/g, "");

    if (phone.length < 8) {
      await sendTextMessage(from, "⚠️ رقم الجوال غير صحيح. حاول مجددًا:");
      return;
    }

    session.waitingForCancelPhone = false;
    await processCancellation(from, phone);
    return;
  }

  /**
   * ---------------------------------------------
   * 📅 BOOKING FLOW
   * ---------------------------------------------
   */

  // shortcut: 3 / 6 / 9
  if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
    tempBookings[from] = { appointment: `${text} PM` };
    await sendTextMessage(from, "👍 تم اختيار الموعد! الآن أرسل اسمك:");
    return;
  }

  if (tempBookings[from] && !tempBookings[from].name) {
    await handleNameStep(text, from, tempBookings);
    return;
  }

  if (tempBookings[from] && !tempBookings[from].phone) {
    await handlePhoneStep(text, from, tempBookings);
    return;
  }

  if (tempBookings[from] && !tempBookings[from].service) {
    await handleServiceStep(text, from, tempBookings);
    return;
  }

  // start booking explicitly
  if (!tempBookings[from] && isBookingRequest(text)) {
    await sendAppointmentOptions(from);
    return;
  }

  /**
   * ---------------------------------------------
   * 🤖 AI FALLBACK (NO ACTIVE FLOW)
   * ---------------------------------------------
   */
  if (!tempBookings[from]) {
    const reply = await askAI(text);
    await sendTextMessage(from, reply);
  }
}

// ---------------------------------------------
module.exports = {
  getSession,
  handleInteractiveMessage,
  handleTextMessage,
};
