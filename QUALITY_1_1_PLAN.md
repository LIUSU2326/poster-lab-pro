# QUALITY_1_1_PLAN.md

## Goal

Raise generation quality after the 1.0 beta/RC gate without making every issue a prompt tweak.

## 1.1.0-alpha.1 Result Quality Audit

Status: done.

- Store `metadata.qualityAudit` on generated results.
- Flag harmful Icon white-border/container risk from local edge analysis while allowing intentional rounded corners.
- Flag Logo text accuracy review.
- Flag Announcement copy-safe review.
- Flag Collab missing partner `brandLogo`.
- Flag local overlay fallback and target aspect-ratio drift.
- Show quality audit status in result cards and the result viewer.

## 1.1.0-alpha.2 Icon Quality Pass

Status: done.

Implemented:

- Reduce white-border or dark-container framing that shrinks the icon subject.
- Keep full-canvas square artwork.
- Preserve one strong subject silhouette.
- Keep 64px readability.
- Add icon-specific post-processing only when audit flags harmful container/padding or edge-mark risk.
- Add background expansion/corner repair using local image processing.
- Re-run the result audit after repair so stored metadata matches the final image.
- Keep no-text and no-sticker prompt checks.

Still manual:

- Review 64px readability during the next real-generation pass.

## 1.1.0-alpha.3 Logo And Text Refinement

Status: done.

Implemented:

- Separate Logo generation from poster-like scenes.
- Avoid fake replacement lettering.
- Give users a clean path when exact spelling is unreliable.
- Add shared Logo Text Strategy: `exactShortWordmark` for short simple targets, `copySafeBlankWordmark` for complex/high-risk lettering.
- Support blank wordmark plate output for later vector/text placement.
- Add a local text-risk detector for configured wordmark complexity.
- Keep uploaded Logo as brand reference, not as repeated pasted sticker.

Deferred:

- Add a dedicated logo/text refinement queue operation after the current prompt/audit strategy is validated in real generation.

## 1.1.0-alpha.4 Announcement And Collab Safety

Status: done.

Implemented:

- Announcement should preserve editable copy-safe regions.
- Collab should keep both sides separate and avoid fake partner branding.
- Add Announcement Copy Safety Strategy for exact short titles vs blank editable panels.
- Add Collab Brand Safety Strategy for uploaded partner logo lockups vs blank partner brand plates.
- Surface quality audit findings for risky announcement copy and missing partner brand logos.
- Ask for partner `brandLogo` only when the user needs readable partner branding.

Deferred:

- Add one-click mode-specific rerun presets after the safety strategy is validated in real generation.

## 1.1.0-alpha.5 Poster KV Failure Detection

Status: done.

Implemented:

- Detect the most common failed KV outputs before the user has to explain them.
- Audit for local overlay fallback, target aspect-ratio/crop risk, low thumbnail contrast, letterbox/frame-like edges, uploaded reference integration review, missing/unsafe logo treatment review, and slogan/copy area review.
- Add result-level rerun suggestions tied to specific findings.

Deferred:

- Expand KV architecture library only after real-generation audit data confirms repeated composition failure patterns.

## Non-Goals

- Do not run unlimited real-generation tests.
- Do not make local overlay the default path again.
- Do not force image models to spell long operational copy when an editable copy-safe region is safer.
- Do not turn Icon, Logo, Announcement, or Collab into Poster mode with different labels.
