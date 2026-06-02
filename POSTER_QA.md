# Poster Generation QA Checklist

This checklist defines the acceptance bar for Poster Lab Pro poster mode before changes are promoted to the packaged desktop app or pushed to `main`.

## V1.0 Beta Multi-Mode Gate

- Poster, Icon, Logo, Announcement, and Collab modes must all use the shared asset fusion path: uploaded assets are visual references for AI integrated redraw, not default local overlay layers.
- Icon mode must produce a `1:1` square, no text, one dominant readable subject, strong silhouette, and clear 64px thumbnail readability.
- Logo mode must prioritize the uploaded logo or configured wordmark; it must not include BOSS / antagonist props as logo subjects, and it must avoid turning the result into a cinematic poster.
- Announcement mode must keep a calm copy-safe area for final text and must avoid fake or unreadable generated copy.
- Collab mode must keep both parties separate, preserve each side's identity cues, and stage them in one shared scene without merging them into one hybrid character.
- Poster mode remains the strictest KV gate: protagonist scale, BOSS threat, single logo treatment, visible integrated slogan, cinematic lighting, foreground-midground-background depth, and no sticker feel.
- Real paid validation for this beta is capped at one run per non-poster mode unless a blocker appears.
- Any local overlay must be recorded as fallback metadata, not treated as the default finished-art path.

## V0.4.1 Stability Gate

- AI integrated redraw is the default path for poster mode.
- Local asset overlay is disabled by default and is only allowed through explicit fallback metadata or force environment variables.
- Uploaded protagonists are identity references, not sticker layers.
- At least one uploaded protagonist is large enough to read at poster scale, with face, emotion, body language, and signature prop/tool visible.
- Uploaded BOSS / antagonist assets read as one dominant threat with attack intent, weight, contact shadows, atmosphere, debris, and environmental reaction.
- Uploaded logo / wordmark assets receive exactly one campaign logo treatment.
- Slogan mode creates a visible scene-derived slogan treatment or a polished copy-safe blank treatment; it must not silently disappear.
- Logo and slogan treatments must be integrated into the scene and must not look like detached PPT typography.
- The final image must show contact, occlusion, rim light, bounce light, VFX overlap, and environmental color grading across uploaded subjects.
- The provider request must preserve critical identity, blending, logo, typography, and fallback rules inside the 12000-character provider prompt budget.

## V0.4.2 Scheme Quality Gate

- Scheme generation must avoid static placeholder staging such as `stands`, `is placed`, `站在`, `位于`, `摆放`, `对峙`, and `从一侧压迫`.
- Every generated poster scheme must include a concrete blueprint: camera/lens/perspective, foreground-midground-background layers, key/fill/rim lighting, physical action contact point, environmental reaction/VFX, logo location, and slogan/copy treatment.
- Every batch must use the assigned KV architecture slots and avoid repeating the same diagonal split-world or side-view battlefield solution.
- KV architecture options must include restaurant defense, wild ingredient chase, portal discovery, victory trophy payoff, giant-scale pressure, and VIP/order pressure concepts in addition to boss combat layouts.
- Uploaded subject accessory lock must prevent invented shields, weapons, armor, costume parts, crowns, horns, or props unless visible in the reference.
- Scheme normalization must sanitize polluted placeholder clauses before they reach image prompts, including known live failures such as bread shield, large pink hammer, 面包盾牌, and 粉色大锤.
- The selected scheme can guide action, camera, and staging, but uploaded visual references remain the source of truth for character, BOSS, and logo identity.

## Manual Live Review

For each controlled real-generation test, record:

- job id and result path
- production mode and selected scheme id
- whether asset overlay was applied
- whether uploaded protagonist identity is preserved
- whether protagonist scale/action is readable
- whether BOSS is a believable threat
- whether logo appears once and avoids fake text
- whether slogan is scene-derived, visible, and integrated
- for Icon: whether it remains text-free, square, single-subject, and readable at 64px
- for Logo: whether it avoids unrelated character/BOSS pollution and avoids poster-like scenery
- for Announcement: whether the copy-safe region is clear and quiet
- for Collab: whether both parties stay separate but share the same environment
- whether any new props, shields, weapons, or duplicate characters were invented
- whether the image still reads as a premium game campaign KV at thumbnail size

Stop after 1-2 paid generations unless a blocker is discovered.
