"""
game_settings.py: every game on tenshisystems.com, tuned from one Python file.

    1. Change any number below (or a colour: "#rrggbb").
    2. Run:   python game_settings.py
       (it checks your changes and writes sandbox/game-settings.js, which the games read)
    3. Commit and push (or ask Claude to deploy). The live site updates within 5 minutes.

You can also change all of these in the website editor (admin.html › Game Studio). Changes made there are kept in
data/games.json and win over the values below; this script applies them too, so the two never fight. To go back to
the values below, use "Reset" in Game Studio (or delete data/games.json).

Enemy counts: search for "ENEMY NUMBERS" (one block in each game).
Leave something out and the game simply uses its built-in value. Times are in milliseconds (1000 = 1 second)
unless a comment says otherwise. Ranges like [14000, 24000] mean "a random value between these".
"""
import json
import os
import sys

# =====================================================================================================================
#  HERO ARCADE: the click-to-shoot game in the neon homepage header
# =====================================================================================================================
ARCADE = {
    "game": {
        "hitRadius": 1.4,            # how forgiving aiming is (1 = you must hit the target exactly)
        "comboWindow": 1600,         # time you have to land the next hit to keep a combo going
        "baseSpawnEvery": 1200,      # time between new targets at level 1 (gets shorter each level)
        "pointsPerLevel": 300,       # score needed to go up a level
        "targetOpacity": 0.6,        # how see-through the flying targets are (1 = solid)
        "shields": 5,                # city shield hearts (they recharge when they run out: the game never ends by itself)
        "bossEvery": 800,            # a mothership boss appears every this many points
        "powerEvery": [14000, 24000],  # time between power-ups
        "powerSeconds": 7,           # how long Rapid Fire / Spread Shot / Slow-mo last (seconds)
        # ---- ENEMY NUMBERS ----
        "maxTargets": 6,             # most flying targets on screen at level 1...
        "moreTargetsPerLevel": 2,    # ...plus this many more for each level (level 3 = 6 + 3x2 = 12)
        "targetsDuringBoss": 4,      # most flying targets while a mothership boss is out
    },
    "targets": {                     # the flying targets
        "drone":  {"points": 10,  "size": 16, "speed": [1.2, 2.2], "weight": 5},     # weight = how common it is
        "saucer": {"points": 25,  "size": 22, "speed": [2.2, 3.4], "weight": 3},
        "cube":   {"points": 15,  "size": 18, "speed": [1.0, 1.8], "weight": 3},
        "star":   {"points": 100, "size": 14, "speed": [3.6, 4.8], "weight": 0.5},
    },
    "weapons": {                     # cooldown = time between shots, boss = damage to bosses and giants per hit
        "laser":   {"cooldown": 0,   "boss": 1},
        "mg":      {"cooldown": 70,  "boss": 0.4},    # machine gun
        "rocket":  {"cooldown": 650, "boss": 6},
        "shotgun": {"cooldown": 420, "boss": 0.7},
        "rail":    {"cooldown": 900, "boss": 5},      # railgun
        "chain":   {"cooldown": 480, "boss": 3},      # lightning
    },
    "monsters": {                    # the giant robot and kaiju that wreck the city
        "firstAfter": 25000,         # after the first shot, the first giant arrives this much later
        "attractAfter": 6000,        # before anyone plays, one stomps in after this long (just a show)
        "attractSmashes": 10,        # ...and walks off after this many blows
        "every": 45000,              # time between giants (after one is beaten)
        "health": {"robot": 38, "kaiju": 44},
        "points": 500,               # score for bringing one down
        "height": 0.35,              # how tall, as a share of the screen height
        "opacity": 0.94,
        "smashEvery": 1500,          # time between blows on a building
        "buildingsPerShield": 2,     # every this many flattened buildings costs a shield
        # ---- ENEMY NUMBERS ----
        "atOnce": 1,                 # most giants in the city at the same time...
        "atOnceLater": 2,            # ...and once you reach level laterFromLevel
        "laterFromLevel": 3,
    },
    "letters": {                     # shooting the headline's letters
        "points": 10, "wordBonus": 50, "sloganBonus": 250,
        "backAfter": [7000, 11000],  # how long until a shot letter spins back in
    },
    "beast_points": 100,             # score for blowing up the dragon or the phoenix
}

# =====================================================================================================================
#  SKY BEASTS: the particle dragon and phoenix over the header
# =====================================================================================================================
SKY_BEASTS = {
    "dragonSegments": 84,            # how long the dragon is (body pieces)
    "dragonSpacing": 12,             # pixels between body pieces
    "dragonThickness": 26,           # body radius at its thickest, in pixels
    "dragonSpeed": 0.00016,          # how fast they fly their loop
    "phoenixSize": 1.8,              # 1 = normal, 1.5 = half as big again
    "sparksPerFrame": 22,            # loose sparks they shed
    "opacity": 1,
    "followMouse": 0.25,             # how strongly they drift towards the mouse (0 = not at all)
    "dragonHealth": 14,              # damage before it explodes (a laser hit does 1, a rocket 6)
    "phoenixHealth": 10,
    "respawnSeconds": 25,            # time until an exploded beast re-forms (seconds)
    # ---- ENEMY NUMBERS ----
    "dragon": True,                  # False = no dragon
    "phoenix": True,                 # False = no phoenix
}

# =====================================================================================================================
#  NEON GRID: the animated floor behind the header
# =====================================================================================================================
NEON_GRID = {
    "columns": 16,                   # tiles to each side of the middle
    "rows": 46,                      # how far into the distance the floor goes
    "glideSpeed": -0.35,             # tiles per second (negative = slides away into the horizon)
    "pulseSpeed": 1.6,               # how fast tiles grow and shrink
    "smallest": 0.15, "largest": 0.95,  # tile size range (1 = touching)
    "horizon": 0.40,                 # where the horizon sits (0.40 = 40% down the screen)
    "hueNear": 270, "hueMiddle": 320, "hueFar": 385,   # colours by distance (hue 0-360; 270 purple, 320 pink, 385 orange)
}

# =====================================================================================================================
#  STATION DEFENSE: the space strategy game
# =====================================================================================================================
STATION_DEFENSE = {
    "map": {"w": 2600, "h": 1500},   # size of the battlefield
    "start": {"credits": 150, "sparks": 4, "blades": 2},   # starting crystals, miners and interceptors
    "supply_cap": 30,                # ships you can have before building Supply Depots
    "waves": {"first": 75, "every": 45},   # seconds until the first alien wave, then between waves
    "crystal": {"amount": 1200, "carry": 8, "mineTime": 1100},   # crystals per field, per trip, time to mine
    # ---- ENEMY NUMBERS ---- (mite = Swarmling, brute = Behemoth, spitter = Spitter)
    "enemies": {
        "start":      {"mite": 6, "brute": 2,   "spitter": 2},     # aliens guarding the hive when the game starts
        # each wave sends  base + growth x wave number  of each (rounded down). Wave 4: 3 + 2x4 = 11 Swarmlings
        "waveBase":   {"mite": 3, "brute": 0,   "spitter": 0.5},
        "waveGrowth": {"mite": 2, "brute": 0.5, "spitter": 0.5},
        "maxAlive": 150,             # waves stop adding aliens once this many are alive (keeps it smooth)
    },
    "units": {
        # hp = health, speed, dmg = damage per shot, range, cd = time between shots, sight, cost, time = build seconds
        "spark":   {"hp": 40,   "speed": 1.9,  "dmg": 3,  "range": 18,  "cd": 900,  "sight": 230, "cost": 50,  "time": 5},    # Miner
        "blade":   {"hp": 85,   "speed": 2.6,  "dmg": 9,  "range": 24,  "cd": 550,  "sight": 260, "cost": 100, "time": 7},    # Interceptor
        "lancer":  {"hp": 150,  "speed": 1.35, "dmg": 24, "range": 210, "cd": 1500, "sight": 300, "cost": 175, "time": 10, "splash": 46},   # Gunship
        "core":    {"hp": 1600, "sight": 380},                                                                                 # Tenshi Station
        "mite":    {"hp": 32,   "speed": 2.7,  "dmg": 5,  "range": 14,  "cd": 600,  "sight": 240},   # Swarmling
        "brute":   {"hp": 230,  "speed": 1.25, "dmg": 26, "range": 20,  "cd": 1200, "sight": 240},   # Behemoth
        "spitter": {"hp": 70,   "speed": 1.8,  "dmg": 11, "range": 170, "cd": 1300, "sight": 260},   # Spitter
        "hive":    {"hp": 2400, "sight": 300},                                                      # Alien Hive
        # Buildings your miners build (time = seconds to build). Select a miner, press 1-4, click where.
        "tower":   {"hp": 420,  "sight": 300, "dmg": 12, "range": 240, "cd": 650, "cost": 100, "time": 16},   # Defense Turret
        "depot":   {"hp": 380,  "sight": 200, "cost": 75,  "time": 14, "supply": 8},                          # Supply Depot (+8 ships)
        "outpost": {"hp": 1000, "sight": 380, "cost": 250, "time": 30},                                       # Outpost (forward base)
        "yard":    {"hp": 750,  "sight": 280, "cost": 200, "time": 26},                                       # Shipyard
    },
    "zoom": {
        "start": 1.4,                # how close the camera starts (1 = the old, far view; bigger = bigger ships)
        "max": 5,                    # the closest you can zoom in (wheel, + / - keys, the + - buttons, pinch)
    },
    "build": {
        "radius": 420,               # you can build this far from the station or an outpost (chain outposts to expand)
        "supplyMax": 80,             # the most ships Supply Depots can raise your fleet to
    },
}

# =====================================================================================================================
#  UNDERCITY: the dungeon crawler
# =====================================================================================================================
UNDERCITY = {
    "light": 6.5,                    # how far the hero's light reaches (tiles)
    "heroSprite": True,              # show the pre-rendered Female Angel Hero with its animations (False = use the 3D model in the arpg.hero slot)
    "hollowSprite": True,            # show the animated Corrupted Astral Sorcerer as the Hollow (False = use the arpg.hollow 3D model)
    "golemSprite": True,             # show the animated Green Elemental as the Golem (False = use the arpg.golem 3D model)
    "elfSprite": True,               # show the animated Evil Green Elf (False = use the arpg.elf 3D model)
    "wizardSprite": True,            # show the fully animated Evil Wizard (False = use the arpg.wizard 3D model)
    "skitterSprite": True,           # show the detailed lava spider as the Skitter (False = use the arpg.skitter 3D model)
    "hero": {"speed": 4.2, "reach": 1.25, "attackEvery": 520},   # walking speed, sword reach (tiles), time between swings
    "skills": {
        "fireball": {"mana": 8,  "cd": 350},
        "nova":     {"mana": 16, "cd": 1600},   # Frost Nova
    },
    # Your own enemy types, added in Game Studio > New enemies (each with its own Meshy/Blender model). Edit them there.
    "custom": [],
    # Holy Power fills as you fight; at 100% the Power of God button pops up (or press E): it slays every enemy you can see.
    "holy": {"perHit": 0.8, "perKill": 6, "perChampion": 14, "perBoss": 30},   # Holy Power gained per hit landed / per kill (percent)
    # Holy Gospel fills when the hero is hurt, kills and goes deeper; at 100% the Archangel button pops up (or press R):
    # Gabriel shields the hero from all damage and strikes down the nearest enemies for a while.
    # ---- THE HOUSES OF THE PATRIARCHS (keys 3, 4, 5) ----
    "houses": {
        "abraham": {"level": 3, "cooldown": 20, "damage": 3, "goldBonus": 2},   # Covenant of Stars: unlock level, cooldown (s), damage (x hero damage) to every enemy in sight, extra gold drops
        "isaac": {"level": 6, "cooldown": 45, "ramSeconds": 30},                # Jehovah-Jireh: full heal and mana; a ram takes the next deadly blow within this many seconds
        "jacob": {"level": 9, "cooldown": 60, "seconds": 15, "spirits": 12, "damageBoost": 2},   # Jacob's Ladder: tribe spirits fight for this long; hero damage multiplied meanwhile
    },
    # ---- INVENTORY ----
    "inventory": {
        "slots": 50,                 # how many relics the bag holds (open it with C or I); when full, new finds are sold
        "autoEquip": True,           # put on better gear automatically when you pick it up (the old piece goes in the bag)
    },
    # ---- HELL ----
    "hell": {
        "finalFloor": 9,             # the circle where Satan waits (Dante's ninth circle, the frozen lake); beat him to transcend
        "embers": True,              # embers drifting up through Hell (snow on the frozen last floor)
        "lavaPools": 0.05,           # share of floor tiles that are lava pools (0 = none; just for looks)
        "verses": True,              # show a Bible verse or Dante line when you enter a circle and use holy powers
        "bossIntro": {"enabled": True, "seconds": 2.5},   # cinematic intro when a boss first sees you: darkened edges, its name in giant fiery letters, camera leans toward it
    },
    # ---- ENEMY LABELS ----
    "labels": {
        "healthBars": True,          # show a health bar over every enemy
        "onlyWhenHurt": False,       # True = only after it has been hit (the old way)
        "names": True,               # show each enemy's name over it (champions say "Champion ...")
        "nameSize": 12,              # name text size (pixels at normal zoom)
        "barWidth": 40,              # health bar width (pixels at normal zoom)
        "barHeight": 5,              # health bar thickness (pixels at normal zoom)
        "barColor": "#ff4f7a",       # health bar colour
        "championColor": "#ffd84a",  # health bar colour for champions (the gold-glow elites)
        "nameColor": "#f2e4ff",      # name colour
        "championNameColor": "#ffd84a",   # name colour for champions
        "heroLabel": True,           # show the hero's name and level over her head
        "heroName": "Tenshi",        # the hero's name (any short text)
        "heroNameColor": "#ffe9a0",  # colour of the hero's name
        "heroLevelColor": "#9fd8ff", # colour of the hero's level
    },
    "gospel": {"perDamageTaken": 0.6, "perKill": 3, "perFloor": 20, "seconds": 10, "strikeEvery": 550, "radius": 7.5, "bossDamage": 0.2},   # gain per damage point / kill / new floor (percent); how long Gabriel stays (s), time between strikes (ms), strike range (tiles), share of a boss's life per strike
    "monsters": {
        # name (shown over it), hp, dmg = damage per hit, speed, reach (tiles), every = time between attacks, xp, weight = how common
        "hollow":  {"name": "Hollow", "hp": 30,  "dmg": 4,  "speed": 1.9, "reach": 1.1, "every": 1000, "xp": 12,  "weight": 5},
        "skitter": {"name": "Lava Spider", "hp": 16,  "dmg": 3,  "speed": 3.4, "reach": 1.0, "every": 650,  "xp": 8,   "weight": 4},
        "wisp":    {"name": "Wisp", "hp": 22,  "dmg": 5,  "speed": 2.4, "reach": 5.5, "every": 1500, "xp": 14,  "weight": 3},
        "wizard":  {"name": "Evil Wizard", "hp": 34,  "dmg": 5,  "speed": 2.0, "reach": 1.2, "every": 1100, "xp": 15,  "weight": 5},   # the Evil Wizard
        "elf":     {"name": "Green Elf", "hp": 22,  "dmg": 4,  "speed": 2.9, "reach": 1.0, "every": 800,  "xp": 10,  "weight": 5},   # the Evil Green Elf
        "golem":   {"name": "Golem", "hp": 110, "dmg": 12, "speed": 1.4, "reach": 1.3, "every": 1500, "xp": 40,  "weight": 3},   # the Green Elemental
        "satan":   {"name": "Satan", "hp": 2600, "dmg": 40, "speed": 2.0, "reach": 1.9, "every": 1200, "xp": 1500},   # the final boss (last circle)
        "warden":  {"name": "The Warden", "hp": 700, "dmg": 24, "speed": 1.9, "reach": 1.6, "every": 1300, "xp": 300},   # the boss (every 3rd floor)
    },
    # ---- ENEMY NUMBERS ----
    "enemies": {
        "perRoomMin": 2,             # fewest monsters in a room
        "perRoomMax": 3,             # most monsters in a room on floor 1...
        "extraEveryTwoFloors": 1,    # ...plus this many more every 2 floors...
        "extraMax": 4,               # ...but never more than this many extra
        "bossEvery": 3,              # a Warden boss guards the stairs every this many floors (0 = never)
        "golemFromFloor": 1,         # the Golem (Green Elemental) shows up from this floor on (1 = from the start)
        "startEase": 0.3,            # how much easier the start is: 0.3 = enemies have 30% less health and damage on floor 1
        "easeFloors": 3,             # ...easing back to full strength over this many floors (full from floor 4)
    },
    "rarity": {                      # loot: chance of each rarity, and how much stronger it is
        "common":    {"chance": 0.58,  "mult": 1},
        "magic":     {"chance": 0.28,  "mult": 1.35},
        "rare":      {"chance": 0.115, "mult": 1.8},
        "legendary": {"chance": 0.025, "mult": 2.6},
    },
}

# =====================================================================================================================
#  QUEST: the XP you get for exploring the site (every page)
# =====================================================================================================================
QUEST = {
    "stage": 100,           # XP for each section you reach
    "area": 50,             # XP for each page you discover
    "areaComplete": 150,    # bonus for clearing every section on a page
    "explorer": 300,        # bonus for discovering explorerAreas pages
    "explorerAreas": 6,
    "quest": 500,           # XP for sending the contact form
    "perLevel": 400,        # XP per level
}


# ---------------------------------------------------------------------------------------------------------------------
#  (no need to edit below) Checks the settings and writes sandbox/game-settings.js for the games.
# ---------------------------------------------------------------------------------------------------------------------
def check(value, path):
    """Catch typos before they reach the site: numbers, lists of two numbers, colours, true/false."""
    if isinstance(value, dict):
        for k, v in value.items():
            check(v, f"{path}.{k}")
    elif isinstance(value, list):
        if not all(isinstance(x, (int, float)) for x in value):
            sys.exit(f"Problem in {path}: lists should hold numbers, e.g. [1000, 2000]")
    elif isinstance(value, bool) or value is None:
        pass
    elif isinstance(value, (int, float)):
        if value != value:
            sys.exit(f"Problem in {path}: not a number")
    elif isinstance(value, str):
        if path.lower().endswith("name"):                            # names (shown in the games): short plain text
            if not value.strip() or len(value) > 40:
                sys.exit(f"Problem in {path}: a name should be 1 to 40 characters")
        elif not (value.startswith("#") and len(value) in (4, 7)):
            sys.exit(f'Problem in {path}: text values should be colours like "#ff2bd6" (or a "name")')
    else:
        sys.exit(f"Problem in {path}: {value!r} isn't a number, list or colour")


SECTIONS = [  # (id the games use, the variable above)
    ("arcade", "ARCADE"), ("sky", "SKY_BEASTS"), ("grid", "NEON_GRID"), ("rts", "STATION_DEFENSE"), ("arpg", "UNDERCITY"), ("quest", "QUEST"),
]


def merge(base, extra):
    """Copy the values from `extra` over `base` (only keys that exist in base, so old or mistyped keys are ignored)."""
    out = json.loads(json.dumps(base))
    for k, v in (extra or {}).items():
        if k not in out:
            continue
        if isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = merge(out[k], v)
        else:
            out[k] = v
    return out


def describe(source):
    """For the website editor: each section's title and the comment written next to every value in this file."""
    lines = source.splitlines()
    sections = []
    for sid, var in SECTIONS:
        start = next(i for i, l in enumerate(lines) if l.startswith(var + " = {"))
        title = lines[start - 2].strip(" #") if lines[start - 1].startswith("# ===") else var
        help_ = {}
        stack, depth, i = [], 0, start
        while True:
            line = lines[i]
            # The comment starts at the first "  #" outside a quoted string (colour values like "#ff4f7a" contain a #).
            masked = __import__("re").sub(r'"[^"]*"', lambda q: '"' + "x" * (len(q.group()) - 2) + '"', line)
            cut = masked.find("  #")
            code, comment = (line[:cut], line[cut + 3:]) if cut >= 0 else (line, "")
            if line.strip().startswith("#"):
                code, comment = "", ""
            first = None
            for tok in __import__("re").finditer(r'"(\w+)"\s*:\s*(\{)?|(\{)|(\})', code):
                key, opens, brace, close = tok.groups()
                if key:
                    path = ".".join([k for k in stack if k] + [key])
                    if first is None:
                        first = path
                    if opens:
                        stack.append(key)
                elif brace:
                    stack.append(None); depth += 1
                elif close:
                    if stack:
                        stack.pop()
            if first and comment.strip():
                help_[first] = comment.strip()
            if i > start and line.startswith("}"):
                break
            i += 1
        sections.append({"id": sid, "title": title, "help": help_})
    return sections


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    defaults = {sid: globals()[var] for sid, var in SECTIONS}
    # Changes made in the website editor (Game Studio) win over the values in this file.
    edits_path = os.path.join(here, "data", "games.json")
    edits = {}
    if os.path.exists(edits_path):
        with open(edits_path, encoding="utf-8") as f:
            edits = json.load(f)
    settings = merge(defaults, edits)
    check(settings, "settings")
    out = os.path.join(here, "sandbox", "game-settings.js")
    js = (
        "// Written by game_settings.py (and by the editor's Game Studio). Don't edit this file: use Game Studio, or edit game_settings.py and run it.\n"
        "window.TENSHI_GAMES = " + json.dumps(settings, indent=1) + ";\n"
        "// Copies a game's settings over its built-in ones (only the values that are given).\n"
        "window.TENSHI_TUNE = function tune(target, src) {\n"
        "  if (!target || !src) return target;\n"
        "  for (const k in src) {\n"
        "    const v = src[k];\n"
        "    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) tune(target[k], v);\n"
        "    else target[k] = v;\n"
        "  }\n"
        "  return target;\n"
        "};\n"
    )
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(js)
    # What the editor's Game Studio needs to build its form: the default values, section titles and every comment.
    with open(os.path.abspath(__file__), encoding="utf-8") as f:
        source = f.read()
    schema = {"note": "Written by game_settings.py for the editor's Game Studio. Don't edit by hand.", "defaults": defaults, "sections": describe(source)}
    with open(os.path.join(here, "data", "games-schema.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(schema, f, indent=1, ensure_ascii=False)
    print(f"OK: wrote {os.path.relpath(out, here)} ({len(js):,} bytes)" + (f", with {len(edits)} section(s) of Game Studio edits" if edits else "") + ", and data/games-schema.json. Commit and push to put it live.")


if __name__ == "__main__":
    main()
