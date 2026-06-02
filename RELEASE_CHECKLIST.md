# RELEASE_CHECKLIST.md

## Current Candidate

- Version: `1.1.0-rc.3`
- Branch: `main`
- Desktop bundle: `release/mac/Poster Lab Pro.app`
- Local desktop test app: `/Users/liusu/Desktop/Poster Lab Pro.app`
- Desktop Test Path: `DESKTOP_TESTING.md`

## Release Candidate Gate

Run these before promoting a build:

1. `npm run check`
2. `npm run release-candidate:check`
3. `npm run user-test-readiness:check`
4. `npm run multimode-acceptance:check`
5. `npm run desktop:pack:mac`
6. Replace `/Users/liusu/Desktop/Poster Lab Pro.app` with `release/mac/Poster Lab Pro.app`.
7. Verify `CFBundleShortVersionString` matches the current version.
8. Launch the desktop app and verify `http://127.0.0.1:3000` returns the workbench HTML.
9. Verify the top bar shows the version and desktop bundle path.
10. Verify settings shows provider setup order, connection test, live safety gate, estimated cost, and accepted cost cap.
11. Use `USER_TESTING.md` and `MULTIMODE_ACCEPTANCE.md` for the manual user trial.

## Manual Live Generation Gate

Live provider calls remain opt-in:

- Saved encrypted provider credential is required.
- Connection test must pass.
- Live safety gate must be enabled.
- User must confirm live run, provider cost responsibility, external-provider execution, and result storage.
- Accepted cost cap must be greater than or equal to estimated cost.
- Default automated checks must not spend provider credits.

## 1.0 RC Acceptance

- Project creation, project brief editing, asset upload, asset deletion, mode switching, scheme generation, image rendering, result preview, archive export, failed-image retry, and settings access are usable from the desktop app.
- Poster, Icon, Logo, Announcement, and Collab all use AI integrated redraw as the default asset path.
- Local overlay is a fallback only when explicitly forced or when a failure condition is recorded.
- The app version, branch, and desktop bundle path are visible enough to avoid old-App confusion.
- README, TESTING, DESKTOP_TESTING, ROADMAP, DECISIONS, and this checklist agree on the current candidate.

## Known Non-Blocking Watch Items

- Icon mode now applies local zero-cost corner repair when the result audit detects a rounded-mask risk; still review 64px readability manually.
- Logo spelling is model-dependent; Logo Text Strategy now prefers exact short wordmarks only when reliable and otherwise reserves a blank wordmark plate for later vector/text refinement.
- Announcement Copy Safety Strategy now reserves editable title/body copy-safe fields and uses blank fields when exact text is risky.
- Collab Brand Safety Strategy now reserves blank partner brand plates unless a partner `brandLogo` is uploaded.
- Result Quality Audit now refreshes stale result metadata from local stored image files so older results can pick up current Poster/Icon/Logo/Announcement/Collab review findings without provider spend.
- Brief generation is now mode-aware so Icon, Logo, Announcement, and Collab no longer inherit Poster KV architecture prompts.
- Icon Result Quality Audit now catches white-corner plus dark rounded-edge app containers and triggers the local edge repair.
- Logo copy-safe blank wordmark mode now redacts high-risk project title text, wordmark fragments, translated category terms, and readable-lettering cues from provider prompts/assets; Google withholds readable Logo inline references in this mode.
- Packaged beta.4 live validation passed for Logo (`job-logo-project-pizza-kitchen-beta4-logo-clean-redaction-mpwt2nz8`) and Announcement (`job-announcement-project-pizza-kitchen-beta4-announcement-copy-safe-mpwt6kqf`).
- Beta.5 Collab live validation passed with synthetic partner asset `asset-collab-star-cream-partner-beta5` and job `job-collab-project-pizza-kitchen-beta5-collab-star-cream-mpwv1j6s`; the expected missing partner `brandLogo` audit stayed at review with a blank partner brand plate.
- Beta.6 adds `npm run multimode-regression:check` as a zero-cost cross-mode gate for Poster, Icon, Logo, Announcement, and Collab prompt/provider requests; it also keeps `Mode Guardrails` preserved when long prompt packages are compacted.
- RC1 adds `npm run ux-regression:check` as a zero-cost UX/reliability gate for mode navigation, blocked live generation, result management, settings safety, project library, queue failure recovery, and destructive-action confirmation.
- RC2 adds a User Test Readiness Gate with `USER_TESTING.md` and `npm run user-test-readiness:check`; manual acceptance should run only 1-2 real generations per mode when needed.
- RC3 adds `MULTIMODE_ACCEPTANCE.md`, `npm run multimode-acceptance:check`, and the synthetic Collab partner fixture `public/mock-assets/collab-partner-sundae-ranger.svg`; this keeps no-partner Collab testing explicit and limits the RC pass to max 1 real generation per mode unless one focused rerun is needed.
- Signed installer, auto-update, crash reporting, and a production release channel are not part of this local RC gate.
