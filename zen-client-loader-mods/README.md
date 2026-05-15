# Zen Client loader mod bundles

This folder is for loader-specific Zen Client in-game mod jars that are built separately from the current Fabric Loom project.

The release builder scans these folders:

- `fabric`
- `quilt`
- `forge`
- `neoforge`

Drop a jar into the matching loader folder and, optionally, add a JSON file with the same base name to describe compatibility:

```json
{
  "minecraftVersion": "1.21.11",
  "minecraftVersionRange": ">=1.21 <=1.21.99",
  "targetName": "zen-client-neoforge.jar",
  "requiredMods": [],
  "notes": "NeoForge Zen Client bundle."
}
```

When present, these jars replace the generated fallback bundle for that loader/version in `bundled-mods/zen-client-bundles.json`.
