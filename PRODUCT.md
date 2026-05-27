# PRODUCT.md

## 2026-05-25 MVP Scope Update: Reference Upload And Suite Editing

Reference images and output suites are production inputs, not decorative form fields. The MVP workbench should let users see uploaded composition and style references immediately, choose the intended extraction depth, and manage custom delivery sizes without leaving the left control panel.

Product boundaries:

- Composition reference uploads show the uploaded image in the reference upload area.
- Composition extraction exposes two user intents: composition-only recognition and full image-to-prompt recognition for generating similar images.
- Style reference uploads show their image preview and expose style extraction.
- Successful composition/style extraction is stored as workspace reference analysis and is included in subsequent prompt packages.
- Reference extraction controls are gated by configured provider/API readiness and route through the existing provider settings model slots.
- The extra material-routing status card is removed from the normal left-panel flow.
- Custom output suites can be created, edited, selected, have sizes added or removed, and be deleted when they are user-created.
- Single custom size selection remains separate from suite presets but uses the same compact output section.

## 2026-05-25 MVP Scope Update: AIGoCode Gateway Provider

Users who manage model keys through AIGoCode need a first-class way to save the relay API Key, keep the relay Base URL editable, and verify connectivity before generation. This is an MVP provider-settings refinement because it extends the existing OpenAI-compatible relay path without changing the production workflow.

Product boundaries:

- AIGoCode appears as a dedicated provider row in Model and API Key settings.
- The provider uses an OpenAI-compatible Base URL and Bearer API Key authentication.
- The connection test calls the lightweight model-list diagnostic and reports ready, auth failure, degraded model availability, or unavailable states.
- API Keys continue to use the encrypted credential vault and must not appear in snapshots, route payloads, logs, or Git history.
- This step does not add a provider-specific billing dashboard, usage sync, team key sharing, or automatic model discovery UI beyond the existing diagnostic sample list.

## 2026-05-23 MVP Scope Update: OpenAI-Compatible And Google Provider Setup

Users may not have an official OpenAI API Key, but they may have an OpenAI-compatible relay key or a Google AI Studio key for Nano Banana style image generation. The MVP provider foundation should support those paths without weakening credential safety or binding the app to one model vendor.

Product boundaries:

- OpenAI provider settings may save an optional Base URL and default model together with the encrypted API Key so OpenAI-compatible relays can be tested locally.
- Google AI Studio becomes an MVP provider for image generation through the provider adapter boundary.
- Google provider support starts with connection diagnostics, image generation adapter mapping, and manual live test eligibility.
- Google API Keys follow the same encrypted credential vault rules as other providers.
- Nano Banana support means Google Gemini image models such as `gemini-3.1-flash-image-preview` or `gemini-3-pro-image-preview`; exact model availability depends on the user's Google AI Studio account and region.
- This step does not add Google-specific image editing, upscale, background removal, billing dashboards, quota management, or team credential sharing.

## 2026-05-23 MVP Scope Update: Persisted Result File Download

The desktop live test path is not complete until persisted generated files can be downloaded through the app. The MVP should expose a safe download route for local result files while keeping provider credentials and provider APIs outside the browser-facing download path.

Product boundaries:

- Persisted local result files may be downloaded through the result download route.
- The route may derive an app-local download URL for `localFile` descriptors instead of relying on hardcoded localhost ports.
- Download routing must read only from the configured result file store.
- The route must not call providers, read API Keys, use environment fallback credentials, or fetch remote provider URLs.
- Cloud storage, signed URLs, retention cleanup, bulk export packaging, and provider URL ingestion remain later work.

## 2026-05-23 MVP Scope Update: Desktop Live Test Control Surface

The manual live generation route needs a visible but guarded desktop entry so the team can test the real provider path without turning the main batch CTA into live execution.

Product boundaries:

- The workbench may show a manual live test control inside the Live Safety area and task drawer.
- The control must stay blocked until HTTP mode, a prepared queue job, OpenAI provider selection, saved credential readiness, successful connection diagnostic, and the live safety gate are all satisfied.
- Running the control calls the manual live test route and may refresh workspace results after success.
- This is still not the normal end-user generation flow; automatic live execution, one-click production live runs, billing dashboards, and retry scheduling remain separate steps.

## 2026-05-23 MVP Scope Update: Manual Desktop Live Generation Test

After provider credentials and connection diagnostics are available, the MVP needs one controlled way to prove the real generation path works from the desktop stack. This is a manual test path, not the normal batch generation button.

Product boundaries:

- Users or operators may run an explicit manual live generation test for a prepared queue job after provider connection succeeds.
- The test must use the saved encrypted credential, rerun a lightweight provider diagnostic, require live cost/external-provider/result-storage confirmations, and persist returned image bytes through local result storage.
- The test may update workspace queue, result, and archive records when it actually runs.
- The default workbench generation flow remains mock-safe; automatic live generation, billing dashboards, retries, quota management, and multi-provider live execution remain separate steps.

## 2026-05-23 MVP Scope Update: Provider Connection Diagnostics

Saved provider credentials need a safe verification path before the UI can offer real generation. Users should be able to confirm that a provider key is usable and that the selected default model appears available, without starting a paid image generation job.

Product boundaries:

- Users may run an explicit provider connection test from Model and API Key settings.
- The first live diagnostic target is a lightweight model/status probe, not image generation.
- The result may show ready, degraded, unavailable, authentication failure, model availability, and a user-safe error message.
- The diagnostic may update workspace provider readiness metadata, but it must never store or return clear-text API Keys.
- Real generation, billing dashboards, quota management, automatic retries, and provider-specific deep capability tests remain separate steps.

## 2026-05-23 MVP Scope Update: Encrypted Provider Credential Vault

API Key setup now moves from static readiness display toward a real local credential boundary. Users need provider keys to survive workbench actions without turning project snapshots, local drafts, database rows, route payloads, or result metadata into secret stores.

Product boundaries:

- Users may save, inspect, and revoke a provider API Key through a credential-specific surface.
- The app may return only masked credential status and a `ProviderCredentialRef`.
- Workspace provider settings may mirror `hasApiKey`, `apiKeyMasked`, status, model, and base URL only.
- Clear-text API Keys must be encrypted inside a dedicated credential vault and resolved only by `CredentialResolver` during explicit live execution.
- Team sharing, OS keychain integration, cloud secret managers, credential rotation policy, and billing account controls remain later.

## 2026-05-23 MVP Scope Update: Workbench Live Gate Visibility

The workbench should make live-run readiness visible before real provider controls are wired. Users need to see whether live execution is off, blocked, or ready for a manual test, and why.

Product boundaries:

- The static workbench may display live gate status, confirmations, accepted cost cap, and blocker reasons.
- The primary generation button remains a static/mock-safe flow until an explicit live desktop test path is added.
- Gate UI copy must distinguish “ready for manual test” from “already running live generation.”
- Runtime API Key entry remains in provider settings; clear-text keys are not shown or saved.

## 2026-05-23 MVP Scope Update: Live Execution Safety Gate

Real provider execution must feel intentional and reversible from the user's point of view. The MVP requires a safety gate before any desktop or UI path can trigger live generation.

Product boundaries:

- Users must explicitly confirm a live run, provider cost responsibility, external-provider execution, and result storage before live queue execution.
- Live execution must be blocked when runtime credentials, HTTP transport, or result file storage are unavailable.
- A max accepted cost must be captured and compared with the estimated queue cost before execution.
- The gate returns user-safe blocker messages that can be shown in the workbench.
- This step does not add billing integration, invoices, automatic retry scheduling, or production account controls.

## 2026-05-23 MVP Scope Update: Explicit Live Queue Execution

Live generation becomes useful only when a queued production job can call a provider, persist returned image bytes, and recover result records after refresh. This is an MVP foundation capability, but it must remain explicitly enabled until product-level cost controls and UI confirmation are complete.

Product boundaries:

- Live queue execution may run only when the caller supplies an explicit live flag, runtime credential reference/resolver, provider registry, and result file store.
- OpenAI image generation is the first live target; brief planning may still use a mock-safe bridge until a live concept model adapter is chosen.
- Generated `dataUrl` outputs should be persisted as local result files and stored in snapshots as metadata, not raw base64.
- Default local workbench runs and automated checks remain mock-safe and billing-free.
- Live post-processing, provider URL ingestion, cost approval UI, retry scheduler, and encrypted credential vault remain later steps.

## 2026-05-22 MVP Scope Update: Result File Storage

Generated assets need a stable result storage location before real live queue execution can be considered usable. The MVP local path stores generated image bytes as result files and keeps workspace records pointed at metadata, not raw binaries.

Product boundaries:

- Persisted result files can support refresh-safe download, archive, and later post-processing.
- Result records may reference local file metadata through a storage key and checksum.
- The first implementation supports local filesystem storage for generated `dataUrl` image outputs.
- Cloud storage, signed URLs, provider URL ingestion, file cleanup, and team permissions remain later integration work.

## 2026-05-22 MVP Scope Update: Runtime API Key Sessions

Live generation needs API keys, but user secrets are not project content. The MVP foundation should treat API keys as temporary runtime credentials until an encrypted vault is implemented.

Product boundaries:

- Users may provide a provider API key for the current runtime session.
- The app may show masked credential state and pass a credential reference to execution.
- Clear-text API keys must not be saved to workspace snapshots, local drafts, database rows, result metadata, or logs.
- Runtime credentials can expire or be revoked, and live execution must surface that as a provider-ready error.

## 2026-05-22 MVP Scope Update: Manual Live Provider Verification

Before real queue execution is enabled, the product needs a narrow manual verification path for provider connectivity. This is a developer/operator readiness step, not an end-user generation flow.

Product boundaries:

- Manual live smoke testing may call OpenAI only after explicit runtime opt-in.
- The smoke test may report provider readiness, error code, model, size, and asset source type.
- The smoke test must not persist API keys, generated files, or workspace state.
- Passing smoke does not mean live queue execution is enabled; queue wiring remains a later gated step.

## 2026-05-22 MVP Scope Update: Opt-In OpenAI Image Adapter

OpenAI image generation is an MVP provider target, but it must enter through the provider adapter boundary rather than the UI, queue worker, or route handlers directly.

Product boundaries:

- OpenAI image generation can be implemented as an opt-in adapter for text-to-image output.
- The default local workbench remains mock-safe until the user explicitly provides credentials and a live registry/transport.
- Reference-image fidelity, image edits, upscale, background removal, billing controls, and result binary storage remain separate steps.
- API keys remain runtime secrets and must not be saved in workspace snapshots or static fixtures.

## 2026-05-21 MVP Scope Update: Queue Worker And Result Recovery

The MVP production loop is not complete until generated outputs and post-processing outputs are written back to the workspace. Queue execution must preserve task state and result lineage so users can refresh, inspect, retry, archive, and export assets later.

Product boundaries:

- Queue workers produce result records with project, scheme, job, task, mode, model, platform, dimensions, provider result id, and metadata.
- Image generation, local redraw, upscale, and background removal outputs all become result assets.
- Archive rows are derived from result records and remain recoverable from the workspace snapshot.
- Static verification uses mock providers only; live worker execution remains a later provider/storage integration.

## 2026-05-21 MVP Scope Update: Provider Credential Boundary

Real image generation depends on provider configuration, but provider secrets are not workspace content. MVP implementation must separate provider settings from clear-text credentials.

Product boundaries:

- Users can configure provider readiness, default model, model slots, and masked API key state.
- Workspace recovery can restore provider configuration state but not clear-text API keys.
- Runtime execution may resolve credentials through a credential reference supplied by a secure resolver.
- Static prototypes and route handlers must not display, persist, or echo clear-text API keys.

## 2026-05-21 MVP Scope Update: Asset Upload And Library Boundary

The MVP requires users to attach game characters, logos, backgrounds, props, UI screenshots, style references, composition references, and subject references to a workspace. The first implementation defines upload planning and asset library records only; it does not handle real binary uploads yet.

Product boundaries:

- Asset slots are mode-aware, so Poster, Collab, Announcement, Logo, and Icon can ask for the right references.
- Upload validation covers role, file name, mime type, size, label, usage, and storage key planning.
- The asset library stores metadata and references that can be reused by prompt generation, provider request mapping, and result history.
- Real cloud storage, image preprocessing, malware scanning, permissions, and file CDN delivery are later integration work.

## 2026-05-21 MVP Scope Update: Database Persistence Foundation

The MVP needs recoverable workspaces, task state, results, assets, and provider configuration state. Database persistence is therefore part of the product foundation, but the first implementation is limited to schema and repository boundaries.

Product boundaries:

- A saved workspace must be restorable from a full redacted workspace snapshot.
- Assets and generated results store metadata, storage references, lineage, and dimensions, not raw image binaries.
- Provider API keys are not product data and must not be persisted in clear text.
- Real authentication, encrypted credential storage, and production database hosting remain follow-up integration steps after the repository boundary is stable.

## 2026-05-21 MVP Scope Update: Persistence Boundaries

The MVP requires a recoverable project workspace model before real database or upload integration. A saved workspace must preserve project inputs, reusable assets, brand assets, character profiles, production mode settings, generated scheme briefs, queue state, result records, archive records, and provider configuration state.

Important MVP boundaries:

- Project recovery and task recovery are product requirements, but the current static prototype still does not connect to a real database.
- Asset records store references and metadata, not image binaries.
- Result records store lineage, dimensions, model, platform, language, and source task metadata.
- Provider API Keys must never be persisted in clear text. Saved provider settings can only keep masked values and connection state.

## 2026-05-20 MVP Scope Update: Five Production Modes

This update adds a mode layer to the existing batch creative workbench. The workbench must support five static production modes in MVP planning:

- Poster: the existing general game marketing poster workflow.
- Collab: co-branded campaign visuals with separate game and partner IP assets.
- Announcement: game announcement visuals with preset copy and typography layout modes.
- Logo: 3D game wordmark/logo output with strict solid-color background constraints.
- Icon: 1:1 app/game icon output with full-bleed square composition and no text.

Mode switching changes the left production configuration, asset slot requirements, central scheme brief logic, prompt guardrails, and right inspector context. It must not create separate unrelated products.

Critical MVP guardrails:

- Collab mode must keep character appearance locked to uploaded references. The LLM may use `[Game Character]` and `[Collab Partner]` placeholders during brief planning, but must not invent appearance, clothing, or facial features.
- Collab mode must prevent merging game and partner characters into one entity.
- Announcement mode must support preset copy categories and two typography layout modes: integrated 3D scene typography and regular in-game announcement panel.
- Announcement mode must detect multiple character references as a group-shot planning context.
- Logo mode must treat the 3D wordmark as the main subject and enforce a pure solid-color background in prompt rules.
- Icon mode must lock output to 1:1, require full-canvas square fill, prohibit text, and stay faithful to uploaded visual references.

Beta or later quality checks:

- Automated Logo background purity detection.
- Automated Icon text/no-border/no-rounded-corner detection.
- Pixel-level output correction and asset preprocessing beyond static UI.

## 2026-05-19 MVP Scope Update: Theme, Provider, And Workspace Chrome

This update clarifies foundational MVP capabilities that affect the static workbench and later implementation.

- Light and Dark themes are part of the MVP workbench foundation. Light remains the default; Dark is designed separately, not as a simple inverted palette.
- Model and API Key management is an MVP foundation because image generation, post-processing, and model routing depend on provider configuration.
- Supported provider configuration targets for MVP planning: OpenAI, Replicate, ComfyUI, and Custom HTTP.
- API Key UI must support enabled state, masked key display, default model selection, static connection status, and a test connection action. The static prototype does not save or call real credentials.
- Provider adapter remains the required architecture boundary. Product logic must not bind directly to one image model or one provider.
- The bottom task area should default to a slim status bar and expand into a task drawer only when needed.
- The right inspector should default to a collapsible rail and expand when a scheme or result is selected; users can pin it open.

## 产品目标

本项目是一个面向游戏宣发素材的一键式 AI 图片生成工作台。用户输入游戏名称、游戏描述、游戏素材、品牌资产、角色参考和构图参考后，系统生成多套游戏海报、icon、商店图、广告图等视觉方案，并支持批量出图、后处理、筛选和平台规格导出。

产品目标不是做一个简单的生图表单，而是做一个游戏视觉素材生产流水线：

- 降低游戏团队生成宣发视觉的门槛。
- 提高买量、发行、美术团队探索创意方向的速度。
- 支持从创意方案、提示词、批量生成到后处理的完整闭环。
- 让生成结果更贴合游戏品牌、角色设定、平台规格和宣传目的。
- 让结果图片成为界面主角，工具本身保持专业、密集、清晰。

## 目标用户

### 独立游戏开发者

缺少完整美术和发行团队，需要快速生成商店页主图、社媒海报、活动图和广告素材。

### 游戏发行团队

需要围绕不同平台、语言、卖点快速生成多套视觉方向，用于宣发、测试和沟通。

### 买量团队

需要批量生成适合 TikTok、Meta Ads、Google Play 等平台的素材，支持快速 A/B 测试。

### 游戏美术与外包设计师

需要用 AI 快速探索构图、风格、光影、宣传词和版式方向，作为初稿或参考。

## 核心流程

1. 创建游戏项目。
2. 填写游戏名称、游戏描述、品类、核心卖点、目标用户。
3. 上传游戏素材，包括角色、logo、背景、道具、UI 截图、参考图。
4. 配置品牌资产库，包括主色、logo、字体风格、禁用元素、固定品牌词。
5. 配置角色一致性，包括角色参考图、角色描述、角色锁定开关。
6. 选择平台规格，例如 Steam、App Store、Google Play、TapTap、TikTok、Meta Ads。
7. 设置生成参数，包括方案数量、每方案图片数量、比例、尺寸、模型、画风。
8. 选择宣传词模式，支持关闭、自动生成、全局宣传词。
9. 选择多语言宣传词，至少支持中文、英文、日文、韩文。
10. 可选开启侧重点引导，限制随机方案的发散范围。
11. 可选上传构图参考，支持弱参考、构图参考、高质量构图参考。
12. 系统先生成多套设计方案 brief。
13. 用户检查方案，锁定宣传词、角色、构图、画风或平台规格。
14. 用户一键批量生成图片。
15. 用户在结果画廊中筛选、收藏、下载。
16. 用户对结果进行局部重绘、高清放大、背景移除。
17. 用户按平台规格导出。

## 工作台体验目标

主工作台采用明亮中性专业创意生产台方向，并融合游戏发行后台和创意导演式画布的优点。

- 使用 Figma 式三栏工作台：左侧控制区、中央画布、右侧检查器。
- 使用 Runway 式任务和素材管理：素材、任务、结果都可追踪。
- 使用 Midjourney / Magnific 式结果派生：生成结果可继续变体、放大、重绘和筛选。
- 使用 Canva 式平台规格选择：用户按平台和用途选择尺寸，不需要记忆参数。
- 不做营销落地页、大圆角卡片、过多渐变、玩具感或空洞科技感。

### 确认的主工作台模型

主工作台采用“批量生成生产台”模型，而不是普通 SaaS 后台、聊天式生图器或自由设计画布。

- 左侧是生产配置区，承载项目输入、素材引用、参考图、风格、尺寸、数量、宣传词和高级参数。
- 中央是生产板，优先展示方案卡网格、方案组结果、文本展开态和结果空状态。
- 右侧是上下文检查器，只服务当前选中的方案或图片。
- 顶部是全局动作区，承载项目切换、展开文本、收藏夹、档案馆、停止任务和批量渲染。
- 任务反馈以 toast、轻量队列和卡片内状态为主，不用大面积任务面板压过中央生产板。
- 结果管理包含收藏、归档、查看大图、下载、重新生成、变体和后处理入口。

## MVP 范围

MVP 必须包含：

- 游戏项目管理。
- 游戏信息输入。
- 素材上传与素材库。
- 品牌资产库。
- 角色一致性基础能力。
- 随机海报设计方案生成。
- 方案数量和每方案出图数量配置。
- 图片比例、尺寸、平台规格选择。
- 生图模型选择。
- 画风选择。
- 构图参考和提示词提取。
- 宣传词模式。
- 多语言宣传词。
- 侧重点引导。
- 一键批量生成。
- 局部重绘。
- 高清放大。
- 背景移除。
- 生成任务队列。
- 结果画廊。
- 方案卡网格。
- 按方案组展示多比例结果。
- 结果大图预览。
- 基础档案馆。
- 按平台导出。
- 五种生产模式：海报、联名、公告、Logo、Icon。
- 模式专属资产槽位、Prompt 规则和检查器上下文。
- 联名角色防变异与防融合安全机制。
- Logo 纯色背景和字标主体约束。
- Icon 1:1 锁定、无文字和满铺直角约束。

## Beta 范围

Beta 版本重点提高协作、管理和稳定性：

- 团队协作。
- 项目成员权限。
- 共享链接。
- 版本管理。
- 生成成本统计。
- 生成质量评分。
- 批量重跑。
- 更多平台模板。
- 素材标签体系。
- 提示词模板管理。
- 合规和版权风险提醒。
- 项目级默认设置。
- 更完整的发行后台视图，包括活动、平台交付状态和导出进度。
- Logo 背景纯色度检测。
- Icon 输出文字检测、边框检测和圆角检测。
- 更完整的多角色关系控制与质量评分。

## 后续增强

- 私有模型或 LoRA 工作流。
- 多角色关系控制。
- 自动 A/B 测试素材命名。
- 广告投放包导出。
- AI 选图助手。
- 多人评论批注。
- 品牌手册自动生成。
- 素材版权来源管理。
- 与 ComfyUI、Stable Diffusion 私有工作流深度集成。
- 与广告平台、应用商店、Steam 后台打通。
- 创意导演模式，提供更强的画布、版本流和视觉探索体验。

## 明确不做

MVP 不做：

- 完整游戏开发工具。
- 视频生成和视频剪辑。
- 3D 建模、骨骼动画、动画绑定。
- 广告账户投放管理。
- 私有模型训练平台。
- 复杂团队审批流。
- 移动端完整创作体验。
- 复制受版权保护的游戏角色、商标、IP 或具体画面。
- 营销落地页作为主入口。

构图参考功能只用于参考构图关系、镜头语言、光影、色彩、版式和文字区域，不用于复刻受版权保护的具体内容。

## 成功指标

### 效率指标

- 新用户能在 3 分钟内完成第一次方案生成。
- 用户能在 10 分钟内从项目创建走到一批可下载结果。
- 批量生成任务失败后可单张重试，无需重建整批任务。

### 质量指标

- 生成方案能体现游戏名称、游戏描述、核心卖点和侧重点。
- 角色一致性在同一批任务中保持基础稳定。
- 宣传词与游戏主题、平台、语言相匹配。
- 平台规格导出的尺寸准确。
- 中央结果区中的图片比界面装饰更突出。

### 使用指标

- 用户愿意收藏或下载生成结果。
- 用户愿意基于同一方案继续重绘、放大或生成变体。
- 用户能复用品牌资产库和角色资产，而不是每次重新上传。
- 高频用户能通过左中右工作台快速完成批量任务。
