import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
  // =============================
  // ✅ 1. WEBHOOK VERIFICATION
  // =============================
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
      console.log("Webhook verified ✅");
      return res.status(200).send(challenge);
    }

    return res.status(403).send("Verification failed");
  }

  // =============================
  // ✅ 2. RECEIVE MESSAGES
  // =============================
  if (req.method === "POST") {
    try {
      const body = req.body;

      const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (!message) {
        return res.sendStatus(200);
      }

      const from = message.from;
      const text = message.text?.body || "Unsupported message type";

      await supabase.from("whatsapp_messages").insert([
        {
          from_number: from,
          message_body: text,
          direction: "inbound",
          created_at: new Date().toISOString(),
        },
      ]);

      console.log("Message saved to Supabase ✅");

      return res.sendStatus(200);
    } catch (err) {
      console.error("Webhook error:", err);
      return res.sendStatus(500);
    }
  }

  res.sendStatus(405);
}
