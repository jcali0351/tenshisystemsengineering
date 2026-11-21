# Your own 3D characters (Blender → the games)

Every character in the site's games can be replaced by a model you make in Blender. No coding: export, drop the file
here, write its name in `models.json`, push.

## 1. Make the model
- **In Blender:** face the front towards Blender's −Y (the way the *Front* view, numpad 1, looks at it), stand it on the
  ground at the origin, and apply transforms (*Object › Apply › All Transforms*). Size doesn't matter: the games scale it.
- **From an AI tool (Tripo, Meshy and the like):** download it as **GLB**. That's all; textures and detail are handled
  for you (see below). If it faces the wrong way, open it in Blender, turn it to face −Y, and export again.
- **Colours: any of these work.**
  - **Textures** (an image wrapped around the model, what AI tools make): each face takes its colour from the image.
  - **Material colours** (Principled BSDF *Base Color*).
  - **Vertex colours.**
  Fine detail painted *inside* one face won't show (one colour per face), so the look is clean and low-poly.
- **Glowing parts** (eyes, engines, visors): give that material an *Emission* colour. Those faces stay bright.
- **Detail is simplified automatically.** Models over about 2,400 triangles are reduced when they load (the colours are
  kept), so the games stay smooth. For the best result on very detailed models, reduce them yourself in Blender with a
  *Decimate* modifier first.
- **No compression:** if your tool offers *Draco* or *meshopt* compression, turn it off. Compressed files can't be read.

## 2. Export it
*File › Export › glTF 2.0 (.glb/.gltf)*, then:
- **Format: glTF Binary (.glb)**
- Include: *Selected Objects* (select your model first), Transform: *+Y Up* (the default)
- Turn **Compression** off. Animation can be left on or off: rigs aren't used yet (a model moves, turns, bobs and leans as one piece).

Save the `.glb` into this `models/` folder, e.g. `models/my-fighter.glb`.

## 3. Tell the game to use it
Open `models.json` and put the file name next to the character:

```json
"rts.interceptor": "my-fighter.glb",
```

Then commit and push. The live site picks it up within 5 minutes (or straight away if Claude deploys it).
Leave a slot as `""` to keep the built-in character.

## The characters you can replace

| Game | Slots |
|---|---|
| Hero arcade (top of the homepage) | `arcade.drone`, `arcade.saucer`, `arcade.cube`, `arcade.star`, `arcade.robot`, `arcade.kaiju` |
| Station Defense (space strategy) | `rts.station`, `rts.miner`, `rts.interceptor`, `rts.gunship`, `rts.swarmling`, `rts.behemoth`, `rts.spitter`, `rts.hive`, `rts.asteroid`, `rts.crystal`, `rts.turret`, `rts.depot`, `rts.outpost`, `rts.shipyard` |
| Undercity (dungeon crawler) | `arpg.hero`, `arpg.hollow`, `arpg.skitter`, `arpg.wisp`, `arpg.golem`, `arpg.warden` |

## Try it with the example
`example-ship.glb` in this folder is a tiny test starship (24 triangles, four materials, a glowing engine). Put
`"arpg.hero": "example-ship.glb"` in `models.json`, push, and the dungeon crawler's hero becomes the ship.

## Checking a model
Open the site with the browser's developer console (F12). If a model can't be used you'll see a `[models]` message saying
why (file missing, not a `.glb`, compressed), and the game keeps the built-in character. When a model is simplified
you'll see how many triangles it went from and to.
