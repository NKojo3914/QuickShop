import { eq, desc, and, gt } from "drizzle-orm";
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

// ── In-process dedup for /start cart_ (catches macOS dual-client before any DB work) ──
const recentStartKeys = new Map<string, number>(); // key → expiry timestamp

function isDuplicateStart(chatId: number, text: string): boolean {
  const key = `${chatId}:${text.slice(0, 100)}`;
  const expiry = recentStartKeys.get(key);
  if (expiry && Date.now() < expiry) return true;
  recentStartKeys.set(key, Date.now() + 30_000);
  // Prune old entries lazily
  if (recentStartKeys.size > 200) {
    const now = Date.now();
    for (const [k, exp] of recentStartKeys) if (exp < now) recentStartKeys.delete(k);
  }
  return false;
}

/**
 * ONE conversation per (chatId, storeId). Simple exact-match, no LIKE needed.
 * Session boundaries are handled by SESSION_START: markers in the message log.
 */
async function getOrCreateConversation(storeId: number, telegramChatId: number): Promise<number> {
  const title = `telegram-${telegramChatId}-store-${storeId}`;
  // ORDER BY createdAt DESC so concurrent inserts (multiple Railway instances /
  // dual-client /start) always agree on the same "primary" conversation row.
  const existing = await db
    .select()
    .from(conversations)
    .where(eq(conversations.title, title))
    .orderBy(desc(conversations.createdAt))
    .limit(1);
  if (existing.length > 0) return existing[0].id;
  const [conv] = await db.insert(conversations).values({ title }).returning();
  return conv.id;
}

/**
 * Get the messages for the CURRENT SESSION only — i.e. messages from the most
 * recent SESSION_START: marker onwards.  Falls back to the last 8 messages when
 * there is no SESSION_START (plain bot chat without a cart deep-link).
 *
 * This completely prevents stale ORDER_AWAITING_PHONE / ORDER_PLACED markers
 * from a previous cart session leaking into the new one, without requiring
 * separate conversations per session.
 */
async function getConversationHistory(conversationId: number): Promise<MessageRow[]> {
  // Fetch last 60 messages newest-first, then reverse to chronological order.
  // 60 is enough for any realistic negotiation session without being wasteful.
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.id))
    .limit(60);
  const chronological = rows.reverse();

  // Find the LAST SESSION_START marker — only return messages from that point on.
  let sessionStartIdx = -1;
  for (let i = chronological.length - 1; i >= 0; i--) {
    if (chronological[i].role === "system" && chronological[i].content.startsWith("SESSION_START:")) {
      sessionStartIdx = i;
      break;
    }
  }

  if (sessionStartIdx >= 0) {
    // Return ALL messages from the current session so state markers
    // (ORDER_AWAITING_PHONE, ORDER_PLACED) are never cut off by a hard cap.
    // The caller trims aiHistory separately before sending to the AI.
    return chronological.slice(sessionStartIdx);
  }

  // No cart session yet — plain bot chat; take last 6 messages.
  return chronological.slice(-6);
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
- [negotiable, min: X] = you CAN discount but NEVER go below X. X is the absolute floor — do NOT reveal it. If the customer offers below X, politely counter-offer at exactly X and hold firm. NEVER go one cedi below X for any reason.
- If the customer offers MORE than the listed price, do NOT negotiate them down. Ask once to confirm using ONLY their offered amount — do NOT reference the listed price, the original price, or any other number: e.g. "Just to confirm — you'd like to pay GHS 1600 for the Tom Ford Jacket?" If they say yes, accept and proceed with CONFIRM_ORDER.
- No [negotiable] tag = fixed price, politely decline discounts.
- OUT OF STOCK = cannot be ordered.
- If you see "ORDER_PLACED:" in the conversation history, the order is already confirmed. Do NOT output CONFIRM_ORDER again. Just respond warmly (e.g. answer follow-up questions, wish them well).
- CONFIRM_ORDER ONLY when the customer explicitly agrees to buy at a stated price — e.g. "yes", "deal", "ok", "i'll take it", "place the order", "okay confirm". Do NOT output CONFIRM_ORDER just because the customer mentions a number or asks a price question like "2750?" or "how about 2700?". Those are counter-offers, respond with your own counter.
- CRITICAL: When confirming, you MUST output the CONFIRM_ORDER line FIRST — BEFORE any warm message. NEVER say "on its way", "confirmed", "thank you", or anything that implies the order is done WITHOUT first outputting the CONFIRM_ORDER line. If you skip it, the order will NOT be recorded.
- Output format (exact):
  CONFIRM_ORDER: <items, quantities, agreed prices, and total>
  <warm message on the next line>
  Example:
  CONFIRM_ORDER: 1x Tom Ford Jacket @ GHS 1450. Total: GHS 1450
  Thanks, Kojo! Your Tom Ford Jacket is on its way. Have a great day! 🎉

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
    // In-process dedup (first line of defence — catches same-instance duplicates fast).
    if (isDuplicateStart(chatId, userText)) return;

    // DB-level dedup: check if a SESSION_START was already inserted for this
    // (chatId, storeId) within the last 30 seconds. Works across all Railway
    // instances where the in-process Map can't help.
    const thirtySecsAgo = new Date(Date.now() - 30_000);
    const recentConv = await getOrCreateConversation(storeId, chatId);
    const recentSession = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, recentConv),
          eq(messages.role, "system"),
          gt(messages.createdAt, thirtySecsAgo),
        ),
      )
      .limit(1);
    if (recentSession.length > 0) return; // duplicate /start within 30 s — skip

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

    // Use ONE conversation per user but insert a SESSION_START marker so
    // getConversationHistory returns only messages from this session onwards,
    // preventing stale ORDER_AWAITING_PHONE markers from old sessions from firing.
    const conversationId = recentConv; // already fetched above for dedup check
    await db.insert(messages).values([
      { conversationId, role: "system", content: `SESSION_START: ${Date.now()}` },
      { conversationId, role: "assistant", content: greeting },
    ]);

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
  let confirmedOrderSummary = "";

  const lowerText = userText.toLowerCase().trim();

  // Only treat an order as already placed if it happened in the CURRENT session
  const hasSessionStart = history.some((m) => m.role === "system" && m.content.startsWith("SESSION_START:"));
  const orderAlreadyPlaced = hasSessionStart && history.some((m) => m.role === "assistant" && m.content.startsWith("ORDER_PLACED:"));

  const historyHasCartContext = history.some(
    (m) => m.role === "assistant" && (
      m.content.includes("Total") ||
      m.content.includes("cart") ||
      m.content.toLowerCase().includes("confirm")
    )
  );

  // Ask the AI to classify intent — handles any phrasing ("Yesss", "why not",
  // "let's go", "100%", etc.) without a hardcoded word list.
  // Include the bot's last message so the classifier has full context:
  // "I'll pay 1000gh" after "Shall I confirm?" is NOT a confirmation,
  // but "Yesss" after "Just to confirm — you'd like to pay GHS 1000?" IS.
  let isConfirmation = false;
  if (!orderAlreadyPlaced && historyHasCartContext) {
    const lastBotMsg = [...history].reverse().find((m) => m.role === "assistant" &&
      !m.content.startsWith("ORDER_AWAITING_PHONE:") &&
      !m.content.startsWith("ORDER_PLACED:") &&
      !m.content.startsWith("CONFIRM_ORDER:"));
    try {
      const verdict = await groqChat([
        { role: "system", content: 'You are a yes/no classifier. Reply with ONLY the word "YES" or "NO".' },
        {
          role: "user",
          content: `Bot's last message: "${lastBotMsg?.content?.slice(0, 200) ?? ""}"\nCustomer's reply: "${userText}"\n\nIs the customer directly confirming/agreeing to place the order as the bot proposed? Reply YES or NO only.`,
        },
      ]);
      isConfirmation = verdict.trim().toUpperCase().startsWith("Y");
    } catch {
      // Classifier failed — fall through to the main AI call
    }
  }

  // ── Check if we're awaiting a phone number from a previous turn ──────────
  // IMPORTANT: only treat it as pending if the AWAITING_PHONE marker is the most recent
  // assistant message AND there are NO user messages after it in history.
  // This prevents stale markers from old sessions from being triggered by new messages.
  const reversedHistory = [...history].reverse();
  const awaitingPhoneIdx = reversedHistory.findIndex(
    (m) => m.role === "assistant" && m.content.startsWith("ORDER_AWAITING_PHONE:")
  );
  const awaitingPhoneMsg = awaitingPhoneIdx >= 0 ? reversedHistory[awaitingPhoneIdx] : null;
  // Valid only if no user messages exist AFTER the marker (i.e. at lower index in reversed array)
  const validAwaitingPhone =
    awaitingPhoneMsg !== null &&
    !orderAlreadyPlaced &&
    !reversedHistory.slice(0, awaitingPhoneIdx).some((m) => m.role === "user");

  // Also reject inputs that look like confirmations rather than phone numbers.
  // Require at least 7 digits so "yes12" or "go ahead3" can't be captured as a phone.
  const digitCount = (userText.match(/\d/g) || []).length;
  const looksLikePhone = digitCount >= 7 && !confirmationPhrases.some((p) => lowerText.includes(p));

  if (validAwaitingPhone) {
    const pendingSummary = awaitingPhoneMsg!.content.slice("ORDER_AWAITING_PHONE:".length).trim();

    if (!looksLikePhone) {
      // User replied with something that isn't a phone number — re-ask and PRESERVE the
      // ORDER_AWAITING_PHONE marker so the NEXT message still triggers the phone handler.
      const reAsk = `📞 Please share your phone number (e.g. 0241234567) so the seller can reach you to arrange delivery.`;
      await db.insert(messages).values([
        { conversationId, role: "user", content: userText },
        { conversationId, role: "assistant", content: `ORDER_AWAITING_PHONE: ${pendingSummary}` },
        { conversationId, role: "assistant", content: reAsk },
      ]);
      await sendTelegramMessage(store.telegramBotToken, chatId, reAsk);
      return;
    }

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

  if (isConfirmation) {
    // Build the order summary WITHOUT calling the AI (avoids double latency
    // and race conditions when the AI is slow).
    // Priority 1: most recent CONFIRM_ORDER: line the AI already emitted
    const confirmOrderMsg = [...history].reverse().find(
      (m) => m.role === "assistant" && m.content.includes("CONFIRM_ORDER:")
    );
    if (confirmOrderMsg) {
      confirmedOrderSummary = confirmOrderMsg.content
        .split("CONFIRM_ORDER:")[1]?.trim().split("\n")[0] || "";
    }

    // Priority 2: most recent assistant message that mentions "Total" (final price)
    if (!confirmedOrderSummary) {
      const totalMsg = [...history].reverse().find(
        (m) => m.role === "assistant" && m.content.includes("Total")
      );
      if (totalMsg) confirmedOrderSummary = totalMsg.content.slice(0, 300);
    }

    // Priority 3: original cart greeting
    if (!confirmedOrderSummary) {
      const cartMsg = [...history].reverse().find(
        (m) => m.role === "assistant" && m.content.includes("Here's your cart")
      );
      if (cartMsg) confirmedOrderSummary = cartMsg.content.slice(0, 300);
    }

    if (!confirmedOrderSummary) confirmedOrderSummary = `Order from ${store.name}`;

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

  // Strip SESSION_START system markers before handing history to the AI,
  // and cap at last 14 messages so long negotiation sessions stay within
  // token limits without losing recent context.
  const aiHistory = history.filter((m) => m.role !== "system").slice(-14);

  try {
    let responseText = await callAI(systemPrompt, userText, aiHistory);

    if (responseText.includes("SEARCH_WEB:")) {
      const query = responseText.split("SEARCH_WEB:")[1]?.trim().split("\n")[0] || userText;
      const searchResult = await searchWeb(query);
      assistantResponse = await callAIFollowUp(
        systemPrompt,
        aiHistory,
        userText,
        responseText,
        `Web search result: ${searchResult}\n\nRespond to the customer based on this.`,
      );
    } else if (responseText.includes("CONFIRM_ORDER:") && !orderAlreadyPlaced) {
      confirmedOrderSummary = responseText.split("CONFIRM_ORDER:")[1]?.trim().split("\n")[0] || "";
      // Strip the CONFIRM_ORDER: line from what the customer sees — just show the warm message after it
      const warmPart = responseText.split("\n").filter((l) => !l.startsWith("CONFIRM_ORDER:")).join("\n").trim();
      assistantResponse = warmPart || `📞 Before I confirm your order, could you share your phone number so the seller can reach you?`;
    } else {
      assistantResponse = responseText;
      // Safety net: AI confirmed the order in natural language but forgot CONFIRM_ORDER:
      // Detect by looking for completion phrases in the response.
      const completionPhrases = ["on its way", "order is confirmed", "order has been placed",
        "order placed", "we'll be in touch", "seller will contact"];
      if (!orderAlreadyPlaced && historyHasCartContext &&
          completionPhrases.some((p) => responseText.toLowerCase().includes(p))) {
        const totalMsg = [...history].reverse().find(
          (m) => m.role === "assistant" && m.content.includes("Total")
        );
        confirmedOrderSummary = totalMsg ? totalMsg.content.slice(0, 300) : `Order from ${store.name}`;
        assistantResponse = `📞 Before I confirm your order, could you share your phone number so the seller can reach you?`;
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error({ err, errMsg }, "AI error in Telegram handler");

    // Graceful fallback — show product list + WhatsApp link.
    // Also nudge the customer: they can still type "confirm my order" to
    // place an order without needing the AI to be available.
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
        ? `Hi ${firstName || "there"}! 👋 Here's what we have at *${store.name}*:\n\n${lines}\n\nReply *"confirm my order"* to place your order, or${waLink.replace("\n\n", " ")} to order via WhatsApp.`
        : `Hi! Welcome to *${store.name}*. Our AI assistant is temporarily unavailable.${waLink}`,
    );
    return;
  }

  // Persist conversation history.
  // When AI outputs CONFIRM_ORDER: store three rows — the CONFIRM_ORDER line
  // (so isConfirmation Priority 1 can find the negotiated summary next turn),
  // the ORDER_AWAITING_PHONE marker, and the warm reply the customer sees.
  if (confirmedOrderSummary) {
    await db.insert(messages).values([
      { conversationId, role: "user", content: userText },
      { conversationId, role: "assistant", content: `CONFIRM_ORDER: ${confirmedOrderSummary}` },
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
