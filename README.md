# Duetta Chat Export

A Chrome extension that saves **a character you created** and **your chat with it** to a JSON file on your computer. Compatible with Character.AI.

The file uses Duetta's own format (v1), described by a JSON Schema in [`contracts/`](contracts/cai-export-v1.schema.json). It is meant for importing the character and the chat into Duetta, and it is plain JSON that anyone can read.

This project is not affiliated with or endorsed by Character.AI.

## What it does

1. On your character's **Edit** page, click the extension and **Add character card**. It reads what the form shows: name, tagline, description, greetings and definition.
2. Open your chat with that character, click the extension and **Save whole chat**. The extension scrolls the chat up to the first message; the site loads older messages as the list reaches the top, the same way it does when you scroll by hand. You see how many messages are loaded and can **Stop and save what's loaded** at any time.
3. The extension then reads the messages on the page once and shows a preview: the character, the number of messages, the first and the last message, whether the chat starts with the character's greeting, and whether the chat is complete.
4. You confirm that the character and the chat are yours, and whether the first and last messages are the real start and end. Optionally add your own picture from a file on your computer. **Save file** downloads the JSON.

Only you start it, by clicking. It works on your own characters only: the chat header must say "By @you" with the handle of the account you are signed in with, and the page must have the character's Edit link.

## What is saved

- The character card, as the edit form shows it. A field the form does not show is saved as `null`, never guessed.
- One chat: every message from the first loaded one to the newest, in order, with who wrote it (you or the character) and the text as displayed, including line breaks and emoji. Identical messages stay separate.
- Only the reply variant that is shown. Variants you swiped away are not saved.
- A picture only if you choose an image file (PNG, JPEG or WebP, up to 2 MB and 16 megapixels).
- How complete the chat is: whether loading reached the greeting, why it stopped, and what you confirmed.

## What is not saved

- Other people's characters, other chats, other branches, swiped-away replies.
- Message dates and ids: the page does not show them. The chat id is saved only if you opened the chat from **History** (its address then has `?hist=`).
- Formatting marks: `*italics*` and `**bold**` are saved as the plain text you see.
- Pictures or voice messages inside the chat (the extension stops with an error instead of skipping them), voice settings, hidden settings, the character's picture from the site.
- Anything outside the page: the extension has no access to your account, cookies or the site's storage, and sends nothing anywhere.

## Privacy and permissions

| Permission | Why |
|---|---|
| `activeTab` | Read the open tab only after you click the extension icon. |
| `scripting` | Run the page reader in that tab. |
| `storage` | Keep the card and the chat in memory between popup openings (`chrome.storage.session`). It is cleared when you save, when you press Start over and when the browser closes. |

There are no host permissions, no content scripts that run by themselves, no background worker, no analytics and no remote code. The extension makes **no network requests**: the popup's Content Security Policy has `connect-src 'none'`, and the reader only reads the page and scrolls it. Older messages are loaded by the site's own page, as when you scroll by hand. The file is downloaded from a local Blob, so the `downloads` permission is not needed.

The saved file is plain, unencrypted JSON. Keep it like any private document.

## Install for testing (unpacked)

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension` folder.
4. Pin the extension to the toolbar.

There is no build step: the `extension` folder is exactly what Chrome runs. After you update the files, press **Reload** on the extension card and reload the site's tab.

## Limitations

- **The site's page layout.** The reader relies on how the chat page is built today. When the layout changes, it stops with "Can't read a message" or "Can't tell who wrote a message" instead of guessing, and the extension needs an update. The reader version is written into every file (`producer.reader_version`).
- **Start of the chat.** The page has no explicit "start" mark for long chats. The extension stops when the oldest message equals one of the character's greetings (`{{user}}` and `{{char}}` are accounted for), when the site shows its start-of-chat card, or when no older messages arrive twice in a row. A chat that starts with an AI-written greeting will not match; you confirm the start yourself.
- **Keep the tab open** while it loads. A background tab is throttled by the browser; the extension waits instead of giving up.
- **Size.** One file holds up to 5,000 messages and 5 MB; a single message up to 32 KB. If a chat is longer, the newest messages that fit are saved, the file is marked partial and the preview says how many older messages were left out. Text is never cut.
- **Ownership** is checked by what the page shows and confirmed by you. It is not a cryptographic proof.
- Not tested yet: chats of thousands of messages, Persona names, edited messages, mobile layouts.

## The file

See [`contracts/cai-export-v1.schema.json`](contracts/cai-export-v1.schema.json) and the examples in [`fixtures/golden`](fixtures/golden). In short:

- `character`: `source_character_id`, `name`, `tagline`, `description`, `greeting`, `alternate_greetings`, `definition`, `avatar` (`null` or a picture you chose, as base64).
- `chat.messages[]`: `index` (order), `role` (`user` or `assistant`), `text`; `source_message_id` and `source_created_at` are `null`.
- `chat.coverage`: `status` is `complete` only when you confirmed both the start and the end; `first_message_matches_greeting` is a hint, not a proof; `stopped_by` says why loading stopped.
- `warnings`: what is missing or unconfirmed, for example `CHAT_START_NOT_CONFIRMED`, `HISTORY_LIMIT_REACHED` or `SOURCE_TIMESTAMPS_UNAVAILABLE`.

Byte limits that JSON Schema cannot express (file size, UTF-8 bytes per message, image size) are checked by the extension and should be checked again by any importer.

## Development

```sh
npm ci
npx playwright install chromium
npm test
```

- `test/format.test.mjs`: the schema, the golden files and how the file is built (Node).
- `test/reader.test.mjs`: the page reader on fixture pages in headless Chromium: exact text, roles, order, scrolling, limits, ownership, unknown layouts.
- `test/golden.test.mjs`: fixture pages → file, compared with `fixtures/golden`. After an intended format change run `UPDATE_GOLDEN=1 npm test` and review the diff.
- `test/extension.test.mjs`: the real extension in headless Chromium, including the network log. `SHOTS=<folder> npm test` also saves screenshots of the popup and the log.

Fixture pages are served at `https://character.ai/...` only inside the test browser by request interception; tests never contact the real site. All fixtures use a made-up character with fake ids.

## License

Not chosen yet.
