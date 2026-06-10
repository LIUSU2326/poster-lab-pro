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

const ACTIVE_POSTER_KV_ARCHITECTURES: PosterKvArchitecture[] = [
  {
    titleZh: "Dynamic conflict split-world KV",
    titleEn: "Dynamic conflict split-world KV",
    briefZh: "Divide the poster into two contrasting gameplay forces or world states from the current project, joined by an active collision path rather than a static border.",
    directive: [
      "Use a bold diagonal or curved split-world campaign composition based on the current project's actual setting.",
      "One side should express the player goal, home base, faction, or safe zone; the other side should express the enemy pressure, danger zone, or transformation state from the project description.",
      "A foreground project-specific object, weapon, power trail, road, banner, UI signal, or terrain break crosses the canvas as the main visual divider.",
      "Stage uploaded playable characters around this divider with readable faces, active motion, and physical interaction instead of static sticker placement.",
    ].join(" "),
  },
  {
    titleZh: "Portal or breach reveal KV",
    titleEn: "Portal or breach reveal KV",
    briefZh: "Use a doorway, gate, rupture, screen, canyon, city street, battlefield opening, or magical/tech portal to reveal the central threat and the game's world transition.",
    directive: [
      "Use a breach, gate, doorway, portal, screen tear, canyon pass, or tactical entrance composition grounded in the current project setting.",
      "Foreground must have real spatial depth with props, architecture, terrain, or UI-safe surfaces from the game's world, not a generic backdrop.",
      "The background opening reveals the antagonist, boss, objective, or danger state as the main threat.",
      "Place uploaded playable characters in the foreground/midground reacting to the breach with readable faces and dynamic action poses.",
    ].join(" "),
  },
  {
    titleZh: "Foreground prop divider KV",
    titleEn: "Foreground prop divider KV",
    briefZh: "A large project-specific foreground prop, weapon, vehicle, banner, relic, map route, or power effect creates perspective and leads the eye toward the conflict.",
    directive: [
      "Use a foreground object-divider composition based on a real prop, weapon, vehicle, relic, route, or power from the project.",
      "The foreground element dominates in dramatic perspective and leads the eye toward the main boss, obstacle, or objective.",
      "The uploaded playable roster must interact with this element by leaping, blocking, sliding, charging, climbing, casting, piloting, or defending.",
      "The antagonist or key threat must be integrated with contact, shadow, atmosphere, and scale pressure, not floating separately.",
    ].join(" "),
  },
  {
    titleZh: "Mission montage KV",
    titleEn: "Mission montage KV",
    briefZh: "Compress the game loop into 2-4 cinematic panels or zones, each showing a distinct objective, encounter, resource, or battle beat from the current game.",
    directive: [
      "Use a polished mission montage with 2 to 4 integrated panels or zones.",
      "Each panel should show a different current-project story beat such as setup, exploration, base building, confrontation, chase, rescue, boss battle, or payoff.",
      "Do not repeat the same uploaded character as unrelated duplicates; preserve identity while showing different actions or scene functions.",
      "Use the central playable character action and uploaded logo as the main campaign anchor, with depth and premium illustrated lighting in every zone.",
    ].join(" "),
  },
  {
    titleZh: "Boss reveal framed KV",
    titleEn: "Boss reveal framed KV",
    briefZh: "Frame the boss or key threat through terrain, architecture, smoke, banners, trees, machinery, portals, ruins, or UI-safe shape language from the game world.",
    directive: [
      "Use a boss reveal composition framed by terrain, architecture, machinery, ruins, doorways, cliffs, smoke, trees, banners, or project-specific set pieces.",
      "The frame shape must create strong depth and silhouette hierarchy: foreground heroes, midground danger effects, background boss reveal.",
      "The uploaded playable roster should face the viewer in 3/4 angle or readable profile with expressive action, not back-facing or static.",
      "Use atmospheric haze, rim light, sparks, debris, particles, and cast shadows to bind all subjects into one dramatic scene.",
    ].join(" "),
  },
  {
    titleZh: "Climactic boss takedown KV",
    titleEn: "Climactic boss takedown KV",
    briefZh: "Capture the decisive second of a boss fight, counterattack, ambush, defense, or victory-in-progress from the current game's core fantasy.",
    directive: [
      "Use a climactic boss takedown or major-threat confrontation composition at the exact moment victory is being earned.",
      "The uploaded playable roster is actively suppressing, jumping toward, blocking, pinning, dodging, or countering the boss/key threat with readable faces and high-energy body language.",
      "Keep the boss recognizable and present exactly once; it should feel large, dangerous, and physically connected through impact, shadow, debris, particles, and scale.",
      "Use low-angle perspective, foreground framing, backlight, rim light, dust/smoke, energy arcs, debris trails, and environmental reaction to create a premium campaign climax.",
    ].join(" "),
  },
  {
    titleZh: "Base defense siege KV",
    titleEn: "Base defense siege KV",
    briefZh: "Turn the player's base, town, settlement, stronghold, squad line, command room, or protected objective into a cinematic defense scene.",
    directive: [
      "Use a base defense or protected-objective siege composition.",
      "The defended place should come from the project premise: town, settlement, castle, camp, bunker, command room, gate, road, arena, or strategic objective.",
      "The uploaded playable roster must actively defend, brace, block, pull, repair, cast, fire, or counterattack from foreground/midground contact points.",
      "The threat pushes in through an entrance, route, breach, exterior path, or swarm pressure with debris, smoke, projectiles, and rim light tying both sides together.",
    ].join(" "),
  },
  {
    titleZh: "High-speed pursuit KV",
    titleEn: "High-speed pursuit KV",
    briefZh: "Show a chase, retreat, raid, route push, delivery, escort, or tactical movement beat through the current project's landscape or battlefield.",
    directive: [
      "Use a high-speed pursuit composition with a strong motion path.",
      "Build a readable route through the project's world: road, bridge, canyon, forest, town street, battlefield lane, river, ruins, sky path, or tactical map route.",
      "The uploaded playable roster must be running, riding, jumping, dodging, escorting, reaching, or pushing toward a story objective with readable face and action silhouette.",
      "The boss or opposing force must chase, ambush, burst from terrain, collide with the route, or block the path; motion blur, dust, debris, trails, and foreground occlusion must follow the chase direction.",
    ].join(" "),
  },
  {
    titleZh: "Discovery adventure KV",
    titleEn: "Discovery adventure KV",
    briefZh: "Show the moment a key location, relic, route, portal, enemy, map secret, or upgrade is discovered, with wonder and danger in the same frame.",
    directive: [
      "Use a discovery adventure composition.",
      "A project-specific object, route, gate, relic, control panel, map, shrine, machine, signal, or environmental opening reveals the next gameplay layer.",
      "The uploaded playable roster should open, lean into, brace against, investigate, step through, or activate the discovery with readable wonder, fear, or determination.",
      "The boss, threat silhouette, or objective must be visible beyond the discovery point with atmospheric depth, backlight, particles, and environmental color spill.",
    ].join(" "),
  },
  {
    titleZh: "Victory trophy payoff KV",
    titleEn: "Victory trophy payoff KV",
    briefZh: "Show the seconds after a hard-fought objective, with the hero performance, defeated threat, reward, upgrade, territory, or campaign logo integrated into the scene.",
    directive: [
      "Use a victory trophy payoff composition, not a static celebration poster.",
      "Show the aftermath seconds after action: dust settling, energy fading, broken terrain, rescued objective, captured resource, upgraded base, or defeated boss restrained exactly once.",
      "The uploaded playable roster must still have performance: planting a foot, lifting a story prop, pulling a rope, bracing from impact, holding a trophy, or signaling victory with readable expression.",
      "The logo/copy area should feel like a campaign title moment integrated into a trophy board, banner, carved sign, hologram, flag, or project-specific celebration element.",
    ].join(" "),
  },
  {
    titleZh: "Giant-scale pressure KV",
    titleEn: "Giant-scale pressure KV",
    briefZh: "Use forced perspective and oversized project-specific terrain, enemy, machine, structure, spell, object, or obstacle to create scale drama.",
    directive: [
      "Use a giant-scale pressure composition with forced perspective.",
      "Create a massive object world based on the project: oversized machines, cliffs, buildings, ruins, vehicles, weapons, magical effects, monsters, gates, or strategic terrain.",
      "At least one uploaded playable character must remain large enough to read identity and action even inside the scale fantasy; do not reduce the hero to a tiny dot.",
      "The boss or main obstacle must create physical pressure through shadow, falling debris, blocked path, shockwave, looming contact, or environmental distortion.",
    ].join(" "),
  },
  {
    titleZh: "Objective pressure eruption KV",
    titleEn: "Objective pressure eruption KV",
    briefZh: "Turn a mission timer, resource shortage, map route, invasion wave, upgrade decision, town crisis, or objective pressure into a cinematic action event.",
    directive: [
      "Use an objective-pressure eruption composition that translates the game's core loop into action.",
      "A readable in-world objective marker, route, timer shape, command signal, resource node, upgrade device, base zone, or tactical UI-safe form triggers the conflict without becoming cluttered text.",
      "The uploaded playable roster must defend, carry, repair, dodge, cast, strike, command, or rescue while the threat interrupts the objective flow.",
      "Use project-specific practical light, warning glow, dust, sparks, energy, debris, weather, or particles to make the objective pressure cinematic rather than a plain battle scene.",
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
  return ACTIVE_POSTER_KV_ARCHITECTURES.find((architecture) =>
    text.includes(architecture.titleZh) || text.includes(architecture.titleEn),
  ) || null;
}

function architectureOrderForSeed(seed: string): number[] {
  return ACTIVE_POSTER_KV_ARCHITECTURES
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
  return ACTIVE_POSTER_KV_ARCHITECTURES[positiveModulo(rawIndex, ACTIVE_POSTER_KV_ARCHITECTURES.length)] || ACTIVE_POSTER_KV_ARCHITECTURES[0]!;
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
  return `${architecture.titleZh} / ${architecture.titleEn}: ${architecture.briefZh}`;
}

export function posterKvRenderPromptAugmentation(input: {
  seed: string | number;
  assetCounts: PosterKvAssetCounts;
  preferredText?: string | null;
}): string {
  const architecture = posterKvArchitectureForSeed(input.seed, input.preferredText);
  const characterLine = input.assetCounts.gameCharacters > 0
    ? `Use uploaded game character placeholders ${Array.from({ length: input.assetCounts.gameCharacters }, (_, index) => `[Game Character ${index + 1}]`).join(", ")} as the only playable hero roster; preserve reference identity while changing pose, camera, lighting, and action.`
    : "Use the project premise to define the playable hero presence without inventing unrelated characters.";
  const bossLine = input.assetCounts.bosses > 0
    ? "Use [Boss] as the uploaded antagonist/key subject reference; preserve its silhouette and identity while staging a real threat action with scale, weight, contact shadows, and environmental reaction."
    : "Create one project-specific threat, obstacle, objective, or pressure source from the game description.";
  const logoLine = input.assetCounts.logos > 0
    ? "Use exactly one [Game Logo] treatment. Reproduce the uploaded logo only if accurate; otherwise reserve a polished blank logo-safe plate without fake letters."
    : "Reserve a clean campaign logo/copy safe area without inventing fake readable brand text.";

  return [
    `KV architecture lock: ${architecture.titleZh} / ${architecture.titleEn}. ${architecture.briefZh}`,
    architecture.directive,
    characterLine,
    bossLine,
    logoLine,
    "AI render base: official AAA game campaign key visual, complex story set-piece, strong foreground/midground/background depth, decisive camera angle, practical key/fill/rim lighting, volumetric haze, particles/VFX following the action direction, cast/contact shadows, readable thumbnail silhouette, and no sticker collage.",
    "Use uploaded references as identity/model-sheet anchors, not pasted picture-in-picture panels. The prompt may direct action, camera, environment, lighting, and effects, but must not redesign hair, face, outfit, body type, species, logo lettering, or signature props.",
    "Typography treatment: if slogan/logo text cannot be spelled cleanly, create a polished in-world blank ribbon, sign, title plate, or logo-safe surface instead of broken text or fake words.",
  ].join("\n");
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

export function posterStaticSchemeLanguageBan(): string {
  return "Static scheme language ban: scheme briefs and prompts must not rely on static placeholder staging such as '[Game Character 1] stands', 'stands heroically', 'is placed', 'is located', 'faces off', '站在', '英勇地站在', '位于', '摆放', '对峙', or '从一侧压迫'. Use active verbs such as sprint, block, slide, leap, brace, collide, lunge, strike, burst, recoil, defend, chase, discover, or restrain.";
}

export function posterSchemeBlueprintRequirement(): string {
  return "Scheme blueprint requirement: every generated poster scheme must explicitly carry camera/lens/perspective, foreground-midground-background layers, key/fill/rim lighting, physical action contact point, environmental reaction/VFX, one logo treatment location, and slogan/copy treatment or copy-safe fallback.";
}

export function posterKvArchitectureDiversityRequirement(): string {
  return "KV architecture diversity requirement: across a batch, do not repeat the same diagonal split-world or side-view battlefield solution. Use the assigned architecture slot as the visible structural idea, and if a diagonal divider appears it must be an active collision/action path rather than a static line with subjects parked on each side.";
}

export function posterCinematicKvQualityDirective(): string {
  return [
	    "## Cinematic Game KV Quality Override",
    "Target the feel of a top-tier cinematic game announcement key visual, adapted to the uploaded art style. This means movie-poster staging and lighting quality, not photorealism unless the active style reference is photorealistic.",
    "Cinematography: choose a deliberate camera language such as low-angle hero shot, 24-35mm wide cinematic lens feel, forced perspective, over-the-shoulder danger reveal, foreground occlusion, diagonal motion path, or portal/window frame-within-frame. Avoid neutral side-view staging.",
    "Lighting: design a clear key light, colored fill, hard rim/back light, and a motivated project-specific practical light source such as portal glow, fire, magic, tech screens, warning lights, moonlight, explosion light, or energy effects.",
    "VFX and particles: add layered project-specific particles that serve the story: dust, sparks, embers, smoke, debris, magic trails, tech fragments, motion arcs, shockwave rings, weather, atmospheric haze, and depth-of-field separation. Particles must follow action direction, not random decoration.",
    "Story beat: make the image capture a decisive second from the current game's trailer: breach, ambush, rescue, counterattack, boss takedown, portal opening, base defense, route push, discovery, upgrade, or objective pressure erupting into action. The viewer should understand what just happened and what will happen next.",
    "Blockbuster escalation: exaggerate the set-piece like launch splash art: giant scale contrast, dramatic foreground prop cropping, visible impact aftermath, environmental damage or transformation, project-specific energy/VFX, and a clear before-after tension inside the same frame.",
    "Character performance: uploaded heroes must show readable emotion, weight, line of action, gesture, and contact with the scene. At least one hero must interact physically with the BOSS or set piece. Avoid floating sticker poses, static front-facing mascot poses, or symmetrical corner jumps.",
    "Contact and occlusion audit: every hero/BOSS foot, hand, weapon, or body part that touches a surface must create contact shadow, cast shadow, small occlusion, bounce color, and local material reaction. Avoid clean cutout edges floating over props or terrain.",
    "Asset performance: every uploaded visual reference must be assigned a semantic poster duty before rendering: protagonist, antagonist, brand logo, prop, environment, style reference, composition reference, key subject, or supporting asset. The duty determines how it enters the story; do not treat every upload as a flat sticker.",
    posterIdentitySafeMotionRule(),
    posterHeroPerformanceScaleLock(),
    posterSubjectAccessoryStrictnessLock(),
    posterStaticSchemeLanguageBan(),
    posterSchemeBlueprintRequirement(),
    posterKvArchitectureDiversityRequirement(),
    "Environment set-piece: build a memorable cinematic location with architecture or terrain from the project: town, battlefield, base, portal, ruins, forest, canyon, command area, road, arena, fortress, machine room, sky route, tunnel, doorway breach, or split-world stage.",
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
    `Selected-scheme architecture lock: this render must visibly use ${architecture.titleZh} as its primary scene structure. Do not fall back to a generic mascot lineup, flat side-view battlefield, unrelated sample-project scene, or the same composition used by another scheme in the batch.`,
    "Composition reference priority rule: uploaded compositionReference images are guide-only for camera energy, layout rhythm, safe-area hierarchy, subject scale, and depth. They must never override this selected-scheme architecture, and they must not make every scheme share the same scene, background, pose arrangement, or action beat.",
    architecture.directive,
    posterCinematicKvQualityDirective(),
    "Internal blueprint requirement: before rendering, design the poster as a finished campaign key visual with five clear layers, but do not print layer labels. Layer 1: oversized foreground framing element, weapon, vehicle, terrain, prop, or project-specific object with perspective. Layer 2: uploaded hero performance with readable faces, expressive action, and signature props. Layer 3: uploaded BOSS/key threat with scale pressure and visible intent. Layer 4: world context that tells the current project's game loop. Layer 5: clean logo/copy safe area integrated into the art.",
    "KV scoring rubric to satisfy before final image: the composition must read in one second, have a strong silhouette thumbnail, show an obvious story conflict, contain foreground-midground-background depth, use directional lighting and rim light, and feel like a designed game launch key art rather than an in-game screenshot or simple illustration.",
    "Prototype-quality target: richer value range, painterly/cel hybrid detail, atmospheric haze, bounce light, cast shadows, motion arcs, project-specific debris/VFX, readable focal contrast, and designed negative space. Keep the uploaded cartoon identity, but raise the finish above flat children's-book art.",
    "Set-piece requirement: build a memorable campaign location with props, architecture, terrain breaks, doorways, bases, portals, cliffs, roads, machines, town elements, tunnels, or framed vistas from the current project. Avoid empty pastel sky, soft gradient backdrop, generic open field, and unrelated sample-project scenery.",
    "Reference identity lock: the uploaded images are the source of truth. The prompt may change action, pose, expression, angle, lighting, and scene integration only. Do not change age, hair color, hairstyle, costume, body proportions, species, tool identity, or add facial hair/extra features not visible in the uploaded reference.",
    "Reference pose release: do not treat the uploaded still image as the final pose. Preserve identity, silhouette, and signature props, but repaint the hero/BOSS with a new performance such as 3/4 turn, stride, leap, recoil, attack wind-up, defensive block, landing impact, or foreshortened prop/tool angle.",
    "Static scheme action rewrite: if an older or generated scheme says the hero stands on a divider and the BOSS presses from one side, reinterpret it as an active trailer moment: the hero sprints, blocks, slides, leaps, or collides with the divider while the BOSS lunges, swings, bursts through, lands, or recoils from impact.",
    posterStaticSchemeLanguageBan(),
    posterSchemeBlueprintRequirement(),
    posterKvArchitectureDiversityRequirement(),
    "Semantic asset duty lock: do not hard-code only three asset categories. Protagonists carry performance, antagonists carry pressure, logos carry brand readability, props become story triggers, environments shape the set piece, style references shape rendering, and composition references shape layout only.",
    posterLogoSingleUseLock(),
    posterSubjectAccessoryStrictnessLock(),
    `Playable roster staging: use exactly ${characterPlaceholders} as the visible playable/human hero roster. Keep them recognizable from uploaded references, but repaint/repose them as living actors with 3/4 readable faces, expressive emotion, dynamic limbs, action intent, contact shadows, rim light, and environmental occlusion. Do not use back-facing, tiny, static, or pasted-looking cutout poses.`,
    "Hero performance lock: every uploaded playable character that appears must show a readable face in front view, 3/4 front view, or strong readable profile. Do not show any uploaded playable character only from the back, hidden behind another subject, or too small to identify.",
    "Grounded action lock: at least one uploaded hero must physically interact with the BOSS or environment through impact, blocking, climbing, sliding, pulling, striking, casting, piloting, repairing, rescuing, or defending. Do not leave heroes floating symmetrically around the BOSS like stickers unless the jump has clear motion trail, shadow, and landing target.",
    "Contact and occlusion lock: if a character stands on, grips, blocks with, strikes, or is hit by a giant prop or terrain, show the actual overlap edge, contact shadow, cast shadow, reflected color, pressure dent/scratch/spark/debris burst, and particle interruption at the contact point.",
    posterHeroPerformanceScaleLock(),
    bossLine,
    logoLine,
    "Composition ban for this render: do not make a simple horizontal product-landscape battlefield, empty mascot poster, centered BOSS with two heroes flying at the corners, or small heroes standing on the left/right. Do not introduce scenery from an unrelated sample project. Any terrain or prop must support the assigned KV architecture with strong perspective, story pressure, foreground framing, and vertical depth.",
    "Typography rule: avoid long generated sentences inside the image. Prefer the uploaded logo plus either very short custom campaign lettering of 2-4 words or a polished blank ribbon/title plate that can receive final copy later. Never let text become the main visual solution.",
  ].join("\n");
}
