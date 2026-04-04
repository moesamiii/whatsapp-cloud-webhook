/**
 * webhookHandler.js
 * FIXED — Phone number hallucination prevention
 */

import {
  askAI,
  sendTextMessage,
  sendAppointmentOptions,
  askForCancellationPhone,
  processCancellation,
} from "./helpers.js";

import {
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  sendOffersValidity,
} from "./mediaService.js";

import { containsBanWords, sendBanWordsResponse } from "./contentFilter.js";

import {
  isLocationRequest,
  isOffersRequest,
  isOffersConfirmation,
  isDoctorsRequest,
  isBookingRequest,
  isCancelRequest,
  isEnglish,
  isGreeting,
  getGreeting,
} from "./messageHandlers.js";

import { handleAudioMessage } from "./webhookProcessor.js";

import {
  getSession,
  handleInteractiveMessage,
  handleTextMessage,
} from "./bookingFlowHandler.js";

// =============================================
// 🔒 PHONE NUMBER CONFIG — CHANGE ONLY HERE
// =============================================
const CLINIC_PHONE = "0590450555";

// =============================================
// 🔒 PHONE INTENT DETECTION
// =============================================
function isPhoneRequest(text = "") {
  return /(رقم|الرقم|رقمكم|جوال|اتصال|تواصل|هاتف|كيف اتواصل|رقم التواصل|تلفون|موبايل|phone|number|call|contact|reach|tel|whatsapp)/i.test(
    text,
  );
}

// =============================================
// 🔒 SANITIZE OUTGOING TEXT — LAST SAFETY NET
// Replaces any phone-like number in bot reply
// with the correct clinic number
// =============================================
function sanitizePhoneInText(text = "") {
  // Match numbers that look like phone numbers:
  // - 8+ digits possibly with spaces, dashes, dots
  // - Starting with 00, +, 05, 009
  return text.replace(
    /(\+?00?\d[\d\s\-\.]{7,}|\b05\d[\d\s\-]{6,}|\b9\d{8,})/g,
    CLINIC_PHONE,
  );
}

// Wrap sendTextMessage to always sanitize
async function safeSend(to, text) {
  const clean = sanitizePhoneInText(text);
  await sendTextMessage(to, clean);
}

// =============================================
// REGISTER WEBHOOK ROUTES
// =============================================
function registerWebhookRoutes(app, VERIFY_TOKEN) {
  // GET — Verify Webhook
  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  });

  // POST — Receive WhatsApp Messages
  app.post("/webhook", async (req, res) => {
    try {
      const body = req.body;
      const message =
        body.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || null;

      if (!message) return res.sendStatus(200);

      const from = message.from;
      const text = message.text?.body?.trim() || null;

      // =============================================
      // 🔒 PRIORITY 0: PHONE INTERCEPT
      // Must be FIRST — before greeting, before AI
      // =============================================
      if (text && isPhoneRequest(text)) {
        await safeSend(
          from,
          isEnglish(text)
            ? `📞 Our clinic phone number: ${CLINIC_PHONE}`
            : `📞 رقم العيادة: ${CLINIC_PHONE}`,
        );
        return res.sendStatus(200);
      }

      const session = getSession(from);
      const tempBookings = (global.tempBookings = global.tempBookings || {});

      // 🎙️ AUDIO
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      // 🎛️ INTERACTIVE
      if (message.type === "interactive") {
        await handleInteractiveMessage(message, from, tempBookings);
        return res.sendStatus(200);
      }

      // Ignore non-text
      if (!text) return res.sendStatus(200);

      // =============================================
      // 👋 GREETING
      // =============================================
      if (isGreeting(text)) {
        const reply = getGreeting(isEnglish(text));
        // sanitize in case greeting template has wrong number
        await safeSend(from, reply);
        return res.sendStatus(200);
      }

      // 🚫 BAN WORDS
      if (containsBanWords(text)) {
        const lang = isEnglish(text) ? "en" : "ar";
        await sendBanWordsResponse(from, lang);
        delete tempBookings[from];
        session.waitingForCancelPhone = false;
        return res.sendStatus(200);
      }

      // 🌍 LOCATION
      if (isLocationRequest(text)) {
        const lang = isEnglish(text) ? "en" : "ar";
        await sendLocationMessages(from, lang);
        return res.sendStatus(200);
      }

      // 🎁 OFFERS
      if (isOffersRequest(text)) {
        session.waitingForOffersConfirmation = true;
        const lang = isEnglish(text) ? "en" : "ar";
        await sendOffersValidity(from, lang);
        return res.sendStatus(200);
      }

      if (session.waitingForOffersConfirmation) {
        if (isOffersConfirmation(text)) {
          session.waitingForOffersConfirmation = false;
          const lang = isEnglish(text) ? "en" : "ar";
          await sendOffersImages(from, lang);
          return res.sendStatus(200);
        }
        session.waitingForOffersConfirmation = false;
      }

      // 👨‍⚕️ DOCTORS
      if (isDoctorsRequest(text)) {
        const lang = isEnglish(text) ? "en" : "ar";
        await sendDoctorsImages(from, lang);
        return res.sendStatus(200);
      }

      // ❗ CANCEL BOOKING
      if (isCancelRequest(text)) {
        session.waitingForCancelPhone = true;
        delete tempBookings[from];
        await askForCancellationPhone(from);
        return res.sendStatus(200);
      }

      if (session.waitingForCancelPhone) {
        const phone = text.replace(/\D/g, "");

        if (phone.length < 8) {
          await safeSend(from, "⚠️ رقم الجوال غير صحيح. حاول مرة أخرى:");
          return res.sendStatus(200);
        }

        session.waitingForCancelPhone = false;
        await processCancellation(from, phone);
        return res.sendStatus(200);
      }

      // =============================================
      // 🗓️ BOOKING FLOW
      // =============================================
      await handleTextMessage(text, from, tempBookings);

      return res.sendStatus(200);
    } catch (err) {
      console.error("❌ Webhook Handler Error:", err);
      return res.sendStatus(500);
    }
  });
}

export { registerWebhookRoutes };
