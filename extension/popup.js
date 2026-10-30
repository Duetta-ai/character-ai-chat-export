import { buildExport, fileName, imageType, serialize, LIMITS } from "./export.js";

const R = globalThis.duettaReader; // reader.js, loaded by popup.html for its pure helpers
const session = chrome.storage.session; // in memory only; cleared on save, on Start over and when the browser closes
const params = new URLSearchParams(location.search);
const field = (name) => document.querySelector(`[data-f="${name}"]`);
const action = (name) => document.querySelectorAll(`[data-a="${name}"]`);
const check = (name) => document.querySelector(`[data-c="${name}"]`);
const setText = (name, value) => (field(name).textContent = value);
const on = (name, fn) => action(name).forEach((el) => (el.onclick = fn));
let tabId = null;

function show(view) {
  for (const s of document.querySelectorAll("[data-view]")) s.hidden = s.dataset.view !== view;
}

const ERRORS = {
  UNSUPPORTED_PAGE: ["Open your chat", "Open a chat with a character you created on character.ai, then click this extension again."],
  NO_CHAT: ["No chat on this page", "Open the chat itself, wait until it loads, then try again."],
  NO_MESSAGES: ["No messages yet", "This chat has no messages to save."],
  NOT_OWN: ["This isn't your character", "The extension saves only characters you created and your chats with them."],
  OWNER_UNKNOWN: [
    "Can't check who created this character",
    "The page doesn't show the creator or your account where the extension expects them. Open the left sidebar and try again. If it keeps happening, the site has changed and the extension needs an update.",
  ],
  GENERATING: ["Wait for the reply", "The character is still writing. Try again when the reply is complete."],
  UNKNOWN_ROLE: ["Can't tell who wrote a message", "The extension stopped instead of guessing. Nothing was saved. The site may have changed; the extension needs an update."],
  UNKNOWN_MESSAGE: ["Can't read a message", "The extension stopped instead of guessing. Nothing was saved. The site may have changed; the extension needs an update."],
  UNKNOWN_ORDER: ["Can't tell the order of messages", "The extension stopped instead of guessing. Nothing was saved. The site may have changed; the extension needs an update."],
  EMPTY_MESSAGE: ["A message has no text", "Pictures and voice messages can't be saved yet, so nothing was saved."],
  UNSUPPORTED_CONTENT: ["A message has a picture or media", "Pictures and voice messages can't be saved yet, so nothing was saved."],
  MESSAGE_TOO_LONG: ["A message is too long", "Messages over 32 KB can't be saved by this version. Nothing was saved."],
  MESSAGES_REMOVED: ["The chat changed while loading", "The page removed messages while the extension was scrolling. Nothing was saved. Try again and keep this tab open."],
  PAGE_CHANGED: ["The chat changed while loading", "Another page was opened while the extension was scrolling. Nothing was saved. Try again and keep this tab open."],
  NO_FORM: ["Open the edit form", "Open your character's Edit page so the form with its name and greeting is visible, then try again."],
  CARD_MISMATCH: ["This card is for another character", "The saved chat is with a different character. Start over, or open the Edit page of the character from that chat."],
  BUSY: ["Already loading", "The chat is still loading. Wait a moment."],
  STORAGE: ["Not enough memory", "This chat is too big for the extension to keep. Nothing was saved."],
  TOO_BIG: ["The file would be too big", "Remove the picture and try again."],
};

function showError(code, detail = {}) {
  const [title, text] = ERRORS[code] || ["Something went wrong", detail.message || code];
  setText("e-title", title);
  let more = "";
  if (code === "NOT_OWN" && detail.creator && detail.account && detail.creator !== detail.account)
    more = ` This page says “By @${detail.creator}”, and you're signed in as @${detail.account}.`;
  else if (code === "NOT_OWN" && !detail.editLink) more = " There's no Edit button for this character.";
  else if (Number.isInteger(detail.index)) more = ` (message ${detail.index + 1} from the top)`;
  setText("e-text", text + more);
  show("error");
}

async function call(fn, arg = null) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (fn, arg) => globalThis.duettaReader?.[fn](arg),
    args: [fn, arg],
  });
  if (!result) throw new Error("PAGE_CHANGED"); // the tab was reloaded or left: the reader is gone
  return result;
}

async function main() {
  const saved = await session.get(null);
  if (params.has("tab")) {
    // Opened in a tab from the review, so the file picker can't close it.
    document.body.classList.add("tab");
    return saved.capture ? review() : show("unsupported");
  }
  // Tests open this page in a tab and name the target tab; normally it is the active tab.
  const tab = params.has("target")
    ? await chrome.tabs.get(Number(params.get("target")))
    : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const at = R.where(tab?.url); // the URL is visible only after the user's click (activeTab)
  if (!at) return saved.capture ? review() : show("unsupported");
  tabId = tab.id;
  await chrome.scripting.executeScript({ target: { tabId }, files: ["reader.js"] });
  const p = await call("poll");
  if (p.phase === "scrolling") return progress();
  if (p.phase === "done") return finished(p.result);
  if (at.page === "edit") return cardView(saved.capture?.characterId);
  if (saved.capture) return review();
  const r = await call("inspect");
  if (!r.ok) return showError(r.code, r.detail);
  chatView(r, saved);
}

const editUrl = (id) => `https://character.ai/character/${id}/edit`;

function chatView(r, saved) {
  const card = saved.card?.characterId === r.characterId ? saved.card : null;
  setText("name", card?.name || r.name || "Your character");
  setText("loaded", r.count);
  field("card-ok").hidden = !card;
  field("card-missing").hidden = !!card;
  field("edit-link").href = editUrl(r.characterId);
  on("save-chat", async () => {
    const res = await call("start", { greetings: card?.greetings || [], name: card?.name || r.name || "" });
    if (!res.ok) return showError(res.code, res.detail);
    progress();
  });
  show("chat");
}

function progress() {
  show("progress");
  on("stop", async (e) => {
    e.target.disabled = true;
    await call("stop");
  });
  const tick = async () => {
    const p = await call("poll").catch(() => ({ phase: "gone" }));
    if (p.phase === "done") return finished(p.result);
    if (p.phase !== "scrolling") return showError("PAGE_CHANGED");
    setText("count", p.count);
    setText("secs", (p.ms / 1000).toFixed(1));
    setTimeout(tick, 250);
  };
  tick();
}

async function finished(r) {
  if (!r.ok) return showError(r.code, r.detail);
  const capture = {
    characterId: r.characterId,
    chatId: r.chatId,
    name: r.name,
    messages: r.messages,
    leftOut: r.leftOut,
    startCard: r.startCard,
    stoppedBy: r.stoppedBy,
    durationMs: r.durationMs,
    readerVersion: r.readerVersion,
  };
  try {
    await session.set({ capture, choices: {} });
  } catch {
    return showError("STORAGE");
  }
  review();
}

// capturedFor: the character of a chat already saved in the session, if any.
function cardView(capturedFor) {
  show("card");
  on("add-card", async () => {
    const r = await call("readCard");
    if (!r.ok) return showError(r.code, r.detail);
    if (capturedFor && capturedFor !== r.card.characterId) return showError("CARD_MISMATCH");
    await session.set({ card: r.card });
    if (capturedFor) return review();
    setText("card-name", r.card.name);
    field("card-done").hidden = false;
  });
}

const STOPPED = {
  greeting: "Reached the first message",
  intro_card: "Reached the start of the chat",
  quiet_timeout: "The site sent no older messages",
  user_stopped: "You stopped loading",
  message_limit: "Stopped at 5,000 messages",
  size_limit: "Stopped at the 5 MB file limit",
  time_limit: "Stopped after 10 minutes",
};
const who = (m) => (m.role === "user" ? "You" : "Character");

async function review() {
  const { card: savedCard, capture, photo, choices = {} } = await session.get(["card", "capture", "photo", "choices"]);
  if (!capture) return show("unsupported");
  const card = savedCard?.characterId === capture.characterId ? savedCard : null;
  const own = check("own");
  const start = check("start");
  const end = check("end");
  const options = (confirmed) => ({ card, capture, photo, confirmed, matchesGreeting: R.matchesGreeting });
  const draft = (confirmed) => buildExport({ ...options(confirmed), exportId: "", now: new Date() });
  // Suggestions until the user ticks or unticks a box; then their choice is kept in the session,
  // so a new picture or opening the review again does not change it.
  let suggestStart = false;
  let leftOut = capture.leftOut;
  if (card) {
    const d = draft({});
    leftOut = d.leftOut;
    suggestStart = capture.startCard || d.file.chat.coverage.first_message_matches_greeting === true;
  }
  start.checked = !leftOut && (choices.start ?? suggestStart);
  start.disabled = leftOut > 0;
  end.checked = choices.end ?? true; // the page always shows the newest messages

  const render = () => {
    const built = card && draft({ start: start.checked, end: end.checked });
    const messages = built ? built.file.chat.messages : capture.messages;
    const coverage = built?.file.chat.coverage;
    const mine = messages.filter((m) => m.role === "user").length;
    setText("r-name", card?.name || capture.name || "Your character");
    setText("r-tagline", card?.tagline || "");
    setText("r-count", `${messages.length} (${mine} yours, ${messages.length - mine} the character's)`);
    setText("r-first-who", who(messages[0]));
    setText("r-first", messages[0].text);
    setText("r-last-who", who(messages.at(-1)));
    setText("r-last", messages.at(-1).text);
    const match = coverage?.first_message_matches_greeting;
    setText(
      "r-greeting",
      match === true
        ? "✓ Starts with the character's greeting"
        : match === false
          ? "Doesn't start with the greeting: earlier messages may be missing"
          : card
            ? "The card has no greeting to compare"
            : "Unknown until the card is added",
    );
    setText("r-stopped", STOPPED[capture.stoppedBy] || capture.stoppedBy);
    const status = field("r-status");
    status.textContent = coverage?.status === "complete" ? "Complete chat" : "Partial chat";
    status.className = `status ${coverage?.status === "complete" ? "complete" : "partial"}`;
    const leftOut = built ? built.leftOut : capture.leftOut;
    field("r-left-out").hidden = !leftOut;
    setText("r-left-out", `${leftOut} older messages don't fit in one file and are left out.`);
    field("r-need-card").hidden = !!card;
    field("r-edit-link").href = editUrl(capture.characterId);
    action("save-file")[0].disabled = !card || !own.checked;
  };
  own.onchange = render;
  for (const box of [start, end])
    box.onchange = () => {
      choices[box.dataset.c] = box.checked;
      session.set({ choices });
      render();
    };

  const tabMode = params.has("tab");
  field("photo-link").hidden = tabMode;
  field("photo-input").hidden = !tabMode;
  field("r-photo").hidden = !photo;
  action("photo-remove")[0].hidden = !photo;
  if (photo) field("r-photo").src = `data:${photo.mime_type};base64,${photo.data_base64}`;
  setText("r-photo-text", photo ? "Your picture will be included" : "Not included");
  field("photo-input").onchange = async (e) => {
    try {
      await session.set({ photo: await readPhoto(e.target.files[0]) });
    } catch (err) {
      return setText("r-photo-text", err.message);
    }
    review();
  };
  on("photo-remove", async () => {
    await session.remove("photo");
    review();
  });

  on("save-file", () => {
    const now = new Date();
    let file;
    try {
      ({ file } = buildExport({ ...options({ start: start.checked, end: end.checked }), exportId: crypto.randomUUID(), now }));
    } catch (e) {
      return showError(e.message);
    }
    saveAndForget(serialize(file), fileName(card.name, now));
  });

  render();
  show("review");
}

// Hands the file to the browser, then forgets the chat: the session is cleared and the review,
// with its texts, picture and handlers (and so everything they hold), leaves the page.
function saveAndForget(json, name) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000); // the download reads the Blob
  session.clear();
  document.querySelector('[data-view="review"]').remove();
  setText("s-file", name);
  show("saved");
}

async function readPhoto(file) {
  if (!file) throw new Error("No picture chosen.");
  if (file.size > LIMITS.imageBytes) throw new Error("The picture is larger than 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = imageType(bytes);
  if (!type) throw new Error("Use a PNG, JPEG or WebP picture.");
  const blob = new Blob([bytes], { type });
  const image = await createImageBitmap(blob).catch(() => {
    throw new Error("This picture can't be opened.");
  });
  const pixels = image.width * image.height;
  image.close();
  if (pixels > LIMITS.imagePixels) throw new Error("The picture is larger than 16 megapixels.");
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("This picture can't be read."));
    reader.readAsDataURL(blob);
  });
  return { mime_type: type, data_base64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

on("retry", () => location.reload());
on("start-over", async () => {
  await session.clear();
  location.reload();
});
main().catch((e) => showError(e.message === "PAGE_CHANGED" ? "UNSUPPORTED_PAGE" : "INTERNAL", { message: e.message }));
