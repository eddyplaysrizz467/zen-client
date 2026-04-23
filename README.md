# Zen Client

Zen Client is a JavaScript + Electron Minecraft launcher.

## What it has

- Vanilla, Fabric, and Quilt launch types
- Microsoft sign-in popup through the JavaScript app
- Saved offline accounts
- Saved launcher settings
- A zen black/white UI
- Settings tab with background presets + Discord Rich Presence controls
- Skins tab to upload a skin for Microsoft accounts
- Optional Zen "main menu" resource pack installer

## How to open it

### For normal use (recommended)

Download and run the Windows installer from GitHub Releases:

- Go to this repo's Releases page
- Download `Zen Client Setup <version>.exe`
- Run the installer, then open Zen Client from the Start Menu or Desktop shortcut

Note: the installer includes the app. Minecraft game files (and loader files like Fabric/Quilt) are downloaded when you launch/install them inside the app.

### For development

From the repo folder, you can run it with:

```powershell
npm start
```

## Notes

- Aero Client (old) stored its state in `%APPDATA%\AeroClient\launcher-state.json`
- Zen Client stores its state in `%APPDATA%\ZenClient\launcher-state.json` (and migrates Aero state once if present)
- Fabric and Quilt are installed by running their official installer jars from the JavaScript app
- If Minecraft still does not launch, read the built-in log area inside Zen Client first
