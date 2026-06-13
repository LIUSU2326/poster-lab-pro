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

type PosterKvAdaptiveIntentAxis = {
  titleZh: string;
  titleEn: string;
  question: string;
  directive: string;
};

const POSTER_KV_LEGACY_SCENARIO_LANES = [
  {
    titleZh: "城镇混乱",
    titleEn: "Market/town chaos",
    missionObjective: "protect a busy hub, kitchen, shopfront, town gate, festival lane, or settlement objective while the game loop erupts around it",
    locationFamily: "crowded town, shop interior, festival street, base kitchen, market road, or settlement gate",
    cameraGrammar: "wide crowd-aware campaign composition with foreground occlusion and readable action pockets",
    threatRole: "the BOSS disrupts the environment from the side/background rather than owning the whole center",
    emotionalBeat: "comic panic turning into heroic action",
  },
  {
    titleZh: "资源突袭",
    titleEn: "Resource raid heist",
    missionObjective: "steal, rescue, carry, cook, craft, or protect a key resource/object from the current project",
    locationFamily: "storage room, resource node, kitchen station, convoy, treasure cache, farm plot, or supply route",
    cameraGrammar: "low-angle foreground object close-up leading to midground character action",
    threatRole: "the BOSS interrupts the objective as a blocker, thief, or pressure source",
    emotionalBeat: "urgent problem-solving under pressure",
  },
  {
    titleZh: "探索发现",
    titleEn: "Discovery reveal",
    missionObjective: "discover a portal, relic, recipe, map route, hidden arena, new biome, or upgrade trigger",
    locationFamily: "doorway, portal breach, hidden chamber, route map, moonlit path, machine room, cave, or ruined gate",
    cameraGrammar: "over-the-shoulder or frame-within-frame reveal with strong backlight",
    threatRole: "the BOSS is hinted beyond the reveal, as silhouette, shadow, or reaching force",
    emotionalBeat: "wonder mixed with danger",
  },
  {
    titleZh: "追逐逃脱",
    titleEn: "Chase/escape route",
    missionObjective: "escort, escape, deliver, chase, or race through a route tied to the game loop",
    locationFamily: "road, bridge, tunnel, canyon, kitchen conveyor, town alley, forest lane, or sky path",
    cameraGrammar: "diagonal motion path with speed blur, dust trails, and cropped foreground",
    threatRole: "the BOSS chases, blocks the route, or bursts into the path",
    emotionalBeat: "breathless momentum",
  },
  {
    titleZh: "防守反击",
    titleEn: "Defense counterplay",
    missionObjective: "defend a base, oven, gate, cart, control point, recipe station, squad line, or town objective",
    locationFamily: "base entrance, kitchen fortress, gatehouse, command point, plaza, barricade, or arena edge",
    cameraGrammar: "triangular defense staging with clear front/mid/back layers",
    threatRole: "the BOSS is siege pressure, not just a mascot opponent",
    emotionalBeat: "desperate teamwork becoming comeback",
  },
  {
    titleZh: "胜利余波",
    titleEn: "Victory aftermath",
    missionObjective: "show the moment after a hard objective: reward, rescued item, crafted result, defeated threat, or unlocked path",
    locationFamily: "broken arena, repaired base, trophy table, glowing upgrade station, feast table, or newly opened route",
    cameraGrammar: "hero-and-reward payoff with lower camera, dust settling, and warm practical light",
    threatRole: "the BOSS appears restrained, receding, defeated, or implied through debris/shadow",
    emotionalBeat: "earned relief and triumph",
  },
  {
    titleZh: "地图远征",
    titleEn: "Map expedition",
    missionObjective: "communicate the game journey, route planning, biome progression, or multi-stage quest",
    locationFamily: "map table, branching path, caravan, region vista, floating islands, route board, or world gate",
    cameraGrammar: "layered travel-poster composition with foreground map/route element and distant objective",
    threatRole: "the BOSS becomes a destination threat, landmark, wanted mark, or looming weather system",
    emotionalBeat: "adventure promise",
  },
  {
    titleZh: "训练到决战",
    titleEn: "Training-to-boss contrast",
    missionObjective: "contrast preparation, crafting, cooking, upgrading, or training with the incoming boss-scale challenge",
    locationFamily: "workshop, training yard, kitchen station, upgrade bench, camp, locker room, or staging area",
    cameraGrammar: "foreground preparation detail contrasted with background threat reveal",
    threatRole: "the BOSS is foreshadowed through shadow, poster, window, breach, or distant arrival",
    emotionalBeat: "anticipation before impact",
  },
];

const POSTER_KV_ADAPTIVE_INTENT_AXES: PosterKvAdaptiveIntentAxis[] = [
  {
    titleZh: "Core loop promise",
    titleEn: "Core loop promise",
    question: "What is the clearest playable action or repeated loop the player should understand from this project?",
    directive: "Build a poster promise around the game's actual loop: cooking, matching, building, solving, collecting, racing, fighting, managing, exploring, decorating, surviving, socializing, or another project-native action.",
  },
  {
    titleZh: "Emotional fantasy",
    titleEn: "Emotional fantasy",
    question: "What feeling should the game sell first: cozy healing, comedy, tension, mastery, wonder, competition, romance, collection pride, horror, or victory?",
    directive: "Let the project's emotional tone define the poster format. A calm/healing game may need warmth and intimacy; a competitive game may need rivalry; a puzzle game may need aha-moment clarity; a character game may need charm and attachment.",
  },
  {
    titleZh: "Character appeal",
    titleEn: "Character appeal",
    question: "Are characters, mascots, factions, outfits, or relationships the main reason to click?",
    directive: "If character appeal is central, use a lineup, portrait-led key art, relationship moment, transformation, faction contrast, costume showcase, or expressive cast composition instead of forcing a battle scene.",
  },
  {
    titleZh: "World and setting hook",
    titleEn: "World and setting hook",
    question: "What place, world rule, time period, biome, room, map, or atmosphere makes this game different?",
    directive: "Make the environment carry the hook when the project is world-led: cozy room, shop, farm, city, battlefield, puzzle board, fantasy map, sci-fi control room, sports arena, school, haunted house, or another project-specific setting.",
  },
  {
    titleZh: "Progression reward",
    titleEn: "Progression reward",
    question: "What does the player earn, unlock, improve, rescue, collect, upgrade, restore, decorate, or become?",
    directive: "If progression is the selling point, make reward, before/after change, collection, upgrade, restoration, level completion, trophy, new area, or power growth the poster's center of gravity.",
  },
  {
    titleZh: "Gameplay proof",
    titleEn: "Gameplay proof",
    question: "Would the best poster show rules, board state, UI-like decision pressure, level layout, route, combo, or tactical choice?",
    directive: "For puzzle, strategy, simulation, roguelike, management, rhythm, sports, or arcade projects, the scheme may be a polished gameplay-proof KV rather than a character-versus-threat scene.",
  },
  {
    titleZh: "Conflict or challenge",
    titleEn: "Conflict or challenge",
    question: "If this project has enemies, rivals, danger, scarcity, timing, or pressure, what specific challenge should the poster dramatize?",
    directive: "Use conflict only when it belongs to the project. The challenge can be a boss, rival, timer, resource shortage, messy kitchen, failing machine, puzzle trap, storm, customer queue, rank race, or social dilemma.",
  },
  {
    titleZh: "Brand icon moment",
    titleEn: "Brand icon moment",
    question: "What single image could become the recognizable app-store, campaign, or social-share memory for this game?",
    directive: "When brand recognition matters, simplify around a mascot, emblem, signature prop, title lockup, iconic silhouette, faction symbol, collectible, or high-read thumbnail moment without repeating a generic poster fight.",
  },
];

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
  {
    titleZh: "Market chaos ensemble KV",
    titleEn: "Market chaos ensemble KV",
    briefZh: "Turn a busy town, kitchen, store, festival, base, or settlement hub into a lively campaign scene where the core loop erupts into action.",
    directive: [
      "Use a hub-chaos ensemble composition grounded in the current project, not a clean duel poster.",
      "The location must feel populated by props, signage-safe surfaces, route cues, resource stations, counters, carts, tables, gates, or environmental story details.",
      "Uploaded playable characters should be large enough to read while actively solving a situation: grabbing, defending, cooking, carrying, steering, rescuing, or dodging.",
      "The BOSS/key threat should disrupt the hub through shadow, breach, reach, falling objects, smoke, or route blockage rather than repeating a centered frontal lunge.",
    ].join(" "),
  },
  {
    titleZh: "Resource raid heist KV",
    titleEn: "Resource raid heist KV",
    briefZh: "Make the poster about a mission object, recipe, treasure, upgrade, cart, supply, or resource under pressure instead of a pure face-off.",
    directive: [
      "Use a resource-raid or heist composition where the key object/objective is the story trigger.",
      "A foreground prop, resource, recipe, crate, relic, cart, ingredient, upgrade station, or supply marker creates the main visual hook and safe copy area.",
      "Uploaded playable characters must physically carry, steal, defend, cook, repair, pull, or activate the object with readable faces and action.",
      "The BOSS/key threat interrupts the raid as a blocker, thief, ambusher, or environmental pressure source with contact shadows and VFX reaction.",
    ].join(" "),
  },
  {
    titleZh: "Map expedition KV",
    titleEn: "Map expedition KV",
    briefZh: "Use a route, map, region vista, expedition path, caravan, or quest-board composition to sell the game's adventure scope.",
    directive: [
      "Use a travel/expedition campaign composition with a readable route through the current project's world.",
      "Foreground should contain a map, signpost, route board, travel prop, vehicle, path marker, or terrain edge that leads the eye into the distance.",
      "Uploaded playable characters must be on the journey with expressive intent: pointing, charging, steering, climbing, scouting, or protecting the route.",
      "The BOSS/key threat should appear as a destination pressure, silhouette, landmark, storm, wanted mark, or distant obstacle rather than another close-up duel.",
    ].join(" "),
  },
  {
    titleZh: "Training-to-boss contrast KV",
    titleEn: "Training-to-boss contrast KV",
    briefZh: "Contrast preparation, crafting, cooking, upgrade, training, or staging with the incoming boss-scale challenge.",
    directive: [
      "Use a preparation-versus-threat composition that shows what the player is doing before the big encounter.",
      "Foreground/midground should show a project-specific preparation action: crafting, cooking, loading, repairing, training, upgrading, planning, or guarding.",
      "The uploaded playable roster must be readable and active in the preparation moment, not simply parked in a battle pose.",
      "The BOSS/key threat appears as foreshadowing through a doorway, shadow, window, poster, smoke breach, far silhouette, or incoming impact cue.",
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

function adaptiveIntentAxisOrderForSeed(seed: string): number[] {
  return POSTER_KV_ADAPTIVE_INTENT_AXES
    .map((_lane, index) => index)
    .sort((left, right) => {
      const leftHash = hashSeed(`${seed}:poster-kv-adaptive-intent:${left}`);
      const rightHash = hashSeed(`${seed}:poster-kv-adaptive-intent:${right}`);
      return leftHash - rightHash || left - right;
    });
}

function adaptiveIntentAxisForSlot(seed: string, slotIndex: number): PosterKvAdaptiveIntentAxis {
  const order = adaptiveIntentAxisOrderForSeed(seed);
  const index = order[positiveModulo(slotIndex, order.length)] || 0;
  return POSTER_KV_ADAPTIVE_INTENT_AXES[index] || POSTER_KV_ADAPTIVE_INTENT_AXES[0]!;
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
    const axis = adaptiveIntentAxisForSlot(seed, index);
    return `${index + 1}. Composition scaffold: ${architecture.titleZh} / ${architecture.titleEn}: ${architecture.briefZh} Adaptive poster-intent axis: ${axis.titleZh} / ${axis.titleEn}. Question: ${axis.question} Direction: ${axis.directive} This axis is a planning question, not a fixed scene template; infer a project-native poster promise from projectName, gameDescription, focusGuidance, creativeDirection, and uploaded assets.`;
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
    : "Create a project-specific objective, emotional hook, gameplay system, obstacle, reward, relationship beat, or pressure source from the game description instead of inventing an unrelated BOSS.";
  const logoLine = input.assetCounts.logos > 0
    ? "Use exactly one [Game Logo] treatment. Reproduce the uploaded logo only if accurate; otherwise reserve a polished blank logo-safe plate without fake letters."
    : "Reserve a clean campaign logo/copy safe area without inventing fake readable brand text.";

  return [
    `KV architecture lock: ${architecture.titleZh} / ${architecture.titleEn}. ${architecture.briefZh}`,
    architecture.directive,
    characterLine,
    bossLine,
    logoLine,
    "AI render base: official game campaign key visual, project-native poster promise, strong foreground/midground/background depth, decisive camera angle, practical key/fill/rim lighting, atmosphere or clean graphic clarity as the genre requires, cast/contact shadows, readable thumbnail silhouette, and no sticker collage.",
    "Use uploaded references as identity/model-sheet anchors, not pasted picture-in-picture panels. The prompt may direct action, camera, environment, lighting, and effects, but must not redesign hair, face, outfit, body type, species, logo lettering, or signature props.",
    "Typography treatment: if slogan/logo text cannot be spelled cleanly, create a polished in-world blank ribbon, sign, title plate, or logo-safe surface instead of broken text or fake words.",
  ].join("\n");
}

export function posterIdentitySafeMotionRule(): string {
  return "Identity-safe motion hierarchy: never improve action by redesigning an uploaded character, but do not use identity safety as an excuse for an unchanged static cutout. Preserve exact identity while requiring at least one readable performance change; if full re-posing risks drift, use a 3/4 turn, grip/contact, foreshortened prop/tool angle, facial expression, camera perspective, foreground occlusion, VFX, lighting, and environment motion.";
}

export function posterHeroPerformanceScaleLock(): string {
  return "Hero performance scale lock: at least one uploaded playable protagonist must occupy 24-38% of canvas height or equivalent foreground/midground visual weight, with readable face, emotion, body language, and signature prop/tool; it must be staged before logo/slogan placement, physically interacting with the core mechanic, objective, environment, prop, other character, or BOSS/threat when the project has one, and must not be tiny, hidden, back-facing, cropped into insignificance, or visually subordinate to the logo, slogan, BOSS/threat, or background.";
}

export function posterLogoSingleUseLock(): string {
  return "Logo single-use lock: when a brandLogo/gameLogo reference is present, render exactly one campaign logo treatment as an in-world brand object or restrained campaign lockup. A storefront sign, title plaque, carved board, neon sign, fire-lit sign, flag, UI emblem, or corner lockup all count as the one logo treatment; do not repeat the uploaded logo again as a second shop sign, badge, watermark, tiny duplicate, floating sticker, or alternate title.";
}

export function posterSubjectAccessoryStrictnessLock(): string {
  return "Uploaded subject accessory lock: do not give protagonists or BOSS new shields, weapons, armor, tools, facial features, costume parts, horns, crowns, or props just because a scheme mentions them. If that object is not visibly present in the uploaded reference, reinterpret the action through body movement, camera, environment, particles, or existing visible uploaded props only.";
}

export function posterPoseClarityLock(): string {
  return "Pose clarity lock: keep chibi/mascot action anatomically readable; prefer grounded or clear-landing poses over airborne spins. Each visible hero must read as one body with exactly two arms and two legs/feet unless naturally hidden. Separate props, plates, and motion trails from hands/feet; no third hand, third foot, duplicated leg, or prop-as-limb silhouette.";
}

export function posterStaticSchemeLanguageBan(): string {
  return "Static scheme language ban: scheme briefs and prompts must not rely on static placeholder staging such as '[Game Character 1] stands', 'stands heroically', 'is placed', 'is located', 'faces off', '站在', '英勇地站在', '位于', '摆放', '对峙', or '从一侧压迫'. Use active verbs such as sprint, block, slide, leap, brace, collide, lunge, strike, burst, recoil, defend, chase, discover, or restrain.";
}

export function posterSchemeBlueprintRequirement(): string {
  return "Scheme blueprint requirement: every generated poster scheme must explicitly carry camera/lens/perspective, foreground-midground-background layers, key/fill/rim lighting, physical action contact point, environmental reaction/VFX, one logo treatment location, and slogan/copy treatment or copy-safe fallback.";
}

export function posterKvArchitectureDiversityRequirement(): string {
  return "Adaptive poster diversity requirement / KV architecture diversity requirement: projectName, gameDescription, focusGuidance, creativeDirection, uploaded assets, genre, tone, and core loop decide the poster promise first. The architecture slots are anti-repetition composition scaffolds, not a whitelist of allowed scenes. Across a batch, infer different project-native poster promises such as character appeal, cozy/healing mood, gameplay proof, progression reward, collection showcase, world/setting hook, event/social moment, puzzle aha moment, management pressure, sports rivalry, horror suspense, romance/relationship beat, boss encounter, objective crisis, or brand-icon thumbnail when they fit the project. Do not force every game into combat, BOSS pressure, portal, town, chase, or resource-raid scenarios. At most one scheme in a batch may be a pure frontal hero-vs-BOSS standoff, and only when that fits the project; other schemes must sell different player promises from the actual brief. If a BOSS or threat asset appears in multiple schemes, vary its story role or use it only where appropriate. If the project is non-combat, cozy, puzzle, sim, fashion, story, sports, education, or collection-led, replace BOSS/threat language with objective, emotion, relationship, system, reward, setting, or gameplay tension. If a diagonal divider appears it must be an active story/comparison path rather than a static line with subjects parked on each side.";
}

export function posterFocalHierarchyLock(): string {
  return "Focal hierarchy lock: design the poster around one readable project-native promise first, then place brand and copy. The protagonist action, core mechanic, emotional moment, mission objective, world hook, reward, gameplay proof, environmental pressure, or hero-vs-BOSS beat must own the brightest focal contrast and clearest silhouette path; logo and slogan are supporting campaign elements, never the largest or sharpest subject cluster.";
}

export function posterTextEconomyLock(): string {
  return "Text economy lock: after the logo treatment is placed, allow at most one slogan/copy-bearing campaign zone in the whole poster. Combine logo and slogan into one compact campaign-safe typography zone whenever possible, leaving the rest of the canvas for action, faces, scale, atmosphere, gameplay proof, emotion, and story. Do not add a second caption zone, lower-left or lower-right label, corner badge, stacked right-side text wall, UI label strip, bottom plaque, duplicate translation, blank extra title plate, or decorative subtitle that steals attention from the main visual promise.";
}

export function posterInWorldBrandTreatmentLock(): string {
  return "In-world brand treatment lock: logo and slogan should feel physically present in the scene through perspective, material, light, shadow, occlusion, and atmospheric effects, such as a fire-lit sign, carved plaque, neon board, banner, menu board, hologram, smoke ribbon, or title plate. Do not paste flat sticker typography on top of the artwork.";
}

export function posterCinematicKvQualityDirective(): string {
  return [
	    "## Cinematic Game KV Quality Override",
    "Target the feel of a top-tier game campaign key visual, adapted to the uploaded art style and the current project's genre/tone. Cinematic means deliberate staging, lighting, hierarchy, and emotion; it does not always mean combat, explosions, BOSS pressure, or photorealism.",
    "Cinematography: choose a deliberate camera language such as low-angle hero shot, 24-35mm wide cinematic lens feel, forced perspective, over-the-shoulder danger reveal, foreground occlusion, diagonal motion path, or portal/window frame-within-frame. Avoid neutral side-view staging.",
    "Lighting: design a clear key light, colored fill, hard rim/back light, and a motivated project-specific practical light source such as portal glow, fire, magic, tech screens, warning lights, moonlight, explosion light, or energy effects.",
    "VFX and particles: add layered project-specific particles that serve the story: dust, sparks, embers, smoke, debris, magic trails, tech fragments, motion arcs, shockwave rings, weather, atmospheric haze, and depth-of-field separation. Particles must follow action direction, not random decoration.",
    "Story beat: make the image capture a decisive project-native second from the current game: cozy restoration, character charm, puzzle realization, cooking/service rush, collection reveal, race finish, tactical choice, exploration discovery, upgrade payoff, social event, boss encounter, or objective pressure when appropriate. The viewer should understand what the game promises.",
    "Campaign escalation: raise the set-piece like launch splash art while respecting genre. This can be giant scale contrast, intimate warm lighting, charming character staging, clean gameplay proof, dramatic foreground prop cropping, visible before-after transformation, project-specific VFX, or a clear emotional/goal tension inside the same frame.",
    "Character performance: uploaded heroes must show readable emotion, weight, line of action, gesture, and contact with the scene. At least one hero should interact physically with the core mechanic, environment, prop, other character, objective, or BOSS/threat when the project has one. Avoid floating sticker poses, static front-facing mascot poses, or symmetrical corner jumps.",
    posterPoseClarityLock(),
    posterFocalHierarchyLock(),
    posterTextEconomyLock(),
    posterInWorldBrandTreatmentLock(),
    "Contact and occlusion audit: every hero/BOSS foot, hand, weapon, or body part that touches a surface must create contact shadow, cast shadow, small occlusion, bounce color, and local material reaction. Avoid clean cutout edges floating over props or terrain.",
    "Asset performance: every uploaded visual reference must be assigned a semantic poster duty before rendering: protagonist, antagonist, brand logo, prop, environment, style reference, composition reference, key subject, or supporting asset. The duty determines how it enters the story; do not treat every upload as a flat sticker.",
    posterIdentitySafeMotionRule(),
    posterHeroPerformanceScaleLock(),
    posterSubjectAccessoryStrictnessLock(),
    posterStaticSchemeLanguageBan(),
    posterSchemeBlueprintRequirement(),
    posterKvArchitectureDiversityRequirement(),
    "Environment or format set-piece: build a memorable project-native visual container: character lineup, cozy room, shop/farm/home, gameplay board, puzzle layout, UI-like decision surface, collectible shelf, world map, town, battlefield, base, portal, ruins, forest, canyon, command area, road, arena, machine room, or another setting that follows the user's brief.",
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
    ? "Use [Boss] according to the selected scheme's poster promise, not as a mandatory centerpiece. For threat, defense, pursuit, crisis, or boss-encounter schemes, [Boss] can be the dominant antagonist/key creature with believable weight, contact, shadow, and scene interaction. For gameplay-proof, reward, cozy, collection, map, training, shop/home, lineup, or character-appeal schemes, [Boss] may become secondary pressure, a distant silhouette, wanted mark, shadow, trophy, environmental hazard, route blocker, or be omitted so the non-threat promise owns the hierarchy."
    : "Use the main objective, mechanic, reward, environment, relationship, or challenge from the project premise as the central poster driver instead of inventing an unrelated antagonist.";
  const logoLine = input.assetCounts.logos > 0
    ? "Allocate one campaign-safe [Game Logo] treatment, readable but secondary to the trailer-moment story beat. Use the exact uploaded logo only if lettering can stay accurate; otherwise reserve a polished blank logo-safe plate without fake text."
    : "Reserve a clean campaign-safe logo area without inventing a fake logo.";

  return [
    "## Mandatory KV Composition Architecture Override",
    `Architecture: ${architecture.titleZh} / ${architecture.titleEn}.`,
    `Selected-scheme architecture lock: this render must visibly use ${architecture.titleZh} as its primary scene structure. Do not fall back to a generic mascot lineup, flat side-view battlefield, unrelated sample-project scene, or the same composition used by another scheme in the batch.`,
    "Composition reference priority rule: uploaded compositionReference images are guide-only for camera energy, layout rhythm, safe-area hierarchy, subject scale, and depth. They must never override this selected-scheme architecture, and they must not make every scheme share the same scene, background, pose arrangement, or action beat.",
    architecture.directive,
    posterCinematicKvQualityDirective(),
    "Internal blueprint requirement: before rendering, design the poster as a finished campaign key visual with five clear layers, but do not print layer labels. Layer 1: foreground framing element, gameplay object, UI-like surface, environment edge, prop, or project-specific object with perspective. Layer 2: uploaded hero performance with readable faces, expressive action, and signature props. Layer 3: the project-native focus chosen by the scheme: BOSS/key threat only when the promise is threat-led, otherwise core mechanic, reward, relationship, objective, collection, puzzle, place, character charm, or emotional hook. Layer 4: world context that tells the current project's game loop. Layer 5: clean logo/copy safe area integrated into the art.",
    "KV scoring rubric to satisfy before final image: the composition must read in one second, have a strong silhouette thumbnail, show an obvious story conflict, contain foreground-midground-background depth, use directional lighting and rim light, and feel like a designed game launch key art rather than an in-game screenshot or simple illustration.",
    "Prototype-quality target: richer value range, painterly/cel hybrid detail, atmospheric haze, bounce light, cast shadows, motion arcs, project-specific debris/VFX, readable focal contrast, and designed negative space. Keep the uploaded cartoon identity, but raise the finish above flat children's-book art.",
    "Set-piece requirement: build a memorable project-native poster format with props, characters, gameplay surface, cozy room, store/farm/home, architecture, terrain, route, UI-like proof, collection display, puzzle state, machines, town elements, or framed vistas from the current project. Avoid empty pastel sky, soft gradient backdrop, generic open field, and unrelated sample-project scenery.",
    "Reference identity lock: the uploaded images are the source of truth. The prompt may change action, pose, expression, angle, lighting, and scene integration only. Do not change age, hair color, hairstyle, costume, body proportions, species, tool identity, or add facial hair/extra features not visible in the uploaded reference.",
    "Reference pose release: do not treat the uploaded still image as the final pose. Preserve identity, silhouette, and signature props, but repaint the hero/BOSS with a new performance such as 3/4 turn, stride, leap, recoil, attack wind-up, defensive block, landing impact, or foreshortened prop/tool angle.",
    posterPoseClarityLock(),
    "Static scheme action rewrite: if an older or generated scheme says the hero stands on a divider and the BOSS presses from one side, reinterpret it as an active trailer moment: the hero sprints, blocks, slides, leaps, or collides with the divider while the BOSS lunges, swings, bursts through, lands, or recoils from impact.",
    posterStaticSchemeLanguageBan(),
    posterSchemeBlueprintRequirement(),
    posterKvArchitectureDiversityRequirement(),
    posterFocalHierarchyLock(),
    posterTextEconomyLock(),
    posterInWorldBrandTreatmentLock(),
    "Semantic asset duty lock: do not hard-code only three asset categories. Protagonists carry performance, antagonists carry pressure, logos carry brand readability, props become story triggers, environments shape the set piece, style references shape rendering, and composition references shape layout only.",
    posterLogoSingleUseLock(),
    posterSubjectAccessoryStrictnessLock(),
    `Playable roster staging: use exactly ${characterPlaceholders} as the visible playable/human hero roster. Keep them recognizable from uploaded references, but repaint/repose them as living actors with 3/4 readable faces, expressive emotion, dynamic limbs, action intent, contact shadows, rim light, and environmental occlusion. Do not use back-facing, tiny, static, or pasted-looking cutout poses.`,
    "Hero performance lock: every uploaded playable character that appears must show a readable face in front view, 3/4 front view, or strong readable profile. Do not show any uploaded playable character only from the back, hidden behind another subject, or too small to identify.",
    "Grounded action lock: at least one uploaded hero must physically interact with the core mechanic, objective, environment, prop, other character, or BOSS/threat when present through impact, blocking, climbing, sliding, pulling, striking, casting, piloting, repairing, rescuing, decorating, serving, solving, pointing, collecting, or defending. Do not leave heroes floating symmetrically around the scene like stickers unless the jump has clear motion trail, shadow, and landing target.",
    "Contact and occlusion lock: if a character stands on, grips, blocks with, strikes, or is hit by a giant prop or terrain, show the actual overlap edge, contact shadow, cast shadow, reflected color, pressure dent/scratch/spark/debris burst, and particle interruption at the contact point.",
    posterHeroPerformanceScaleLock(),
    bossLine,
    logoLine,
    "Composition ban for this render: do not make a simple horizontal product-landscape battlefield, empty mascot poster, centered BOSS with two heroes flying at the corners, or small heroes standing on the left/right. Do not introduce scenery from an unrelated sample project. Any terrain, UI-like surface, character lineup, cozy space, gameplay proof, or prop must support the assigned/adapted KV architecture with strong perspective, story pressure or emotional clarity, foreground framing, and vertical depth.",
    "Typography rule: avoid long generated sentences inside the image. Prefer the uploaded logo plus compact custom campaign lettering of 3-8 words or a polished blank ribbon/title plate that can receive final copy later. Never let text become the main visual solution.",
  ].join("\n");
}
