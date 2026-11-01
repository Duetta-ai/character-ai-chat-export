// Test pages and browser setup. Fixture pages are served at https://character.ai/... by
// request interception inside headless Chromium; nothing goes to the real site.
import { readFileSync, cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const ROOT = new URL("..", import.meta.url).pathname;
export const CHAR_ID = "FictionalLighthouseKeeperTim_TestOnly000000";
export const CHAT_ID = "00000000-0000-4000-8000-000000000001";
export const HANDLE = "lighthouse_fan";
export const CHAT_URL = `https://character.ai/chat/${CHAR_ID}?hist=${CHAT_ID}`;
export const EDIT_URL = `https://character.ai/character/${CHAR_ID}/edit`;

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
export const validate = ajv.compile(JSON.parse(readFileSync(join(ROOT, "contracts/cai-export-v1.schema.json"), "utf8")));

export const dom = (name) => readFileSync(join(ROOT, "fixtures/dom", `${name}.html`), "utf8").replace(/^<!--.*?-->\n/s, "");

const CSS = `
html, body { margin: 0; height: 100%; }
body { display: flex; font: 15px/1.5 sans-serif; }
aside { width: 200px; flex: none; }
main { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100vh; }
#chat-messages { flex: 1; display: flex; flex-direction: column-reverse; overflow-y: scroll; }
.swiper-wrapper { position: relative; }
.swiper-slide:not(.swiper-slide-active) { position: absolute; top: 0; left: 0; opacity: 0; pointer-events: none; }
#chat-details { display: none; }`;

// Runs in the fixture page and plays the site's part: while the list sits at the top, it
// "fetches" and appends older messages, one batch after another, like the real page does.
function siteHistory({ hide, batch, delay, chain, removeAfterFirstBatch }) {
  const root = document.getElementById("chat-messages");
  const older = [];
  for (let i = 0; i < hide; i++) older.push(root.removeChild(root.lastElementChild));
  let loading = false;
  const atTop = () => root.scrollTop <= -(root.scrollHeight - root.clientHeight) + 2;
  async function load() {
    if (loading || !older.length) return;
    loading = true;
    await fetch(`/__fixture/turns?older=${older.length}`).catch(() => {});
    await new Promise((r) => setTimeout(r, delay));
    for (let i = 0; i < batch && older.length; i++) root.append(older.pop());
    if (removeAfterFirstBatch) root.firstElementChild.remove();
    removeAfterFirstBatch = false;
    loading = false;
    if (chain && older.length) load();
  }
  root.addEventListener("scroll", () => atTop() && load());
}

export function chatPage({
  chat = "chat-short",
  creator = HANDLE,
  account = HANDLE,
  editLink = true,
  hide = 0,
  batch = 49,
  delay = 100,
  chain = true,
  removeAfterFirstBatch = false,
  messages = null,
} = {}) {
  let header = dom("chat-header");
  let panel = dom("character-panel");
  header = header.replaceAll(HANDLE, creator);
  panel = panel.replaceAll(HANDLE, creator);
  if (!editLink) panel = panel.replace(/<a [^>]*aria-label="Edit"[^>]*>[\s\S]*?<\/a>/, "");
  const menu = account ? `<button type="button" aria-haspopup="menu"><span title="${account}"></span><p>${account}</p></button>` : "";
  const list = messages ?? dom(chat);
  const opts = JSON.stringify({ hide, batch, delay, chain, removeAfterFirstBatch });
  return `<!doctype html><html><head><meta charset="utf-8"><title>Chat</title><style>${CSS}</style></head>
<body><aside>${menu}</aside><main><div id="chat-header">${header}</div>${list}<div id="chat-details">${panel}</div></main>
<script>(${siteHistory})(${opts})</script></body></html>`;
}

export function editPage({ hideDefinition = false } = {}) {
  let form = dom("character-edit-form");
  if (hideDefinition) form = form.replace('<div class="transition ease-in-out">', '<div class="transition ease-in-out" style="display:none">');
  const menu = `<button type="button" aria-haspopup="menu"><span title="${HANDLE}"></span><p>${HANDLE}</p></button>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Edit</title></head><body><aside>${menu}</aside><main>${form}</main></body></html>`;
}

// Serve pages at https://character.ai for one tab. `pages` maps a path (with query) to HTML.
export async function serve(page, pages, log = []) {
  await page.route("https://character.ai/**", (route) => {
    const url = new URL(route.request().url());
    log.push({ method: route.request().method(), path: url.pathname + url.search });
    if (url.pathname === "/__fixture/turns") return route.fulfill({ contentType: "application/json", body: "{}" });
    const html = pages[url.pathname + url.search] ?? pages[url.pathname];
    return html ? route.fulfill({ contentType: "text/html", body: html }) : route.fulfill({ status: 404, body: "" });
  });
}

export async function launch() {
  const context = await chromium.launchPersistentContext("", {
    headless: true,
    channel: "chromium",
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

// Loads the extension. Headless Chrome can't draw the toolbar popup, so the test copy drops
// default_popup: "clicking" the icon then only grants activeTab, and popup.html is opened in
// a window of its own. Permissions and code are the same as in extension/.
export async function loadExtension(context) {
  const dir = mkdtempSync(join(tmpdir(), "duetta-ext-"));
  cpSync(join(ROOT, "extension"), dir, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  delete manifest.action.default_popup;
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  const browser = await context.browser().newBrowserCDPSession();
  const { id } = await browser.send("Extensions.loadUnpacked", { path: dir });
  const openWindow = async (url) => {
    const next = context.waitForEvent("page");
    await browser.send("Target.createTarget", { url, newWindow: true });
    const page = await next;
    await page.waitForLoadState();
    return page;
  };
  // An extension page kept open to look up tabs and read the extension's storage.
  const helper = await openWindow(`chrome-extension://${id}/popup.html?tab`);
  // The user agrees to the first-use notice here; its own test clears the agreement and runs it again.
  await helper.click('[data-a="consent"]');
  return {
    id,
    helper,
    // The user's click on the extension icon in this tab.
    async click(page) {
      const { targetInfos } = await browser.send("Target.getTargets", { filter: [{}] });
      const tab = targetInfos.find((t) => t.type === "tab" && t.url === page.url());
      await browser.send("Extensions.triggerAction", { id, targetId: tab.targetId });
    },
    // popup.html acting on that tab, sized like the toolbar popup.
    async popup(page) {
      // Before the click the tab's URL is hidden from the extension: then it is the newest tab without one.
      const tabId = await helper.evaluate(async (url) => {
        const tabs = (await chrome.tabs.query({})).sort((a, b) => a.id - b.id);
        return (tabs.filter((t) => t.url === url).at(-1) ?? tabs.filter((t) => !t.url).at(-1))?.id;
      }, page.url());
      const popup = await openWindow(`chrome-extension://${id}/popup.html?target=${tabId}`);
      await popup.setViewportSize({ width: 360, height: 640 });
      return popup;
    },
    storage: () => helper.evaluate(() => chrome.storage.session.get(null)),
  };
}
