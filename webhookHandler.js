/**
 * webhookHandler.js
 * FIXED - With Voice Reply Support
 */

import {
  askAI,
  sendTextMessage,
  sendAppointmentOptions,
  askForCancellationPhone,
  processCancellation,
  generateVoice,
  sendVoiceMessage,
} from "./helpers.js";

// media functions
import {
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  sendOffersValidity,
} from "./mediaService.js";

// ban words
import { containsBanWords, sendBanWordsResponse } from "./contentFilter.js";

// detection helpers
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

// ✅ Import transcription
import { transcribeAudio } from "./transcriptionService.js";

import {
  getSession,
  handleInteractiveMessage,
  handleTextMessage,
} from "./bookingFlowHandler.js";

// ---------------------------------------------
// 🎙️ AUDIO HANDLER - WITH VOICE REPLY
// ---------------------------------------------
async function handleAudioMessage(message, from) {
  console.log(`🎤 Audio message received from ${from}`);

  try {
    const session = getSession(from);
    session.lastMessageType = "audio";

    // Step 1: Transcribe audio
    const transcript = await transcribeAudio(message?.audio?.id, from);
    console.log(`📝 Transcript: "${transcript}"`);

    if (!transcript) {
      const voice = await generateVoice("لم أفهم، حاول مرة أخرى.");
      await sendVoiceMessage(from, voice);
      return;
    }

    // Step 2: Check for greeting
    if (isGreeting(transcript)) {
      const reply = getGreeting(isEnglish(transcript));
      const voice = await generateVoice(reply);
      await sendVoiceMessage(from, voice);
      return;
    }

    // Step 3: Check for location
    if (isLocationRequest(transcript)) {
      await sendLocationMessages(from, isEnglish(transcript) ? "en" : "ar");
      return;
    }

    // Step 4: Check for offers
    if (isOffersRequest(transcript)) {
      const lang = isEnglish(transcript) ? "en" : "ar";
      await sendOffersValidity(from, lang);
      return;
    }

    // Step 5: Check for doctors
    if (isDoctorsRequest(transcript)) {
      const lang = isEnglish(transcript) ? "en" : "ar";
      await sendDoctorsImages(from, lang);
      return;
    }

    // Step 6: Check for cancellation
    if (isCancelRequest(transcript)) {
      session.waitingForCancelPhone = true;
      await askForCancellationPhone(from, true); // ✅ Voice mode
      return;
    }

    // Step 7: Default - Ask AI and reply with voice
    console.log("🤔 Asking AI for response...");
    const answer = await askAI(transcript);
    console.log(`💬 AI Answer: "${answer}"`);

    const voice = await generateVoice(answer);
    await sendVoiceMessage(from, voice);
  } catch (err) {
    console.error("❌ Audio handling error:", err.message);
    console.error(err.stack);

    // Send error voice message
    try {
      const voice = await generateVoice("عذراً، حدث خطأ. حاول مرة أخرى.");
      await sendVoiceMessage(from, voice);
    } catch (voiceErr) {
      console.error("❌ Could not send error voice:", voiceErr.message);
    }
  }
}

// ---------------------------------------------
// REGISTER WHATSAPP WEBHOOK ROUTES
// ---------------------------------------------
function registerWebhookRoutes(app, VERIFY_TOKEN) {
  // ---------------------------------
  // GET — Verify Webhook
  // ---------------------------------
  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  });

  // ---------------------------------
  // POST — Receive WhatsApp Events
  // ---------------------------------
  app.post("/webhook", async (req, res) => {
    try {
      const body = req.body;

      const message =
        body.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || null;

      if (!message) return res.sendStatus(200);

      const from = message.from;
      const text = message.text?.body?.trim() || null;

      const session = getSession(from);
      const tempBookings = (global.tempBookings = global.tempBookings || {});

      // 🎙️ AUDIO - Handle voice messages with voice replies
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

      // 👋 GREETING
      if (isGreeting(text)) {
        const reply = getGreeting(isEnglish(text));
        await sendTextMessage(from, reply);
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
          await sendTextMessage(from, "⚠️ رقم الجوال غير صحيح. حاول مرة أخرى:");
          return res.sendStatus(200);
        }

        session.waitingForCancelPhone = false;
        await processCancellation(from, phone);
        return res.sendStatus(200);
      }

      // 🗓️ BOOKING FLOW
      await handleTextMessage(text, from, tempBookings);

      return res.sendStatus(200);
    } catch (err) {
      console.error("❌ Webhook Handler Error:", err);
      return res.sendStatus(500);
    }
  });
}

export { registerWebhookRoutes };
