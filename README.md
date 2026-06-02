# Poster Lab Pro

Poster Lab Pro is a local creative workbench for game marketing assets. The current beta focuses on AI-assisted poster, icon, logo, announcement, and collaboration visual generation with uploaded assets used as visual references instead of sticker overlays.

## Current Beta

- Visible version: `1.1.0-beta.6`
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

## Live Generation Safety

Real provider image generation is manual and opt-in. It requires saved provider credentials, a successful provider connection check, enabled live safety gate confirmations, accepted cost cap, and local result storage readiness. Default automated checks use fake transports and must not spend provider credits.

## Manual QA

- Poster QA: `POSTER_QA.md`
- Desktop Test Path: `DESKTOP_TESTING.md`
- Regression notes: `TESTING.md`
- Roadmap and remaining risks: `ROADMAP.md`
