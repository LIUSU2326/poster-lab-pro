import {
  evaluateQueuePlanCapabilityGate,
  providerCapabilityGateUserMessage,
} from './provider-capabilities.js';

function nowIso() {
  return new Date().toISOString();
}

let traceIndex = 0;

function createTraceId() {
  traceIndex += 1;
  return `trace-static-service-${Date.now().toString(36)}-${traceIndex}`;
}

function createMeta(snapshot) {
  return {
    traceId: createTraceId(),
    workspaceId: snapshot?.metadata?.workspaceId,
    revision: snapshot?.metadata?.revision,
    createdAt: nowIso(),
  };
}

function success(data, snapshot) {
  return {
    ok: true,
    data,
    meta: createMeta(snapshot),
  };
}

function failure(code, message, { fieldErrors = {}, details = {}, snapshot = null } = {}) {
  return {
    ok: false,
    error: {
      code,
      message,
      fieldErrors,
      details,
    },
    meta: createMeta(snapshot),
  };
}

function summarizeWorkspaceSnapshot(snapshot) {
  return {
    workspaceId: snapshot.metadata.workspaceId,
    projectId: snapshot.project.id,
    projectName: snapshot.project.name,
    activeMode: snapshot.activeMode,
    revision: snapshot.metadata.revision,
    assetCount: snapshot.assets.length,
    schemeCount: snapshot.schemes.length,
    resultCount: snapshot.results.length,
    runningQueueCount: snapshot.queuePlans.filter((plan) => ["running", "queued"].includes(plan.job?.status)).length,
    updatedAt: snapshot.metadata.updatedAt,
  };
}

function findModeState(snapshot, mode) {
  return snapshot.modeStates.find((item) => item.mode === mode);
}

function selectedSloganLanguage(snapshot, mode) {
  const languages = findModeState(snapshot, mode)?.sloganSettings?.languages;
  return Array.isArray(languages) && languages.length > 0 ? languages[0] : "en-US";
}

function findScheme(snapshot, schemeId, mode) {
  if (schemeId) {
    return snapshot.schemes.find((item) => item.id === schemeId && item.mode === mode) || null;
  }
  return snapshot.schemes.find((item) => item.mode === mode) || null;
}

function inferSize(aspectRatio) {
  const explicit = String(aspectRatio || "").match(/^(\d{3,5})x(\d{3,5})$/);
  if (explicit) return { width: Number(explicit[1]), height: Number(explicit[2]) };
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
  if (aspectRatio === "4:3") return { width: 1600, height: 1200 };
  if (aspectRatio === "3:4") return { width: 1200, height: 1600 };
  return { width: 1024, height: 1024 };
}

function focusGuidancePolicy(modeState) {
  const rawFocus = String(modeState?.projectBrief?.focusGuidance || "").trim();
  if (!modeState?.projectBrief?.focusGuidanceEnabled || !rawFocus) {
    return "Focus guidance: not active. Choose the strongest campaign KV story from project description, uploaded assets, and the selected scheme.";
  }
  return [
    `Focus guidance: ${rawFocus}.`,
    "Focus guidance handling: treat this as a soft creative emphasis, not a literal scene lock. It must never override uploaded asset identity, the assigned KV architecture, story clarity, or poster quality.",
    "Focus guidance impact requirement: every generated scheme must visibly translate at least one active focus item into a concrete camera, action, environment, prop, lighting, or copy-area decision in the brief and image prompt.",
    "If it mentions giant scale, micro perspective, or scale words, reinterpret it as scale drama and camera energy. Do not make every scheme a flat side-view scene.",
  ].join("\n");
}

function createPromptSections({ snapshot, modeState, scheme }) {
  return [
    {
      id: "project",
      title: "Project Context",
      source: "project",
      required: true,
      locked: false,
      priority: 100,
      content: [
        `Game: ${snapshot.project.name}`,
        `Description: ${snapshot.project.description}`,
        focusGuidancePolicy(modeState),
      ].join("\n"),
    },
    {
      id: "mode",
      title: "Mode Configuration",
      source: "mode",
      required: true,
      locked: ["collab", "logo", "icon"].includes(modeState.mode),
      priority: 90,
      content: JSON.stringify(modeState.modeForm),
    },
    {
      id: "scheme",
      title: "Selected Scheme",
      source: "scheme",
      required: true,
      locked: false,
      priority: 85,
      content: scheme ? `${scheme.title}\n${scheme.brief}` : "No scheme selected.",
    },
  ];
}

function buildPromptPackage(payload) {
  const snapshot = payload.snapshot;
  const mode = payload.mode || snapshot.activeMode;
  const modeState = findModeState(snapshot, mode);
  if (!modeState) throw new Error(`Missing mode state for ${mode}.`);

  const scheme = payload.target === "brief" ? null : findScheme(snapshot, payload.schemeId, mode);
  if (payload.target === "image" && !scheme) throw new Error("Image prompt packages require a scheme.");

  const aspectRatio = payload.aspectRatio || modeState.outputSettings.aspectRatios[0] || "1:1";
  const size = inferSize(aspectRatio);
  const platformPreset = payload.platformPreset || modeState.outputSettings.platformPresets[0] || "custom";
  const sections = createPromptSections({ snapshot, modeState, scheme });
  const guardrails = [
    { id: `${mode}-static-hard-rule`, severity: "hard", rule: `Follow ${mode} production guardrails.` },
  ];
  const finalPrompt = [
    sections.map((section) => `## ${section.title}\n${section.content}`).join("\n\n"),
    "## Mode Guardrails",
    guardrails.map((item) => item.rule).join("\n"),
  ].join("\n\n");
  const roleCounters = new Map();

  return {
    id: `prompt-${payload.target || "image"}-${mode}-${scheme?.id || "workspace"}`,
    target: payload.target || "image",
    projectId: snapshot.project.id,
    mode,
    schemeId: scheme?.id || null,
    sections,
    assets: snapshot.assets.map((asset) => {
      const url = asset.providerUrl || asset.previewUrl || asset.url || asset.assetUrl || null;
      const nextIndex = (roleCounters.get(asset.role) || 0) + 1;
      roleCounters.set(asset.role, nextIndex);
      const isPosterBoss = mode === "poster" && asset.role === "prop" && /\bBOSS\b|boss|首领|魔王|怪物|怪兽|敌人|宝箱怪/i.test(asset.label || "");
      const placeholder = mode === "poster" && asset.role === "gameCharacter"
        ? `[Game Character ${nextIndex}]`
        : isPosterBoss
          ? "[Boss]"
          : mode === "poster" && asset.role === "gameLogo"
            ? "[Game Logo]"
            : null;
      return {
        assetId: asset.id,
        role: asset.role,
        label: asset.label,
        binding: ["gameCharacter", "collabCharacter"].includes(asset.role)
          ? "identityLock"
          : ["gameLogo", "brandLogo"].includes(asset.role)
            ? "logoLock"
            : asset.role === "background"
              ? "backgroundReference"
              : ["styleReference", "uiScreenshot"].includes(asset.role)
                ? "styleReference"
                : asset.role === "compositionReference"
                  ? "compositionReference"
                  : "subjectReference",
        required: ["gameCharacter", "gameLogo", "subjectReference"].includes(asset.role),
        placeholder,
        ...(isSafeProviderUrl(url) ? { url } : {}),
        ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
        ...(asset.storageKey ? { storageKey: asset.storageKey } : {}),
        providerReady: isSafeProviderUrl(url),
      };
    }),
    platform: {
      platformPreset,
      aspectRatio,
      width: payload.width || modeState.outputSettings.customSize?.width || size.width,
      height: payload.height || modeState.outputSettings.customSize?.height || size.height,
      safeArea: "Keep logo, headline, and main subject clear after platform cropping.",
      copyLengthHint: "Campaign slogan should stay punchy and legible.",
    },
    slogans: scheme?.slogans || {},
    guardrails,
    negativePrompt: "",
    finalPrompt,
    validation: {
      ok: true,
      errors: [],
      warnings: snapshot.assets.length ? [] : ["No reference assets are attached."],
      lockedFields: scheme?.lockedFields || [],
    },
  };
}

function resolveModel(snapshot, providerId, slot) {
  const config = snapshot.providerConfigs?.[providerId];
  return config?.modelSlots?.[slot] || config?.defaultModel || (slot === "image" ? "gpt-image-2" : "gpt-5.5");
}

function isSafeProviderUrl(url) {
  return typeof url === "string" && /^(https?:|data:)/i.test(url);
}

function creativeDirectionFromPromptPackage(promptPackage) {
  return (promptPackage.sections || [])
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n")
    .slice(0, 4000);
}

function posterCinematicKvQualityDirective() {
  return [
	    "## Cinematic Game KV Quality Override",
    "Target the feel of a top-tier cinematic game announcement key visual, adapted to the uploaded art style. This means movie-poster staging and lighting quality, not photorealism unless the active style reference is photorealistic.",
    "Cinematography: choose deliberate camera language such as low-angle hero shot, 24-35mm wide cinematic lens feel, forced perspective, over-the-shoulder danger reveal, foreground occlusion, diagonal motion path, or portal/window frame-within-frame. Avoid neutral side-view staging.",
    "Lighting: design a clear key light, colored fill, hard rim/back light, and a motivated project-specific practical light source such as portal glow, fire, magic, tech screens, warning lights, moonlight, explosion light, or energy effects.",
    "VFX and particles: add layered project-specific particles that serve the story: dust, sparks, embers, smoke, debris, magic trails, tech fragments, motion arcs, shockwave rings, weather, atmospheric haze, and depth-of-field separation.",
    "Story beat: capture a decisive second from the current game's trailer: breach, ambush, rescue, counterattack, boss takedown, portal opening, base defense, route push, discovery, upgrade, or objective pressure erupting into action.",
    "Character performance: uploaded heroes must show readable emotion, weight, line of action, gesture, and contact with the scene. At least one hero must interact physically with the BOSS or set piece.",
    posterFocalHierarchyLock(),
    posterKvArchitectureDiversityRequirement(),
    posterTextEconomyLock(),
    posterInWorldBrandTreatmentLock(),
    posterIdentitySafeMotionRule(),
    posterHeroPerformanceScaleLock(),
    posterSubjectAccessoryStrictnessLock(),
  ].join("\n");
}

function posterIdentitySafeMotionRule() {
  return "Identity-safe motion hierarchy: never improve action by redesigning an uploaded character, but do not use identity safety as an excuse for an unchanged static cutout. Preserve exact identity while requiring at least one readable performance change; if full re-posing risks drift, use a 3/4 turn, grip/contact, foreshortened prop/tool angle, facial expression, camera perspective, foreground occlusion, VFX, lighting, and environment motion.";
}

function posterHeroPerformanceScaleLock() {
  return "Hero performance scale lock: at least one uploaded playable protagonist must occupy 24-38% of canvas height or equivalent foreground/midground visual weight, with readable face, emotion, body language, and signature prop/tool; it must be staged before logo/slogan placement, physically interacting with the BOSS or set piece, and must not be tiny, hidden, back-facing, cropped into insignificance, or visually subordinate to the logo, slogan, BOSS, or background.";
}

function posterLogoSingleUseLock() {
  return "Logo single-use lock: when a brandLogo/gameLogo reference is present, render exactly one campaign logo treatment as an in-world brand object or restrained campaign lockup. A storefront sign, title plaque, carved board, neon sign, fire-lit sign, flag, UI emblem, or corner lockup all count as the one logo treatment; do not repeat the uploaded logo again as a second shop sign, badge, watermark, tiny duplicate, floating sticker, or alternate title.";
}

function posterSubjectAccessoryStrictnessLock() {
  return "Uploaded subject accessory lock: do not give protagonists or BOSS new shields, weapons, armor, tools, facial features, costume parts, horns, crowns, or props just because a scheme mentions them. If that object is not visibly present in the uploaded reference, reinterpret the action through body movement, camera, environment, particles, or existing visible uploaded props only.";
}

function posterFocalHierarchyLock() {
  return "Focal hierarchy lock: design the poster around one readable trailer-moment story beat first, then place brand and copy. The protagonist action, mission objective, environmental pressure, or hero-vs-BOSS beat must own the brightest focal contrast and clearest silhouette path; logo and slogan are supporting campaign elements, never the largest or sharpest subject cluster.";
}

function posterKvArchitectureDiversityRequirement() {
  return "KV architecture and scenario diversity requirement: across a batch, do not repeat the same hero-vs-BOSS confrontation, location family, mission objective, camera grammar, emotional beat, diagonal split-world, tunnel breach, or side-view battlefield solution. Give each scheme a different scenario family such as chase/escape, base defense, resource raid, discovery/portal reveal, victory payoff, route escort, objective crisis, market/town chaos, training-to-boss contrast, or wilderness expedition.";
}

function posterTextEconomyLock() {
  return "Text economy lock: after the logo treatment is placed, allow at most one slogan/copy-bearing campaign zone in the whole poster. Combine logo and slogan into one compact campaign-safe typography zone whenever possible, leaving the rest of the canvas for action, faces, scale, atmosphere, and story. Do not add a second caption zone, lower-left or lower-right label, corner badge, stacked right-side text wall, UI label strip, bottom plaque, duplicate translation, blank extra title plate, or decorative subtitle that steals attention from the character conflict.";
}

function posterInWorldBrandTreatmentLock() {
  return "In-world brand treatment lock: logo and slogan should feel physically present in the scene through perspective, material, light, shadow, occlusion, and atmospheric effects, such as a fire-lit sign, carved plaque, neon board, banner, menu board, hologram, smoke ribbon, or title plate. Do not paste flat sticker typography on top of the artwork.";
}

const providerPromptMaxChars = 18000;

function compactPromptBlock(text, maxChars) {
  const normalized = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized || normalized.length <= maxChars) return normalized;
  const suffix = "\n[Block compacted to preserve higher-priority identity, integration, logo, typography, and guardrail rules.]";
  return `${trimPromptAtBoundary(normalized, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

function trimPromptAtBoundary(text, maxChars) {
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars).trimEnd();
  const boundary = Math.max(
    clipped.lastIndexOf("\n\n"),
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("。"),
    clipped.lastIndexOf("; "),
    clipped.lastIndexOf("；"),
    clipped.lastIndexOf(" "),
  );
  return (boundary > maxChars * 0.72 ? clipped.slice(0, boundary + 1) : clipped).trimEnd();
}

function joinPromptBlocks(blocks) {
  return blocks.map((block) => String(block || "").trim()).filter(Boolean).join("\n\n");
}

function joinPromptBlocksWithinLimit({ criticalBlocks, flexibleBlocks, closingBlocks, maxChars = providerPromptMaxChars }) {
  const output = criticalBlocks.map((block) => String(block || "").trim()).filter(Boolean);
  const closing = closingBlocks.map((block) => String(block || "").trim()).filter(Boolean);
  const closingText = joinPromptBlocks(closing);

  for (const [index, block] of flexibleBlocks.entries()) {
    const remainingFlexibleMin = flexibleBlocks
      .slice(index + 1)
      .reduce((sum, item) => sum + (String(item.text || "").trim() ? item.minChars || 0 : 0), 0);
    const separatorBudget = 4 * (output.length + closing.length + 1);
    const available = maxChars - joinPromptBlocks(output).length - closingText.length - remainingFlexibleMin - separatorBudget;
    const budget = Math.min(block.maxChars, available);
    if (budget >= (block.minChars || 160)) {
      output.push(compactPromptBlock(block.text, budget));
    }
  }

  const prompt = joinPromptBlocks([...output, ...closing]);
  if (prompt.length <= maxChars) return prompt;

  const bodyBudget = maxChars - closingText.length - 4;
  if (bodyBudget >= 400) {
    return joinPromptBlocks([compactPromptBlock(joinPromptBlocks(output), bodyBudget), closingText]);
  }
  return compactPromptBlock(prompt, maxChars);
}

function integratedSloganPriorityBlock(sloganTargets) {
  if (!sloganTargets) return "";
  return [
    "## Integrated Slogan Treatment Lock",
    "Slogan visibility requirement: slogan mode is active for this image.",
    sloganTargets,
    "Render the exact slogan text as integrated game-campaign lettering if clean spelling is possible.",
    "scene-derived requirement: the slogan must be tied to this specific scheme's action, prop, BOSS threat, or set-piece material, not a generic caption that could fit any poster.",
    "Slogan art direction: treat the slogan as a large secondary campaign object, not a small caption under the logo, but never let it become the main focal subject over the trailer-moment story beat.",
    "Target presence: the slogan should be big enough for thumbnail reading, roughly 10-16% of canvas height or 18-30% of canvas width, usually 1-2 lines, while preserving a larger readable protagonist performance area.",
    "Single-use typography: render the slogan/copy treatment exactly once. Do not add a second small subtitle, lower-left or lower-right plaque, bottom plaque, caption, corner badge, watermark, duplicate translation, blank extra title plate, or repeated slogan block anywhere else in the poster.",
    "Scene integration: anchor the lettering to the poster idea through an in-world material or effect such as fire/energy glow, smoke/steam plume, carved board, battle banner, metal sign, hologram, glowing portal rim, impact burst, or foreground prop surface.",
    "Lighting integration: the slogan must receive the same perspective, shadows, rim light, bounce color, texture, haze, and partial VFX/particle overlap as the rest of the scene.",
    "Composition rule: do not stack the slogan as detached PPT-style text directly below the logo and do not let logo+slogan consume the central action space; connect it to the story beat, action path, or environmental set piece while preserving a readable logo-safe area.",
    "Copy-safe fallback: if clean spelling is not possible, still create a visible polished blank slogan-safe plate/ribbon/sign in the intended copy area; do not omit the copy area entirely and do not generate garbled text.",
  ].join("\n");
}

function staticSchemeActionRewriteRule() {
  return "Static scheme action rewrite: if selected scheme text says a character/BOSS stands, sits, is placed, is located, faces off, or simply presses in from one side, reinterpret that staging into an active trailer moment: sprint, leap, block, parry, swing, brace, slide, climb, land with dust, burst through a doorway/portal, collide with the set piece, or react to impact. Preserve uploaded identity, but do not preserve static standee staging.";
}

function rewriteStaticPosterActionPhrases(text) {
  return String(text || "")
    .replace(/(\[Game Character \d+\])\s+stands heroically\s+(on|at|along|in|near)\s+/giu, "$1 actively sprints, blocks, or slides $2 ")
    .replace(/(\[Game Character \d+\])\s+stands(?:\s+heroically)?\b/giu, "$1 lunges in a 3/4 readable action pose")
    .replace(/(\[Game Character \d+\])\s+is\s+(?:placed|located|positioned)\b/giu, "$1 is staged mid-action")
    .replace(/(\[Boss(?: \d+)?\])\s+(?:presses in|presses from one side|stands|is placed|is located|is positioned)\b/giu, "$1 lunges, swings, or recoils with a clear attack path")
    .replace(/(\[Game Character \d+\])\s*(?:英勇地)?站在/giu, "$1 以3/4动态姿态冲刺、格挡或滑行在")
    .replace(/(\[Game Character \d+\])\s*(?:位于|被放置在|处于)/giu, "$1 正在动作中穿过")
    .replace(/(\[Boss(?: \d+)?\])\s*从一侧压迫/giu, "$1 从一侧猛冲、挥击或撞入")
    .replace(/(\[Boss(?: \d+)?\])\s*(?:站在|位于|被放置在|处于)/giu, "$1 以攻击或冲击姿态占据");
}

function posterIntegratedKvPromptFromPromptPackage(promptPackage) {
  const allowedSectionIds = new Set([
    "project",
    "mode",
    "style-strategy",
    "poster-quality",
    "scheme",
    "characters",
    "assets",
    "slogans",
    "poster-typography",
    "platform",
    "reference-analysis",
  ]);
  const sectionText = rewriteStaticPosterActionPhrases((promptPackage.sections || [])
    .filter((section) => allowedSectionIds.has(section.id))
    .sort((left, right) => {
      if (left.id === "scheme" && right.id !== "scheme") return -1;
      if (right.id === "scheme" && left.id !== "scheme") return 1;
      return 0;
    })
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n"));
  const guardrails = (promptPackage.guardrails || [])
    .map((item) => `${String(item.severity || "hard").toUpperCase()}: ${item.rule}`)
    .join("\n");
  const hasStyleReference = (promptPackage.assets || []).some((asset) => asset.role === "styleReference");
  const hasCharacterReference = (promptPackage.assets || []).some((asset) => asset.role === "gameCharacter");
  const styleStrategy = (promptPackage.sections || []).find((section) => section.id === "style-strategy")?.content || "";
  const hasSelectedStyle = /Active style source:\s*selected style tag/i.test(styleStrategy);
  const styleRule = hasStyleReference
    ? "Visual style lock: match the uploaded styleReference image for rendering, palette, lighting, line quality, and material finish. Do not drift into photorealistic product photography unless the styleReference itself is photorealistic."
    : hasSelectedStyle
      ? "Visual style lock: follow the manually selected style library tag as the dominant rendering standard for palette, lighting, shape language, material finish, and overall art direction. Uploaded characters/BOSS/logo still define identity only and must be adapted into that selected style without redesigning their recognizable traits."
    : hasCharacterReference
      ? "Visual style lock: no styleReference image and no selected style tag are active, so match the uploaded character art direction / uploaded gameCharacter asset art direction for the whole world plate. Use a stylized 2D cartoon game illustration language: rounded readable shapes, clean graphic silhouettes, confident line-art feeling, soft cel/painterly shading, vibrant game-poster colors, and premium mobile-game key-art polish. Do not use photorealistic product photography, realistic unrelated 3D render, camera macro product shot, or stock-photo background."
      : "Visual style lock: use a stylized game campaign illustration style, not photorealistic product photography, unless the user explicitly selected a realistic style.";
  const characters = (promptPackage.assets || []).filter((asset) => asset.role === "gameCharacter");
  const bosses = (promptPackage.assets || []).filter((asset) => asset.role === "prop" && /\bBOSS\b|boss|首领|魔王|怪物|怪兽|敌人|宝箱怪/i.test(asset.label || asset.description || ""));
  const logos = (promptPackage.assets || []).filter((asset) => asset.role === "gameLogo");
  const sloganTargets = Object.entries(promptPackage.slogans || {})
    .map(([language, slogan]) => `${language}: ${slogan}`)
    .join("\n");
  const referenceMap = [
    characters.length > 0
      ? [
        `Exact playable roster count: ${characters.length}. Render every listed uploaded protagonist as a playable hero: ${characters.map((asset, index) => asset.placeholder || `[Game Character ${index + 1}]`).join(", ")}.`,
        characters.length === 1
          ? "Single-character lock: if any scheme text says squad/team/heroes, reinterpret that as only [Game Character 1]. Do not add any other human helper, teammate, or replacement protagonist."
          : "Multi-character lock: all uploaded characters must be visible as separate readable characters; do not merge, average, omit, hide, recolor, or swap traits.",
      ].join(" ")
      : "",
    bosses.length > 0 ? "Boss lock: [Boss] means the uploaded BOSS/key-subject reference; render exactly one BOSS unless explicitly requested otherwise." : "",
    logos.length > 0 ? "Logo lock: [Game Logo] means the uploaded gameLogo reference; place it once and do not redraw a different wordmark." : "",
  ].filter(Boolean).join("\n");
  const sloganPriorityBlock = integratedSloganPriorityBlock(sloganTargets);
  return joinPromptBlocksWithinLimit({
    criticalBlocks: [
    "## Integrated Game Campaign KV Task",
    "Generate the final unified premium game campaign key visual as one coherent illustration.",
    "Use uploaded image references as binding identity/model-sheet anchors, not as static stickers. Characters and BOSS may change pose, expression, action, camera angle, lighting, and perspective to become vivid in-world actors.",
    referenceMap ? `## Exact Uploaded Reference Map\n${referenceMap}` : "",
    characters.length > 1 ? "Multi-character hero requirement: every uploaded protagonist anchor must appear as a separate readable in-world character. Do not omit the second character, merge them, hide one behind a prop/plate, or reduce one to a tiny decoration." : "",
    "ABSOLUTE HIGHEST PRIORITY - REFERENCE IDENTITY AND BLENDING: replicate the exact visual identity from the uploaded references while integrating them into the new scene's lighting. Preserve character face shape, hair colors, costume palette, body proportions, signature prop/tool, line weight, BOSS silhouette, crown, eye, teeth, tongue, mouth, color blocks, and uploaded game logo design.",
    "Reference identity may only be reposed or re-lit. Do not age-up, add beard/mustache, change hairstyle or hair color, change costume, change body type/proportions, change species, or replace a chibi/mascot reference with a generic adult character.",
    posterIdentitySafeMotionRule(),
    "Reference pose release: identity lock does not mean copying the exact uploaded front-facing/static pose. Repaint each uploaded hero/BOSS as a living actor with at least one visible performance change: 3/4 turn, stride, leap, recoil, attack wind-up, defensive block, grip/contact with a prop, landing dust, squash/stretch, or foreshortened limb/tool angle.",
    "BOSS performance lock: the uploaded BOSS/key threat must not read as a scaled-up sticker in the same standing pose. Stage it lunging, bracing, swinging, bursting through the set, landing with dust, or reacting to impact while preserving its silhouette and signature details.",
    posterFocalHierarchyLock(),
    posterHeroPerformanceScaleLock(),
    posterSubjectAccessoryStrictnessLock(),
    posterTextEconomyLock(),
    posterInWorldBrandTreatmentLock(),
    staticSchemeActionRewriteRule(),
    "Do not give uploaded characters new weapons, armor, swords, shields, adult facial structures, noses, beards, mustaches, or costume variants unless those details are clearly present in the reference image.",
    "If the scheme prompt uses placeholders such as [Game Character 1], [Game Character 2], [Boss], or [Game Logo], replace those placeholders with the corresponding uploaded visual references. Do not describe or invent their physical appearance from text.",
    "The uploaded subjects must look repainted into the same scene, not pasted on top: apply environmental color grading, rim light, contact shadows, bounce light, atmospheric perspective, partial foreground occlusion, and VFX overlap across their bodies.",
    "Contact and occlusion audit: every place an uploaded hero, BOSS, prop, or logo treatment touches another object must show overlap edge, contact shadow, cast shadow, bounce color, and local material reaction. No clean cutout silhouettes floating above the scene.",
    styleRule,
    characters.length > 1
      ? "The poster must show a concrete story moment where all uploaded heroes are visible as separate actors in action against the uploaded BOSS/key subject, with readable intent, movement, pressure, and environmental reaction."
      : "The poster must show a concrete story moment: uploaded heroes in action against the uploaded BOSS/key subject, with readable intent, movement, pressure, and environmental reaction.",
    "Design with cinematic composition, strong depth, dramatic lighting, polished color grading, foreground/midground/background separation, and a clear trailer-moment focal hierarchy built around protagonist action, objective pressure, environmental pressure, or BOSS threat.",
    "Art-direction checklist for the final render: visible camera/lens/perspective choice, foreground framing, midground action, background reveal, key/fill/rim lighting, volumetric haze, particles/VFX, cast/contact shadows, color/value grouping, material texture, and in-world logo/typography integration.",
    "Set-piece and action requirement: build a memorable physical campaign location from the current project and connect at least one uploaded hero to the BOSS or environment through blocking, climbing, striking, sliding, casting, repairing, piloting, pulling, defending, or impact. Avoid empty pastel sky, generic backdrops, unrelated sample-project scenes, centered mascot-ad layouts, and symmetrical floating heroes.",
    "Subject scale and weight requirement: the uploaded BOSS/key threat must feel physically planted or forcefully airborne with a clear landing/impact path, not a mascot sticker. The uploaded hero must have a readable support surface, grip, impact point, or motion trail with a cast shadow.",
    "Cinematic escalation must come from the scene design: asymmetrical low-angle or forced-perspective camera, one dominant diagonal action path, foreground occlusion, practical light source, rim/back light, volumetric beams, dust, smoke, sparks, embers, magic/tech particles, debris, and visible environmental reaction. Do not solve cinematic quality by making the uploaded characters into different, more realistic people.",
    "Place the uploaded game logo once in a readable campaign-safe area. Integrate the slogan as custom game-poster lettering or an in-world sign/ribbon, with correct spelling when possible.",
    posterLogoSingleUseLock(),
    "Use each uploaded character and BOSS once. Do not omit uploaded protagonists, create duplicate large/small copies, alternate replacement characters, or extra generic heroes.",
    ],
    flexibleBlocks: [
      { text: sectionText, maxChars: 3200, minChars: 900 },
      { text: posterCinematicKvQualityDirective(), maxChars: 2200, minChars: 700 },
    ],
    closingBlocks: [
    sloganPriorityBlock,
    "Allocate one readable campaign-safe logo treatment when uploaded logo/brand assets are present.",
    posterLogoSingleUseLock(),
    posterFocalHierarchyLock(),
    posterTextEconomyLock(),
    posterInWorldBrandTreatmentLock(),
    "Logo copy safety lock: do not invent look-alike words, substitute letters, or create alternate fake logo text. Use the uploaded logo exactly only when readable, otherwise reserve a polished blank logo-safe treatment.",
    posterHeroPerformanceScaleLock(),
    "BOSS performance lock: the uploaded BOSS/key threat must not read as a scaled-up sticker in the same standing pose. Stage it lunging, bracing, swinging, bursting through the set, landing with dust, or reacting to impact while preserving its silhouette and signature details.",
    posterSubjectAccessoryStrictnessLock(),
    "Scenario uniqueness lock: do not collapse this render into the default boss-versus-hero standoff if the selected scheme implies chase, discovery, defense, objective crisis, resource raid, route escort, victory payoff, town chaos, or expedition. The location family, camera grammar, mission objective, BOSS role, and emotional beat must match the selected scheme rather than a reused confrontation template.",
    "Subject scale and weight requirement: the uploaded BOSS/key threat must feel physically planted or forcefully airborne with a clear landing/impact path, not a mascot sticker. The uploaded hero must have a readable support surface, grip, impact point, or motion trail with a cast shadow.",
    "Set-piece and action requirement: connect at least one uploaded hero to the BOSS or environment through blocking, climbing, striking, sliding, casting, repairing, piloting, pulling, defending, or visible impact.",
    "Placeholder annotation rule: any written appearance, species, clothing, weapon, logo-lettering, color, or anatomy description attached to a placeholder is non-binding unless it is visibly present in the uploaded reference.",
    "Scheme text sanitation rule: if selected scheme text names a placeholder's clothing, face, body, weapon, shield, logo lettering, or other appearance details, treat those words as non-binding staging notes only. The uploaded image reference remains the only source of truth for visual identity.",
    "Contact and occlusion audit: every place an uploaded hero, BOSS, prop, or logo treatment touches another object must show overlap edge, contact shadow, cast shadow, bounce color, and local material reaction. No clean cutout silhouettes floating above the scene.",
    "The uploaded subjects and brand elements must look repainted into the same scene with environmental color grading, rim light, contact shadows, bounce light, atmospheric perspective, foreground occlusion, material interaction, and VFX overlap.",
    staticSchemeActionRewriteRule(),
    "Focus guidance handling: user focus guidance is only a creative emphasis. It must not override uploaded asset identity, readable story conflict, or production-quality composition. If the focus says giant scale or micro perspective, translate that into scale drama and camera energy without reducing the poster to a flat side-view scene. When focus guidance is active, visibly translate at least one focus item into camera, action, environment, prop, lighting, or copy-area design.",
    "Use a deliberate campaign composition architecture, not a default side-scrolling battlefield. Favor one of these KV structures when it fits the scheme: dynamic split-world contrast, portal/breach reveal, foreground weapon/prop divider, boss reveal framed by doorway/canyon, comic-panel mission montage, or triumphant hero-on-defeated-boss trophy shot.",
    "Use the full requested canvas as artwork. Do not add black bars, letterbox bands, white borders, frames, UI chrome, or presentation margins.",
    "Show the story through character action and environment response: impact glow, energy arcs, dust, debris, sparks, magic/tech trails, weather, motion trails, atmospheric haze, rim-light pockets, foreground framing, and scale cues.",
    "World-building direction: turn the current project premise into a fantasy, tactical, adventure, simulation, or action battlefield with illustrated terrain and playable depth. Do not introduce scenery from an unrelated sample project.",
    "## Hard KV Exclusions",
    "No duplicate uploaded asset. No generic replacement hero. No extra random protagonist. No sticker collage. No unchanged front-facing cutout look. No flat tabletop wallpaper. No empty pastel sky. No centered mascot-ad layout. No symmetrical floating corner heroes. No photorealistic product macro photography. No unrelated commercial render unless explicitly requested. No black bars. No letterbox. No border frame.",
    "## Mode Guardrails",
    guardrails,
    ],
  });
}

function providerAssetReferencesFromPromptPackage(promptPackage, snapshot) {
  const roleCounters = new Map();
  return (promptPackage.assets || []).map((binding) => {
    const assetId = binding.assetId || binding.id;
    const asset = (snapshot.assets || []).find((item) => item.id === assetId);
    const roleIndex = (roleCounters.get(binding.role) || 0) + 1;
    roleCounters.set(binding.role, roleIndex);
    const url = binding.url || asset?.providerUrl || asset?.previewUrl || asset?.url || asset?.assetUrl || null;
    return {
      id: assetId,
      role: binding.role,
      ...(binding.mimeType || asset?.mimeType ? { mimeType: binding.mimeType || asset?.mimeType } : {}),
      ...(isSafeProviderUrl(url) ? { url } : {}),
      description: [
        binding.label || asset?.label || assetId,
        `binding=${binding.binding || "subjectReference"}`,
        binding.required ? "required" : "optional",
        ["gameCharacter", "collabCharacter"].includes(binding.role) ? `independentCharacterIndex=${roleIndex}` : "",
        binding.storageKey || asset?.storageKey ? `storageKey=${binding.storageKey || asset?.storageKey}` : "",
        isSafeProviderUrl(url) ? "providerReady=true" : "providerReady=false",
      ].filter(Boolean).join("; "),
    };
  });
}

function mapProviderRequestPayload(payload) {
  const kind = payload.kind || (payload.promptPackage.target === "brief" ? "briefGeneration" : "imageGeneration");
  const model = payload.model || resolveModel(payload.snapshot, payload.providerId, kind === "imageGeneration" ? "image" : "concept");
  const base = {
    kind,
    providerId: payload.providerId,
    model,
    promptPackageId: payload.promptPackage.id,
  };

  if (kind === "briefGeneration") {
    const modeState = findModeState(payload.snapshot, payload.promptPackage.mode);
    const schemeCount = Math.max(1, Math.min(20,
      modeState?.selectedSchemeIds?.length || modeState?.outputSettings.schemeCount || 1,
    ));
    return {
      ...base,
      request: {
        context: {
          projectId: payload.promptPackage.projectId,
          mode: payload.promptPackage.mode,
          providerId: payload.providerId,
          traceId: payload.traceId,
        },
        projectName: payload.snapshot.project.name,
        gameDescription: payload.snapshot.project.description,
        creativeDirection: creativeDirectionFromPromptPackage(payload.promptPackage),
        assets: providerAssetReferencesFromPromptPackage(payload.promptPackage, payload.snapshot),
        guardrails: payload.promptPackage.guardrails,
        languageTargets: [selectedSloganLanguage(payload.snapshot, payload.promptPackage.mode)],
        schemeCount,
      },
    };
  }

  if (!payload.promptPackage.schemeId) throw new Error("Image generation requests require a scheme id.");
  return {
    ...base,
    request: {
      context: {
        projectId: payload.promptPackage.projectId,
        mode: payload.promptPackage.mode,
        providerId: payload.providerId,
        traceId: payload.traceId,
      },
      schemeId: payload.promptPackage.schemeId,
      prompt: payload.promptPackage.mode === "poster"
        ? posterIntegratedKvPromptFromPromptPackage(payload.promptPackage)
        : payload.promptPackage.finalPrompt,
      assets: providerAssetReferencesFromPromptPackage(payload.promptPackage, payload.snapshot),
      platformPreset: payload.promptPackage.platform.platformPreset,
      aspectRatio: payload.promptPackage.platform.aspectRatio,
      width: payload.promptPackage.platform.width,
      height: payload.promptPackage.platform.height,
      model,
      count: payload.count || 1,
    },
  };
}

function estimateTaskCost(kind, count = 1) {
  if (kind === "briefGeneration") return 0.02;
  if (kind === "imageGeneration") return 0.05 * Math.max(1, count);
  if (kind === "imageEdit") return 0.04 * Math.max(1, count);
  if (kind === "upscale") return 0.02 * Math.max(1, count);
  if (kind === "backgroundRemoval") return 0.02 * Math.max(1, count);
  return 0;
}

function createQueueTask({
  id,
  jobId,
  kind,
  mode,
  providerId,
  model = null,
  schemeId = null,
  dependsOn = [],
  count = 1,
  platformPreset = null,
  aspectRatio = null,
  width = null,
	  height = null,
	  schemeIds = null,
	  sourceResultId = null,
	  editInstruction = null,
	}) {
  const providerCapability = ["briefGeneration", "imageGeneration", "imageEdit", "upscale", "backgroundRemoval"].includes(kind)
    ? kind
    : null;
  return {
    id,
    jobId,
    parentTaskId: null,
    dependsOn,
    kind,
    status: dependsOn.length ? "blocked" : "queued",
    stage: dependsOn.length ? "waitingDependency" : "planning",
    providerId: providerCapability ? providerId : undefined,
    providerCapability: providerCapability || undefined,
    mode,
    attempts: 0,
    maxAttempts: 2,
    progress: 0,
    input: {
      ...(schemeId ? { schemeId } : {}),
      ...(Array.isArray(schemeIds) && schemeIds.length ? { schemeIds } : {}),
      ...(platformPreset ? { platformPreset } : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(width ? { width } : {}),
	      ...(height ? { height } : {}),
	      ...(sourceResultId ? { sourceResultId } : {}),
	      ...(editInstruction ? { editInstruction } : {}),
	      ...(model ? { model } : {}),
	      count,
    },
    output: { providerResultIds: [], metadata: {} },
    error: null,
    cost: { estimatedCost: providerCapability ? estimateTaskCost(kind, count) : 0, actualCost: null, currency: "USD" },
    elapsedMs: 0,
  };
}

function summarizeQueue(queuePlan) {
  const total = queuePlan.tasks.length;
  const completed = queuePlan.tasks.filter((task) => task.status === "succeeded").length;
  const failed = queuePlan.tasks.filter((task) => task.status === "failed").length;
  const running = queuePlan.tasks.filter((task) => task.status === "running").length;
  const queued = queuePlan.tasks.filter((task) => task.status === "queued" || task.status === "blocked").length;
  const cancelled = queuePlan.tasks.filter((task) => task.status === "cancelled").length;
  return {
    jobId: queuePlan.job.id,
    total,
    queued,
    running,
    completed,
    failed,
    cancelled,
    progress: total === 0 ? 0 : Math.round((completed / total) * 100),
    estimatedCost: queuePlan.tasks.reduce((sum, task) => sum + task.cost.estimatedCost, 0),
    actualCost: null,
    elapsedMs: 0,
  };
}

function createQueuePlanPayload(payload) {
  const createdAt = nowIso();
  const batchId = String(payload.batchId || Date.now().toString(36)).replace(/[^a-zA-Z0-9_-]+/g, "-");
  const jobId = `job-${payload.mode}-${payload.projectId}-${batchId}`;
  const tasks = [];
  const events = [{
    id: `event-${jobId}-jobCreated-job`,
    jobId,
    type: "jobCreated",
    message: `Created ${payload.mode} static queue.`,
    createdAt,
  }];
  const job = {
    id: jobId,
    projectId: payload.projectId,
    mode: payload.mode,
    providerId: providerRouteForPayload(payload, "concept").providerId,
    status: "queued",
    title: `${payload.mode} batch production`,
    retryPolicy: { maxAttempts: 2, backoffMs: 1000, retryableErrorCodes: ["provider_unavailable", "rate_limited", "unknown"] },
    createdAt,
    updatedAt: createdAt,
  };
  const modeState = payload.snapshot?.modeStates?.find((item) => item.mode === payload.mode);
  const fallbackRatios = modeState?.outputSettings?.aspectRatios || ["1:1"];
  const fallbackPresets = modeState?.outputSettings?.platformPresets || ["custom"];
	  const aspectRatios = payload.aspectRatios?.length ? payload.aspectRatios : fallbackRatios;
	  const platformPresets = payload.platformPresets?.length ? payload.platformPresets : fallbackPresets;
	  const customSize = payload.customSize || modeState?.outputSettings?.customSize || null;
	  const operationOnly = Boolean(payload.sourceResultId && (payload.includeImageEdit || payload.includeUpscale || payload.includeBackgroundRemoval));

	  const briefTask = operationOnly || payload.regenerateSchemes === false
	    ? null
    : createQueueTask({
        id: `${jobId}-brief`,
        jobId,
        kind: "briefGeneration",
        mode: payload.mode,
        providerId: providerRouteForPayload(payload, "concept").providerId,
        model: providerRouteForPayload(payload, "concept").model || "concept",
        schemeIds: payload.schemeIds,
      });
  if (briefTask) tasks.push(briefTask);

  payload.schemeIds.forEach((schemeId, index) => {
    const rawRatio = aspectRatios[index % aspectRatios.length] || "1:1";
    const size = customSize || inferSize(rawRatio);
    const aspectRatio = customSize ? `${customSize.width}x${customSize.height}` : rawRatio;
    const platformPreset = platformPresets[index % platformPresets.length] || "custom";
	    const imageTask = operationOnly || payload.includeImageGeneration === false
	      ? null
      : createQueueTask({
      id: `${jobId}-image-${index + 1}`,
      jobId,
      kind: "imageGeneration",
      mode: payload.mode,
      providerId: providerRouteForPayload(payload, "image").providerId,
      schemeId,
      dependsOn: briefTask ? [briefTask.id] : [],
      count: payload.imagesPerScheme || 1,
      platformPreset,
      aspectRatio,
      width: size.width,
      height: size.height,
      model: providerRouteForPayload(payload, "image").model || "image",
    });
    if (imageTask) tasks.push(imageTask);

    [
      ["imageEdit", payload.includeImageEdit],
      ["upscale", payload.includeUpscale],
      ["backgroundRemoval", payload.includeBackgroundRemoval],
    ].forEach(([kind, enabled]) => {
      if (!enabled) return;
      tasks.push(createQueueTask({
        id: `${jobId}-${kind}-${index + 1}`,
        jobId,
        kind,
        mode: payload.mode,
        providerId: providerRouteForPayload(payload, kind).providerId,
        schemeId,
        dependsOn: imageTask ? [imageTask.id] : [],
        platformPreset,
        aspectRatio,
	        width: size.width,
	        height: size.height,
	        sourceResultId: payload.sourceResultId || `result-${schemeId}`,
	        editInstruction: kind === "imageEdit" ? payload.editInstruction : null,
	        model: providerRouteForPayload(payload, kind).model || kind,
	      }));
    });
  });

  tasks.push(createQueueTask({
    id: `${jobId}-archive`,
    jobId,
    kind: "archiveSync",
    mode: payload.mode,
    providerId: job.providerId,
    dependsOn: tasks.map((task) => task.id),
  }));

  return { job, tasks, events };
}

function providerRouteForPayload(payload, slot) {
  const route = payload.providerRoutes?.[slot] || {};
  return {
    providerId: route.providerId || payload.providerId || "openai",
    model: route.model || "",
  };
}

export function createStaticLocalApiService() {
  return {
    async saveWorkspaceSnapshot(request) {
      try {
        if (!request?.snapshot?.metadata?.workspaceId) {
          return failure("validation_error", "Workspace snapshot is required.", {
            fieldErrors: { snapshot: ["Missing workspace snapshot."] },
          });
        }
        return success({ summary: summarizeWorkspaceSnapshot(request.snapshot) }, request.snapshot);
      } catch (error) {
        return failure("internal", error.message || "Failed to save workspace snapshot.", { snapshot: request?.snapshot });
      }
    },

    async createPromptPackage(request) {
      try {
        if (!request?.snapshot) {
          return failure("validation_error", "Prompt package request requires a snapshot.", {
            fieldErrors: { snapshot: ["Missing workspace snapshot."] },
          });
        }
        const promptPackage = buildPromptPackage(request);
        return success({ promptPackage }, request.snapshot);
      } catch (error) {
        return failure("validation_error", error.message || "Failed to create prompt package.", { snapshot: request?.snapshot });
      }
    },

    async mapProviderRequest(request) {
      try {
        if (!request?.promptPackage || !request?.snapshot || !request?.providerId) {
          return failure("validation_error", "Provider request mapping requires prompt package, snapshot, and provider id.", {
            fieldErrors: { request: ["Missing provider mapping input."] },
            snapshot: request?.snapshot,
          });
        }
        const mappedRequest = mapProviderRequestPayload(request);
        return success({ mappedRequest }, request.snapshot);
      } catch (error) {
        return failure("validation_error", error.message || "Failed to map provider request.", { snapshot: request?.snapshot });
      }
    },

    async createQueuePlan(request) {
      try {
        const fieldErrors = {};
        if (!request?.projectId) fieldErrors.projectId = ["Project id is required."];
        if (!request?.mode) fieldErrors.mode = ["Mode is required."];
        if (!Array.isArray(request?.schemeIds) || request.schemeIds.length === 0) {
          fieldErrors.schemeIds = ["At least one scheme id is required."];
        }
        if (Object.keys(fieldErrors).length > 0) {
          return failure("validation_error", "Queue plan request validation failed.", { fieldErrors });
        }
        const capabilityGate = evaluateQueuePlanCapabilityGate(request);
        if (!capabilityGate.ok) {
          return failure("unsupported_capability", providerCapabilityGateUserMessage(capabilityGate), {
            details: { capabilityGate },
            snapshot: request?.snapshot,
          });
        }
        const queuePlan = createQueuePlanPayload(request);
        return success({ queuePlan, summary: summarizeQueue(queuePlan) });
      } catch (error) {
        return failure("internal", error.message || "Failed to create queue plan.");
      }
    },
  };
}

export async function runStaticGenerationServiceFlow(submission) {
  const service = createStaticLocalApiService();
  const snapshot = submission.promptPackageCreate.payload.snapshot;
  const savedSnapshot = await service.saveWorkspaceSnapshot({ snapshot });
  const promptPackageCreate = savedSnapshot.ok
    ? await service.createPromptPackage(submission.promptPackageCreate.payload)
    : savedSnapshot;
  const providerRequestMap = promptPackageCreate.ok
    ? await service.mapProviderRequest({
      promptPackage: promptPackageCreate.data.promptPackage,
      snapshot,
      providerId: promptPackageCreate.data.promptPackage.target === "brief"
        ? submission.providerRoutes?.concept?.providerId || submission.providerId
        : submission.providerRoutes?.image?.providerId || submission.providerId,
      model: promptPackageCreate.data.promptPackage.target === "brief"
        ? submission.providerRoutes?.concept?.model
        : submission.providerRoutes?.image?.model,
      kind: promptPackageCreate.data.promptPackage.target === "brief" ? "briefGeneration" : "imageGeneration",
      count: submission.queuePlanCreate.payload.imagesPerScheme,
      traceId: submission.traceId,
    })
    : promptPackageCreate;
  const queuePlanCreate = providerRequestMap.ok
    ? await service.createQueuePlan(submission.queuePlanCreate.payload)
    : providerRequestMap;

  return {
    ok: savedSnapshot.ok && promptPackageCreate.ok && providerRequestMap.ok && queuePlanCreate.ok,
    savedSnapshot,
    promptPackageCreate,
    providerRequestMap,
    queuePlanCreate,
  };
}
