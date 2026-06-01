export type PosterAssetSemanticRole =
  | "protagonist"
  | "antagonist"
  | "brandLogo"
  | "prop"
  | "environment"
  | "styleReference"
  | "compositionReference"
  | "keySubject"
  | "supportingAsset";

export type PosterAssetSemanticInput = {
  role: string;
  label?: string | null | undefined;
  description?: string | null | undefined;
  binding?: string | null | undefined;
  placeholder?: string | null | undefined;
};

const BOSS_REFERENCE_RE = /\bBOSS\b|boss|antagonist|enemy|monster|creature|villain|首领|魔王|怪物|怪兽|敌人|宝箱怪/i;
const HERO_REFERENCE_RE = /\bhero\b|protagonist|playable|player|character|mascot|avatar|chef|主角|角色|人物|英雄|玩家|厨师/i;
const LOGO_REFERENCE_RE = /\blogo\b|wordmark|brand mark|brandmark|logotype|标志|商标|字标/i;
const PROP_REFERENCE_RE = /\bprop\b|weapon|item|tool|ingredient|object|道具|武器|物品|工具|食材/i;
const ENVIRONMENT_REFERENCE_RE = /\bbackground\b|scene|environment|level|map|world|landscape|setting|背景|场景|环境|地图|关卡/i;
const STYLE_REFERENCE_RE = /\bstyle\b|palette|rendering|finish|moodboard|画风|风格|色板|渲染/i;
const COMPOSITION_REFERENCE_RE = /\bcomposition\b|layout|framing|camera|构图|布局|版式|镜头/i;

function searchableText(asset: PosterAssetSemanticInput): string {
  return [
    asset.role,
    asset.label || "",
    asset.description || "",
    asset.binding || "",
    asset.placeholder || "",
  ].join(" ");
}

export function isPosterBossLikeAsset(asset: PosterAssetSemanticInput): boolean {
  return BOSS_REFERENCE_RE.test(searchableText(asset));
}

export function posterAssetSemanticRole(asset: PosterAssetSemanticInput): PosterAssetSemanticRole {
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
    return isPosterBossLikeAsset(asset) ? "antagonist" : "protagonist";
  }
  if (isPosterBossLikeAsset(asset)) return "antagonist";
  if (role === "background" || binding === "backgroundReference" || ENVIRONMENT_REFERENCE_RE.test(text)) return "environment";
  if (role === "prop" || PROP_REFERENCE_RE.test(text)) return "prop";
  if (role === "subjectReference" || binding === "subjectReference") return "keySubject";
  return "supportingAsset";
}

export function isPosterIdentityAsset(asset: PosterAssetSemanticInput): boolean {
  const semanticRole = posterAssetSemanticRole(asset);
  return semanticRole === "protagonist" || semanticRole === "antagonist" || semanticRole === "keySubject";
}

export function isPosterIntegratedReferenceAsset(asset: PosterAssetSemanticInput): boolean {
  const semanticRole = posterAssetSemanticRole(asset);
  return semanticRole !== "styleReference" && semanticRole !== "compositionReference";
}

export function posterAssetSemanticTitle(role: PosterAssetSemanticRole): string {
  const titles: Record<PosterAssetSemanticRole, string> = {
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

export function posterAssetFusionStrategy(asset: PosterAssetSemanticInput): string {
  const semanticRole = posterAssetSemanticRole(asset);
  switch (semanticRole) {
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

export function posterAssetCompactConstraint(asset: PosterAssetSemanticInput): string {
  const semanticRole = posterAssetSemanticRole(asset);
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

export function posterAssetReferenceName(asset: PosterAssetSemanticInput, semanticIndex: number): string {
  if (asset.placeholder) return asset.placeholder;
  const semanticRole = posterAssetSemanticRole(asset);
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

export function posterAssetSemanticInventory(assets: PosterAssetSemanticInput[]): string {
  const semanticCounters = new Map<PosterAssetSemanticRole, number>();
  return assets.map((asset) => {
    const semanticRole = posterAssetSemanticRole(asset);
    const nextIndex = (semanticCounters.get(semanticRole) || 0) + 1;
    semanticCounters.set(semanticRole, nextIndex);
    const name = posterAssetReferenceName(asset, nextIndex);
    const label = asset.label ? ` label="${asset.label}"` : "";
    return `- ${name}: semanticRole=${semanticRole} (${posterAssetSemanticTitle(semanticRole)}); sourceRole=${asset.role}${label}; fusionStrategy=${posterAssetFusionStrategy(asset)}.`;
  }).join("\n");
}
