# VECTOR: BLACKOUT — by VectorGamex

A top-down tactical shooter you play online with other people. Fog of war, four operator classes, bots to fill empty rooms, team + proximity voice chat, mobile controls, and a PIN-protected developer console where you change the balance, edit maps, upload music and moderate players, all live.

## Run it on your computer
```
npm install
npm start
```
Open http://localhost:3000 — open it in a second tab/browser to play against yourself. Developer console: http://localhost:3000/dev

## Put it online (this is a Node server — it can NOT run on Netlify or any static host)
Pick one. All three give you HTTPS, which browsers require for the microphone.

**Render (easiest):** push this folder to a GitHub repo → Render dashboard → New → *Blueprint* (it reads `render.yaml`) or New → Web Service (build `npm install`, start `node server.js`). Set the env var **DEV_PIN**. Attach a disk mounted at `/data` and set `DATA_DIR=/data` so your edits and uploaded music survive restarts (disks need a paid instance; on the free tier edits reset on every deploy/restart).
**Railway:** New project from the repo, add a Volume mounted at `/data`, set `DATA_DIR=/data` and `DEV_PIN`.
**Fly.io / any VPS:** `docker build -t vb . && docker run -p 3000:3000 -e DEV_PIN=yourpin -v vbdata:/data vb`

Environment variables: `PORT` (host sets it), `DEV_PIN` (default `8881`, **change it**), `DATA_DIR` (config, bans, music), `TURN_URL` / `TURN_USER` / `TURN_PASS` (optional), `TRUST_PROXY=0` only if you are not behind a proxy.

## Playing
WASD move · mouse aim/fire · Space ability · R reload · Tab scoreboard · V push-to-talk · Enter chat (`/t message` = team only) · Esc menu. On phones: left stick moves, right stick aims and fires.
Quick Play drops you in a public room (bots fill empty slots). Private Room gives a 4-letter code to send to friends. Mic button joins voice: teammates are always audible, enemies only when close.

## Developer console (`/dev`, PIN 8881 by default)
* **Live** – rooms and players, kick / ban IP, restart a match on any map, broadcast a message, set a menu banner, lock the server.
* **Balance** – every weapon, class, game mode and match setting. Clone or add new weapons, classes and modes.
* **Maps** – paint tiles (mirror mode keeps maps fair), generate random maps, reorder the rotation.
* **Branding** – title, tagline, message of the day, colours, team names, how-to-play text.
* **Music** – upload mp3/ogg/wav tracks (menu, in-match, or both) or keep the built-in generative soundtrack.
* **Raw JSON** – the full config for anything else.
Press **Apply & Publish Live** and connected players update immediately. The PIN is checked on the server (rate-limited, 5 tries then a 5-minute lock), never in the page.

## Honest limits
* Needs a Node host that stays awake. Free tiers sleep when idle, so the first visit can take ~30–60 s.
* Voice is peer-to-peer (WebRTC). Most connections work with the built-in STUN servers; some strict networks need a TURN server (set `TURN_*`). Mesh voice is meant for rooms of ~12.
* Hit detection is server-side without lag compensation: on very high ping you must lead shots slightly.
* No accounts or saved stats yet. Add your own music only if you have the rights.
