"""
game_settings.py: every game on tenshisystems.com, tuned from one Python file.

    1. Change any number below (or a colour: "#rrggbb").
    2. Run:   python game_settings.py
       (it checks your changes and writes sandbox/game-settings.js, which the games read)
    3. Commit and push (or ask Claude to deploy). The live site updates within 5 minutes.

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
    "hero": {"speed": 4.2, "reach": 1.25, "attackEvery": 520},   # walking speed, sword reach (tiles), time between swings
    "skills": {
        "fireball": {"mana": 8,  "cd": 350},
        "nova":     {"mana": 16, "cd": 1600},   # Frost Nova
    },
    "monsters": {
        # hp, dmg = damage per hit, speed, reach (tiles), every = time between attacks, xp, weight = how common
        "hollow":  {"hp": 30,  "dmg": 4,  "speed": 1.9, "reach": 1.1, "every": 1000, "xp": 12,  "weight": 5},
        "skitter": {"hp": 16,  "dmg": 3,  "speed": 3.4, "reach": 1.0, "every": 650,  "xp": 8,   "weight": 4},
        "wisp":    {"hp": 22,  "dmg": 5,  "speed": 2.4, "reach": 5.5, "every": 1500, "xp": 14,  "weight": 3},
        "golem":   {"hp": 110, "dmg": 12, "speed": 1.4, "reach": 1.3, "every": 1500, "xp": 40,  "weight": 1},
        "warden":  {"hp": 700, "dmg": 24, "speed": 1.9, "reach": 1.6, "every": 1300, "xp": 300},   # the boss (every 3rd floor)
    },
    # ---- ENEMY NUMBERS ----
    "enemies": {
        "perRoomMin": 2,             # fewest monsters in a room
        "perRoomMax": 3,             # most monsters in a room on floor 1...
        "extraEveryTwoFloors": 1,    # ...plus this many more every 2 floors...
        "extraMax": 4,               # ...but never more than this many extra
        "bossEvery": 3,              # a Warden boss guards the stairs every this many floors (0 = never)
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
        if not (value.startswith("#") and len(value) in (4, 7)):
            sys.exit(f'Problem in {path}: text values should be colours like "#ff2bd6"')
    else:
        sys.exit(f"Problem in {path}: {value!r} isn't a number, list or colour")


def main():
    settings = {
        "arcade": ARCADE, "sky": SKY_BEASTS, "grid": NEON_GRID,
        "rts": STATION_DEFENSE, "arpg": UNDERCITY, "quest": QUEST,
    }
    check(settings, "settings")
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "sandbox", "game-settings.js")
    js = (
        "// Written by game_settings.py. Don't edit this file: edit game_settings.py and run it again.\n"
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
    print(f"OK: wrote {os.path.relpath(out, here)} ({len(js):,} bytes). Commit and push to put it live.")


if __name__ == "__main__":
    main()
