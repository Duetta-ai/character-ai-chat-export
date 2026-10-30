// The v1 file: schema, golden files and the rules of buildExport. Node only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { buildExport, fileName, imageType, serialize, utf8Bytes, LIMITS } from "../extension/export.js";
import { ROOT } from "./harness.mjs";
import "../extension/reader.js";

const { matchesGreeting } = globalThis.duettaReader;
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
export const validate = ajv.compile(JSON.parse(readFileSync(join(ROOT, "contracts/cai-export-v1.schema.json"), "utf8")));
const golden = (name) => JSON.parse(readFileSync(join(ROOT, "fixtures/golden", name), "utf8"));
const errors = (file) => (validate(file) ? [] : validate.errors.map((e) => `${e.instancePath} ${e.keyword}`));

const card = {
  characterId: "FictionalCharacterId0000000000000000000000",
  name: "Нора",
  tagline: "Астроном",
  description: "Любит тёплый чай и ночные прогулки.",
  greetings: ["Привет, {{user}}! Сегодня *ясное* небо."],
  definition: "Нора спокойная и любознательная.",
};
const capture = (messages, more = {}) => ({
  characterId: card.characterId,
  chatId: null,
  name: card.name,
  messages,
  leftOut: 0,
  startCard: false,
  stoppedBy: "greeting",
  readerVersion: "cai-dom-1",
  ...more,
});
const chat = [
  { role: "assistant", text: "Привет, Мира Ли! Сегодня ясное небо." },
  { role: "user", text: "Завтра поднимемся на крышу?" },
  { role: "assistant", text: "Да. Возьму карту звёзд и термос. 🔭" },
];
const build = (over = {}) =>
  buildExport({
    card,
    capture: capture(chat),
    confirmed: { start: true, end: true },
    matchesGreeting,
    exportId: "7af538f6-e5a4-48cc-8bdf-3a8e0d3ef326",
    now: new Date("2026-10-30T12:00:00Z"),
    ...over,
  });

test("golden files pass the schema", () => {
  const names = readdirSync(join(ROOT, "fixtures/golden")).filter((n) => n.endsWith(".json"));
  assert.ok(names.length >= 3);
  for (const name of names) assert.deepEqual(errors(golden(name)), [], name);
});

test("the schema refuses what v1 does not allow", () => {
  const base = golden("short-complete.json");
  const cases = {
    "unknown version": (f) => (f.schema_version = 2),
    "unknown field": (f) => (f.character.age = 30),
    "system role": (f) => (f.chat.messages[0].role = "system"),
    "empty text": (f) => (f.chat.messages[0].text = ""),
    "avatar as URL": (f) => (f.character.avatar = "https://example.com/a.png"),
    "avatar from elsewhere": (f) => (f.character.avatar = { mime_type: "image/png", data_base64: "AAAA", source: "url" }),
    "complete without confirmations": (f) => (f.chat.coverage.user_confirmed_start = false),
    "partial with both confirmations": (f) => (f.chat.coverage.status = "partial"),
    "no character id": (f) => delete f.character.source_character_id,
    "not created by the user": (f) => (f.ownership.character_created_by_user = false),
    "too many messages": (f) => (f.chat.messages = Array.from({ length: 5001 }, () => f.chat.messages[0])),
    "unknown warning": (f) => f.warnings.push("SOMETHING"),
    "made-up chat id": (f) => (f.chat.source_chat_id = "chat-123"),
  };
  for (const [name, change] of Object.entries(cases)) {
    const file = structuredClone(base);
    change(file);
    assert.notDeepEqual(errors(file), [], name);
  }
});

test("built file: complete only when the user confirmed both the start and the end", () => {
  const { file, leftOut } = build();
  assert.deepEqual(errors(file), []);
  assert.equal(leftOut, 0);
  assert.equal(file.chat.coverage.status, "complete");
  assert.equal(file.chat.coverage.first_message_matches_greeting, true);
  assert.deepEqual(file.character.alternate_greetings, []);
  assert.deepEqual(
    file.chat.messages.map((m) => [m.index, m.role, m.text, m.source_message_id, m.source_created_at]),
    chat.map((m, i) => [i, m.role, m.text, null, null]),
  );
  assert.deepEqual(file.warnings, ["SOURCE_CHAT_ID_UNAVAILABLE", "SOURCE_MESSAGE_IDS_UNAVAILABLE", "SOURCE_TIMESTAMPS_UNAVAILABLE", "TEXT_AS_DISPLAYED", "AVATAR_NOT_INCLUDED"]);
  for (const confirmed of [{ start: false, end: true }, { start: true, end: false }, {}]) {
    const partial = build({ confirmed }).file;
    assert.equal(partial.chat.coverage.status, "partial");
    assert.deepEqual(errors(partial), []);
  }
  const noStart = build({ capture: capture(chat.slice(1)), confirmed: { start: false, end: true } }).file;
  assert.equal(noStart.chat.coverage.first_message_matches_greeting, false);
  assert.ok(noStart.warnings.includes("FIRST_MESSAGE_NOT_GREETING") && noStart.warnings.includes("CHAT_START_NOT_CONFIRMED"));
  const noGreeting = build({ card: { ...card, greetings: [] } }).file;
  assert.equal(noGreeting.chat.coverage.first_message_matches_greeting, null);
  assert.ok(noGreeting.warnings.includes("CHARACTER_FIELDS_MISSING"));
  assert.throws(() => build({ capture: { ...capture(chat), characterId: "AnotherCharacterId" } }), /CARD_MISMATCH/);
});

test("a chat bigger than one file keeps the newest messages that fit and says so", () => {
  const big = Array.from({ length: 400 }, (_, i) => ({ role: i % 2 ? "user" : "assistant", text: `${i} ` + "ж".repeat(8000) }));
  const { file, leftOut } = build({ capture: capture(big, { leftOut: 2 }) });
  const size = utf8Bytes(serialize(file));
  assert.ok(size <= LIMITS.fileBytes, `${size}`);
  assert.ok(size > LIMITS.fileBytes - 20_000, "as much as fits");
  assert.equal(leftOut, 2 + 400 - file.chat.messages.length);
  assert.equal(file.chat.messages.at(-1).text, big.at(-1).text, "the newest message is kept");
  assert.equal(file.chat.messages[0].text, big[400 - file.chat.messages.length].text, "the kept part is contiguous");
  assert.ok(file.chat.messages.every((m, i) => m.text === big[400 - file.chat.messages.length + i].text), "no text is cut");
  assert.equal(file.chat.coverage.user_confirmed_start, false, "the start is not in the file");
  assert.equal(file.chat.coverage.status, "partial");
  assert.ok(file.warnings.includes("HISTORY_LIMIT_REACHED"));
  assert.deepEqual(errors(file), []);
});

test("a picture the user chose goes into the file as base64", () => {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const { file } = build({ photo: { mime_type: "image/png", data_base64: png } });
  assert.deepEqual(file.character.avatar, { mime_type: "image/png", data_base64: png, source: "user_selected_file" });
  assert.ok(!file.warnings.includes("AVATAR_NOT_INCLUDED"));
  assert.deepEqual(errors(file), []);
  const bytes = (b64) => Uint8Array.from(Buffer.from(b64, "base64"));
  assert.equal(imageType(bytes(png)), "image/png");
  assert.equal(imageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(imageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(imageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  assert.equal(imageType(new TextEncoder().encode("GIF89a......")), null);
});

test("greeting check: displayed text vs the greeting with markup and placeholders", () => {
  const g = ["Привет, {{user}}! Я {{char}}. *машет рукой*"];
  assert.equal(matchesGreeting("Привет, Мира! Я Нора. машет рукой", g, "Нора"), true);
  assert.equal(matchesGreeting("Привет,  Мира Ли!\nЯ Нора.\n\nмашет рукой", g, "Нора"), true);
  assert.equal(matchesGreeting("Привет, Мира! Я Нора.", g, "Нора"), false);
  assert.equal(matchesGreeting("Привет, Мира! Я Тим. машет рукой", g, "Нора"), false);
  assert.equal(matchesGreeting("Hi there", ["Hello", "Hi there!"], "X"), true, "any of the greetings");
  assert.equal(matchesGreeting("Hi there", [], "X"), null);
  assert.equal(matchesGreeting("Hi there", ["", "  "], "X"), null);
});

test("file name is safe for any system", () => {
  const d = new Date("2026-10-30T12:00:00Z");
  assert.equal(fileName("Маячник Тим", d), "Маячник Тим chat 2026-10-30.json");
  assert.equal(fileName('a/b\\c:d*e?"f<g>h|\u0007', d), "a b c d e f g h chat 2026-10-30.json");
  assert.equal(fileName("   ", d), "character chat 2026-10-30.json");
});
