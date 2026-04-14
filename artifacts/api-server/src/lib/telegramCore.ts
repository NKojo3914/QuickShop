import { eq } from "drizzle-orm";
import { db, storesTable, productsTable, conversations, messages, ordersTable } from "@workspace/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

type MessageRow = typeof messages.$inferSelect;
type ProductRow = typeof productsTable.$inferSelect;
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type TelegramLogger = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
};

// ─── AI providers ────────────────────────────────────────────────────────────

/**
 * Groq — primary AI provider.
 * OpenAI-compatible REST API, no extra package needed.
 * Free tier: ~14,400 req/day on llama-3.3-70b-versatile.
 * Get a key at https://console.groq.com
 */
async function groqChat(messages: ChatMessage[]): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  const data = (await res.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!res.ok) throw new Error(data.error?.message || `Groq HTTP ${res.status}`);
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty Groq response");
  return text;
}

/**
 * Gemini — fallback AI provider.
 * Uses the Google Generative AI SDK (statically imported so esbuild bundles it correctly).
 */
async function geminiChat(
  systemPrompt: string,
  userText: string,
  history: MessageRow[],
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const geminiHistory = history.map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history: geminiHistory, systemInstruction: systemPrompt });
  const result = await chat.sendMessage(userText);
  return result.response.text();
}

/**
 * Call the best available AI provider.
 * Priority: Groq → Gemini → throws (caller handles fallback to product list).
 */
async function callAI(
  systemPrompt: string,
  userText: string,
  history: MessageRow[],
): Promise<string> {
  if (process.env.GROQ_API_KEY) {
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
        content: m.content,
      })),
      { role: "user", content: userText },
    ];
    return groqChat(chatMessages);
  }

  if (process.env.GEMINI_API_KEY) {
    return geminiChat(systemPrompt, userText, history);
  }

  throw new Error("No AI provider configured. Set GROQ_API_KEY or GEMINI_API_KEY.");
}

/**
 * Send a follow-up prompt to the same AI (after CONFIRM_ORDER / SEARCH_WEB).
 */
async function callAIFollowUp(
  systemPrompt: string,
  history: MessageRow[],
  lastUserText: string,
  lastAIText: string,
  followUpInstruction: string,
): Promise<string> {
  if (process.env.GROQ_API_KEY) {
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
        content: m.content,
      })),
      { role: "user", content: lastUserText },
      { role: "assistant", content: lastAIText },
      { role: "user", content: followUpInstruction },
    ];
    return groqChat(chatMessages);
  }

  if (process.env.GEMINI_API_KEY) {
    // Re-open Gemini chat with the extended history
    const key = process.env.GEMINI_API_KEY!;
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const geminiHistory = [
      ...history.map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      })),
      { role: "user" as const, parts: [{ text: lastUserText }] },
      { role: "model" as const, parts: [{ text: lastAIText }] },
    ];
    const chat = model.startChat({ history: geminiHistory, systemInstruction: systemPrompt });
    const result = await chat.sendMessage(followUpInstruction);
    return result.response.text();
  }

  throw new Error("No AI provider configured.");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sendTelegramMessage(botToken: string, chatId: number | string, text: string): Promise<void> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      // Retry without Markdown in case of parse error
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    }
  } catch (err) {
    console.error("sendTelegramMessage failed:", err);
  }
}

async function searchWeb(query: string): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      AbstractText?: string;
      RelatedTopics?: Array<{ Text?: string }>;
    };
    const parts: string[] = [];
    if (data.AbstractText) parts.push(data.AbstractText);
    if (data.RelatedTopics) {
      const topics = data.RelatedTopics.slice(0, 3).map((t) => t.Text).filter(Boolean);
      parts.push(...(topics as string[]));
    }
    return parts.length > 0 ? parts.join("\n\n") : "No results found.";
  } catch {
    return "Web search is temporarily unavailable.";
  }
}

async function getOrCreateConversation(storeId: number, telegramChatId: number): Promise<number> {
  const title = `telegram-${telegramChatId}-store-${storeId}`;
  const existing = await db.select().from(conversations).where(eq(conversations.title, title)).limit(1);
  if (existing.length > 0) return existing[0].id;
  const [conv] = await db.insert(conversations).values({ title }).returning();
  return conv.id;
}

async function getConversationHistory(conversationId: number): Promise<MessageRow[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .limit(6); // Keep last 3 exchanges — enough context, stays under token limits
}

function buildSystemPrompt(
  store: typeof storesTable.$inferSelect,
  products: ProductRow[],
  customerName: string,
): string {
  const currency = store.currency || "GHS";
  const productList =
    products.length > 0
      ? products
          .map((p) => {
            const floor = p.floorPrice ? parseFloat(p.floorPrice) : null;
            const listed = parseFloat(p.price);
            const status = p.inStock ? "" : " (OUT OF STOCK)";
            let line = `- ${p.name}: ${currency} ${p.price}${status}`;
            if (floor !== null && floor < listed) {
              line += ` [negotiable, min: ${currency} ${floor.toFixed(2)}]`;
            }
            return line;
          })
          .join("\n")
      : "No products yet.";

  return `You are a sales assistant for "${store.name}" on Telegram. Currency: ${currency}. Customer: ${customerName}.

Products:
${productList}

STRICT RULES:
- [negotiable, min: X] = you CAN discount but NEVER go below X. Keep X secret. Make SPECIFIC counter-offers, never vague ones.
- No [negotiable] tag = fixed price, politely decline discounts.
- OUT OF STOCK = cannot be ordered.
- If you see "ORDER_PLACED:" in the conversation history, the order is already confirmed. Do NOT output CONFIRM_ORDER again. Just respond warmly (e.g. answer follow-up questions, wish them well).
- CRITICAL: When the customer says anything like "place the order", "confirm", "yes", "okay go ahead", "i'll take it" — you MUST output this EXACT line (alone on its own line, nothing before or after on that line):
  CONFIRM_ORDER: <items, quantities, agreed prices, and total>
  Example: CONFIRM_ORDER: 1x Tom Ford Jacket @ GHS 1480, 1x Prada Bold White Tongues @ GHS 1380. Total: GHS 2860
  After that line, add a warm confirmation message for the customer.

BEHAVIOUR:
- Be decisive. Quote specific prices, don't hedge.
- Never repeat the same question if already answered.
- Keep replies short — 2-4 sentences max.
- Warm, like a friendly market seller.`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

/**
 * Process one Telegram Update (same shape as webhook JSON body).
 */
export async function processTelegramUpdate(
  storeId: number,
  update: Record<string, unknown>,
  log: TelegramLogger,
): Promise<void> {
  const message = update?.message as Record<string, unknown> | undefined;
  const userText = (message?.text as string | undefined)?.trim() || (message?.caption as string | undefined)?.trim();
  if (!message || !userText) return;

  const chatId = (message.chat as { id: number }).id;
  const from = message.from as { first_name?: string; last_name?: string } | undefined;
  const firstName = from?.first_name || "";
  const lastName = from?.last_name || "";
  const customerName = [firstName, lastName].filter(Boolean).join(" ") || "Customer";

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store || !store.telegramBotToken) return;

  // /start cart_<id>x<qty>_... — deep link from the "Order via Telegram AI" cart button
  if (userText.startsWith("/start cart_")) {
    const payload = userText.slice("/start cart_".length);
    const entries = payload.split("_").map((e) => {
      const [id, qty] = e.split("x").map(Number);
      return { id, qty };
    }).filter((e) => !isNaN(e.id) && !isNaN(e.qty) && e.qty > 0);

    const currency = store.currency || "GHS";
    let cartLines = "";
    let total = 0;

    if (entries.length > 0) {
      const allProducts = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
      const lines: string[] = [];
      for (const { id, qty } of entries) {
        const p = allProducts.find((x) => x.id === id);
        if (!p) continue;
        const subtotal = parseFloat(p.price) * qty;
        total += subtotal;
        lines.push(`• ${p.name} x${qty} — ${currency} ${subtotal.toFixed(2)}`);
      }
      cartLines = lines.join("\n");
    }

    const greeting = cartLines
      ? `Hi ${firstName || "there"}! 👋 Here's your cart from *${store.name}*:\n\n${cartLines}\n\n*Total: ${store.currency || "GHS"} ${total.toFixed(2)}*\n\nShall I confirm this order, or would you like to make any changes?`
      : `Hi ${firstName || "there"}! 👋 Welcome to *${store.name}*. How can I help you today?`;

    await sendTelegramMessage(store.telegramBotToken, chatId, greeting);
    return;
  }

  // /register command — lets the seller link their Telegram chat for order notifications
  if (userText === "/register") {
    await db.update(storesTable).set({ sellerTelegramChatId: String(chatId) }).where(eq(storesTable.id, storeId));
    await sendTelegramMessage(
      store.telegramBotToken,
      chatId,
      `✅ *You're registered as the seller for ${store.name}!*\n\nYou'll receive a Telegram notification whenever a customer places an order.`,
    );
    return;
  }

  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  const systemPrompt = buildSystemPrompt(store, products, customerName);
  const conversationId = await getOrCreateConversation(storeId, chatId);
  const history = await getConversationHistory(conversationId);

  let assistantResponse = "";
  let orderConfirmed = false;
  let confirmedOrderSummary = "";

  // Detect confirmation intent directly — don't rely on the AI to output a magic token
  const confirmationPhrases = [
    "place my order", "place the order", "confirm my order", "confirm the order",
    "go ahead", "proceed", "yes confirm", "i confirm", "place it",
    "you have my consent", "yes place", "yes, place", "ok place", "okay place",
    "do it", "yes go ahead", "proceed with", "finalize", "complete the order",
  ];
  const lowerText = userText.toLowerCase();

  // Don't re-confirm if an order was already placed in this conversation
  const orderAlreadyPlaced = history.some((m) => m.role === "assistant" && m.content.startsWith("ORDER_PLACED:"));

  const isConfirmation = !orderAlreadyPlaced && (
    confirmationPhrases.some((p) => lowerText.includes(p))
    || (lowerText.trim() === "yes" && history.some((m) => m.role === "assistant" && m.content.toLowerCase().includes("confirm")))
  );

  // ── Check if we're awaiting a phone number from a previous turn ──────────
  const awaitingPhoneMsg = [...history].reverse().find(
    (m) => m.role === "assistant" && m.content.startsWith("ORDER_AWAITING_PHONE:")
  );
  if (awaitingPhoneMsg && !orderAlreadyPlaced) {
    const pendingSummary = awaitingPhoneMsg.content.slice("ORDER_AWAITING_PHONE:".length).trim();
    const customerPhone = userText.replace(/\s+/g, "").slice(0, 30);

    const [newOrder] = await db.insert(ordersTable).values({
      storeId,
      customerName,
      customerPhone,
      customerTelegramChatId: chatId,
      summary: pendingSummary,
      status: "pending",
    }).returning();

    const ref = `QS-${String(newOrder.id).padStart(4, "0")}`;
    assistantResponse = `✅ Order *${ref}* confirmed, ${firstName || "my friend"}! The seller will contact you on *${customerPhone}* to arrange payment and delivery. Thank you for shopping with *${store.name}*! 🛍️`;

    await db.insert(messages).values([
      { conversationId, role: "user", content: userText },
      { conversationId, role: "assistant", content: `ORDER_PLACED: ${pendingSummary}` },
      { conversationId, role: "assistant", content: assistantResponse },
    ]);

    if (store.sellerTelegramChatId && store.telegramBotToken) {
      const orderTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      await sendTelegramMessage(
        store.telegramBotToken,
        store.sellerTelegramChatId,
        `🛒 *New Order ${ref}*\n\n👤 *Customer:* ${customerName}\n📞 *Phone:* ${customerPhone}\n📦 *Order:* ${pendingSummary}\n🕐 *Time:* ${orderTime}\n\nOpen your dashboard to confirm.`,
      );
    }

    await sendTelegramMessage(store.telegramBotToken, chatId, assistantResponse);
    return;
  }

  if (isConfirmation && history.length > 0) {
    // Extract order summary from the most recent assistant message that mentions a total or items
    const recentBotMsg = [...history].reverse().find(
      (m) => m.role === "assistant" && (m.content.includes("Total") || m.content.includes("GHS") || m.content.includes(store.currency || "GHS"))
    );
    confirmedOrderSummary = recentBotMsg
      ? recentBotMsg.content.slice(0, 200)
      : `Order from ${store.name}`;

    // Ask for phone number before finalising
    const phoneAsk = `Perfect! 📞 Before I confirm your order, could you share your phone number so the seller can reach you?`;
    await db.insert(messages).values([
      { conversationId, role: "user", content: userText },
      { conversationId, role: "assistant", content: `ORDER_AWAITING_PHONE: ${confirmedOrderSummary}` },
      { conversationId, role: "assistant", content: phoneAsk },
    ]);
    await sendTelegramMessage(store.telegramBotToken, chatId, phoneAsk);
    return;
  }

  try {
    let responseText = await callAI(systemPrompt, userText, history);

    if (responseText.includes("SEARCH_WEB:")) {
      const query = responseText.split("SEARCH_WEB:")[1]?.trim().split("\n")[0] || userText;
      const searchResult = await searchWeb(query);
      assistantResponse = await callAIFollowUp(
        systemPrompt,
        history,
        userText,
        responseText,
        `Web search result: ${searchResult}\n\nRespond to the customer based on this.`,
      );
    } else if (responseText.includes("CONFIRM_ORDER:") && !orderAlreadyPlaced) {
      const summary = responseText.split("CONFIRM_ORDER:")[1]?.trim().split("\n")[0] || "";
      confirmedOrderSummary = summary;
      // Ask for phone instead of immediately confirming
      assistantResponse = `📞 Before I confirm your order, could you share your phone number so the seller can reach you?`;
    } else {
      assistantResponse = responseText;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error({ err, errMsg }, "AI error in Telegram handler");

    // Graceful fallback — show product list + WhatsApp link
    const lines = products
      .filter((p) => p.inStock)
      .slice(0, 12)
      .map((p) => `• ${p.name} — ${store.currency || "GHS"} ${p.price}`)
      .join("\n");
    const waNumber = (store.whatsappNumber || "").replace(/\D/g, "");
    const waLink = waNumber ? `\n\nTo order, reach us on WhatsApp: https://wa.me/${waNumber}` : "";
    await sendTelegramMessage(
      store.telegramBotToken,
      chatId,
      lines
        ? `Hi ${firstName || "there"}! 👋 Here's what we have at *${store.name}*:\n\n${lines}${waLink}`
        : `Hi! Welcome to *${store.name}*. Our AI assistant is temporarily unavailable.${waLink}`,
    );
    return;
  }

  // Persist conversation history
  // When AI outputs CONFIRM_ORDER we store the phone-await marker and show the phone-ask message
  if (confirmedOrderSummary) {
    await db.insert(messages).values([
      { conversationId, role: "user", content: userText },
      { conversationId, role: "assistant", content: `ORDER_AWAITING_PHONE: ${confirmedOrderSummary}` },
      { conversationId, role: "assistant", content: assistantResponse },
    ]);
  } else {
    await db.insert(messages).values([
      { conversationId, role: "user", content: userText },
      { conversationId, role: "assistant", content: assistantResponse },
    ]);
  }

  await sendTelegramMessage(store.telegramBotToken, chatId, assistantResponse);
}
