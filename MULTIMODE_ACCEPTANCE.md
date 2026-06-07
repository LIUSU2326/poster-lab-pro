# MULTIMODE_ACCEPTANCE.md

## No User-Facing Live Generation Switch

This acceptance path must not require or restore a `真实生成` switch, `确认真实生成保护` action, manual verification control, or top-bar version/path metadata chips. Provider setup stays in the normal Model and API Key settings.

## Poster Lab Pro 1.1.0 Multimode Acceptance Matrix

This matrix defines the 1.1.0 stable acceptance pass for Poster, Icon, Logo, Announcement, and Collab. It keeps provider-spend testing bounded while preserving each mode's distinct visual goal.

## Test App

- Version: `1.1.0`
- Desktop Test Path: `DESKTOP_TESTING.md`
- Release bundle: `release/mac/Poster Lab Pro.app`
- Local desktop app: `/Users/liusu/Desktop/Poster Lab Pro.app`

## Cost Rule

- Default automated checks must not spend provider credits.
- Provider-spend testing remains bounded and intentional.
- Run the minimum generation needed per mode for clear pass/fail evidence unless a clear blocking bug requires one focused rerun.
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
- Pass: 1:1 square, no text, one dominant full-bleed subject, readable at 64px, strong silhouette, minimal background. Rounded corners or badge-like app-icon styling are acceptable when intentional and polished.
- Fail: poster scene, multiple subjects, copied static pose, text, logo lettering, white border, accidental padding, subject trapped in a low-quality container, or too much background detail.

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

## 2026-06-07 Desktop Real-Run Evidence

Latest local desktop bundle tested: `/Users/liusu/Desktop/Poster Lab Pro.app`.

Prompt/request intake:

- Poster, Collab, Announcement, Icon, and Logo all produced image prompt packages and provider requests.
- Uploaded `styleReference` and `compositionReference` assets were not sent as raw image references. They remained analysis-only prompt inputs.
- Custom five-size suite planning expanded one selected scheme into five image tasks: `1024x1024`, `1200x627`, `1080x1920`, `1600x1200`, and `1024x500`.

Paid AIGoCode/OpenAI-compatible smoke:

- `gpt-image-2`, `1024x576`: provider rejected the image request with HTTP 400.
- `gpt-image-1`, `1024x1024`: provider returned `No available compatible accounts`.
- Result: no image was generated and actual queue cost was `0`. Treat this as provider/account availability blocked, not an app queue failure.

Agnes real generation:

- Poster result `result-job-poster-project-pizza-kitchen-agnes-real-poster-1780831518642-image-1-1-mq3p4obm-agnes-job-poster-p`: generated and archived, no local overlay applied. Visual fail for stable quality because the image was still too close to an empty-background character composition rather than a full cinematic KV.
- Collab result `result-job-collab-project-pizza-kitchen-agnes-real-collab-1780831558043-image-1-1-mq3p5bcm-agnes-job-collab-p`: generated and archived, no local overlay applied. Visual fail because the partner/co-star disappeared and the output became a single-character scene.
- Announcement result `result-job-announcement-project-pizza-kitchen-agnes-real-announcement-1780831587878-image-1-1-mq3p5y`: generated and archived, no local overlay applied. Visual pass for copy-safe announcement layout with a clear blank editable panel and no garbled text.
- Icon result `result-job-icon-project-pizza-kitchen-agnes-real-icon-1780831617690-image-1-1-mq3p6h2t-agnes-job-ico`: generated and archived, no local overlay applied. Visual fail because the image contained pseudo-text/glyph-like marks and did not satisfy the no-text icon rule.
- Logo: blocked by Agnes free-user rate limit during this run; use existing Logo acceptance evidence or retry later after provider limit reset.

Follow-up changes made from this evidence:

- Poster compressed-model prompt now explicitly bans empty sky/gradient/studio backgrounds and requires foreground, shared ground plane, midground action, background set-piece, particles, rim light, and contact shadows.
- Collab compressed-model prompt now explicitly requires two primary foreground co-stars and marks one-character outputs invalid.
- Icon prompt now explicitly bans pseudo-letters and glyph-like strokes.

## Required Local Gates

- `npm run multimode-regression:check`
- `npm run multimode-acceptance:check`
- `npm run result-quality-audit:check`
- `npm run user-test-readiness:check`
- `npm run ux-regression:check`
- `npm run release-candidate:check`
- `npm run check`
