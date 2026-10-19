# Put the Converter App online free with Vercel (Egypt-friendly)

Netlify is unreliable from Egypt (its sites are blocked at ISP level for many
Egyptian users and only open through a VPN), so we host on **Vercel** instead.
Vercel's free "Hobby" plan is enough — this is a personal, non-commercial app.
The project already contains a `vercel.json` with the right build settings
and service-worker headers, so Vercel should need almost no configuration.

You end up with a link like `https://converter-app-xxxx.vercel.app` — that is
the link you open on phones/desktops to install the app, and the link you can
send to family and friends.

## Route A — GitHub import (recommended, ~5 minutes)

1. **Put the project on GitHub.**
   Unzip `converter-app-project.zip`. Create a new repository on github.com
   (public or private — both work) named e.g. `converter-app`, and push the
   unzipped project folder to it (or use GitHub Desktop's "Publish repository").
2. **Import it into Vercel.**
   Go to https://vercel.com, sign in with GitHub, click **Add New → Project**,
   and import the `converter-app` repository.
3. **Check the settings** (they should auto-fill — the `vercel.json` in the
   project sets them):
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
4. Click **Deploy**. In about a minute you get your live
   `*.vercel.app` link.
5. **Updates are automatic:** whenever the project changes, push to GitHub and
   Vercel redeploys the same link. (When Jinx ships a new version of the app,
   you just replace the project files and push.)

## Route B — Vercel CLI from your PC (no GitHub needed)

1. Install Node.js from https://nodejs.org (LTS).
2. Unzip `converter-app-project.zip`, open a terminal in that folder.
3. Run: `npx vercel --prod`
4. Log in (it opens the browser once), accept the defaults (it reads
   `vercel.json`), and it prints your live link.

## Install it as an app (after you have the link)

- **Android (Chrome):** open the link → ⋮ menu → **Install app** /
  "Add to Home screen" → Install. You get an icon that opens full-screen,
  like a native app.
- **iPhone (Safari):** open the link → **Share** → **Add to Home Screen**.
- **Windows (Edge/Chrome):** open the link → install icon in the address bar
  (or ⋯ → Apps → Install this site as an app).

First time you use it on a device, keep Wi-Fi on and run one small test
conversion of each type once — that caches all the conversion engines on the
device. After that it works offline (video/audio additionally downloads its
FFmpeg engine, ~31 MB, the first time a media conversion runs). Your files
are never uploaded — conversions always happen on the device itself.
