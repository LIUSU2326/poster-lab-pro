# MULTIMODE_ACCEPTANCE.md

## Poster Lab Pro 1.1.0-rc.3 Multimode Acceptance Matrix

This matrix defines the 1.1 release-candidate acceptance pass for Poster, Icon, Logo, Announcement, and Collab. It is meant to keep real generation bounded while preserving each mode's distinct visual goal.

## Test App

- Version: `1.1.0-rc.3`
- Desktop Test Path: `DESKTOP_TESTING.md`
- Release bundle: `release/mac/Poster Lab Pro.app`
- Local desktop app: `/Users/liusu/Desktop/Poster Lab Pro.app`

## Cost Rule

- Default automated checks must not spend provider credits.
- Real generation remains manual and opt-in through the live safety gate.
- Run max 1 real generation per mode for this RC pass unless a clear blocking bug requires one focused rerun.
- Stop once pass/fail evidence is obvious; do not keep tuning prompts by taste.

## Synthetic Collab Partner Asset

When the user does not have partner IP material, use the committed local fixture:

- File: `public/mock-assets/collab-partner-sundae-ranger.svg`
- Role: `collabCharacter`
- Label: `Synthetic collab partner character`
- Identity: fictional sundae ranger mascot with a star topper, pastel dessert body, separate arms, and no readable text.
- Brand rule: this fixture is not a partner logo. If no partner `brandLogo` is uploaded, Collab must use a blank partner brand plate, neutral emblem, or copy-safe lockup area.

This asset is only for testing the true uploaded-reference path. It must not replace future real partner assets, and it must not be used as BOSS, Logo, style reference, or generic decoration.

## Mode Matrix

Poster:

- Required test assets: game character, BOSS/key subject, game logo; optional style or composition reference.
- Pass: uploaded subjects are redrawn into one cinematic scene with action, scale, contact shadows, occlusion, lighting, environmental reaction, one logo treatment, and integrated slogan/copy treatment.
- Fail: sticker-like pasted subjects, tiny hero, weak BOSS threat, repeated logo, garbled fake logo, PPT-like slogan, or local overlay as the default finished path.

Icon:

- Required test assets: one subject reference or one character/prop/logo used as the single icon subject.
- Pass: 1:1 square, no text, one dominant full-bleed subject, readable at 64px, strong silhouette, minimal background, no rounded OS mask.
- Fail: poster scene, multiple subjects, copied static pose, text, logo lettering, white border, dark rounded app container, or too much background detail.

Logo:

- Required test assets: optional uploaded game logo or visual motif reference.
- Pass: logo/mark system is the primary output on a clean background; complex wordmarks become a polished blank wordmark plate or emblem instead of partial letters.
- Fail: poster battle scene, invented readable words, partial project title, pseudo-lettering, copied malformed logo text, or character art dominating the mark.

Announcement:

- Required test inputs: announcement title; optional character, logo, UI/layout, or background reference.
- Pass: readable title/body copy-safe panel, calm UI/event hierarchy, supporting character placement, no effect covering the copy area.
- Fail: garbled operational text, poster-like combat scene, characters covering the message area, no clear editable text zone, or fake repeated logo text.

Collab:

- Required test assets: game character, collabCharacter, game logo. Partner brandLogo is optional.
- Synthetic test path: use `public/mock-assets/collab-partner-sundae-ranger.svg` as `collabCharacter` when no real partner exists.
- Pass: game character and partner character stay separate, share one interaction story, retain independent identity cues, and sit in unified lighting/materials. Uploaded logos or blank brand plates remain separate.
- Fail: game and partner fuse into a hybrid character, one side disappears, BOSS/prop is reused as partner, fake partner brand text appears without uploaded partner `brandLogo`, or two logos are pasted side by side without scene logic.

## Review Evidence

For each accepted real result, record:

- App version shown in the top bar.
- Mode and uploaded asset roles.
- Scheme/result id.
- Provider/model.
- Result Quality Audit status and findings.
- One sentence explaining why the result passed or failed the mode matrix.

## Required Local Gates

- `npm run multimode-regression:check`
- `npm run multimode-acceptance:check`
- `npm run result-quality-audit:check`
- `npm run user-test-readiness:check`
- `npm run ux-regression:check`
- `npm run release-candidate:check`
- `npm run check`
