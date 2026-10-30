// Page reader. The popup injects this file into the open character.ai tab only after the
// user clicks the extension (activeTab). It reads what the page has already rendered and
// scrolls the chat up so the page itself loads older messages. It never sends requests and
// never reads cookies, storage or the page's scripts.
// The popup also loads it for the pure helpers (where, matchesGreeting).
(() => {
  if (globalThis.duettaReader) return;

  const ORIGIN = "https://character.ai";
  const VERSION = "cai-dom-1";
  const LIMITS = { messages: 5000, messageBytes: 32 * 1024, textBytes: 5 * 1024 * 1024 };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const utf8 = (s) => new TextEncoder().encode(s).length;

  class ReadError extends Error {
    constructor(code, detail = {}) {
      super(code);
      this.code = code;
      this.detail = detail;
    }
  }
  const fail = (code, detail) => {
    throw new ReadError(code, detail);
  };
  const asError = (e) =>
    e instanceof ReadError
      ? { ok: false, code: e.code, detail: e.detail }
      : { ok: false, code: "INTERNAL", detail: { message: String(e?.message || e) } };
  // Calls from the popup get a plain object back, never an exception.
  const safe = (fn) => (arg) => {
    try {
      return { ok: true, ...fn(arg ?? undefined) };
    } catch (e) {
      return asError(e);
    }
  };

  // Exact origin and route: a chat (/chat/<character id>, optionally ?hist=<chat id>)
  // or the character's edit form (/character/<character id>/edit). Anything else is unsupported.
  function where(href = location.href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    if (url.origin !== ORIGIN) return null;
    let m = /^\/chat\/([A-Za-z0-9_-]{8,128})$/.exec(url.pathname);
    if (m) {
      const hist = url.searchParams.get("hist");
      return { page: "chat", characterId: m[1], chatId: hist && UUID.test(hist) ? hist : null };
    }
    m = /^\/character\/([A-Za-z0-9_-]{8,128})\/edit$/.exec(url.pathname);
    return m ? { page: "edit", characterId: m[1] } : null;
  }

  // Greeting check. The page shows *italics* and **bold** without the stars and fills in
  // {{char}} / {{user}}, so compare word sequences and let {{user}} stand for 1–4 words.
  const words = (s) => (s || "").normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  function greetingPattern(greeting, charName) {
    const src = greeting
      .split(/(\{\{(?:char|user)\}\})/i)
      .map((part) =>
        /^\{\{char\}\}$/i.test(part)
          ? words(charName).join(" ")
          : /^\{\{user\}\}$/i.test(part)
            ? "[\\p{L}\\p{N}]+(?: [\\p{L}\\p{N}]+){0,3}"
            : words(part).join(" "),
      )
      .filter(Boolean)
      .join(" ");
    return src ? new RegExp(`^${src}$`, "u") : null;
  }
  // true / false, or null when there is no greeting to compare with.
  function matchesGreeting(text, greetings, charName = "") {
    const list = (greetings || []).filter((g) => g && g.trim());
    if (!list.length) return null;
    const t = words(text).join(" ");
    return list.some((g) => greetingPattern(g, charName)?.test(t) ?? false);
  }

  // Own character: the chat header says "By @<handle>" with the same handle as the signed-in
  // account (account menu in the sidebar), and the page has the Edit link for this character.
  // A display name alone is not enough.
  function owner(characterId) {
    const link = document.querySelector('#chat-header a[href^="/profile/"]');
    const by = link && /^By @(\S+)$/.exec(link.textContent.trim());
    const creator = by && link.getAttribute("href") === `/profile/${by[1]}` ? by[1] : null;
    const menus = document.querySelectorAll('aside button[aria-haspopup="menu"]');
    const account = menus.length === 1 ? menus[0].querySelector("p")?.textContent.trim() || null : null;
    const editLink = !!document.querySelector(`a[href="/character/${characterId}/edit"]`);
    return { creator, account, editLink };
  }

  function openChat() {
    const at = where();
    if (at?.page !== "chat") fail("UNSUPPORTED_PAGE");
    const root = document.querySelector("#chat-messages") || fail("NO_CHAT");
    const own = owner(at.characterId);
    if (!own.creator || !own.account) fail("OWNER_UNKNOWN", own);
    if (own.creator !== own.account || !own.editLink) fail("NOT_OWN", own);
    const name = document.querySelector('#chat-header a[href^="/character/"] p')?.textContent.trim() || null;
    return { at, root, name };
  }

  // Each direct child of #chat-messages is one message, newest first (the list is
  // column-reverse). Short chats also end with a "start of chat" card that has no text.
  const isStartCard = (g) => !!g && !g.querySelector(".prose") && !!g.querySelector('a[href^="/character/"] p.bold');
  const count = (root) => root.childElementCount - (isStartCard(root.lastElementChild) ? 1 : 0);

  function readMessage(g, index) {
    // Only the reply that is shown counts: swiped-away variants stay in the DOM.
    let node = g;
    if (g.querySelector(".swiper-slide")) {
      const active = g.querySelectorAll(".swiper-slide-active");
      if (active.length !== 1) fail("UNKNOWN_MESSAGE", { index, reason: "selected_reply" });
      node = active[0];
    }
    if (node.querySelector(".ticontainer")) fail("GENERATING", { index });
    // The role must be proven by the row, never guessed from the order of messages.
    const mine = !!node.querySelector(".flex-row-reverse");
    const badge = !!node.querySelector(".cai-badge");
    if (mine === badge) fail("UNKNOWN_ROLE", { index });
    const prose = node.querySelectorAll(".prose");
    if (prose.length !== 1) fail("UNKNOWN_MESSAGE", { index, reason: "text_block" });
    const text = prose[0].innerText; // innerText keeps line breaks and empty lines
    if (!text.trim()) fail("EMPTY_MESSAGE", { index });
    if (utf8(text) > LIMITS.messageBytes) fail("MESSAGE_TOO_LONG", { index });
    return { role: mine ? "user" : "assistant", text };
  }

  // One pass over what is rendered, oldest first. Keeps the newest messages that fit the
  // limits and reports how many older ones were left out; text is never cut.
  function readAll(root) {
    const groups = [...root.children].reverse();
    const messages = [];
    let startCard = false;
    groups.forEach((g, i) => {
      if (!isStartCard(g)) return messages.push(readMessage(g, messages.length));
      if (i !== 0) fail("UNKNOWN_MESSAGE", { index: messages.length, reason: "start_card" });
      startCard = true;
    });
    if (!messages.length) fail("NO_MESSAGES");
    let keep = 0;
    for (let i = messages.length - 1, bytes = 0; i >= 0 && keep < LIMITS.messages; i--, keep++) {
      bytes += utf8(messages[i].text);
      if (bytes > LIMITS.textBytes) break;
    }
    const leftOut = messages.length - keep;
    return { messages: messages.slice(leftOut), leftOut, startCard: startCard && !leftOut };
  }

  const state = { phase: "idle", count: 0, startedAt: 0, stop: false, result: null };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Scroll to the first message; the page loads older messages by itself (about 50 per
  // request) while the list sits at the top. Stops at the greeting or the start card,
  // when nothing new arrives after a second push, on the user's Stop, or at the limits.
  async function scroll(root, o) {
    const href = location.href;
    const oldestIsGreeting = () => {
      let g = root.lastElementChild;
      if (isStartCard(g)) g = g.previousElementSibling;
      if (!g || !o.greetings.length) return false;
      try {
        const m = readMessage(g, 0);
        return m.role === "assistant" && matchesGreeting(m.text, o.greetings, o.name) === true;
      } catch {
        return false;
      }
    };
    let removed = 0;
    const watch = new MutationObserver((records) => records.forEach((r) => (removed += r.removedNodes.length)));
    watch.observe(root, { childList: true });
    // column-reverse: scrollTop 0 is the newest message, the top is -(scrollHeight - clientHeight)
    const toTop = () => (root.scrollTop = -root.scrollHeight);
    let stoppedBy = null;
    let seen = count(root);
    let quietSince = Date.now();
    let pushed = false;
    try {
      for (let first = true; ; first = false) {
        if (!root.isConnected || location.href !== href) fail("PAGE_CHANGED");
        if (removed) fail("MESSAGES_REMOVED");
        if (state.stop) stoppedBy = "user_stopped";
        else if (isStartCard(root.lastElementChild)) stoppedBy = "intro_card";
        else if (oldestIsGreeting()) stoppedBy = "greeting";
        else if (seen >= LIMITS.messages) stoppedBy = "message_limit";
        else if (Date.now() - state.startedAt > o.maxMs) stoppedBy = "time_limit";
        if (stoppedBy) break;
        if (first) toTop();
        await sleep(250);
        const n = count(root);
        state.count = n;
        if (n !== seen) {
          seen = n;
          quietSince = Date.now();
          pushed = false;
          toTop();
        } else if (document.visibilityState !== "visible") {
          quietSince = Date.now(); // a background tab is throttled: wait instead of giving up
        } else if (Date.now() - quietSince >= o.quietMs) {
          if (pushed) {
            stoppedBy = "quiet_timeout";
            break;
          }
          pushed = true;
          quietSince = Date.now();
          root.scrollTop += root.clientHeight; // leave the top and come back: a fresh scroll event
          await sleep(50);
          toTop();
        }
      }
    } finally {
      watch.disconnect();
    }
    const read = readAll(root);
    root.scrollTop = 0; // back to the latest messages
    return { ...read, stoppedBy, durationMs: Date.now() - state.startedAt, readerVersion: VERSION };
  }

  const inspect = safe(() => {
    const at = where();
    if (!at) fail("UNSUPPORTED_PAGE");
    if (at.page === "edit") return at;
    const { root, name } = openChat();
    return { ...at, name, count: count(root), phase: state.phase };
  });

  const start = safe((opts = {}) => {
    if (state.phase === "scrolling") fail("BUSY");
    const { at, root, name } = openChat();
    readAll(root); // unknown layout or a reply still being written: stop before scrolling
    const o = { greetings: [], name: name || "", quietMs: 3000, maxMs: 10 * 60 * 1000, ...opts };
    Object.assign(state, { phase: "scrolling", count: count(root), startedAt: Date.now(), stop: false, result: null });
    scroll(root, o).then(
      (r) => (state.result = { ok: true, ...at, name, ...r }),
      (e) => (state.result = asError(e)),
    ).finally(() => (state.phase = "done"));
    return {};
  });

  // Progress for the popup. A finished result is handed out once.
  function poll() {
    const out = { phase: state.phase, count: state.count, ms: state.startedAt ? Date.now() - state.startedAt : 0 };
    if (state.phase === "done") {
      out.result = state.result;
      Object.assign(state, { phase: "idle", result: null });
    }
    return out;
  }

  function stop() {
    if (state.phase === "scrolling") state.stop = true;
    return { ok: true };
  }

  // The character card from the open edit form: only fields the form shows.
  // A field that is not shown is null, never guessed.
  const readCard = safe(() => {
    const at = where();
    if (at?.page !== "edit") fail("UNSUPPORTED_PAGE");
    const shown = (el) => !!el && el.type !== "hidden" && el.getClientRects().length > 0;
    const value = (sel) => {
      const el = document.querySelector(sel);
      return shown(el) ? el.value : null;
    };
    const name = value('form input[name="name"]');
    if (!name?.trim()) fail("NO_FORM");
    const greetings = [...document.querySelectorAll('form textarea[name^="greetings."]')]
      .filter(shown)
      .sort((a, b) => a.name.split(".")[1] - b.name.split(".")[1])
      .map((el) => el.value)
      .filter((v) => v.trim());
    return {
      card: {
        characterId: at.characterId,
        name,
        tagline: value('form input[name="title"]'),
        description: value('form textarea[name="description"]'),
        greetings,
        definition: value('form textarea[name="definition"]'),
      },
    };
  });

  globalThis.duettaReader = { version: VERSION, LIMITS, where, matchesGreeting, inspect, start, poll, stop, readCard };
})();
