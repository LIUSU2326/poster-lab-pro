# TESTING.md

## 2026-06-02 1.1.0-alpha.3 Logo Text Strategy Release Update

Desktop Test Path checks:

- Verify the visible app version is `1.1.0-alpha.3`.
- Verify the desktop bundle path is `release/mac/Poster Lab Pro.app`.
- Verify Logo prompt packages include a locked `Logo Text Strategy` section.
- Verify short simple wordmarks can request exact spelling with visual review.
- Verify complex wordmarks use `copySafeBlankWordmark` and ask for a polished blank wordmark plate, emblem, badge, or mark system for later vector/text refinement.
- Verify Logo Result Quality Audit stores `logoTextStrategy` and flags `logo-copy-safe-wordmark-fallback` for complex lettering.
- Verify Google and OpenAI live image prompts repeat the Logo Text Strategy lock without adding provider calls to automated checks.

Automated checks:

- Run `npm run prompts:check`.
- Run `npm run provider-requests:check`.
- Run `npm run google-live-adapter:check`.
- Run `npm run openai-live-adapter:check`.
- Run `npm run result-quality-audit:check`.
- Run `npm run check`.

## 2026-06-02 1.1.0-alpha.2 Icon Quality Release Update

Desktop Test Path checks:

- Verify the visible app version is `1.1.0-alpha.2`.
- Verify the desktop bundle path is `release/mac/Poster Lab Pro.app`.
- Verify `/Users/liusu/Desktop/Poster Lab Pro.app` is replaced only after `npm run check` and `npm run desktop:pack:mac` pass.
- Verify Icon results that trigger `icon-rounded-mask-risk` receive local `iconPostProcessing.strategy = "iconCanvasEdgeRepair"`.
- Verify the repaired Icon result is re-audited and no longer carries `icon-rounded-mask-risk` in the automated fixture.
- Verify this repair is local-only, token-free, and does not call image providers.

Automated checks:

- Run `npm run result-quality-audit:check`.
- Run `npm run queue-worker:check`.
- Run `npm run desktop-test-path:check`.
- Run `npm run release-candidate:check`.
- Run `npm run check`.

## 2026-06-02 1.1.0-alpha.1 Result Quality Audit Release Update

Desktop release checks:

- Verify the visible app version is `1.1.0-alpha.1`.
- Verify the desktop bundle path is `release/mac/Poster Lab Pro.app`.
- Verify `/Users/liusu/Desktop/Poster Lab Pro.app` is replaced only after `npm run check` and `npm run desktop:pack:mac` pass.
- Verify result cards and the result viewer surface `metadata.qualityAudit` as lightweight review guidance.
- Verify Result Quality Audit remains local-only, token-free, and does not mutate final generated pixels.

Automated checks:

- Run `npm run result-quality-audit:check`.
- Run `npm run release-candidate:check`.
- Run `npm run desktop-test-path:check`.
- Run `npm run check`.

## 2026-06-02 1.1 Result Quality Audit Update

Result Quality Audit checks:

- Verify `npm run result-quality-audit:check` passes.
- Verify generated results can store `metadata.qualityAudit` without changing image pixels.
- Verify Icon audit can flag transparent or dark rounded-corner mask risk.
- Verify Logo audit adds a text accuracy review finding.
- Verify Announcement audit adds a copy-safe review finding.
- Verify Collab audit flags missing partner `brandLogo` so the UI can later ask for a blank partner plate or partner logo upload.
- Verify result cards and the result viewer surface `metadata.qualityAudit` as lightweight review guidance.
- Verify the audit is local-only and token-free.

## 2026-06-02 1.0.0-beta.3 Real Generation Acceptance Update

Real generation checks:

- Poster: one Google live image run with uploaded character, BOSS/key subject, logo, and composition reference.
- Icon: one Google live image run using uploaded subject identity as an integrated redraw reference.
- Logo: one Google live image run with Logo mode wordmark/mark-first constraints.
- Announcement: one Google live image run with copy-safe panel constraints.
- Collab: one Google live image run with separate game and partner identities.
- Total live cost for this acceptance pass was about USD 0.25.
- All checked outputs used AI integrated redraw; local overlay was not applied.

Accepted fixes from the pass:

- Shared prompt rules now forbid new shield/weapon/tool/accessory details unless visible in uploaded references.
- Google and OpenAI live adapters now repeat the same subject accessory lock in final provider prompts.
- Collab prompts now forbid fake partner brand names, fake sponsor logos, and readable partner wordmarks when no partner `brandLogo` was uploaded.
- Missing partner brand identity should become a polished blank partner brand plate, neutral emblem, or copy-safe lockup.

Regression checks:

- Verify the desktop bundle path is `release/mac/Poster Lab Pro.app`.
- Run `npm run prompts:check`.
- Run `npm run provider-requests:check`.
- Run `npm run google-live-adapter:check`.
- Run `npm run openai-live-adapter:check`.
- Run `npm run check` before packaging.
- Verify the visible app version is `1.0.0-beta.3`.

Known beta watch items:

- Icon mode can still inherit an app-icon mask or dark rounded-container prior; keep this for 1.1 icon-specific post-processing.
- Logo spelling remains model-dependent; keep dedicated logo/text refinement for 1.1.
- Announcement should prefer editable blank copy-safe areas when exact operational copy matters.
- Collab should reserve blank partner brand areas unless the user uploads an explicit partner logo.

## 2026-06-02 1.0.0-beta.2 UX Regression Update

UX regression checks:

- Verify the top `实机安全` chip opens settings and exposes the live gate panel path.
- Verify settings shows the setup order: save API Key, test connection, pass live gate, then generate.
- Verify blocked scheme/result empty states include an enabled `打开实机安全闸` action next to disabled generation buttons.
- Verify Icon and Logo modes do not expose editable slogan controls.
- Verify Poster, Announcement, and Collab modes keep the slogan controls available.
- Verify queue and safety status copy reads like pending setup, not like a failed generation.

Automated checks:

- Run `npm run workbench-live-gate-ui:check`.
- Run `npm run provider-credential-ui:check`.
- Run `npm run frontend-binding:check`.
- Run `npm run check` before packaging.

## 2026-06-02 1.0 Beta Multi-Mode Validation Update

Desktop Test Path checks:

- Verify `npm run check` passes after prompt, provider, storage, and UX changes.
- Verify `npm run prompts:check`, `npm run provider-requests:check`, `npm run google-live-adapter:check`, and `npm run openai-live-adapter:check` preserve shared asset fusion rules.
- Verify `npm run storage:check`, `npm run workspace-data:check`, and `npm run workspace-state:check` preserve workspace summary freshness after assets, queue jobs, results, and archive rows change.
- Verify the visible app version is `1.0.0-beta.2`.

Manual multi-mode live checks:

- Icon: one low-cost run; accept only `1:1`, no text, single strong subject, and 64px readability.
- Logo: one low-cost run; accept only wordmark/mark-first output with no BOSS or unrelated prop pollution.
- Announcement: one low-cost run; accept only a clear copy-safe area and no generated gibberish.
- Collab: one low-cost run; accept only two separated parties in a shared scene, not a merged hybrid.
- Do not add these live provider calls to automated checks because they can spend provider credits.

Known beta watch items:

- Image models may still prefer rounded app-icon masks in Icon mode; keep this as a manual review item until an icon-specific crop/background post-process is added.
- Complex generated text can still drift; prefer copy-safe regions or post-production text refinement over forcing unreadable AI text.
- If local network routing requires a proxy, run the dev server with the same proxy environment as the desktop shell.

## 2026-05-28 Generation Flow Rule Update

Poster generation checks:

- Verify the left control-panel batch action creates brief/scheme tasks only and no image-generation tasks.
- Verify the top-right Generate Poster action and scheme-card Render Image action continue from ready schemes and create image tasks.
- Verify a brief-only queue updates the intended pending scheme ids instead of falling back to fixture scheme ids.
- Verify Google/Nano image generation requests include uploaded local/data reference images as inline provider parts when available.
- Verify scheme card copy-hidden and copy-visible states do not overlap image previews, variant buttons, or render buttons.
- Verify poster mode can create new schemes with no uploaded assets.
- Verify `styleReference`, `compositionReference`, and `gameLogo` are optional for poster batches and only strengthen the prompt when present.
- Verify the slogan language control stores exactly one selected language, defaulting to English.
- Verify provider brief requests send exactly one `languageTargets` entry and generated schemes keep slogans for that language only.
- Verify multiple uploaded `gameCharacter` assets are described as independent characters, not alternate looks for one character.
- Verify failed image tasks expose a one-click retry-all action that retries failed image tasks without rerunning the brief stage.
- Verify size stabilization keeps provider-native dimensions when exact, applies local resize only for close aspect-ratio matches, and records post-processing metadata.
- Verify queue checks allow the intentionally removed bottom task chrome while still validating queue contracts and runtime feedback.

Real provider tests remain manual and opt-in because image calls can spend provider credits. Automated checks should prefer fake transports and stored snapshots.

## 2026-05-24 Electron Desktop Shell Testing Update

Electron Desktop Shell checks:

- Verify `electron/main.cjs` opens the local Next workbench through a native `BrowserWindow`.
- Verify the shell reuses an existing Next service or starts `next dev` on a local port.
- Verify proxy-related environment variables are preserved for manual provider connection tests.
- Verify Electron main/preload code does not call provider APIs, read API Keys, or use browser credential storage.
- Verify packaged installer checks remain separate from the fast desktop dev shell.

Real live provider execution remains manual and opt-in from inside the workbench UI.

## 2026-05-24 Electron Packaging Testing Update

Electron Packaging checks:

- Verify `next.config.mjs` uses standalone output for the packaged desktop server.
- Verify `npm run desktop:pack` prepares `.next/standalone`, copies `.next/static` and `public`, and builds a portable unpacked Windows app.
- Verify `electron/main.cjs` starts the packaged standalone server with `ELECTRON_RUN_AS_NODE` when running from a packaged app.
- Verify `release/win-unpacked/Poster Lab Pro.exe` opens without a manually started Next dev server.

The packaged path is still local MVP testing, not a signed installer or production distribution flow.

## 2026-05-23 OpenAI-Compatible And Google Provider Testing Update

Provider setup checks:

- Verify provider settings can save API Key, Base URL, and default model without exposing clear-text keys in workspace snapshots.
- Verify OpenAI-compatible relay Base URLs are used for connection tests and image generation requests.
- Verify Google connection diagnostics call the Gemini model-list endpoint with API-key authentication and user-safe errors.
- Verify Google image generation maps Gemini `inlineData` image parts to persisted result files.
- Verify manual live tests for Google use the same safety gate, encrypted credential vault, queue worker, and result storage path as OpenAI.
- Verify default automated checks use fake transports and never call real OpenAI, relay, or Google endpoints.

Real provider tests remain manual and opt-in because they can spend provider credits and depend on account/model availability.

## 2026-05-23 Persisted Result File Download Testing Update

Persisted result download checks:

- Verify `localFile` descriptors expose a safe app-local download URL when returned from the route.
- Verify descriptor JSON remains the default route response.
- Verify binary delivery requires `?file=1` and reads only through the local result file store.
- Verify binary responses include content type, content length, content disposition, checksum, and storage-key headers.
- Verify missing or non-local result sources return user-safe errors without provider calls.
- Verify the route does not read API Keys, environment fallback credentials, browser storage, or remote provider URLs.

Cloud storage, signed URLs, bulk export archives, provider URL ingestion, and retention cleanup remain later checks.

## 2026-05-23 Desktop Live Test Control Surface Update

Desktop live test control checks:

- Verify the live test button is disabled until HTTP mode, an OpenAI-compatible or Google provider, saved credential readiness, and an allowed live gate are present.
- Verify clicking the button can auto-prepare the local queue job, refresh credential status, and run the provider connection diagnostic before calling `/queue-plans/:jobId/live-test`.
- Verify clicking the button posts only to `/queue-plans/:jobId/live-test` and never calls provider APIs directly from the browser.
- Verify the request body includes explicit enablement, safety confirmations, accepted cost cap, and trace id.
- Verify successful route envelopes update manual test status and refresh the workspace snapshot.
- Verify blocked/error envelopes are shown in the task drawer without exposing clear-text API Keys or raw image payloads.
- Verify responsive viewports `1440`, `1024`, `768`, and `375px` do not overlap or overflow after the new control is visible.

Real live provider execution remains manual and opt-in; automated UI checks should use fake route envelopes or blocked states.

## 2026-05-23 Manual Desktop Live Generation Test Update

Manual live generation test checks:

- Verify the route blocks unless live execution is explicitly enabled and all cost/external-provider/result-storage confirmations are present.
- Verify the route resolves the saved credential only through the encrypted vault and never echoes the clear-text API Key.
- Verify the route reruns a provider connection diagnostic and blocks image generation when the diagnostic is not ready.
- Verify fake transports can complete the OpenAI live queue path and persist result files.
- Verify workspace snapshots contain result file metadata, not raw provider `dataUrl` payloads or clear-text credentials.
- Verify default automated checks use fake provider transports and do not call real provider APIs.

Real live generation remains manual and opt-in because it can spend provider credits and create local artifacts.

## 2026-05-23 Provider Connection Diagnostics Testing Update

Provider diagnostic checks:

- Verify connection tests resolve credentials through the encrypted vault and never echo clear-text API Keys.
- Verify missing saved credentials block before network probes.
- Verify OpenAI model-list responses map to ready status and default model availability.
- Verify 401/403, 429, quota, 5xx, timeout, and network failures map to user-safe statuses.
- Verify default automated checks use fake transports and do not call live provider APIs.
- Verify the settings UI can show idle, testing, ready, unavailable, and failed connection states.

Real provider diagnostics are manual and opt-in because they require user credentials, network access, and provider account availability.

## 2026-05-23 Encrypted Provider Credential Vault Testing Update

Credential vault checks:

- Verify saving a provider API Key returns only masked status and a `secretStore` credential reference.
- Verify encrypted vault records do not contain the clear-text API Key.
- Verify resolving a valid credential ref returns the clear-text key only through `CredentialResolver`.
- Verify revoke clears the vault record and updates workspace provider status to masked/unconfigured.
- Verify credential routes do not call live providers, browser storage, or provider adapters.
- Verify workspace snapshots keep only `hasApiKey`, `apiKeyMasked`, provider status, model, and base URL.

OS keychain integration, cloud secret managers, team permission checks, browser autofill, and live provider quota tests remain separate tracks.

## 2026-05-23 Workbench Live Gate UI Testing Update

Workbench live gate UI checks:

- Verify the static workbench renders live gate status without calling provider APIs.
- Verify confirmation toggles update the visible gate state and blocker list.
- Verify cost cap values use monospace formatting and can block the gate when below estimated cost.
- Verify top toolbar, left Engine section, right inspector, and task drawer reference the same gate state.
- Verify responsive viewports `1440`, `1024`, `768`, and `375px` have no overlap or horizontal overflow.

Real provider UI execution remains disabled until a separate manual desktop live test path is approved.

## 2026-05-23 Live Execution Safety Gate Testing Update

Safety gate checks:

- Verify disabled live execution returns `skipped` and cannot call provider transport.
- Verify missing live-run, provider-cost, external-provider, or result-storage confirmations return structured blockers.
- Verify estimated cost above the accepted cap blocks execution before provider calls.
- Verify missing runtime credential, HTTP transport, or result file storage blocks execution.
- Verify allowed gate decisions can run OpenAI live queue through fake transport and persist result files.
- Verify blocker messages are user-safe and do not expose API keys or generated image bytes.

UI modal, real billing, production account limits, retry scheduling, and live provider quota tests remain manual/later.

## 2026-05-23 Explicit Live Queue Wiring Testing Update

Live queue wiring checks:

- Verify live queue execution skips unless an explicit live flag is provided.
- Verify missing runtime API key or missing HTTP transport blocks before provider adapter execution.
- Verify OpenAI image execution can run through a fake transport, runtime credential resolver, and injected provider registry.
- Verify returned `dataUrl` images are persisted through the result file store and snapshots record `resultFile` metadata.
- Verify persisted results do not keep raw provider `dataUrl` payloads in workspace metadata.
- Verify default queue worker checks still use mock providers and do not call live network APIs.

Real OpenAI queue execution remains manual/opt-in and should not be part of `npm run check` until product cost controls and UI confirmation are ready.

## 2026-05-22 Result File Storage Testing Update

Result file storage checks:

- Verify image `dataUrl` payloads decode to bytes and are written under workspace/result-scoped storage keys.
- Verify unsafe workspace ids, result ids, or filenames are sanitized and cannot escape the configured result root.
- Verify stored metadata includes mime type, byte size, checksum, storage key, and optional public URL.
- Verify result download descriptors prefer persisted local file metadata over transient provider metadata.
- Verify binary reads happen only in the explicit `?file=1` download route and only through the configured local result file store.
- Verify the file store does not call provider adapters, read environment variables, use browser storage, or perform network requests.

Cloud storage, signed URLs, provider URL fetching, retention cleanup, and bulk export packaging remain later.

## 2026-05-22 Runtime API Key Session Testing Update

Runtime credential checks:

- Verify creating a runtime session returns only a masked `ProviderCredentialRef`.
- Verify clear-text API keys do not appear in session DTOs, provider configs, or result summaries.
- Verify resolving a valid runtime ref supplies the key only through `CredentialResolver`.
- Verify expired, revoked, missing, and provider-mismatched refs return structured provider errors.
- Verify provider execution can consume the runtime resolver without changing mapped request or stored config contracts.
- Verify the runtime store does not call network APIs, read environment variables, write files, or use browser storage.

Encrypted credential vaults, team permission checks, browser autofill behavior, and persistent API Key settings remain separate test tracks.

## 2026-05-22 Manual OpenAI Live Smoke Command Testing Update

Manual OpenAI smoke checks:

- Verify the command refuses to run unless explicit live opt-in is present.
- Verify missing runtime API key blocks before adapter execution.
- Verify fake success responses produce a redacted result summary without printing image bytes.
- Verify fake provider failures map to structured provider error summaries.
- Verify the safe checker does not perform real network calls, read environment variables, persist credentials, or save result files.

The real command is manual only. It should not be part of default CI/local checks and should only be run when the user accepts provider cost and has a disposable test prompt.

## 2026-05-22 OpenAI Image Adapter Testing Update

OpenAI adapter checks:

- Verify the adapter serializes image generation to `/images/generations` with explicit provider config and injected transport.
- Verify missing API key returns a structured auth/config failure before transport execution.
- Verify URL and base64 image response formats both become provider result assets.
- Verify provider error statuses such as `429` map to structured retryable provider errors.
- Verify the default provider executor and live stub registry remain mock/stub-backed and do not call OpenAI automatically.
- Verify adapter tests use fake transports only and do not read environment variables, browser storage, or credential files.

Real OpenAI smoke tests remain manual and opt-in until credential vault, budget controls, provider fixtures, and result binary storage are ready.

## 2026-05-22 Queue Feedback Testing Update

Queue feedback checks:

- Verify current stage labels are derived from running tasks first, then failed tasks, then job status.
- Verify cost labels prefer actual cost when available and fall back to estimated cost.
- Verify elapsed time labels are stable for seconds and minutes.
- Verify failed tasks expose provider error code, retryability, attempts, and user-safe message.
- Verify feedback helpers do not call providers, network APIs, browser storage, or filesystem APIs.

## 2026-05-22 Desktop Test Path Update

Desktop local acceptance checks:

- Run `npm run check` before manual browser testing.
- Run `npm run poster-chain:check` to verify the first production path.
- Run `npm run build:next` before treating the route-backed workbench as locally testable.
- Launch `npm run dev:next` and inspect the workbench at the local Next URL.
- Keep live provider smoke tests disabled unless a future task explicitly opts in with credentials and cost controls.

Viewport checks still apply for UI work: `1440`, `1024`, `768`, and `375px`.

## 2026-05-22 Poster Production Chain Testing Update

Poster production chain checks:

- Verify a Poster workspace can create an image prompt package with required provider-ready assets.
- Verify the prompt maps to an image-generation provider request.
- Verify local API queue creation and queue run produce stored result records.
- Verify the first generated result resolves through the result download descriptor.
- Verify the chain remains mock-provider-backed and does not call live APIs, read environment variables, persist credentials, or write result files.

This is the first desktop acceptance path. Collab, Announcement, Logo, and Icon should reuse the same pattern after Poster stays green.

## 2026-05-22 Result Download Descriptor Testing Update

Result download checks:

- Verify stored results with `assetUrl` resolve to an available download descriptor.
- Verify mock provider `dataUrl` metadata resolves to an inline descriptor without filesystem access.
- Verify missing result ids return a structured `not_found` API failure.
- Verify unavailable results return a typed unavailable descriptor instead of a broken link.
- Verify the descriptor route does not read local files, write binaries, call providers, use browser storage, or call network APIs.

Real binary storage, signed URLs, export packaging, and retention cleanup remain separate test tracks.

## 2026-05-22 Live Provider Smoke Harness Testing Update

Live provider smoke harness checks:

- Verify the harness returns `skipped` unless explicit opt-in is provided.
- Verify enabled smoke execution uses injected provider registry and credential resolver inputs only.
- Verify missing credentials return structured provider auth/config failures before adapter execution.
- Verify disabled live provider stubs return structured `provider_unavailable` through the harness.
- Verify the harness does not call network APIs, read environment variables, write files, use browser storage, or persist clear-text secrets.

Real provider smoke runs remain manual and opt-in until encrypted credentials, provider-specific fixtures, cost controls, and result storage are ready.

## 2026-05-22 Live Provider Adapter Stub Testing Update

Live adapter stub checks:

- Verify OpenAI, Replicate, ComfyUI, and Custom HTTP live adapter stubs can be registered through an explicit factory.
- Verify live stubs return structured `provider_unavailable` errors instead of fake success responses.
- Verify live stubs validate required API key/base URL/default model fields through the same adapter interface.
- Verify the default provider executor still uses the mock registry, not live stubs.
- Verify live stub source does not call network APIs, read environment variables, write credential files, or persist clear-text secrets.

Actual live provider smoke tests remain opt-in and separate because they require credentials, quotas, network access, and provider-specific fixtures.

## 2026-05-22 Credential-Aware Queue Execution Testing Update

Queue/provider boundary checks:

- Verify workspace queue worker passes stored provider config through the credential-aware provider executor for image and post-processing tasks.
- Verify default mock queue execution can complete with in-memory mock credentials only.
- Verify missing credentials produce structured provider task failures before adapter execution.
- Verify result records preserve provider execution lineage metadata.
- Verify the default test path does not call live provider APIs, read environment variables, write credential files, or store clear-text secrets in workspace snapshots.

Live provider smoke tests remain opt-in later because they require real credentials, quotas, network stability, and persistent result storage.

## 2026-05-22 Submission Preflight Testing Update

Workbench submission checks:

- Verify normal static prototype submission still reaches `service-ready`.
- Verify frontend validation includes a `promptAssets` result.
- Verify missing required active-mode asset roles set submission status to `invalid`.
- Verify browser-only `blob:` previews on required assets set submission status to `invalid`.
- Verify invalid prompt assets skip prompt package creation, provider mapping, and queue planning service execution.

These checks are preflight-level only. Prompt/package contracts and provider request mapping remain the stricter downstream guards.

## 2026-05-22 Prompt Asset URL Testing Update

Prompt/provider asset checks:

- Verify prompt packages only bind assets relevant to the active production mode slots.
- Verify prompt asset bindings carry URL, mime type, storage key, and provider-readiness metadata.
- Verify image prompt validation reports missing required asset roles.
- Verify browser-only `blob:` previews are not treated as provider-safe URLs.
- Verify provider image requests include committed public asset URLs.
- Verify provider mapping rejects image generation when required asset references have no provider-safe URL.

These checks remain contract-level and mock-safe; live provider behavior, signed URLs, remote fetchability, and image preprocessing remain separate.

## 2026-05-22 Local Binary Asset Adapter Testing Update

Local binary upload checks:

- Verify `upload-binary` accepts multipart image files only after an upload plan exists in the client flow.
- Verify the uploaded file is written under `public/uploads/workspaces/:workspaceId/...`.
- Verify storage keys reject path traversal and unsafe absolute paths.
- Verify committed asset records prefer the returned local public URL over a browser `blob:` preview URL.
- Verify the browser asset route loop calls upload-plan, upload-binary, asset commit, asset list, and workspace reload in order.
- Verify the route stays local-only and does not call cloud storage, live providers, browser storage, or credential stores.

Production object storage, thumbnailing, permission checks, retention cleanup, and signed URLs remain separate test tracks.

## 2026-05-22 Real File Selection Metadata Testing Update

File intake checks:

- Verify `AssetsSection` exposes a hidden image file input and keeps slot/reference buttons as the visible triggers.
- Verify only `image/png`, `image/jpeg`, and `image/webp` are accepted.
- Verify selected `File` metadata is used for upload-plan payloads: file name, mime type, byte size, role, label, and client asset id.
- Verify local preview URLs are optional metadata only and not treated as persisted storage.
- Verify no binary upload, object storage SDK, provider execution, browser storage, or filesystem access is introduced.

Real binary upload tests remain separate and should cover upload URL transport, storage adapter behavior, thumbnail generation, and file cleanup.

## 2026-05-21 React Asset Section Boundary Testing Update

Asset section checks:

- Verify the static config panel exposes a React mount point and keeps a fallback for `02 Assets`.
- Verify `AssetsSection` renders asset slots, reference entry, and operation status from runtime metadata.
- Verify simulated asset upload still uses the existing metadata-only asset client.
- Verify asset operations can request a shell rerender after completion.
- Verify the React asset section does not open a file picker, read binary files, call providers, or introduce browser storage side effects.

Real upload tests remain separate because they require file input handling, object storage, thumbnailing, permissions, and binary transfer behavior.

## 2026-05-21 React Hook Form Brief And Direction Testing Update

Brief and direction checks:

- Verify the static config panel exposes React mount points and keeps fallbacks for brief and direction sections.
- Verify `BriefSection` uses React Hook Form, `zodResolver`, and `ProjectBriefFormSchema`.
- Verify `DirectionSection` uses React Hook Form, `zodResolver`, and `ModeFormSchema`.
- Verify project name, game description, and focus guidance write back to runtime form state.
- Verify mode-specific controls write back to runtime form state for poster, collab, announcement, and icon modes.
- Verify bound workspace snapshots carry edited brief and direction values into validation and queue payload preparation.
- Verify mounted React leaves do not introduce provider calls, browser storage, or upload side effects.

Browser viewport checks should continue for `1440`, `1024`, `768`, and `375px` after each section migration because static and React sections now coexist in the shell.

## 2026-05-21 React Hook Form Output Settings Testing Update

Output settings checks:

- Verify the static config panel exposes a React mount point and keeps a fallback for static preview.
- Verify the Next bridge mounts and unmounts React workbench leaves cleanly during shell rerenders.
- Verify `OutputSettingsSection` uses React Hook Form, `zodResolver`, and `OutputSettingsFormSchema`.
- Verify platform presets, aspect ratios, images per scheme, and scheme count write back to runtime form state.
- Verify queue plan payloads continue to read edited output settings.
- Verify hidden static fallback controls do not become the Next-owned source of truth.

Browser viewport checks should continue for `1440`, `1024`, `768`, and `375px` after each section migration because static and React sections now coexist in the shell.

## 2026-05-21 Workbench Form Runtime Binding Testing Update

Workbench form binding checks:

- Verify visible left-panel controls expose schema-like `data-form-field` or `data-form-choice` paths.
- Verify edits update runtime workspace mode state without route calls, provider calls, browser storage, or filesystem side effects.
- Verify bound workspace snapshots carry edited project brief, focus guidance, style tags, scheme count, and images-per-scheme.
- Verify form validation runs against edited runtime values.
- Verify queue plan payloads use edited output settings.
- Verify the static bridge remains separate from the future React Hook Form implementation while sharing field names and schema boundaries.

React Hook Form component tests should be added when individual panel sections are migrated from static HTML into React components.

## 2026-05-21 Queue Run And Result Refresh Testing Update

Queue refresh checks:

- Verify HTTP submission calls snapshot save, prompt package, provider request, queue plan, queue run, and workspace reload in order.
- Verify queue run uses `POST` and final workspace reload uses `GET`.
- Verify the local API service exposes `runQueuePlan` through the workspace queue worker.
- Verify the Next run route delegates to `nextLocalApiService` and returns a standard envelope.
- Verify successful run/reload updates runtime workspace state with queue plans, queue summaries, results, and archive-ready data.
- Verify the task drawer and queue view model read runtime queue state before static fallback data.
- Verify no live providers, browser storage, filesystem writes, or scattered fetch calls are introduced.

Live provider queue tests remain separate because they need credentials, quotas, binary result storage, retry policy, cancellation policy, and worker deployment behavior.

## 2026-05-21 Asset UI Metadata Route Loop Testing Update

Asset UI checks:

- Verify the left-panel asset actions call upload-plan, commit, asset-list, and workspace reload in order.
- Verify the asset route flow is metadata-only and does not read files or upload binaries.
- Verify HTTP mode updates runtime workspace state after asset commit.
- Verify static preview mode can simulate an asset commit without network calls.
- Verify fetch remains isolated to explicit data/client services, not render modules or event handlers.

Real upload tests must be added later when file input, object storage, thumbnailing, and permissions exist.

## 2026-05-21 Runtime Workspace Data Binding Testing Update

Workspace data binding checks:

- Verify the workbench has a dedicated HTTP workspace data service for `GET /api/workspaces/:workspaceId`.
- Verify the Next bridge loads a workspace snapshot after initial static render when running in HTTP mode.
- Verify the loaded snapshot replaces the default static snapshot in runtime state.
- Verify project, assets, providers, schemes, archive rows, and form DTO payloads read from runtime snapshot state.
- Verify fetch remains isolated to the workspace data service and submission HTTP client, not render or event modules.

This step does not require live providers, real uploads, polling, database hosting, or a React component rewrite.

## 2026-05-21 Frontend HTTP Submission Bridge Testing Update

Frontend HTTP bridge checks:

- Verify the static workbench still defaults to the no-network static service facade.
- Verify the Next bridge can opt into HTTP mode.
- Verify the HTTP client calls snapshot, prompt, provider request, and queue plan routes in order.
- Verify HTTP and static service flows return the same top-level step shape for task drawer rendering.
- Verify network calls are isolated to the HTTP client and not scattered through render or event modules.

This step does not require live providers, real uploads, production database hosting, or a React component rewrite.

## 2026-05-21 Queue Worker And Result Writer Testing Update

Queue worker checks:

- Verify a workspace queue worker can load a snapshot, execute a queued plan through mock providers, and save the updated snapshot.
- Verify successful image and post-processing tasks create stored result assets with job/task/scheme/provider lineage.
- Verify queue summaries reflect completed, failed, cost, progress, and elapsed state after execution.
- Verify archive rows are created from stored results without duplicating existing archive records.
- Verify the worker does not call live providers, cloud storage, browser storage, filesystem writes, or external network APIs by default.

Live worker tests must be opt-in later because they require credentials, provider quotas, binary result storage, retry timing, and background process orchestration.

## 2026-05-21 Provider Credential Boundary Testing Update

Provider credential checks:

- Verify workspace snapshots and database rows never contain clear-text provider API keys.
- Verify stored provider config can be converted into runtime config only through a credential resolver.
- Verify missing credential references return structured provider auth/config errors.
- Verify a credential-aware execution call can run through the mock registry after resolving a runtime secret.
- Verify default tests do not call live provider APIs, read environment variables, access browser storage, or write credential files.

Real provider smoke tests must remain separate and opt-in because they require live credentials, network access, quota handling, and provider-specific fixtures.

## 2026-05-21 Asset Upload And Library Testing Update

Asset boundary checks:

- Verify every production mode exposes required and optional asset slots.
- Verify upload metadata validation rejects unsupported mime types, unsafe names, and oversized files.
- Verify upload planning returns a stable asset id, storage key, placeholder upload URL, and allowed mime/size limits.
- Verify committing an asset writes a `StoredAssetRecord` into the workspace snapshot through `StorageRepository`.
- Verify listing assets supports role and usage filters.
- Verify the asset service and route handlers do not read local files, write binaries, call cloud storage, or fetch remote assets.

This remains metadata-only. Real upload, thumbnailing, image preprocessing, CDN delivery, and permissions require separate tests later.

## 2026-05-21 Database Persistence Testing Update

Database persistence checks:

- Verify the SQL schema includes workspace, asset, result, provider config, and archive tables.
- Verify database rows can be created from a redacted workspace snapshot.
- Verify a database repository can save, load, and list workspace snapshots through the `StorageRepository` interface.
- Verify missing workspace loads return `not_found`.
- Verify provider API key fields are masked and no clear-text key is persisted.
- Verify the database adapter has no browser storage, file writes, network calls, or live provider calls.

This remains a contract-level persistence test. It does not require production database hosting, authentication, uploads, or encrypted secret storage.

## 2026-05-21 Next Route Handler Testing Update

Route handler checks:

- Verify every API contract has a matching App Router handler.
- Verify route handlers delegate to the local API service instead of duplicating business logic.
- Verify workspace load returns the seeded mock workspace.
- Verify queue plan POST returns a queue plan and summary.
- Verify validation and not-found failures keep structured envelopes and appropriate HTTP status codes.
- Verify route handlers do not call live providers, uploads, databases, browser storage, or credential stores.

## 2026-05-21 React Form Contract Testing Update

React form contract checks:

- Verify the generation form schema composes project brief, output settings, slogans, provider, and mode form data.
- Verify default values parse for all five production modes.
- Verify mode-specific locked fields are exposed for Collab, Announcement, Logo, Icon, and Poster.
- Verify React Hook Form and Zod resolver are installed but do not change the accepted static UI yet.
- Verify form utilities do not call HTTP, live providers, browser storage, uploads, databases, or filesystem writes.

## 2026-05-21 Next.js Migration Shell Testing Update

Next migration shell checks:

- Verify the App Router page mounts the accepted workbench through a client boundary.
- Verify the existing static CSS/design tokens load in Next without changing the static prototype.
- Verify static dev server and Next scripts can coexist during migration.
- Verify `npm run build:next` succeeds before route handlers or React Hook Form are introduced.
- Verify no live provider calls, uploads, databases, or credential reads are added by the shell.

## 2026-05-21 Static Workbench Service Flow Testing Update

Static workbench service flow checks:

- Verify generation actions create a submission state with service-backed route envelope results.
- Verify prompt package creation, provider request mapping, and queue plan creation all run from the same submission DTOs.
- Verify queue summary is available to the task drawer after submission.
- Verify invalid form state can stop the service flow with a structured failure status.
- Verify the static service facade does not call HTTP, live providers, browser storage, uploads, databases, or filesystem writes.
- Verify `npm run check` includes static service flow validation.

## 2026-05-21 Local API Service Testing Update

Local API service checks:

- Verify the service exposes route-shaped methods for workspace load/save, prompt package creation, provider request mapping, and queue plan creation.
- Verify each method parses the same request DTOs and response envelopes as the API contract layer.
- Verify validation errors return structured `validation_error` failure envelopes.
- Verify missing snapshots return `not_found` failure envelopes.
- Verify queue planning returns both a queue plan and queue summary.
- Verify the service does not call live provider APIs, network APIs, browser storage, databases, uploads, or filesystem writes.
- Verify `npm run check` includes the local API service validation.

## 2026-05-21 E2E Mock Loop Testing Update

E2E mock loop checks:

- Verify a workspace snapshot can create both brief and image prompt packages.
- Verify prompt packages map into provider request DTOs.
- Verify mapped requests execute through the mock provider registry and return typed responses.
- Verify queue planning and queue summary remain compatible with the same mode, project, provider, and scheme ids.
- Verify the loop does not call live APIs, credentials, uploads, databases, or file writes.
- Verify `npm run check` includes the E2E mock loop.

## 2026-05-21 Provider Execution Bridge Testing Update

Provider execution checks:

- Verify mapped brief and image requests dispatch to the correct adapter method.
- Verify missing adapters and unsupported capabilities return structured provider errors.
- Verify stored provider configs convert to adapter config without clear-text API keys.
- Verify the default registry uses mock adapters and performs no network calls.
- Verify queue/API code can depend on the execution bridge instead of concrete providers.
- Verify `npm run check` includes provider execution validation.

## 2026-05-21 Local Draft Persistence Testing Update

Local persistence checks:

- Verify the local draft repository implements save, load, and list through the storage repository contract.
- Verify saved snapshots are parsed through `WorkspaceSnapshotSchema` and summarized through `summarizeWorkspaceSnapshot`.
- Verify local persistence rejects or avoids clear-text API keys and secrets.
- Verify malformed local JSON returns `invalid_snapshot` instead of crashing.
- Verify static submission drafts can be saved and hydrated after page refresh without provider calls.
- Verify local persistence does not call network APIs, remote databases, provider adapters, or file uploads.

## 2026-05-21 Static Frontend Form Binding Testing Update

Frontend binding checks:

- Verify primary generation buttons create a local submission draft instead of remaining decorative.
- Verify submission drafts include prompt package creation payloads and queue plan creation payloads.
- Verify submission drafts are built from current mode, selected scheme, selected provider, workspace snapshot, platform settings, and images-per-scheme settings.
- Verify project brief, output settings, slogan settings, and mode form validators run before the draft is marked ready.
- Verify task chrome exposes the latest submission draft status without triggering real network, provider, upload, or persistence behavior.
- Verify `npm run check` includes frontend binding validation.

## 2026-05-21 API Route Contract Testing Update

API contract checks:

- Verify contracts exist for workspace snapshot load/save, prompt package creation, provider request mapping, and queue plan creation.
- Verify every route contract declares route id, method, path, request schema, and response schema.
- Verify success and failure envelopes share trace, workspace, and timestamp metadata.
- Verify route payloads reuse existing workspace, prompt, provider request, queue, and storage DTOs.
- Verify the API contract layer does not define real route handlers, network calls, credential reads, provider execution, or persistence.
- Verify `npm run check` includes API contract validation.

## 2026-05-21 Provider Request Mapper Testing Update

Provider request mapper checks:

- Verify brief request mapping includes project name, game description, focus guidance, asset references, mode guardrails, language targets, and scheme count.
- Verify image request mapping includes final prompt, optional negative prompt, assets, platform preset, aspect ratio, dimensions, model, and image count.
- Verify provider model selection uses task slot overrides, then provider default model, then safe fallback model names.
- Verify prompt asset bindings become provider asset references without requiring uploaded files or real URLs beyond existing snapshot metadata.
- Verify the mapper does not call network APIs, provider adapters, storage, DOM APIs, or credential persistence.
- Verify `npm run check` includes provider request mapper validation.

## 2026-05-21 Prompt Builder Contract Testing Update

Prompt builder checks:

- Verify prompt packages include project, brand, character, asset, slogan, platform, mode, and scheme context.
- Verify Collab prompt packages use `[Game Character]` and `[Collab Partner]` placeholders and do not invent appearance details.
- Verify Logo prompt packages require pure solid background and wordmark-first output.
- Verify Icon prompt packages require `1:1`, no text, full-bleed square, sharp corners, and uploaded subject fidelity.
- Verify Announcement prompt packages include typography layout mode and group-shot guidance when relevant.
- Verify prompt contracts do not call provider adapters, network APIs, storage writes, or DOM APIs.

## 2026-05-21 Local Draft And Snapshot Binding Testing Update

Local draft and static binding checks:

- Verify `MemoryDraftRepository` implements save, load, and list using `WorkspaceSnapshot` DTOs.
- Verify repository operations clone snapshots instead of leaking mutable references.
- Verify static Provider settings derive masked key, status, model, and base URL from workspace snapshot data.
- Verify archive board rows derive project, scheme, result, model, and status from workspace snapshot data.
- Verify static binding modules do not use `localStorage`, filesystem writes, network calls, or real database access.

## 2026-05-21 Storage Contract Testing Update

Storage contract checks:

- Verify workspace snapshots include project, assets, brand kit, characters, mode configuration, schemes, queue plans, results, archive rows, and provider settings.
- Verify Provider API Keys are redacted before persistence and never appear in mock snapshots or checks.
- Verify queue plans can be included in storage snapshots without losing job/task/event structure.
- Verify storage contracts do not import DOM APIs, network APIs, filesystem writes, or provider execution.
- Verify `npm run check` runs storage checks together with schema, provider, queue, and type checks.

## 2026-05-20 Queue Contract Testing Update

Queue contract checks:

- Verify every queue job has at least one task and one event.
- Verify task status values are structured and never ad hoc strings.
- Verify image generation tasks map to provider `imageGeneration`.
- Verify post-processing tasks map to `imageEdit`, `upscale`, or `backgroundRemoval`.
- Verify retryable failures carry retry count, max retry count, provider id, and user-safe message.
- Verify mock runner consumes mock provider only and does not perform real network calls.
- Verify queue summary can derive total, completed, failed, running, progress, cost, and elapsed time.

## 2026-05-20 Provider Contract Testing Update

Provider contract checks:

- Run `npm run typecheck` after editing provider contract files.
- Verify OpenAI, Replicate, ComfyUI, and Custom HTTP manifests exist and expose at least one capability.
- Verify every provider manifest declares model slots without binding the product to one model.
- Verify mock adapter returns typed static responses and never performs network calls.
- Verify provider errors include provider id, code, retryability, and user-safe message.
- Verify unsupported capabilities are represented as structured provider errors, not thrown strings.

## 2026-05-20 Form Adapter Testing Update

Form adapter checks:

- Verify each adapter exposes a Zod schema, default values, field groups, and submit target.
- Verify all five production modes have a mode adapter.
- Verify adapter fields reference valid schema field names.
- Verify Collab, Logo, and Icon adapters surface their hard guardrails as non-optional fields or notices.
- Verify adapters stay framework-agnostic and do not import React, browser APIs, storage APIs, or provider code.

## 2026-05-20 TypeScript/Zod Testing Update

Type and schema checks:

- Run `npm run typecheck` after editing TypeScript schema files.
- Run `npm run check` before finishing schema, provider DTO, or form contract changes.
- Verify Zod mode forms use a discriminated union on `mode`.
- Verify Collab mode requires `characterPlaceholdersOnly` and `preventCharacterMerge` to be true.
- Verify Logo mode requires `solidBackground` and `wordmarkIsPrimarySubject` to be true.
- Verify Icon mode requires `aspectRatio: "1:1"`, `noText: true`, and `fullBleedSquare: true`.
- Verify Provider config keeps `apiKey` optional/masked and does not make real network calls.

## 2026-05-20 Schema Validation Update

Schema checks:

- Run `npm run schema:check` after changing mode fixtures, Provider fixtures, form defaults, or schema contracts.
- Verify every production mode has mode-specific form defaults and validation coverage.
- Verify Collab mode requires character placeholders and anti-merge guardrails.
- Verify Logo mode keeps solid-background and wordmark-primary constraints.
- Verify Icon mode keeps `1:1`, no-text, and full-bleed square constraints.
- Verify Provider defaults validate without storing or requesting real credentials.
- Verify output defaults keep Icon locked to `1:1`.

## 2026-05-20 Static Architecture Testing Update

Module boundary checks:

- Verify `app.js` only boots the static workbench and delegates state, rendering, and events to `src/*` modules.
- Verify `src/data/*` exports mode fixtures, provider fixtures, task queue fixtures, and archive fixtures without DOM side effects.
- Verify `src/state.js` preserves URL-driven static states for theme, mode, view, inspector, settings, and task drawer.
- Verify `src/render/*` can render the current workbench shell without changing the confirmed visual direction.
- Verify `src/schema/models.js` remains framework-agnostic and does not perform network calls, credential persistence, or provider execution.

Regression checks:

- Mode switching still updates the left config, center board, inspector context, and CTA copy.
- Theme switching still works in Light and Dark.
- Scheme card click still opens the inspector.
- Bottom task bar still expands and collapses.
- Provider settings sheet still opens and switches provider rows.

## 2026-05-20 Testing Update

Production mode checks:

- Verify the workbench exposes Poster, Collab, Announcement, Logo, and Icon modes.
- Verify mode switching updates the left configuration fields, asset slots, scheme cards, inspector context, and CTA copy.
- Verify Collab mode shows five named asset slots and surfaces character appearance lock guardrails.
- Verify Collab prompt preview uses `[Game Character]` and `[Collab Partner]` placeholders instead of invented appearance details.
- Verify Announcement mode shows preset copy categories and integrated/regular typography layout options.
- Verify Announcement mode surfaces group-shot guidance when multiple character references are represented.
- Verify Logo mode shows wordmark, font style, color theme, and pure solid background constraints.
- Verify Icon mode locks output to `1:1`, surfaces no-text/full-bleed rules, and shows composition/style reference slots.
- Static prototype must not perform real uploads, real prompt extraction, real provider calls, or credential storage.

## 2026-05-19 Testing Update

Theme checks:

- Verify Light is the default theme.
- Verify Dark theme changes background, panels, borders, text, accent, and status colors through CSS variables.
- Verify theme switch does not cause layout shift at 1440, 1024, 768, and 375px.
- Verify contrast remains readable in both themes.

API Key settings checks:

- Provider list includes OpenAI, Replicate, ComfyUI, and Custom HTTP.
- API Key field is masked by default.
- Static states are visible: unconfigured, configured, testing, success, failure.
- Error and success messages appear near the provider form.
- Static prototype must not perform real credential storage or network requests.

Collapsible chrome checks:

- Bottom task bar is slim by default and expands into a drawer on click.
- Expanded drawer shows queue rows, failure retry, cost, and elapsed time.
- Right inspector is collapsed to a rail by default.
- Clicking a scheme opens the inspector.
- Pin keeps the inspector open; close collapses it.
- Collapsed inspector and task bar do not block scheme generation, prompt inspection, or result review.

## 测试目标

测试目标是保证系统在真实游戏素材生产场景下稳定、可恢复、结果可追踪。

重点验证：

- 用户能完成完整生成流程。
- 三栏工作台布局在核心断点下可用。
- 生成参数能正确传递到任务队列。
- 平台规格和尺寸准确。
- 品牌资产和角色资产能影响生成方案。
- 失败任务可恢复。
- 后处理功能不会破坏原始结果。
- 导出文件符合平台要求。
- 结果图在视觉层级上始终比界面装饰更突出。

## 测试分层

### 单元测试

覆盖：

- 表单参数校验。
- 平台规格映射。
- 图片尺寸和比例计算。
- 宣传词模式逻辑。
- 多语言宣传词结构。
- 侧重点引导拼接。
- 品牌资产提示词组装。
- 角色一致性提示词组装。
- 构图参考强度映射。
- 成本估算。
- 任务状态流转。
- 当前选中对象与右侧检查器内容映射。

### 集成测试

覆盖：

- 创建项目。
- 上传素材。
- 创建品牌资产。
- 创建角色档案。
- 生成设计方案。
- 创建批量生成任务。
- 任务队列拆分。
- 图片生成 provider mock。
- 后处理 provider mock。
- 失败重试。
- 取消任务。
- 结果写入画廊。
- 导出打包。
- 左侧参数变化后中央方案和右侧检查器同步更新。

### 端到端测试

核心路径：

1. 创建游戏项目。
2. 上传 logo、角色图、参考图。
3. 设置品牌资产。
4. 设置角色一致性。
5. 选择平台规格。
6. 配置方案数量和每方案图片数量。
7. 开启自动宣传词和多语言。
8. 填写侧重点说明。
9. 生成方案。
10. 选择方案。
11. 锁定宣传词、角色或构图。
12. 批量生成图片。
13. 对一张图执行高清放大。
14. 对一张图执行背景移除。
15. 对一张图执行局部重绘。
16. 下载结果。

### UI 和响应式测试

断点：

- 375px。
- 768px。
- 1024px。
- 1440px。

验收：

- 表单文字不溢出。
- 按钮文字不挤压。
- 图片卡片比例稳定。
- 任务队列不遮挡主操作。
- 左右面板在小屏下可折叠。
- 中央图片结果在桌面端保持主视觉地位。
- 空状态、加载状态、失败状态、结果状态可读。
- 顶部生成按钮在参数不足时 disabled，并给出缺失原因。
- 右侧检查器只显示当前选中方案或图片的详情。
- 左侧配置区滚动时底部主按钮仍可操作。
- 中央方案卡网格在 1440px 和 1024px 下不被左右面板挤压。
- 方案卡的空、加载、完成、失败状态不改变卡片结构。
- 顶部 toast 不遮挡主操作和关键方案内容。
- 结果大图预览的底部 action dock 不遮挡图片主体。

### 可访问性测试

覆盖：

- 键盘导航。
- 焦点状态。
- 表单错误提示。
- 按钮 disabled 状态。
- Tooltip 可访问。
- 对比度至少满足 WCAG AA。
- prefers-reduced-motion 生效。

### 安全测试

覆盖：

- 文件类型限制。
- 文件大小限制。
- API Key 不出现在前端。
- 用户只能访问自己的项目和素材。
- 下载链接有权限控制。
- 上传文件名不直接信任。
- 参考图和生成图元数据处理。

## 状态验收

### 空状态

- 首次进入工作台时不出现营销落地页。
- 中央生产板提示用户生成设计方案，并说明缺失的必要输入。
- 左侧显示必要输入项和默认生成参数。
- 右侧显示当前项目检查器或未选中提示。

### 加载状态

- 方案生成、图片生成、后处理和导出都有明确阶段。
- toast、轻量队列或卡片内状态能展示生成阶段。
- 页面刷新后任务状态不丢失。

### 失败状态

- 单张失败不影响整批任务。
- 用户可以仅重试失败项。
- 用户可以继续导出成功项。
- 错误信息可理解。

### 结果状态

- 结果图支持筛选、收藏、下载。
- 结果按方案组展示，多比例结果保留上下文。
- 结果大图预览可显示生产记录、尺寸、比例和操作 dock。
- 单张图支持变体、局部重绘、高清放大、背景移除。
- 选中图片后右侧检查器展示来源方案、模型参数、平台规格和任务 ID。

## MVP 验收标准

- 用户可以创建项目并上传素材。
- 用户可以创建品牌资产库。
- 用户可以创建角色档案并用于生成。
- 用户可以选择平台规格和尺寸。
- 用户可以生成多套设计方案。
- 用户可以确认方案并批量生成图片。
- 用户可以看到任务进度。
- 单张失败可以重试。
- 用户可以查看方案卡网格和方案组结果。
- 用户可以进入基础档案馆和单张结果预览。
- 用户可以执行局部重绘、高清放大、背景移除。
- 用户可以在画廊中筛选和下载结果。
- 平台规格导出的图片尺寸正确。
- 工作台遵守左侧控制、中央结果、右侧检查器、底部任务队列的布局模型。

## 质量验收

- 自动宣传词必须贴合游戏名称和描述。
- 多语言宣传词不能混用语言。
- 侧重点引导必须影响方案生成。
- 品牌资产必须被写入生成上下文。
- 角色一致性参数必须被写入生成上下文。
- 构图参考提取结果必须结构化保存。
- 队列失败不会导致整批任务丢失。
- 平台规格必须影响生成尺寸和导出命名。

## 非功能验收

- 页面主要操作响应无明显卡顿。
- 批量任务创建后页面刷新不丢状态。
- 生成历史可追溯。
- 错误信息可理解。
- 用户能从失败状态继续操作。
- 界面不使用营销落地页、大圆角卡片、过多渐变、玩具感或空洞科技感。
