import { posterAssetSemanticRole } from "../assets/semantic-roles";

type PosterKvAssetLike = {
  role: string;
  description?: string | null | undefined;
  label?: string | null | undefined;
};

export type PosterKvAssetCounts = {
  gameCharacters: number;
  bosses: number;
  logos: number;
};

type PosterKvArchitecture = {
  titleZh: string;
  titleEn: string;
  briefZh: string;
  directive: string;
};

const POSTER_KV_ARCHITECTURES: PosterKvArchitecture[] = [
  {
    titleZh: "厨房与荒野斜切双世界",
    titleEn: "Diagonal kitchen-vs-wildlands split-world KV",
    briefZh: "用一条巨型厨刀、披萨铲或能量斜线把画面切成温暖厨房经营区与危险食材荒野区，两侧形成经营与战斗的强对比，角色在分界线上行动，BOSS 从荒野压迫过来。",
    directive: [
      "Use a bold diagonal split-world campaign composition.",
      "One side is a warm restaurant/kitchen economy space with oven glow, counters, ingredients, and market/VIP pressure; the other side is a dangerous wildlands ingredient-hunt space with atmospheric depth and BOSS pressure.",
      "A giant foreground cooking weapon, pizza cutter, knife, spatula, or sauce energy slash crosses the canvas diagonally as the main graphic divider.",
      "Stage the uploaded playable roster on or around this divider with visible 3/4 faces, expressive eyes, aggressive/heroic body language, and active motion, not tiny standing stickers.",
    ].join(" "),
  },
  {
    titleZh: "餐厅窗口 / 传送门 Boss 破境",
    titleEn: "Restaurant-window portal breach KV",
    briefZh: "画面前景是有纵深的披萨店或厨房，后方窗口、门洞或墙体被撕裂成通往荒野的传送门，BOSS 从门外冲入，角色在前景准备迎战，形成强故事张力。",
    directive: [
      "Use a restaurant-window or kitchen-portal breach composition.",
      "Foreground must be a real cozy but cinematic pizza shop/kitchen with counters, oven glow, props, steam, warm rim light, and clear perspective lines, not a flat giant pizza surface.",
      "Background: a torn window, doorway, broken wall, or portal opens into dangerous wildlands; the BOSS emerges through it as the main threat.",
      "Place the uploaded playable roster in the foreground/midground reacting to the breach with clear readable faces and dynamic action poses.",
      "Food terrain may appear through the portal or as foreground props, but it must not replace the restaurant/kitchen spatial story.",
    ].join(" "),
  },
  {
    titleZh: "巨型厨具前景分割主视觉",
    titleEn: "Foreground utensil-divider hero KV",
    briefZh: "用巨大的厨具、披萨刀或角色武器作为前景视觉锚点，让它贯穿画面并制造强透视，角色围绕武器进攻或防守，BOSS 在中后景形成压迫。",
    directive: [
      "Use a foreground weapon or utensil-divider composition.",
      "A massive cooking utensil, pizza cutter, spatula, pan, shield, or sauce-powered blade dominates the foreground in dramatic perspective and leads the eye toward the BOSS.",
      "The uploaded playable roster must interact with this foreground object: leaping, blocking, sliding, charging, or casting a sauce/cheese energy trail.",
      "The BOSS must be integrated in the midground/background with contact, shadow, atmosphere, and scale pressure, not floating separately.",
    ].join(" "),
  },
  {
    titleZh: "漫画任务蒙太奇",
    titleEn: "Comic-panel mission montage KV",
    briefZh: "把经营、接单、备餐、荒野狩猎、Boss 战等流程压缩成 2-4 个有设计感的漫画分镜，中央用角色与 Logo 形成视觉锚点，突出游戏循环和故事感。",
    directive: [
      "Use a polished comic-panel mission montage.",
      "Create 2 to 4 integrated panels with cinematic diagonal borders: restaurant demand/prep, ingredient hunt, BOSS confrontation, and victory/cooking payoff.",
      "Do not repeat the same uploaded character as unrelated duplicates; each panel should show a different story beat while preserving the same identity.",
      "Use the central playable character action and uploaded logo as the main campaign anchor, with depth and premium illustrated lighting in every panel.",
    ].join(" "),
  },
  {
    titleZh: "Boss 破门压迫海报",
    titleEn: "Boss reveal framed by doorway or canyon",
    briefZh: "用门洞、峡谷、披萨烤炉或食材山谷形成天然画框，BOSS 从画框中出现，角色位于前景迎战，形成清晰的敌我距离和纵深。",
    directive: [
      "Use a BOSS reveal composition framed by a doorway, canyon, oven mouth, kitchen arch, or edible terrain gateway.",
      "The frame shape must create strong depth and silhouette hierarchy: foreground heroes, midground danger effects, background BOSS reveal.",
      "The uploaded playable roster should face the viewer in 3/4 angle or readable profile with expressive action, not back-facing or static.",
      "Use atmospheric haze, rim light, sparks, sauce splashes, flying ingredients, and cast shadows to bind all subjects into one dramatic scene.",
    ].join(" "),
  },
  {
    titleZh: "Boss 讨伐高潮 KV",
    titleEn: "Climactic BOSS takedown KV",
    briefZh: "表现 Boss 战即将分出胜负的高潮瞬间：角色正在压制或跃上 Boss/巨大食材，武器、酱汁、奶酪、烟尘和光束形成强动势，画面仍有危险感而不是轻松合影。",
    directive: [
      "Use a climactic BOSS takedown composition at the exact moment victory is being earned, not a relaxed post-fight group photo.",
      "The uploaded playable roster is actively suppressing, jumping toward, blocking, or pinning the BOSS/giant ingredient with clear readable faces and high-energy body language.",
      "Keep the BOSS recognizable and present exactly once; it should still feel large, dangerous, and physically connected to the scene through impact, shadow, steam, sauce, cheese, debris, and scale.",
      "Use low-angle perspective, foreground weapon/food framing, backlight, rim light, dust/smoke, sauce arcs, cheese stretch trails, and environmental reaction to create a premium campaign climax.",
    ].join(" "),
  },
];

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function architectureIndexFromSeed(seed: string | number): number {
  return typeof seed === "number" ? seed : hashSeed(seed);
}

function architectureFromText(text?: string | null): PosterKvArchitecture | null {
  if (!text) return null;
  return POSTER_KV_ARCHITECTURES.find((architecture) =>
    text.includes(architecture.titleZh) || text.includes(architecture.titleEn),
  ) || null;
}

function architectureOrderForSeed(seed: string): number[] {
  return POSTER_KV_ARCHITECTURES
    .map((_architecture, index) => index)
    .sort((left, right) => {
      const leftHash = hashSeed(`${seed}:poster-kv-architecture:${left}`);
      const rightHash = hashSeed(`${seed}:poster-kv-architecture:${right}`);
      return leftHash - rightHash || left - right;
    });
}

export function posterKvAssetCountsFromAssets(assets: PosterKvAssetLike[]): PosterKvAssetCounts {
  return {
    gameCharacters: assets.filter((asset) => posterAssetSemanticRole(asset) === "protagonist").length,
    bosses: assets.filter((asset) => posterAssetSemanticRole(asset) === "antagonist").length,
    logos: assets.filter((asset) => posterAssetSemanticRole(asset) === "brandLogo").length,
  };
}

export function posterKvArchitectureForSeed(seed: string | number, preferredText?: string | null): PosterKvArchitecture {
  const fromText = architectureFromText(preferredText);
  if (fromText) return fromText;
  const rawIndex = architectureIndexFromSeed(seed);
  return POSTER_KV_ARCHITECTURES[positiveModulo(rawIndex, POSTER_KV_ARCHITECTURES.length)] || POSTER_KV_ARCHITECTURES[0]!;
}

export function posterKvArchitectureSlotSeed(seed: string, slotIndex: number): number {
  const order = architectureOrderForSeed(seed);
  return order[positiveModulo(slotIndex, order.length)] || 0;
}

export function posterKvArchitectureBriefSlots(schemeCount: number, seed: string): string {
  return Array.from({ length: Math.max(1, Math.min(20, schemeCount)) }, (_, index) => {
    const architecture = posterKvArchitectureForSeed(posterKvArchitectureSlotSeed(seed, index));
    return `${index + 1}. ${architecture.titleZh} / ${architecture.titleEn}: ${architecture.briefZh}`;
  }).join("\n");
}

export function posterKvBriefAugmentation(seed: string | number, preferredText?: string | null): string {
  const architecture = posterKvArchitectureForSeed(seed, preferredText);
  return `KV构图母版：${architecture.titleZh}。${architecture.briefZh}`;
}

export function posterIdentitySafeMotionRule(): string {
  return "Identity-safe motion hierarchy: never improve action by redesigning an uploaded character, but do not use identity safety as an excuse for an unchanged static cutout. Preserve exact identity while requiring at least one readable performance change; if full re-posing risks drift, use a 3/4 turn, grip/contact, foreshortened prop/tool angle, facial expression, camera perspective, foreground occlusion, VFX, lighting, and environment motion.";
}

export function posterHeroPerformanceScaleLock(): string {
  return "Hero performance scale lock: at least one uploaded playable protagonist must occupy 18-32% of canvas height, with readable face, emotion, body language, and signature prop/tool; it must be in the foreground or strong midground, physically interacting with the BOSS or set piece, and must not be tiny, hidden, back-facing, or visually subordinate to the logo, slogan, BOSS, or background.";
}

export function posterLogoSingleUseLock(): string {
  return "Logo single-use lock: when a brandLogo/gameLogo reference is present, render exactly one campaign logo treatment. A storefront sign, title plaque, carved board, neon sign, flag, UI emblem, or corner lockup all count as the one logo treatment; do not repeat the uploaded logo again as a second shop sign, badge, watermark, tiny duplicate, or alternate title.";
}

export function posterSubjectAccessoryStrictnessLock(): string {
  return "Uploaded subject accessory lock: do not give protagonists or BOSS new shields, weapons, armor, tools, facial features, costume parts, horns, crowns, or props just because a scheme mentions them. If that object is not visibly present in the uploaded reference, reinterpret the action through body movement, camera, environment, particles, or existing visible uploaded props only.";
}

export function posterCinematicKvQualityDirective(): string {
  return [
    "## AAAAAAAAAAA Cinematic Game KV Quality Override",
    "Target the feel of a top-tier cinematic game announcement key visual, adapted to the uploaded art style. This means movie-poster staging and lighting quality, not photorealism unless the active style reference is photorealistic.",
    "Cinematography: choose a deliberate camera language such as low-angle hero shot, 24-35mm wide cinematic lens feel, forced perspective, over-the-shoulder danger reveal, foreground occlusion, diagonal motion path, or portal/window frame-within-frame. Avoid neutral side-view staging.",
    "Lighting: design a clear key light, colored fill, hard rim/back light, motivated practical light source such as oven glow/portal glow/fire/sauce energy, volumetric beams, glow bloom, bounced color, and deep value contrast around silhouettes.",
    "VFX and particles: add layered particles that serve the story: steam, flour dust, embers, cheese sparks, sauce droplets, ingredient debris, motion arcs, shockwave rings, magic/cooking energy trails, atmospheric haze, and depth-of-field separation. Particles must follow action direction, not random decoration.",
    "Story beat: make the image capture a decisive second from the trailer: breach, ambush, rescue, counterattack, boss takedown, portal opening, VIP pressure erupting into wildlands action, or kitchen-to-battle transformation. The viewer should understand what just happened and what will happen next.",
    "Blockbuster escalation: exaggerate the set-piece like launch splash art: giant scale contrast, dramatic foreground prop cropping, visible impact aftermath, environmental damage or transformation, sauce/cheese energy as VFX, and a clear before-after tension inside the same frame.",
    "Character performance: uploaded heroes must show readable emotion, weight, line of action, gesture, and contact with the scene. At least one hero must interact physically with the BOSS or set piece. Avoid floating sticker poses, static front-facing mascot poses, or symmetrical corner jumps.",
    "Contact and occlusion audit: every hero/BOSS foot, hand, weapon, or body part that touches a surface must create contact shadow, cast shadow, small occlusion, bounce color, and local material reaction. Avoid clean cutout edges floating over props or terrain.",
    "Asset performance: every uploaded visual reference must be assigned a semantic poster duty before rendering: protagonist, antagonist, brand logo, prop, environment, style reference, composition reference, key subject, or supporting asset. The duty determines how it enters the story; do not treat every upload as a flat sticker.",
    posterIdentitySafeMotionRule(),
    posterHeroPerformanceScaleLock(),
    posterSubjectAccessoryStrictnessLock(),
    "Environment set-piece: build a memorable cinematic location with architecture or terrain: oven portal, restaurant interior under siege, kitchen counter battlefield, cliff/canyon of ingredients, tunnel/doorway breach, market demand area, giant utensil foreground, or split-world kitchen-vs-wildlands stage.",
    "Composition polish: use foreground-midground-background staging, overlapping silhouettes, leading lines, triangular focal hierarchy, controlled negative space for logo, and a strong thumbnail read at 10% size.",
    "Finish: painterly/cel hybrid polish, rich material texture, crisp focal detail, controlled background complexity, atmospheric depth, cast/contact shadows, occlusion, cinematic bloom, tasteful lens flare, subtle depth of field, and final color grading. Raise the uploaded cartoon style to premium cinematic campaign art.",
  ].join("\n");
}

export function posterKvArchitectureDirective(input: {
  seed: string | number;
  assetCounts: PosterKvAssetCounts;
  preferredText?: string | null;
}): string {
  const architecture = posterKvArchitectureForSeed(input.seed, input.preferredText);
  const characterPlaceholders = Array.from(
    { length: Math.max(1, input.assetCounts.gameCharacters) },
    (_, index) => `[Game Character ${index + 1}]`,
  ).join(input.assetCounts.gameCharacters > 2 ? ", " : " and ");
  const bossLine = input.assetCounts.bosses > 0
    ? "Use [Boss] as the single dominant antagonist/key creature from the uploaded BOSS reference. Preserve its identity while giving it believable weight, contact, shadow, and scene interaction."
    : "Use the main threat from the project premise as one dominant antagonist/key obstacle.";
  const logoLine = input.assetCounts.logos > 0
    ? "Allocate one campaign-safe [Game Logo] treatment, readable but secondary to the character-vs-BOSS story. Use the exact uploaded logo only if lettering can stay accurate; otherwise reserve a polished blank logo-safe plate without fake text."
    : "Reserve a clean campaign-safe logo area without inventing a fake logo.";

  return [
    "## Mandatory KV Composition Architecture Override",
    `Architecture: ${architecture.titleZh} / ${architecture.titleEn}.`,
    architecture.directive,
    posterCinematicKvQualityDirective(),
    "Internal blueprint requirement: before rendering, design the poster as a finished campaign key visual with five clear layers, but do not print layer labels. Layer 1: oversized foreground framing element or weapon/food prop with perspective. Layer 2: uploaded hero performance with readable faces, expressive action, and signature props. Layer 3: uploaded BOSS/key threat with scale pressure and visible intent. Layer 4: world context that tells the kitchen-to-wildlands game loop. Layer 5: clean logo/copy safe area integrated into the art.",
    "KV scoring rubric to satisfy before final image: the composition must read in one second, have a strong silhouette thumbnail, show an obvious story conflict, contain foreground-midground-background depth, use directional lighting and rim light, and feel like a designed game launch key art rather than an in-game screenshot or simple illustration.",
    "Prototype-quality target: richer value range, painterly/cel hybrid detail, atmospheric haze, bounce light, cast shadows, motion arcs, ingredient debris, readable focal contrast, and designed negative space. Keep the uploaded cartoon identity, but raise the finish above flat children's-book art.",
    "Set-piece requirement: build a memorable campaign location with props, architecture, terrain breaks, doorways, shop interiors, portals, cliffs, ovens, counters, tunnels, or framed vistas. Avoid empty pastel sky, soft gradient backdrop, and generic open food field.",
    "Reference identity lock: the uploaded images are the source of truth. The prompt may change action, pose, expression, angle, lighting, and scene integration only. Do not change age, hair color, hairstyle, costume, body proportions, species, tool identity, or add facial hair/extra features not visible in the uploaded reference.",
    "Reference pose release: do not treat the uploaded still image as the final pose. Preserve identity, silhouette, and signature props, but repaint the hero/BOSS with a new performance such as 3/4 turn, stride, leap, recoil, attack wind-up, defensive block, landing impact, or foreshortened prop/tool angle.",
    "Static scheme action rewrite: if an older or generated scheme says the hero stands on a divider and the BOSS presses from one side, reinterpret it as an active trailer moment: the hero sprints, blocks, slides, leaps, or collides with the divider while the BOSS lunges, swings, bursts through, lands, or recoils from impact.",
    "Semantic asset duty lock: do not hard-code only three asset categories. Protagonists carry performance, antagonists carry pressure, logos carry brand readability, props become story triggers, environments shape the set piece, style references shape rendering, and composition references shape layout only.",
    posterLogoSingleUseLock(),
    posterSubjectAccessoryStrictnessLock(),
    `Playable roster staging: use exactly ${characterPlaceholders} as the visible playable/human hero roster. Keep them recognizable from uploaded references, but repaint/repose them as living actors with 3/4 readable faces, expressive emotion, dynamic limbs, action intent, contact shadows, rim light, and environmental occlusion. Do not use back-facing, tiny, static, or pasted-looking cutout poses.`,
    "Hero performance lock: every uploaded playable character that appears must show a readable face in front view, 3/4 front view, or strong readable profile. Do not show any uploaded playable character only from the back, hidden behind another subject, or too small to identify.",
    "Grounded action lock: at least one uploaded hero must physically interact with the BOSS or environment through impact, blocking, climbing, sliding, cooking, pulling, striking, or defending. Do not leave heroes floating symmetrically around the BOSS like stickers unless the jump has clear motion trail, shadow, and landing target.",
    "Contact and occlusion lock: if a character stands on, grips, blocks with, strikes, or is hit by a giant prop or terrain, show the actual overlap edge, contact shadow, cast shadow, reflected color, pressure dent/scratch/spark/sauce splash, and particle interruption at the contact point.",
    posterHeroPerformanceScaleLock(),
    bossLine,
    logoLine,
    "Composition ban for this render: do not make a simple horizontal pizza-landscape battlefield, empty mascot poster, centered BOSS with two heroes flying at the corners, or small heroes standing on the left/right. Do not let a pizza surface become the whole poster floor unless it is a vertical, dangerous, cinematic terrain with real foreground/midground/background depth. If pizza/food terrain appears, it must support the assigned KV architecture with strong perspective, story pressure, foreground framing, and vertical depth.",
    "Typography rule: avoid long generated sentences inside the image. Prefer the uploaded logo plus either very short custom campaign lettering of 2-4 words or a polished blank ribbon/title plate that can receive final copy later. Never let text become the main visual solution.",
  ].join("\n");
}
