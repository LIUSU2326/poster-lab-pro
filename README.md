# Poster Lab Pro

Poster Lab Pro is a local creative workbench for game marketing assets. The current stable release focuses on AI-assisted poster, icon, logo, announcement, and collaboration visual generation with uploaded assets used as visual references instead of sticker overlays.

## No User-Facing Live Generation Switch

The main workbench no longer shows a `真实生成` switch, manual verification control, version/path chip, or bundle-path hint in the header. Use `模型与 Key` for provider setup and run generation through the normal scheme/image workflow.

## Current Stable Release

- Visible version: `1.1.0`
- Main branch: `main`
- Desktop bundle hint: `release/mac/Poster Lab Pro.app`
- Local desktop test bundle can also be placed at `/Users/liusu/Desktop/Poster Lab Pro.app`.

## Start Locally

Install dependencies if needed:

```bash
npm install
```

Run the local Next workbench:

```bash
npm run dev:next
```

Open the local URL shown by the terminal, normally:

```text
http://localhost:3000
```

Run the full static and type regression suite:

```bash
npm run check
```

## Desktop Package

Build the macOS desktop bundle:

```bash
npm run desktop:pack:mac
```

The release bundle is generated under:

```text
release/mac/Poster Lab Pro.app
```

## Provider Execution

Provider image execution remains available through the normal app generation flow after credentials and connection checks are configured. Default automated checks use fake transports and must not spend provider credits.

## Manual QA

- Poster QA: `POSTER_QA.md`
- User Test Guide: `USER_TESTING.md`
- Multimode Acceptance Matrix: `MULTIMODE_ACCEPTANCE.md`
- Desktop Test Path: `DESKTOP_TESTING.md`
- Regression notes: `TESTING.md`
- Roadmap and remaining risks: `ROADMAP.md`
