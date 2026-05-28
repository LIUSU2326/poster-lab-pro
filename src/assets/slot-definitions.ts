import type { ProductionMode } from "../schema/zod";
import {
  AssetSlotDefinitionSchema,
  type AssetSlotDefinition,
} from "./contracts";

const rawModeAssetSlots = {
  poster: [
    {
      id: "poster-character",
      mode: "poster",
      role: "gameCharacter",
      label: "Character or hero subject",
      required: false,
      usage: ["input", "reference"],
      description: "Main game character, squad, creature, or hero subject used to anchor the poster.",
    },
    {
      id: "poster-logo",
      mode: "poster",
      role: "gameLogo",
      label: "Game logo",
      required: false,
      usage: ["input"],
      description: "Logo or wordmark that should remain readable in campaign outputs.",
    },
    {
      id: "poster-composition",
      mode: "poster",
      role: "compositionReference",
      label: "Composition reference",
      required: false,
      usage: ["reference"],
      description: "Optional layout reference for camera angle, subject placement, and text areas.",
    },
  ],
  collab: [
    {
      id: "collab-game-character",
      mode: "collab",
      role: "gameCharacter",
      label: "Game character",
      required: true,
      usage: ["input", "reference"],
      description: "Game-side character locked to uploaded appearance references.",
    },
    {
      id: "collab-partner-character",
      mode: "collab",
      role: "collabCharacter",
      label: "Collab partner character",
      required: true,
      usage: ["input", "reference"],
      description: "Partner-side character or mascot, never merged with the game character.",
    },
    {
      id: "collab-game-logo",
      mode: "collab",
      role: "gameLogo",
      label: "Game logo",
      required: true,
      usage: ["input"],
      description: "Game brand mark used for co-branded campaign output.",
    },
    {
      id: "collab-brand-logo",
      mode: "collab",
      role: "brandLogo",
      label: "Partner brand logo",
      required: false,
      usage: ["input"],
      description: "Partner brand mark used when the campaign needs explicit logo pairing.",
    },
    {
      id: "collab-scene",
      mode: "collab",
      role: "background",
      label: "Crossover scene",
      required: false,
      usage: ["reference"],
      description: "Optional scene or prop reference for how the collaboration enters the game world.",
    },
  ],
  announcement: [
    {
      id: "announcement-character",
      mode: "announcement",
      role: "gameCharacter",
      label: "Announcement character",
      required: false,
      usage: ["reference"],
      description: "Character or group-shot reference used when the announcement should include cast presence.",
    },
    {
      id: "announcement-scene",
      mode: "announcement",
      role: "background",
      label: "Game scene",
      required: true,
      usage: ["input", "reference"],
      description: "Scene, event background, or UI-like surface for announcement typography.",
    },
    {
      id: "announcement-logo",
      mode: "announcement",
      role: "gameLogo",
      label: "Brand/logo",
      required: false,
      usage: ["input"],
      description: "Optional brand lockup for maintenance, update, or event announcement visuals.",
    },
  ],
  logo: [
    {
      id: "logo-wordmark-reference",
      mode: "logo",
      role: "gameLogo",
      label: "Existing wordmark",
      required: false,
      usage: ["reference"],
      description: "Optional existing logo or typography reference for wordmark continuity.",
    },
    {
      id: "logo-visual-element",
      mode: "logo",
      role: "prop",
      label: "Visual element",
      required: false,
      usage: ["reference"],
      description: "Game prop, item, or symbol that can influence the 3D wordmark shape.",
    },
  ],
  icon: [
    {
      id: "icon-subject",
      mode: "icon",
      role: "subjectReference",
      label: "Icon subject",
      required: true,
      usage: ["input", "reference"],
      description: "Primary subject that must remain faithful in full-bleed square icon output.",
    },
    {
      id: "icon-style",
      mode: "icon",
      role: "styleReference",
      label: "Style reference",
      required: false,
      usage: ["reference"],
      description: "Optional rendering style guide for finish, lighting, and material feel.",
    },
    {
      id: "icon-composition",
      mode: "icon",
      role: "compositionReference",
      label: "Composition reference",
      required: false,
      usage: ["reference"],
      description: "Optional icon framing and subject scale reference.",
    },
  ],
} satisfies Record<ProductionMode, readonly unknown[]>;

export const modeAssetSlots = Object.fromEntries(
  Object.entries(rawModeAssetSlots).map(([mode, slots]) => [
    mode,
    slots.map((slot) => AssetSlotDefinitionSchema.parse(slot)),
  ]),
) as Record<ProductionMode, AssetSlotDefinition[]>;

export function getModeAssetSlots(mode: ProductionMode): AssetSlotDefinition[] {
  return modeAssetSlots[mode].map((slot) => AssetSlotDefinitionSchema.parse(slot));
}

export function getRequiredAssetSlots(mode: ProductionMode): AssetSlotDefinition[] {
  return getModeAssetSlots(mode).filter((slot) => slot.required);
}
