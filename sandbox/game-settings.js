// Written by game_settings.py (and by the editor's Game Studio). Don't edit this file: use Game Studio, or edit game_settings.py and run it.
window.TENSHI_GAMES = {
 "arcade": {
  "game": {
   "hitRadius": 1.4,
   "comboWindow": 1600,
   "baseSpawnEvery": 1200,
   "pointsPerLevel": 300,
   "targetOpacity": 0.6,
   "shields": 5,
   "bossEvery": 800,
   "powerEvery": [
    14000,
    24000
   ],
   "powerSeconds": 7,
   "maxTargets": 6,
   "moreTargetsPerLevel": 2,
   "targetsDuringBoss": 4
  },
  "targets": {
   "drone": {
    "points": 10,
    "size": 16,
    "speed": [
     1.2,
     2.2
    ],
    "weight": 5
   },
   "saucer": {
    "points": 25,
    "size": 22,
    "speed": [
     2.2,
     3.4
    ],
    "weight": 3
   },
   "cube": {
    "points": 15,
    "size": 18,
    "speed": [
     1.0,
     1.8
    ],
    "weight": 3
   },
   "star": {
    "points": 100,
    "size": 14,
    "speed": [
     3.6,
     4.8
    ],
    "weight": 0.5
   }
  },
  "weapons": {
   "laser": {
    "cooldown": 0,
    "boss": 1
   },
   "mg": {
    "cooldown": 70,
    "boss": 0.4
   },
   "rocket": {
    "cooldown": 650,
    "boss": 6
   },
   "shotgun": {
    "cooldown": 420,
    "boss": 0.7
   },
   "rail": {
    "cooldown": 900,
    "boss": 5
   },
   "chain": {
    "cooldown": 480,
    "boss": 3
   }
  },
  "monsters": {
   "firstAfter": 25000,
   "attractAfter": 6000,
   "attractSmashes": 10,
   "every": 45000,
   "health": {
    "robot": 38,
    "kaiju": 44
   },
   "points": 500,
   "height": 0.35,
   "opacity": 0.94,
   "smashEvery": 1500,
   "buildingsPerShield": 2,
   "atOnce": 1,
   "atOnceLater": 2,
   "laterFromLevel": 3
  },
  "letters": {
   "points": 10,
   "wordBonus": 50,
   "sloganBonus": 250,
   "backAfter": [
    7000,
    11000
   ]
  },
  "beast_points": 100
 },
 "sky": {
  "dragonSegments": 84,
  "dragonSpacing": 12,
  "dragonThickness": 26,
  "dragonSpeed": 0.00016,
  "phoenixSize": 1.8,
  "sparksPerFrame": 22,
  "opacity": 1,
  "followMouse": 0.25,
  "dragonHealth": 14,
  "phoenixHealth": 10,
  "respawnSeconds": 25,
  "dragon": true,
  "phoenix": true
 },
 "grid": {
  "columns": 16,
  "rows": 46,
  "glideSpeed": -0.35,
  "pulseSpeed": 1.6,
  "smallest": 0.15,
  "largest": 0.95,
  "horizon": 0.4,
  "hueNear": 270,
  "hueMiddle": 320,
  "hueFar": 385
 },
 "rts": {
  "map": {
   "w": 2600,
   "h": 1500
  },
  "start": {
   "credits": 150,
   "sparks": 4,
   "blades": 2
  },
  "supply_cap": 30,
  "waves": {
   "first": 75,
   "every": 45
  },
  "crystal": {
   "amount": 1200,
   "carry": 8,
   "mineTime": 1100
  },
  "enemies": {
   "start": {
    "mite": 6,
    "brute": 2,
    "spitter": 2
   },
   "waveBase": {
    "mite": 3,
    "brute": 0,
    "spitter": 0.5
   },
   "waveGrowth": {
    "mite": 2,
    "brute": 0.5,
    "spitter": 0.5
   },
   "maxAlive": 150
  },
  "units": {
   "spark": {
    "hp": 40,
    "speed": 1.9,
    "dmg": 3,
    "range": 18,
    "cd": 900,
    "sight": 230,
    "cost": 50,
    "time": 5
   },
   "blade": {
    "hp": 85,
    "speed": 2.6,
    "dmg": 9,
    "range": 24,
    "cd": 550,
    "sight": 260,
    "cost": 100,
    "time": 7
   },
   "lancer": {
    "hp": 150,
    "speed": 1.35,
    "dmg": 24,
    "range": 210,
    "cd": 1500,
    "sight": 300,
    "cost": 175,
    "time": 10,
    "splash": 46
   },
   "core": {
    "hp": 1600,
    "sight": 380
   },
   "mite": {
    "hp": 32,
    "speed": 2.7,
    "dmg": 5,
    "range": 14,
    "cd": 600,
    "sight": 240
   },
   "brute": {
    "hp": 230,
    "speed": 1.25,
    "dmg": 26,
    "range": 20,
    "cd": 1200,
    "sight": 240
   },
   "spitter": {
    "hp": 70,
    "speed": 1.8,
    "dmg": 11,
    "range": 170,
    "cd": 1300,
    "sight": 260
   },
   "hive": {
    "hp": 2400,
    "sight": 300
   },
   "tower": {
    "hp": 420,
    "sight": 300,
    "dmg": 12,
    "range": 240,
    "cd": 650,
    "cost": 100,
    "time": 16
   },
   "depot": {
    "hp": 380,
    "sight": 200,
    "cost": 75,
    "time": 14,
    "supply": 8
   },
   "outpost": {
    "hp": 1000,
    "sight": 380,
    "cost": 250,
    "time": 30
   },
   "yard": {
    "hp": 750,
    "sight": 280,
    "cost": 200,
    "time": 26
   }
  },
  "zoom": {
   "start": 1.4,
   "max": 5
  },
  "build": {
   "radius": 420,
   "supplyMax": 80
  }
 },
 "arpg": {
  "light": 6.5,
  "heroSprite": true,
  "hollowSprite": true,
  "golemSprite": true,
  "elfSprite": true,
  "wizardSprite": true,
  "skitterSprite": true,
  "hero": {
   "speed": 4.2,
   "reach": 1.25,
   "attackEvery": 520
  },
  "skills": {
   "fireball": {
    "mana": 8,
    "cd": 350
   },
   "nova": {
    "mana": 16,
    "cd": 1600
   }
  },
  "custom": [],
  "holy": {
   "perHit": 0.8,
   "perKill": 6,
   "perChampion": 14,
   "perBoss": 30
  },
  "houses": {
   "abraham": {
    "level": 3,
    "cooldown": 20,
    "damage": 3,
    "goldBonus": 2
   },
   "isaac": {
    "level": 6,
    "cooldown": 45,
    "ramSeconds": 30
   },
   "jacob": {
    "level": 9,
    "cooldown": 60,
    "seconds": 15,
    "spirits": 12,
    "damageBoost": 2
   }
  },
  "hell": {
   "finalFloor": 9,
   "embers": true,
   "lavaPools": 0.05,
   "verses": true,
   "bossIntro": {
    "enabled": true,
    "seconds": 2.5
   }
  },
  "labels": {
   "healthBars": true,
   "onlyWhenHurt": false,
   "names": true,
   "nameSize": 12,
   "barWidth": 40,
   "barHeight": 5,
   "barColor": "#ff4f7a",
   "championColor": "#ffd84a",
   "nameColor": "#f2e4ff",
   "championNameColor": "#ffd84a",
   "heroLabel": true,
   "heroName": "Tenshi",
   "heroNameColor": "#ffe9a0",
   "heroLevelColor": "#9fd8ff"
  },
  "gospel": {
   "perDamageTaken": 0.6,
   "perKill": 3,
   "perFloor": 20,
   "seconds": 10,
   "strikeEvery": 550,
   "radius": 7.5,
   "bossDamage": 0.2
  },
  "monsters": {
   "hollow": {
    "name": "Hollow",
    "hp": 30,
    "dmg": 4,
    "speed": 1.9,
    "reach": 1.1,
    "every": 1000,
    "xp": 12,
    "weight": 5
   },
   "skitter": {
    "name": "Lava Spider",
    "hp": 16,
    "dmg": 3,
    "speed": 3.4,
    "reach": 1.0,
    "every": 650,
    "xp": 8,
    "weight": 4
   },
   "wisp": {
    "name": "Wisp",
    "hp": 22,
    "dmg": 5,
    "speed": 2.4,
    "reach": 5.5,
    "every": 1500,
    "xp": 14,
    "weight": 3
   },
   "wizard": {
    "name": "Evil Wizard",
    "hp": 34,
    "dmg": 5,
    "speed": 2.0,
    "reach": 1.2,
    "every": 1100,
    "xp": 15,
    "weight": 5
   },
   "elf": {
    "name": "Green Elf",
    "hp": 22,
    "dmg": 4,
    "speed": 2.9,
    "reach": 1.0,
    "every": 800,
    "xp": 10,
    "weight": 5
   },
   "golem": {
    "name": "Golem",
    "hp": 110,
    "dmg": 12,
    "speed": 1.4,
    "reach": 1.3,
    "every": 1500,
    "xp": 40,
    "weight": 3
   },
   "satan": {
    "name": "Satan",
    "hp": 2600,
    "dmg": 40,
    "speed": 2.0,
    "reach": 1.9,
    "every": 1200,
    "xp": 1500
   },
   "warden": {
    "name": "The Warden",
    "hp": 700,
    "dmg": 24,
    "speed": 1.9,
    "reach": 1.6,
    "every": 1300,
    "xp": 300
   }
  },
  "enemies": {
   "perRoomMin": 4,
   "perRoomMax": 5,
   "extraEveryTwoFloors": 1,
   "extraMax": 4,
   "bossEvery": 3,
   "golemFromFloor": 1,
   "startEase": 0.3,
   "easeFloors": 3
  },
  "rarity": {
   "common": {
    "chance": 0.58,
    "mult": 1
   },
   "magic": {
    "chance": 0.28,
    "mult": 1.35
   },
   "rare": {
    "chance": 0.115,
    "mult": 1.8
   },
   "legendary": {
    "chance": 0.025,
    "mult": 2.6
   }
  }
 },
 "quest": {
  "stage": 100,
  "area": 50,
  "areaComplete": 150,
  "explorer": 300,
  "explorerAreas": 6,
  "quest": 500,
  "perLevel": 400
 }
};
// Copies a game's settings over its built-in ones (only the values that are given).
window.TENSHI_TUNE = function tune(target, src) {
  if (!target || !src) return target;
  for (const k in src) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) tune(target[k], v);
    else target[k] = v;
  }
  return target;
};
