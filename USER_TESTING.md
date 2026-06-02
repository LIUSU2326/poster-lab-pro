# USER_TESTING.md

## Poster Lab Pro 1.1.0-rc.3 User Test Guide

This guide is for a local desktop trial of Poster Lab Pro before the 1.1 stable release.

## Test App

- Version: `1.1.0-rc.3`
- Desktop app path: `/Users/liusu/Desktop/Poster Lab Pro.app`
- Release bundle path: `release/mac/Poster Lab Pro.app`
- Local service URL after the app opens: `http://127.0.0.1:3000`
- Desktop Test Path: `DESKTOP_TESTING.md`
- Multimode Acceptance Matrix: `MULTIMODE_ACCEPTANCE.md`

## Before Testing

1. Open `/Users/liusu/Desktop/Poster Lab Pro.app`.
2. Confirm the top bar shows `v1.1.0-rc.3`, `main`, the desktop bundle path, and the workspace revision.
3. Open `模型与 Key`.
4. Save or confirm the provider API Key.
5. Run the provider connection test.
6. Enable the live safety gate only when you are ready to spend provider credits.
7. Set an accepted cost cap that is at least the estimated cost.

## Safe Cost Rule

- Default automated checks must not spend provider credits.
- Real generation is manual and opt-in only.
- For acceptance, run only 1-2 real generations per mode when needed.
- For the rc.3 multimode pass, use `MULTIMODE_ACCEPTANCE.md` and run max 1 real generation per mode unless there is one clear blocking bug.
- Stop tuning prompts after obvious pass/fail evidence; do not run unlimited retries.
- If the live safety gate blocks a run, treat that as correct behavior until credentials, connection, confirmations, storage, and cost cap are ready.

## Asset Test Flow

Use fresh uploaded assets when possible:

- Poster: game character, BOSS/key subject, game logo, optional style or composition reference.
- Icon: one subject reference or character/prop/logo as the single icon subject.
- Logo: uploaded logo as brand reference; expect copy-safe blank wordmark behavior for complex titles.
- Announcement: optional character, logo, UI/layout, or background reference.
- Collab: game character, partner character, game logo, optional partner brand logo. If no partner logo exists, expect a blank partner brand plate.
- If you do not have a partner character, use `public/mock-assets/collab-partner-sundae-ranger.svg` as the synthetic `collabCharacter` test asset.

After deleting old assets and uploading new ones, verify old Logo/BOSS/partner assets do not reappear in another slot.

## Mode Acceptance Checklist

Poster:

- Uploaded character and BOSS are redrawn into the scene, not pasted as stickers.
- Character action, BOSS threat, lighting, contact shadows, occlusion, and environment interaction are visible.
- Logo appears once or uses a polished blank logo-safe treatment when text accuracy is risky.
- Slogan/campaign copy is large enough and tied to the scene, or a polished blank copy-safe sign/plate is reserved.

Icon:

- 1:1 square.
- No text.
- One dominant subject.
- Clear silhouette and readable at 64px.
- No poster scene, rounded OS mask, white border, or copied static pose.

Logo:

- Logo/mark system is the main subject on a clean background.
- No poster scene or character battle.
- Complex wordmarks should become a blank wordmark plate/emblem, not fake or partial letters.

Announcement:

- Clear title/body copy-safe panel.
- Characters or effects do not cover the copy area.
- No garbled operational text.
- Result still feels like an announcement or event UI, not a Poster battle scene.

Collab:

- Game character and partner character stay separate.
- Both identities share one scene through interaction, light, material, or event staging.
- Logos/brand plates remain separate; no hybrid logo.
- Without partner brand logo, use a blank partner brand plate or neutral emblem.

## Result Review

For every generated image:

1. Open the result viewer.
2. Check the Result Quality Audit pill/panel.
3. Use `回到方案` to inspect the source scheme.
4. Use `重生成片` only for clear failures.
5. Use delete only after the second confirmation click.
6. Download only ready/stored results.

## Failure Recovery

- If generation fails, check the queue area for `失败原因` and next-step guidance.
- Use `重试失败图片` for retryable failed image tasks.
- If provider/auth/cost blocks appear, open `模型与 Key` and check credentials, connection, live safety confirmations, and cost cap.
- If old data appears after asset deletion, delete the affected slot again, refresh/reopen the desktop app, and report the workspace revision and asset role.

## What To Report

When reporting a problem, include:

- App version shown in the top bar.
- Workspace revision.
- Mode.
- Uploaded asset roles.
- Scheme title or result id.
- Whether the live safety gate was enabled.
- Result Quality Audit findings.
- What looked wrong visually.
