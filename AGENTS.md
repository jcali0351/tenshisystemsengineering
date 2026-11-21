# AGENTS.md: briefing for AI agents working on Tenshi Systems (tenshisystems.com)

Read this first. It sums up how the site, games, CMS and server fit together, the routines that keep the live site
safe, and what the owner likes and dislikes. Hermes Agent, Claude Code and any other agent should follow it.
(Written from a month of work with the owner, November 2026. Keep it up to date when you change how things work.)

## The owner and how to work with them
- Small-business web studio owner (Tenshi Systems Engineering). Not a programmer: plain English, short steps, screenshots
  welcome. Wants results shipped, not menus of options.
- **Every website change goes live on tenshisystems.com** (see "Deploying"). Never stop at "pushed to GitHub".
- Likes: a neon, gamified look (purple / pink / violet); big, bold, playful; real 3D characters; "max detail".
- Dislikes (learned the hard way, don't repeat):
  - Heavy lighting/GPU effects in Station Defense (a three.js renderer and metal/textures/shadows were added, then
    **removed at the owner's request**). Keep games light and fast.
  - Extra UI they didn't ask for (a "Coming soon" tag on the Portfolio menu item got a strong "remove that").
  - Copies of other people's IP. Games and models must be original (inspired-by is fine). A Star Trek fan model was
    refused for commercial use; licences of downloaded assets must allow commercial use.
- Never print or store secrets: the CMS admin password lives only on the server; GitHub keys stay in the browser;
  the owner's email address stays out of files and requests.

## Repository
- GitHub `jcali0351/tenshisystemsengineering`, working branch **`tenshi-cms`** (that's what the server runs). `main` is an
  old GitHub Pages copy; keeping it in sync is optional.
- Local path on the owner's PC: `C:\Users\jcali\OneDrive\Documentos\GitHub\tenshisystemsengineering` (it's in OneDrive:
  expect occasional file locks, see Pitfalls).

| Path | What |
|---|---|
| `index.html` | Homepage. Its `<header>` is the source of the menu for every page. |
| `*.html`, `services/`, `projects/`, `blog/` | Pages **generated** by `tools/build-pages.mjs` (don't hand-edit their bodies). |
| `translations.js` | All site text in 10 languages (en, ja, ko, de, es, zh, ar, pl, pcm, fa). |
| `styles.css`, `design.css`, `custom.css`, `site-theme.css` | Base styles. |
| `sandbox/neon-theme.css`, `sandbox/neon-pages.css`, `sandbox/neon-recolor.css` | The neon look (homepage / other pages). Rules use `html.neon:not(#_):not(#__)` to win specificity fights. |
| `tools/neon-pages.mjs` | Puts the neon look + quest script on every page (called by build-pages). |
| `admin.html`, `admin/` | The **Tenshi Editor** (the site's CMS, see below). |
| `platform/` | A separate product: the Tenshi CMS for **client** websites (FastAPI). Runs at cms.tenshisystems.com. |
| `game_settings.py` | Every game's tunable values in Python (comments become help text in Game Studio). |
| `sandbox/game-settings.js` | Generated from game_settings.py + `data/games.json`; what the games read. |
| `data/games.json`, `data/games-schema.json` | Game Studio edits (only changed values) / the form description. |
| `models/` | 3D models: `models.json` (slot → file), `source/` (built-in models as .glb), `uploads/` (Game Studio uploads), `README.md`. |
| `sandbox/art/` | Cover art and pre-rendered character sprite sheets. |
| `tools/export-models.mjs` | Rebuilds all built-in characters as editable .glb files in `models/source/`. |
| `tools/render-sprite.py`, `tools/render-sprite-anim.py` | Blender scripts: pre-render a detailed (Meshy) model into game sprites. |
| `tools/server/` | Server setup script, README (layout, commands), contact form service. |
| `docs/ROADMAP.md` | Post-launch to-do list. |

## The games (all vanilla JS canvas, on the homepage)
Each game reads its settings from `window.TENSHI_GAMES` (sandbox/game-settings.js) and merges them over built-in values.
1. **Hero arcade** (`sandbox/neon-game.js`): click-to-shoot in the header; targets, 6 weapons, bosses, a giant robot and
   a kaiju that smash the neon city (`neon-bg.js`), shootable headline letters. Endless; ends only when you scroll away.
2. **Sky beasts** (`sandbox/neon-beasts.js`): particle dragon and phoenix, shootable.
3. **Station Defense** (`sandbox/neon-rts.js`): space RTS in a full-window "takeover". Miners mine crystals and build
   turrets, depots, outposts (anywhere explored: new crystal fields) and shipyards; waves from an alien hive; zoom
   (wheel/keys/buttons/pinch). Ships are hand-built 3D meshes drawn on a 2D canvas (flat shading, soft shadow patches).
   Cover art `sandbox/art/station-defense.webp` shows for 5 s, then fades to the live game behind a centred Play button.
4. **Undercity** (`sandbox/neon-arpg.js`): isometric dungeon crawler (2:1 projection, TW 64 / TH 32). Hero = the owner's
   Meshy "Female Angel Hero", **pre-rendered** with its Walking / Running / Attack animations from 8 directions
   (`sandbox/art/hero-angel-*.webp`, `HERO_ANIMS`, made with `tools/render-hero-anims.py`); the first enemy (Hollow)
   = the owner's animated "Corrupted Astral Sorcerer", 8 directions × 8 frames, plays a leap-back when hit
   (`sandbox/art/hollow-sorcerer.webp`, `MONSTER_SPRITES`); the Golem (from floor 1, `golemFromFloor`) = the owner's animated "Low Poly Green
   Elemental", raises its guard when hit (`sandbox/art/golem-elemental.webp`); the Skitter = the owner's textured lava
   spider (uploaded in Game Studio; it had no animations, so `tools/spider-walk.py` gives it an 8-leg walk in Blender,
   rendered from 8 directions into `sandbox/art/spider/walk.webp`, entry in `MONSTER_ANIMS`). The Evil Wizard (common, every floor) uses all 13 of its Mixamo
   animations (`MONSTER_ANIMS`, sheets in `sandbox/art/wizard/`, loaded when needed): walk/run/heavy-walk chasing, Charged Slash
   attacks, Call Gesture on spotting you, crouch moves when slowed or between swings, dances/burpees/catching breath as idles. The Evil Green Elf (common, every floor) has only a walk
   (`sandbox/art/elf/walk.webp`; converted from FBX with `tools/fbx-to-glb.py`): stands on frame 0, lunges to attack.
   Hero has **Holy Power** (gold bar above the HUD, `HOLY` settings, saved): fills per hit/kill; at 100% a POWER OF GOD button pops
   up (or E) that slays every enemy in sight (`powerOfGod`, `seenMonsters`, beams + flash in `drawGod`). Other monsters are 3D meshes from `models/source/arpg.*.glb`
   drawn with simple 2D lighting. Walls and floor use procedural stone canvas textures (`STONE` in neon-arpg.js,
   mapped onto the isometric faces with `pattern.setTransform`). Cover art `sandbox/art/undercity.webp`, same 5 s fade.
5. **Quest** (`sandbox/neon-quest.js`): XP for exploring the site, on every page.
Hero headline effects: `sandbox/neon-fx.js` (flashing messages, particles). Shared 3D model loader:
`sandbox/tenshi-models.js` (reads models.json, parses .glb incl. textures, simplifies above 2,400 triangles).

## The Tenshi Editor (admin.html): how the owner edits the site
- Static page; the owner signs in with a GitHub key; every save is **one commit to `tenshi-cms`** made through the GitHub
  API (`commit()` in admin/admin.js). Commit messages start with `CMS:`.
- Tabs: Pages (click text to edit), All text, Images, Slogan, Parallax, Design, Buttons, Share, Image effects,
  Custom CSS, Content bots (news scraper, blog writer as GitHub Actions), **Game Studio** (`admin/games.js`):
  - 3D models: every slot (26) with a model-viewer preview, Upload .glb (checked: glTF binary, no Draco/meshopt,
    ≤ 25 MB) and Revert. Uploading the Undercity hero, Hollow, Golem or Skitter switches its sprite off (`heroSprite`, `hollowSprite`,
    `golemSprite`, `skitterSprite`). Uploaded meshes are drawn flat-shaded with one colour per face (textures get averaged)
    and at the monster's game size, so a detailed textured model can look "unchanged"; for those, pre-render a sprite.
  - New enemies (Undercity): add enemy types with their own .glb (slot `arpg.custom.<id>` in models.json) and stats
    (`arpg.custom` list in data/games.json: name, hp, dmg, speed, reach, every, xp, weight, fromFloor, size, ranged, color,
    enabled). neon-arpg.js turns each into MONSTERS["custom.<id>"], drawn with its mesh (or a coloured figure).
  - Game settings: form generated from data/games-schema.json; saves data/games.json + sandbox/game-settings.js and
    bumps the `game-settings.js?v=` tag on the homepage.
- After editor commits, the GitHub Action **`.github/workflows/cms-rebuild.yml`** ("tenshi-editor-bot") runs
  `npm run build` and commits "Rebuild pages and asset stamps after a site edit". Expect it to race your pushes.

## Building pages
- `node tools/build-pages.mjs` regenerates all pages from index.html's header + translations, then runs
  tools/neon-pages.mjs (neon look, stamps), the search index and sitemap.
- Homepage/neon-home scripts under `sandbox/` use hand-set cache tags (`?v=20261124x`): bump them when you change
  those files (both `index.html` and `sandbox/neon-home.html`).

## Deploying (every change)
1. Commit to `tenshi-cms` and push.
2. Run the deploy now (otherwise a cron does it within 5 minutes):
   `ssh -i ~/.ssh/tenshi_vps -o BatchMode=yes root@<server> /usr/local/bin/tenshi-deploy`
   (server address and layout: `tools/server/README.md`).
3. Verify on https://tenshisystems.com with curl (the new file version is served) and, for visual changes, in a browser.
Server facts: Hostinger KVM 2 VPS, Ubuntu 24.04, Caddy (HTML sent with `Cache-Control: no-cache`; private paths like
`/platform*`, `/tools*`, `/docs*`, `*.md`, `*.py` answer 404), CMS service `tenshi-cms`, contact form service
`tenshi-contact` (`/api/contact`), nightly backups, DNS managed through the Hostinger connector.

## Pitfalls that already bit us (check every time)
- **Half-built pages**: OneDrive can lock a file mid-build; build-pages then leaves pages without the neon theme and
  they ship as the old white site. Re-run until it exits cleanly, then check
  `grep -L neon-theme.css` over the site pages lists only `brand/index.html` and `portraits/index.html`.
- **Merge markers**: never `git add -u` after a conflicted `git stash pop`. Check `git grep -l -E '^(<<<<<<<|>>>>>>>)'`
  is empty before every commit. If the bot rebuilt meanwhile, reset generated pages to origin and rebuild.
- Pull before pushing (`git fetch`, fast-forward); the bot commits often.
- Windows: long paths break zip extraction (extract with short names); Python `-I` hides user packages (PIL).
- Blender 5.3 is installed (`C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`); run it headless with
  `--background --factory-startup --python <script> -- <args>`.

## 3D model pipeline (owner makes models in Meshy / Blender)
- Light models (≤ ~50k triangles, .glb, no compression): upload in Game Studio, or put in `models/` and set the slot in
  `models/models.json`. Front faces Blender −Y, feet on the ground.
- Heavy or animated models (e.g. 4.9M-triangle Meshy sculpts, Mixamo FBX): pre-render with
  `tools/render-sprite.py` (static, 16 directions) or `tools/render-sprite-anim.py` (animated, 8 × 8), pack into a sheet
  in `sandbox/art/`, and add/adjust the entry in neon-arpg.js (`HERO_SPRITE` / `MONSTER_SPRITES`). Check facing on a
  contact sheet (the camera looks from map direction +x,+y; frame for map angle 45° should show the front).

## Other notes
- Menu: Portfolio is deliberately not clickable for now (`.nav-soon`, no tag); restore when the portfolio is ready.
- Hero pink "selection boxes" were browser text selection; the hero is unselectable on purpose.
- Technology page group headers use the transparent icons from `img/services/icons/`.
