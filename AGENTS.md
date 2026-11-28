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
   up (or E) that slays every enemy in sight (`powerOfGod`, `seenMonsters`, beams + flash in `drawGod`). **Holy Gospel** (blue bar,
   `GOSPEL`): fills when hurt, per kill, per new floor; at 100% ARCHANGEL (R) summons Gabriel for 10 s: blocks all damage, strikes
   the nearest enemy in sight with a lance of light (`archangel`, `updateAngel`, `drawAngel`).
   The hero shows her name and level (`drawHeroLabel`, labels.heroName, default "Tenshi"). Every enemy shows its name and a health bar (`drawLabel`, `LABELS` = Game Studio > Undercity > labels); built-in enemy names
   are editable too (`monsters.<type>.name`; game_settings.py accepts any short text for keys called `name`). Other monsters are 3D meshes from `models/source/arpg.*.glb`
   drawn with simple 2D lighting. Theme: an angel (Tenshi) in Hell, after Dante's Inferno, KJV verses: floors are the circles
   (`CIRCLES`, `circleOf`), Wardens guard every 3rd, Satan waits on `hell.finalFloor` (9 = Cocytus, ice textures); beating him
   opens the gate of light → `transcend()` (ascend again with the same hero, Hell 50% tougher each time). Gear = Christian
   artifacts (`BASES`, `AFFIXES`, `LEGENDARY`); Houses (keys 3/4/5, `HOUSES`, level unlock + cooldown): Abraham = Covenant of
   Stars (starlight on all in sight, extra gold), Isaac = Jehovah-Jireh (full heal, a ram takes a deadly blow), Jacob = Jacob's
   Ladder (12 tribe spirits fight 15 s, double damage); potions are holy water and manna. Embers, lava pools and verses: `HELL`.
   Walls and floor use procedural stone canvas textures (`STONE` in neon-arpg.js,
   mapped onto the isometric faces with `pattern.setTransform`). Cover art `sandbox/art/undercity.webp`, same 5 s fade.
   **Inventory**: a bag of `inventory.slots` (50) relics in the character sheet (C or I): `hero.bag` (saved), `bagHtml`, `bagAction`; better finds auto-equip and the old piece goes in the bag; full bag = sold.
   **Gamemaster panel** (hidden): Ctrl + Shift + G, or type g then m, while Undercity is on screen (or open the page with `?gm`): jump to any circle, face/slay the boss, god mode, +5 levels, heal, fill Holy/Gospel, gold, drop a relic (`gmToggle`, `gmDo`). Boss intro: `drawBossIntro`, `hell.bossIntro`.
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

## Leaderboards
- `leaderboard-arcade.html`, `leaderboard-station-defense.html`, `leaderboard-undercity.html` are built by build-pages.mjs
  (BOARDS) and filled live by `leaderboard.js` / `leaderboard.css` from `/api/scores`.
- Server: `tools/server/scores_service.py` (systemd `tenshi-scores`, 127.0.0.1:9126, SQLite
  `/srv/tenshi/data/scores/scores.db`). It works out each score from the run's stats (formulas in GAMES); keep the
  "How to get on the board" text in build-pages.mjs in step with them.
- The games post through `sandbox/neon-scores.js` (TenshiScores.post / .panel): arcade on Save initials, Station Defense
  in end(), Undercity in die() / transcend() (hero.playMs and hero.kills are saved with the hero). Each game links to
  its board with a root-relative `/leaderboard-*.html` link.

## Games menu
- The header's Games dropdown (in index.html, copied to every page) replaced Portfolio: games.html (hub) and a page per
  game, game-arcade.html, game-station-defense.html, game-undercity.html (build-pages.mjs, "the Games menu";
  styles games.css), then the three leaderboards. The game pages load the same sandbox scripts as the homepage with
  `defer` (they must run after game-settings.js, which neon-pages.mjs adds last); bump `V` there when those scripts
  change. Station Defense / Undercity find their section by the hidden titles #parallax-px1-title / #parallax-px2-title.

## Building pages
- `node tools/build-pages.mjs` regenerates all pages from index.html's header + translations, then runs
  tools/neon-pages.mjs (neon look, stamps), the search index and sitemap.
- Homepage/neon-home scripts under `sandbox/` use hand-set cache tags (`?v=20261124x`): bump them when you change
  those files (`index.html`, `sandbox/neon-home.html`, and `sandbox/undercity.html`, the shareable game-only page).

## Deploying (every change)
1. Commit to `tenshi-cms` and push.
2. Run the deploy now (otherwise a cron does it within 5 minutes):
   `ssh -i ~/.ssh/tenshi_vps -o BatchMode=yes root@<server> /usr/local/bin/tenshi-deploy`
   (server address and layout: `tools/server/README.md`).
3. Verify on https://tenshisystems.com with curl (the new file version is served) and, for visual changes, in a browser.
Server facts: Hostinger KVM 2 VPS, Ubuntu 24.04, Caddy (HTML sent with `Cache-Control: no-cache`; private paths like
`/platform*`, `/tools*`, `/docs*`, `*.md`, `*.py` answer 404), CMS service `tenshi-cms`, contact form service
`tenshi-contact` (`/api/contact`), nightly backups, DNS managed through the Hostinger connector.

## Page weight (audit fixes, 2026-11-25)
- **Languages**: pages load only `i18n/en.js`; `app.js` fetches `i18n/<code>.js` when another language is picked.
  `i18n/` is generated from `translations.js` by `tools/split-translations.mjs` (run by `stamp-assets.mjs`, so by
  `npm run build` and the rebuild Action). Keep editing `translations.js`; never edit `i18n/` by hand. The Editor
  still reads and writes `translations.js`.
- **Homepage games**: Station Defense and Undercity scripts are loaded by `sandbox/game-loader.js` when their strip nears
  the screen (versions on its `data-px1` / `data-px2` attributes in index.html). 3D models download only on PLAY:
  each game calls `TenshiModels.need("rts." | "arpg." | "arcade.")`; `tenshi-models.js` no longer loads anything by itself.
- **Big .glb uploads**: shrink them before use (base colour texture only, 512 px JPEG; see
  `models/uploads/originals/README.md`). The site's parser reads no normal maps, skins or animations.
- **Caching** (once `tools/server/caddy-update.sh` is applied): anything linked with `?v=` is cached for a year, so a
  changed file MUST get a new `?v=` tag (hash stamps do it automatically; hand-set tags in index.html must be bumped).

## Shop demo (Shopify)
- `shop.html` (Services > Shop demo, also in the footer) shows clients we can host a Shopify store: hero, product grid,
  quick view, cart drawer, "Tenshi can host your Shopify store" pitch. Code `shop.js` / `shop.css`; data
  `data/shop-demo.json`; switch `data/shop-config.json` (`"mode": "demo"` or `"live"`). Full guide: `docs/SHOP.md`.
- Demo mode: sample products, cart in the browser, checkout shows "Demo store: checkout is disabled".
- Live mode: products from the Storefront API of `storeDomain`, Checkout = Cart API `cartCreate` -> Shopify's
  `checkoutUrl`. Only the PUBLIC Storefront token (Headless channel) may go in shop-config.json; never an Admin API
  token or the Headless private token.

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

## Media menu and World Pulse (2026-11-26)
- The header's **Media** dropdown replaced Games: Games (games.html), Visualization (visualization.html), Portfolio.
  media.html is the hub. Game and leaderboard pages mark Games + Media as current (`navParent` in build-pages.mjs).
- **World Pulse** (`viz/world-pulse.html` + `viz/world-pulse.js`, embedded on visualization.html with `?embed=1`):
  a plain WebGL2 globe (no three.js), fine 1-2 px particles only. `viz/` is not touched by build-pages or neon-pages.
  Bump the `world-pulse.js?v=` tag in the html when the script changes.
- Data: `tools/globe-data.mjs` -> `data/globe/world.json` (weekly: Natural Earth, OurAirports, OpenFlights,
  OpenStreetMap via Overpass, World Bank) and `tools/globe-markets.mjs` -> `data/globe/markets.json` (every 30 min on
  weekdays), both run by `.github/workflows/globe-data.yml` ("tenshi-globe-bot"). Live in the browser: aircraft
  (adsb.lol), ships / trains / road counters (Fintraffic digitraffic.fi, Finland and the Baltic only).
- Around the globe (2026-11-27): each layer row carries a freshness word (`WORD`: Live / Part live / Delayed / Static /
  Modelled; "part" = worldwide static map + live data for one region) and the panel opens with a colour key (`KEY`);
  tap or click selects a point (`pickAt`, `select`, a ring `#sel` follows it; on touch the details show as a bottom
  card); one rotating headline figure under the clock (`HEAD`); a guided tour (`tourSteps`, button in the title box,
  `world-pulse.html?tour` starts it) that flies to what is happening now using figures the feeds leave in `S`;
  `watchPerf` lowers the render scale `Q` when the page runs under ~40 fps; feeds stop polling while their layer is off.
  Aircraft: `HUBS` (63 named points) are swept in turn, so the count is a sample. Live ships stay Baltic-only: no
  worldwide ship feed fits the rules below (the open ones need a key or a relay).
- More (2026-11-27, later): **Above me** (`aboveMe`, `renderMe`: satellites above the visitor's horizon, nearby aircraft,
  the next space-station pass via `issPass`, local temperature and wind; falls back to the centre of the view when
  location is refused; only a position rounded to 0.1° goes to adsb.lol). **Share** (`shareUrl`: `?at=lon,lat,dist`,
  `&off=` / `&on=` layer ids; read at start-up). **Replay** (`startReplay`, `updateReplay`: day/night, earthquakes from
  `S.quakeList` via `buildQuakes(until)`, satellites run on their orbits; live-only layers are hidden meanwhile).
  **Tour**: each stop can ring its subject (`mark`), the embedded preview tours by itself on a loop, and the last stop
  carries the "Talk to us" link to contact.html. **Markets**: `HOURS` + `isOpen` light the exchanges trading now
  (regular hours, no holidays). Everything along the bottom stacks in `#dock`.
- Weather layers: **clouds** (`pollClouds`: yesterday's NASA GIBS true-colour picture, bright colourless pixels = cloud;
  starts off; could not be checked against real imagery from the build sandbox, so look at it before turning it on by
  default), **wind & jet stream** and **temperature** (`buildWeather` from `data/globe/weather.json`, written by
  `tools/globe-weather.mjs` from NOAA GFS 1° GRIB2 files read with ecCodes `grib_get_data` on the Action runner;
  temperature starts off). A layer with `off: true` in `LAYERS` starts switched off.
- **Military bases** layer (`mil`): `bases` in world.json, from OpenStreetMap `military=base|airfield|naval_base|barracks|
  range|training_area` (tools/globe-data.mjs, one entry per 0.05° cell); labelled as mapped sites, not a complete list.
- **The sea** (`buildOcean` from `data/globe/ocean.json`, written by `tools/globe-ocean.mjs`, four parts that fail
  independently): **Ocean currents** (`cur`, NOAA CoastWatch geostrophic currents through ERDDAP), **Waves & surf**
  (`surf`: NOAA GFS-Wave swell lines, NDBC wave buoys, and `BREAKS`, a hand-kept list of surf breaks whose "surf report"
  is the model swell beside the break plus the wind; the **Surf report** button in the bottom bar lists them, biggest
  swell first, in the same board the markets use, `boardMode`), **Tides** (`tide`: NOAA CO-OPS high/low predictions,
  US stations only; `tideNow` works out the level between them). `streamlines()` draws wind, jet, currents and swell.
- **The sky**: real stars and the 88 constellations (`buildSky` from `data/globe/sky.json`, made once by hand with
  `tools/globe-sky.py` from d3-celestial, BSD; the sky is drawn with `SKYM`, the camera's turn without its position,
  turned by sidereal time). **The Moon** (`moonAt`: position and phase from formulas; `buildMoon` hangs the LRO camera mosaic from
  `data/globe/moon.json`, fetched once by `tools/globe-moon.py` in the Action (NASA's SVS server answers 403 to the
  runners, so it comes from the USGS planetary map server; no height shading for the same reason); drawn `MOON_R` wide at `MOON_D` away,
  about 15x too big and close, and the page says so; `MOONMARKS` label its seas and craters when it is large on screen;
  a ring marks the spot on Earth under it).
- **Mars** (the owner chose: inside World Pulse): the Mars button (`setPlanet`, `?planet=mars`) swaps the globe. `buildMars` reads
  `data/globe/mars.jpg` (tools/globe-mars.py, USGS map server: Viking mosaic x MOLA shaded relief, fetched once in the
  Action); `marsNow` gives sun position, clock, sol, season (Mars24) and the Earth-Mars distance; `MARSMARKS` are the
  labelled landforms and landing sites; `marsTour` is its tour; `HEADM` its headline figures. While Mars is up the
  Earth's panels are hidden by `body.mars` and its layers are skipped in `tick`; nothing is switched off.
- 2026-11-28: **Mars and the Moon are textured spheres** (`P_BODY`, `drawSphere`, `loadInto`): 4096 x 2048 maps
  (`data/globe/mars-4k.jpg`, `moon-4k.jpg`, `moon-1k.jpg`, tools/globe-bodies.py), a ray cast per pixel so they stay
  sharp when zoomed; the particle Mars is gone. The **Moon is a third world** (`BODIES`, `LUNA`, `LUNAMARKS`,
  `moonTour`, `HEADL`; `?planet=moon`), with the Earth as a small globe in its sky. `setPlanet` takes earth/moon/mars.
- **All stars**: `data/globe/stars.bin` (tools/globe-stars.py): the rest of Hipparcos (109k stars) and Milky Way points,
  drawn by `buildFaint` after the bright sky. **Clouds** now come from `data/globe/clouds.png` (tools/globe-clouds.py in
  the Action; the browser-side read failed because the SNPP satellite layer returns an empty picture).
- **Aircraft**: adsb.lol sends no cross-origin header, so the page never could read it. `pollPlanes` still tries, then
  switches to `pollSnapshot`: `planes.json` on the `globe-live` branch, written every 5 minutes by
  `.github/workflows/globe-live.yml` (tools/globe-planes.mjs). **Both globe workflows must be on `main`** (the default
  branch) for their schedules to run; until the owner allows that, they run only when a tool file is pushed.
- Owner's rules for it: commercial-safe data only (no OpenSky, no TeleGeography), no server relay, real data with
  honest labels (live / delayed / static / modelled), fine particles, never blobby.

## White corporate theme (2026-11-27)
- The owner asked for an all-white, big-tech-style version of the whole site next to the neon one. It is the SAME pages
  with a second look, not a copy of the files: `white-theme.js` (in `<head>`, before the stylesheets) puts class
  `white` on `<html>` and removes `neon`, so every `html.neon ...` rule switches off; `white-theme.css` (always the last
  stylesheet; every rule starts with `html.white`) does the rest. `tools/white-theme.mjs` links both on every page
  (run last by build-pages.mjs); `tools/stamp-assets.mjs` stamps their `?v=` tags.
- Addresses: `tenshisystems.com/white/` switches a device to white, `/neon/` switches back (or `?theme=white|neon` on
  any page; remembered in localStorage). Neon is still the default: to make white the default for everyone, change
  `DEFAULT` at the top of white-theme.js.
- The neon extras in `sandbox/` (recolor-live, header, game-loader, quest, arcade-px3, hero-anim; neon-audio except on
  game pages) return at once when `<html>` has class `white`. New neon scripts need the same first line.
- New page styles: scope neon-only looks to `html.neon`, and check the page with `?theme=white` too.

- 2026-11-28: land dots take their true colour (green forest, tan and brown desert, white ice) from `data/globe/earth.jpg`, NASA Blue Marble via GIBS, fetched once by `tools/globe-earth.py`. Without the file the old teal-to-violet ramp shows. The scheduled copies of `globe-data.yml` and `globe-live.yml` live on `main` (merged by the owner, PR #2); the copy on `tenshi-cms` runs on pushes. When a workflow step changes, `main` needs the same change through a pull request for the owner to merge. The aircraft tool asks adsb.lol one request a second (faster gets HTTP 429).
