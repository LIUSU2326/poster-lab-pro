# RELEASE_CHECKLIST.md

## Current Candidate

- Version: `1.1.0-beta.1`
- Branch: `main`
- Desktop bundle: `release/mac/Poster Lab Pro.app`
- Local desktop test app: `/Users/liusu/Desktop/Poster Lab Pro.app`
- Desktop Test Path: `DESKTOP_TESTING.md`

## Release Candidate Gate

Run these before promoting a build:

1. `npm run check`
2. `npm run release-candidate:check`
3. `npm run desktop:pack:mac`
4. Replace `/Users/liusu/Desktop/Poster Lab Pro.app` with `release/mac/Poster Lab Pro.app`.
5. Verify `CFBundleShortVersionString` matches the current version.
6. Launch the desktop app and verify `http://127.0.0.1:3000` returns the workbench HTML.
7. Verify the top bar shows the version and desktop bundle path.
8. Verify settings shows provider setup order, connection test, live safety gate, estimated cost, and accepted cost cap.

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
- Signed installer, auto-update, crash reporting, and a production release channel are not part of this local RC gate.
