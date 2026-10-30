// Golden files: the reader on fixture pages plus buildExport, with a fixed id and time.
// Regenerate with UPDATE_GOLDEN=1 after an intended format change, then review the diff.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildExport, serialize } from "../extension/export.js";
import { launch, serve, chatPage, editPage, ROOT, CHAT_URL, EDIT_URL, CHAR_ID } from "./harness.mjs";
import "../extension/reader.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
let browser;
before(async () => (browser = await launch()));
after(() => browser.context.close());

async function inPage(url, html, fn, arg) {
  const page = await browser.context.newPage();
  await serve(page, { [new URL(url).pathname]: html });
  await page.goto(url);
  await page.addScriptTag({ path: join(ROOT, "extension/reader.js") });
  const out = await page.evaluate(fn, arg);
  await page.close();
  return out;
}
const readCard = () => inPage(EDIT_URL, editPage(), () => globalThis.duettaReader.readCard());
const readChat = (url, html, greetings) =>
  inPage(url, html, async (greetings) => {
    const R = globalThis.duettaReader;
    R.start({ greetings, quietMs: 300 });
    for (;;) {
      const p = R.poll();
      if (p.phase === "done") return p.result;
      await new Promise((r) => setTimeout(r, 50));
    }
  }, greetings);

const cases = [
  ["short-complete.json", CHAT_URL, "chat-short", { start: true, end: true }, null],
  ["long-partial.json", `https://character.ai/chat/${CHAR_ID}`, "chat-long-open", { start: false, end: true }, null],
  ["long-complete-avatar.json", CHAT_URL, "chat-long-scrolled", { start: true, end: true }, { mime_type: "image/png", data_base64: PNG }],
];

for (const [name, url, chat, confirmed, photo] of cases) {
  test(`golden ${name}`, async () => {
    const { card } = await readCard();
    const r = await readChat(url, chatPage({ chat }), card.greetings);
    assert.equal(r.ok, true, JSON.stringify(r));
    const { file } = buildExport({
      card,
      capture: r,
      photo,
      confirmed,
      matchesGreeting: globalThis.duettaReader.matchesGreeting,
      exportId: "11111111-1111-4111-8111-111111111111",
      now: new Date("2026-10-29T12:00:00Z"),
    });
    const path = join(ROOT, "fixtures/golden", name);
    if (process.env.UPDATE_GOLDEN) writeFileSync(path, serialize(file));
    assert.deepEqual(file, JSON.parse(readFileSync(path, "utf8")));
  });
}
