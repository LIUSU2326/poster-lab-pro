# DESKTOP_TESTING.md

## Purpose

This is the local desktop test runbook for the current MVP workbench. It verifies the route-backed Next.js app and the safe Poster production chain before any live image provider is enabled.

## 1.0 Beta Identity

- Visible version: `1.1.0-rc.3`
- Desktop bundle hint: `release/mac/Poster Lab Pro.app`
- Main branch: `main`
- Desktop Test Path still starts with static checks before any live provider call.

## Safe Local Order

1. Install dependencies if needed:
   - `npm install`
2. Run contract and regression checks:
   - `npm run check`
3. Verify the first production chain:
   - `npm run poster-chain:check`
4. Verify the Next build:
   - `npm run build:next`
5. Launch the workbench:
   - `npm run dev:next`
6. Open the local Next URL shown by the terminal, normally:
   - `http://localhost:3000`

## Electron Packaging

Use this after the browser and `desktop:dev` shell are acceptable:

1. Build the standalone Next payload and macOS app:
   - `npm run desktop:pack:mac`
2. Open the generated app:
   - `release/mac/Poster Lab Pro.app`
3. Confirm the app opens without manually running `npm run dev:next`.
4. Keep live provider generation manual and opt-in.

## What To Inspect In The Browser

- The workbench loads without runtime errors.
- Left production config, central scheme/result board, right inspector rail, and bottom task bar render correctly.
- Theme switch still works.
- Provider/API Key settings UI remains masked and does not make live requests.
- Generate actions in local mode stay mock-safe unless a future task explicitly enables live providers.
- No overlap or overflow at `1440`, `1024`, `768`, and `375px`.

## Current Acceptance Path

- Poster mode is the first local MVP acceptance path.
- `npm run poster-chain:check` verifies:
  - workspace load
  - image prompt package creation
  - provider request mapping
  - queue plan creation
  - queue run
  - stored result creation
  - result download descriptor resolution

## Not Covered Yet

- Real OpenAI, Replicate, ComfyUI, or Custom HTTP image generation.
- Signed installer, auto-update, crash reporting, or production release channel.
- Cloud result storage or signed URLs.
- Fully productized result history, rerun, and recovery flows.
- Automated live-provider image tests.

## Live Provider Rule

Live provider tests are opt-in only. Do not add credentials, environment-variable loading, real network calls, or quota-consuming smoke tests to the default local command path.
