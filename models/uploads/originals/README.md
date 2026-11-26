# Original uploads (not used by the site)

The full-size .glb files as uploaded in Game Studio. The games use the slimmed copies one folder up
(`models/models.json`), made on 2026-11-25 with gltf-transform: same mesh and node layout, only the base colour texture
kept (resized to 512 px, JPEG), normal / metal-roughness maps, skin and animations removed (tenshi-models.js reads
none of them and shrinks textures to 256 px anyway). 19.6 MB -> 1.5 MB (Satan, also used by the custom enemy, which was
the identical file) and 4.9 MB -> 0.7 MB (Lava Spider).

To use an original again, point its slot in models/models.json at `uploads/originals/<file>.glb`.
