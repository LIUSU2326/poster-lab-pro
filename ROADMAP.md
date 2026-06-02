# ROADMAP.md

## 2026-06-02 1.0.0-beta.3 Real Generation Acceptance Update

### Completed In This Pass

- Ran five low-cost real generation checks through the current Google live image path: Poster, Icon, Logo, Announcement, and Collab.
- Confirmed all checked outputs used AI integrated redraw as the main path; no local asset overlay was applied.
- Confirmed Poster slogan treatment can become larger and more scene-integrated when the prompt asks for in-world signage or campaign lettering.
- Tightened shared prompt/provider rules so uploaded subjects are not given new shields, weapons, tools, props, costume parts, or signature accessories unless visible in the reference.
- Tightened Collab rules so missing partner brand logos produce blank partner brand plates or neutral emblems instead of fake partner wordmarks.
- Added prompt, Google adapter, and OpenAI adapter checks so the new accessory and fake-brand locks cannot be removed silently.

### Real Generation Notes

- Poster: stronger scene integration, one logo, and better campaign lettering; watch item is hero scale and invented props.
- Icon: correct square/no-text/single-subject direction; watch item is the model's app-icon mask prior and invented accessory drift.
- Logo: no BOSS pollution and wordmark-first direction; watch item is spelling accuracy, which still needs a dedicated logo/text refinement path.
- Announcement: copy-safe panel direction works; watch item is avoiding direct generated operational body copy when exact spelling matters.
- Collab: both parties remained separate in one scene; watch item is avoiding fake partner brand text when no partner logo was uploaded.

### Next Step

- Package and smoke the `1.0.0-beta.3` desktop app, push to `main`, then move into 1.0 RC release-candidate preparation.

## 2026-06-02 1.0.0-beta.2 UX Regression Update

### Completed In This Pass

- Made the top `实机安全` chip open the Model/API Key settings sheet directly.
- Added a four-step setup strip inside settings: save Key, test connection, pass live gate, then generate.
- Added active `打开实机安全闸` buttons to blocked empty states so users are not left with only disabled generation buttons.
- Hid editable slogan controls in Icon and Logo modes; Icon now shows a locked no-text strategy, and Logo now points users to the wordmark/Logo reference path.
- Reduced bottom safety status wording from failure-like `受阻` copy to clearer pending safety-check copy.

### Remaining UX Watch Items

- The settings sheet still combines provider credentials, route plans, and live gate controls in one place.
- Result history and rerun flows are usable but still need a more guided product experience before RC.
- Manual live test controls are clearer, but the long-term UI should replace English operational labels with a Chinese-first beta test surface.

## 2026-06-02 1.0 Beta Readiness Update

### Completed In This Pass

- Validated Icon, Logo, Announcement, and Collab with one controlled real-generation run each through the current Desktop Test Path.
- Tightened Logo mode so antagonist-like prop assets are not bound into logo generation prompts.
- Tightened Icon mode prompts to request full-canvas square artwork instead of an OS app-icon mask or rounded container.
- Fixed the result viewer layout so action controls no longer cover the generated image.
- Improved the live safety chip wording so users can discover provider/API Key and live-gate settings more directly.
- Made workspace summaries use the latest meaningful timestamp from metadata, provider configs, mode states, assets, queue events, results, and archive rows.
- Bumped the visible beta version to `1.0.0-beta.1`; this has since advanced to `1.0.0-beta.2`.

### Remaining Beta Risks

- Icon mode can still produce rounded icon-mask framing because the image model has a strong app-icon prior.
- Logo text accuracy is improved but still model-dependent; complex wordmarks may need manual refinement or a dedicated logo/text path.
- Announcement text should favor calm copy-safe regions rather than generated final copy when spelling matters.
- The settings sheet still contains several responsibilities in one modal; it is acceptable for beta but should become a clearer setup flow later.
- Archive/result management is usable but still needs a more productized history and rerun experience after beta.

### Next Step

- Package the macOS desktop app, run the beta smoke path, and push the current beta code to `main` after checks pass.

## 2026-05-28 MVP Flow Correction

- Slogan language selection is single-target per batch, not multi-select.
- Multiple character uploads in the same role represent independent characters for group-poster planning.
- Failed image tasks need a one-click retry-all path that continues from existing schemes.
- Size stabilization uses native provider dimensions first, then local close-ratio normalization when needed.

## 2026-05-24 Implementation Update: Electron Desktop Shell

### MVP Implementation Step

- Add an Electron desktop shell that opens the local Next workbench in a native desktop window.
- Reuse an already-running local Next service when available, or start `next dev` on an available local port.
- Preserve proxy and local environment variables so Google/OpenAI-compatible provider tests keep working from the desktop window.
- Keep packaged installer generation as the next step after the desktop shell is verified.

### Not In This Step

- No signed installer, auto-update, crash reporting, or production app distribution.
- No provider calls from Electron main/preload code.
- No browser credential storage in the desktop shell.

### Next Step

- Verify `npm run desktop:dev` opens the workbench window, then add a Windows portable/package build.

## 2026-05-24 Implementation Update: Electron Packaging

### MVP Implementation Step

- Add the first Windows desktop packaging path using Next standalone output and a lightweight portable Electron folder.
- Package the standalone Next server as an Electron resource so the desktop app can open without manually starting `npm run dev:next`.
- Keep the first output as an unpacked app folder for fast local testing.

### Not In This Step

- No signed installer, auto-update, crash reporting, or production release channel.
- No live provider execution from Electron main/preload code.
- No change to the existing API Key vault or provider safety gate.

### Next Step

- Verify `release/win-unpacked/Poster Lab Pro.exe` opens the workbench, then decide whether to add a signed installer or keep portable testing until MVP flows stabilize.

## 2026-05-23 Implementation Update: OpenAI-Compatible And Google Provider Setup

### MVP Implementation Step

- Persist optional Base URL and default model values from the provider settings surface.
- Let OpenAI-compatible relay users test `/models` and image generation through the existing OpenAI adapter shape.
- Add Google AI Studio as a provider id, manifest, settings option, connection diagnostic target, and image generation adapter.
- Add a Google manual live queue path that reuses the existing safety gate, credential vault, queue worker, and local result file store.
- Keep the normal production CTA mock-safe until manual provider tests are validated.

### Not In This Step

- No automatic live generation from the primary CTA.
- No Google image editing, upscaling, or background removal execution.
- No billing/quota dashboard.
- No cloud secret manager or team credential sharing.
- No provider-specific prompt optimization beyond the first request/response mapper.

### Next Step

- Run a desktop manual live test with either an OpenAI-compatible relay key or a Google AI Studio key and a low-cost disposable prompt.

## 2026-05-23 Implementation Update: Persisted Result File Download

### MVP Implementation Step

- Add a file-serving path to the existing result download route for persisted `localFile` descriptors.
- Keep descriptor JSON as the default response and require `?file=1` for binary file delivery.
- Derive download URLs from the incoming request origin so local dev ports remain correct.
- Remove hardcoded localhost public result URLs from the Next result file store.

### Not In This Step

- No cloud object storage or signed URLs.
- No remote provider URL ingestion.
- No bulk export archive.
- No retention cleanup scheduler.
- No direct browser access to provider credentials or provider APIs.

### Next Step

- Use this route in the desktop result actions after the manual live test produces a persisted result.

## 2026-05-23 Implementation Update: Desktop Live Test Control Surface

### MVP Implementation Step

- Add a guarded manual live test control to the workbench Live Safety panel.
- Require HTTP workbench mode, an OpenAI-compatible or Google provider, saved credential readiness, a successful connection test, and an allowed live gate before the control can call `/live-test`.
- Let the control auto-prepare the local queue job, refresh provider credential status, and run the connection diagnostic when those steps are missing.
- Show manual live test status in the expanded task drawer.
- Refresh the workspace snapshot after an attempted live test so persisted result records can appear in downstream views.

### Not In This Step

- No replacement of the main batch render button.
- No automatic live test after connection succeeds.
- No billing dashboard, retry scheduler, or multi-provider live UI.
- No hidden fallback credentials or environment-variable API Key loading.

### Next Step

- Add a final preflight/runbook for the first real desktop live test with a disposable prompt and user-owned provider account.

## 2026-05-23 Implementation Update: Manual Desktop Live Generation Test

### MVP Implementation Step

- Add a manual OpenAI live generation test route for a prepared queue job.
- Require a saved encrypted credential, a successful provider connection diagnostic, live safety confirmations, accepted cost cap, injected HTTP transport, and local result file storage.
- Run the existing OpenAI live queue helper only after the diagnostic and safety gate pass.
- Persist returned `dataUrl` image bytes as local result files and keep workspace snapshots free of raw API Keys and raw base64 payloads.

### Not In This Step

- No normal workbench live generation button.
- No automatic run after API Key save or connection test.
- No billing dashboard, quota manager, retry scheduler, or team credential sharing.
- No live Replicate, ComfyUI, Custom HTTP, image edit, upscale, or background removal execution.

### Next Step

- Add a deliberately disabled UI affordance or desktop-only command surface that can call this route after the user confirms cost and storage expectations.

## 2026-05-23 Implementation Update: Provider Connection Diagnostics

### MVP Implementation Step

- Add an explicit provider connection test route for saved credentials.
- Resolve clear-text API Keys only through the encrypted credential vault.
- Probe provider model/readiness endpoints without generating images.
- Surface connection status, model availability, and safe error copy in the Model and API Key settings UI.
- Keep live generation blocked behind the existing live execution gate.

### Not In This Step

- No real image generation from the settings panel.
- No automatic queue execution after a successful connection test.
- No provider billing or quota dashboard.
- No OS keychain, team credential sharing, or cloud secret manager.

### Next Step

- Use the diagnostic result to unblock a manual desktop live generation test path with cost confirmation and result storage checks.

## 2026-05-23 Implementation Update: Encrypted Provider Credential Vault

### MVP Implementation Step

- Add a provider credential vault boundary for saving, reading, resolving, and revoking API Keys.
- Store encrypted credential payloads outside workspace snapshots.
- Return masked credential status and `ProviderCredentialRef` values only.
- Add route/service contracts for provider credential save, status, and revoke actions.
- Keep live provider execution gated; saving a key does not trigger generation.

### Not In This Step

- No OS keychain or cloud secret manager.
- No team permission model.
- No provider billing or usage dashboard.
- No automatic live queue execution from the UI.

### Next Step

- Hook the Model and API Key settings surface to the credential routes and use the returned status to satisfy the live gate runtime-credential prerequisite.

## 2026-05-23 Implementation Update: Workbench Live Gate Visibility

### MVP Implementation Step

- Add a compact live gate panel to the static workbench Engine section.
- Show gate status, estimated cost, accepted cost cap, confirmation toggles, and blocker reasons.
- Mirror gate context in the top toolbar, inspector, and expanded task drawer without changing the main layout.
- Keep the primary generation flow mock-safe.

### Not In This Step

- No real live provider call from the UI.
- No API Key persistence.
- No billing integration.
- No modal confirmation flow.
- No retry scheduler.

### Next Step

- Add a manual desktop live test command/surface that can be run only after the gate is allowed.

## 2026-05-23 Implementation Update: Live Execution Safety Gate

### MVP Implementation Step

- Add a typed live execution gate for user confirmations and runtime readiness.
- Require live-run, provider-cost, external-provider, and result-storage confirmations.
- Block live execution when the estimated cost exceeds the accepted cost cap.
- Wire the gate into OpenAI live queue execution before provider adapter calls.

### Not In This Step

- No billing provider integration.
- No production credential vault.
- No automatic retry scheduler.
- No UI modal implementation.
- No default live route execution.

### Next Step

- Surface the gate states in the desktop workbench and add a manual desktop live test path after UI copy is finalized.

## 2026-05-23 Implementation Update: Explicit Live Queue Wiring

### MVP Implementation Step

- Add an explicit OpenAI live queue helper for image-generation jobs.
- Require caller-provided runtime API key input and injected HTTP transport before any live adapter execution.
- Reuse the workspace queue worker, credential resolver, provider registry, and result file store boundaries.
- Persist provider `dataUrl` outputs through the local result file store and keep snapshots free of raw image bytes.

### Not In This Step

- No default live execution in the UI or route handlers.
- No environment-variable API key loading.
- No encrypted credential vault.
- No live brief model, image edit, upscale, background removal, or provider URL ingestion.
- No billing approval UI or retry scheduler.

### Next Step

- Add live queue controls in the desktop test path only after cost confirmation, retry behavior, and user-facing error copy are defined.

## 2026-05-22 Implementation Update: Result File Storage Boundary

### MVP Implementation Step

- Add a local result file store for generated image `dataUrl` outputs.
- Store files under workspace/result-scoped storage keys.
- Return metadata with mime type, byte size, checksum, storage key, and optional public URL.
- Teach result download descriptors to recognize persisted local result files.

### Not In This Step

- No cloud object storage.
- No signed URL generation.
- No provider URL download worker.
- No live queue execution.
- No retention cleanup or export packaging.

### Next Step

- Wire live provider queue execution to persist generated outputs through the result file store.

## 2026-05-22 Implementation Update: Runtime API Key Sessions

### MVP Implementation Step

- Add an ephemeral runtime credential session store for provider API keys.
- Return only masked `ProviderCredentialRef` values to UI/queue-facing layers.
- Resolve clear-text keys only through an injected `CredentialResolver` at execution time.
- Support revocation and expiration checks before live queue wiring.

### Not In This Step

- No encrypted team vault.
- No browser persistence for API keys.
- No default live queue execution.
- No provider billing controls.
- No UI changes.

### Next Step

- Wire live queue execution behind an explicit runtime credential ref only after result storage is ready.

## 2026-05-22 Implementation Update: Manual OpenAI Live Smoke Command

### MVP Implementation Step

- Add a manual OpenAI live smoke command for one explicit text-to-image connectivity test.
- Require `--allow-live` and runtime API key input before any provider call can happen.
- Print only redacted provider/result summaries and do not save generated binaries.
- Add a fake-transport checker that is safe for `npm run check`.

### Not In This Step

- No default live queue execution.
- No environment-variable credential loading.
- No API Key persistence.
- No result file storage.
- No UI changes.

### Next Step

- Decide the runtime API Key handoff for the workbench before live queue execution.

## 2026-05-22 Implementation Update: OpenAI Image Adapter

### MVP Implementation Step

- Add an opt-in OpenAI image-generation adapter for the provider boundary.
- Use transport injection so live network execution cannot happen from default checks or queue workers.
- Parse OpenAI image responses into the existing provider image response DTO.
- Preserve the default mock registry and disabled live stubs.

### Not In This Step

- No default live OpenAI execution.
- No environment-variable credential loading.
- No image edit, reference-image upload, upscale, or background-removal implementation.
- No binary result storage or signed download URLs.
- No UI redesign.

### Next Step

- Add a manual live smoke path only after credential ownership, cost controls, and result storage are ready.

## 2026-05-22 Implementation Update: Queue Feedback View Model

### MVP Implementation Step

- Add a queue feedback model for task status, current stage, cost, elapsed time, and failure summaries.
- Keep the model framework-agnostic so both static and React UI can consume it.
- Use this as the data source for slim task bar and task drawer refinements.

### Not In This Step

- No visual redesign.
- No retry scheduler.
- No real billing integration.
- No websocket or polling.

### Next Step

- Run full checks/build and then freeze the current MVP foundation for desktop testing.

## 2026-05-22 Implementation Update: Desktop Test Path

### MVP Implementation Step

- Add a desktop testing runbook for the current Next workbench.
- Define the safe local command order: checks, Poster chain, Next build, Next dev server, browser inspection.
- Clarify that static server is legacy comparison and live providers remain opt-in.

### Not In This Step

- No packaged desktop app installer.
- No Electron/Tauri shell.
- No real live provider execution.
- No production deployment checklist.

### Next Step

- Improve task cost/time/error feedback and then run full MVP acceptance/freeze checks.

## 2026-05-22 Implementation Update: Poster Production Chain

### MVP Implementation Step

- Add a Poster-only local production chain harness across workspace load, image prompt package, provider request mapping, queue planning, queue run, and result download descriptor.
- Keep the chain mock-provider-backed by default.
- Use this as the first desktop acceptance path before expanding to all production modes.

### Not In This Step

- No live provider image generation.
- No multi-mode production acceptance.
- No background worker daemon.
- No real result binary storage.
- No UI redesign.

### Next Step

- Document and verify the local desktop test path so the static/Next workbench can be tried safely before live Provider rollout.

## 2026-05-22 Implementation Update: Result Download Descriptor

### MVP Implementation Step

- Add a result download descriptor that resolves stored result records to `assetUrl`, `thumbnailUrl`, inline mock `dataUrl`, or an unavailable state.
- Add a local API contract/service/route for describing a result download.
- Preserve provider result metadata from queue execution so mock outputs have a traceable delivery source.
- Keep result descriptor routes free of binary file reads/writes.

### Not In This Step

- No cloud object storage.
- No signed URL generation.
- No archive export packaging.
- No binary result persistence worker.
- No UI redesign.

### Next Step

- Wire the minimal generation loop to use the descriptor as its result delivery boundary before enabling real live provider calls.

## 2026-05-22 Implementation Update: Live Provider Smoke Harness

### MVP Implementation Step

- Add an opt-in live provider smoke harness that exercises the credential-aware execution boundary without default network calls.
- Return structured `skipped`, `blocked`, or `attempted` smoke results.
- Verify disabled live stubs produce `provider_unavailable` and missing credentials produce auth/config failures.
- Keep smoke harness inputs injected and side-effect free.

### Not In This Step

- No real OpenAI, Replicate, ComfyUI, or Custom HTTP requests.
- No environment-variable credential loading.
- No encrypted credential vault.
- No generated result file persistence.
- No UI changes.

### Next Step

- Add result download/storage descriptors so provider outputs have a stable delivery boundary before real live calls are enabled.

## 2026-05-22 Implementation Update: Live Provider Adapter Stubs

### MVP Implementation Step

- Add opt-in live provider adapter stubs for OpenAI, Replicate, ComfyUI, and Custom HTTP.
- Keep the default provider registry mock-only.
- Return structured `provider_unavailable` errors from live stubs until real implementations are added.
- Add checks that prove live stubs do not call network APIs, read environment variables, or persist credentials.

### Not In This Step

- No live image generation API calls.
- No live provider smoke test execution.
- No encrypted credential vault.
- No provider-specific request serialization.

### Next Step

- Add opt-in provider-specific smoke test harnesses only after result storage and credential ownership rules are ready.

## 2026-05-22 Implementation Update: Credential-Aware Queue Execution

### MVP Implementation Step

- Route image and post-processing queue tasks through the credential-aware provider executor.
- Pass stored provider config and runtime credential resolver hooks from the workspace queue worker.
- Keep default execution mock-safe with in-memory mock credentials only.
- Preserve structured task failures for missing credentials or unsupported provider capabilities.

### Not In This Step

- No live image generation API.
- No encrypted credential vault.
- No user/team permission model for credentials.
- No remote asset/result storage.
- No multi-provider brief/image routing split.

### Next Step

- Add live-provider adapter stubs behind opt-in test gates only after credential and queue boundaries stay green.

## 2026-05-22 Implementation Update: Submission Prompt Asset Preflight

### MVP Implementation Step

- Surface active-mode prompt asset readiness in the workbench submit validation result.
- Block submission before static/HTTP service flow when required material roles are missing.
- Reject browser-only required asset previews before they reach provider request mapping.
- Require provider-safe URLs only for HTTP/provider-bound submission paths.

### Not In This Step

- No live image generation API.
- No provider credential execution.
- No remote storage or signed URL delivery.
- No UI redesign.

### Next Step

- Continue with provider-ready execution scaffolding only after the queue-before-provider validation path stays green.

## 2026-05-22 Implementation Update: Prompt Asset URL Consumption

### MVP Implementation Step

- Make prompt packages include mode-relevant asset bindings with URL, mime type, and storage key metadata.
- Add missing required asset validation for image prompt packages.
- Make provider request mapping consume committed public asset URLs and reject browser-only preview URLs for required references.
- Keep provider execution mocked and network-free.

### Not In This Step

- No live image generation API.
- No remote storage or signed URL delivery.
- No asset preprocessing or thumbnail generation.
- No UI redesign.

### Next Step

- Surface prompt asset validation results in the workbench inspector/task feedback.
- Then connect the generation action to stop early when required material is missing.

## 2026-05-22 Implementation Update: Local Binary Asset Adapter

### MVP Implementation Step

- Add a local multipart upload route behind the existing asset upload-plan contract.
- Write selected image files into project-local public upload storage for development use.
- Commit asset records with a stable local public URL when binary upload succeeds.
- Keep this as a replaceable adapter boundary before production object storage.

### Not In This Step

- No cloud object storage.
- No thumbnail generation.
- No auth or permissioned delivery.
- No live provider execution.
- No cleanup/retention scheduler.

### Next Step

- Make prompt packages and provider request mapping consistently use committed asset public URLs.
- Then add provider-safe asset validation and failure states before any live generation adapter.

## 2026-05-22 Implementation Update: Real File Selection Metadata Intake

### MVP Implementation Step

- Let `02 Assets` open a real local image file picker.
- Send selected file metadata through the existing upload-plan and commit flow.
- Show the selected asset through runtime asset slots and local preview metadata where available.
- Keep binary upload, object storage, and thumbnail generation out of this step.

### Not In This Step

- No binary transfer.
- No cloud storage.
- No persistent thumbnail service.
- No provider execution.
- No asset permission model.

### Next Step

- Add a small local/binary upload adapter behind the current upload-plan contract.
- Then make generated prompt packages use the selected asset records as provider references.

## 2026-05-21 Implementation Update: React Asset Section Boundary

### MVP Implementation Step

- Migrate `02 Assets` into a mounted React component.
- Keep the existing metadata-only simulated asset upload flow.
- Preserve a static fallback for non-React preview continuity.
- Let asset operations request a shell rerender after completion so runtime asset counts and slots stay current.

### Not In This Step

- No real file picker.
- No binary upload.
- No thumbnail extraction.
- No object storage.
- No provider execution.

### Next Step

- Add the real file input boundary behind the existing asset upload-plan contract.
- Keep binary upload, thumbnailing, permissions, and storage adapter tests separate from this UI migration.

## 2026-05-21 Implementation Update: React Hook Form Brief And Direction Sections

### MVP Implementation Step

- Migrate `01 Brief` into a mounted React Hook Form component for project name, game description, and focus guidance.
- Migrate `03 Direction` into a mounted React Hook Form component for mode-aware creative direction controls.
- Validate both sections with existing Zod form schemas before writing back to runtime workspace form state.
- Keep static fallbacks for non-React preview continuity.
- Preserve the accepted workbench shell and avoid a broad left-panel rewrite.

### Not In This Step

- No live image generation API.
- No real upload flow.
- No full React workbench rewrite.
- No new visual direction.
- No provider-specific prompt execution.

### Next Step

- Migrate the `02 Assets` section into a React-owned boundary, still metadata-only first.
- Then connect the existing upload-plan contract to a real file input and binary upload adapter.

## 2026-05-21 Implementation Update: React Hook Form Output Settings Section

### MVP Implementation Step

- Migrate `04 Output` into a mounted React Hook Form component.
- Validate output values with `OutputSettingsFormSchema` and `zodResolver`.
- Keep a static fallback for non-React preview continuity.
- Write platform presets, aspect ratios, images per scheme, and scheme count back into runtime workspace form state.
- Preserve the accepted static shell and avoid a broad React rewrite.

### Not In This Step

- No live image generation API.
- No complete left-panel React rewrite.
- No new visual direction.
- No persistence beyond the current runtime workspace route flow.

### Next Step

- Migrate the `01 Brief` section into a React Hook Form component, including project name, game description, and focus guidance validation.
- Then migrate mode-specific direction controls after the brief section is stable.

## 2026-05-21 Implementation Update: Workbench Form Runtime Binding

### MVP Implementation Step

- Bind current left-panel production controls to runtime workspace form state.
- Preserve the accepted static workbench layout and visual design.
- Use schema-aligned field paths for brief, direction, mode settings, output size/count, and provider-adjacent submission data.
- Make generation submission read the edited runtime form values instead of rebuilding all active-mode values from fixtures.
- Keep React Hook Form + Zod as the target form contract for the next React migration slice.

### Not In This Step

- No full React component rewrite.
- No new UI redesign.
- No live provider execution.
- No true file upload or binary processing.
- No persisted user account settings.

### Next Step

- Move one high-value left-panel section into a real React Hook Form component using the existing `GenerationFormSchema` resolver.
- Recommended first section: output settings, because it directly affects queue payload count and platform/ratiometric validation.

## 2026-05-21 Implementation Update: Queue Run And Result Refresh

### MVP Implementation Step

- Persist HTTP-created queue plans into the workspace snapshot.
- Add a local queue run route for `POST /api/workspaces/:workspaceId/queue-plans/:jobId/run`.
- Run the queued plan through the mock-safe workspace queue worker.
- Reload the workspace snapshot after queue execution.
- Let task status, queue summary, results, and archive state read from the refreshed runtime snapshot.

### Not In This Step

- No live provider execution.
- No background daemon, websocket, or polling loop.
- No binary result storage or CDN delivery.
- No retry scheduler or cancellation orchestration.

### Next Step

- Add focused React Hook Form + Zod bindings for the production settings sections while preserving the current workbench shell.
- Then add real file-input upload transport behind the existing asset upload-plan contract.

## 2026-05-21 Implementation Update: Asset UI Metadata Route Loop

### MVP Implementation Step

- Add a browser asset client for upload planning, asset commit, asset listing, and workspace reload.
- Wire left-panel asset slots and the style/reference drop area to a simulated metadata-only asset commit.
- Refresh runtime workspace data after asset commit so visible asset slots and counts update from route-backed state.
- Keep static preview functional without network calls.

### Not In This Step

- No file picker.
- No raw image upload.
- No thumbnail generation.
- No cloud/object storage SDK.
- No permission or quota model.

### Next Step

- Add a real file input boundary and binary upload adapter behind the existing upload-plan contract.
- Then bind queue/result refresh after generation submission.

## 2026-05-21 Implementation Update: Runtime Workspace Data Binding

### MVP Implementation Step

- Add a browser workspace data client for `GET /api/workspaces/:workspaceId`.
- Store the loaded workspace snapshot in shared runtime state.
- Let visible workbench regions read project, assets, providers, schemes, and archive rows from the runtime snapshot.
- Keep `api=static` available for static preview and visual comparison.
- Keep the existing layout and component structure unchanged.

### Not In This Step

- No real binary uploads.
- No live provider calls.
- No background polling or websocket updates.
- No full React component rewrite.
- No database hosting or auth ownership model.

### Next Step

- Bind the asset library and upload-plan UI to the existing asset routes.
- Then refresh queue/result state after submission using workspace snapshot reloads.

## 2026-05-21 Implementation Update: Frontend HTTP Submission Bridge

### MVP Implementation Step

- Add a browser HTTP client for workspace snapshot save, prompt package creation, provider request mapping, and queue plan creation.
- Keep the existing static service facade for static preview and visual comparison.
- Let the Next bridge opt into local HTTP route mode without rewriting the workbench UI.
- Preserve the same task drawer service-flow shape for static and HTTP submissions.

### Not In This Step

- No full React component rewrite.
- No live provider calls.
- No real uploads or database hosting.
- No UI redesign or layout changes.

### Next Step

- Bind individual workbench regions to HTTP-backed data in small slices: assets first, then generation submission, then result refresh.

## 2026-05-21 Implementation Update: Queue Worker And Result Writer

### MVP Implementation Step

- Add a workspace queue worker that executes planned tasks through the mock provider path.
- Convert successful image and post-processing tasks into stored result assets.
- Sync archive rows from generated result records.
- Save updated queue plans, queue summaries, result records, and archive rows through `StorageRepository`.
- Preserve lineage fields needed for inspector, result gallery, retry, export, and later billing.

### Not In This Step

- No live model execution.
- No distributed worker service.
- No real retry scheduler or background process.
- No binary result upload or CDN storage.

### Next Step

- Connect queue worker execution to route/job endpoints.
- Add live provider execution and result storage after credential vault and upload storage are implemented.

## 2026-05-21 Implementation Update: Provider Credential Boundary

### MVP Implementation Step

- Add runtime credential references for provider API keys.
- Add an injected credential resolver interface for future encrypted secret stores.
- Add credential-aware provider execution that injects secrets only at adapter call time.
- Keep the default verification path mock-backed and network-free.
- Return structured provider errors for missing or unresolved credentials.

### Not In This Step

- No real OpenAI, Replicate, ComfyUI, or Custom HTTP requests.
- No encrypted vault implementation.
- No user/team permission model for credential ownership.
- No clear-text API key persistence in workspaces, database rows, local drafts, or API responses.

### Next Step

- Wire queue workers to the credential-aware execution path.
- Add real provider adapters only after credential vault and live-provider test gates exist.

## 2026-05-21 Implementation Update: Asset Upload And Library Contracts

### MVP Implementation Step

- Define mode-aware asset slot requirements for Poster, Collab, Announcement, Logo, and Icon.
- Add upload metadata validation for file name, mime type, file size, role, usage, and label.
- Add placeholder upload plan DTOs that produce safe storage keys without performing real uploads.
- Add asset commit/list service methods that update workspace snapshots through `StorageRepository`.
- Add Next route contracts/handlers for asset upload planning and asset library listing/commit.

### Not In This Step

- No raw file upload handling.
- No cloud storage SDK.
- No image preprocessing or thumbnail generation.
- No workspace permission enforcement beyond contract shape.

### Next Step

- Connect visible upload controls to the asset service path.
- Add real storage provider selection after authentication and secret handling are defined.

## 2026-05-21 Implementation Update: Database Persistence Foundation

### MVP Implementation Step

- Add SQL schema for workspaces, assets, generated results, provider configuration state, and archive rows.
- Add a database-backed `StorageRepository` boundary that route handlers can use without knowing database details.
- Store full redacted workspace snapshots for reliable recovery.
- Store normalized index rows for future filtering, archive views, asset library views, and result history.
- Keep API keys out of database snapshots; only masked state and provider readiness may be stored.

### Not In This Step

- No production database hosting.
- No user authentication or workspace permissions.
- No encrypted secret vault.
- No raw image binary storage.
- No ORM selection until the schema and repository contract are proven.

### Next Step

- Add upload and asset library flows on top of the stored asset metadata contract.
- Replace the seeded route repository after workspace ownership and environment configuration are defined.

## 2026-05-21 Implementation Update: Next Route Handler Surface

### MVP Implementation Step

- Add real Next.js Route Handlers for the existing API contracts.
- Delegate all route behavior to the local API service.
- Seed the in-memory repository with the mock workspace for route smoke tests.
- Keep handlers mock-safe: no live providers, uploads, databases, or credential reads.

### Next Step

- Switch the Next/React submission path from static facade calls to HTTP calls.
- Add route-level regression checks for validation, not-found, prompt, provider mapping, and queue planning.
- Replace in-memory repository only after auth/workspace ownership rules are ready.

## 2026-05-21 Implementation Update: React Form Contract Foundation

### MVP Implementation Step

- Add React Hook Form and Zod resolver dependencies.
- Compose existing Zod schemas into a mode-aware generation form contract.
- Reuse existing mode defaults and locked-field guardrails.
- Verify defaults for Poster, Collab, Announcement, Logo, and Icon parse successfully.

### Next Step

- Replace the left configuration panel with React Hook Form controls in small sections.
- Bind mode switching to the typed generation form state.
- Submit React form values through the existing local service flow before adding HTTP routes.

## 2026-05-21 Implementation Update: Next.js Migration Shell

### MVP Implementation Step

- Add Next.js App Router and React as the target application shell.
- Mount the existing static workbench through a client bridge first, preserving the accepted UI and static prototype.
- Keep the current static server available during migration for visual comparison.
- Add Next-specific scripts and verification without connecting live APIs.

### Next Step

- Extract the bridge-mounted workbench into React components in small slices.
- Move generation submission state into React state and then React Hook Form.
- Replace the static service facade with App Router route handlers only after component boundaries are stable.

## 2026-05-21 Implementation Update: Static Workbench Local Service Flow

### MVP Implementation Step

- Connect the current static generation action to a local service-shaped flow.
- Run prompt package creation, provider request mapping, and queue plan creation from the existing submission DTOs.
- Store route-style envelopes and queue summary on the UI submission state for task drawer feedback.
- Keep this step static-only: no HTTP, no live providers, no uploads, no database, and no Next.js handlers.

### Next Step

- Start the Next.js App Router migration with the same service flow and UI state shape.
- Replace the static facade with real route handlers after React form state is in place.
- Keep provider execution mocked until credentials and live adapter tests are ready.

## 2026-05-21 Implementation Update: Local API Service Boundary

### MVP Implementation Step

- Add a local API service facade that mirrors the API route contracts before framework route handlers.
- Parse workspace load/save, prompt package creation, provider request mapping, and queue plan creation through existing request schemas.
- Return route-style success/failure envelopes with trace metadata and structured validation errors.
- Use the in-memory repository by default; do not call live providers, network APIs, browser storage, databases, uploads, or filesystem writes.
- Add service-boundary validation to the project check command.

### Next Step

- Connect static submission drafts to the local service path before introducing HTTP.
- Migrate the service methods into Next.js Route Handlers once the app shell moves to React.
- Replace the in-memory repository with database persistence only after auth and workspace ownership are defined.

## 2026-05-21 Implementation Update: E2E Mock Contract Loop

### MVP Implementation Step

- Add an executable mock E2E loop across workspace snapshot, prompt package, provider request mapper, mock provider executor, and queue summary.
- Verify both brief-generation and image-generation paths.
- Keep the loop free of live APIs, credentials, uploads, databases, and file writes.
- Add E2E loop validation to the project check command.

### Next Step

- Convert the static app to real route handlers and React form submission using the same flow.
- Add database-backed repository after auth and workspace ownership are defined.
- Add live provider adapters only after the mock loop remains green.

## 2026-05-21 Implementation Update: Provider Execution Bridge

### MVP Implementation Step

- Add a provider adapter registry and execution bridge for mapped provider requests.
- Use mock adapters as the default execution registry so checks can run without credentials or network.
- Convert stored provider settings to adapter config without restoring clear-text API keys.
- Return structured provider errors for missing adapters or unsupported capabilities.

### Next Step

- Route queue tasks through the execution bridge in the end-to-end mock loop.
- Add live provider adapters only after credentials, error handling, and provider-specific tests are ready.
- Keep live adapters replaceable behind the same registry.

## 2026-05-21 Implementation Update: Local Draft Persistence

### MVP Implementation Step

- Add a local draft repository that implements the storage repository contract.
- Persist and hydrate the static prototype's latest submission draft locally.
- Keep persisted provider credentials masked; do not store clear-text API keys.
- Keep this step local-only: no database, no remote API, no provider execution, and no file uploads.

### Next Step

- Add database schema and repository adapter after auth and workspace ownership rules are defined.
- Connect API route handlers to repository implementations after local save/load behavior is stable.
- Add migration rules before moving local drafts into a real database.

## 2026-05-21 Implementation Update: Static Frontend Form Binding

### MVP Implementation Step

- Bind the current static workbench generation action to in-memory API payload drafts.
- Build prompt package creation and queue plan creation payloads from current mode, selected scheme, provider, workspace snapshot, and output settings.
- Validate project brief, output settings, slogan settings, and mode form drafts before marking a submission ready.
- Show the latest local submission draft in the task chrome for debugging and handoff visibility.
- Keep the prototype free of HTTP calls, real uploads, real provider execution, and persistence.

### Next Step

- Save local submission drafts through the storage repository contract.
- Later replace static binding with React Hook Form while keeping the same DTO flow.
- After persistence is stable, connect API route handlers to these payloads.

## 2026-05-21 Implementation Update: API Route Contract Layer

### MVP Implementation Step

- Add typed API request and response contracts before real route handlers.
- Cover workspace snapshot load/save, prompt package creation, provider request mapping, and queue plan creation.
- Use API envelopes for success and failure responses so future UI errors have a consistent shape.
- Keep the layer free of real network calls, route handlers, credential reads, provider execution, and persistence.

### Next Step

- Bind frontend form submissions to these route DTOs in-memory before introducing real HTTP calls.
- Implement real Next.js route handlers only after UI binding and local persistence behavior are stable.
- Add adapter tests that parse both request and response payloads through the API schemas.

## 2026-05-21 Implementation Update: Provider Request Mapper

### MVP Implementation Step

- Map prompt packages into typed Provider request DTOs before API route integration.
- Support brief generation and image generation request shapes without real provider calls.
- Resolve provider model slots from workspace provider settings with conservative fallbacks.
- Convert prompt asset bindings into provider asset references while preserving role, label, mime type, preview URL, and placeholder descriptions.
- Add request-mapper checks to the project verification script.

### Next Step

- Add API route contracts that accept workspace, prompt, and provider request DTOs without executing real generation.
- Bind real frontend form submission to prompt package creation and request mapping after route contracts are stable.
- Keep real provider adapters behind the mapper and API boundary.

## 2026-05-21 Implementation Update: Prompt Builder Contract Layer

### MVP Implementation Step

- Add prompt package contracts before real Provider requests.
- Centralize five-mode prompt guardrails for Poster, Collab, Announcement, Logo, and Icon.
- Build prompt packages from workspace snapshots, scheme briefs, mode state, brand kit, character profiles, asset references, slogans, and platform settings.
- Add prompt contract checks to the project verification script.

### Next Step

- Map prompt packages into typed Provider requests for brief generation and image generation.
- Surface prompt package preview in the inspector after the React migration or static prompt preview refactor.
- Implement real provider calls only after prompt, provider, queue, and storage contracts are stable.

## 2026-05-21 Implementation Update: Local Draft Repository And Static Snapshot Binding

### MVP Implementation Step

- Add an in-memory draft repository that implements the storage repository contract.
- Add a static workspace snapshot adapter so current prototype data can be read through the persistence shape.
- Start deriving Provider settings and archive rows from the workspace snapshot instead of isolated fixtures.
- Keep the prototype free of real database, file upload, `localStorage`, and API persistence.

### Next Step

- Bind more workbench runtime state to workspace snapshot data, especially selected project, selected mode, and result records.
- Add API route contracts after repository behavior is stable.
- Add database adapter only after auth and workspace ownership rules are defined.

## 2026-05-21 Implementation Update: Storage Contract Layer

### MVP Implementation Step

- Add a persistence contract for project workspace snapshots before database integration.
- Cover project brief, brand kit, character profiles, asset references, mode forms, output settings, slogan settings, provider settings, queue plans, result assets, and archive rows.
- Add redaction rules so Provider API Keys are never stored in clear text.
- Add storage contract checks to the project verification script.

### Next Step

- Wire static project fixtures into the storage snapshot shape.
- Add repository interfaces for local draft cache and future database adapters.
- Connect real persistence only after API routes and auth boundaries are defined.

## 2026-05-20 Implementation Update: Task Queue Contract Layer

### MVP Implementation Step

- Add queue job, task, event, retry, progress, cost, and status contracts.
- Add a batch queue planner that maps mode, schemes, outputs, and post-processing flags into task graphs.
- Add a mock queue runner that consumes the mock provider adapter without real API calls.
- Add queue contract checks to the project verification script.

### Next Step

- Connect the static bottom task bar to derived queue summaries.
- Add persistence boundaries for jobs and tasks after the contract stabilizes.
- Replace mock runner with real worker execution only after provider credentials and storage are implemented.

## 2026-05-20 Implementation Update: Provider Adapter Contract Layer

### MVP Implementation Step

- Add provider capability and model-slot contracts before real provider calls.
- Add request/response DTOs for brief generation, image generation, image editing, upscaling, and background removal.
- Add static manifests for OpenAI, Replicate, ComfyUI, and Custom HTTP.
- Add a mock provider adapter for future task queue and UI tests.

### Next Step

- Connect provider settings form values to adapter config validation.
- Add task queue DTOs that call the mock adapter first.
- Implement real provider adapters only after credentials, storage, and queue boundaries are in place.

## 2026-05-20 Implementation Update: Form Adapter Layer

### MVP Implementation Step

- Add framework-agnostic form adapters that map Zod schemas, defaults, field groups, and intended control types.
- Cover project brief, output settings, slogan settings, provider settings, and all five production mode forms.
- Keep adapters independent from React and real API calls.

### Next Step

- Use adapters to build React Hook Form components during the later Next.js migration.
- Add provider adapter DTO validation using the same schema vocabulary.

## 2026-05-20 Implementation Update: TypeScript And Zod Schema Track

### MVP Implementation Step

- Add TypeScript/Zod schemas for core entities, core forms, Provider config, generation jobs, result assets, and five production modes.
- Keep the current static workbench in JavaScript for now; only schema contracts move to TypeScript first.
- Add typecheck coverage for schema files before React Hook Form or database integration.

### Next Step

- Build typed form adapters that map Zod schemas to future React Hook Form screens.
- Introduce provider adapter DTOs using the same schema vocabulary.
- Only after schema contracts are stable, migrate the static render modules into React components.

## 2026-05-20 Implementation Update: Executable Schema Layer

### MVP Implementation Step

- Add schema defaults for project brief, slogans, output settings, mode forms, Provider settings, and generation drafts.
- Add framework-agnostic validators for core forms and mode-specific guardrails.
- Add static fixture integrity checks for five production modes and provider fixtures.
- Add `npm run schema:check` as the first schema regression command.

### Next Step

- Convert the validated schema layer to TypeScript types and Zod schemas when the app moves into the Next.js implementation track.
- Wire Zod schemas into React Hook Form after the form components are migrated from static render modules to React components.
- Add persistence models only after the schema contracts are stable.

## 2026-05-20 Implementation Update: Static Module Boundaries And Schema Draft

### MVP Implementation Step

- Split the accepted static workbench into ES module boundaries without changing the visual direction or connecting APIs.
- Keep `app.js` as the orchestration entry only.
- Move static production mode fixtures, provider fixtures, task queue fixtures, render modules, and event binding into `src/*`.
- Add `src/schema/models.js` as the first framework-agnostic data model and form schema contract.

### Next Step

- Map the schema draft to TypeScript types and Zod schemas after the project migrates to the target Next.js stack.
- Replace static render modules with React components gradually, keeping the same workbench shell and state boundaries.
- Introduce mock provider adapters before connecting real providers.

## 2026-05-20 Roadmap Update: Production Modes

### MVP Additions

- Add a five-mode production switcher: Poster, Collab, Announcement, Logo, and Icon.
- Render mode-specific left configuration fields without changing the core workbench shell.
- Render mode-specific asset slot sets:
  - Poster: general character, logo, background, composition reference.
  - Collab: game character, collab character, crossover scene, game logo, collab brand logo.
  - Announcement: game character, game scene, brand logo.
  - Logo: game visual element or prop, optional character/prop reference.
  - Icon: subject reference, composition reference, style reference.
- Add static prompt guardrail previews in the inspector for each mode.
- Lock Icon mode to 1:1 in the static UI.
- Surface Logo pure-background and wordmark-priority constraints in the static UI.

### Beta Follow-Up

- Automated Logo background purity validation.
- Automated Icon text, padding, border, and rounded-corner validation.
- Real asset preprocessing and pixel-level output correction.
- Persistent prompt templates for each production mode.

## 2026-05-19 Roadmap Update

### MVP Additions

- Light and Dark theme switch in the core workbench.
- Model and API Key configuration surface for OpenAI, Replicate, ComfyUI, and Custom HTTP.
- Provider adapter planning surfaced in UI through provider capability tags and default model selection.
- Collapsible right inspector with rail, click-to-open, and pin behavior.
- Slim bottom task status bar with expandable task drawer.
- Static connection states for provider setup: unconfigured, configured, testing, success, failure.

### Beta Follow-Up

- Persistent encrypted API Key storage.
- Workspace-level provider defaults and per-project overrides.
- Provider health checks and usage/cost reporting.
- Team permission rules for who can view or edit provider credentials.

## 路线图原则

MVP 先完成完整生产闭环：项目、素材、品牌、角色、平台规格、方案生成、批量出图、后处理、筛选、导出。

视觉和交互以明亮中性专业工作台为主，先把高频生产流程做稳定。Beta 再增强高级游戏发行后台能力。后续版本再扩展创意导演式 AI 画布。

## MVP

MVP 目标：完成从游戏项目创建到批量生成、后处理、导出的完整闭环。

### 1. 项目与素材基础

- 项目创建和编辑。
- 游戏名称、描述、品类、卖点、目标用户。
- 素材上传。
- 素材分类：角色、logo、背景、道具、UI、参考图。
- 素材预览和删除。
- 图片格式和大小限制。

### 2. 品牌资产库

- Logo 上传。
- 品牌主色设置。
- 字体风格描述。
- 品牌关键词。
- 禁用元素。
- 固定文案。
- 项目级默认品牌资产。

### 3. 角色一致性

- 创建角色档案。
- 上传角色参考图。
- 填写角色描述。
- 选择生成时引用的角色。
- 设置角色一致性强度。
- 支持角色锁定。

MVP 中角色一致性采用参考图和提示词约束，不包含私有模型训练。

### 4. 平台规格

- Steam。
- App Store。
- Google Play。
- TapTap。
- TikTok。
- Meta Ads。

每个平台包含：

- 推荐比例。
- 推荐尺寸。
- 文案长度提示。
- 导出命名规则。

### 5. 核心工作台

- 生产台式左中右布局。
- 五模式切换：海报、联名、公告、Logo、Icon。
- 模式切换时动态替换 Brief、Assets、Direction、Output 和 Inspector 内容。
- 左侧生产配置区：项目输入、素材、参考图、风格、尺寸、数量、宣传词和高级参数。
- 中央生产板：方案卡网格、结果组、文本展开态、空状态、加载态和失败态。
- 右侧检查器：当前方案或图片详情、Prompt、宣传词、锁定字段和后处理入口。
- 顶部栏：项目、展开文本、收藏夹、档案馆、停止任务、开始批量渲染。
- 轻量任务反馈：toast、小队列、卡片内进度、失败重试。

### 6. 生成能力

- 海报、联名、公告、Logo、Icon 五类生产模式。
- 方案数量。
- 每方案图片数量。
- 比例。
- 尺寸。
- 平台规格。
- 模型选择。
- 画风选择。
- 宣传词模式。
- 多语言宣传词。
- 侧重点引导。
- 构图参考。
- 方案生成。
- 批量出图。
- 模式专属 Prompt 约束：联名角色锁定、公告排版模式、Logo 纯色背景、Icon 无文字满铺。

### 7. 构图参考和提示词提取

- 上传参考图。
- 弱参考。
- 构图参考。
- 高质量构图参考。
- 提取构图、光影、主体关系、文字区域、色彩、风格关键词。

### 8. 后处理

- 局部重绘。
- 高清放大。
- 背景移除。

### 9. 任务队列

- 父子任务。
- 排队状态。
- 进度展示。
- 失败重试。
- 取消任务。
- 任务日志。
- 结果回写。

### 10. 结果画廊

- 按项目筛选。
- 按方案筛选。
- 按平台筛选。
- 按语言筛选。
- 按模型筛选。
- 收藏。
- 下载。
- 后处理入口。

### 11. 档案馆和结果预览

- 基础档案馆。
- 生成历史列表。
- 缩略图、标题、关联项目、模型/画风和操作。
- 单张结果大图预览。
- 结果预览底部 action dock。
- 收藏、归档、下载、视觉重构、社媒贴文入口。

## Beta

Beta 目标：提高团队使用、管理能力、质量评估和大规模生产效率。

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
- 审核与合规提醒。
- 项目级默认设置。
- 生成历史对比。
- 批量导出预设。
- 活动视图。
- 平台素材完成度。
- 多语言交付状态。
- 导出队列和打包记录。

## 后续版本

后续版本目标：增强自动化、专业生产能力和外部系统集成。

- 私有模型训练或 LoRA 工作流。
- 多角色关系控制。
- AI 选图助手。
- 自动 A/B 测试素材命名。
- 广告投放包导出。
- 多人评论和批注。
- 品牌手册自动生成。
- 素材版权来源管理。
- 与 ComfyUI 深度集成。
- 与 Stable Diffusion 私有工作流集成。
- 与广告平台打通。
- 与 Steam、App Store、Google Play 后台打通。
- 创意导演式 AI 画布。
- 结果版本时间线。
- 更强的方案分镜和视觉探索模式。
