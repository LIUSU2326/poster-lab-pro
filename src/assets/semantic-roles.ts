import type { ProductionMode } from "../schema/zod";

export type AssetSemanticRole =
  | "protagonist"
  | "antagonist"
  | "brandLogo"
  | "prop"
  | "environment"
  | "styleReference"
  | "compositionReference"
  | "keySubject"
  | "supportingAsset";

export type AssetSemanticInput = {
  role: string;
  label?: string | null | undefined;
  description?: string | null | undefined;
  binding?: string | null | undefined;
  placeholder?: string | null | undefined;
};

export type AssetFusionOptions = {
  mode?: ProductionMode;
};

export type PosterAssetSemanticRole = AssetSemanticRole;
export type PosterAssetSemanticInput = AssetSemanticInput;

const BOSS_REFERENCE_RE = /\bBOSS\b|boss|antagonist|enemy|monster|creature|villain|首领|魔王|怪物|怪兽|敌人|宝箱怪/i;
const HERO_REFERENCE_RE = /\bhero\b|protagonist|playable|player|character|mascot|avatar|chef|主角|角色|人物|英雄|玩家|厨师/i;
const LOGO_REFERENCE_RE = /\blogo\b|wordmark|brand mark|brandmark|logotype|标志|商标|字标/i;
const PROP_REFERENCE_RE = /\bprop\b|weapon|item|tool|ingredient|object|道具|武器|物品|工具|食材/i;
const ENVIRONMENT_REFERENCE_RE = /\bbackground\b|scene|environment|level|map|world|landscape|setting|背景|场景|环境|地图|关卡/i;
const STYLE_REFERENCE_RE = /\bstyle\b|palette|rendering|finish|moodboard|画风|风格|色板|渲染/i;
const COMPOSITION_REFERENCE_RE = /\bcomposition\b|layout|framing|camera|构图|布局|版式|镜头/i;

function searchableText(asset: AssetSemanticInput): string {
  return [
    asset.role,
    asset.label || "",
    asset.description || "",
    asset.binding || "",
    asset.placeholder || "",
  ].join(" ");
}

export function isBossLikeAsset(asset: AssetSemanticInput): boolean {
  return BOSS_REFERENCE_RE.test(searchableText(asset));
}

export function isPosterBossLikeAsset(asset: PosterAssetSemanticInput): boolean {
  return isBossLikeAsset(asset);
}

export function assetSemanticRole(asset: AssetSemanticInput): AssetSemanticRole {
  const role = asset.role;
  const binding = asset.binding || "";
  const text = searchableText(asset);

  if (role === "styleReference" || binding === "styleReference" || STYLE_REFERENCE_RE.test(text)) return "styleReference";
  if (role === "compositionReference" || binding === "compositionReference" || COMPOSITION_REFERENCE_RE.test(text)) {
    return "compositionReference";
  }
  if (role === "gameLogo" || role === "brandLogo" || binding === "logoLock" || LOGO_REFERENCE_RE.test(text)) {
    return "brandLogo";
  }
  if (role === "gameCharacter" || role === "collabCharacter" || binding === "identityLock" || HERO_REFERENCE_RE.test(text)) {
    return isBossLikeAsset(asset) ? "antagonist" : "protagonist";
  }
  if (isBossLikeAsset(asset)) return "antagonist";
  if (role === "background" || binding === "backgroundReference" || ENVIRONMENT_REFERENCE_RE.test(text)) return "environment";
  if (role === "prop" || PROP_REFERENCE_RE.test(text)) return "prop";
  if (role === "subjectReference" || binding === "subjectReference") return "keySubject";
  return "supportingAsset";
}

export function posterAssetSemanticRole(asset: PosterAssetSemanticInput): PosterAssetSemanticRole {
  return assetSemanticRole(asset);
}

export function isIdentityAsset(asset: AssetSemanticInput): boolean {
  const semanticRole = assetSemanticRole(asset);
  return semanticRole === "protagonist" || semanticRole === "antagonist" || semanticRole === "keySubject";
}

export function isPosterIdentityAsset(asset: PosterAssetSemanticInput): boolean {
  return isIdentityAsset(asset);
}

export function isIntegratedReferenceAsset(asset: AssetSemanticInput): boolean {
  const semanticRole = assetSemanticRole(asset);
  return semanticRole !== "styleReference" && semanticRole !== "compositionReference";
}

export function isPosterIntegratedReferenceAsset(asset: PosterAssetSemanticInput): boolean {
  return isIntegratedReferenceAsset(asset);
}

export function assetSemanticTitle(role: AssetSemanticRole): string {
  const titles: Record<AssetSemanticRole, string> = {
    protagonist: "playable protagonist / hero identity",
    antagonist: "antagonist / BOSS threat",
    brandLogo: "brand logo / wordmark",
    prop: "story prop / item",
    environment: "environment / world reference",
    styleReference: "style reference",
    compositionReference: "composition reference",
    keySubject: "key subject",
    supportingAsset: "supporting visual asset",
  };
  return titles[role];
}

export function posterAssetSemanticTitle(role: PosterAssetSemanticRole): string {
  return assetSemanticTitle(role);
}

function posterFusionStrategy(role: AssetSemanticRole): string {
  switch (role) {
    case "protagonist":
      return "preserve face, hair, costume, proportions, palette, line quality, and signature props; redraw as a living in-world actor with a new line of action instead of the exact front-facing reference pose, using changed pose/expression/camera/lighting, clear foot/hand contact points, cast/contact shadows, rim light, foreground occlusion, and VFX overlap";
    case "antagonist":
      return "preserve silhouette and key threat features; redraw as a dominant in-world enemy with scale, weight, attack/recoil/lunge intent instead of the exact static reference pose, planted contact points or clear airborne impact path, cast/contact shadows, atmospheric depth, debris, impact overlap, and environmental reaction";
    case "brandLogo":
      return "preserve the real mark/wordmark only when the model can keep its letterforms accurate; otherwise reserve a polished blank logo-safe sign/title plate that echoes the brand colors and shape language without fake text";
    case "prop":
      return "preserve recognizable shape/colors; let characters hold, use, chase, defend, foreground, or trigger it so it becomes part of the story action";
    case "environment":
      return "use as world, material, mood, and location reference; reinterpret into the poster set piece instead of copying pixels literally";
    case "styleReference":
      return "use primarily for rendering style, palette, material finish, lighting, and brush/line quality across the whole image";
    case "compositionReference":
      return "use only for layout, camera, subject scale, safe areas, and visual flow; do not copy style or content unless separately requested";
    case "keySubject":
      return "preserve major identity, silhouette, face/marking details, and colors; redraw as an integrated main subject with scene lighting and interaction";
    case "supportingAsset":
      return "infer its poster duty from label and context; integrate naturally with matching lighting, perspective, shadows, and art direction";
  }
}

function iconFusionStrategy(role: AssetSemanticRole): string {
  switch (role) {
    case "brandLogo":
      return "use as brand style or mark reference only when it can stay clean at small sizes; do not render logo text in icon mode unless it is a simple non-letter symbol";
    case "styleReference":
      return "control icon rendering style, palette, material finish, and edge treatment";
    case "compositionReference":
      return "control square icon framing, subject scale, and silhouette balance only";
    case "prop":
    case "keySubject":
    case "protagonist":
    case "antagonist":
      return "preserve the subject identity and simplify it into one bold app/game icon silhouette with high contrast, minimal background, no text, and readable form at 64px";
    case "environment":
    case "supportingAsset":
      return "use only as secondary mood, palette, or simple shape support; never clutter the icon or compete with the single main subject";
  }
}

function logoFusionStrategy(role: AssetSemanticRole): string {
  switch (role) {
    case "brandLogo":
      return "use as brand continuity, lettering rhythm, color, and silhouette reference; prioritize readable wordmark construction and avoid fake replacement text when exact spelling cannot be controlled";
    case "prop":
    case "keySubject":
      return "extract symbolic shapes, materials, or motifs into the logo mark or badge while keeping the wordmark primary";
    case "styleReference":
      return "guide bevels, materials, lighting, palette, and finish for the logo system";
    case "compositionReference":
      return "guide lockup balance and clear space only, not scene content";
    case "protagonist":
    case "antagonist":
    case "environment":
    case "supportingAsset":
      return "use as secondary brand-world motif only; do not turn logo mode into a character scene or poster";
  }
}

function announcementFusionStrategy(role: AssetSemanticRole): string {
  switch (role) {
    case "brandLogo":
      return "place as a clean brand lockup or UI panel mark without fake text or clutter";
    case "protagonist":
    case "antagonist":
    case "keySubject":
      return "preserve identity while staging as a guide, presenter, event subject, or supporting visual around the announcement surface; do not cover the readable title/copy zone";
    case "environment":
      return "use as event/world backdrop or in-game UI panel material while maintaining strong text safety";
    case "styleReference":
      return "guide overall UI/event rendering style and color mood";
    case "compositionReference":
      return "guide panel layout, copy safe area, and subject grouping only";
    case "prop":
    case "supportingAsset":
      return "use as event ornament or story cue only if it supports the announcement hierarchy";
  }
}

function collabFusionStrategy(role: AssetSemanticRole): string {
  switch (role) {
    case "brandLogo":
      return "keep each brand/logo identity separate but visually unified through shared lighting, materials, framing, and scene context; do not merge two logos into one fake mark";
    case "protagonist":
    case "antagonist":
    case "keySubject":
      return "preserve each uploaded identity as a separate entity with a clear relationship or interaction; do not merge, average, swap traits, or create a hybrid";
    case "prop":
    case "environment":
    case "supportingAsset":
      return "use as shared-world bridge, event prop, or environment cue that connects the two sides without overwhelming either identity";
    case "styleReference":
      return "guide the unified collaboration rendering style while preserving each IP identity";
    case "compositionReference":
      return "guide dual-subject balance, logo spacing, and interaction layout only";
  }
}

export function assetFusionStrategy(asset: AssetSemanticInput, options: AssetFusionOptions = {}): string {
  const semanticRole = assetSemanticRole(asset);
  switch (options.mode) {
    case "icon":
      return iconFusionStrategy(semanticRole);
    case "logo":
      return logoFusionStrategy(semanticRole);
    case "announcement":
      return announcementFusionStrategy(semanticRole);
    case "collab":
      return collabFusionStrategy(semanticRole);
    case "poster":
    default:
      return posterFusionStrategy(semanticRole);
  }
}

export function posterAssetFusionStrategy(asset: PosterAssetSemanticInput): string {
  return assetFusionStrategy(asset, { mode: "poster" });
}

export function assetCompactConstraint(asset: AssetSemanticInput, options: AssetFusionOptions = {}): string {
  const semanticRole = assetSemanticRole(asset);
  if (options.mode === "icon") {
    if (semanticRole === "styleReference") return "style reference; control icon finish";
    if (semanticRole === "compositionReference") return "composition reference; square framing only";
    return "icon identity reference; redraw as one bold text-free small-size-readable subject";
  }
  if (options.mode === "logo") {
    if (semanticRole === "brandLogo") return "brand/wordmark reference; preserve readable brand rhythm or reserve copy-safe fallback";
    return "logo motif reference; influence mark shape/material without becoming a scene";
  }
  if (options.mode === "announcement") {
    return `${assetSemanticTitle(semanticRole)}; support readable announcement hierarchy and text-safe layout`;
  }
  if (options.mode === "collab") {
    return `${assetSemanticTitle(semanticRole)}; keep identities separate and scene-unified`;
  }

  switch (semanticRole) {
    case "protagonist":
      return "identity reference; redraw dynamically as integrated hero, not sticker";
    case "antagonist":
      return "BOSS/threat reference; redraw as dominant integrated enemy";
    case "brandLogo":
      return "logo/wordmark reference; use accurately in-world or reserve blank logo-safe treatment";
    case "prop":
      return "prop/item reference; make it part of action";
    case "environment":
      return "scene/world reference; reinterpret as environment";
    case "styleReference":
      return "highest-priority style/palette/rendering reference";
    case "compositionReference":
      return "composition/camera/safe-area reference only";
    case "keySubject":
      return "key subject reference; preserve identity while integrating";
    case "supportingAsset":
      return "supporting visual reference; integrate by inferred duty";
  }
}

export function posterAssetCompactConstraint(asset: PosterAssetSemanticInput): string {
  return assetCompactConstraint(asset, { mode: "poster" });
}

export function assetReferenceName(asset: AssetSemanticInput, semanticIndex: number): string {
  if (asset.placeholder) return asset.placeholder;
  const semanticRole = assetSemanticRole(asset);
  switch (semanticRole) {
    case "protagonist":
      return `[Game Character ${semanticIndex}]`;
    case "antagonist":
      return semanticIndex === 1 ? "[Boss]" : `[Boss ${semanticIndex}]`;
    case "brandLogo":
      return asset.role === "brandLogo" ? "[Brand Logo]" : "[Game Logo]";
    case "prop":
      return `[Prop ${semanticIndex}]`;
    case "environment":
      return `[Environment Reference ${semanticIndex}]`;
    case "styleReference":
      return `[Style Reference ${semanticIndex}]`;
    case "compositionReference":
      return `[Composition Reference ${semanticIndex}]`;
    case "keySubject":
      return `[Key Subject ${semanticIndex}]`;
    case "supportingAsset":
      return `[Supporting Asset ${semanticIndex}]`;
  }
}

export function posterAssetReferenceName(asset: PosterAssetSemanticInput, semanticIndex: number): string {
  return assetReferenceName(asset, semanticIndex);
}

export function assetSemanticInventory(assets: AssetSemanticInput[], options: AssetFusionOptions = {}): string {
  const semanticCounters = new Map<AssetSemanticRole, number>();
  return assets.map((asset) => {
    const semanticRole = assetSemanticRole(asset);
    const nextIndex = (semanticCounters.get(semanticRole) || 0) + 1;
    semanticCounters.set(semanticRole, nextIndex);
    const name = assetReferenceName(asset, nextIndex);
    const label = asset.label ? ` label="${asset.label}"` : "";
    return `- ${name}: semanticRole=${semanticRole} (${assetSemanticTitle(semanticRole)}); sourceRole=${asset.role}${label}; fusionStrategy=${assetFusionStrategy(asset, options)}.`;
  }).join("\n");
}

export function posterAssetSemanticInventory(assets: PosterAssetSemanticInput[]): string {
  return assetSemanticInventory(assets, { mode: "poster" });
}

export function modeAssetFusionDirective(
  mode: ProductionMode,
  assets: AssetSemanticInput[],
): string {
  if (assets.length === 0) return "";
  const inventory = assetSemanticInventory(assets, { mode });
  const common = [
    "Universal asset fusion contract: uploaded assets are semantic visual references, not sticker layers.",
    "Default pipeline: AI integrated redraw. Preserve identity/brand/style duties from references while redrawing or simplifying them for the current mode's visual goal.",
    "Fallback overlay is only acceptable after a failed integrated redraw or missing critical identity/logo, never as the default composition path.",
    inventory ? `Semantic asset map:\n${inventory}` : "",
  ];
  const modeRule: Record<ProductionMode, string> = {
    poster: "Poster target: cinematic game KV with story action, environment interaction, light/shadow/VFX integration, and no flat collage feeling.",
    icon: "Icon target: 1:1 square, ABSOLUTELY NO TEXT, one strong subject silhouette, minimal background, high contrast, readable at 64px, and no copied static asset pose.",
    logo: "Logo target: readable wordmark/mark system with brand feel first. Uploaded logos are brand references, not permission to generate fake look-alike text; reserve copy-safe fallback when spelling is uncertain.",
    announcement: "Announcement target: text-safe in-game event/UI layout first. Uploaded subjects support the announcement and must not cover the headline/copy area or produce garbled text.",
    collab: "Collab target: separate identities and logos unified by one scene. Do not merge characters or logos into hybrids; show a relationship or interaction story.",
  };
  return [...common, modeRule[mode]].filter(Boolean).join("\n");
}
