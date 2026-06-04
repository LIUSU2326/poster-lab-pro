import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const issues = [];
const root = process.cwd();

function assert(condition, message) {
  if (!condition) issues.push(message);
}

function includes(html, token, label) {
  assert(html.includes(token), `${label}: missing "${token}"`);
}

function excludes(html, token, label) {
  assert(!html.includes(token), `${label}: should not include "${token}"`);
}

function findButtonTag(html, marker, label) {
  const markerIndex = html.indexOf(marker);
  assert(markerIndex >= 0, `${label}: missing button marker "${marker}"`);
  if (markerIndex < 0) return "";
  const start = html.lastIndexOf("<button", markerIndex);
  const end = html.indexOf(">", markerIndex);
  assert(start >= 0 && end >= 0, `${label}: could not isolate button for "${marker}"`);
  return start >= 0 && end >= 0 ? html.slice(start, end + 1) : "";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeModeState(snapshot, mode, patch = {}) {
  return (snapshot.modeStates || []).map((modeState) => (
    modeState.mode === mode
      ? {
          ...modeState,
          ...patch,
          outputSettings: {
            ...modeState.outputSettings,
            ...(patch.outputSettings || {}),
          },
        }
      : modeState
  ));
}

function makeRuntimeScheme(mode, id = `stable-${mode}-scheme`) {
  return {
    id,
    projectId: "project-pizza-kitchen",
    mode,
    code: "UX1",
    title: `${mode} stable UX scheme`,
    brief: "Stable UX generated scheme for interaction testing.",
    slogans: { "en-US": "Serve Up Victory" },
    promptBlocks: [
      { title: "English Prompt", text: "Stable UX prompt keeps generated image actions available." },
    ],
    lockedFields: [],
    outputPresets: ["custom"],
    status: "ready",
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
  };
}

function makeRuntimeResult(mode, schemeId, id = `rc1-${mode}-result`) {
  return {
    id,
    projectId: "project-pizza-kitchen",
    schemeId,
    jobId: `job-${id}`,
    taskId: `task-${id}`,
    mode,
    width: mode === "icon" ? 1024 : 1920,
    height: mode === "icon" ? 1024 : 1080,
    platformPreset: "custom",
    language: "en-US",
    model: "ux-check-model",
    status: "ready",
    providerResultId: `provider-${id}`,
    thumbnailUrl: "",
    assetUrl: "",
    favorite: false,
    archivedAt: "2026-06-03T00:00:00.000Z",
    metadata: {
      resultFile: {
        storageKey: `generated-results/${id}.png`,
        mimeType: "image/png",
        byteSize: 123456,
      },
      qualityAudit: {
        version: "result-quality-audit.v1",
        summary: "review",
        findings: [
          {
            code: "poster-reference-integration-review",
            severity: "review",
            message: "Review uploaded asset integration.",
            recommendation: "Confirm the uploaded subject is integrated into the scene.",
          },
        ],
        metrics: {},
      },
    },
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
  };
}

function makeSnapshot(baseSnapshot, mode, options = {}) {
  const scheme = options.scheme || makeRuntimeScheme(mode);
  const result = options.result === false ? null : options.result || makeRuntimeResult(mode, scheme.id);
  const schemes = options.empty ? [] : [scheme];
  const results = options.empty || !result ? [] : [result];
  return {
    ...clone(baseSnapshot),
    activeMode: mode,
    metadata: {
      ...baseSnapshot.metadata,
      revision: options.revision || 110,
      updatedAt: "2026-06-03T00:00:00.000Z",
    },
    modeStates: makeModeState(baseSnapshot, mode, {
      selectedSchemeIds: schemes.map((item) => item.id),
      outputSettings: {
        schemeCount: Math.max(1, schemes.length || 1),
        imagesPerScheme: 1,
      },
    }),
    schemes,
    results,
    archiveRows: results.map((item) => ({
      id: `archive-${item.id}`,
      projectId: item.projectId,
      resultAssetId: item.id,
      title: `${mode} archive row`,
      mode,
      model: item.model,
      state: "editable",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    queuePlans: options.queuePlans || [],
    queueSummaries: [],
  };
}

function resetState({ state, setRuntimeWorkspaceSnapshot, workspaceSnapshot, mode = "poster", apiMode = "static", source = "static", snapshot = null }) {
  state.theme = "light";
  state.view = "schemes";
  state.copyVisible = true;
  state.activeMode = mode;
  state.selectedScheme = "";
  state.selectedSchemeVariants = {};
  state.selectedResult = "";
  state.selectedResultUserSet = false;
  state.schemeDeleteConfirmId = "";
  state.resultDeleteConfirmId = "";
  state.resultFilter = "all";
  state.archiveSelection = [];
  state.resultViewerOpen = false;
  state.taskOpen = false;
  state.settingsOpen = false;
  state.generationChoiceOpen = false;
  state.apiMode = apiMode;
  state.assetOperation = null;
  state.submission = null;
  state.resultOperation = null;
  state.resultOperations = [];
  state.leftCollapsed = false;
  state.liveGate = {
    enabled: false,
    maxAcceptedCost: 1,
    confirmations: {
      liveRun: false,
      providerCost: false,
      externalProvider: false,
      resultStorage: false,
    },
    runtimeCredentialReady: false,
    transportReady: false,
    resultStorageReady: true,
  };
  setRuntimeWorkspaceSnapshot(snapshot || clone(workspaceSnapshot), source);
  state.activeMode = mode;
  state.apiMode = apiMode;
}

async function run() {
  const modulePath = (filePath) => pathToFileURL(path.join(root, filePath)).href;
  const { workspaceSnapshot } = await import(modulePath("src/data/workspace-snapshot.js"));
  const { modeSpecs } = await import(modulePath("src/data/modes.js"));
  const {
    state,
    setRuntimeWorkspaceSnapshot,
    getActiveMode,
    getModeSchemes,
  } = await import(modulePath("src/state.js"));
  const { renderShell } = await import(modulePath("src/render/shell.js"));
  const { renderCenterBoard } = await import(modulePath("src/render/center-board.js"));
  const { renderSettingsSheet } = await import(modulePath("src/render/settings-sheet.js"));

  for (const mode of ["poster", "icon", "logo", "announcement", "collab"]) {
    resetState({ state, setRuntimeWorkspaceSnapshot, workspaceSnapshot, mode, apiMode: "static", source: "static" });
    const shell = renderShell(getActiveMode(), null);
    const label = `${mode} static shell`;
    includes(shell, `mode-${mode}`, label);
    includes(shell, "data-view=\"schemes\"", label);
    includes(shell, "data-view=\"results\"", label);
    includes(shell, "data-view=\"archive\"", label);
    includes(shell, "data-action=\"open-settings\"", label);
    includes(shell, "data-action=\"toggle-task-panel\"", label);
    includes(shell, "aria-expanded=\"false\"", label);
    includes(shell, "live-gate-chip", label);
    includes(shell, "run-mode-chip", label);
    includes(shell, "data-action=\"toggle-theme\"", label);
    includes(shell, "v1.1.0", label);
    includes(shell, "release/mac/Poster Lab Pro.app", label);
    includes(shell, "data-action=\"generate-schemes\"", label);
    includes(shell, "data-action=\"simulate-asset-upload\"", label);
  }

  const blockedSnapshot = makeSnapshot(workspaceSnapshot, "poster", { empty: true });
  resetState({
    state,
    setRuntimeWorkspaceSnapshot,
    workspaceSnapshot,
    mode: "poster",
    apiMode: "http",
    source: "http",
    snapshot: blockedSnapshot,
  });
  const blockedShell = renderShell(getActiveMode(), null);
  includes(blockedShell, "先确认真实生成保护", "blocked live shell");
  includes(blockedShell, "确认真实生成保护", "blocked live shell");
  includes(blockedShell, "data-action=\"open-settings\"", "blocked live shell");
  assert(/data-action="generate-schemes"[\s\S]*?disabled/.test(blockedShell), "blocked live shell: generate schemes should be disabled");
  assert(/data-action="submit-generation"[\s\S]*?disabled/.test(blockedShell), "blocked live shell: submit generation should be disabled");

  const blockedSchemeSnapshot = makeSnapshot(workspaceSnapshot, "poster");
  resetState({
    state,
    setRuntimeWorkspaceSnapshot,
    workspaceSnapshot,
    mode: "poster",
    apiMode: "http",
    source: "http",
    snapshot: blockedSchemeSnapshot,
  });
  const blockedSchemeBoard = renderCenterBoard(modeSpecs.poster, null);
  includes(blockedSchemeBoard, "scheme-card", "blocked live scheme board");
  assert(/data-action="refresh-scheme"[\s\S]*?disabled/.test(blockedSchemeBoard), "blocked live scheme board: scheme refresh should be disabled");
  assert(/class="render-button[^"]*is-live-blocked"[\s\S]*?data-action="submit-generation"[\s\S]*?disabled/.test(blockedSchemeBoard), "blocked live scheme board: card image render should be disabled");
  includes(blockedSchemeBoard, "确认真实生成保护", "blocked live scheme board");

  const resultSnapshot = makeSnapshot(workspaceSnapshot, "poster");
  resetState({
    state,
    setRuntimeWorkspaceSnapshot,
    workspaceSnapshot,
    mode: "poster",
    apiMode: "static",
    source: "http",
    snapshot: resultSnapshot,
  });
  state.view = "results";
  state.selectedResult = resultSnapshot.results[0].id;
  const resultsBoard = renderCenterBoard(modeSpecs.poster, null);
  includes(resultsBoard, "result-filter-tabs", "results board");
  includes(resultsBoard, "data-result-filter=\"ready\"", "results board");
  includes(resultsBoard, "data-action=\"open-result-viewer\"", "results board");
  includes(resultsBoard, "data-action=\"goto-result-scheme\"", "results board");
  includes(resultsBoard, "data-action=\"regenerate-result\"", "results board");
  includes(resultsBoard, "data-action=\"delete-result\"", "results board");
  includes(resultsBoard, "质检", "results board");
  includes(resultsBoard, "download", "results board");

  state.resultDeleteConfirmId = resultSnapshot.results[0].id;
  const confirmingResultBoard = renderCenterBoard(modeSpecs.poster, null);
  includes(confirmingResultBoard, "confirming", "result delete confirmation");
  includes(confirmingResultBoard, "确认删除", "result delete confirmation");

  state.view = "schemes";
  state.resultDeleteConfirmId = "";
  state.schemeDeleteConfirmId = resultSnapshot.schemes[0].id;
  const confirmingSchemeBoard = renderCenterBoard(modeSpecs.poster, null);
  includes(confirmingSchemeBoard, "scheme-delete-button confirming", "scheme delete confirmation");
  includes(confirmingSchemeBoard, "确认删除", "scheme delete confirmation");

  state.resultViewerOpen = true;
  state.view = "results";
  state.selectedResult = resultSnapshot.results[0].id;
  state.provider = "google";
  const viewerBoard = renderCenterBoard(modeSpecs.poster, null);
  includes(viewerBoard, "role=\"dialog\"", "result viewer");
  includes(viewerBoard, "高清放大", "result viewer");
  includes(viewerBoard, "移除背景", "result viewer");
  includes(viewerBoard, "下载结果", "result viewer");
  includes(viewerBoard, "结果质检提示", "result viewer");
  includes(viewerBoard, "Google AI Studio 不支持变体", "result viewer provider capability");
  includes(viewerBoard, "is-unsupported-route", "result viewer provider capability");
  const googleVariantButton = findButtonTag(viewerBoard, 'data-result-action="variant"', "google variant result action");
  assert(googleVariantButton.includes("disabled"), "Google variant result action should be disabled instead of silently falling back");

  state.provider = "agnes";
  const agnesViewerBoard = renderCenterBoard(modeSpecs.poster, null);
  const agnesVariantButton = findButtonTag(agnesViewerBoard, 'data-result-action="variant"', "agnes variant result action");
  const agnesUpscaleButton = findButtonTag(agnesViewerBoard, 'data-result-action="upscale"', "agnes upscale result action");
  assert(!agnesVariantButton.includes("disabled"), "Agnes variant result action should be enabled because Agnes supports imageEdit");
  assert(agnesVariantButton.includes("is-native-route"), "Agnes variant result action should stay on the current provider");
  assert(agnesUpscaleButton.includes("disabled"), "Agnes upscale result action should be disabled when no supported upscale provider is selected");

  state.activeMode = "poster";
  state.provider = "agnes";
  state.providerRoutePlan = "agnes-core";
  state.providerSlotRoutes = {
    ...state.providerSlotRoutes,
    concept: { providerId: "agnes", model: "agnes-2.0-flash" },
    image: { providerId: "agnes", model: "agnes-image-2.1-flash" },
    styleReference: { providerId: "google", model: "gemini-2.5-flash" },
    compositionReference: { providerId: "google", model: "gemini-2.5-flash" },
  };
  state.settingsOpen = true;
  const settings = renderSettingsSheet();
  includes(settings, "settings-layer", "settings sheet");
  includes(settings, "provider-setup-steps", "settings sheet");
  includes(settings, "data-settings-resize", "settings sheet");
  includes(settings, "data-settings-resize-corner", "settings sheet");
  includes(settings, "data-action=\"save-provider-key\"", "settings sheet");
  includes(settings, "data-action=\"test-provider-connection\"", "settings sheet");
  includes(settings, "data-live-cost-cap", "settings sheet");
  includes(settings, "live-gate-checks", "settings sheet");
  includes(settings, "data-live-toggle=\"enabled\" aria-label=\"开启真实生成保护\"", "settings sheet");
  assert(/data-live-toggle="confirmations\.liveRun"[\s\S]*?aria-label=/.test(settings), "settings sheet: live confirmation checkboxes should have aria labels");
  includes(settings, "data-action=\"test-provider-route-plan\"", "settings sheet");
  includes(settings, "Agnes 核心测试", "settings sheet");
  includes(settings, "Agnes 免费实测路线", "settings sheet");
  includes(settings, "data-action=\"apply-agnes-core-route\"", "settings sheet");
  includes(settings, "画风/构图参考分析仍按模型能力闸门处理", "settings sheet");
  includes(settings, "live-gate-quality-warnings", "settings sheet");
  includes(settings, "Agnes 多素材质量提示", "settings sheet");
  includes(settings, "复杂多素材 KV/联名结果仍建议人工复核", "settings sheet");

  state.generationChoiceOpen = true;
  state.settingsOpen = false;
  const choiceShell = renderShell(getActiveMode(), null);
  includes(choiceShell, "generation-choice-dialog", "generation choice dialog");
  includes(choiceShell, "data-generation-strategy=\"continue\"", "generation choice dialog");
  includes(choiceShell, "data-generation-strategy=\"regenerate\"", "generation choice dialog");
  includes(choiceShell, "旧方案和旧图片都会保留", "generation choice dialog");

  state.view = "project-library";
  state.generationChoiceOpen = false;
  const projectLibrary = renderCenterBoard(modeSpecs.poster, null);
  includes(projectLibrary, "project-library-board", "project library");
  includes(projectLibrary, "data-action=\"project-library-save-current\"", "project library");
  includes(projectLibrary, "data-action=\"project-library-import\"", "project library");
  includes(projectLibrary, "data-action=\"project-library-delete-entry\"", "project library");

  const failedQueueSnapshot = makeSnapshot(workspaceSnapshot, "poster", {
    queuePlans: [{
      job: { id: "job-ux-failed", mode: "poster", status: "failed" },
      tasks: [{
        id: "task-ux-failed-image",
        kind: "imageGeneration",
        status: "failed",
        input: { schemeId: "rc1-poster-scheme" },
        cost: { estimatedCost: 0.07 },
        error: {
          code: "provider_failed",
          message: "Provider failed during UX check.",
          userMessage: "Provider failed during UX check.",
          nextStep: "Retry this failed image.",
          retryable: true,
        },
        attempts: 1,
        maxAttempts: 2,
      }],
    }],
  });
  resetState({
    state,
    setRuntimeWorkspaceSnapshot,
    workspaceSnapshot,
    mode: "poster",
    apiMode: "static",
    source: "http",
    snapshot: failedQueueSnapshot,
  });
  state.taskOpen = true;
  const failedShell = renderShell(getActiveMode(), null);
  includes(failedShell, "aria-expanded=\"true\"", "failed queue shell");
  includes(failedShell, "重试失败", "failed queue shell");
  includes(failedShell, "失败原因", "failed queue shell");
  includes(failedShell, "data-action=\"retry-failed-images\"", "failed queue shell");

  excludes(failedShell, "undefined", "failed queue shell");

  for (const mode of ["announcement", "logo", "icon"]) {
    const polluted = makeRuntimeScheme(mode, `polluted-${mode}-scheme`);
    polluted.title = `${mode} stale poster KV scheme`;
    polluted.brief = "KV构图母版：Boss 破门压迫海报。电影级游戏海报，Logo/文案安全区，Slogan处理。";
    polluted.promptBlocks = [
      { title: "视觉方向", text: "Mandatory KV Composition Architecture for a cinematic game poster." },
      { title: "English Prompt", text: "Cinematic Game KV, BOSS pressure, slogan treatment." },
    ];
    const clean = makeRuntimeScheme(mode, `clean-${mode}-scheme`);
    clean.title = `${mode} clean generated scheme`;
    clean.brief = `${mode} mode-specific generated scheme without poster KV contamination.`;
    clean.promptBlocks = [
      { title: "English Prompt", text: `${mode} mode only prompt for current-mode rendering.` },
    ];
    const contaminatedSnapshot = makeSnapshot(workspaceSnapshot, mode, { scheme: polluted, result: false });
    contaminatedSnapshot.schemes.push(clean);
    resetState({
      state,
      setRuntimeWorkspaceSnapshot,
      workspaceSnapshot,
      mode,
      apiMode: "http",
      source: "http",
      snapshot: contaminatedSnapshot,
    });
    const visibleSchemes = getModeSchemes();
    assert(visibleSchemes.some((scheme) => scheme.id === clean.id), `${mode} contamination filter: clean scheme should remain visible`);
    assert(!visibleSchemes.some((scheme) => scheme.id === polluted.id), `${mode} contamination filter: stale poster KV scheme should be hidden`);
  }

  const directionSection = readFileSync(path.join(root, "src/react/DirectionSection.tsx"), "utf8");
  includes(directionSection, "画风参考已上传，点击更换图片", "style reference accessibility");
  includes(directionSection, "点击更换画风参考", "style reference accessibility");
}

await run();

if (issues.length > 0) {
  console.error("UX regression checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("UX regression checks passed.");
