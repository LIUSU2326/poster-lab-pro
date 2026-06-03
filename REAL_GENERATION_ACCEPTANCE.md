# REAL_GENERATION_ACCEPTANCE.md

## Poster Lab Pro 1.1.0-rc.4 Controlled Real Acceptance Log

This file tracks the real-generation acceptance state before promoting 1.1. It keeps paid provider runs intentional, bounded, and reviewable.

## Current App

- Version: `1.1.0-rc.4`
- Desktop Test Path: `DESKTOP_TESTING.md`
- Desktop app path: `/Users/liusu/Desktop/Poster Lab Pro.app`
- Release bundle path: `release/mac/Poster Lab Pro.app`
- Local service URL: `http://127.0.0.1:3000`
- Acceptance matrix: `MULTIMODE_ACCEPTANCE.md`
- User test guide: `USER_TESTING.md`

## Cost And Safety Rule

- Default automated checks must not spend provider credits.
- Fresh real generation is manual and opt-in only.
- The App live safety gate must be enabled before any provider call.
- Required confirmations: live run, provider cost, external provider, and local result storage.
- Accepted cost cap must be greater than or equal to the estimated run cost.
- rc.4 allows max 1 fresh real generation per mode unless one clear blocking bug requires a focused rerun.
- Never use a direct API/script path to bypass the App live safety gate.

## Workspace Readiness Snapshot

Observed local service state on 2026-06-03:

- Workspace: `workspace-pizza-kitchen`
- Revision observed from local API: `283`
- Active provider: Google
- Provider status: `success`
- Saved provider credential: present as masked Google credential only
- Uploaded/test asset roles present: `gameCharacter`, `prop` BOSS/key subject, `gameLogo`, `compositionReference`, `collabCharacter`
- Synthetic Collab partner fixture available: `public/mock-assets/collab-partner-sundae-ranger.svg`
- Existing stored result modes present: Poster, Icon, Logo, Announcement, Collab

This proves the rc.4 workspace is ready for a bounded manual real-generation pass, but it does not by itself prove fresh rc.4 visual acceptance.

## Baseline Result Evidence

Existing stored results provide regression context:

- Poster baseline: `result-job-poster-project-pizza-kitchen-mpvh0k08-1hiue-image-1-1`
- Icon baseline: `result-job-icon-project-pizza-kitchen-beta3-icon-edge-repair-mpwqnq3m-image-1-1`
- Logo baseline: `result-job-logo-project-pizza-kitchen-beta4-logo-clean-redaction-mpwt2nz8-image-1-1`
- Announcement baseline: `result-job-announcement-project-pizza-kitchen-beta4-announcement-copy-safe-mpwt6kqf-image-1-1`
- Collab baseline: `result-job-collab-project-pizza-kitchen-beta5-collab-star-cream-mpwv1j6s-image-1-1`

Baseline acceptance is useful for regression comparison, but the final stable promotion should still prefer one fresh rc.4 run for any mode whose quality remains uncertain.

## Fresh rc.4 Acceptance Status

Poster:

- Fresh rc.4 run: pending live safety gate.
- Acceptance source: `MULTIMODE_ACCEPTANCE.md`.
- Must check: integrated redraw, BOSS threat, one logo treatment, scene-linked slogan/copy, no sticker overlay.

Icon:

- Fresh rc.4 run: pending live safety gate.
- Acceptance source: `MULTIMODE_ACCEPTANCE.md`.
- Must check: 1:1, no text, one dominant subject, 64px readability, no rounded OS mask.

Logo:

- Fresh rc.4 run: pending live safety gate.
- Acceptance source: `MULTIMODE_ACCEPTANCE.md`.
- Must check: mark/wordmark system primary, copy-safe blank wordmark for complex text, no fake partial letters.

Announcement:

- Fresh rc.4 run: pending live safety gate.
- Acceptance source: `MULTIMODE_ACCEPTANCE.md`.
- Must check: readable copy-safe panel, no garbled operational text, supporting art does not cover the message.

Collab:

- Fresh rc.4 run: pending live safety gate.
- Acceptance source: `MULTIMODE_ACCEPTANCE.md`.
- Test partner: use `public/mock-assets/collab-partner-sundae-ranger.svg` if no real partner material exists.
- Must check: game character and partner character stay separate, no hybrid identity, missing partner `brandLogo` becomes blank partner brand plate.

## Completion Rule For 1.1.0 Stable

Before marking 1.1.0 stable:

- Either complete one bounded fresh real run for each mode, or explicitly defer a mode with a written reason and keep it as a known stable risk.
- Record provider/model, result id, Result Quality Audit findings, and one visual pass/fail sentence for every accepted result.
- Fix only blocking failures: paid-run blockers, missing uploaded references, fake text, sticker-like asset use, unreadable icon, merged Collab identities, or broken result storage.
- Do not continue prompt tuning after the pass/fail evidence is clear.

## Required Local Gates

- `npm run real-acceptance:check`
- `npm run multimode-acceptance:check`
- `npm run multimode-regression:check`
- `npm run result-quality-audit:check`
- `npm run user-test-readiness:check`
- `npm run ux-regression:check`
- `npm run release-candidate:check`
- `npm run check`
