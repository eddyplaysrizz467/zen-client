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

Open it from this folder:

`C:\Users\Admin\Documents\Codex\2026-04-20-hi-chat-gpt-can-you-please`

The easiest way is:

- double-click `Zen Client.bat`

You can also run it in PowerShell:

```powershell
npm start
```

## Notes

- Aero Client (old) stored its state in `%APPDATA%\AeroClient\launcher-state.json`
- Zen Client stores its state in `%APPDATA%\ZenClient\launcher-state.json` (and migrates Aero state once if present)
- Fabric and Quilt are installed by running their official installer jars from the JavaScript app
- If Minecraft still does not launch, read the built-in log area inside Zen Client first
