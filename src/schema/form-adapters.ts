import type { ZodType } from "zod";
import {
  AnnouncementModeFormSchema,
  CollabModeFormSchema,
  IconModeFormSchema,
  LogoModeFormSchema,
  ModeFormSchema,
  OutputSettingsFormSchema,
  PosterModeFormSchema,
  ProjectBriefFormSchema,
  ProviderConfigFormSchema,
  SloganSettingsFormSchema,
  type ModeForm,
  type OutputSettingsForm,
  type ProductionMode,
  type ProjectBriefForm,
  type ProviderConfigForm,
  type SloganSettingsForm,
} from "./zod";
import {
  createModeFormDefaults,
  createOutputSettingsDefaults,
  createProjectBriefDefaults,
  createProviderConfigDefaults,
  createSloganSettingsDefaults,
} from "./zod-defaults";

export type FormControlKind =
  | "text"
  | "textarea"
  | "switch"
  | "segmented"
  | "chipGroup"
  | "assetPicker"
  | "platformPresetGrid"
  | "slider"
  | "numberStepper"
  | "select"
  | "secret"
  | "color"
  | "readonlyNotice";

export type FormDensity = "compact" | "standard" | "expanded";
export type SubmitTarget = "draft" | "scheme-generation" | "batch-render" | "provider-settings";

export type FieldAdapter<TValues> = {
  name: string;
  label: string;
  control: FormControlKind;
  required?: boolean | undefined;
  helper?: string | undefined;
  options?: readonly string[] | undefined;
  readonly?: boolean | undefined;
  density?: FormDensity | undefined;
};

export type FieldGroupAdapter<TValues> = {
  id: string;
  label: string;
  description?: string;
  collapsedByDefault?: boolean;
  fields: readonly FieldAdapter<TValues>[];
};

export type FormAdapter<TValues> = {
  id: string;
  title: string;
  schema: ZodType<TValues>;
  defaultValues: TValues;
  submitTarget: SubmitTarget;
  groups: readonly FieldGroupAdapter<TValues>[];
};

export const projectBriefAdapter: FormAdapter<ProjectBriefForm> = {
  id: "project-brief",
  title: "Project brief",
  schema: ProjectBriefFormSchema,
  defaultValues: createProjectBriefDefaults(),
  submitTarget: "draft",
  groups: [
    {
      id: "brief",
      label: "01 Brief",
      fields: [
        { name: "projectName", label: "Game name", control: "text", required: true },
        { name: "gameDescription", label: "Game description", control: "textarea", required: true, density: "expanded" },
        { name: "focusGuidanceEnabled", label: "Focus guidance", control: "switch" },
        {
          name: "focusGuidance",
          label: "Focus note",
          control: "textarea",
          helper: "Limits random concept spread without turning the tool into a rigid template.",
        },
      ],
    },
  ],
};

export function createOutputSettingsAdapter(mode: ProductionMode): FormAdapter<OutputSettingsForm> {
  return {
    id: `${mode}-output-settings`,
    title: "Output settings",
    schema: OutputSettingsFormSchema,
    defaultValues: createOutputSettingsDefaults(mode),
    submitTarget: "batch-render",
    groups: [
      {
        id: "platform",
        label: "04 Output",
        fields: [
          { name: "platformPresets", label: "Platform presets", control: "platformPresetGrid", required: true },
          {
            name: "aspectRatios",
            label: "Aspect ratios",
            control: "chipGroup",
            required: true,
            readonly: mode === "icon",
            helper: mode === "icon" ? "Icon mode is locked to 1:1." : undefined,
          },
          { name: "customSize", label: "Custom size", control: "text" },
          { name: "schemeCount", label: "Scheme count", control: "slider", required: true },
          { name: "imagesPerScheme", label: "Images per scheme", control: "numberStepper", required: true },
        ],
      },
    ],
  };
}

export const sloganSettingsAdapter: FormAdapter<SloganSettingsForm> = {
  id: "slogan-settings",
  title: "Slogan settings",
  schema: SloganSettingsFormSchema,
  defaultValues: createSloganSettingsDefaults(),
  submitTarget: "scheme-generation",
  groups: [
    {
      id: "slogan",
      label: "Slogan",
      fields: [
        { name: "mode", label: "Slogan mode", control: "segmented", options: ["off", "auto", "global"] },
        { name: "globalSlogan", label: "Global slogan", control: "text" },
        { name: "languages", label: "Languages", control: "chipGroup", options: ["zh-CN", "en-US", "ja-JP", "ko-KR"] },
      ],
    },
  ],
};

export function createProviderSettingsAdapter(providerId = "openai"): FormAdapter<ProviderConfigForm> {
  return {
    id: "provider-settings",
    title: "Model and API Key",
    schema: ProviderConfigFormSchema,
    defaultValues: createProviderConfigDefaults(providerId as ProviderConfigForm["providerId"]),
    submitTarget: "provider-settings",
    groups: [
      {
        id: "provider",
        label: "Provider",
        fields: [
          { name: "providerId", label: "Provider", control: "segmented", options: ["openai", "aigocode", "google", "deepseek", "claude", "qwen"] },
          { name: "enabled", label: "Enabled", control: "switch" },
          { name: "apiKey", label: "API Key", control: "secret", helper: "Masked by default. Static prototype does not persist credentials." },
          { name: "baseUrl", label: "Base URL", control: "text" },
          { name: "defaultModel", label: "Default model", control: "select" },
          { name: "modelSlots", label: "Task model routing", control: "select" },
        ],
      },
    ],
  };
}

const modeSchemaMap = {
  poster: PosterModeFormSchema,
  collab: CollabModeFormSchema,
  announcement: AnnouncementModeFormSchema,
  logo: LogoModeFormSchema,
  icon: IconModeFormSchema,
} satisfies Record<ProductionMode, ZodType<ModeForm>>;

const modeGroups = {
  poster: [
    {
      id: "poster-direction",
      label: "03 Direction",
      fields: [
        { name: "styleTags", label: "Style tags", control: "chipGroup", required: true },
        { name: "compositionReferenceStrength", label: "Composition reference", control: "segmented", options: ["weak", "composition", "highFidelityComposition"] },
      ],
    },
  ],
  collab: [
    {
      id: "collab-brand",
      label: "Collab",
      fields: [
        { name: "collabBrandName", label: "Partner brand", control: "text", required: true },
        { name: "collabStyleInjection", label: "Style injection", control: "segmented", options: ["native", "brand", "game"] },
        {
          name: "characterPlaceholdersOnly",
          label: "Character placeholder lock",
          control: "readonlyNotice",
          readonly: true,
          helper: "Planning can only use [Game Character] and [Collab Partner].",
        },
        {
          name: "preventCharacterMerge",
          label: "Prevent character merge",
          control: "readonlyNotice",
          readonly: true,
          helper: "The two IP entities must remain separate.",
        },
      ],
    },
  ],
  announcement: [
    {
      id: "announcement-copy",
      label: "Announcement",
      fields: [
        { name: "announcementTitle", label: "Announcement title", control: "text", required: true },
        { name: "copyPreset", label: "Copy preset", control: "chipGroup" },
        { name: "layoutMode", label: "Layout mode", control: "segmented", options: ["integratedTypography", "regularPanel"] },
        { name: "groupShotWhenMultiCharacter", label: "Group-shot planning", control: "switch" },
      ],
    },
  ],
  logo: [
    {
      id: "logo-wordmark",
      label: "Logo",
      fields: [
        { name: "wordmark", label: "Wordmark", control: "text", required: true },
        { name: "solidBackground", label: "Solid background required", control: "readonlyNotice", readonly: true },
        { name: "backgroundColor", label: "Background color", control: "color" },
        { name: "wordmarkIsPrimarySubject", label: "Wordmark priority", control: "readonlyNotice", readonly: true },
      ],
    },
  ],
  icon: [
    {
      id: "icon-constraints",
      label: "Icon",
      fields: [
        { name: "aspectRatio", label: "Aspect ratio", control: "readonlyNotice", readonly: true, helper: "Icon mode is locked to 1:1." },
        { name: "noText", label: "No text", control: "readonlyNotice", readonly: true },
        { name: "fullBleedSquare", label: "Full-bleed square", control: "readonlyNotice", readonly: true },
        { name: "compositionReferenceRotation", label: "Reference rotation", control: "switch" },
      ],
    },
  ],
} satisfies Record<ProductionMode, readonly FieldGroupAdapter<ModeForm>[]>;

export function createModeFormAdapter(mode: ProductionMode): FormAdapter<ModeForm> {
  return {
    id: `${mode}-mode-form`,
    title: `${mode} mode`,
    schema: modeSchemaMap[mode],
    defaultValues: createModeFormDefaults(mode),
    submitTarget: "scheme-generation",
    groups: modeGroups[mode],
  };
}

export function createWorkbenchFormAdapters(mode: ProductionMode) {
  return {
    projectBrief: projectBriefAdapter,
    mode: createModeFormAdapter(mode),
    slogan: sloganSettingsAdapter,
    output: createOutputSettingsAdapter(mode),
    provider: createProviderSettingsAdapter(),
  };
}

export const allModeFormAdapters = {
  poster: createModeFormAdapter("poster"),
  collab: createModeFormAdapter("collab"),
  announcement: createModeFormAdapter("announcement"),
  logo: createModeFormAdapter("logo"),
  icon: createModeFormAdapter("icon"),
} satisfies Record<ProductionMode, FormAdapter<ModeForm>>;

export function parseAdapterDefaults<TValues>(adapter: FormAdapter<TValues>): TValues {
  return adapter.schema.parse(adapter.defaultValues);
}
