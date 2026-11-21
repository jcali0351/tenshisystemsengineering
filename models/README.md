# Your own 3D characters (Blender → the games)

Every character in the site's games can be replaced by a model you make in Blender. No coding: export, drop the file
here, write its name in `models.json`, push.

## 1. Make the model in Blender
- **Face the front towards Blender's −Y** (the way the *Front* view, numpad 1, looks at it). That becomes "forward" in the games.
- **Stand it on the ground** at the origin, roughly centred. Size doesn't matter: the games scale it to fit.
- **Keep it low-poly: up to about 1,500 triangles.** The games draw many characters at once in the browser.
  Too many? Add a *Decimate* modifier and lower the ratio until the triangle count (Statistics overlay) is under 1,500.
- **Colour it with materials** (Principled BSDF *Base Color*). Each material's colour is used and lit by the game's
  lights. Textures and image maps are ignored, so use separate materials for separate colours.
- **Glowing parts** (eyes, engines, visors): give the material an *Emission* colour. Those faces stay bright.
- Apply transforms before exporting (*Object › Apply › All Transforms*).

## 2. Export it
*File › Export › glTF 2.0 (.glb/.gltf)*, then:
- **Format: glTF Binary (.glb)**
- Include: *Selected Objects* (select your model first), Transform: *+Y Up* (the default)
- Animation can be left on or off: animations and rigs aren't used yet (a model moves, turns, bobs and leans as one piece).

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
| Station Defense (space strategy) | `rts.station`, `rts.miner`, `rts.interceptor`, `rts.gunship`, `rts.swarmling`, `rts.behemoth`, `rts.spitter`, `rts.hive`, `rts.asteroid`, `rts.crystal` |
| Undercity (dungeon crawler) | `arpg.hero`, `arpg.hollow`, `arpg.skitter`, `arpg.wisp`, `arpg.golem`, `arpg.warden` |

## Try it with the example
`example-ship.glb` in this folder is a tiny test starship (24 triangles, four materials, a glowing engine). Put
`"arpg.hero": "example-ship.glb"` in `models.json`, push, and the dungeon crawler's hero becomes the ship.

## Checking a model
Open the site with the browser's developer console (F12). If a model can't be used you'll see a `[models]` message saying
why (file missing, not a `.glb`, too many triangles), and the game keeps the built-in character.
