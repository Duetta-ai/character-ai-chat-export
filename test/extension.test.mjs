// The real extension in headless Chromium: popup flow, saved file, session cleanup and a
// network log. Set SHOTS=<dir> to also save screenshots of the popup and the network log.
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, loadExtension, serve, chatPage, editPage, validate, CHAT_URL, EDIT_URL, CHAR_ID } from "./harness.mjs";

const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = (popup, name) => SHOTS && popup.locator("body").screenshot({ path: join(SHOTS, `${name}.png`) });
const view = (popup, name) => popup.waitForSelector(`[data-view="${name}"]:not([hidden])`, { timeout: 15000 });
const text = (popup, f) => popup.locator(`[data-f="${f}"]`).innerText();

let browser;
let ext;
const network = []; // every request any page or the extension made
const pageInitiators = []; // requests from the character.ai tab with the script that started them
before(async () => {
  browser = await launch();
  ext = await loadExtension(browser.context);
  await browser.page.close();
  browser.context.on("request", (r) => network.push({ page: r.frame()?.page()?.url() ?? null, method: r.method(), url: r.url() }));
});
// Every test starts with no site tabs, no popups and an empty session.
afterEach(async () => {
  await Promise.all(browser.context.pages().filter((p) => p !== ext.helper).map((p) => p.close()));
  await ext.helper.evaluate(() => chrome.storage.session.clear());
});
after(async () => {
  const fromExtensionToWeb = network.filter((r) => r.page?.startsWith("chrome-extension://") && !r.url.startsWith("chrome-extension://"));
  const fromReader = pageInitiators.filter((r) => r.scripts.some((s) => s.startsWith("chrome-extension://")));
  if (SHOTS) writeFileSync(join(SHOTS, "network-log.json"), JSON.stringify({ network, pageInitiators, fromExtensionToWeb, fromReader }, null, 2));
  await browser.context.close();
  assert.deepEqual(fromExtensionToWeb, [], "extension pages made no web requests");
  assert.deepEqual(fromReader, [], "the reader in the page made no requests");
});

// A fresh tab with the fixture site; `opts` shape the chat page.
async function site(opts = {}) {
  const page = await browser.context.newPage();
  await page.setViewportSize({ width: 1100, height: 760 });
  await serve(page, { [new URL(CHAT_URL).pathname]: chatPage(opts), [new URL(EDIT_URL).pathname]: editPage() });
  const cdp = await browser.context.newCDPSession(page);
  await cdp.send("Network.enable");
  cdp.on("Network.requestWillBeSent", (e) =>
    pageInitiators.push({
      url: e.request.url,
      method: e.request.method,
      initiator: e.initiator.type,
      scripts: [...new Set((e.initiator.stack?.callFrames || []).map((f) => f.url))],
    }),
  );
  return page;
}
// The user clicks the extension icon on this tab; the popup opens.
async function clickIcon(page) {
  await ext.click(page);
  return ext.popup(page);
}
async function addCard(page) {
  await page.goto(EDIT_URL);
  const popup = await clickIcon(page);
  await view(popup, "card");
  await shot(popup, "1-card");
  await popup.click('[data-a="add-card"]');
  await popup.waitForSelector('[data-f="card-done"]:not([hidden])');
  await popup.close();
}
const session = () => ext.storage();

test("whole chat: card, autoscroll with progress, preview, confirmation, file, cleanup", async () => {
  const page = await site({ chat: "chat-long-scrolled", hide: 61, batch: 20, delay: 700 });
  await addCard(page);
  assert.deepEqual(Object.keys(await session()), ["card"]);

  await page.goto(CHAT_URL);
  const popup = await clickIcon(page);
  await view(popup, "chat");
  assert.equal(await text(popup, "loaded"), "10");
  await shot(popup, "2-chat");
  await popup.click('[data-a="save-chat"]');
  await view(popup, "progress");
  await popup.waitForFunction(() => Number(document.querySelector('[data-f="count"]').textContent) >= 30);
  await shot(popup, "3-scrolling");
  await view(popup, "review");
  await shot(popup, "5-preview");
  assert.equal(await text(popup, "r-count"), "71 (35 yours, 36 the character's)");
  assert.equal(await text(popup, "r-greeting"), "✓ Starts with the character's greeting");
  assert.equal(await text(popup, "r-status"), "Complete chat");
  assert.equal(await text(popup, "r-stopped"), "Reached the first message");
  assert.match(await text(popup, "r-first"), /^Привет! Я Тим/);
  assert.match(await text(popup, "r-last"), /^Спасибо тебе за такой долгий разговор/);
  assert.equal(await popup.isDisabled('[data-a="save-file"]'), true, "saving needs the ownership confirmation");
  await popup.check('[data-c="own"]');
  const download = popup.waitForEvent("download");
  await popup.click('[data-a="save-file"]');
  const saved = await download;
  const path = join(mkdtempSync(join(tmpdir(), "duetta-dl-")), saved.suggestedFilename());
  await saved.saveAs(path);
  await view(popup, "saved");
  await shot(popup, "6-saved");
  assert.match(saved.suggestedFilename(), /^Маячник Тим chat \d{4}-\d{2}-\d{2}\.json$/);

  const file = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(validate(file), true, JSON.stringify(validate.errors));
  assert.equal(file.character.source_character_id, CHAR_ID);
  assert.equal(file.chat.messages.length, 71);
  assert.deepEqual(file.chat.coverage, {
    status: "complete",
    captured_count: 71,
    total_count: null,
    stopped_by: "greeting",
    first_message_matches_greeting: true,
    user_confirmed_start: true,
    user_confirmed_end: true,
  });
  if (SHOTS) writeFileSync(join(SHOTS, "export-example.json"), readFileSync(path));
  await popup.waitForTimeout(200);
  assert.deepEqual(await session(), {}, "nothing is kept after saving");

  const history = pageInitiators.filter((r) => r.url.includes("/__fixture/turns"));
  assert.equal(history.length, 4, "older messages came from the page's own requests");
  assert.ok(
    history.every((r) => r.scripts.length && r.scripts.every((s) => s.startsWith("https://character.ai/"))),
    JSON.stringify(history),
  );
  await page.close();
});

test("Stop and save what's loaded gives a partial chat", async () => {
  const page = await site({ chat: "chat-long-scrolled", hide: 61, batch: 10, delay: 700 });
  await addCard(page);
  await page.goto(CHAT_URL);
  const popup = await clickIcon(page);
  await view(popup, "chat");
  await popup.click('[data-a="save-chat"]');
  await popup.waitForFunction(() => Number(document.querySelector('[data-f="count"]').textContent) >= 20);
  await popup.click('[data-a="stop"]');
  await view(popup, "review");
  await shot(popup, "4-stopped");
  assert.equal(await text(popup, "r-stopped"), "You stopped loading");
  assert.equal(await text(popup, "r-status"), "Partial chat");
  assert.equal(await popup.isChecked('[data-c="start"]'), false);
  assert.match(await text(popup, "r-greeting"), /^Doesn't start with the greeting/);
  await popup.click('[data-a="start-over"]');
  await view(popup, "chat");
  assert.deepEqual(await session(), {}, "Start over clears everything");
  await popup.close();
  await page.close();
});

test("someone else's character: error, nothing read", async () => {
  const page = await site({ creator: "someone_else" });
  await page.goto(CHAT_URL);
  const popup = await clickIcon(page);
  await view(popup, "error");
  await shot(popup, "7-error-not-own");
  assert.equal(await text(popup, "e-title"), "This isn't your character");
  assert.match(await text(popup, "e-text"), /“By @someone_else”, and you're signed in as @lighthouse_fan/);
  assert.deepEqual(await session(), {});
  await popup.close();
  await page.close();
});

test("own picture from a file the user picks, in a tab", async () => {
  const page = await site({ chat: "chat-short" });
  await addCard(page);
  await page.goto(CHAT_URL);
  const popup = await clickIcon(page);
  await view(popup, "chat");
  await popup.click('[data-a="save-chat"]');
  await view(popup, "review");
  assert.equal(await popup.getAttribute('[data-f="photo-link"]', "href"), "popup.html?tab");
  const tab = await browser.context.newPage();
  await tab.goto(`chrome-extension://${ext.id}/popup.html?tab`);
  await view(tab, "review");
  const png = join(mkdtempSync(join(tmpdir(), "duetta-img-")), "me.png");
  writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
  await tab.setInputFiles('[data-f="photo-input"]', png);
  await tab.waitForSelector('[data-f="r-photo"]:not([hidden])');
  const notImage = join(mkdtempSync(join(tmpdir(), "duetta-img-")), "fake.png");
  writeFileSync(notImage, "<svg xmlns='http://www.w3.org/2000/svg'/>");
  await tab.setInputFiles('[data-f="photo-input"]', notImage);
  assert.equal(await text(tab, "r-photo-text"), "Use a PNG, JPEG or WebP picture.");
  await tab.check('[data-c="own"]');
  const download = tab.waitForEvent("download");
  await tab.click('[data-a="save-file"]');
  const file = JSON.parse(readFileSync(await (await download).path(), "utf8"));
  assert.equal(validate(file), true, JSON.stringify(validate.errors));
  assert.deepEqual(file.character.avatar.source, "user_selected_file");
  assert.equal(file.chat.coverage.stopped_by, "intro_card");
  assert.equal(file.chat.coverage.status, "complete");
  await tab.close();
  await popup.close();
  await page.close();
});

test("without the user's click the extension cannot read the tab", async () => {
  const page = await site();
  await page.goto(CHAT_URL);
  const popup = await ext.popup(page); // opened without clicking the icon on this tab
  await view(popup, "unsupported");
  const attempt = await popup.evaluate(async () => {
    const tabId = Number(new URLSearchParams(location.search).get("target"));
    return chrome.scripting.executeScript({ target: { tabId }, func: () => document.title }).then(
      () => "read",
      (e) => e.message,
    );
  });
  assert.match(attempt, /Cannot access contents of the page/);
  await popup.close();
  await page.close();
});
