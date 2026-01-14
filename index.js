import express from "express";
import axios from "axios";

// ==============================
// 📦 IMPORT MODULED FILES
// ==============================
import { registerWebhookRoutes } from "./webhookHandler.js";
import { webhookCandy } from "./webhookCandy.js";

// ==============================
// 🚀 APP SETUP
// ==============================
const app = express();
app.use(express.json());

// ==============================
// ✅ ROOT ROUTE
// ==============================
app.get("/", (req, res) => {
  res.send("WhatsApp Webhook is running 🚀");
});

// ==============================
// 🍬 WEBSITE / SUPABASE WEBHOOK
// ==============================
app.options("/webhook-candy", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return res.status(200).end();
});

app.post("/webhook-candy", webhookCandy);

// ==============================
// 📲 WHATSAPP WEBHOOK
// - GET  /webhook → Meta verification
// - POST /webhook → Messages
// ==============================
registerWebhookRoutes(app, process.env.VERIFY_TOKEN);

// ==============================
// 🧪 HEALTH CHECK (OPTIONAL)
// ==============================
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ==============================
// ❌ 404 HANDLER
// ==============================
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
  });
});

// ==============================
// 🛑 GLOBAL ERROR HANDLER
// ==============================
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
  });
});

// ==============================
// 🔊 START SERVER
// ==============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ WhatsApp Webhook server running on port ${PORT}`);
});
