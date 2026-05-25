# DESIGN.md

## 2026-05-25 Center Board Correction: Scheme-Owned Results

Status: accepted for implementation as a v3 refinement.

Task classification:

- Type: MVP UI structure correction.
- Impact area: center production board, scheme cards, result preview actions.
- Product scope: no new provider, queue, storage, or generation capability.
- Implementation order: document scheme-owned result model, refactor center board cards, verify desktop and narrow layouts, rebuild desktop exe.

Information architecture:

- Each poster direction is one scheme card. A scheme card is the parent object for its generated images.
- Generated images appear inside the matching scheme card, directly below the scheme title, slogan, brief, and lock indicators.
- The default scheme view should not scatter generated images into unrelated floating cards.
- Result view can remain as a secondary gallery/archive surface, but the main production decision flow is grouped by scheme.
- Image preview and edit affordances live on the image itself. Hover/focus exposes icon buttons for preview and follow-up editing.
- Empty, loading, failed, and ready states stay inside the affected scheme card.

Component rules:

- The center board must not show a decorative summary header above the scheme cards. Remove the "first determine visual decisions" board header from the production canvas.
- Scheme cards use a desktop card-grid rhythm, not a full-width vertical list. The board should fit as many cards per row as the current desktop window allows.
- The image area should dominate the card. Metadata supports the decision, it does not compete with the picture.
- Keep the Figma color-block board as the surrounding surface, but scheme cards themselves stay bright, crisp, and readable.
- Version dots represent generated variants for that scheme. They must not imply unrelated global pages.
- Preview opens a focused viewer. Edit opens the same result context where follow-up actions such as variant, upscale, and background removal are available.
- The right-side Model and API Key quick panel is removed. Model configuration returns to the top-bar button that opens the settings sheet.
- Current implementation focus is desktop. Do not spend routine UI-fix time on dedicated mobile layouts unless explicitly requested.
- For small UI fixes, use lightweight verification: syntax/type/build and packaging when the exe must be refreshed. Do not default to screenshot sweeps.

## 2026-05-24 Design Direction v3: Figma Color-Block Workbench

Status: accepted for implementation. This direction replaces v2 as the current workbench UI direction. v1 and v2 remain fallback references.

Task classification:

- Type: MVP UI redesign.
- Impact area: workbench layout, theme tokens, typography, component states, Model and API Key settings, task feedback.
- Product scope: no new business capability, no provider architecture change, no queue or storage contract change.
- Implementation order: document Figma translation, update static workbench UI, verify desktop and responsive behavior.

Reference translation:

- Figma clarity: precise black and white tool chrome, clear selected states, simple borders, minimal elevation.
- Figma color blocks: one large pastel or inverse color block may carry the central production board, but not every card becomes decorative.
- Product adaptation: the product remains a professional game marketing asset workbench. Generated images and visual decisions stay dominant.
- Right side behavior: the previous narrow right rail is not restored. When needed, the right side can show a focused Model and API Key configuration panel or a modal sheet.

Light theme tokens:

```txt
--figma-canvas: #fffffb
--figma-ink: #050505
--figma-shell: #f7f7f3
--figma-surface: #fffffb
--figma-soft: #f7f7f5
--figma-hairline: #e7e7e2
--figma-lime: #dceeb1
--figma-lilac: #c5b0f4
--figma-cream: #f4ecd6
--figma-mint: #c8e6cd
--figma-pink: #efd4d4
--figma-coral: #f3c9b6
--figma-navy: #1f1d3d
```

Dark review tokens:

```txt
--figma-dark-base: #070708
--figma-dark-shell: #111113
--figma-dark-panel: #1f1d3d
--figma-dark-panel-2: #28254a
--figma-dark-line: #403b72
--figma-dark-ink: #fffffb
```

Component rules:

- Primary CTAs and selected segments use pill geometry. Light mode uses ink fill with light text; dark mode uses light fill with ink text.
- Form fields, preview frames, asset slots, and result cards use 8px corners. Large color-block production surfaces may use 24px corners.
- Mono labels are only used for taxonomy, section labels, model ids, task ids, sizes, and queue metadata.
- Pastel blocks should identify one workflow area at a time. Do not show multiple unrelated large color blocks in the same viewport.
- Shadows stay minimal. Color blocks, borders, and spacing provide hierarchy.
- Keep Chinese UI copy as the default. `OpenAI`, `Google AI Studio`, `API Key`, model ids, provider names, and platform names remain in English where needed.

State coverage:

- Empty: show the next production action inside the same Figma-style workbench, not a marketing hero.
- Loading: use stable skeletons or progress strips, not large spinners.
- Ready: compact success state with green glyph or pastel block, no redundant banner.
- Blocked or failed: local reason plus retry/edit action near the affected field or task row.
- Dark mode: acts as a visual review mode using deep navy and inverse chrome. It is not a simple inversion of light mode.

## 2026-05-24 UI Language And Theme Calibration

本轮校准确认工作台采用“中文优先”的基础体验：核心功能、状态、配置、任务与检查器文案默认使用中文。`OpenAI`、`Google AI Studio`、`API Key`、模型 ID 和平台专有名保留原名，因为它们是用户需要准确识别的技术对象。后续如需纯英文版本，应通过语言字典实现 `zh-CN` / `en-US` 两套界面，而不是在组件内混写文案。

视觉规则：

- 字体栈优先使用 `HarmonyOS Sans SC`、`MiSans`、`Alibaba PuHuiTi`、`Noto Sans SC`，再回退到系统字体；技术数据使用等宽字体。
- Light 主题使用低饱和暖灰/绿灰工作台，不使用纯白后台感。
- Dark 主题使用石墨灰和低饱和鼠尾草灰层级，不使用蓝紫、棕红或夜店霓虹感。
- 主按钮保留轻微材质和顶部高光，但不使用大面积外发光。
- 选中态使用细边线、浅填充和轻阴影表达，不用廉价 glow。
- 配置区和检查器的 label、标题、辅助说明必须形成清晰三级层级，避免大面积浅灰造成“禁用感”。

## 2026-05-24 Design Direction v2: Quiet Creative Workbench

Status: accepted for implementation. This direction replaces the current default workbench surface while preserving v1 as a fallback reference.

Task classification:

- Type: MVP UI redesign.
- Impact area: workbench layout, theme tokens, typography, component states, inspector behavior, task feedback.
- Product scope: no new business capability, no provider architecture change, no queue or storage contract change.
- Implementation order: document design language, update static workbench UI, verify desktop and responsive behavior.

Fallback rule:

- v1 remains the historical "Layered Creative Workbench" direction.
- If v2 is rejected later, fall back to v1 rules unless a v2 rule is explicitly retained.
- Do not delete v1 sections or previous design decisions.

### Positioning

The v2 workbench is a quiet creative production tool for game marketing assets. It should feel closer to a clean design platform than an admin dashboard.

Reference translation:

- Lovart-like base: calm creative canvas, AI decisions visible but not chatty.
- Figma clarity: precise selection states, clean surfaces, restrained inspector.
- Runway visual priority: generated images and review surfaces dominate over UI chrome.
- Linear discipline: low-noise controls, compact status, clear task state.
- Miro influence is limited to light AI planning notes, not a casual whiteboard UI.

### Layout Rules

- Preserve the core workbench model: left production config, central result board, contextual inspector, lightweight task feedback.
- Left config remains visible on desktop but becomes quieter and more continuous. It should not read as stacked form cards.
- Central board is the primary visual surface. Generated assets, selected results, and next AI decision occupy the most attention.
- Right inspector defaults to a collapsed rail. It opens only when the user selects a scheme, result, prompt, task, or history item.
- The collapsed rail exposes four contextual entries: Inspector, Prompt, Tasks, History. Implementation should prefer icons with tooltips over bare letters.
- Bottom task feedback defaults to a slim queue strip. It expands only when the user asks for details or a task needs attention.
- Dark mode is a Runway-like visual review mode. It is designed separately from light mode, not as a simple inversion.

### Light Theme Tokens

Use slightly warm neutral surfaces so game artwork stays dominant.

```txt
--bg-base: #f6f7f3
--bg-shell: #fbfbf7
--bg-canvas: #f0f2ed
--bg-panel: #f7f7f1
--bg-elevated: #ffffff
--text-primary: rgba(21, 28, 40, 0.92)
--text-secondary: rgba(21, 28, 40, 0.58)
--text-tertiary: rgba(21, 28, 40, 0.36)
--border-subtle: rgba(21, 28, 40, 0.08)
--border-default: rgba(21, 28, 40, 0.12)
--accent: #2f74e8
--accent-2: #56c2a4
--accent-soft: rgba(47, 116, 232, 0.10)
--success: #44b997
--warning: #c79a3a
--danger: #cf4c4c
```

Rules:

- Primary accent appears only in selected states, progress, focus, and primary actions.
- Do not use large decorative gradients behind the app shell.
- Keep borders visible but quiet; avoid thick side stripes.
- Use the artwork and result previews as the main color event.

### Dark Review Tokens

Dark mode supports long visual inspection and result comparison.

```txt
--bg-base: #080b11
--bg-shell: #0d1118
--bg-canvas: #111620
--bg-panel: #131924
--bg-elevated: #171f2b
--text-primary: rgba(255, 255, 255, 0.92)
--text-secondary: rgba(255, 255, 255, 0.62)
--text-tertiary: rgba(255, 255, 255, 0.42)
--border-subtle: rgba(255, 255, 255, 0.08)
--border-default: rgba(255, 255, 255, 0.12)
--accent: #78a6ff
--accent-2: #d5bb78
--accent-soft: rgba(120, 166, 255, 0.14)
```

Rules:

- Dark mode should make images easier to inspect, not make the app feel like a sci-fi console.
- Avoid neon glows, high-saturation purple, and pure black.
- Metadata becomes sparser in dark mode unless it supports review decisions.

### Typography

Preferred stack:

```txt
UI: Geist, Satoshi, "Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif
Mono: "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace
```

Scale:

```txt
Page title: 22px / 700
Object title: 16px / 700
Body: 14px / 400-600
Caption: 12px / 400
Label: 10-11px / 500 / 0.12-0.14em letter spacing
Mono metadata: 11-12px
```

Rules:

- Do not use serif fonts for the core workbench.
- Labels may use uppercase and letter spacing, but body text must keep normal letter spacing.
- Keep copy short enough to avoid line collisions in compact panels.
- Prompt IDs, model names, task IDs, sizes, and cost values use mono.

### Component Language

Buttons:

- Primary buttons use dark ink on light mode and a restrained filled surface in dark mode.
- Secondary buttons use quiet borders and near-surface fills.
- Ghost buttons are used for low-risk contextual actions.
- Button radius: 10-13px for primary/secondary, 8-10px for compact controls.
- All buttons need hover, active, focus-visible, disabled, and loading states.

Segmented controls:

- Use for production mode, board view, prompt mode, and theme mode.
- Selected segment uses subtle fill plus border, not a saturated pill.
- Text must stay centered and not resize the control.

Input and config rows:

- Left config should prefer compact key-value rows, chips, and small selectors over large textarea-first layout.
- Advanced settings stay collapsed.
- Provider readiness appears as a compact status row, not a large safety banner.

Asset cards:

- Result imagery receives the largest visual weight.
- Cards should have stable dimensions and minimal metadata.
- Hover may reveal secondary actions, but the base state remains calm.
- Selected result uses a subtle accent chip or border, not a loud glow.

Inspector rail:

- Default state is a narrow rail.
- Use icons plus tooltips for Inspector, Prompt, Tasks, History.
- Expanded inspector behaves like a contextual sheet, not a permanent second dashboard.
- It never repeats global configuration from the left panel.

Task queue:

- Default state is a slim strip with progress, count, and short state text.
- Expand only for errors, manual inspection, retries, or cancellation.
- Failed items must be recoverable without rerunning the full batch.

### Motion Language

Use purposeful, short motion only.

```txt
Button press: 100-140ms, transform/opacity only
Chip and segment hover: 120-160ms
Inspector expand/collapse: 220-260ms, transform + opacity
Task strip expand: 200-240ms
Result selection: 160-220ms
Theme switch: disable transitions during token swap, then fade preview surfaces if needed
```

Rules:

- Do not animate width, height, top, left, or layout-heavy properties.
- Do not use `transition: all`.
- Inspector opens from the rail direction.
- Result cards should feel selected, not bounced.
- Respect reduced motion.

### State Coverage

Every redesigned surface must cover:

- Empty: clear next action, no marketing hero.
- Loading: stage-specific text and stable skeletons.
- Ready: compact status, no redundant success banners.
- Blocked: concise reason and local action.
- Failed: retry, edit settings, or continue with successful items.
- Selected: visible but quiet.
- Archived: recoverable and distinguishable from active results.

### Implementation Notes

- Apply v2 as a scoped workbench redesign, not an architecture rewrite.
- Do not introduce new dependencies for this redesign.
- Use existing CSS variables and renderer boundaries where possible.
- Keep provider, queue, storage, and UI boundaries explicit.
- Browser verification must check 1440, 1024, 768, and 375px for overflow and overlap.

## 2026-05-23 Live Safety Gate UI

Live execution readiness is displayed as a compact production check, not as a marketing banner or full-screen modal.

Placement rules:

- Left Engine section shows the primary safety gate summary because it is part of generation readiness.
- Top toolbar may show a small live-state chip, but must not compete with the main project pill or generate button.
- Right inspector can mirror blocker details when open, but the left Engine section is the source of action.
- Bottom task drawer can display the gate result as run context next to queue cost and elapsed time.

Component rules:

- Use the existing panel material, 1px borders, compact labels, and monospace numbers.
- `skipped` state is quiet/neutral, `blocked` state is amber, `allowed` state is green.
- Confirmation controls use compact toggle rows, not large cards.
- Cost cap input stays inline with estimated cost; values use monospace.
- Blocker messages are short, user-safe, and do not include API keys or raw image data.
- The static prototype must not make the primary generate button call a live provider. It only visualizes readiness.

Allowed copy:

- “Live gate”
- “预检未开启”
- “阻塞”
- “可手动测试”
- “预计成本”
- “接受上限”

## 2026-05-19 Round 1 UI Review Corrections

本轮修正只处理设计系统、视觉语言和交互状态，不新增业务功能，不接真实 API。

### Typography Tokens

| Token | Size | Usage | Font |
|---|---:|---|---|
| Display | 24px | 品牌、弹层标题、关键页面标题 | `Noto Serif SC`, `Source Han Serif SC`, serif |
| Section | 13px | 面板主标题、生产板标题辅助层 | `Source Han Sans SC`, `Noto Sans SC`, sans-serif |
| Body | 14px | 主要内容、检查器正文、方案说明 | `Source Han Sans SC`, `Noto Sans SC`, sans-serif |
| Caption | 12px | 辅助说明、字段 helper、空状态说明 | UI sans, color `--text-tertiary` |
| Label | 11px | 技术标签、字段名、状态元信息 | `IBM Plex Mono`, `DM Mono`, monospace |

规则：

- Section 与 Label 使用 uppercase、`letter-spacing: 0.12em` 和 `--text-tertiary` 区分语义。
- Caption 和 helper 不抢视线，统一使用 `--text-tertiary`。
- Prompt、模型名、平台规格、KV 编号使用等宽字体。

### Light And Dark Tokens

Light:

| Token | Value |
|---|---|
| `--bg-base` | `#f3f6fa` |
| `--bg-surface` | `#fbfcfe` |
| `--bg-elevated` | `#fdfefe` |
| `--bg-overlay` | `rgba(28, 34, 48, 0.18)` |
| `--text-primary` | `rgba(17, 22, 32, 0.92)` |
| `--text-secondary` | `rgba(17, 22, 32, 0.64)` |
| `--text-tertiary` | `rgba(17, 22, 32, 0.42)` |
| `--text-disabled` | `rgba(17, 22, 32, 0.22)` |
| `--border-strong` | `rgba(17, 24, 39, 0.15)` |
| `--border-default` | `rgba(17, 24, 39, 0.10)` |
| `--border-subtle` | `rgba(17, 24, 39, 0.06)` |
| `--accent` | `#4f8eff` |
| `--accent-hover` | `#3f7ce6` |
| `--accent-muted` | `rgba(79, 142, 255, 0.12)` |

Dark:

| Token | Value |
|---|---|
| `--bg-base` | `#0d0f14` |
| `--bg-surface` | `#13161e` |
| `--bg-elevated` | `#1a1e28` |
| `--bg-overlay` | `#20253200` |
| `--text-primary` | `rgba(255,255,255,0.92)` |
| `--text-secondary` | `rgba(255,255,255,0.60)` |
| `--text-tertiary` | `rgba(255,255,255,0.35)` |
| `--text-disabled` | `rgba(255,255,255,0.20)` |
| `--border-strong` | `rgba(255,255,255,0.15)` |
| `--border-default` | `rgba(255,255,255,0.08)` |
| `--border-subtle` | `rgba(255,255,255,0.04)` |
| `--accent` | `#4f8eff` |
| `--accent-hover` | `#6ba3ff` |
| `--accent-muted` | `rgba(79,142,255,0.15)` |

### Button States

- Primary: Light 使用深色底和白字；Dark 使用 accent 渐变、顶部 1px 内高光和柔和 glow。
- Primary hover: 亮度提升，边框高光增强，阴影略增强，过渡 150-220ms。
- Primary active: `translateY(1px)`，内阴影增强，不改变布局尺寸。
- Outline: 使用 `--border-default`，hover 时背景轻微变亮，边线增强。
- Chip selected: 使用 `--accent-muted` 背景和 1px accent 边线，不使用实色填充。
- Disabled: 降低透明度和饱和度，保留尺寸。
- Loading: 可使用轻量 sheen，不使用跳动或弹性动效。
- 所有按钮圆角为 6px。

### Inspector Rhythm

- 检查器的 KV、宣传词、平台规格使用 Label 加 Body 的层级。
- 信息组之间使用 8px 间距和 `--border-subtle` 分割线。
- Prompt 结构块 `SUBJECT / LAYOUT / GUARDRAIL` 使用轻微嵌套背景和左侧 2px accent 指示。
- 方案操作主次固定：`生成变体` 是 Primary；`局部重绘`、`高清放大`、`背景移除` 是 Ghost/Secondary。

### IPTH Rail

右侧 rail 的四个入口定义为：

- `I` = Inspector，检查器主视图。
- `P` = Prompt，Prompt 详情视图。
- `T` = Timeline / Task，任务进度视图。
- `H` = History，历史版本视图。

规则：

- 每个入口必须有 tooltip 或等效可访问标签。
- 当前视图使用 accent 背景或 2px 左侧指示线。
- 静态原型可以保留字母，但后续组件化时优先替换为语义 icon。

### API Key Model Slot Structure

Provider 详情页必须支持按任务场景分配模型：

| Slot | Flow | Example |
|---|---|---|
| 方案生成 | Brief → Creative Concept | GPT-4o |
| 图像生成 | Concept → Image Output | gpt-image-1.5 / Gemini image / Qwen image |
| 风格参考分析 | Style Reference image understanding | GPT-4o Vision |
| 构图参考分析 | Layout Reference image understanding | GPT-4o Vision |

静态原型只展示表单和状态。真实实现阶段由 provider adapter 读取 slot 配置并映射到对应任务。

### Scheme Board Empty State

- 中央方案板默认不展示内置示例方案卡；示例数据只能作为内部模板和测试兜底。
- 未生成真实方案或真实图片前，中央区域显示轻量空状态和 API Key 配置入口。
- 一旦真实 provider 生成方案或本地结果文件，才把对应方案卡渲染回生产板，避免用户把 mock 卡误认为 API 结果。

### Archive Surface

- 档案馆使用大尺寸 surface 或 drawer，目标宽度为视口 70%-80%。
- 表格行高收紧到 48px。
- Dark 模式 header 和 body 使用同一深色层级，通过 1px divider 区分。
- 缩略图必须带类型 overlay label。
- 状态标签使用语义 chip：已归档 neutral，可编辑 accent，待补图 warning。

## 2026-05-19 Theme Calibration: Layered Creative Workbench

本次主题校准参考可灵类创作工具的暗色材质感，但不复制其品牌、图标、文案、图片资产或页面结构。目标是建立一套 Light 和 Dark 共用的控件语言：深浅主题都要有层次、细线条、克制光影和专业创意工具感。

### Theme Principles

Dark 主题的使用场景：用户在较暗环境下长时间批量生成、筛选和检查素材，需要界面安静、低眩光、层次清楚，结果图和方案卡仍然是视觉主角。

Light 主题的使用场景：用户在白天办公环境下整理项目、配置素材、评审方案和导出结果，需要明亮、干净、细致，但不能变成普通 SaaS 后台。

共同规则：

- Dark 不是纯黑背景，使用 `background`、`canvas`、`panel`、`panel-raised` 的四层深度。
- Light 不是纯白反色，使用微冷浅灰画布、近白面板、浅阴影和柔和 accent。
- 两套主题共用布局节奏、圆角、字号、控件尺寸和状态模型。
- 视觉效果服务交互反馈，不作为装饰堆叠。
- 游戏素材和生成结果必须比界面光效更突出。

### Theme Tokens

所有颜色必须通过 CSS variables 使用，不在组件里写死颜色。

Required tokens:

```txt
background
canvas
panel
panel-soft
panel-raised
border
line-strong
text
text-2
muted
accent
accent-2
accent-hover
accent-soft
accent-line
glow
shadow
danger
success
warning
```

Dark token direction:

```txt
background: layered deep neutral, never pure black
canvas: darker work surface with subtle grid visibility
panel: low-glare dark surface
panel-raised: slightly brighter controls and cards
border: cool gray line, visible but quiet
text: soft off-white, never pure white
accent: restrained energy accent for selected and primary states
accent-2: secondary hue used only inside primary gradients or progress
glow: soft local halo for selected, focus, and primary hover
```

Light token direction:

```txt
background: quiet cool light neutral
canvas: soft gray work surface, not pure white
panel: near-white with tint
panel-raised: brighter control surface
border: fine cool gray
text: dark neutral with slight cool tint
accent: controlled indigo-violet
accent-2: soft mint/teal support hue
glow: shallow shadow plus subtle accent halo
```

### Button Material Rules

Primary buttons:

- Use only for one-click generation, batch render, or high-confidence confirmation.
- Use a subtle two-hue gradient based on `accent` and `accent-2`.
- Add inner top highlight and soft outer glow.
- Hover changes gradient angle or brightness, strengthens border highlight, and slightly increases glow.
- Active uses inner shadow, no layout shift.
- Disabled reduces contrast and saturation but keeps size and position.
- Loading may use a short sheen animation, 150-220ms state transitions, no bounce.

Secondary buttons:

- Use `panel-raised` and fine border.
- Hover brightens the surface and strengthens border.
- Selected uses `accent-soft`, `accent-line`, and a local glow.
- Do not use full-saturation fills for inactive states.

Icon buttons:

- Same material as secondary buttons at compact size.
- Hover must make icon/text clearer and surface slightly brighter.
- Selected can glow, but only locally around the control.

### Form And Selection Rules

Inputs and textarea:

- Default uses `panel` or `panel-soft` with fine border.
- Hover brightens surface and border.
- Focus uses `accent-line` plus `focus-ring`.
- Error appears near the field with `danger-soft`, not only as a toast.
- Disabled keeps layout and lowers contrast.

Segmented controls and chips:

- Container uses recessed `panel-soft`.
- Active item uses raised surface, `accent-soft`, and inner highlight.
- Hover changes brightness, not size.
- Selected state must be readable in both themes.

### Surface Rules

Left config panel:

- Must feel like a production control surface, not a flat form stack.
- Use grouped sections, fine dividers, compact controls, and a fixed primary CTA.
- Dark theme uses a slightly raised left panel against deeper canvas.
- Light theme uses near-white panel against gray canvas.

Central scheme card:

- A scheme card is a creative brief object, not a generic SaaS card.
- Use fine border, panel gradient, subtle top highlight, and selected glow.
- Hover may lift visually with shadow, but must not reflow layout.
- Failed and loading states stay inside the card.

Right inspector:

- Default can collapse to rail.
- Open inspector uses the same raised material as cards.
- Prompt blocks and lock controls use compact nested surfaces, not heavy nested cards.

Bottom task bar:

- Default is a slim status strip.
- Hover gives a light surface response.
- Expanded drawer uses task rows, progress glow, and compact stats.
- It must never visually overpower the central production board.

Settings sheet:

- Model and API Key settings use a raised sheet with provider list and detail panel.
- API Key fields are masked by default.
- Provider selected state uses glow and border, not a solid colored block.

### Allowed Effects

- Fine borders.
- Local selected glow.
- Inner top highlight.
- Soft panel shadow.
- Subtle gradient on primary buttons only.
- Low-opacity radial wash on canvas or modal backdrop.
- Short sheen animation for loading.

### Disallowed Effects

- Pure black or pure white as the dominant surface.
- Neon nightclub glow.
- Large decorative gradients.
- Glassmorphism as the default panel style.
- Big rounded stacked cards.
- Gradient text.
- Full-saturation inactive controls.
- Button hover that shifts layout.
- Visual effects that compete with generated images.

## 2026-05-19 Design System Update: Bright Creative Workbench

The current visual language moves from a generic SaaS panel system to a professional creative production workbench. The UI must feel like a design tool: precise, quiet, dense, and visually authored.

### Typography Scale

```txt
11px: meta labels, status labels, parameter captions
12px: helper text, compact buttons, chips
13px: form text, secondary body, dense inspector content
14px: default UI body and card body
16px: scheme title and panel emphasis
20px: production board title
24px: rare page-level heading
```

Rules:

- Use fixed sizes, not viewport-scaled typography.
- Use weight and spacing for hierarchy before adding color.
- Prompt, seed, provider IDs, and model names may use monospace.

### Button And Control Language

- Primary: only for one-click generation and batch rendering.
- Solid dark: immediate per-scheme generation or confirm actions.
- Soft selected: active chips, locked fields, current view tabs.
- Outline: secondary global actions such as archive and favorites.
- Ghost/icon: refresh, close, copy, inspector rail, theme switch.
- Danger soft: stop task, remove provider, delete asset.

Control heights:

```txt
Compact input: 32px
Default input: 36px
Textarea: 84-112px
Chip / option: 30-34px
Toolbar button: 34-38px
Primary CTA: 48-54px
```

### Theme Tokens

Themes must be implemented with CSS variables. Light is default. Dark is designed separately and must not be a direct inversion.

Light:

```txt
bg: oklch(0.975 0.006 260)
canvas: oklch(0.955 0.009 260)
panel: oklch(0.99 0.004 255)
panel-soft: oklch(0.968 0.007 255)
line: oklch(0.89 0.012 255)
line-strong: oklch(0.81 0.018 255)
text: oklch(0.22 0.018 260)
text-2: oklch(0.38 0.018 260)
muted: oklch(0.58 0.018 260)
accent: oklch(0.58 0.17 275)
accent-soft: oklch(0.94 0.035 275)
```

Dark:

```txt
bg: oklch(0.18 0.012 260)
canvas: oklch(0.145 0.014 260)
panel: oklch(0.22 0.014 260)
panel-soft: oklch(0.26 0.014 260)
line: oklch(0.34 0.018 260)
line-strong: oklch(0.43 0.02 260)
text: oklch(0.93 0.006 260)
text-2: oklch(0.78 0.01 260)
muted: oklch(0.62 0.012 260)
accent: oklch(0.72 0.15 275)
accent-soft: oklch(0.30 0.055 275)
```

### State Rules

- Hover: increase surface contrast or lift subtly without shifting layout.
- Focus: visible 2px ring using accent at low opacity.
- Selected: combine fine border, soft tint, and one text accent. Do not use heavy purple blocks.
- Disabled: retain layout and reduce contrast.
- Loading: prefer skeleton and stage text over standalone spinners.
- Error: local red tint, clear cause, and a recovery action.

### Collapsible Chrome

- Right inspector defaults to a narrow rail. Selecting a scheme opens the inspector. Pinning keeps it open.
- Bottom tasks default to a slim status bar. Expanding reveals a drawer with queue rows, cost, elapsed time, retry, and failure details.
- Collapsed chrome must preserve the core workflow: generate, inspect prompt, retry, and view results remain reachable.

### API Key Settings Surface

Model and API Key configuration uses a settings sheet, not a first-run modal.

Provider rows:

- OpenAI
- Replicate
- ComfyUI
- Custom HTTP

Provider detail fields:

- enabled state
- masked API Key input
- base URL when relevant
- default model
- capability tags
- static connection status
- test connection button
- local error or success message

## 设计方向对比

### A 专业暗色生产工具

布局：

- 顶部栏显示项目、平台、预计张数、成本和主生成按钮。
- 左侧控制区承载游戏资料、素材、品牌、平台规格和生成参数。
- 中央画布展示方案、结果、对比和导出。
- 右侧检查器展示当前方案或图片的细节。
- 底部任务队列展示生成、后处理、失败和下载状态。

优点：

- 最适合 MVP，结构稳定，易于实现。
- 信息密度高，适合批量生产和高频使用。
- 接近 Figma 的工作台骨架，用户理解成本低。
- 能很好承载 Runway 式任务流和素材管理。
- 结果图可以成为中央区域主角。

缺点：

- 初次用户可能觉得专业度高，有学习成本。
- 如果空状态和引导不足，界面会显得冷。
- 视觉记忆点不如创意画布强。

风险：

- 参数过多会造成左侧面板拥挤。
- 如果中央区域被方案文字占满，会削弱图片结果的主导地位。

适合程度：

- MVP 主方向，适合度最高。

### B 高级游戏发行后台

布局：

- 顶部或侧边导航强调项目、活动、平台、素材、报表、设置。
- 主区域突出活动状态、平台素材完成度、导出状态和任务进度。
- 右侧面板承载平台规格、合规提示、导出规则。

优点：

- 适合发行团队和增长团队。
- 平台规格、多语言、导出、活动管理更清晰。
- 有利于未来支持团队协作、成本统计和交付状态。

缺点：

- 创作感弱，容易变成普通管理后台。
- 对独立开发者和设计师来说可能过重。
- 如果过早采用，会稀释一键生成和视觉探索的核心体验。

风险：

- 用户可能把产品理解成素材管理系统，而不是 AI 创意生成工具。
- 页面层级变多，MVP 开发成本增加。

适合程度：

- 适合 Beta 阶段增强项目管理、平台交付和团队协作。
- MVP 可吸收其平台规格、导出和任务状态设计。

### C 创意导演式 AI 画布

布局：

- 中央画布最大化，展示方案板、结果墙、变体链路和版本流。
- 左侧更像素材 rail，承载角色、品牌、参考图。
- 右侧为导演面板，承载创意 brief、镜头、构图、prompt、锁定项。
- 底部展示变体时间线、任务队列和版本历史。

优点：

- 最有差异化和记忆点。
- 适合美术指导、设计师和独立开发者做视觉探索。
- 很适合结果变体、局部重绘、高清放大和二次生成。

缺点：

- 批量生产和参数管理效率不如 A。
- 平台规格、语言、任务队列如果处理不好，会显得散。
- 实现复杂度高。

风险：

- 容易为了创意感牺牲生产效率。
- 对买量团队和发行团队不够稳定。

适合程度：

- 适合作为后续创意模式。
- MVP 可吸收其结果墙、变体链路和右侧导演式检查器。

## 最终 UI/UX 决策

主方向更新为明亮中性创意生产台。暗色生产工具不再作为默认方向。

融合策略：

- 从 A 保留清晰参数控制和高频生产体验，但降低四周配置区的压迫感。
- 从 B 吸收平台规格、导出状态、多语言交付、活动化组织能力。
- 从 C 吸收结果墙、变体链路、局部重绘、高清放大、导演式检查器。

最终目标是：明亮的 Figma 式工作区骨架，Runway 的任务和素材管理，Midjourney / Magnific 的结果派生，Canva 的平台尺寸选择。

新的界面重心：

- 中央方案和视觉结果优先，占据首屏最大面积。
- 左侧配置默认收敛为窄导航和轻量参数面板，不长期铺满表单。
- 右侧检查器默认轻量，只在选中方案或图片后展示上下文。
- 底部任务队列默认是一条低干扰状态，不压过画布。
- 明亮中性界面用于衬托游戏海报的高饱和视觉。

### 2026-05-19 确认主方案

当前确认的主方案是“左侧生产配置 + 中央方案/结果生产板 + 右侧上下文检查器 + 轻量任务反馈”。

页面骨架：

```txt
┌──────────────────────────────────────────────────────────────┐
│ Top Bar: 项目 / 展开文本 / 收藏夹 / 档案馆 / 停止 / 批量渲染       │
├───────────────┬───────────────────────────────┬──────────────┤
│ Left Config   │ Center Production Board        │ Inspector    │
│ 输入/素材/参考 │ 方案卡网格 / 结果组 / 文本态 / 空态 │ 当前对象详情  │
│ 风格/尺寸/数量 │                               │ Prompt/锁定项 │
├───────────────┴───────────────────────────────┴──────────────┤
│ Task Feedback: toast / 小队列 / 卡片内进度 / 失败重试             │
└──────────────────────────────────────────────────────────────┘
```

关键规则：

- 左侧配置允许高密度，但必须分组、可滚动、底部主按钮固定。
- 中央生产板是第一视觉焦点。方案卡和结果组比 UI 装饰更重要。
- 方案卡是生产对象，必须包含 KV 主题、宣传词、页码或版本、局部生成按钮和状态。
- 结果按方案组展示，多比例结果保留在同一组里，不把所有图片散成无上下文的平铺网格。
- 右侧检查器不重复全局配置，只展示选中方案或图片的上下文。
- 档案馆、结果大图、批量管理优先使用弹层或 lightbox，不作为首屏常驻面板。
- 顶部 toast 用于成功、停止、批量完成和失败反馈。

视觉方向：

- 明亮、细线条、克制紫蓝主色。
- 使用近白面板和浅灰画布，不使用普通蓝白 SaaS 后台质感。
- 信息密度高但不拥挤，左侧局部密集，中央有生产板节奏。
- 卡片圆角控制在 10-14px，避免大圆角软糖感。
- 主色只用于主按钮、选中态、关键进度和少量状态反馈。

## 参考图提取规则

本节来自对 Lovart、可灵、即梦等设计台类产品的参考提取。不要复制它们的视觉或具体页面，只吸收适合本项目的工作台规律。

### 可借鉴的布局关系

- 左侧可以保留一条窄工具栏，用于项目、资产、生成、画布、历史等一级入口。
- 核心区域应像“创作现场”，中央画布或结果墙必须占据最大视觉权重。
- 右侧可以是 Agent / Inspector 面板，承载当前方案、提示词、技能、任务和上下文操作。
- 重要生成入口可以采用底部 composer / action dock，而不是把所有操作塞进左侧表单。
- 空状态可以有引导，但不能用大面积营销式欢迎页取代工作台。

### 可借鉴的信息密度

- 一级导航极简，参数面板局部密集，中央视觉区留白更大。
- 参数不应平均铺开，应按“输入、资产、输出、生成”分组，并将高级项折叠。
- 平台规格、模型、画风、参考强度等常用项应以紧凑 chips、segmented controls 和短输入呈现。
- 任务队列默认是低干扰状态条，展开后才显示子任务。

### 可借鉴的面板组织

- 左侧控制区应像生产参数台，不像普通后台表单。
- 素材库应使用缩略图、类型、引用状态，而不是纯文本文件列表。
- 中央区域应同时支持大图预览、方案 brief、结果网格和派生操作。
- 右侧检查器应随选中对象变化，避免重复左侧全局设置。
- 生成 composer 应把素材引用、模式、尺寸、模型和主按钮放在同一个决策区域。

### 可借鉴的控件风格

- 控件应低对比、紧凑、边界清晰，重点按钮才高亮。
- 使用 chips、segmented controls、icon-sized buttons、缩略图选择器、轻量进度条。
- 少用大块普通卡片，改用 dock、strip、panel、sheet、canvas cell。
- 圆角保持 6-10px，避免玩具感的大圆角和软糖质感。

### 可借鉴的视觉气质

- 可灵类创作台的结构适合本项目，但不沿用暗色作为默认视觉。
- Lovart 类大画布适合本项目的“创作现场”和底部工具条。
- 即梦类图片流适合本项目的结果墙、灵感筛选和视觉素材优先级。
- 本项目不采用纯白消费社区风、超大空白登录态、泛灵感瀑布流首页。

### 适合本项目

- 窄侧边一级导航。
- 中央大画布或结果墙。
- 右侧 Agent / Inspector。
- 底部生成 composer。
- 平台规格 chips。
- 素材缩略图。
- 紧凑任务状态条。

### 不适合本项目

- 复制参考产品的品牌符号、动效或具体页面。
- 大面积空白登录态。
- 消费社区信息流作为主工作台。
- 单模型宣传页结构。
- 过轻、过白、过营销的首页式创作入口。
- 用巨大 onboarding 弹窗遮住生产流程。

## 静态工作台重设计指令

下一版静态工作台应从“暗色控制台”改为“明亮中性游戏宣发素材创作台”：

- 左侧由窄侧边栏和可收起的紧凑控制面板组成。
- 中央优先展示大画布、主视觉结果、方案 brief 和结果缩略图。
- 右侧是轻量上下文 Inspector，展示当前方案、提示词、宣传词和任务状态。
- 底部使用轻量 composer 承载一键生成前的关键设置和主按钮。
- 任务队列收敛为状态条或小型队列，不默认压过中央画布。
- 静态占位也必须像游戏宣发素材，不使用抽象渐变块冒充结果图。
- 避免正截面上下左右全是信息区域与配置区域，首屏必须给中央视觉区留出呼吸空间。

## UI 风格方向

本产品是专业创意生产工具，视觉风格应服务于高频创作、批量管理和结果筛选。

整体方向：

- 桌面优先。
- 明亮中性工作台。
- 高密度但清晰的信息布局。
- 游戏图片和生成结果是视觉主角。
- 控制面板克制、稳定、可扫描。
- 不做营销落地页式首页，首屏应进入可操作的生产流程。

产品气质：

- 专业。
- 高效。
- 稳定。
- 有创意感，但不喧宾夺主。
- 更接近 Figma、Runway、Adobe 工具和素材管理器，而不是聊天机器人。

明确避免：

- 营销落地页。
- 大圆角卡片。
- 过多渐变。
- 玩具感。
- 空洞科技感。
- 过度拟物。
- 默认玻璃拟态。
- 大面积装饰性光效。
- 荧光绿或暗黑控制台气质。

## 主工作台布局

桌面端采用生产台结构：

```txt
┌──────────────────────────────────────────────────────────────┐
│ Top Bar: 项目 / 全局动作 / 任务状态 / 批量渲染                  │
├───────────────┬───────────────────────────────┬──────────────┤
│ Left Config   │ Center Production Board        │ Inspector    │
│ 300-336px     │ 方案卡、结果组、文本态、空状态      │ 选中对象详情 │
├───────────────┴───────────────────────────────┴──────────────┤
│ Lightweight Task Feedback / Toast / Optional queue             │
└──────────────────────────────────────────────────────────────┘
```

### 顶部栏

顶部栏承担全局控制，不做装饰。

内容：

- 当前项目名称。
- 展开文本。
- 收藏夹。
- 档案馆。
- 停止任务。
- 开始批量渲染。

规则：

- 批量渲染按钮始终可见。
- 参数不足时生成按钮 disabled，并说明缺失项。
- 顶部栏不展示长文案，不堆叠过多 chips。

### 左侧控制区

左侧是生产配置区，允许局部高密度，但必须分组清晰、可滚动、底部主按钮固定。它不是普通后台表单。

分组：

1. 游戏资料
   - 游戏名称。
   - 游戏描述。
   - 核心卖点。
   - 侧重点引导。

2. 素材选择
   - 角色。
   - Logo。
   - 背景。
   - 道具。
   - UI 截图。
   - 构图参考。

3. 品牌资产
   - 主色。
   - Logo。
   - 字体风格。
   - 固定品牌词。
   - 禁用元素。

4. 输出规格
   - 海报。
   - Icon。
   - 商店图。
   - 广告图。
   - Steam。
   - App Store。
   - Google Play。
   - TapTap。
   - TikTok。
   - Meta Ads。

5. 生成参数
   - 方案数量。
   - 每方案图片数量。
   - 比例。
   - 尺寸。
   - 模型。
   - 画风。
   - 角色一致性强度。
   - 构图参考强度。

6. 宣传词
   - 关闭。
   - 自动生成。
   - 全局宣传词。
   - 多语言选择。

7. 高级参数
   - Seed。
   - 质量。
   - 负面提示。
   - 参考强度。
   - 失败重试策略。

规则：

- 只让当前阶段最重要的参数常驻。
- 高级参数折叠。
- 数字参数用 stepper 或 slider。
- 模式选择用 segmented control。
- 平台规格用模板按钮，不以手填尺寸为主。
- 小屏和中屏优先收起左侧完整控制区。

### 中央生产板

中央区域是生产板，展示用户真正关心的方案、结果、状态和下一步操作。

主视图：

- 方案。
- 结果。
- 对比。
- 导出。

方案视图：

- 展示多列方案卡。
- 每个方案包含 KV 主题、构图摘要、宣传词、多语言提示、版本页码、状态和立即生图按钮。
- 用户可以锁定宣传词、构图、角色、画风。
- 方案卡保持克制，重点是可读性和可选择性。

结果视图：

- 按方案组展示多比例结果。
- 图片必须比 UI 面板更抢眼。
- 支持按方案、平台、语言、模型、状态筛选。
- 鼠标悬停显示快捷操作：变体、重绘、放大、背景移除、下载。

对比视图：

- 横向比较同一方案的多张结果。
- 支持标记首选图。
- 支持查看 prompt 差异和模型参数。

导出视图：

- 按平台分组。
- 显示尺寸、文件名、语言、导出状态。
- 支持批量下载。

### 右侧检查器

右侧只显示当前选中对象的细节，默认保持轻量。

选中方案时显示：

- 完整创意 brief。
- 结构化 prompt。
- 宣传词多语言版本。
- 构图说明。
- 光影和色彩。
- 角色一致性设置。
- 品牌资产引用。
- 锁定字段。

选中图片时显示：

- 原始方案。
- 模型和参数。
- 平台规格。
- 图片尺寸。
- seed 或任务 ID。
- 后处理入口。
- 变体生成设置。
- 下载和导出状态。

规则：

- 不展示全局设置。
- 不重复左侧参数。
- 只服务于当前选中对象。
- Prompt 采用结构化折叠块，不直接堆一大段文本。
- 1024px 以下变为抽屉或下方详情，不占据中央区域。

### 底部任务队列

任务反馈采用 toast、轻量队列、卡片内进度和可展开详情，不默认铺成大面积任务面板。

显示：

- 当前批量任务。
- 子任务进度。
- 排队中。
- 生成中。
- 后处理中。
- 失败。
- 已完成。
- 可重试。
- 可取消。

交互：

- 默认收起为状态栏。
- 任务运行时可展开。
- 失败项可单独重试。
- 完成后可直接跳转结果或下载。
- 不默认铺成大面积任务面板。

## 设计系统

### 色彩

使用明亮中性底色，让高饱和游戏图像成为焦点。

```txt
App Background: #F4F6F8
Canvas Background: #EEF1F5
Panel: #FCFBF8
Panel Raised: #F7F8FA
Border: #DDE2EA
Border Strong: #C7CEDA
Text Primary: #161A22
Text Secondary: #4E5665
Text Muted: #7B8494

Primary: #315BFF
Primary Hover: #2547D8
Selection: #4E7BFF
Success: #168A55
Warning: #B7791F
Error: #D64545
Info: #2563EB
```

色彩使用规则：

- 主色只用于主操作、当前选中状态、关键进度。
- 分析、宣传词、任务状态优先使用低饱和语义色和中性标签，不引入多套高饱和装饰色。
- 语义色只用于状态，不用于装饰。
- 不使用大面积渐变背景。
- 不使用纯黑和纯白作为主界面基础色。
- 不使用荧光绿作为主按钮色。

### 字体

```txt
UI: Geist, Satoshi, system-ui, Microsoft YaHei, Noto Sans SC, sans-serif
Prompt / 参数: JetBrains Mono, ui-monospace, monospace
```

字体规则：

- 产品 UI 使用无衬线字体。
- 标签、按钮、表单不使用装饰字体。
- 提示词、模型参数、任务 ID 使用等宽字体。
- 字号采用固定比例，不随视口宽度缩放。

### 圆角

```txt
Small: 4px
Default: 6px
Panel: 8px
Image Preview: 8px
Modal: 10px
```

避免过度圆润，整体保持工具感。

### 间距

```txt
4px, 8px, 12px, 16px, 24px, 32px
```

规则：

- 工具栏和表单区域使用紧凑间距。
- 方案卡和图片画廊使用更宽松间距。
- 不把所有区域都做成同尺寸卡片。

## 组件规则

### 按钮

按钮类型：

- Primary：一键生成、确认方案、开始批量任务。
- Secondary：保存、重新生成方案、添加素材。
- Ghost：查看详情、展开、关闭、复制。
- Danger：删除资产、取消任务。

规则：

- 所有按钮必须有 hover、focus、active、disabled、loading 状态。
- 图标按钮必须有 tooltip。
- 高风险操作需要确认，优先使用行内确认或确认面板。

### 表单

规则：

- 每个复杂字段提供说明 tooltip。
- 高级设置默认折叠。
- 重要设置保持常驻可见。
- 错误信息必须出现在字段附近。

### 分段控件

用于互斥模式：

- 宣传词模式：关闭、自动生成、全局宣传词。
- 构图参考：弱参考、构图参考、高质量构图参考。
- 输出用途：海报、icon、商店图、广告图。

### 滑块和步进器

用于数字参数：

- 方案数量。
- 每方案图片数量。
- 角色一致性强度。
- 构图参考强度。
- 高清放大倍数。

### 方案卡

方案卡展示生成前的创意 brief：

- 方案名称。
- 核心主题。
- 构图摘要。
- 画风。
- 宣传词。
- 平台规格。
- 预计生成张数。
- 锁定字段状态。
- 生成按钮。

方案卡不是普通内容卡，它是用户决策对象。

### 图片结果卡

图片结果卡展示：

- 图片预览。
- 方案来源。
- 平台规格。
- 语言。
- 尺寸。
- 模型。
- 状态。
- 收藏、下载、重绘、放大、背景移除操作。

## 状态设计

### 空状态

空状态不显示营销文案，而是引导下一步操作。

示例：

- 尚未生成方案。
- 下一步：填写游戏资料、选择平台规格、上传至少一个素材。
- 主操作：生成设计方案。

### 加载状态

加载状态需要展示阶段：

- 正在分析游戏描述。
- 正在读取品牌资产。
- 正在提取构图参考。
- 正在生成宣传词。
- 正在生成设计方案。
- 正在批量出图。
- 正在后处理。

### 失败状态

失败状态必须可恢复：

- 展示失败原因。
- 支持重试。
- 支持修改参数。
- 支持继续导出成功项。
- 支持仅重试失败项。

### 结果状态

结果状态必须支持继续生产：

- 筛选。
- 收藏。
- 变体。
- 局部重绘。
- 高清放大。
- 背景移除。
- 下载。
- 加入导出。

## 交互原则

- 先方案，后出图。
- 所有批量生成前都显示张数、成本、耗时。
- 用户可以锁定某个方案字段再继续变体。
- 单张图片是可继续编辑的资产，不是静态结果。
- 平台规格优先用模板选择。
- 失败任务可恢复，不让用户重来。
- 结果图永远比界面装饰更突出。
- 小屏可以查看结果和下载，但 MVP 不追求完整移动端创作体验。

## 2026-05-25 Routine UI Iteration Override

- Small UI updates target the desktop workbench only unless mobile is explicitly requested.
- Do not run screenshot sweeps, Playwright visual verification, or full responsive checks for routine UI fixes.
- Use lightweight verification for small UI changes: syntax checks, build checks, and desktop packaging when the executable must be refreshed.
- Full visual QA across breakpoints is reserved for large UI reviews or explicit user request.

## 2026-05-25 Scheme Card Consolidation

- The center board no longer treats prompts or results as separate primary views.
- Prompt/copy content belongs inside each scheme card and can be shown or hidden from the top bar.
- Generated images stay under their owning scheme card, with preview/edit actions directly on the image.
- R/F/L letter buttons are removed because they do not communicate useful actions.
- The archive board removes unclear filter chips and count pills until those states map to real workflow decisions.
- Theme switching uses a light/dark capsule control; model and API key settings remain a top-level button.

## 2026-05-25 Archive Selection Export

Classification: MVP workflow refinement.

- Archive is a selectable asset library, not just a read-only record table.
- Users can select individual archived images, select all, select today's generated images, select images from the last hour, clear selection, and export selected images.
- Archive header may use a restrained color band to separate the page title from the action/table area.
- The top view switch must stay visually centered when surrounding global actions appear or disappear.
- Left configuration module headings need stronger typographic contrast so project, asset, direction, output, and model sections scan clearly.

## 2026-05-25 Style Adaptation Audit Pass

Classification: MVP visual quality refinement.

- Preserve the accepted Figma-style workbench direction: pale creative canvas, purple production board, compact scheme cards, and restrained black/white primary controls.
- Do not replace the current style with a new brand direction during detail cleanup.
- Light and dark themes must share the same component hierarchy, but dark mode needs its own readable surfaces, borders, form controls, status cards, and archive states.
- Provider settings, archive selection, top actions, and left production configuration are priority polish zones because they carry dense operational copy.
- UI motion should stay functional and quiet: hover, focus, pressed, sheet, and card feedback only; animate transform or opacity and honor reduced motion.
- Routine verification remains desktop-first and lightweight unless a full visual review is requested.

## 2026-05-25 Control Surface Interaction Cleanup

Classification: MVP workflow refinement.

- Style selection should keep the left panel compact: clicking the style library opens a focused selection dialog with search and all available styles.
- Composition and style reference uploads must show the uploaded image inside the upload surface itself. Reference extraction controls live directly under the preview, not in a separate route/status card.
- Composition extraction has two clear actions: composition-only and full image-to-prompt. Style extraction has one primary action. All extraction actions stay disabled or explanatory until a provider/API key is configured.
- Output presets and single sizes must both remain selectable. Choosing a single size switches away from suite mode instead of disabling the size buttons.
- Suite management needs an obvious management surface for inspecting presets, creating/deleting the custom suite, and adding, editing, or removing custom sizes.
- Unified scheme and independent scheme strategy belongs with suite output planning, above the single-size picker.
- Provider settings should be resizeable from the lower-left corner for dense model and credential workflows.
- Provider settings list focuses on mainstream model providers and a practical OpenAI-compatible gateway path: OpenAI, AIGoCode, Google AI Studio, DeepSeek, Claude, and Qwen. Experimental Replicate, ComfyUI, and Custom HTTP rows are removed from the primary workbench settings.
- AIGoCode is treated as an OpenAI-compatible relay provider. Its Base URL stays editable, defaults to the relay `/v1` endpoint, and connection testing uses the model-list diagnostic before any paid generation path.
- Provider routing schemes should support switching, icon-based add/delete actions, and secondary editing through the active scheme name plus model-slot selects. Capability tags are removed from the bottom of the settings sheet until they map to a real workflow action.
- Sheet resize affordances should be quiet, integrated, and discoverable on hover; avoid heavy corner marks that look like broken window chrome.
- The top-right generation action is the primary workbench CTA and must visually outrank export, theme, model settings, and text-toggle controls.
