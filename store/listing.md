# Chrome Web Store listing: Duetta Chat Export

Texts to paste into the Chrome Web Store Developer Dashboard.

## Store listing tab

**Name** (from `manifest.json`, 18 characters)

```
Duetta Chat Export
```

**Summary** (from the manifest's `description`, 108 of 132 characters)

```
Save a character you created and your chat with it to a file on your computer. Compatible with Character.AI.
```

**Description**

```
Duetta Chat Export saves a character you created on Character.AI, and your chat with it, to a file on your computer.

WHAT IT READS AND WHERE IT GOES
Only after you click the extension icon, and only in that tab, it reads the character card on your character's Edit page, the chat messages on your chat page, and the usernames shown on the page (to check that the character is yours; they are not saved). It uses them only to make the file you ask for: the file is saved to your computer, and nothing is sent to Duetta or anyone else. The first time you click it, the extension shows this and reads nothing until you press "Agree and continue". Privacy policy: https://github.com/Duetta-ai/character-ai-chat-export/blob/main/PRIVACY.md

HOW IT WORKS
1. Open your character's Edit page, click the extension icon and press "Add character card". It saves what the form shows: name, tagline, description, greetings and definition.
2. Open your chat with this character, click the icon and press "Save whole chat". The extension scrolls up to the first message while the site loads older ones. You see the count as it goes and can stop at any time.
3. Check the preview: how many messages there are, the first and the last one, and whether the chat is complete. Confirm that the character and the chat are yours and press "Save file".

The file is plain JSON in your Downloads folder: every message in order, who wrote it, and the text as shown, with line breaks and emoji. Its format is open and documented, made for importing into Duetta and readable by anyone.

PRIVATE BY DESIGN
• Runs only when you click it, and only in that tab.
• Asks first: the first time, it shows what it reads and waits for your OK.
• Sends nothing anywhere: no servers, no analytics, no tracking. It makes no network requests at all.
• Keeps the chat in memory only until the file is saved.
• Works only with characters you created: the page must show that you are the creator.

GOOD TO KNOW
• Only the reply you see is saved, not the variants you swiped away.
• Pictures, voice messages, message dates and formatting marks are not saved.
• One file holds up to 5,000 messages (5 MB). For a longer chat the newest messages are saved, and the file says how many older ones were left out.
• If the site changes its layout, the extension stops with a clear message instead of saving a wrong chat.

Open source (MIT): https://github.com/Duetta-ai/character-ai-chat-export

Duetta Chat Export is not affiliated with or endorsed by Character.AI. Character.AI is a trademark of its owner.
```

**Category:** Tools

**Language:** English

**Graphic assets**

| Field | File |
|---|---|
| Store icon, 128×128 | [`extension/icons/128.png`](../extension/icons/128.png) |
| Screenshots, 1280×800, in this order | [`screenshots/1-save-whole-chat.png`](screenshots/1-save-whole-chat.png), [`screenshots/2-check-before-saving.png`](screenshots/2-check-before-saving.png), [`screenshots/3-character-card.png`](screenshots/3-character-card.png), [`screenshots/4-stays-on-your-computer.png`](screenshots/4-stays-on-your-computer.png), [`screenshots/5-asks-before-reading.png`](screenshots/5-asks-before-reading.png) |
| Small promo tile, 440×280 | [`promo-tile-440x280.png`](promo-tile-440x280.png) |
| Marquee 1400×560, video | not needed |

The screenshots show the real extension on test pages with a made-up character, not the real site.

**Additional fields**

- Homepage URL: `https://github.com/Duetta-ai/character-ai-chat-export`
- Support URL: `https://github.com/Duetta-ai/character-ai-chat-export/issues`

## Privacy tab

**Single purpose**

```
Duetta Chat Export has one purpose: when the user clicks it, it saves a character the user created on Character.AI, and the user's chat with that character, from the open tab to a JSON file on the user's computer.
```

**Permission justification**

`activeTab`

```
The extension reads the open Character.AI tab only after the user clicks its icon: the character's edit form, or the user's chat with that character. activeTab gives this one-time access to that one tab, so the extension needs no host permissions and cannot read any other page or tab.
```

`scripting`

```
Used together with activeTab to run the extension's own page reader (reader.js, packaged with the extension) in the tab the user clicked. The reader reads the character card or the chat shown on the page and scrolls the chat up so that the site loads older messages. No code is fetched from the internet.
```

`storage`

```
chrome.storage.session keeps the character card and the chat in memory while the user goes between the character's Edit page and the chat and opens the popup again. It is cleared when the file is saved, when the user presses Start over and when the browser closes. chrome.storage.local keeps one flag: that the user agreed to the first-use notice. No user data is written to disk or synced.
```

**Are you using remote code?** No, I am not using remote code.

**Data usage**

Data that stays on the user's computer still has to be declared ([User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), question 3). Tick:

| Box | Why |
|---|---|
| Personally identifiable information | The reader compares the creator's username in the chat header with the signed-in account's username (the FAQ counts a username as personally identifiable). Not saved. A picture the user picks may show a person. |
| Personal communications | The chat messages. |
| Website content | The character card and the chat text read from the page. |

Leave the rest unticked: health, financial and payment, authentication, location, web history, user activity.

Tick all three certifications: "I do not sell user data to third parties…", "I do not use or transfer user data for purposes that are unrelated to my item's single purpose", "I do not use or transfer user data to determine creditworthiness or for lending purposes".

**Privacy policy URL** (required: the extension handles user data)

```
https://github.com/Duetta-ai/character-ai-chat-export/blob/main/PRIVACY.md
```

## Test instructions tab (optional)

The extension works only with a character the signed-in account created, so the reviewer needs one.

```
The extension works only on Character.AI and only with a character created by the signed-in account.
1. Sign in to https://character.ai (a free account is enough) and create any character with a name and a greeting.
2. Open the character's Edit page and click the extension icon. The first time, it shows what it reads: press "Agree and continue". Then press "Add character card".
3. Open the chat with this character, send one or two messages, click the extension icon and press "Save whole chat".
4. In the preview tick "This is a character I created, and this is my chat" and press "Save file". A JSON file is downloaded.
The extension makes no network requests; DevTools > Network on the popup shows none.
```
