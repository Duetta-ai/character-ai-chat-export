// The page reader on fixture pages in headless Chromium.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { launch, serve, chatPage, editPage, dom, ROOT, CHAT_URL, EDIT_URL, CHAR_ID, CHAT_ID, HANDLE } from "./harness.mjs";

const GREETING = "Привет! Я Тим, смотритель маяка на острове Ветряк. Сегодня ветер с севера. О чём поговорим?";
// The short chat as it was read from the live page (innerText) when the fixture was taken, oldest first.
const SHORT = [
  ["assistant", GREETING],
  ["user", "Привет, Тим! Какая сегодня погода у маяка? 🌊"],
  ["assistant", "Добрый день! Погода у маяка хорошая, ветер не сильный, волны умеренные. Солнце светит ярко, и на море тепло. Дождь обещают только завтра."],
  ["user", "Вопрос с переносами строк.\n\nВторая строка после пустой.\nЖирный и курсив — как отобразятся?"],
  ["assistant", "Вот так:\n\nЖирный и курсив выглядят отлично!\n\nКстати, сегодня заметил в журнале погоды — чайки высоко летают. Значит, штормов не будет. ☕"],
  ["user", "ок"],
  ["assistant", "Кстати, ты любишь чай? У меня на маяке всегда есть отличный чабрец на все случаи: успокаивает, бодрит, согревает. Отличный помощник в дождливые вечера."],
  ["user", "ок"],
  ["assistant", "Я понял, что ты лаконичен сегодня. Можешь просто слушать, если хочешь. наливает чашку чая с чабрецом\n\nСегодня закат был особенно красным — значит, завтра ветер сменится. 🌅"],
  ["user", "Спасибо! До связи 👋"],
  ["assistant", "Удачи! махает рукой, выпивает чай и возвращается к своим делам у маяка"],
];

let browser;
let page;
let requests;
before(async () => {
  browser = await launch();
});
after(() => browser.context.close());

// Open a fixture page as https://character.ai/... and load the reader into it.
async function open(html, url = CHAT_URL) {
  page = await browser.context.newPage();
  requests = [];
  await serve(page, { [new URL(url).pathname]: html }, requests);
  await page.goto(url);
  await page.addScriptTag({ path: join(ROOT, "extension/reader.js") });
  return page;
}
const R = (fn, arg) => page.evaluate(([fn, arg]) => globalThis.duettaReader[fn](arg), [fn, arg ?? null]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function capture(opts = {}, whileRunning) {
  const started = await R("start", { greetings: [GREETING], quietMs: 300, ...opts });
  if (!started.ok) return started;
  for (;;) {
    const p = await R("poll");
    if (p.phase === "done") return p.result;
    await whileRunning?.(p);
    await sleep(50);
  }
}
const texts = (r) => r.messages.map((m) => [m.role, m.text]);

test("short chat: exact text, proven roles, order, repeated phrases, emoji, shown reply only", async () => {
  await open(chatPage({ chat: "chat-short" }));
  const r = await capture();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(texts(r), SHORT);
  assert.equal(r.messages.filter((m) => m.text === "ок").length, 2, "two identical messages stay two messages");
  assert.ok(!r.messages.some((m) => m.text.includes("👋🏻⚓️")), "the swiped-away reply is not saved");
  assert.equal(r.stoppedBy, "intro_card");
  assert.equal(r.startCard, true);
  assert.equal(r.characterId, CHAR_ID);
  assert.equal(r.chatId, CHAT_ID);
  assert.equal(r.name, "Маячник Тим");
  assert.deepEqual(requests.map((q) => q.path), [new URL(CHAT_URL).pathname + new URL(CHAT_URL).search], "no requests besides the page itself");
  await page.close();
});

test("branch chat reads the same way", async () => {
  await open(chatPage({ chat: "chat-branch" }));
  const r = await capture();
  assert.equal(r.messages.length, 13);
  assert.deepEqual(texts(r).slice(0, 10), SHORT.slice(0, 10), "a branch starts as a copy of the chat");
  await page.close();
});

test("scrolls up until the greeting while the page loads older messages by itself", async () => {
  await open(chatPage({ chat: "chat-long-scrolled", hide: 61, batch: 20 }));
  assert.equal((await R("inspect")).count, 10);
  const r = await capture();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.stoppedBy, "greeting");
  assert.equal(r.messages.length, 71);
  assert.deepEqual(r.messages[0], { role: "assistant", text: GREETING });
  const questions = r.messages.filter((m) => m.role === "user").map((m) => m.text.slice(0, 4));
  assert.deepEqual(questions, Array.from({ length: 35 }, (_, i) => `[${String(i + 1).padStart(2, "0")}]`));
  assert.ok(r.messages.every((m, i) => m.role === (i % 2 ? "user" : "assistant")), "roles alternate");
  const history = requests.filter((q) => q.path.startsWith("/__fixture/turns"));
  assert.equal(history.length, 4, "the page made its own history requests: 61 older messages in batches of 20");
  assert.equal(requests.length, 5, "the page and its 4 history requests, nothing else");
  assert.equal(await page.evaluate(() => document.querySelector("#chat-messages").scrollTop), 0, "back at the newest messages");
  await page.close();
});

test("pushes again when the page does not continue by itself", async () => {
  await open(chatPage({ chat: "chat-long-scrolled", hide: 61, batch: 20, chain: false }));
  const r = await capture();
  assert.equal(r.stoppedBy, "greeting");
  assert.equal(r.messages.length, 71);
  await page.close();
});

test("without a known greeting it stops when nothing new arrives", async () => {
  await open(chatPage({ chat: "chat-long-scrolled", hide: 30 }));
  const r = await capture({ greetings: [] });
  assert.equal(r.stoppedBy, "quiet_timeout");
  assert.equal(r.messages.length, 71);
  await page.close();
});

test("open chat without its start: the 50 shown messages are the exact tail", async () => {
  await open(chatPage({ chat: "chat-long-scrolled" }));
  const full = (await capture()).messages;
  await page.close();
  await open(chatPage({ chat: "chat-long-open" }));
  const r = await capture();
  assert.equal(r.stoppedBy, "quiet_timeout");
  assert.deepEqual(r.messages, full.slice(-50));
  await page.close();
});

test("Stop keeps what is loaded so far", async () => {
  await open(chatPage({ chat: "chat-long-scrolled", hide: 61, batch: 10, delay: 250 }));
  let stopped = false;
  const r = await capture({}, async (p) => {
    if (!stopped && p.count >= 30) {
      stopped = true;
      await R("stop");
    }
  });
  assert.equal(r.stoppedBy, "user_stopped");
  assert.ok(r.messages.length >= 30 && r.messages.length < 71, `${r.messages.length}`);
  assert.equal(r.messages.at(-1).text.slice(0, 21), "Спасибо тебе за такой");
  await page.close();
});

test("messages removed while loading: error, nothing returned", async () => {
  await open(chatPage({ chat: "chat-long-scrolled", hide: 30, removeAfterFirstBatch: true }));
  const r = await capture();
  assert.deepEqual([r.ok, r.code], [false, "MESSAGES_REMOVED"]);
  await page.close();
});

test("another chat opened while loading: error", async () => {
  await open(chatPage({ chat: "chat-long-scrolled", hide: 61, batch: 10, delay: 300 }));
  const r = await capture({}, () => page.evaluate(() => history.pushState(null, "", "/chat/AnotherCharacterId000000000000000000000")));
  assert.deepEqual([r.ok, r.code], [false, "PAGE_CHANGED"]);
  await page.close();
});

test("unknown page layout is an explicit error, never a guess", async () => {
  const cases = [
    ["no badge on a reply", (l) => l.querySelector(".cai-badge:not(.swiper-slide *)").remove(), "UNKNOWN_ROLE"],
    ["badge in the user's row", (l) => l.querySelector(".flex-row-reverse").append(Object.assign(document.createElement("div"), { className: "cai-badge" })), "UNKNOWN_ROLE"],
    ["no text block", (l) => l.querySelector(".flex-row-reverse").closest("#chat-messages > *").querySelector(".prose").remove(), "UNKNOWN_MESSAGE"],
    ["no selected reply", (l) => l.querySelector(".swiper-slide-active").classList.remove("swiper-slide-active"), "UNKNOWN_MESSAGE"],
    ["reply still being written", (l) => l.querySelector(".swiper-slide-active").append(Object.assign(document.createElement("div"), { className: "ticontainer" })), "GENERATING"],
    ["empty message", (l) => (l.querySelector(".flex-row-reverse").closest("#chat-messages > *").querySelector(".prose").textContent = " "), "EMPTY_MESSAGE"],
    ["start card in the middle", (l) => l.insertBefore(l.lastElementChild, l.children[3]), "UNKNOWN_MESSAGE"],
    ["no message list", (l) => l.remove(), "NO_CHAT"],
  ];
  for (const [name, change, code] of cases) {
    await open(chatPage({ chat: "chat-short" }));
    await page.evaluate(`(${change})(document.querySelector("#chat-messages"))`);
    const r = await R("start", { greetings: [GREETING] });
    assert.deepEqual([r.ok, r.code], [false, code], name);
    await page.close();
  }
});

test("only your own character: creator must match the account and the Edit link must exist", async () => {
  const cases = [
    [{ creator: "someone_else" }, "NOT_OWN", { creator: "someone_else", account: HANDLE, editLink: true }],
    [{ editLink: false }, "NOT_OWN", { creator: HANDLE, account: HANDLE, editLink: false }],
    [{ account: null }, "OWNER_UNKNOWN", { creator: HANDLE, account: null, editLink: true }],
  ];
  for (const [opts, code, detail] of cases) {
    await open(chatPage(opts));
    for (const fn of ["inspect", "start"]) assert.deepEqual(await R(fn), { ok: false, code, detail }, `${fn} ${JSON.stringify(opts)}`);
    await page.close();
  }
  await open(chatPage());
  const ok = await R("inspect");
  assert.deepEqual(ok, { ok: true, page: "chat", characterId: CHAR_ID, chatId: CHAT_ID, name: "Маячник Тим", count: 11, phase: "idle" });
  await page.close();
});

test("exact origin and route", async () => {
  await open(chatPage(), "https://character.ai/profile/" + HANDLE);
  assert.equal((await R("inspect")).code, "UNSUPPORTED_PAGE");
  const where = (u) => page.evaluate((u) => globalThis.duettaReader.where(u), u);
  assert.deepEqual(await where(CHAT_URL), { page: "chat", characterId: CHAR_ID, chatId: CHAT_ID });
  assert.deepEqual(await where(`https://character.ai/chat/${CHAR_ID}`), { page: "chat", characterId: CHAR_ID, chatId: null });
  assert.deepEqual(await where(`https://character.ai/chat/${CHAR_ID}?hist=not-a-uuid`), { page: "chat", characterId: CHAR_ID, chatId: null });
  assert.deepEqual(await where(EDIT_URL), { page: "edit", characterId: CHAR_ID });
  for (const u of [
    `http://character.ai/chat/${CHAR_ID}`,
    `https://www.character.ai/chat/${CHAR_ID}`,
    `https://character.ai.example.com/chat/${CHAR_ID}`,
    `https://character.ai/chat/${CHAR_ID}/x`,
    `https://character.ai/character/${CHAR_ID}`,
    "https://character.ai/",
    "chrome://extensions/",
    undefined,
  ])
    assert.equal(await where(u), null, String(u));
  await page.close();
});

test("limits: the newest 5,000 messages are kept and the rest is reported; long messages are refused", async () => {
  const user = (i) => `<div><div class="flex-row-reverse"></div><div class="prose"><p>m${i}</p></div></div>`;
  const char = (i) => `<div><div class="cai-badge">c.ai</div><div class="prose"><p>m${i}</p></div></div>`;
  const items = Array.from({ length: 5003 }, (_, i) => (i % 2 ? user(i) : char(i))).reverse().join("");
  await open(chatPage({ messages: `<div id="chat-messages">${items}</div>` }));
  const r = await capture({ greetings: [] });
  assert.equal(r.stoppedBy, "message_limit");
  assert.equal(r.messages.length, 5000);
  assert.equal(r.leftOut, 3);
  assert.equal(r.messages[0].text, "m3");
  assert.equal(r.messages.at(-1).text, "m5002");
  await page.close();

  await open(chatPage({ chat: "chat-short" }));
  await page.evaluate(() => (document.querySelector("#chat-messages .flex-row-reverse").closest("#chat-messages > *").querySelector(".prose").textContent = "я".repeat(17000)));
  const long = await R("start", { greetings: [GREETING] });
  assert.deepEqual([long.ok, long.code, long.detail.index], [false, "MESSAGE_TOO_LONG", 9]);
  await page.close();
});

test("character card: only the fields the open form shows", async () => {
  await open(editPage(), EDIT_URL);
  const r = await R("readCard");
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(Object.keys(r.card), ["characterId", "name", "tagline", "description", "greetings", "definition"]);
  assert.equal(r.card.characterId, CHAR_ID);
  assert.equal(r.card.name, "Маячник Тим");
  assert.equal(r.card.tagline, "Тестовый персонаж: смотритель маяка");
  assert.deepEqual(r.card.greetings, [GREETING]);
  assert.match(r.card.description, /^Вымышленный тестовый персонаж/);
  assert.match(r.card.definition, /^Тим — вымышленный смотритель маяка/);
  await page.close();

  await open(editPage({ hideDefinition: true }), EDIT_URL);
  assert.equal((await R("readCard")).card.definition, null, "a hidden field is null, not read");
  assert.equal((await R("inspect")).page, "edit");
  await page.close();

  await open(chatPage());
  assert.equal((await R("readCard")).code, "UNSUPPORTED_PAGE");
  await page.close();
});

test("fixtures carry no real identifiers", () => {
  for (const name of ["chat-short", "chat-branch", "chat-long-open", "chat-long-scrolled", "chat-header", "character-panel", "character-edit-form"]) {
    const html = dom(name);
    const urls = (html.match(/https?:\/\/[^"'\s<>]+/g) || []).filter((u) => !u.startsWith("http://www.w3.org/"));
    assert.deepEqual(urls, [], name);
    assert.doesNotMatch(html, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, name);
    for (const handle of html.match(/@[A-Za-z0-9_]+/g) || []) assert.equal(handle, `@${HANDLE}`, name);
  }
});
