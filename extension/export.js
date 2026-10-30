// Builds the export file (format v1, see contracts/cai-export-v1.schema.json) from what the
// popup collected. Pure functions: no DOM and no chrome.* calls, so tests run them in Node.

export const FORMAT = "duetta.character-ai-export";
export const LIMITS = {
  messages: 5000,
  fileBytes: 5 * 1024 * 1024,
  imageBytes: 2 * 1024 * 1024,
  imagePixels: 16_000_000,
};
const PRODUCER = { name: "duetta-cai-export", version: "0.1.0" };

export const utf8Bytes = (s) => new TextEncoder().encode(s).length;
export const serialize = (file) => JSON.stringify(file, null, 2) + "\n";

// card: from the edit form; capture: from the chat page; photo: a file the user picked (or null).
// confirmed: { start, end } ticked by the user; matchesGreeting: the reader's helper.
// Returns { file, leftOut }. If the whole chat does not fit one file, the newest messages
// that fit are kept and leftOut says how many older ones are not in the file.
export function buildExport({ card, capture, photo = null, confirmed, matchesGreeting, exportId, now }) {
  if (card.characterId !== capture.characterId) throw new Error("CARD_MISMATCH");
  const all = capture.messages;
  const make = (keep) => {
    const leftOut = (capture.leftOut || 0) + all.length - keep;
    const messages = all.slice(all.length - keep);
    // The greeting is the character's line: the user's copy of it is not the start of the chat.
    const hint = matchesGreeting(messages[0].text, card.greetings, card.name);
    const match = hint && messages[0].role !== "assistant" ? false : hint;
    const start = !!confirmed.start && !leftOut;
    const end = !!confirmed.end;
    const fieldsMissing = [card.tagline, card.description, card.definition].includes(null) || !card.greetings.length;
    return {
      format: FORMAT,
      schema_version: 1,
      export_id: exportId,
      exported_at: now.toISOString(),
      producer: { ...PRODUCER, reader_version: capture.readerVersion },
      source: { service: "character.ai", method: "user_confirmed_dom" },
      ownership: {
        character_created_by_user: true,
        chat_owned_by_user: true,
        ui_evidence: ["creator_matches_account", "edit_link", "edit_form"],
      },
      character: {
        source_character_id: card.characterId,
        name: card.name,
        tagline: card.tagline,
        description: card.description,
        greeting: card.greetings[0] ?? null,
        alternate_greetings: card.greetings.slice(1),
        definition: card.definition,
        avatar: photo && { mime_type: photo.mime_type, data_base64: photo.data_base64, source: "user_selected_file" },
      },
      chat: {
        source_chat_id: capture.chatId,
        coverage: {
          status: start && end ? "complete" : "partial",
          captured_count: messages.length,
          total_count: null,
          stopped_by: capture.stoppedBy,
          first_message_matches_greeting: match,
          user_confirmed_start: start,
          user_confirmed_end: end,
        },
        messages: messages.map((m, index) => ({
          index,
          source_message_id: null,
          role: m.role,
          text: m.text,
          source_created_at: null,
        })),
      },
      warnings: [
        !start && "CHAT_START_NOT_CONFIRMED",
        !end && "CHAT_END_NOT_CONFIRMED",
        match === false && "FIRST_MESSAGE_NOT_GREETING",
        leftOut > 0 && "HISTORY_LIMIT_REACHED",
        !capture.chatId && "SOURCE_CHAT_ID_UNAVAILABLE",
        "SOURCE_MESSAGE_IDS_UNAVAILABLE",
        "SOURCE_TIMESTAMPS_UNAVAILABLE",
        "TEXT_AS_DISPLAYED",
        !photo && "AVATAR_NOT_INCLUDED",
        fieldsMissing && "CHARACTER_FIELDS_MISSING",
      ].filter(Boolean),
    };
  };
  const fits = (keep) => utf8Bytes(serialize(make(keep))) <= LIMITS.fileBytes;
  let keep = Math.min(all.length, LIMITS.messages);
  if (!fits(keep)) {
    let lo = 0;
    let hi = keep - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (fits(mid)) lo = mid;
      else hi = mid - 1;
    }
    keep = lo;
  }
  if (!keep) throw new Error("TOO_BIG");
  const file = make(keep);
  return { file, leftOut: (capture.leftOut || 0) + all.length - keep };
}

// "Маячник Тим chat 2026-10-30.json"
export function fileName(name, date) {
  const safe =
    name
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|\p{Cc}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "character";
  return `${safe} chat ${date.toISOString().slice(0, 10)}.json`;
}

// The image type by its first bytes; the file name and the browser's guess are not trusted.
export function imageType(bytes) {
  const ascii = (from, to) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length > 8 && ascii(1, 4) === "PNG" && bytes[0] === 0x89) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
