import { zodResolver } from "@hookform/resolvers/zod";
import type { Resolver } from "react-hook-form";
import { z } from "zod";
import {
  ModeFormSchema,
  OutputSettingsFormSchema,
  ProductionModeSchema,
  ProjectBriefFormSchema,
  ProviderIdSchema,
  SloganSettingsFormSchema,
  type ProductionMode,
  type ProviderId,
} from "../schema/zod";
import {
  createModeFormDefaults,
  createOutputSettingsDefaults,
  createProjectBriefDefaults,
  createSloganSettingsDefaults,
} from "../schema/zod-defaults";
import { lockedFieldsForPromptMode } from "../prompts/guardrails";

export const GenerationFormSchema = z
  .object({
    mode: ProductionModeSchema,
    projectBrief: ProjectBriefFormSchema,
    outputSettings: OutputSettingsFormSchema,
    sloganSettings: SloganSettingsFormSchema,
    modeForm: ModeFormSchema,
    providerId: ProviderIdSchema.default("openai"),
    selectedSchemeIds: z.array(z.string().min(1)).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.outputSettings.mode !== value.mode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outputSettings", "mode"],
        message: `Output settings mode must match ${value.mode}.`,
      });
    }

    if (value.modeForm.mode !== value.mode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modeForm", "mode"],
        message: `Mode form must match ${value.mode}.`,
      });
    }
  });

export type GenerationFormValues = z.infer<typeof GenerationFormSchema>;
export type GenerationFormMode = GenerationFormValues["mode"];

export const generationFormModes: ProductionMode[] = ["poster", "collab", "announcement", "logo", "icon"];

export function createGenerationFormDefaults(
  mode: ProductionMode = "poster",
  input: Partial<GenerationFormValues> = {},
): GenerationFormValues {
  const outputSettings = {
    ...createOutputSettingsDefaults(mode),
    ...(input.outputSettings || {}),
    mode,
  };
  const modeForm = input.modeForm?.mode === mode ? input.modeForm : createModeFormDefaults(mode);

  return GenerationFormSchema.parse({
    mode,
    projectBrief: {
      ...createProjectBriefDefaults(mode),
      ...(input.projectBrief || {}),
    },
    outputSettings,
    sloganSettings: {
      ...createSloganSettingsDefaults(),
      ...(input.sloganSettings || {}),
    },
    modeForm,
    providerId: input.providerId || "openai",
    selectedSchemeIds: input.selectedSchemeIds || [],
  });
}

export function createGenerationFormDefaultsByMode(): Record<ProductionMode, GenerationFormValues> {
  return Object.fromEntries(
    generationFormModes.map((mode) => [mode, createGenerationFormDefaults(mode)]),
  ) as Record<ProductionMode, GenerationFormValues>;
}

export function parseGenerationFormValues(value: unknown): GenerationFormValues {
  return GenerationFormSchema.parse(value);
}

export function getGenerationFormLockedFields(mode: ProductionMode): string[] {
  return lockedFieldsForPromptMode(mode);
}

export function switchGenerationFormMode(
  current: GenerationFormValues,
  nextMode: ProductionMode,
): GenerationFormValues {
  return createGenerationFormDefaults(nextMode, {
    projectBrief: {
      ...current.projectBrief,
      focusGuidance: current.projectBrief.focusGuidance,
    },
    sloganSettings: current.sloganSettings,
    providerId: current.providerId as ProviderId,
    selectedSchemeIds: [],
  });
}

export function createGenerationFormResolver(): Resolver<GenerationFormValues> {
  return zodResolver(GenerationFormSchema) as Resolver<GenerationFormValues>;
}
