# REAL_GENERATION_ACCEPTANCE.md

## Poster Lab Pro 1.1.0-rc.7 Controlled Real Acceptance Log

This file tracks the real-generation acceptance state before promoting 1.1. It keeps paid provider runs intentional, bounded, and reviewable.

## Current App

- Version: `1.1.0-rc.7`
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
- rc.7 allows max 1 fresh real generation per mode, focused on Poster/Collab/Announcement first, unless one clear blocking bug requires a focused rerun.
- Never use a direct API/script path to bypass the App live safety gate.

## Workspace Readiness Snapshot

Observed local service state on 2026-06-04:

- Workspace: `workspace-pizza-kitchen`
- Revision observed from local API: `358` before the latest live run
- Active provider: Google in the UI snapshot; Agnes is also saved and usable for all-core concept/image route tests
- Provider status: Google `success`, Agnes `success`
- Saved provider credential: present as masked Google and Agnes credentials
- Uploaded/test asset roles present: `gameCharacter`, `prop` BOSS/key subject, `gameLogo`, `compositionReference`, `collabCharacter`
- Synthetic Collab partner fixture available: `public/mock-assets/collab-partner-sundae-ranger.svg`
- Existing stored result modes present: Poster, Icon, Logo, Announcement, Collab

This proves the rc.5 workspace is ready for a bounded manual real-generation pass, but it does not by itself prove fresh rc.5 visual acceptance.

## Baseline Result Evidence

Existing stored results provide regression context:

- Poster baseline: `result-job-poster-project-pizza-kitchen-mpvh0k08-1hiue-image-1-1`
- Icon baseline: `result-job-icon-project-pizza-kitchen-beta3-icon-edge-repair-mpwqnq3m-image-1-1`
- Logo baseline: `result-job-logo-project-pizza-kitchen-beta4-logo-clean-redaction-mpwt2nz8-image-1-1`
- Announcement baseline: `result-job-announcement-project-pizza-kitchen-beta4-announcement-copy-safe-mpwt6kqf-image-1-1`
- Collab baseline: `result-job-collab-project-pizza-kitchen-beta5-collab-star-cream-mpwv1j6s-image-1-1`

Baseline acceptance is useful for regression comparison, but the final stable promotion should still prefer one fresh rc.5 run for any mode whose quality remains uncertain.

## Fresh rc.5 Acceptance Status

## Fresh rc.7 Quality Sprint Status

Code-level prompt/request changes prepared before the next bounded visual run:

- Poster: added `KV ACTION MINI-BRIEF` and compressed-provider ordering so uploaded hero, uploaded BOSS/key threat, single logo/copy-safe area, shared ground plane, contact shadows, foreground occlusion, rim light, and VFX remain front-loaded.
- Collab: added `Partner-first co-star lock`, `Two-character audit`, and shared-scene integration rules so the uploaded collabCharacter cannot be omitted, hidden, merged, or reduced to a logo-only/mascot presence.
- Announcement: retained the large blank editable copy area strategy as the Agnes-friendly mode; no new risky text-rendering requirement was added.
- Fresh visual run status: pending App live safety gate. Use all-Agnes only for free provider-chain testing, and record Poster/Collab as quality-risk unless the actual image visibly satisfies the acceptance matrix.

Agnes provider integration smoke, 2026-06-03:

- Final App queue run: `job-poster-project-pizza-kitchen-agnes-localfile-mpy6ti26`
- Provider/model: Agnes AI `agnes-image-2.1-flash`
- Mode: Poster, existing scheme `generated-poster-mpy3pnpa-4igtx-1`, `768x432`, 1 image
- Safety path: local App queue API with live execution enabled, provider-cost/external-provider/result-storage confirmations true, accepted cap `1`
- Result id: `result-job-poster-project-pizza-kitchen-agnes-localfile-mpy6ti26-image-1-1`
- Local result file: `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-poster-project-pizza-kitchen-agnes-localfile-mpy6ti26-image-1-1/poster-generated-poster-mpy3pnpa-4igtx-1-768x432-1.png`
- Storage verdict: pass. Agnes returned a remote URL; the adapter now accepts nullable `b64_json` / `revised_prompt`, downloads the provider URL, persists a local PNG, and marks `providerAsset.dataUrlPersisted: true`.
- Result Quality Audit: pass for dimensions/aspect ratio/pixel readability; review findings remain for reference integration, logo treatment, and slogan/copy area.
- Visual verdict: fail for Poster quality. The generated image uses the uploaded character and logo, but it collapses into a close-up character/logo composition on black background. It lacks the intended kitchen battle set-piece, BOSS threat, foreground/midground/background staging, slogan treatment, and cinematic environmental interaction. Treat this as provider-chain smoke success, not as KV quality acceptance.

Agnes all-core multimode pass, 2026-06-04:

- Route: all tested queue plans used `providerId: agnes` with concept `agnes-2.0-flash` and image `agnes-image-2.1-flash`.
- Safety path: local App queue API with live execution enabled, provider-cost/external-provider/result-storage confirmations true, accepted cap `999`.
- Capability gate result: pass for Agnes concept/image generation; unsupported providers are blocked before queue creation.
- Poster scheme generation job: `job-poster-project-pizza-kitchen-agnes-scheme-diversity-mpytyenf`
- Scheme generation verdict: pass. Agnes generated 4 visibly different Poster schemes: `熔炉破门：火焰与酱料的决断`, `荒野追击：奶酪桥上的生死时速`, `厨房围城：最后防线`, and `巅峰对决：酱料冲击波`. Each contained camera/lighting/action/foreground-midground-background guidance and a slogan.
- Poster image job: `job-poster-project-pizza-kitchen-agnes-fresh-poster-mpytzx1d`
- Poster result id: `result-job-poster-project-pizza-kitchen-agnes-fresh-poster-mpytzx1d-image-1-1`
- Poster local result file: `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-poster-project-pizza-kitchen-agnes-fresh-poster-mpytzx1d-image-1-1/poster-generated-poster-agnes-diversity-qa-mpytyenf-1-1024x576-1.png`
- Poster Result Quality Audit: pass for dimensions/pixel contrast, with expected review items `poster-reference-integration-review`, `poster-logo-safe-treatment-review`, and `poster-slogan-copy-area-review`.
- Poster visual verdict: fail for KV quality. The output used the uploaded hero in a large foreground pose but still read as a character pasted over a game-level background. BOSS threat, Logo treatment, and slogan/copy integration were effectively missing.
- Icon final job: `job-icon-project-pizza-kitchen-agnes-final-icon-softrepair-mpyvbpc2`
- Icon result id: `result-job-icon-project-pizza-kitchen-agnes-final-icon-softrepair-mpyvbpc2-image-1-1`
- Icon local result file: `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-icon-project-pizza-kitchen-agnes-final-icon-softrepair-mpyvbpc2-image-1-1/icon-generated-icon-agnes-full-icon-mpybee7t-1-512x512-1.png`
- Icon Result Quality Audit: pass. The result triggered local `iconCanvasEdgeRepair` with reason `edgeTextMarkRisk`, removing generated reference-sheet edge labels.
- Icon visual verdict: pass with quality note. The final icon is text-free and readable, but the fallback repair creates a tight soft-cropped character portrait; future quality work should reduce the need for repair by improving provider prompt adherence.
- Logo job: `job-logo-project-pizza-kitchen-agnes-fresh-logo-mpytzx1d`
- Logo result id: `result-job-logo-project-pizza-kitchen-agnes-fresh-logo-mpytzx1d-image-1-1`
- Logo local result file: `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-logo-project-pizza-kitchen-agnes-fresh-logo-mpytzx1d-image-1-1/logo-generated-logo-agnes-full-logo-mpybg8x3-1-768x768-1.png`
- Logo Result Quality Audit: review with expected `logo-text-accuracy-review` and `logo-copy-safe-wordmark-fallback`.
- Logo visual verdict: pass. Agnes produced a polished blank wordmark plaque/emblem without fake readable text, suitable for later exact vector/text refinement.
- Announcement job: `job-announcement-project-pizza-kitchen-agnes-fresh-announcement-mpytzx1d`
- Announcement result id: `result-job-announcement-project-pizza-kitchen-agnes-fresh-announcement-mpytzx1d-image-1-1`
- Announcement local result file: `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-announcement-project-pizza-kitchen-agnes-fresh-announcement-mpytzx1d-image-1-1/announcement-generated-announcement-agnes-full-announcement-mpybh3zu-1-1024x576-1.png`
- Announcement Result Quality Audit: pass with info `announcement-copy-safe-review`.
- Announcement visual verdict: pass. The output preserved a large calm editable panel and did not generate garbled operational text.
- Collab final job: `job-collab-project-pizza-kitchen-agnes-final-collab-partnerfirst-mpyvvhyi`
- Collab result id: `result-job-collab-project-pizza-kitchen-agnes-final-collab-partnerfirst-mpyvvhyi-image-1-1`
- Collab local result file: `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-collab-project-pizza-kitchen-agnes-final-collab-partnerfirst-mpyvvhyi-image-1-1/collab-generated-collab-agnes-full-collab-mpybidt6-1-1024x576-1.png`
- Collab Result Quality Audit: review with expected `collab-missing-partner-brand-logo` and `collab-blank-partner-brand-plate`.
- Collab visual verdict: fail for collaboration quality. Fake logo text was removed by copy-safe prompt/routing changes, but Agnes still demoted or omitted the uploaded `collabCharacter` instead of making it an equal co-star. Keep Collab as a known quality blocker for 1.1 stable.

Agnes Poster quality retest, 2026-06-04:

- Provider/model: Agnes AI `agnes-image-2.1-flash`; route used saved Agnes API key through the local App manual live queue.
- Safety path: live execution enabled with provider-cost/external-provider/result-storage confirmations true and accepted cap `1`.
- Prompt/request changes validated before retest: `Default pipeline: AI integrated redraw`, `Selected Scheme`, `Non-Negotiable Poster Visual Contract`, low-text blank-plate rules, exact hero/BOSS roster locks, and Agnes-specific raw reference filtering.
- Round 1 job: `job-poster-project-pizza-kitchen-agnes-poster-quality-1780546154602`; result `result-job-poster-project-pizza-kitchen-agnes-poster-quality-1780546154602-image-1-1`; file `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-poster-project-pizza-kitchen-agnes-poster-quality-1780546154602-image-1-1/poster-generated-poster-mpy3pnpa-4igtx-1-1920x1080-1.png`. Visual verdict: fail. Better scene density, but generated fake/gibberish text, duplicate chef characters, and weak BOSS hierarchy.
- Round 2 job: `job-poster-project-pizza-kitchen-agnes-poster-quality-r2-1780547423468`; result `result-job-poster-project-pizza-kitchen-agnes-poster-quality-r2-1780547423468-image-1-1`; file `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-poster-project-pizza-kitchen-agnes-poster-quality-r2-1780547423468-image-1-1/poster-generated-poster-mpy3pnpa-4igtx-1-1920x1080-1.png`. Visual verdict: fail. Fake title text and duplicate characters persisted.
- Round 3 job: `job-poster-project-pizza-kitchen-agnes-poster-quality-r3-1780548260393`; result `result-job-poster-project-pizza-kitchen-agnes-poster-quality-r3-1780548260393-image-1-1`; file `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-poster-project-pizza-kitchen-agnes-poster-quality-r3-1780548260393-image-1-1/poster-generated-poster-mpy3pnpa-4igtx-1-1920x1080-1.png`. Visual verdict: fail. Text was removed, but the image became cartoon stickers over a photorealistic crowd/knight scene with extra unuploaded characters.
- Round 4 job: `job-poster-project-pizza-kitchen-agnes-poster-quality-r4-1780549146678`; result `result-job-poster-project-pizza-kitchen-agnes-poster-quality-r4-1780549146678-image-1-1`; file `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-poster-project-pizza-kitchen-agnes-poster-quality-r4-1780549146678-image-1-1/poster-generated-poster-mpy3pnpa-4igtx-1-1920x1080-1.png`. Visual verdict: fail. Style reference reduced photorealism, but Agnes copied reference-like split layout, left the uploaded hero as a pasted cutout, generated visible slogan text, and duplicated small chef characters.
- Current conclusion: Agnes is useful as a free provider-chain and storage smoke test, and remains acceptable for simpler copy-safe modes such as Logo/Announcement. It is not yet visually accepted for Poster multi-reference cinematic KV quality. The UI should treat all-Agnes Poster/Collab as core-capability available but quality-risk requiring manual review, not as stable KV acceptance.

Agnes Collab retest, 2026-06-04:

- Provider/model: Agnes AI `agnes-image-2.1-flash`; local App manual live queue with saved Agnes API key.
- Job: `job-collab-project-pizza-kitchen-agnes-collab-quality-r2-1780550849247`
- Result id: `result-job-collab-project-pizza-kitchen-agnes-collab-quality-r2-1780550849247-image-1-1`
- Local result file: `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-collab-project-pizza-kitchen-agnes-collab-quality-r2-1780550849247-image-1-1/collab-generated-collab-agnes-full-collab-mpybidt6-1-1920x1080-1.png`
- Result Quality Audit: review.
- Visual verdict: fail for collaboration quality. The game character and collab partner are separate and no fake readable logo text appears, but both read as sticker-like cutouts over a photorealistic beach/table background. The image lacks a unified game art style, shared lighting/material integration, and a meaningful collaboration story touchpoint. Keep Agnes Collab as quality-risk requiring manual review.

Poster:

- Fresh rc.5 run: attempted through Agnes rounds above; visual acceptance still failing for Poster KV quality.
- Acceptance source: `MULTIMODE_ACCEPTANCE.md`.
- Must check: integrated redraw, BOSS threat, one logo treatment, scene-linked slogan/copy, no sticker overlay.

Icon:

- Fresh rc.5 run: `job-icon-project-pizza-kitchen-agnes-final-icon-softrepair-mpyvbpc2`
- Provider/model: Agnes AI `agnes-image-2.1-flash`
- Route: all-core Agnes image render; scheme `generated-icon-agnes-full-icon-mpybee7t-1`; `512x512`, 1 image.
- Safety path: local App queue API with live execution enabled, provider-cost/external-provider/result-storage confirmations true and accepted cap `999`.
- Result id: `result-job-icon-project-pizza-kitchen-agnes-final-icon-softrepair-mpyvbpc2-image-1-1`
- Local result file: `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-icon-project-pizza-kitchen-agnes-final-icon-softrepair-mpyvbpc2-image-1-1/icon-generated-icon-agnes-full-icon-mpybee7t-1-512x512-1.png`
- Result Quality Audit: pass.
- Visual verdict: pass with quality note. The image is text-free and small-size readable, but it is a tight soft-cropped character portrait; future work should improve provider adherence so local edge repair is rarely needed.
- Acceptance source: `MULTIMODE_ACCEPTANCE.md`.
- Must check: 1:1, no text, one dominant subject, 64px readability, no white border or accidental padding. Rounded corners are acceptable when intentional.

Logo:

- Fresh rc.5 run: `job-logo-project-pizza-kitchen-agnes-fresh-logo-mpytzx1d`
- Provider/model: Agnes AI `agnes-image-2.1-flash`
- Route: all-core Agnes image render; scheme `generated-logo-agnes-full-logo-mpybg8x3-1`; `768x768`, 1 image.
- Safety path: local App queue API with live execution enabled, provider-cost/external-provider/result-storage confirmations true and accepted cap `999`.
- Result id: `result-job-logo-project-pizza-kitchen-agnes-fresh-logo-mpytzx1d-image-1-1`
- Local result file: `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-logo-project-pizza-kitchen-agnes-fresh-logo-mpytzx1d-image-1-1/logo-generated-logo-agnes-full-logo-mpybg8x3-1-768x768-1.png`
- Result Quality Audit: review with expected `logo-text-accuracy-review` and `logo-copy-safe-wordmark-fallback`.
- Visual verdict: pass. The output is a clean blank emblem/wordmark plate without fake readable letters, suitable for later exact text/vector refinement.
- Acceptance source: `MULTIMODE_ACCEPTANCE.md`.
- Must check: mark/wordmark system primary, copy-safe blank wordmark for complex text, no fake partial letters.

Announcement:

- Fresh rc.5 run: `job-announcement-project-pizza-kitchen-agnes-announcement-capgate-mpysz0c8`
- Provider/model: Agnes AI `agnes-image-2.1-flash`
- Route: all-core Agnes image render; `regenerateSchemes: false`; existing scheme `announcement-beta4-copy-safe-mpwt6kqf-1`; `1024x576`, 1 image
- Safety path: local App queue API with live execution enabled, provider-cost/external-provider/result-storage confirmations true, accepted cap `999`
- Result id: `result-job-announcement-project-pizza-kitchen-agnes-announcement-capgate-mpysz0c8-image-1-1`
- Local result file: `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-announcement-project-pizza-kitchen-agnes-announcement-capgate-mpysz0c8-image-1-1/announcement-announcement-beta4-copy-safe-mpwt6kqf-1-1024x576-1.png`
- Result Quality Audit: pass for storage/dimensions; info finding `announcement-copy-safe-review` only.
- Visual verdict: pass for announcement structure. The output is a polished parchment-style announcement card with a large blank editable copy area and no generated gibberish text. Quality note: it is visually generic fantasy and should get stronger Pizza Kitchen / food-world motifs in a later quality pass.
- Acceptance source: `MULTIMODE_ACCEPTANCE.md`.
- Must check: readable copy-safe panel, no garbled operational text, supporting art does not cover the message.

Collab:

- Fresh rc.5 run: `job-collab-project-pizza-kitchen-agnes-collab-quality-r2-1780550849247`
- Provider/model: Agnes AI `agnes-image-2.1-flash`
- Route: all-core Agnes image render; scheme `generated-collab-agnes-full-collab-mpybidt6-1`; `1920x1080`, 1 image.
- Safety path: local App queue API with live execution enabled, provider-cost/external-provider/result-storage confirmations true and accepted cap `1`.
- Result id: `result-job-collab-project-pizza-kitchen-agnes-collab-quality-r2-1780550849247-image-1-1`
- Local result file: `/Users/liusu/Library/Application Support/Poster Lab Pro/generated-results/workspaces/workspace-pizza-kitchen/results/result-job-collab-project-pizza-kitchen-agnes-collab-quality-r2-1780550849247-image-1-1/collab-generated-collab-agnes-full-collab-mpybidt6-1-1920x1080-1.png`
- Result Quality Audit: review with expected `collab-missing-partner-brand-logo` and `collab-blank-partner-brand-plate`.
- Visual verdict: fail for collaboration quality. The game character and partner character stay separate and no fake readable partner logo appears, but both still read as sticker-like cutouts over the scene. Keep Collab as an all-Agnes quality-risk mode requiring manual review or a stronger multi-reference image provider.
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
