# Budget

A personal budget tracker for your phone. It runs in the browser and can be installed to your home screen. It also works offline. There's no login and no tracking, and **all your data stays on your device**.

Built with plain HTML, CSS and JavaScript. There's no framework and no build step.

---

## Run it on your computer

You need [Node.js](https://nodejs.org) (version 18 or newer).

1. Open a terminal in this folder.
2. Install the dev tools (one time only):
   ```bash
   npm install
   ```
3. Start the app:
   ```bash
   npm start
   ```
4. Open **http://127.0.0.1:3000** in your browser.

The server only listens on your own computer (127.0.0.1). Nobody else on your network can reach it.

To see it the way it looks on a phone, open your browser's developer tools and switch on the device toolbar (in Chrome, press `Ctrl+Shift+M`).

### Run the tests

```bash
npm run setup
```
(one time only: this downloads a test browser into `node_modules`)

```bash
npm test
```

To save a screenshot of every screen in light and dark mode to `screenshots/`:

```bash
npm run screenshots
```

---

## Put it on your phone (recommended: Vercel)

Offline mode and "Add to Home Screen" only work over **https**. The easiest way to get an https address is to put the app on Vercel's free hosting. Only the app files are uploaded; your data never is. It stays in your phone's browser.

### Option A: from this folder

1. Run:
   ```bash
   npx vercel
   ```
2. The first time, it asks you to log in or sign up (your email or GitHub works). Accept the suggested answers to its questions.
3. When it finishes, it prints a link like `https://budget-xxxx.vercel.app`. To publish to your main address, run:
   ```bash
   npx vercel --prod
   ```

### Option B: from GitHub

1. Push this folder to a GitHub repository.
2. Go to **vercel.com/new**, pick the repository and press **Deploy**. You don't need to change any settings.

### Then, on your phone

1. Open the Vercel link.
2. Install it:
   - **iPhone (Safari):** tap the Share button, then **Add to Home Screen**.
   - **Android (Chrome):** tap the ⋮ menu, then **Install app** (or **Add to Home screen**).
3. Open it from the home screen icon. From now on it works without internet.

When you deploy a new version, open the app once while online. It picks up the update in the background and shows it the next time you open the app.

---

## Quick check over Wi-Fi (home Wi-Fi only)

You can open the app on your phone straight from your computer, without Vercel. **Do this only on your own home Wi-Fi, never on public or shared Wi-Fi** (cafés, offices, hotels), because it makes the app visible to everyone on that network.

1. On your computer run:
   ```bash
   npm run start:lan
   ```
2. Find your computer's local IP address. On Windows, run `ipconfig` and look for "IPv4 Address", something like `192.168.1.23`.
3. On your phone (same Wi-Fi), open `http://192.168.1.23:3000`.
4. Stop the server with `Ctrl+C` when you're done.

Over plain `http` like this, offline mode and installing don't work, and the data you enter is separate from the Vercel version.

---

## Your data

- Everything is saved in your browser's local storage on this device. Different browsers and devices don't share data.
- **Back up regularly:** Settings → **Export CSV**. Settings reminds you if you haven't exported in 30 days.
- To move data to another device, export a CSV there and import it here (Settings → **Import CSV**). Rows that are already in your data (same `id`) are skipped. Every bad row is listed with its line number and the reason.
- CSV columns: `id,date,type,category,amount,note`. Dates are `YYYY-MM-DD`, type is `income` or `expense`, and amount is a positive number like `1250.50`. Leave `id` empty to add a row as new. Files over 1 MB are refused.
- Cells that start with `=`, `+`, `-` or `@` are saved with a leading `'` so spreadsheet apps don't run them as formulas. The app removes it again on import.
- On first launch the app adds about 30 **sample** transactions so you can see how it works. Remove them in Settings → **Clear sample data**.
- **Reset all data** in Settings wipes everything on this device. You have to type `RESET` to confirm.

---

## Project layout

| Path | What it is |
|---|---|
| `index.html` | App shell: screens, tab bar, sheets, dialogs |
| `styles.css` | Design tokens (colors, radii, spacing) and all styles, light and dark |
| `js/app.js` | Starts the app, renders each screen, wires up events |
| `js/state.js` | Data model (schema version 1), sample data, totals, CSV import/export |
| `js/storage.js` | Safe localStorage access with an in-memory fallback |
| `js/format.js` | Money (stored as integer cents), dates, CSV parsing |
| `js/chart.js` | The SVG bar chart |
| `js/ui.js` | Small UI helpers: icons, dialogs, toast, swipe rows |
| `sw.js` | Service worker that makes the app work offline |
| `manifest.webmanifest`, `icons/` | Install info and app icons (`npm run icons` regenerates the icons) |
| `vercel.json`, `.vercelignore` | Hosting headers; keeps dev files out of the upload |
| `tests/` | Playwright tests (phone size 390×844) |

Dev tools (`serve` and `@playwright/test`) are pinned to exact versions in `package.json`. `compression` is overridden to 1.8.2 so `npm audit` comes back clean.
