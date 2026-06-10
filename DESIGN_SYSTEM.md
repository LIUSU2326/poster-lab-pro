# Poster Lab Pro Design System

Status: active working specification.

Poster Lab Pro uses a Chinese-first, production-tool design language for game marketing asset generation. The UI should feel like a focused creative workbench: precise, material, compact, and visually generous only where images and campaign decisions need room.

## Product Language

- Primary surface: a professional poster production workbench, not a landing page or tutorial.
- Tone: concise Chinese labels, restrained helper copy, direct actions near the object they affect.
- Visual center: generated schemes, uploaded references, and final images carry the emotion. Chrome stays quiet.
- Brand feel: black-led "colorful black" with soft prism accents. Color is used for focus, selection, and workflow zones, not for decoration.

## Core Tokens

```txt
Ink / primary action: #050505
Canvas: #fffffb
Shell: #f7f7f3
Surface: #fffffb
Hairline: #e7e7e2
Muted text: #8a8a84
Lime focus: #dceeb1
Lilac stage: #c5b0f4
Mint success: #c8e6cd
Cream note: #f4ecd6
Coral warning: #f3c9b6
Deep review navy: #1f1d3d
```

## Layout

- Left config panel: dense and scrollable. It owns project brief, uploads, style, output, and model summary.
- Center board: scheme-owned production board. A scheme card owns its generated results.
- Top bar: project identity, view switch, model/key, theme, retry/cancel, and generation actions.
- Settings sheet: modal configuration surface for API keys, provider routes, model slots, and connection tests.
- Archive: persistent result library for saved/generated images, not a temporary result page.

## Components

- Primary buttons use black fill, light text, and pill geometry.
- Secondary buttons use neutral outline or soft shell fill.
- Repeated cards use 8px radius and stable image aspect ratios.
- Large workbench/stage surfaces may use 24px radius.
- Icon buttons should use familiar symbols for add, delete, close, view, copy, and edit.
- Model route plans are editable objects. Deleting a route plan should remove it from the visible route list until recreated.

## Interaction Rules

- Batch generation actions must be explicit about scope.
- Single-scheme actions must say they affect only the current scheme.
- Upload/delete actions must preserve the left panel scroll position.
- Reference analysis results are workspace data and must survive settings open/close, reload, and app restart.
- Large image preview supports right-click image copy and opens follow-up editing as a panel before queueing work.
- Technical diagnostics stay out of the main UI unless they explain a blocking state.

## Generation UX Rules

- The app's generation contract is model-portable: scheme strategy, uploaded-asset semantics, prompt structure, and output scope live above provider adapters.
- Provider adapters may compress or translate prompts for model capability, but they must preserve uploaded identity locks, selected scheme architecture, asset roles, logo/text safety, and output dimensions.
- A shared composition reference guides camera/layout only. It must not force every scheme to share the same scene.
- Uploaded game characters, BOSS/key subjects, logos, and props are identity anchors. The model may change pose, lighting, camera, and action, but not recognizable identity, species, costume, silhouette, or signature features.

## Related Documents

- `DESIGN.md`: historical design decisions and accepted UI direction changes.
- `PRODUCT.md`: product goals and workflow intent.
- `POSTER_QA.md`: poster-specific quality checks.
- `REAL_GENERATION_ACCEPTANCE.md`: live generation acceptance expectations.
