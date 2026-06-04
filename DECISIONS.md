# DECISIONS.md

## D111: rc.7 Prioritizes Prompt Anchor Compression For Poster And Collab

Status: accepted

Context: Agnes is useful for free real-generation smoke tests, but earlier Poster and Collab outputs showed that long provider-neutral prompts can dilute the most important visual anchors in compressed prompt profiles. Poster failures included missing/weak BOSS threat, duplicate/generic characters, fake text, and sticker-like integration. Collab failures included the uploaded partner being demoted, omitted, or reading as a separate sticker instead of an equal co-star.

Decision: `1.1.0-rc.7` keeps the provider-neutral integrated-redraw architecture, but adds short front-loaded quality contracts for compressed providers. Poster receives a `KV ACTION MINI-BRIEF` that prioritizes uploaded hero, uploaded BOSS/key threat, single logo/copy-safe area, shared ground plane, contact shadows, occlusion, rim light, and VFX integration. Collab receives a partner-first dual-subject contract that makes the uploaded collabCharacter and gameCharacter the two primary readable co-stars before logos, plates, backgrounds, or decorations.

Impact:

- The default pipeline remains AI integrated redraw, not local sticker overlay.
- Collab image prompts now explicitly reject partner disappearance, logo-only partner presence, third lead characters, and merged/hybrid identities.
- Poster prompts now protect required visual anchors earlier for models with shorter prompt attention.
- Agnes Poster/Collab remain quality-risk modes requiring manual review; this decision improves handoff quality but does not promise model-independent identical results.

## D110: Icon And Logo UI Alignment Does Not Change The Quality Priority

Status: accepted

Context: The user supplied the GameIcon Pro source and screenshots as reference for Icon and Logo interfaces, while also clarifying that Poster, Collab, and Announcement should be optimized first and Icon/Logo generation quality can later use the Gemini reference implementation.

Decision: `1.1.0-rc.6` aligns Icon and Logo UI, state, schema, and prompt handoff with the reference sidebar pattern: mode-specific asset slots, style presets, wordmark/background controls for Logo, style selection for Icon/Logo, and clear no-text/single-subject/icon-readability rules. This is not treated as the final Icon/Logo quality pass. Rounded Icon corners remain acceptable when intentional and polished.

Impact:

- Icon and Logo no longer look like lightweight Poster variants in the left configuration flow.
- Icon/Logo style choices now persist and enter prompt construction.
- The next quality sprint stays focused on Poster, Collab, and Announcement.
- The dedicated Icon/Logo engine pass is deferred until the Gemini reference behavior and requirements are integrated.

## D109: Intentional Rounded Icon Corners Are Allowed

Status: accepted

Context: Earlier Icon acceptance rules treated rounded app-icon masks as a hard failure because real generations often placed the subject inside a small dark rounded container on a white square canvas. The user has clarified that rounded corners themselves are acceptable now; the real problem is white borders, accidental padding, unreadable edge marks, or a low-quality container that shrinks the subject.

Decision: Icon mode keeps hard locks for `1:1`, no text, one dominant readable subject, and clean edges. Rounded corners, badge-like framing, or app-icon styling are allowed when intentional and polished. Result Quality Audit should keep corner metrics for diagnostics but should only trigger `icon-rounded-mask-risk` when the icon appears inside a separate high-contrast padded container or frame.

Impact:

- Icon prompts no longer forbid rounded corners by default.
- Transparent or intentionally rounded icon treatments no longer fail the automated audit by themselves.
- Local Icon edge repair remains available only for harmful container/padding or edge-mark failures.
- Manual acceptance should judge small-size readability and subject clarity before corner shape.

## D108: Unsupported Current Provider Actions Are Blocked Instead Of Silently Rerouted

Status: accepted

Context: The product now supports per-slot provider routing and Agnes all-core testing, but result operations such as variants, upscaling, and background removal can be confusing if the current provider is selected in the UI while the action silently falls back to a different provider. The user expectation is that a chosen model/provider either supports the selected function or the tool clearly explains why it cannot run.

Decision: Capability gates should separate core support from quality risk. If the selected provider does not support a function, the UI must disable or block that operation with an explicit provider/capability message. It must not silently swap to another provider unless a future UI makes that alternate route explicit and user-selected.

Impact:

- Result action buttons now resolve against the current provider only.
- Google image generation can remain valid while Google image-edit result variants are disabled with a clear message.
- Agnes concept/image generation remains allowed, but all-Agnes Poster and Collab stay marked as visual quality risks requiring manual review.
- Tests must cover unsupported action buttons, provider capability routes, and the distinction between capability pass and visual acceptance.

## D107: 1.1.0-rc.5 Keeps Real Generation Behind The App Safety Gate

Status: accepted

Context: The workspace has Google configured, masked credentials present, the required five-mode asset roles, and stored baseline results for Poster, Icon, Logo, Announcement, and Collab. However, fresh rc.5 real generation would spend provider credits. Running a direct route or script with confirmations injected would technically exercise the service, but it would bypass the visible App live-safety flow that users rely on to understand cost and external-provider execution.

Decision: Add `REAL_GENERATION_ACCEPTANCE.md` and `real-acceptance:check`. Record current baseline result evidence and mark fresh rc.5 generation as pending live safety gate. Never use a direct API/script path to bypass the App live safety gate. Fresh runs must be started through the App safety workflow with live run, provider cost, external provider, result storage, and cost-cap confirmations visible.

Impact:

- The final 1.1 stable decision can separate existing baseline evidence from fresh rc.5 live acceptance.
- Provider spend remains visible and intentional.
- Automation can verify the acceptance record and safety contract without triggering paid calls.
- The next pass can run one bounded fresh generation per mode through the App, or promote with deferred modes documented as stable risks.

## D106: 1.1.0-rc.3 Requires A Multimode Acceptance Matrix

Status: accepted

Context: RC2 made user testing possible, but the acceptance criteria for Poster, Icon, Logo, Announcement, and Collab were still spread across the guide, old test notes, and regression scripts. The user also does not currently have partner/collab IP material, so Collab testing needs a safe synthetic input that does not accidentally become a fake brand/logo test.

Decision: Add `MULTIMODE_ACCEPTANCE.md` and a zero-cost `multimode-acceptance:check` release gate. Add `public/mock-assets/collab-partner-sundae-ranger.svg` as the rc.3 synthetic `collabCharacter` fixture. The fixture is a fictional visual partner only, contains no readable text, and is not a partner `brandLogo`. Missing partner brandLogo must still use a blank partner brand plate or neutral emblem.

Impact:

- Multimode testing has explicit pass/fail criteria instead of scattered judgment calls.
- Collab can be tested without waiting for a real partner asset and without reusing BOSS, Logo, or prop assets as the partner.
- Real generation remains bounded to max 1 real generation per mode for the rc.3 pass unless one focused rerun is needed.
- Future real partner assets can replace the synthetic fixture without changing the Collab brand-safety rule.

## D105: 1.1.0-rc.2 Requires A User Test Readiness Guide

Status: accepted

Context: The RC1 UX gate verifies key UI states, but real users still need a clear testing path: which desktop app to open, how to confirm version/path, how to enable live generation safely, which assets to upload, what each mode should visually satisfy, and what to report when something fails.

Decision: Add `USER_TESTING.md` and a zero-cost `user-test-readiness:check` release gate. The guide keeps live generation opt-in, limits acceptance runs to 1-2 generations per mode when needed, lists per-mode visual acceptance criteria, and explains result review/failure recovery. Release candidates must keep this guide version-aligned with the desktop app.

Impact:

- User testing has a repeatable checklist instead of ad hoc instructions.
- Real provider spend remains bounded and intentional.
- Reports should include the app version, workspace revision, mode, asset roles, result id, live-gate state, audit findings, and visual failure.

## D104: RC Builds Require A UX Reliability Gate

Status: accepted

Context: The 1.1 beta work stabilized the generation chain, but a usable desktop app also needs predictable navigation, visible state, clear safety blockers, result recovery, and confirmation before destructive actions. These UX expectations were partly covered by broad frontend checks, but not by a release-candidate gate that renders the key screens.

Decision: Add a dedicated zero-cost `ux-regression:check` gate for RC builds. It renders the shell, blocked live-generation state, results board, result viewer, settings sheet, generation-choice dialog, project library, and failed queue state. It verifies that core entry points and safety messages remain visible. Scheme deletion now mirrors result deletion with a second-click confirmation.

Impact:

- RC releases are judged on usability, not only prompt/provider correctness.
- Destructive scheme deletion is less likely to happen by misclick.
- The check stays local-only and avoids provider cost.
- Future UI polish can change layout details, but must preserve the main workflow affordances.

## D103: Multimode Regression Is A Release Gate

Status: accepted

Context: Poster, Icon, Logo, Announcement, and Collab now share the same asset semantic/fusion foundation, but each mode still has different output goals. Prior checks covered many individual prompt and provider rules, yet the cross-mode behavior was buried inside broader scripts and could be missed when one mode was tuned aggressively.

Decision: Add a dedicated zero-cost `multimode-regression:check` release gate. It constructs provider-ready workspace snapshots, builds image prompt packages for every mode, maps them to provider requests, and asserts the core non-negotiables: Poster integrated redraw, Icon no-text square single subject, Logo copy-safe blank wordmark redaction, Announcement copy-safe panels, and Collab separate identities/brand safety. The gate also verifies long prompt packages preserve `Mode Guardrails` after compaction.

Impact:

- Mode-specific quality rules are protected together before packaging.
- Future prompt changes can still improve a single mode, but they must not accidentally turn other modes into Poster KV, fake Logo text, unsafe Announcement copy, or merged Collab identities.
- The check is local-only and does not spend provider credits.

## D102: Collab Validation May Use A Synthetic Partner Asset

Status: accepted

Context: The 1.1 beta multimode acceptance pass still needed a Collab real-generation validation, but the current user workspace did not include a real partner/collab character asset. Running Collab without a `collabCharacter` would either fail validation or risk treating an unrelated BOSS/prop as the partner identity.

Decision: For the beta.5 validation pass, create a clearly synthetic partner character asset and commit it through the normal asset upload path as `role=collabCharacter`. Treat it like any uploaded reference during prompt/package/provider mapping. Do not use the uploaded BOSS/prop as the partner. If no partner `brandLogo` exists, keep the partner brand area blank or neutral instead of generating fake readable partner branding.

Impact:

- Collab can be tested end to end without waiting for a real partner IP asset.
- The test still exercises the true uploaded-reference path rather than a mock-only prompt.
- Missing partner logo safety remains visible through `collab-missing-partner-brand-logo` and `collab-blank-partner-brand-plate` review findings.
- Future real partner assets can replace the synthetic asset without changing the Collab safety rules.

## D101: Logo Copy-Safe Mode Redacts High-Risk Wordmarks From Image Prompts

Status: accepted

Context: The `1.1.0-beta.3` Logo live validation no longer produced a poster scene, but the image model still rendered partial readable text from the uploaded logo/project name. The result looked polished while omitting part of the title, which is more dangerous than a clearly blank refinement plate.

Decision: In `copySafeBlankWordmark` mode, redact high-risk wordmark text, project title terms, wordmark fragments, translated project/category terms, and readable-lettering cues from final provider image prompts and Logo asset descriptions. Add an explicit `COPY-SAFE BLANK WORDMARK ENFORCEMENT` block. Treat uploaded logos in Logo mode as non-text brand motif references for color, silhouette, spacing, material, and plate styling rather than exact wordmark references. When the uploaded Logo reference itself contains readable lettering, withhold that inline visual reference from Google Logo copy-safe image requests and rely on non-text brand cues instead.

Impact:

- Complex Logo mode outputs should produce blank plates/emblems instead of partial title fragments.
- Uploaded Logo assets still guide brand feel without inviting copied/malformed letters.
- Exact final lettering remains a later vector/text refinement step.
- Provider-request and Google adapter checks now guard this behavior.
- The packaged beta.4 Desktop Test Path passed with `job-logo-project-pizza-kitchen-beta4-logo-clean-redaction-mpwt2nz8`, which produced a blank title plate without readable or pseudo-readable text.

## D100: Icon Audit Must Detect White-Corner Dark-Edge App Containers

Status: accepted

Context: The `1.1.0-beta.2` Icon live validation no longer produced a Poster KV composition, but the image model still returned a rounded black app-icon container on a white square canvas. The existing audit only caught transparent corners or fully dark corner containers, so this common white-corner/dark-edge failure incorrectly passed.

Decision: Extend Icon Result Quality Audit with outer-corner and edge-band luminance sampling. A light outer corner paired with a much darker edge band and opaque center is treated as `icon-rounded-mask-risk` through `iconLightCornerDarkEdgeContainerRisk`. The local Icon edge repair now fades the full outer edge band over a blurred center-derived background, not only the corner area.

Impact:

- Rounded app-icon frames with white outside corners are no longer accepted as pass.
- The repair remains zero-cost, local, and Icon-only.
- The next Desktop Test Path rerun should confirm whether the packaged app stores a repaired full-canvas Icon instead of a black rounded container.

## D099: Non-Poster Brief Generation Must Not Inherit Poster KV Architecture

Status: accepted

Context: The 1.1 Beta multimode live validation showed that Icon, Logo, and Announcement schemes could be generated from Poster KV architecture instructions. The image model then followed the scheme faithfully, producing battle-poster compositions where Icon needed one simple subject and Announcement needed a readable copy-safe panel.

Decision: Make brief generation mode-aware. Poster keeps the cinematic KV architecture prompt, Poster sanitizer, and architecture augmentation. Icon, Logo, Announcement, and Collab bypass Poster KV slots and receive their own planning rules and normalization locks. Icon and Logo clear generated slogans; Icon normalization prepends an `ICON MODE ONLY` prompt lock and strips Poster/KV contamination from provider text.

Impact:

- Poster quality work remains intact.
- Icon, Logo, Announcement, and Collab no longer inherit Poster scheme templates.
- Automated Google adapter checks simulate contaminated Icon brief output and verify mode-specific cleanup.
- The next Desktop Test Path should use one low-cost Icon rerun to visually confirm the fix.

## D098: Quality Audit Refreshes Stale Result Metadata Locally

Status: accepted

Context: The 1.1 Beta live Poster validation showed a real generated result stored only the older base Result Quality Audit metrics even though the packaged app contained the newer Poster KV audit rules. Existing result metadata can lag behind current local audit rules, which makes desktop review misleading.

Decision: Refresh stale `metadata.qualityAudit` locally when workspace snapshots are loaded or queue-run responses are returned. The refresh reads the stored result image file when available, recomputes Result Quality Audit with current mode, asset-role, and text-target context, and saves the updated metadata without calling providers or changing generated pixels.

Impact:

- Old results can pick up current Poster/Icon/Logo/Announcement/Collab review findings.
- Real-generation acceptance uses reliable local metadata after app upgrades.
- The refresh is token-free and deterministic.
- Future audit schema changes should add required mode metrics so stale audits can be detected.

## D097: Poster KV Failure Detection Is Local Review Guidance

Status: accepted

Context: Poster mode quality failures are often visible before a user can articulate them: low thumbnail contrast, letterbox/frame edges, sticker-like reference integration, missing logo treatment, or slogan/copy that is omitted, garbled, too small, or flat like PPT text. Fully judging cinematic quality still requires real image review, but basic failure signals can be captured locally.

Decision: Extend Result Quality Audit for Poster mode with local canvas metrics and review findings. The audit flags low thumbnail contrast, letterbox/frame-like edge risk, reference integration review, logo-safe treatment review, and slogan/copy-area review. Findings provide rerun guidance but do not call providers or mutate the image.

Impact:

- Poster results carry clearer review criteria immediately after generation.
- The audit remains token-free and deterministic.
- Human visual review still decides whether the KV is actually good enough.
- Future real-generation passes can use these finding codes to drive one-click rerun presets and KV architecture expansion.

## D096: Announcement And Collab Prefer Safety Plates Over Garbled Or Fake Text

Status: accepted

Context: Announcement and Collab modes have different text risks. Announcement outputs can generate garbled operational copy or cover the copy area with characters/effects. Collab outputs can invent readable partner brand names or fake sponsor logos when no partner `brandLogo` was uploaded.

Decision: Add shared safety policies. Announcement Copy Safety Strategy always reserves editable title/body copy-safe fields and falls back to blank fields for long or risky titles. Collab Brand Safety Strategy uses an uploaded partner `brandLogo` when available; otherwise it reserves a polished blank partner brand plate, neutral emblem, or copy-safe lockup instead of readable fake partner branding.

Impact:

- Announcement remains a copy-safe UI/event visual, not a poster battle with unreadable text.
- Collab keeps game and partner identities separate while avoiding fake partner wordmarks.
- Result Quality Audit records both strategies and flags fallback conditions locally without OCR or provider calls.
- Future rerun presets can use these findings to request safer copy panels, blank partner plates, stronger separation, or quieter backgrounds.

## D095: Logo Text Strategy Prefers Blank Refinement Plates For Complex Wordmarks

Status: accepted

Context: Logo mode needs brand-safe wordmark output, but image models can still produce pseudo-letters, substituted characters, or fake replacement logos when asked to spell complex titles. Treating every wordmark as directly renderable creates polished-looking but unusable Logo results.

Decision: Add a shared Logo Text Strategy. Short simple Latin wordmarks may request exact spelling with review. Complex, long, non-Latin, or punctuation-heavy wordmarks should produce a polished blank wordmark plate, emblem, badge, or mark system for later vector/text refinement instead of generated fake lettering. Result Quality Audit records the selected strategy and flags `logo-copy-safe-wordmark-fallback` for complex targets.

Impact:

- Logo mode remains a Logo/mark system, not a poster scene.
- Uploaded logos stay brand references for rhythm, color, shape, and material style, not pasted stickers.
- Automated checks remain local and token-free; no OCR or provider call is added.
- A future dedicated vector/text refinement queue can use this strategy as its handoff point.

## D094: Icon Rounded-Mask Repair Is Audit-Triggered And Local

Status: accepted

Context: The `1.0.0-beta.3` real generation pass showed that Icon mode can follow an app-icon prior: a subject appears inside a rounded dark container instead of filling the square canvas naturally. Prompt constraints reduce this, but models can still return attractive-looking masked icons that fail platform-readiness expectations.

Decision: Apply local `iconCanvasEdgeRepair` only when Result Quality Audit flags `icon-rounded-mask-risk` on an Icon result. The repair builds a blurred center-derived full-canvas underlay, soft-masks the risky corner container area, composites locally, and re-runs the audit before storing result metadata.

Impact:

- The default chain remains AI integrated redraw; this is not a local uploaded-asset overlay.
- The repair is zero-cost and does not call image providers.
- Non-Icon modes are untouched.
- 64px readability and identity fidelity still require visual review in the next real-generation pass.

## D093: Result Quality Audit Stores Non-AI Review Metadata

Status: accepted

Context: The 1.0 beta real generation pass identified several issues that cannot be reliably fixed only by prompt text: Icon outputs can inherit rounded app-icon masks, Logo spelling needs visual review, Announcement copy areas need safety review, and Collab can need a missing partner-logo check. These checks should not trigger extra model calls or mutate the generated image.

Decision: Store a `qualityAudit` metadata object on generated results. The Result Quality Audit is local-only, token-free, and review-oriented. It can flag icon rounded-mask risk from image corners, logo text accuracy review, announcement copy-safe review, collab missing partner `brandLogo`, aspect-ratio review, and local overlay fallback review.

Impact:

- Queue worker attaches `metadata.qualityAudit` when storing generated results.
- The audit can power future UI warnings without rerunning providers.
- The audit does not change final image pixels and does not spend provider credits.
- Checks guard the audit module, worker integration, and key finding codes.

## D092: Real Generation QA Locks Reference Accessories And Missing Partner Brands

Status: accepted

Context: The `1.0.0-beta.3` real generation pass showed that AI integrated redraw is the right default path, but image models can still add attractive details that were not present in uploaded assets. Icon generation added shield-like accessories, and Collab generation created a readable fake partner brand even though no partner logo was uploaded.

Decision: Treat uploaded subject accessories as locked visual identity across non-poster modes as well as Poster. Do not add new shields, weapons, tools, props, costume parts, or signature accessories unless visible in the uploaded reference. In Collab mode, missing partner `brandLogo` means a blank partner brand plate, neutral emblem, or copy-safe lockup, not generated fake partner wording.

Impact:

- Shared prompt packages include a subject accessory lock for all AI integrated redraw modes.
- Google and OpenAI live image prompts repeat the rule at provider boundary.
- Collab prompts and provider prompts prevent fake partner brand names or fake sponsor logos when no partner logo reference exists.
- Prompt and provider checks now guard these rules.

## D091: Beta UX Gives Blocked Generation A Direct Setup Path

Status: accepted

Context: Several generation controls correctly disabled when live execution was not safe, but some empty states only showed a disabled button and explanatory text. Users could understand that something was blocked without having an obvious next click.

Decision: Top-level live safety status opens the settings sheet directly. Blocked empty states now show an active `打开实机安全闸` action. Settings includes a four-step readiness strip that makes the required order visible before generation.

Impact:

- Disabled generation controls are paired with an enabled setup action.
- Icon and Logo modes avoid misleading slogan controls because their text strategy is fixed by mode.
- Queue safety copy describes pending checks instead of sounding like a failed generation.

## D090: 1.0 Beta Shares Asset Fusion Across Production Modes

Status: accepted

Context: Poster mode now uses uploaded assets as visual references for AI integrated redraw instead of default local overlay. Icon, Logo, Announcement, and Collab also need to benefit from that fusion logic, but each mode has a different visual goal and should not become a poster prompt with another label.

Decision: Keep shared asset semantic role and fusion strategy as the common prompt/request layer, then let each production mode constrain its own output. Icon mode is square, text-free, and single-subject. Logo mode is mark/wordmark-first and filters unrelated antagonist-like props. Announcement mode prioritizes calm copy-safe regions. Collab mode preserves two separate parties in one shared scene. Poster mode remains cinematic KV-first with protagonist, BOSS, logo, and slogan integration.

Impact:

- Uploaded assets are references for redraw by default across modes.
- Local overlay remains a fallback path only when explicitly forced or when a failure condition is recorded.
- Prompt checks now guard Icon full-canvas rules and Logo antagonist-prop filtering.
- The Desktop Test Path requires manual one-run validation for each non-poster mode before promoting a beta build.

## D089: Workspace Summaries Use Effective Update Time

Status: accepted

Context: Workspace metadata can lag behind later result, queue, asset, or archive changes. When summaries rely only on `metadata.updatedAt`, a workspace with fresh generated results can look stale in project lists and archive flows.

Decision: `summarizeWorkspaceSnapshot` now derives `updatedAt` from the latest meaningful timestamp across metadata, provider configs, mode states, assets, reference analyses, results, archive rows, queue jobs, and queue events. The persisted snapshot shape is unchanged.

Impact:

- Existing snapshots do not need migration.
- Workspace lists and summaries better reflect real user activity.
- Storage checks guard the effective timestamp helper so this reliability rule stays in place.

## D088: Poster Production Is Scheme-First And Uses Image References

Status: accepted

Context: The left-side batch CTA was queuing image tasks immediately, which made old image results appear unexpectedly and made it easy to confuse scheme generation with final rendering. Google/Nano image generation also received uploaded assets as text metadata, but not as inline image references.

Decision: The left batch CTA now regenerates poster schemes only. Top-level Generate Poster and per-card Render Image continue from ready schemes and queue image generation. Queue planning supports `includeImageGeneration` so a brief-only batch can update scheme cards without image tasks. Provider brief requests include creative direction from the prompt package. Google image-capable requests attach local/data uploaded assets as inline image parts when available, while preserving text metadata for all providers.

Impact:

- Users can safely generate new random schemes without spending image calls or changing existing result images.
- Top-level and per-card render actions are the only normal paths that create image-generation tasks.
- Brief-only queues still carry target scheme ids so generated brief content updates the intended scheme cards.
- Uploaded characters, logos, bosses, and other assets can be sent as actual image references to Google/Nano-capable models.

## D087: Poster Batches Use One Slogan Language And Independent Character References

Status: accepted

Context: Multi-language slogans and multi-image character uploads created ambiguity in the generation flow. A single image should not mix multiple slogan languages by default, and multiple character uploads in a game poster usually mean several distinct characters rather than alternate shots of one character.

Decision: The workbench keeps one selected slogan language per batch, defaulting to English. Multiple `gameCharacter` assets are passed through prompt and provider request metadata as independent character references, and prompts instruct providers to include several uploaded characters as distinct characters when the poster composition supports it. Failed image tasks get a visible retry-all action that continues from current schemes. Output size handling stays native-first, with local close-ratio normalization through `sharp` when provider output needs platform-ready dimensions.

Impact:

- `sloganSettings.languages` is normalized to one language for UI, prompt packages, and provider requests.
- Brief providers should return slogans only for the selected language.
- Prompt asset metadata records role-local character indexes for character references.
- Retry-all-failed image generation reuses existing schemes and does not rerun the full brief stage.
- Local size normalization records `outputProcessing` metadata and does not consume extra AI tokens.

## D086: Poster Generation Supports Text-Only And Batch-Safe Reruns

Status: accepted

Context: Poster generation previously treated some uploaded assets and generated placeholders as if they were required for every run. The user confirmed that a normal workflow must allow project-description-only generation, and that clicking the generation button after schemes exist must not accidentally refresh or overwrite prior schemes and images.

Decision: Poster mode treats all visual assets as optional control inputs. The main poster CTA defaults to a fresh random scheme batch only when there is no prior production; once current schemes/results exist, the UI asks whether to continue rendering the current schemes or regenerate a new batch. Fresh batches use unique batch ids so queue plans, result ids, and archive records do not collide with prior work. Continuing from current schemes skips brief generation and queues image generation only.

Impact:

- Poster brief prompt packages may have no scheme id and no uploaded assets.
- Queue planning gets explicit `regenerateSchemes` and `batchId` inputs.
- Provider routing keeps concept/planning and image generation slots separate.
- Default slogan/poster language is English unless the user selects one other target language.
- Retry-all-failed image generation can reuse current schemes without rerunning concept planning.

## D085: Workbench Defaults To Chinese UI With Restrained Graphite/Sage Themes

Status: accepted

Context: The desktop prototype exposed mixed Chinese/English labels and a dark theme that read too blue/brown with excessive glow. This made the tool feel like a generic or low-end dashboard instead of a professional creative workbench.

Decision: Default the workbench UI to Chinese for base product functions. Keep provider names, `API Key`, and model IDs in their canonical form. Recalibrate Light and Dark themes with low-saturation neutral surfaces, stronger label hierarchy, no decorative glow, and a Chinese-first font stack.

Impact:

- Future bilingual support should use explicit locale dictionaries for `zh-CN` and `en-US`.
- Components must use CSS variables for theme color and should not hardcode blue/purple glow.
- Technical data continues to use monospace font and canonical provider/model names.

## D083: Electron Desktop Shell Wraps The Local Next Workbench First

Status: accepted

Context: The web workbench can now run locally with provider settings, live safety gates, and Google/OpenAI-compatible connection tests. The fastest path to desktop testing is to wrap the existing local Next workbench before building a signed Windows installer or changing the backend runtime model.

Decision: Add an Electron Desktop Shell as the first desktop step. The shell opens the local Next workbench in a `BrowserWindow`, reuses an existing local Next service when available, or starts `next dev` on a local port. Electron main/preload code must not call providers, read API Keys, or store browser credentials.

Reason:

- Gets to a real desktop window quickly without rewriting the app or API routes.
- Preserves the current Next local API, encrypted credential vault, result file store, and proxy environment.
- Keeps installer packaging as a focused follow-up after the desktop runtime is verified.

Impact:

- Adds `electron/main.cjs`, `electron/preload.cjs`, and `npm run desktop:dev`.
- Desktop dev mode still depends on the local project checkout and Node dependencies.
- Windows portable/installer packaging remains the next desktop milestone.

## D084: Electron Packaging Uses Next Standalone First

Status: accepted

Context: The Electron shell can already open the local workbench, but desktop validation needs an app that can start without a separate browser or manually started Next dev server.

Decision: Use Next standalone output plus a lightweight portable Electron folder as the first packaging path. The packaged app includes the prepared standalone Next payload under Electron resources and starts it through Electron's Node runtime with `ELECTRON_RUN_AS_NODE`.

Reason:

- Gets to a real Windows desktop app folder quickly without introducing installer signing, symlink-sensitive signing tools, or auto-update.
- Reuses the existing Next API routes, provider gates, local vault, and result storage logic.
- Keeps the package format replaceable later if Tauri or a signed installer becomes a better release path.

Impact:

- Adds `npm run desktop:prepare`, `npm run desktop:pack`, and `npm run electron-packaging:check`.
- Adds `next.config.mjs` standalone output and a packaging preparation step that copies `.next/standalone`, `.next/static`, and `public`.
- Produces `release/win-unpacked/Poster Lab Pro.exe` for local desktop testing.

## D082: Provider Output Size Uses Native First And Local Resize When Needed

Status: accepted

Context: Google Gemini image generation can honor aspect ratio but may return provider-native pixel sizes such as `768x1344` for a requested `1080x1920` poster. The app still needs platform-ready dimensions without adding another AI call for every result.

Decision: Record requested output dimensions separately from actual provider dimensions, then apply a local server-side resize for close-ratio provider outputs. The resize uses `sharp` and does not call an AI provider, consume model tokens, or change prompt generation. Provider adapters still report native dimensions, while stored result assets may be normalized to the requested platform size with output-processing metadata.

Reason:

- Keeps provider behavior honest instead of pretending all models support arbitrary pixel sizes.
- Produces platform-ready files for common cases such as Google `9:16` native output.
- Avoids extra provider cost unless a later AI upscale/outpaint step is explicitly selected.

Impact:

- Result metadata keeps `requestedOutput` and `outputProcessing`.
- Local resize is limited to close-ratio outputs to avoid destructive crops.
- Future provider manifests can advertise native, local resize, AI upscale, and AI outpaint strategies.

## D081: Next Local API Routes Share Runtime State In Development

Status: accepted

Context: In Next dev mode, separate route modules can be reloaded independently. The provider settings route, connection diagnostic route, snapshot route, and manual live-test route must see the same local repository and credential vault; otherwise a saved API Key can appear configured in one route and missing in another.

Decision: Store the local Next API service dependencies in a process-level singleton and use a file-backed encrypted credential vault under `artifacts/runtime/provider-vault.json`. The local result file store remains under `artifacts/generated-results`.

Reason:

- Prevents route-level in-memory state splits during desktop testing.
- Keeps saved API Keys available across route reloads without exposing plaintext credentials.
- Preserves the provider adapter and safety-gate boundaries for live tests.

Impact:

- Local dev credentials now survive route hot reloads.
- Refreshing credential status re-mirrors a configured vault key into the workspace provider config so a restarted dev server does not leave the provider disabled.
- A full server restart still reloads the encrypted vault file using the local dev vault key.
- Production credential storage remains a later deployment adapter decision.

## D080: Google AI Studio And OpenAI-Compatible Relays Use Provider Boundaries

Status: accepted

Context: The project can run a guarded OpenAI live test, but the user may only have an OpenAI-compatible relay key or a Google AI Studio key. Treating those as chat-only configuration details would either force users into one vendor or encourage unsafe credential workarounds.

Decision: Add first-class provider setup support for optional OpenAI-compatible Base URLs and Google AI Studio image generation. OpenAI-compatible relays continue through the OpenAI adapter shape with saved Base URL and model settings. Google gets its own provider id, manifest, connection diagnostic path, Gemini image adapter, and manual live queue path. Both providers reuse the encrypted credential vault, live safety gate, queue worker, and local result file store.

Reason:

- Lets users test with the provider accounts they actually have.
- Keeps API Keys and Base URLs inside provider settings and snapshots, not scattered through UI code.
- Avoids pretending Google Gemini/Nano Banana has the same request and response format as OpenAI Images.
- Preserves the adapter boundary for future provider-specific image edit, upscale, and background removal work.

Impact:

- Provider schemas and fixtures include `google`.
- Settings save accepts Base URL and default model metadata in addition to the encrypted API Key.
- Google live image generation maps Gemini inline image parts into the common provider asset format.
- Automated checks remain fake-transport-only; real provider calls stay manual and opt-in.

## D079: Persisted Result File Download Uses The Download Route

Status: accepted

Context: Result download descriptors can identify persisted local result files, and the manual live generation path can store generated image bytes. A desktop test is still incomplete if users can see a descriptor but cannot retrieve the file through the app, especially when local dev ports vary.

Decision: Extend the existing result download route so descriptor JSON remains the default response, while `?file=1` streams persisted `localFile` results from the configured local result file store. The route derives app-local download URLs from the request origin instead of using hardcoded localhost public URLs. It does not call providers, resolve credentials, read environment fallback keys, or fetch remote asset URLs.

Reason:

- Completes the minimum result retrieval path for desktop live testing.
- Keeps binary file access behind the result file store boundary.
- Avoids stale public URLs when Next runs on a different local port.
- Preserves provider, credential, result storage, and route responsibilities.

Impact:

- Add binary delivery behavior to the result download route for local result files.
- Keep descriptor response compatibility for UI and automation callers.
- Update checks to allow explicit file-store reads while continuing to block provider/network/credential behavior.
- Cloud object storage, signed URLs, retention, and bulk exports remain later adapters.

## D078: Desktop Live Test UI Is Guarded And Separate From The Main CTA

Status: accepted

Context: The app now has a manual live generation route, but without a visible desktop control it is hard to verify the end-to-end path in the workbench. At the same time, exposing the normal batch render button as live execution would be premature and risky.

Decision: Add a dedicated manual live test control inside the Live Safety surface. The control is disabled until the workbench is in HTTP mode, an OpenAI-compatible or Google provider is selected, a saved credential is configured, and the live gate is allowed. When clicked, it may auto-prepare the local queue job, refresh credential status, and run the provider connection diagnostic before calling the manual live test route. Browser code does not call provider APIs directly and does not read API Keys.

Reason:

- Provides a practical desktop test path without changing the main production CTA or requiring users to manually perform every preparatory step.
- Keeps live execution visible, deliberate, and reviewable through the same safety copy.
- Lets task feedback show whether the route was blocked, attempted, or completed.
- Maintains provider, queue, credential, storage, and UI boundaries.

Impact:

- Add client-side manual live test state, route caller, Live Safety panel control, and task drawer status.
- Add checks for disabled/allowed states, auto-preparation boundaries, and route payload shape.
- Future end-user live generation can reuse this state model but should still have a separate confirmation flow.

## D077: Manual Live Generation Test Reuses Diagnostics And The Safety Gate

Status: accepted

Context: Provider credentials can now be saved in an encrypted vault and checked through a lightweight connection diagnostic. The next risk is accidentally turning the normal workbench button into a live provider call before cost, result storage, and user confirmations are all enforced.

Decision: Add a separate manual desktop live generation test boundary. The test route may run only for OpenAI MVP queue jobs, only with a saved credential, only after rerunning the provider connection diagnostic, and only after the live execution safety gate confirms cost acceptance, external-provider execution, and local result storage. It delegates real image generation to the existing OpenAI live queue helper and persists returned image bytes through the local result file store.

Reason:

- Proves the real provider-to-queue-to-result-storage path without making live execution the default UX.
- Reuses the credential vault, connection diagnostics, safety gate, provider adapter, queue worker, and result file store boundaries.
- Keeps automated checks fake-transport-only while allowing a manual desktop path for real provider validation.
- Prevents API Keys and raw provider image payloads from entering workspace snapshots or result metadata.

Impact:

- Add a manual live generation API contract, service, Next route, and fake-transport verification.
- The normal workbench generation button remains mock-safe.
- Future UI controls can call this boundary only after adding explicit live confirmation UX.
- Non-OpenAI live providers and post-processing remain later work.

## D076: Provider Connection Tests Are Explicit Diagnostics, Not Generation

Status: accepted

Context: The app can now save provider API Keys in an encrypted vault, but users still need a trustworthy way to know whether the saved key works before attempting a real generation run. A full image generation smoke test can spend quota and produces artifacts, so it is too heavy for the normal settings surface.

Decision: Add a provider connection diagnostic boundary. The settings UI can trigger an explicit test that resolves the provider credential through the vault and performs a lightweight readiness/model probe. The diagnostic returns typed status, model availability, elapsed time, and user-safe error copy. It does not generate images, store returned secrets, or bypass the live execution safety gate.

Reason:

- Gives users confidence that API Key setup is valid before live generation.
- Keeps credential resolution centralized in the vault and provider diagnostics boundary.
- Reuses provider manifests and stored provider config without binding the product to one image model.
- Avoids accidental quota spend from a settings-page test.

Impact:

- Add provider connection diagnostic contracts, a route handler, and settings UI state.
- Automated checks must use fake transports by default.
- Real provider diagnostics remain manual/opt-in and separate from `npm run check`.
- Future live generation buttons should require both a successful diagnostic signal and the live execution gate.

## D075: Provider API Keys Use A Dedicated Encrypted Credential Vault

Status: accepted

Context: Runtime credential sessions keep manual live tests safe, but users also need a real provider settings path that can save and restore API Key readiness without leaking clear-text secrets into workspace snapshots, route payloads, local drafts, database rows, result metadata, or UI fixtures.

Decision: Add an encrypted provider credential vault boundary. The vault stores encrypted secret payloads under provider/workspace-scoped references and implements `CredentialResolver` so live execution can resolve a clear-text key only at execution time. API and workspace-facing layers receive masked status plus `ProviderCredentialRef` values only. Workspace provider config mirrors readiness metadata but never persists clear-text API Keys.

Reason:

- Turns Model and API Key setup into a real MVP foundation without coupling it to one provider.
- Keeps provider secrets outside project data and queue data.
- Reuses the existing credential-aware provider executor and live gate readiness model.
- Leaves OS keychain, cloud secret managers, and team permissions as replaceable vault adapters.

Impact:

- Add credential save/status/revoke contracts and route handlers.
- Add tests proving encrypted vault records do not contain clear-text API Keys.
- Future settings UI should call these credential routes instead of storing keys in browser state.
- Live execution must still pass the live safety gate before using a resolved credential.

## D074: Static Workbench Shows Live Gate Readiness Before Live UI Execution

Status: accepted

Context: The live execution safety gate is now a queue-level contract, but users need to see that state in the workbench before any manual desktop live test or future live UI action is added. Hiding gate blockers inside code would make the next UI step confusing and increase the chance of unsafe live controls.

Decision: Add a static workbench live gate surface. The left Engine panel shows the actionable gate controls and blocker reasons; the top toolbar, inspector, and task drawer mirror compact gate state. This surface visualizes readiness only. It does not call live providers, persist API keys, or replace the mock-safe generation button.

Reason:

- Makes live readiness concrete and reviewable before enabling desktop live tests.
- Keeps safety copy consistent across the workbench.
- Gives future UI wiring a stable state model for disabled/enabled/live-test controls.
- Avoids turning the static prototype into a live execution surface prematurely.

Impact:

- Add a static live gate view model and event handlers.
- Add compact gate UI to the Engine panel plus mirrored toolbar/inspector/task drawer context.
- Add UI checks for gate copy, state transitions, and responsive layout.
- Live provider calls from the UI remain out of scope for this step.

## D073: Live Execution Requires A User Safety Gate

Status: accepted

Context: The OpenAI live queue helper can now execute through runtime credentials, an injected transport, and result file storage. Before any desktop or UI path can expose this, the project needs a user-facing safety gate so a real provider run cannot happen from a casual click, stale state, missing storage, or unclear cost acceptance.

Decision: Add a reusable live execution gate contract. Live queue execution must be explicitly enabled and pass confirmations for provider cost, external-provider execution, and result storage. It must also prove runtime credential, transport, and result storage readiness before provider execution. The gate returns typed `skipped`, `blocked`, or `allowed` decisions with blocker codes and user-safe messages.

Reason:

- Prevents accidental provider calls and quota usage when UI wiring begins.
- Gives the workbench a single source of truth for live-run readiness copy and blocker states.
- Keeps cost acceptance and max accepted cost explicit before any live queue helper can run.
- Separates user confirmation policy from provider adapter implementation details.

Impact:

- Add a live execution gate module under the queue boundary.
- Extend OpenAI live queue wiring so it refuses enabled runs unless the gate is allowed.
- Add focused checks for missing confirmations, cost caps, missing runtime prerequisites, and successful fake-transport execution.
- Future UI controls should call this gate before enabling live desktop tests or production runs.

## D072: Live Queue Execution Is Explicit And Persists Runtime Outputs

Status: accepted

Context: The project now has an opt-in OpenAI image adapter, ephemeral runtime credentials, and a local result file store. The next risk is connecting those pieces in a way that accidentally makes normal queue runs consume provider quota, leak API keys, or leave base64 result payloads inside workspace snapshots.

Decision: Add a live queue execution boundary that must be explicitly enabled by the caller and injected with a runtime credential ref/resolver, a live provider registry, and a result file store. The default workspace queue worker remains mock-safe. When a provider returns image `dataUrl` output and a result file store is present, the worker persists the bytes as a result file and records only file metadata plus redacted provider metadata in the workspace snapshot.

Reason:

- Makes the first real queue execution path possible without changing the default local development path.
- Keeps API keys runtime-only and out of queue plans, snapshots, logs, result metadata, and route payloads.
- Prevents generated base64 images from becoming long-lived workspace metadata when local result storage is available.
- Preserves the provider adapter, credential resolver, queue worker, and result storage boundaries as separately replaceable units.

Impact:

- Extend the workspace queue worker with an optional result file store injection point.
- Add an explicit OpenAI live queue helper that combines runtime credential sessions, a transport-injected OpenAI image adapter, mock-safe brief generation, and result file persistence.
- Add fake-transport checks proving live queue wiring can persist provider outputs without default network calls.
- Keep real provider execution manual/opt-in until UI gating, cost controls, retry policy, and post-processing live adapters are implemented.

## D071: Result File Storage Starts With A Local File Store Boundary

Status: accepted

Context: OpenAI live adapter and runtime credential sessions can now produce provider image assets, but generated images still need a stable storage target before live queue execution is useful. Keeping results only as provider URLs or inline base64 makes refresh, download, archive, and later post-processing fragile.

Decision: Add a result file storage boundary with a local filesystem implementation for `dataUrl` image outputs. The store writes result bytes under a workspace-scoped storage key, returns checksum/byte-size/mime metadata, and lets result download descriptors identify persisted local files without reading binary content. This is the MVP local storage target; cloud object storage, signed URLs, retention, and provider URL fetching remain later adapters.

Reason:

- Gives generated images a recoverable local location before live queue wiring.
- Keeps binary persistence separate from provider adapters, queue workers, and API route handlers.
- Allows download descriptors to prefer persisted result files over ephemeral provider metadata.
- Creates a replaceable interface for S3/R2/Supabase/local desktop packaging later.

Impact:

- Add result file metadata schemas and a local file store.
- Extend result download descriptors with a `localFile` source and storage key.
- Add checks for data URL decoding, safe workspace-scoped paths, checksum metadata, and descriptor resolution.
- Live queue execution can later persist provider outputs through this boundary.

## D070: Runtime API Keys Use Ephemeral Credential Sessions

Status: accepted

Context: Manual live smoke can prove OpenAI connectivity, but the workbench still needs a safe runtime handoff before any live queue execution. Passing clear-text API keys through workspace snapshots, queue plans, route payloads, or UI state would create leakage risk and make later encrypted storage harder.

Decision: Add a runtime provider credential session store. A user-supplied API key creates an in-memory session that returns only a `ProviderCredentialRef` with masked display metadata. Provider execution receives the ref plus an injected resolver; the clear-text key is resolved only at execution time and can be revoked. Session data is not saved to workspace snapshots, database rows, local drafts, documents, logs, or result metadata.

Reason:

- Gives the future workbench a safe way to hand live credentials to queue execution without persisting secrets.
- Reuses the existing `CredentialResolver` and `executeMappedProviderRequestWithCredentials` boundary.
- Makes expiration, revocation, provider mismatch, and missing credential failures explicit provider errors.
- Keeps encrypted team credential vaults as a later replacement for the same resolver interface.

Impact:

- Add runtime credential session schemas and an in-memory resolver/store.
- Update manual OpenAI smoke to use the same runtime session path.
- Add checks proving sessions are redacted, revocable, expiry-aware, and compatible with provider execution.
- Live queue execution remains disabled until result storage and cost controls are ready.

## D069: Manual OpenAI Live Smoke Command Requires Explicit Runtime Opt-In

Status: accepted

Context: The OpenAI image adapter now supports transport-injected live execution, but the project still must avoid accidental provider calls, quota usage, credential leakage, or output persistence during normal development checks. The team needs one narrow way to verify real OpenAI connectivity before wiring live execution into the queue.

Decision: Add a manual OpenAI live smoke command and a separate safe checker. The manual command requires explicit `--allow-live` plus a runtime API key input, uses the provider adapter with an injected HTTP transport, prints only redacted/result summaries, and does not save generated images. The safe checker uses fake transports and is the only smoke-command path included in `npm run check`.

Reason:

- Gives developers a controlled real-provider readiness test before queue integration.
- Keeps default validation deterministic and billing-free.
- Prevents API keys from being stored in workspace snapshots, static fixtures, documents, logs, or environment-variable readers.
- Confirms the OpenAI adapter can be exercised through a real command without changing product UI or default worker behavior.

Impact:

- Add a manual CLI entry for OpenAI live smoke execution.
- Add fake-transport checks for skipped, blocked, success, and provider-error states.
- Keep real smoke execution outside the default check chain.
- Live queue execution still waits for credential ownership, cost controls, and binary result storage.

## D068: OpenAI Image Adapter Is Transport-Injected And Opt-In

Status: accepted

Context: The project now has live provider stubs, credential boundaries, result descriptors, and a local Poster production chain. The next live-provider step should introduce one real provider serialization path without making normal checks, queue workers, or desktop testing call OpenAI automatically.

Decision: Add an OpenAI image-generation adapter for the Images API as an opt-in adapter. It supports `imageGeneration` only, uses the configured model from the provider request/config, serializes requests to `/images/generations`, parses URL or base64 image outputs, and requires an injected HTTP transport for any network execution. The default provider registry remains mock-backed, and the live stub registry remains disabled unless explicitly replaced by a caller-provided registry.

Reason:

- Establishes the first real provider request/response mapping while preserving the provider adapter boundary.
- Prevents default local checks from reading environment variables, using browser storage, persisting credentials, or consuming provider quota.
- Keeps reference-image, edit, upscale, background-removal, and multi-provider routing as separate implementation steps.
- Allows future live smoke tests to inject credentials and a transport intentionally instead of hiding live behavior in queue code.

Impact:

- Add an OpenAI adapter module and focused fake-transport checks.
- Export the adapter factory without changing the default mock registry.
- Tests should cover missing API key, successful URL output, successful base64 output, rate-limit errors, and proof that the default live stub path is still disabled.
- Real OpenAI smoke execution remains manual/opt-in until credential vault, billing guardrails, and binary result storage are ready.

## D067: Queue Feedback Uses A View Model For Status, Cost, Time, And Errors

Status: accepted

Context: Queue plans already track task status, progress, cost, elapsed time, and provider errors. If UI regions format these fields independently, the bottom status bar, task drawer, inspector, and future desktop acceptance output will drift.

Decision: Add a queue feedback view model that derives user-facing progress labels, stage labels, formatted cost/time values, and retryable failure details from `QueuePlan`. UI surfaces should consume this model instead of formatting queue internals directly.

Reason:

- Keeps slim task bar and expanded task drawer consistent.
- Gives failure states a predictable user-safe message.
- Prevents cost/time formatting from being duplicated across UI modules.
- Makes desktop acceptance checks able to verify queue feedback without browser-only logic.

Impact:

- Add queue feedback schemas and formatter helpers.
- Tests should cover completed, failed, cost, elapsed, and current-stage summaries.
- Future UI changes can wire the existing bottom task bar to the feedback model without changing queue contracts.

## D066: Desktop Test Path Uses Next Workbench Plus Local Mock-Safe Production Checks

Status: accepted

Context: The project is moving from a static prototype toward a route-backed desktop workbench. The team needs a repeatable way to test the app locally without accidentally enabling live providers, real billing, or unfinished storage features.

Decision: Add a desktop testing runbook. The accepted local path is: run contract checks, run the Poster production-chain check, build Next, then launch the Next workbench locally for browser inspection. Static dev server remains useful for legacy comparison only. Live provider smoke tests stay opt-in and disabled by default.

Reason:

- Gives the user a clear point where desktop testing can begin.
- Separates safe local acceptance from future live provider testing.
- Keeps visual/UI validation and architecture checks in one repeatable order.
- Prevents accidental loops where the project keeps adding infrastructure without a usable local test path.

Impact:

- Add `DESKTOP_TESTING.md` as the local runbook.
- Add a small verification script for the runbook and command surface.
- MVP acceptance can now use Poster local chain plus browser inspection before all modes are finished.

## D065: Poster Production Chain Proves The Local MVP Loop Before Live Generation

Status: accepted

Context: The workbench now has prompt, provider request, queue worker, credential, live-smoke, and result-download boundaries. Before enabling real model calls, the project needs one executable MVP path that proves a user-visible Poster job can move through the local API chain and produce a downloadable result descriptor.

Decision: Add a Poster-only production chain harness that uses the local API service to load a workspace, create an image prompt package, map the provider request, create a queue plan, run the queue, and describe the first generated result download. This chain remains mock-provider-backed and credential-safe by default. It is the acceptance bridge for the desktop test flow, not a live provider implementation.

Reason:

- Proves the MVP route/service boundaries cooperate end to end.
- Gives future UI and desktop checks a single small production path to verify.
- Keeps live provider calls gated behind credential, storage, and explicit opt-in decisions.
- Avoids testing every production mode before the first usable desktop path is stable.

Impact:

- Add an executable Poster production-chain check.
- Treat Poster as the first MVP mode for local desktop acceptance.
- Live provider execution still requires a separate opt-in provider adapter implementation and result storage decision.
- Later modes can reuse the same chain after their asset/prompt guardrails are verified.

## D064: Result Download Descriptor Starts Before Binary Storage

Status: accepted

Context: Queue workers can now create stored result records, but generated files are not yet stored in a production object store. Jumping directly to filesystem writes or cloud storage would couple queue execution, provider responses, and download behavior too early.

Decision: Add a result download descriptor boundary. The descriptor resolves a stored result to a safe download source when one exists: a committed `assetUrl`, a `thumbnailUrl`, or an inline mock `dataUrl` stored as provider output metadata. If no downloadable source exists, it returns a typed unavailable state. Route handlers and services expose the descriptor without reading or writing result binaries.

Reason:

- Gives the UI and future desktop test flow a stable download contract.
- Keeps queue/result storage independent from local filesystem and object-storage choices.
- Allows mock provider outputs to be inspected without pretending production storage exists.
- Creates the replacement point for future S3/R2/Supabase/local-pack export adapters.

Impact:

- Add result descriptor schemas and a local API method/route.
- Queue worker result metadata may preserve provider result asset metadata for descriptor resolution.
- Default checks must prove result download routes do not perform filesystem reads/writes or live provider calls.
- Real binary persistence and signed URLs remain separate implementation steps.

## D063: Live Provider Smoke Harness Is Explicitly Opt-In And Side-Effect Free

Status: accepted

Context: Live provider adapter stubs now expose the future OpenAI, Replicate, ComfyUI, and Custom HTTP insertion point. The next risk is letting a smoke test accidentally read credentials, call the network, consume quota, or persist provider outputs during normal local checks.

Decision: Add a live provider smoke harness that only runs when an explicit `enabled: true` input is passed. The harness constructs a minimal provider execution request, accepts an injected credential resolver and provider registry, and returns a structured `skipped`, `blocked`, or `attempted` result. It must not read environment variables, call `fetch`, persist credentials, write files, or become part of the default queue worker path.

Reason:

- Gives future real provider adapters a controlled readiness test surface.
- Keeps `npm run check` deterministic and quota-free.
- Verifies credential blocking and disabled live adapter behavior before real network code exists.
- Prevents live smoke testing from leaking into product submission, queue, or storage flows.

Impact:

- Add a provider smoke harness module and focused check script.
- Default checks may verify the harness with disabled stubs only.
- Real provider smoke execution remains a separate manual/CI opt-in step after encrypted credential storage and result storage are ready.
- Future provider implementations should plug into this harness through injected registries rather than adding ad hoc scripts.

## D062: Live Provider Adapters Start As Opt-In Disabled Stubs

Status: accepted

Context: Queue execution now runs image and post-processing tasks through the credential-aware provider boundary. The next risk is introducing real OpenAI, Replicate, ComfyUI, or Custom HTTP calls too early and accidentally making default tests consume credentials, network, quota, or provider-specific behavior.

Decision: Add live provider adapter stubs behind an explicit registry factory. The live registry is not the default registry. Each live adapter validates config and exposes the same `GenerationProviderAdapter` interface as mocks, but returns structured `provider_unavailable` errors until a future opt-in implementation is added. Stubs must not read environment variables, persist credentials, call network APIs, or generate fake success responses.

Reason:

- Gives future live integrations a stable insertion point without changing queue/UI contracts.
- Keeps default checks deterministic and network-free.
- Makes disabled live execution an explicit provider error instead of an accidental no-op.
- Prevents provider-specific code from leaking into prompt builders, queue workers, or route handlers.

Impact:

- `createLiveProviderRegistry` can be injected into the credential-aware queue worker later.
- The default executor keeps using `createMockProviderRegistry`.
- Live smoke tests must remain separate and opt-in.
- Real provider implementations should replace stub internals without changing `GenerationProviderAdapter`.

## D061: Queue Worker Executes Provider Tasks Through Credential Boundary

Status: accepted

Context: Workspace queue runs currently create stored results through a mock provider path, while credential-aware provider execution already exists as a separate boundary. Before live adapters are introduced, queue execution must stop calling provider adapters directly so credentials, provider config validation, structured provider errors, and mock/live registry selection stay centralized.

Decision: Route provider-capable queue tasks through credential-aware provider execution. Queue workers pass stored provider configuration, optional credential references, optional credential resolvers, and the provider registry into the queue runner. The default local worker may use an in-memory mock credential resolver for mock-safe execution, but clear-text secrets must not be stored in workspace snapshots, route payloads, local drafts, or static fixtures.

Reason:

- Prevents queue code from bypassing the provider credential boundary.
- Keeps mock execution deterministic while preserving the same call shape future live adapters will use.
- Gives failed provider configuration or credential resolution a structured task error path.
- Keeps image and post-processing tasks behind the same provider execution bridge.
- Leaves brief-generation routing as a later multi-provider routing concern when the selected image provider does not support concept planning.

Impact:

- Queue runs should carry provider execution metadata into image/post-processing result lineage.
- Missing credentials should fail provider tasks before adapter calls.
- Worker tests must prove normal mock runs complete through the credential-aware path and that missing credentials are structured failures.
- Live provider adapters remain opt-in and out of the default test path.

## D060: Workbench Submission Blocks Prompt Asset Drift Before Queue Planning

Status: accepted

Context: Prompt packages and provider request mapping can now reject missing or browser-local asset references, but the workbench submit action still needs to surface those failures before users enter the queue flow. If missing required roles or `blob:` previews are only caught later, users see a generic service failure instead of an actionable material issue.

Decision: Add a lightweight prompt asset preflight to frontend submission validation. The preflight reads the active mode asset requirements, checks that required roles are represented, rejects browser-local required asset URLs, and requires provider-safe URLs when the submit path is HTTP/provider-bound. Static fixture submissions may continue without preview URLs so the prototype remains usable without real uploads.

Reason:

- Moves missing-material feedback closer to the generation button.
- Keeps the queue planner from receiving submissions that cannot produce provider-ready image prompts.
- Preserves the stricter prompt/provider validation as the final contract guard.
- Keeps static prototype behavior separate from HTTP/provider readiness.

Impact:

- Workbench validation gains a `promptAssets` result.
- Invalid prompt assets set submission status to `invalid` and skip service/queue execution.
- Task feedback should show the first actionable validation issue.
- Tests must cover valid static submission, missing required roles, and browser-only required preview URLs.

## D059: Prompt And Provider Requests Consume Committed Asset URLs

Status: accepted

Context: Local binary upload now commits selected image files with a stable public URL, but prompt packages still treated assets mostly as ids and labels. Provider requests need an explicit, provider-safe asset reference so uploaded game characters, logos, style references, and composition references can influence generation.

Decision: Extend prompt asset bindings with URL, mime type, storage key, and provider-readiness metadata. Prompt packages now include a mode-relevant asset inventory section and validate missing required slots. Provider request mapping uses committed asset public URLs when available and blocks image generation when required references are missing or only available as browser-local previews.

Reason:

- Makes asset upload materially affect prompt/package construction and provider DTOs.
- Keeps prompt validation responsible for user-facing missing-material errors.
- Prevents browser-only `blob:` preview URLs from silently entering provider requests.
- Preserves local development URLs as a replaceable asset reference format before production storage.

Impact:

- Prompt packages should filter assets by active production mode slots.
- Required asset roles should produce validation errors for image generation when absent.
- Provider asset references should prefer prompt binding URLs and include mime/storage context.
- Tests must cover committed public URLs, missing required assets, and provider-safe URL filtering.

## D058: Local Binary Asset Adapter Writes To Public Workspace Uploads

Status: accepted

Context: The workbench can now open a real file picker and send selected image metadata through upload planning and asset commit. Provider request mapping still needs a stable URL for selected assets, but the product is not ready for cloud object storage, thumbnail pipelines, or permissioned asset delivery.

Decision: Add a local binary upload adapter behind the existing asset upload-plan contract. In HTTP mode, selected files are posted to a dedicated multipart route, written under `public/uploads/workspaces/:workspaceId/...`, and committed with an origin-derived public URL. Static mode remains metadata/preview-only. This adapter is local development infrastructure, not the final production storage layer.

Reason:

- Gives provider request mapping a stable URL instead of a browser-only `blob:` preview URL.
- Keeps UI file selection, upload planning, binary storage, asset commit, and workspace reload as separate stages.
- Avoids binding the product to S3, Supabase, R2, or another storage vendor before auth and workspace ownership are defined.
- Preserves the future replacement point for a real object storage adapter.

Impact:

- Add `POST /api/workspaces/:workspaceId/assets/upload-binary` for multipart file transfer.
- Add a local binary writer that sanitizes storage keys and writes only inside `public/uploads/workspaces`.
- Asset commit should prefer the returned public URL when a real file exists.
- Tests must verify route order, multipart transport, public URL commit, and storage-key traversal protection.
- Generated local upload files are development artifacts and should not be committed.

## D057: Real File Selection Starts As Metadata-Only Asset Intake

Status: accepted

Context: `02 Assets` is now a React-owned boundary, but it still uses simulated upload metadata. The next MVP step is letting users choose real local image files while avoiding premature storage, thumbnailing, and provider complexity.

Decision: Add real browser file selection to `AssetsSection`, but only submit file metadata through the existing upload-plan and asset commit contract. The client reads `File.name`, `File.type`, and `File.size`, creates an optional local object URL for immediate preview, and commits an asset record. It does not upload binary bytes, persist local files, call providers, or introduce cloud/object storage.

Reason:

- Gives users a real upload interaction without expanding infrastructure scope.
- Keeps the upload-plan API contract as the future binary upload insertion point.
- Lets asset slots, counts, and prompt asset bindings start from real user-selected file metadata.
- Avoids delaying MVP on storage/provider concerns that can be added behind this boundary later.

Impact:

- `AssetsSection` opens a hidden file input for slots and reference upload areas.
- `asset-library-client.js` accepts optional `File` metadata and preview URLs.
- Asset UI tests must verify real file metadata enters upload-plan payloads without binary upload.
- Future storage work should replace the placeholder upload URL transport without changing the UI component contract.

## D056: Asset Section Becomes A React-Owned Metadata Boundary

Status: accepted

Context: Brief, direction, and output settings now use mounted React Hook Form components, while `02 Assets` still renders as static buttons. Assets are not a full form, but they are an important production input boundary and already have a metadata-only upload-plan route loop.

Decision: Migrate `02 Assets` into a mounted React component while preserving the static fallback. `AssetsSection` renders asset slots, style/composition reference entry, and upload operation status. It calls the existing simulated asset upload client and asks the shell to rerender after completion, but it does not open a real file picker, read files, upload binaries, or call providers.

Reason:

- Keeps asset input UX under the same React-owned migration path as form sections.
- Preserves the existing metadata-only upload-plan contract before real binary uploads.
- Avoids mixing real upload behavior into a visual/static migration step.
- Lets future file input work attach behind the same asset component boundary.

Impact:

- `src/react/AssetsSection.tsx` owns the React asset section.
- `src/react/mount-workbench-sections.tsx` accepts a shell rerender callback for asset operations.
- `src/render/config-panel.js` provides a React mount point and fallback for asset controls.
- `npm run workbench-form:check` verifies the assets mount boundary and static fallback.

## D055: Brief And Direction Sections Move Into React Hook Form

Status: accepted

Context: `04 Output` already proved that a mounted React Hook Form section can coexist with the accepted static workbench shell. The next highest-risk areas are the project brief and mode-specific creative direction controls because they feed prompt planning and queue payloads.

Decision: Migrate `01 Brief` and `03 Direction` into mounted React Hook Form components while preserving static fallbacks. `BriefSection` owns project name, game description, and focus guidance. `DirectionSection` owns mode-aware controls for poster style tags, collab style injection, announcement copy/layout presets, and icon composition-reference rotation. Both sections validate with Zod schemas and write successful edits through the generation form runtime.

Reason:

- Continues the gradual React Hook Form migration without rewriting the full left panel.
- Keeps visible prompt-driving fields behind schema validation before provider integration.
- Preserves the confirmed workbench layout, static fallback path, and runtime form bridge.
- Makes mode-specific creative direction edits part of the same validated submission path as output settings.

Impact:

- `src/react/BriefSection.tsx` owns the React brief form section.
- `src/react/DirectionSection.tsx` owns the React mode-direction form section.
- `src/react/mount-workbench-sections.tsx` mounts brief, direction, and output form leaves into the static shell.
- `src/render/config-panel.js` keeps brief and direction fallback markup behind React mount points.
- `src/generation-form-runtime.js` maps brief replacement back to top-level workspace project metadata.
- `npm run workbench-form:check` verifies brief, direction, output, mount, and runtime binding coverage.

## D054: Output Settings Is The First React Hook Form Workbench Section

Status: accepted

Context: The static workbench now writes visible controls into runtime form state, but the product standard says forms should use React Hook Form and Zod. A full left-panel rewrite would be risky because the accepted workbench still uses a static shell for most regions.

Decision: Migrate only the `04 Output` section into a mounted React Hook Form component. The static renderer leaves a fallback section for non-React/static preview, while the Next bridge mounts `OutputSettingsSection` into a placeholder and hides the fallback. The component uses `OutputSettingsFormSchema`, `zodResolver`, and writes successful edits back through the generation form runtime.

Reason:

- Starts the real RHF/Zod migration in the highest-impact settings area.
- Keeps the confirmed left/center/right workbench shell intact.
- Lets platform presets, aspect ratios, image count, and scheme count drive queue payloads through a validated form path.
- Preserves a static fallback while Next gradually takes ownership of form-heavy sections.

Impact:

- `src/react/OutputSettingsSection.tsx` owns the React Hook Form output settings UI.
- `src/react/mount-workbench-sections.tsx` owns mounting React leaves into the static shell.
- `src/react/StaticWorkbenchBridge.tsx` unmounts/remounts mounted React leaves around shell refreshes.
- `src/render/config-panel.js` now provides a React mount point plus static fallback for output settings.
- `src/generation-form-runtime.js` exposes direct field replacement for validated nested form values.
- `npm run workbench-form:check` now verifies the React output section and mount boundary.

## D053: Static Workbench Controls Write To Generation Form Runtime State

Status: accepted

Context: The project already has `GenerationFormSchema`, React Hook Form resolver support, and route-backed submission, but the accepted static workbench controls were still mostly visual. Submission was rebuilding active-mode values from fixtures instead of reading user-edited controls.

Decision: Add a lightweight generation form runtime bridge for the current static workbench. Existing left-panel controls now write into the active workspace mode state, and submission builds its workspace snapshot from that runtime form state. The React Hook Form + Zod contract remains the target form boundary for the Next/React migration; the static bridge mirrors the same field groups without changing layout.

Reason:

- Lets current prototype submissions reflect edited brief, focus, style tags, output count, and mode-specific fields.
- Keeps the accepted UI shell stable while moving from static fixtures to real form state.
- Avoids binding render modules directly to route handlers or providers.
- Creates a smaller migration path toward React Hook Form sections because field names already match the generation form schema.

Impact:

- `src/generation-form-runtime.js` owns static workbench form state updates.
- `src/render/config-panel.js` marks editable controls with schema-like field paths.
- `src/events.js` binds form fields and choices without introducing network side effects.
- `src/form-binding.js` builds submission snapshots from runtime form values.
- `npm run workbench-form:check` verifies form edits propagate into validation and queue payloads.

## D052: HTTP Submission Runs Mock Queue And Reloads Workspace Results

Status: accepted

Context: The workbench can now submit through local HTTP routes and create queue plans, but users need visible generated state after pressing the production button. A queue plan alone is not enough; the UI must exercise the same result-writing boundary that future live workers will use.

Decision: After HTTP queue plan creation, the browser submission client calls `POST /api/workspaces/:workspaceId/queue-plans/:jobId/run`, then reloads `GET /api/workspaces/:workspaceId`. The run route delegates to the local API service and workspace queue worker. The refreshed workspace snapshot becomes the runtime state used by queue summaries, results, archive rows, and downstream UI adapters.

Reason:

- Keeps route creation, worker execution, and UI refresh as explicit stages.
- Proves the accepted static workbench can display route-backed queue/result state without a React rewrite.
- Preserves the provider adapter boundary because the worker still runs through mock provider execution.
- Gives later live workers a stable contract: run queue, write results, reload or subscribe to updated workspace state.

Impact:

- `src/http-generation-service.js` owns the browser HTTP run/reload sequence.
- `src/api/service.ts` owns the `runQueuePlan` service method.
- `app/api/workspaces/[workspaceId]/queue-plans/[jobId]/run/route.ts` owns the Next route boundary.
- `src/form-binding.js` updates runtime workspace state only after a successful reload.
- `src/data/queue-view-model.js` reads runtime queue plans and summaries before static fallback data.
- `npm run queue-refresh:check` verifies route order, runtime refresh, and queue view-model binding.

## D049: Frontend Submission Can Switch From Static Facade To Local HTTP Routes

Status: accepted

Context: The workbench still submits through a static in-browser service facade, while Next route handlers now expose the same workspace, prompt, provider mapping, queue, and asset surfaces. The next migration risk is replacing the static UI all at once instead of allowing the accepted prototype to move route-by-route.

Decision: Add a small browser HTTP client that mirrors the existing static generation service flow and calls local Next route handlers. The default static prototype remains on the static facade. The Next bridge may opt into `http` submission mode so the same static workbench can exercise real App Router route handlers without a full React rewrite.

Reason:

- Connects the accepted workbench to real route handlers incrementally.
- Keeps static and HTTP flows comparable because they return the same service-flow shape.
- Lets future React Hook Form sections switch to HTTP without changing task feedback UI.
- Avoids a large UI rewrite while route contracts continue to harden.

Impact:

- Browser HTTP calls must stay in the explicit HTTP client, not scattered through UI components.
- Static server verification should continue to avoid network calls by default.
- Next verification should cover the HTTP client route sequence with fake fetch and route smoke tests.

## D050: Workbench Reads A Runtime Workspace Snapshot Before Deeper UI Data Binding

Status: accepted

Context: The workbench needs to preserve the accepted static UI while moving toward real local data. Replacing every render module with fully reactive React components at once would add unnecessary risk. The smallest useful bridge is loading a workspace snapshot through the local Next API and making render/data adapters read from that runtime snapshot.

Decision: Add a lightweight workspace data service that calls `GET /api/workspaces/:workspaceId`, stores the returned snapshot in shared runtime state, and lets project, asset, provider, scheme, archive, and form DTO adapters read from that snapshot. Static preview remains available when `api=static` is used.

Reason:

- Keeps the visual prototype stable while starting real data flow.
- Proves the Next API load route can drive visible UI state.
- Avoids binding UI modules directly to persistence or provider code.
- Creates a narrow migration path from static fixtures to workspace-backed components.

Impact:

- `src/state.js` now owns the current runtime workspace snapshot and load status.
- `src/workspace-data-service.js` owns the fetch boundary for workspace loading.
- Data adapters read `getRuntimeWorkspaceSnapshot()` where visible UI depends on project, assets, providers, schemes, and archive rows.
- `npm run workspace-data:check` verifies the route call, runtime state replacement, and fetch isolation.

## D051: Asset UI Uses Metadata-Only Upload Planning Before Real Binary Uploads

Status: accepted

Context: The MVP needs a real asset-library path, but raw file upload, thumbnail generation, object storage, and permissions are not ready yet. The accepted UI should begin exercising asset routes without pretending real binary upload is complete.

Decision: Add a metadata-only asset client for the workbench. A simulated asset action calls upload-plan, commit, asset-list, and workspace reload routes in HTTP mode. Static mode mutates the runtime snapshot only for preview continuity. No real file picker, file read, binary upload, or external storage call is introduced.

Reason:

- Proves the asset route chain can update visible workbench state.
- Keeps asset upload work aligned with existing `AssetUploadPlan` and `StoredAssetRecord` contracts.
- Avoids mixing browser file IO, storage SDKs, or thumbnail processing into the current milestone.
- Lets later real upload replace only the upload transport while preserving commit/list/reload behavior.

Impact:

- `src/asset-library-client.js` owns browser asset route calls.
- Left-panel asset controls can trigger a simulated metadata commit.
- The visible asset count and asset slots refresh through the runtime workspace snapshot after commit.
- `npm run asset-ui:check` verifies route order, state update, and fetch isolation.

## D048: Queue Worker Writes Results Back Through Workspace Snapshots

Status: accepted

Context: Queue planning and mock provider execution already exist, but the production loop is incomplete until queue runs can persist updated task state, generated result assets, archive rows, and summaries. Without a worker boundary, UI, route handlers, or provider adapters may each invent result-writing behavior.

Decision: Add a mock-safe workspace queue worker that loads a workspace snapshot, runs a queued plan through the provider execution boundary, converts successful image and post-processing tasks into `StoredResultAsset` records, syncs archive rows, updates queue plans/summaries, and saves the snapshot through `StorageRepository`. This worker remains deterministic and uses mock providers by default; real workers and live providers must plug into the same result-writing contract later.

Reason:

- Completes the recoverable production loop from queue plan to result history.
- Keeps result lineage tied to job id, task id, scheme id, provider result id, dimensions, model, platform, and post-processing kind.
- Lets post-processing tasks become first-class result records instead of UI-only actions.
- Prevents route/UI code from writing queue and result state ad hoc.

Impact:

- Future task workers should update snapshots through the worker/result writer boundary.
- Result gallery, archive, and export surfaces should read `StoredResultAsset` and `StoredArchiveRow`.
- Live provider workers must preserve the same lineage fields and failure semantics.

## D047: Provider Credentials Use Runtime References, Not Workspace Secrets

Status: accepted

Context: Provider execution is already behind an adapter registry, and provider settings in workspace snapshots are redacted. The next step is preparing real providers without accidentally turning workspace snapshots, route bodies, or UI state into credential stores.

Decision: Add a provider credential boundary based on runtime credential references. Workspace/provider config may store masked key state, provider id, model defaults, and connection status. Clear-text credentials must be resolved at execution time through an injected `CredentialResolver` using a `ProviderCredentialRef`; they must not be written into workspace snapshots, database rows, local draft storage, route contracts, or static UI fixtures. The default test resolver is in-memory only.

Reason:

- Lets real provider adapters receive credentials only at execution time.
- Keeps provider configuration recoverable while separating it from secrets.
- Makes missing, expired, or unauthorized credentials explicit provider errors.
- Preserves the existing adapter registry and mock execution path.

Impact:

- Queue workers should call the credential-aware execution function when they need live providers.
- Route handlers must not accept or return clear-text API keys.
- Future encrypted vault integration should implement `CredentialResolver` rather than changing provider adapters or workspace snapshots.

## D046: Asset Upload Starts As Metadata Planning And Library Contracts

Status: accepted

Context: The workspace snapshot and database rows can now persist asset records, but the product still needs a safe upload and asset library boundary before real files, cloud storage, or image preprocessing are introduced. Uploading directly from UI components to storage would make validation, role assignment, mode slot requirements, and future permissions hard to enforce.

Decision: Add an asset library foundation as contract-first metadata flow. The first step defines mode-aware asset slots, upload metadata validation, upload plan DTOs, asset commit/list service methods, and route contracts. The static implementation may create placeholder upload plans and commit `StoredAssetRecord` metadata into the workspace snapshot, but it must not read local files, store raw image binaries, call cloud storage, or fetch remote assets.

Reason:

- Gives all five production modes a single source for required and optional asset slots.
- Keeps upload validation and storage key planning outside UI components.
- Lets future real upload providers replace placeholder upload plans without changing asset records.
- Protects the MVP from unsafe file handling and premature cloud storage coupling.

Impact:

- UI upload controls should call asset service/API boundaries instead of mutating snapshots directly.
- Asset records remain metadata plus storage references; binary storage remains external.
- Future auth and permissions must validate workspace ownership before creating upload plans or listing assets.

## D045: Database Persistence Starts With Schema And Adapter Boundary

Status: accepted

Context: Route handlers now expose workspace snapshot, prompt package, provider request, and queue plan flows through a local service. The next risk is adding persistence by sprinkling database calls into API routes or UI modules, which would make workspace recovery, queue recovery, provider settings, and result history hard to test and replace.

Decision: Add a database persistence foundation as a storage adapter boundary, not as direct route logic. The first implementation includes SQL schema, row DTO validation, snapshot-to-row mapping, a database-backed `StorageRepository`, and a memory database client for contract tests. The repository stores the full redacted workspace snapshot for recovery and normalized index rows for assets, results, provider configs, and archive records. Provider configuration rows may store `hasApiKey` and `apiKeyMasked`, but never clear-text API keys.

Reason:

- Keeps database persistence replaceable while route handlers continue to depend on `StorageRepository`.
- Preserves full workspace recovery before optimizing individual queries.
- Lets future Postgres, SQLite, Supabase, or ORM adapters reuse the same row contracts.
- Prevents API key leakage by making redaction validation part of the save path.

Impact:

- Database code must stay outside UI components and route handler business logic.
- Future migrations should evolve the SQL schema and row DTOs together.
- Real credential storage remains a separate decision and must use an encrypted secret store, not workspace snapshot rows.

## D044: Next Route Handlers Delegate To The Local API Service First

Status: accepted

Context: The App Router shell now builds, and the local API service already owns route-shaped business behavior. The next step is to add real `/api/...` handlers without moving business logic into route files or connecting live providers.

Decision: Implement Next.js Route Handlers for workspace snapshot load/save, prompt package creation, provider request mapping, and queue plan creation. Route handlers must parse request bodies, delegate to the local API service singleton, and return the existing success/failure envelopes. The singleton may use an in-memory repository seeded with the mock workspace so smoke tests can run, but it must not call live providers, databases, uploads, or credential stores.

Reason:

- Converts API contracts into real HTTP surfaces while keeping service logic reusable.
- Keeps future database and provider changes behind repository/adapter boundaries.
- Lets frontend migration switch from static facade to HTTP incrementally.
- Preserves mock-safe verification before live credentials are introduced.

Impact:

- Route files should stay thin and avoid duplicating prompt, queue, provider, or storage business logic.
- HTTP status codes should be derived from envelope error codes.
- Future persistence can replace the seeded in-memory repository without changing route payloads.

## D043: React Forms Use Zod As The Single Validation Source

Status: accepted

Context: The static prototype has lightweight JavaScript validators while the contract layer has Zod schemas for project brief, output settings, slogans, provider config, and five mode forms. The Next migration needs React Hook Form without introducing a second validation language.

Decision: Add a generation form contract layer that composes existing Zod schemas into one mode-aware React form shape. React Hook Form should use Zod resolver integration, mode defaults should come from existing default factories, and locked fields should be exposed from prompt guardrails. The first step is framework-ready schema/default utilities; visual form replacement can follow in smaller slices.

Reason:

- Keeps validation shared between UI, API contracts, prompt building, and future route handlers.
- Prevents five production modes from drifting into separate ad hoc form shapes.
- Gives mode switching, default values, and locked-field behavior a typed foundation before UI rewrite.
- Lets React Hook Form adoption happen without changing the accepted workbench layout yet.

Impact:

- New React form components must use the generation form schema/default utilities.
- Static JavaScript validators remain only as prototype compatibility until their UI regions are replaced.
- Tests must verify all five modes parse defaults and expose locked fields.

## D042: Next.js Migration Starts With A Workbench Bridge Before Full Component Rewrite

Status: accepted

Context: The confirmed static workbench is visually close to the target and now has a service-backed submission flow. A full rewrite into React components in one step would risk visual drift and break the static prototype that is still useful for comparison.

Decision: Introduce Next.js App Router as a parallel application entry first. The initial Next page should mount the existing modular static workbench through a client bridge, import the existing design tokens/CSS, and preserve the static server path. Full React component extraction will happen in smaller follow-up slices after this shell builds successfully.

Reason:

- Establishes the target framework without discarding the validated UI.
- Keeps the existing 4173 static prototype available as a visual baseline.
- Gives future React Hook Form and Route Handler work a real App Router home.
- Reduces migration risk by separating framework setup from component rewrite.

Impact:

- Next/React dependencies are allowed as the default target stack.
- `dev:next` and `build:next` should be available alongside the static dev server during migration.
- Future componentization should replace bridge-mounted regions gradually, starting with state and form boundaries.

## D041: Static Workbench Submits Through A Local Service Flow

Status: accepted

Context: The static workbench can build local submission drafts, and the API service layer now mirrors future route handlers. The next risk is keeping the UI on a decorative-only submission path while contracts advance elsewhere.

Decision: Connect the static generation action to a route-shaped local service flow. The browser prototype should build the same prompt package and queue plan DTOs, run them through a static local service facade, and store the returned envelopes on the submission state for task feedback. This remains a static prototype step: no HTTP, no live provider calls, no uploads, no database, and no framework route handlers.

Reason:

- Gives the current UI an executable contract path without waiting for Next.js migration.
- Shows prompt creation, provider request mapping, and queue planning status directly in the task drawer.
- Keeps the later React form and route handler migration aligned with the existing DTO flow.
- Avoids binding UI behavior to real provider APIs too early.

Impact:

- Generation buttons should now create service-backed submission state, not only raw DTO drafts.
- Task feedback can display route envelope status and queue summary.
- Future route handlers should preserve the same UI handoff shape when replacing the static facade.

## D040: Local API Service Mirrors Route Contracts Before Next.js Handlers

Status: accepted

Context: The mock E2E loop proves the contract layers fit together, but the static app still has no route-like service boundary. Jumping straight into framework route handlers would mix product contracts, repository selection, and HTTP behavior too early.

Decision: Add a local API service facade that parses the same request schemas as the API contracts, calls storage, prompt, provider request mapping, and queue planning modules, and returns the same success/failure envelopes that future Next.js Route Handlers must return. The default service uses the in-memory repository and mock-safe contract layers only; it must not perform live provider calls, network access, browser storage, filesystem writes, or credential reads.

Reason:

- Gives the next React/route migration a route-shaped execution boundary.
- Keeps API handlers thin by proving business flow can sit behind contracts.
- Lets tests exercise request parsing, envelope errors, repository access, prompt creation, provider request mapping, and queue planning together.
- Preserves provider and persistence replaceability before real HTTP handlers exist.

Impact:

- Future Next.js Route Handlers should delegate to this service or preserve the same method boundaries.
- Database repositories can replace the in-memory repository without changing DTOs.
- Live provider execution remains gated behind separate adapter and credential decisions.

## D039: E2E Contract Loop Runs Through Mock Provider Before Live APIs

Status: accepted

Context: The app now has the main pieces needed for real production flow: workspace snapshot, prompt builder, provider request mapper, API DTOs, queue contracts, local persistence, and provider execution bridge. Before live APIs or database routes are added, the team needs one executable end-to-end loop that proves the contracts fit together.

Decision: Add an E2E mock contract loop that creates prompt packages from a workspace snapshot, maps them to provider requests, executes them through the mock provider registry, plans a queue, and summarizes the result. The loop must remain deterministic enough for checks and must not call network APIs, live provider credentials, uploads, or databases.

Reason:

- Validates the architecture across module boundaries rather than only file-level tokens.
- Gives future route handlers and React form submission a reference execution path.
- Catches DTO drift between prompt, provider, queue, storage, and API layers.
- Keeps live provider integration gated behind passing mock E2E behavior.

Impact:

- `npm run check` should include the mock E2E loop.
- Future live provider work must preserve this mock loop.
- API route implementation should mirror this order: snapshot -> prompt -> provider request -> execution -> queue/storage update.

## D038: Provider Execution Uses An Adapter Registry Behind Mapped Requests

Status: accepted

Context: Prompt packages and provider request mapping are stable, but queue/API code still needs a single way to invoke provider adapters without importing a concrete provider directly. Real network adapters will require credentials and provider-specific tests, so the execution boundary should be established first with a mock-backed registry.

Decision: Add a Provider execution bridge that accepts a mapped provider request, resolves the configured adapter from a registry, validates provider config shape, and calls the matching adapter method. The default registry uses the existing mock adapters for all providers; live OpenAI, Replicate, ComfyUI, or Custom HTTP adapters can later replace entries in the same registry. Stored provider configs are converted to adapter config without exposing clear-text API keys.

Reason:

- Keeps queue/API execution independent from concrete provider implementations.
- Makes unsupported capabilities return structured provider errors.
- Lets end-to-end tests run the full request path without external network or credentials.
- Preserves the provider adapter design before introducing live API-specific code.

Impact:

- Future real providers must implement `GenerationProviderAdapter` and register through this boundary.
- Queue runners should call the execution bridge, not provider adapters directly.
- Tests must cover adapter lookup, capability dispatch, missing adapter handling, config conversion, and no accidental network calls in the default path.

## D037: Local Draft Persistence Comes Before Database Persistence

Status: accepted

Context: Frontend submission drafts now produce meaningful API contract payloads, but refreshing the static prototype still loses the latest local handoff state. A database is not appropriate yet because auth, workspace ownership, and encrypted credential storage are not implemented.

Decision: Add local draft persistence as the first real persistence implementation. The long-term storage boundary is a `localDraft` repository that implements `StorageRepository`; the static prototype may save and hydrate the latest submission draft from browser storage. Persisted data must use workspace snapshots and submission DTOs, must not include clear-text API keys, and must not perform provider calls or remote database access.

Reason:

- Lets the prototype recover local submission context after refresh.
- Exercises the storage contract before database schema and auth are added.
- Keeps the eventual database adapter replaceable behind the same repository interface.
- Avoids pretending local browser storage is a secure credential store.

Impact:

- Provider API keys remain masked only; clear-text credentials are still out of scope.
- Future database persistence should replace the repository implementation, not the UI data flow.
- Tests must cover local save/load/list behavior, snapshot summaries, JSON parse failures, and secret redaction checks.

## D036: Static Frontend Submissions Bind To API Contract Payloads Before HTTP

Status: accepted

Context: The accepted workbench is still a static prototype, but the next implementation step must prevent UI controls from drifting away from schema, prompt, queue, storage, and API contracts. Connecting real HTTP routes now would be premature because persistence and provider execution are still contract-only.

Decision: Add a lightweight frontend form-binding layer that reads current workbench state and static fixture data, builds in-memory API contract payloads for prompt package creation and queue plan creation, validates the source form groups with the existing framework-agnostic validators, and records a local submission draft in UI state. It must not call HTTP, import real provider adapters, persist data, or perform uploads.

Reason:

- Gives the static UI a real data handoff shape without introducing backend behavior.
- Lets the next local persistence step save meaningful submission drafts.
- Keeps UI controls aligned with mode-specific validation and queue planning inputs.
- Avoids a jump from visual prototype directly to real provider calls.

Impact:

- Primary generation buttons should create local submission drafts instead of being decorative.
- Task chrome can reflect the latest local submission draft for verification.
- Future React Hook Form screens should preserve this data flow: form state -> API DTO -> prompt/queue/provider layers.

## D035: API Route Contracts Are Defined Before Route Implementation

Status: accepted

Context: The project now has schema, form adapters, provider contracts, queue contracts, storage contracts, prompt packages, and provider request mapping. The next risk is letting frontend form submission, route handlers, and future workers invent their own payload shapes.

Decision: Add an API contract layer that defines request and response DTOs for workspace load/save, prompt package creation, provider request mapping, and queue plan creation. This layer records route ids, methods, paths, and Zod schemas, but it does not create real route handlers, call providers, read credentials, or persist data.

Reason:

- Gives the next frontend binding step a stable submission target.
- Keeps API payloads aligned with existing workspace, prompt, provider, and queue contracts.
- Makes later Next.js route handlers an implementation detail behind a typed contract.
- Prevents UI state, storage snapshots, prompt packages, and provider requests from diverging.

Impact:

- Future API routes must parse requests and responses through these schemas.
- Static UI may bind to these contracts before real network calls exist.
- Tests must verify route coverage, envelope consistency, and no route execution side effects.

## D034: Provider Request Mapper Converts Prompt Packages To Provider DTOs

Status: accepted

Context: Prompt packages now centralize mode guardrails, platform constraints, asset bindings, slogans, and final prompts. Before real API routes or provider adapters are connected, the project needs a stable mapper that converts those prompt packages into typed Provider request DTOs without letting UI, queue, or provider-specific code rebuild business prompts.

Decision: Add a Provider Request Mapper layer that accepts a `PromptPackage`, `WorkspaceSnapshot`, provider id, and optional model overrides, then returns validated `BriefGenerationRequest` or `ImageGenerationRequest` DTOs. The mapper must use existing Provider schemas, workspace provider settings, prompt assets, platform constraints, and mode guardrails. It must not perform network calls, credential access, storage writes, or provider execution.

Reason:

- Keeps prompt construction separate from provider request formatting.
- Lets queue/API layers consume one stable request shape before real providers are implemented.
- Prevents provider adapters from inventing mode-specific business logic.
- Preserves provider adapter flexibility across OpenAI, Replicate, ComfyUI, and Custom HTTP.

Impact:

- Future API routes should call the mapper before invoking any provider adapter.
- Queue tasks should carry or derive mapped request DTOs rather than raw UI form state.
- Tests must verify request mapping, model slot fallback, asset conversion, dimensions, language targets, and absence of side effects.

## D033: Prompt Builder Contract Owns Mode Guardrails Before Provider Calls

状态：已接受

背景：
五种生产模式都依赖不同的提示词约束：联名需要角色占位符和防融合，公告需要排版模式和群像站位，Logo 需要纯色背景和字标主体，Icon 需要 1:1、无文字、主体清晰和干净边缘。若这些规则散落在 UI 文案、方案卡、Provider 请求和队列任务中，真实接模型后很容易出现约束遗漏。

决策：
先建立 Prompt Builder 合同层，不调用真实模型：

- `src/prompts/contracts.ts` 定义 prompt package、section、asset binding、platform constraint、guardrail 和验证结果。
- `src/prompts/guardrails.ts` 集中定义五模式硬约束和禁用项。
- `src/prompts/builder.ts` 从 `WorkspaceSnapshot`、方案 brief 和模式状态中组装 brief / image prompt package。
- Prompt package 再映射到 Provider DTO，Provider Adapter 只消费已构造好的 prompt 内容。

原因：
- 让产品约束、schema、storage、queue 和 provider 请求共享同一份 prompt 合同。
- 防止联名、Logo、Icon 等关键模式只靠 UI 提醒而没有实际进入请求上下文。
- 为后续 prompt 预览、锁定字段、失败诊断和回放提供稳定结构。

影响：
- 当前 prompt builder 不请求 API，不做真实 prompt extraction，不保存生成结果。
- 后续真实 provider 调用必须从 prompt package 派生请求，不得在 adapter 内重新拼接业务 prompt。
- 测试必须覆盖 Collab 防外貌发明、Logo 纯色背景、Icon 无文字和平台规格约束。

## D032: Static Workbench Reads Runtime Data Through Workspace Snapshot Adapters

状态：已接受

背景：
当前静态原型已经有 mode fixtures、Provider fixtures、档案馆 rows 和任务状态派生。如果这些继续各自独立存在，后续接本地草稿、数据库和真实任务恢复时，UI 会和 `WorkspaceSnapshot` 合同发生漂移。

决策：
在接真实数据库前增加两层轻量绑定：

- `MemoryDraftRepository` 实现 `StorageRepository`，用于保存、加载、列出 workspace snapshot 的内存草稿。
- 静态工作台增加 workspace snapshot adapter，让 Provider 设置、档案馆和运行态数据优先从 workspace snapshot 派生。
- 当前仍不使用 `localStorage`、文件写入、真实数据库或 API。

原因：
- 先证明 `WorkspaceSnapshot` 可以驱动项目恢复和 UI 运行态。
- 避免后续把档案馆、Provider 设置、任务状态做成另一套数据结构。
- 让当前静态原型继续轻量，但数据流朝最终架构收敛。

影响：
- 静态 UI 仍保持现有视觉和布局。
- 后续接本地缓存或数据库时，应替换 repository 实现，而不是改 UI 消费结构。
- 任何静态 fixture 的新增字段都应能映射到 workspace snapshot 或明确标记为纯展示字段。

## D031: Persistence Contract Comes Before Database Integration

状态：已接受

背景：
MVP 需要项目恢复、素材复用、任务刷新不丢失、结果归档和 Provider 设置复用。如果直接把这些状态散落在 UI、队列 runner 或未来数据库表中，后续会出现字段漂移、API Key 泄露风险和任务恢复困难。

决策：
先建立存储合同层，不接真实数据库、不写真实上传文件：

- 定义 project workspace snapshot，包含项目、品牌资产、角色档案、素材引用、模式配置、方案 brief、任务队列、结果资产和 Provider 设置。
- Provider API Key 在持久化快照中只能保存脱敏值和配置状态，不保存明文。
- 队列 job/task/event 必须通过 storage snapshot 恢复，不由 UI 重新编造。
- 结果资产只保存稳定引用、尺寸、平台、模型、来源任务和归档状态，不保存真实图片二进制。

原因：
- 让项目库、档案馆、任务队列和 Provider 设置共享同一份可恢复数据结构。
- 为后续数据库模型、API route 和本地草稿缓存提供稳定合同。
- 在接真实凭证和文件存储前，先把安全边界固定下来。

影响：
- 当前 storage 层只做 Zod 合同、mock snapshot 和脱敏工具。
- 后续数据库表、local draft cache 或 API response 必须符合 storage DTO。
- 任何保存 Provider 配置的实现都不得持久化明文 API Key。

## D030: Task Queue Contract Comes Before Real Execution

状态：已接受

背景：
MVP 的一键批量生产会拆成方案生成、批量出图、后处理、归档和导出等多个阶段。用户还需要看到进度、失败重试、取消、成本和耗时。如果直接把这些状态写在 UI 或具体 provider 调用中，后续很难支持父子任务、失败恢复和成本统计。

决策：
先建立任务队列合同层，不执行真实生图：

- `src/queue/contracts.ts` 定义 job、task、event、retry policy、cost 和状态枚举。
- `src/queue/planner.ts` 把模式、方案和输出配置规划成父子任务。
- `src/queue/mock-runner.ts` 使用 mock provider 消费任务计划，验证 DTO 和状态流转。
- `src/queue/index.ts` 作为队列合同统一出口。

原因：
- 让任务状态和 Provider 调用映射先稳定下来。
- 支持后续 UI 的 slim status bar、任务抽屉、失败重试和取消。
- 保持队列、provider、schema、UI 的边界清楚。

影响：
- 当前 mock runner 不发真实请求，不保存任务，不写文件。
- 真实队列实现必须符合这些 job/task/event DTO。
- UI 任务栏应读取队列状态派生数据，而不是自己编造进度字段。

## D029: Provider Adapter Contract Is Defined Before Real Provider Calls

状态：已接受

背景：
MVP 需要支持 OpenAI、Replicate、ComfyUI 和 Custom HTTP，但真实请求、凭证存储、成本统计和任务队列执行还没有进入实现阶段。如果现在直接在 UI 或任务代码里写某个供应商的调用逻辑，会把业务流程绑定到单一模型和接口格式。

决策：
先建立 Provider Adapter 合同层，不发真实请求：

- `src/providers/contracts.ts` 定义能力、模型 slot、请求 DTO、响应 DTO、错误结构和 adapter interface。
- `src/providers/manifests.ts` 定义 OpenAI、Replicate、ComfyUI 和 Custom HTTP 的静态能力声明。
- `src/providers/mock-adapter.ts` 提供只返回静态结果的 mock adapter，用于后续任务队列和 UI 集成测试。
- `src/providers/index.ts` 作为 provider 合同统一出口。

原因：
- 保持产品逻辑不绑定单一模型或供应商。
- 让任务队列、表单 schema、Provider 设置和后续 API route 使用同一套 DTO。
- 在真实联网和密钥存储前，先验证接口边界和能力声明。

影响：
- 当前 Provider adapter 不读取真实 API Key，不发网络请求，不保存凭证。
- 真实 provider 实现必须符合 `GenerationProviderAdapter` interface。
- UI 根据 provider manifest 的 capability 显示、禁用或解释功能入口。

## D028: Form Adapters Bridge Zod Schemas To Future React Hook Form Screens

状态：已接受

背景：
Zod schema 已经成为表单校验来源，但当前工作台仍是静态渲染模块。如果直接在 UI 组件里散落字段、默认值和控件类型，后续迁移 React Hook Form 时会重复定义表单结构，也容易破坏已确认的左侧生产配置节奏。

决策：
新增框架无关的 form adapter 层，负责把 schema、默认值、字段分组和推荐控件类型集中起来。当前阶段不引入 React，也不绑定具体 UI 库；未来 React Hook Form 组件从 adapter 读取表单定义。

原因：
- 保持 Zod schema 是校验来源，adapter 是 UI 表单组织来源。
- 让五种生产模式的不同字段以同一接口暴露。
- 避免静态原型、React 表单和 API DTO 三套字段各自漂移。

影响：
- 新表单或字段变更必须先更新 Zod schema，再更新 form adapter。
- UI 组件迁移时不得在组件内重新发明字段名称、默认值或 mode guardrail。
- 表单适配层仍不保存数据、不请求 API、不处理真实上传。

## D027: Zod Schemas Become The Source For Form Validation

状态：已接受

背景：
上一阶段已经建立框架无关的 schema 合同和静态验证脚本。下一步需要把这些合同映射到目标技术栈中的表单校验层。项目仍未迁移到 Next.js 和 React，但 schema 可以先以 TypeScript + Zod 独立落地。

决策：
新增 TypeScript/Zod schema 层，作为后续 React Hook Form、API DTO 和数据库模型之前的校验来源：

- `src/schema/zod.ts` 定义枚举、实体、表单和五模式 discriminated union schema。
- `src/schema/zod-defaults.ts` 定义通过 Zod 类型约束的默认值。
- `tsconfig.json` 先只检查 schema TS 文件，不迁移现有静态 JS 原型。
- `package.json` 增加 `typecheck`，`check` 同时运行静态 schema 检查和 TypeScript 检查。

原因：
- 与项目既定技术栈中的 React Hook Form + Zod 对齐。
- 先把表单合同和模式硬约束类型化，避免 UI、任务队列和 API 各自定义字段。
- 不强行迁移当前静态 UI，降低返工和风险。

影响：
- 需要引入 `zod` 和 `typescript` 作为当前阶段的最小依赖。
- 真实表单组件迁移到 React 后，应直接复用这些 Zod schemas。
- Collab、Logo、Icon 的硬约束必须继续保留在 Zod schema 中。

## D026: Schema Validation Runs Before Database Or API Integration

状态：已接受

背景：
当前已经有框架无关的 schema 草案，但如果它只停留在文档式对象，后续五模式配置、Provider、任务队列和表单默认值可能逐渐漂移。项目仍处于静态原型阶段，不适合立刻安装完整 Next.js、Zod 和 React Hook Form 栈。

决策：
先建立可执行的 schema 验证层：

- `src/schema/defaults.js` 定义各模式表单默认值、输出默认值、Provider 默认值和任务草稿。
- `src/schema/validation.js` 定义框架无关的表单校验与静态 fixture 完整性检查。
- `src/schema/index.js` 作为 schema 模块统一出口。
- `tools/check-schema.mjs` 作为当前阶段的 schema 回归检查命令。
- `package.json` 先提供 `npm run schema:check`，暂不安装外部依赖。

原因：
- 在接数据库和真实 API 前，先让业务合同可运行、可检查。
- 避免静态原型阶段过早引入依赖和框架迁移风险。
- 为后续 Zod schema、React Hook Form resolver 和数据库模型提供可复核的字段来源。

影响：
- 当前校验层不替代未来的 Zod，只是 MVP schema 的第一层落地。
- 后续接入 TypeScript/Zod 时，应保持这些模式约束和默认值语义不变。
- 每次修改模式 fixture、Provider fixture 或 schema 草案后，应运行 `npm run schema:check`。

## D024: Static Prototype Uses ES Module Boundaries Before Framework Migration

状态：已接受

背景：
当前工作台仍是静态原型，但已经承载五种生产模式、Provider 设置、检查器、任务栏和档案馆。如果继续把静态数据、渲染和事件绑定放在一个入口文件里，后续迁移到 Next.js、TypeScript、React Hook Form 和真实任务队列时会产生较高返工。

决策：
静态原型先拆成 ES module 边界：

- `src/data/*` 保存静态模式、Provider 和任务 fixture。
- `src/state.js` 保存工作台运行状态和选中对象派生逻辑。
- `src/render/*` 保存可替换的 UI 渲染模块。
- `src/events.js` 保存静态交互绑定。
- `app.js` 只作为启动和组合入口。

原因：
- 保留当前已确认的静态视觉和交互，不进行框架迁移。
- 让后续 Next.js 组件化可以按现有模块边界逐步替换。
- 让数据模型、任务队列和 Provider adapter 有明确落点。

影响：
- 静态原型仍不接 API、不真实上传、不持久化。
- 后续 UI 改动应优先修改对应 render 模块，而不是回到单文件堆叠。
- 测试需要覆盖模块化后页面仍能正常加载、切换模式、打开检查器、展开任务栏和打开 Provider 设置。

## D025: Schema Draft Is A Framework-Agnostic Contract First

状态：已接受

背景：
下一阶段需要定义数据模型与表单 schema，但当前项目还未迁移到 Next.js/TypeScript，也未安装 React Hook Form 或 Zod。过早引入运行时依赖会扩大静态原型阶段的范围。

决策：
先在 `src/schema/models.js` 保存框架无关的 schema 草案，覆盖项目、素材、品牌资产、角色、方案 brief、生成任务、结果资产、Provider 配置和五种模式表单。真实实现阶段再映射为 Zod schema 和 React Hook Form 表单。

原因：
- 先确认业务字段和边界，再决定具体技术实现。
- 避免在静态原型阶段引入不必要依赖。
- 让 MVP 的数据实体、模式约束和任务队列结构可以被产品、UI 和测试共同复核。

影响：
- `src/schema/models.js` 不负责校验运行时数据，也不保存密钥。
- 后续接数据库和 API 前，应以该 schema 草案为基础补齐 Zod、数据库模型和 provider adapter DTO。
- Collab、Logo、Icon 的硬约束必须保留为 schema 级约束，不只作为 UI 文案存在。

## D021: Workbench Supports Five Production Modes

状态：已接受

背景：
产品从单一海报生产扩展到联名、公告、Logo 和 Icon。它们都服务游戏宣发素材生产，但输入字段、资产槽位、Prompt 规则和输出约束不同。

决策：
在同一个批量生成工作台内引入 `activeMode` 模式枚举：

- `poster`
- `collab`
- `announcement`
- `logo`
- `icon`

模式切换只替换左侧配置、中央方案 brief、右侧检查器和 Prompt 约束，不创建独立产品或新的主页面架构。

原因：

- 用户仍然在同一项目和素材上下文中生产宣发资产。
- 共享档案馆、Provider 设置和任务队列能保持生产闭环。
- 统一工作台比多个孤立工具更利于后续批量任务和结果管理。

影响：

- UI 需要展示五模式切换器。
- 数据结构需要按 mode 保存配置、资产槽位、方案和结果。
- 测试需要覆盖每个模式的必填字段、输出约束和检查器内容。

## D022: Collab Character Appearance Lock Is A Hard Guardrail

状态：已接受

背景：
联名模式最大的失败风险是 AI 把游戏角色和联名角色融合、变形，或在 brief 阶段凭空描述外貌，导致上传素材失去控制力。

决策：
联名模式在 brief planning 阶段只能使用 `[Game Character]` 和 `[Collab Partner]` 占位符。LLM 不得描述角色外貌、服装或面部特征。最终图像外貌由上传参考图决定，并强制注入“不合并为同一实体”的规则。

原因：

- 保持角色一致性。
- 防止联名双方 IP 混合走形。
- 让视觉模型依据素材而不是 LLM 幻觉决定外貌。

影响：

- Prompt builder 必须有模式级 guardrail。
- 方案卡和检查器需要提示角色锁定状态。
- 测试需要验证 Collab prompt 不包含外貌描述，只包含动作、关系和场景。

## D023: Logo And Icon Modes Have Non-Negotiable Output Constraints

状态：已接受

背景：
Logo 和 Icon 不是普通海报。Logo 需要后期抠图友好，Icon 需要平台可用的满铺正方形图标。

决策：
Logo 模式强制提示纯色背景、字标主体、禁止复杂环境。Icon 模式强制 1:1、主体清晰、无文字、无白边、忠于上传素材；圆角不是硬失败项。

原因：

- 输出用途决定了严格约束。
- 如果把 Logo/Icon 当作普通海报生成，会产生不可用结果。
- 这些规则应在 UI、Prompt 和测试中同时体现。

影响：

- Icon 模式隐藏或锁定非 1:1 尺寸。
- Logo 模式需要突出背景约束和字标设置。
- Beta 可加入自动检测，但 MVP 先通过 prompt guardrail 和 UI 警示实现。

## D019: Inspector Rail Uses IPTH Context Navigation

状态：已接受

背景：
右侧检查器 rail 中的 I/P/T/H 单字母入口在静态原型里缺少语义，用户无法判断它们分别打开什么信息。

决策：
将 IPTH 定义为上下文导航：

- I = Inspector，检查器主视图。
- P = Prompt，Prompt 详情视图。
- T = Timeline / Task，任务进度视图。
- H = History，历史版本视图。

原因：
- 保留紧凑 rail 的效率，同时降低认知负担。
- 为后续 Prompt、任务时间线和历史版本视图预留稳定入口。
- 静态阶段可用字母和 tooltip，组件化阶段可替换为语义图标。

影响：
- DESIGN.md 必须记录 IPTH 语义和选中态规则。
- UI 验收需要检查 tooltip、active 指示和折叠状态。
- 后续实现不得把 P 误用为 pin，固定操作应放在检查器面板 header 内。

## D020: Provider Settings Assign Models By Task Slot

状态：已接受

背景：
一个 provider 默认模型无法覆盖方案生成、图像生成、风格参考分析和构图参考分析等不同任务。不同任务对文本推理、图像生成和视觉理解模型的要求不同。

决策：
Provider 设置中增加“按任务分配模型”的 slot 结构：

- 方案生成：Brief → Creative Concept。
- 图像生成：Concept → Image Output。
- 风格参考分析：Style Reference image understanding。
- 构图参考分析：Layout Reference image understanding。

原因：
- 与 provider adapter 架构一致，不把任务能力绑定到单个默认模型。
- 后续接入 OpenAI、Replicate、ComfyUI 或 Custom HTTP 时，可以按能力路由。
- UI 能提前暴露后续真实任务队列需要的模型粒度。

影响：
- 静态原型只展示 slot 表单，不保存、不测试真实连接。
- 后续数据结构需要保存 provider 级默认模型和任务级覆盖模型。
- 测试需要覆盖默认模型、任务 slot 覆盖、不可用模型禁用和脱敏显示。

## D016: Theme Tokens Use Separate Light And Dark Designs

状态：已接受

背景：
工作台需要默认明亮、细线条、专业，但用户也需要暗色工作环境。简单反色会让暗色模式显得粗糙，也会破坏游戏素材预览和状态色层级。

决策：
采用 CSS variables 管理主题 token。Light 是默认主题，Dark 使用单独设计的背景、面板、边框、文字、强调色和状态色。

原因：
- 支持长期维护和主题扩展。
- 避免把暗色模式做成粗暴反色。
- 让游戏宣发图片在两种主题下都保持视觉主角。

影响：
- DESIGN.md 记录主题 token 和使用规则。
- UI 测试必须覆盖 Light 和 Dark。
- 后续组件不得硬编码主题颜色。

## D017: Model And API Key Management Is MVP Foundation

状态：已接受

背景：
生图、局部重绘、高清放大、背景移除和未来 provider 切换都依赖模型供应商配置。如果没有统一的 provider adapter 和 API Key 管理，业务逻辑会过早绑定到单一模型。

决策：
MVP 规划包含“模型与 API Key”配置能力。静态原型仅展示 UI 和状态，不真实保存密钥，不发起连接测试。

原因：
- Provider adapter 是后续接入 OpenAI、Replicate、ComfyUI 和 Custom HTTP 的基础。
- API Key 配置影响任务队列、模型选择、错误处理和测试策略。
- 提前设计表单和状态可降低后续接 API 时的返工。

影响：
- PRODUCT.md 和 ROADMAP.md 将其标记为 MVP 基础能力。
- TESTING.md 增加 provider 设置、脱敏、错误状态和无真实请求验证。
- 后续实现必须加密存储真实 API Key，并区分团队权限。

## D018: Inspector And Task Queue Default To Collapsed Chrome

状态：已接受

背景：
当前右侧检查器和底部任务区占据了较多空间，容易挤压中央方案和结果。游戏宣发素材工具的首屏应优先服务方案判断和视觉结果，而不是常驻详情面板。

决策：
右侧检查器默认收起为 rail，选中方案或图片后展开，可 pin 固定。底部任务区默认是 slim status bar，点击后展开为任务 drawer。

原因：
- 中央生产板需要成为主视觉区域。
- 检查器和任务队列属于上下文信息，不应长期压过生产对象。
- 收纳后仍能保留高频入口和状态反馈。

影响：
- 静态原型需要展示 collapsed、expanded、pinned 和 drawer 状态。
- 响应式检查需要覆盖收纳状态下的 1440、1024、768、375px。

## 决策记录格式

每条决策包含：

- 状态：提议中、已接受、已废弃。
- 背景。
- 决策。
- 原因。
- 影响。

## D001: 产品采用项目型工作台，而不是单页生图器

状态：已接受

背景：

需求包含游戏资料、素材、品牌资产、角色一致性、生成历史、平台规格和后处理。单页生图器无法承载长期资产管理和批量生产流程。

决策：

采用项目型工作台结构。

原因：

- 游戏资产需要长期复用。
- 生成结果需要按项目归档。
- 品牌资产和角色资产是项目级能力。
- 任务队列和历史记录需要稳定上下文。

影响：

- 需要 Project、Asset、BrandKit、CharacterProfile 等实体。
- 页面结构会包含项目页、资产库、生成工作台和画廊。

## D002: MVP 包含品牌资产库

状态：已接受

背景：

游戏海报生成必须体现品牌识别，包括 logo、主色、字体风格、固定文案和禁用元素。

决策：

品牌资产库进入 MVP。

原因：

- 没有品牌资产库，生成结果会过度随机。
- 品牌资产能提高结果一致性和复用价值。

影响：

- 数据结构需要 BrandKit。
- 生成方案和图片生成都需要读取品牌上下文。
- 测试需要验证品牌资产是否进入生成上下文。

## D003: MVP 包含角色一致性，但不做私有模型训练

状态：已接受

背景：

用户希望角色在多张图片中保持一致。但私有模型训练、LoRA 和角色模型管理复杂度较高。

决策：

MVP 支持基于参考图、角色描述和提示词约束的角色一致性，不包含私有训练。

原因：

- 能满足第一版可用性。
- 控制开发复杂度。
- 为后续私有模型训练预留扩展点。

影响：

- 需要 CharacterProfile。
- 需要角色锁定和一致性强度参数。
- 后续可以扩展到 LoRA 或私有模型。

## D004: MVP 包含多语言宣传词

状态：已接受

背景：

游戏素材常面向多个市场和平台，宣传词需要按语言和平台生成。

决策：

MVP 至少支持中文、英文、日文、韩文宣传词。

原因：

- 多语言是游戏发行常见刚需。
- 宣传词会直接影响海报布局和可用性。

影响：

- 需要 SloganVariant。
- 平台规格需要包含文案长度建议。
- 测试需要验证语言不混用。

## D005: MVP 包含预设平台规格

状态：已接受

背景：

不同平台对图片比例、尺寸和文案长度有不同要求。

决策：

MVP 支持 Steam、App Store、Google Play、TapTap、TikTok、Meta Ads。

原因：

- 平台规格直接影响生成参数。
- 用户需要按用途导出，而不是手动裁剪。

影响：

- 需要 PlatformPreset。
- 生成任务需要按平台拆分。
- 导出文件需要按平台命名。

## D006: MVP 包含局部重绘、高清放大、背景移除

状态：已接受

背景：

游戏海报生成后通常需要继续微调，例如修改文字区域、放大成品、提取角色素材。

决策：

局部重绘、高清放大、背景移除进入 MVP。

原因：

- 这些能力能形成完整生产闭环。
- 用户不需要跳转到其他工具完成后处理。

影响：

- 需要 PostProcessJob。
- 任务队列需要支持生成后的后处理任务。
- 画廊需要提供后处理入口。

## D007: 采用 provider adapter 设计接入生图模型

状态：已接受

背景：

生图模型可能来自不同供应商，且能力差异明显。

决策：

模型接入采用 provider adapter，不将业务逻辑绑定到单一模型。

原因：

- 便于切换模型。
- 便于后续接入 OpenAI Images、Replicate、ComfyUI 或私有服务。
- 便于测试时使用 mock provider。

影响：

- 需要统一的 GenerationProvider 接口。
- 模型能力需要声明，例如是否支持参考图、局部重绘、高清放大、背景移除。
- UI 需要根据模型能力显示或禁用功能。

## D008: 任务队列采用流水线结构

状态：已接受

背景：

一次生成可能包含参考图分析、宣传词生成、方案生成、批量出图、后处理和导出。

决策：

采用父子任务和流水线式任务队列。

原因：

- 便于展示进度。
- 便于失败重试。
- 便于取消和恢复。
- 便于成本统计。

影响：

- 需要 GenerationJob 和 PostProcessJob。
- 任务状态必须可持久化。
- 前端需要显示任务队列和子任务状态。

## D009: 高质量构图参考不等于版权复刻

状态：已接受

背景：

用户希望高质量复刻构图，但产品需要避免复制受版权保护的具体角色、商标或画面。

决策：

产品文案中使用“高质量构图参考”或“复刻构图关系”，不承诺复制原图具体内容。

原因：

- 降低版权和合规风险。
- 保留用户需要的构图、光影、版式参考能力。

影响：

- UI 文案需要谨慎。
- 提示词提取应聚焦结构信息。
- 测试需要验证不会引导用户复制受保护 IP。

## D010: MVP 优先桌面创作体验

状态：已接受

背景：

生成工作台涉及大量参数、素材、方案和结果管理。

决策：

MVP 优先桌面端，移动端主要支持查看和下载。

原因：

- 桌面更适合高密度创作。
- 移动端完整创作体验成本较高。

影响：

- 设计以 1024px 以上体验为核心。
- 小屏使用折叠面板和简化操作。
- MVP 不追求移动端完整参数编辑体验。

## D011: 主视觉方向采用专业暗色生产工具

状态：已废弃，由 D014 取代

背景：

当前评估了三套方向：A 专业暗色生产工具、B 高级游戏发行后台、C 创意导演式 AI 画布。产品需要同时满足批量生产、参数控制、结果筛选和后处理。

决策：

采用 A 专业暗色生产工具作为 MVP 主方向。

原因：

- 最适合左中右工作台。
- 最适合高频批量生产。
- 最能承载复杂参数和任务队列。
- 实现风险低于创意画布。
- 比发行后台更能突出 AI 生成和视觉结果。

影响：

- DESIGN.md 以 A 的三栏工作台为核心。
- MVP 首屏不是营销页，而是可操作工作台。
- 中央区域必须优先展示方案和结果图。

## D012: 融合高级发行后台和创意导演式画布的局部优点

状态：已接受

背景：

B 对平台规格、多语言、导出状态、活动管理更强。C 对结果墙、变体生成、局部重绘和视觉探索更强。

决策：

MVP 主方向保留 A 的专业三栏生产结构，但视觉语言改为 D014 的明亮中性工作台，并融合 B 和 C 的局部能力。

原因：

- 平台规格和导出管理是游戏素材生产刚需。
- 结果变体和后处理是 AI 图片工具的核心价值。
- 融合局部优点比完整切换方向更稳。

影响：

- MVP 中加入 Canva 式平台规格选择。
- MVP 中加入 Midjourney / Magnific 式结果派生。
- Beta 再强化发行后台视图。
- 后续版本再发展创意导演式 AI 画布。

## D013: 主界面拒绝营销落地页和玩具化视觉

状态：已接受

背景：

用户明确不喜欢营销落地页、大圆角卡片、过多渐变、玩具感和空洞科技感。

决策：

主界面采用专业、密集、清晰、明亮中性工作台。营销落地页不作为 MVP 主入口。

原因：

- 高频生产用户更需要效率和可控性。
- 游戏图片本身已经足够有视觉冲击，界面不应抢戏。
- 过度装饰会降低专业可信度。

影响：

- DESIGN.md 明确限制大面积渐变、过度圆角、玩具感和空洞科技感。
- UI 测试需要检查图片结果是否比界面装饰更突出。

## D014: 默认主视觉方向改为明亮中性创意生产台

状态：已接受

背景：

参考 Lovart、可灵、即梦等创作台后，暗色方向容易让界面过重，并让四周配置区压迫中央视觉结果。当前产品需要更像专业创意生产台，让海报、方案和结果图成为第一视觉焦点。

决策：

默认 UI 改为明亮中性工作台：保留左侧控制、中央方案/画布、右侧检查器和底部队列的生产结构，但减少正截面四周都塞满信息的压迫感。

原因：

- 明亮中性底色更能衬托高饱和游戏宣发图。
- 中央区域可以更像画布和结果墙，而不是参数表单。
- 专业感来自信息层级、精确边界和控件纪律，而不是暗色和霓虹。
- 更接近用户确认的参考方向，同时避免营销页、玩具感和模板感。

影响：

- DESIGN.md 以明亮中性设计系统为准。
- 静态工作台优先重构布局、层级、状态和结果展示，不接数据库或生图 API。
- UI 检查需要覆盖 1440、1024、768、375px，重点看重叠、溢出和中央视觉是否突出。

## D015: 主工作台采用批量生成生产台模型

状态：已接受

背景：

参考 Lovart、可灵、即梦和同类海报生成工具后，确认产品不应继续向普通 SaaS 后台、聊天式生图器或自由设计画布收敛。游戏宣发素材生产更需要稳定的左侧配置、中央方案/结果批次、上下文检查和任务反馈。

决策：

主工作台采用“左侧生产配置 + 中央方案/结果生产板 + 右侧上下文检查器 + 轻量任务反馈”的批量生成生产台模型。

原因：

- 左侧配置可以承载项目、素材、参考图、风格、尺寸、数量、宣传词和高级参数。
- 中央方案卡网格和方案组结果更符合批量生产，而不是单张图孤立生成。
- 右侧检查器能承载 Prompt、宣传词、构图、锁定字段和后处理上下文。
- toast、轻量队列和卡片内状态比大面积队列面板更不干扰生产。
- 档案馆和结果大图适合作为弹层或 lightbox，不应长期占据主工作台首屏。

影响：

- DESIGN.md 以生产台结构为当前主方案。
- 静态原型优先呈现布局、配置区域、方案卡、检查器、任务队列和按钮状态。
- 真实上传、数据库和生图 API 仍不进入当前静态原型阶段。
- UI 验收必须检查 1440、1024、768、375px 下的重叠、溢出和信息主次。

## D016: Provider 模型候选表按官方模型页定期刷新

状态：已接受

背景：

模型与 API Key 面板的候选模型会直接影响用户能否保存、测试和路由供应商。旧模型 ID 会让连接测试失败，或让用户误以为某个 provider 仍适合当前任务。

决策：

默认候选优先使用官方模型页当前列出的主力模型：OpenAI 使用 GPT-5.4 与 GPT Image 1.5；DeepSeek 使用 deepseek-v4-flash / deepseek-v4-pro；Google 使用 Gemini 3.x 与 Gemini image / Imagen；Claude 使用官方带日期的模型 ID；Qwen 使用 Model Studio 当前 Qwen / Wan / image 系列。

原因：

- API Key 配置面板需要让用户直接选择可测试的模型 ID。
- 中转站和各 provider 的实际可用模型仍取决于账号、分组和地区，连接测试继续以 `/models` 或官方模型列表返回为准。

影响：

- 模型候选表、provider manifests、默认 provider 配置和静态 fixture 需要保持一致。
- 旧模型只应在已有配置值中保留，不应继续作为默认推荐。
## D017: Provider Routing Is Per Task Slot

Status: Accepted

Context:
Formal testing needs common mixed-provider workflows, for example DeepSeek for concept planning and Google, AIGoCode, OpenAI, or Qwen for image generation. Binding every model selector to the currently selected provider makes users unsure whether a `gpt-*` model is official OpenAI, an OpenAI-compatible relay, or the wrong provider entirely.

Decision:
Provider settings keep credential editing on the left provider list, but routing is saved per task slot. Concept generation, image generation, style reference analysis, composition reference analysis, and image post-processing may each carry their own provider id and model id through the submission DTO and queue tasks. Unsupported provider/model combinations are disabled with explicit provider/capability messages unless the user selects a supported route intentionally; the UI must not silently fall back to a different provider.

Impact:
- Queue plans store task-level `providerId` and model values instead of assuming one job provider for every task.
- Static and HTTP generation flows map provider requests through the image slot when preparing image generation.
- Reference extraction buttons check the configured analysis slot provider, not only the currently selected credential provider.
- UI copy must make the execution channel explicit so users can distinguish official providers from relay providers.
