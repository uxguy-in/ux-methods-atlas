# Integrating the UX Methods Atlas

This guide is for teams, such as UX Brighton, who want to run the atlas on their own site. Everything is in this
repository: the code, the data (1971 methods, 438 books) and the calculators.

## 1. Get the code

```bash
git clone https://github.com/uxguy-in/ux-methods-atlas.git
cd ux-methods-atlas
npm ci
```

Or use **Code → Download ZIP** on GitHub. You need Node.js 18.18 or newer to build it.

## 2. Pick how to host it

### Option A: a static folder on your own site (simplest)

```bash
npm run build:pages
```

This writes a self-contained `site/` folder: HTML, scripts, styles and the data in `site/data/`. Upload the
whole folder to any path on your web server, for example `https://uxbri.org/methods/`. It needs no server code,
no database and no rewrite rules: links are relative and pages use `#/` routes, so it works from any sub-folder.

### Option B: embed the hosted version

```html
<iframe src="https://uxguy-in.github.io/ux-methods-atlas/" title="UX Methods Atlas"
        style="width:100%;height:100vh;border:0"></iframe>
```

This is the quickest, but the atlas then updates when this repository updates, not when you choose.

### Option C: the Node server

```bash
npm run build
npm start          # http://localhost:8787, set PORT to change it
```

Run it behind your usual reverse proxy. Use this if you want to pay for the AI research direction on behalf of
your visitors (see below).

## 3. The AI research direction and API keys

The AI feature calls Claude. Who pays depends on how you host it:

| Hosting | Without a key on the server | With `ANTHROPIC_API_KEY` set on the server |
| --- | --- | --- |
| Static folder (A) or embed (B) | Each visitor pastes their own Anthropic API key. The browser calls Anthropic directly; the key never reaches your server. | Not applicable |
| Node server (C) | Each visitor pastes their own key. It is sent with that one request and never stored or logged. | Your key is used for everyone, and your account is billed. |

Visitors' keys are kept in their browser only: for the tab by default, or on the device if they tick
"Remember". They can remove it with "Forget my key". To set a server key, copy `.env.example` to `.env` and fill
in `ANTHROPIC_API_KEY`. Never commit `.env`; it is already in `.gitignore`.

Everything else (the finder's matches, the atlas, the library, the calculators) works with no key at all.

## 4. Make it match your site

- **Colours, fonts and corners:** the tokens at the top of `client/src/styles.css`. It already follows the
  uxbri.org look: red `#b8263e`, green `#5cc83b`, black navigation and square buttons.
- **The green announcement bar and the logo:** `client/src/components/Layout.jsx`.
- **Navigation links:** the `LINKS` list in the same file.
- **Fonts:** the Google Fonts link in `client/index.html`.

Rebuild after any change (`npm run build:pages` or `npm run build`).

## 5. Keep it up to date

- Pull the latest version with `git pull`, then rebuild.
- The data lives in `server/data/methods.json`, `books.json` and `meta.json`. Run `npm run check:data` after
  editing them.
- New methods from the community arrive as GitHub issues through the site's **Submit a method** page.

## Licence

- **Code:** MIT licence (`LICENSE`). Use, change and redistribute it freely; keep the copyright notice.
- **Method write-ups and data** in `server/data/`: CC BY 4.0 (`LICENSE-CONTENT.md`). Reuse and adapt them, with
  credit: "UX Methods Atlas by Vivek Gopinath, CC BY 4.0", linking back to this repository.
