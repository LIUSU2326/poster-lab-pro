import { pathToFileURL } from "node:url";
import path from "node:path";

const issues = [];
const root = process.cwd();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) issues.push(message);
}

function makeScheme(id, title, updatedAt) {
  return {
    id,
    projectId: "project-pizza-kitchen",
    mode: "poster",
    code: id.toUpperCase(),
    title,
    brief: `${title} runtime sync test scheme.`,
    slogans: { "en-US": "Serve Up Victory" },
    promptBlocks: [{ title: "English Prompt", text: `${title} integrated poster prompt.` }],
    lockedFields: [],
    outputPresets: ["custom"],
    status: "ready",
    updatedAt,
  };
}

function makeResult(id, schemeId, updatedAt) {
  return {
    id,
    projectId: "project-pizza-kitchen",
    schemeId,
    jobId: "job-state-sync",
    taskId: `task-${id}`,
    mode: "poster",
    width: 1920,
    height: 1080,
    platformPreset: "custom",
    language: "en-US",
    model: "state-sync-model",
    status: "ready",
    providerResultId: `provider-${id}`,
    thumbnailUrl: "/mock-results/pizza-poster-preview.svg",
    assetUrl: null,
    favorite: false,
    archivedAt: updatedAt,
    metadata: {},
    createdAt: updatedAt,
    updatedAt,
  };
}

function makeArchiveRow(result, title, updatedAt) {
  return {
    id: `archive-${result.id}`,
    projectId: result.projectId,
    resultAssetId: result.id,
    title,
    mode: result.mode,
    model: result.model,
    state: "editable",
    createdAt: updatedAt,
    updatedAt,
  };
}

async function run() {
  const { workspaceSnapshot } = await import(pathToFileURL(path.join(root, "src/data/workspace-snapshot.js")).href);
  const {
    getRuntimeWorkspaceSnapshot,
    setRuntimeWorkspaceSnapshot,
    state,
  } = await import(pathToFileURL(path.join(root, "src/state.js")).href);
  const {
    deleteGeneratedSchemeForWorkbench,
    resetGeneratedSchemeForWorkbench,
  } = await import(pathToFileURL(path.join(root, "src/scheme-management-client.js")).href);
  const {
    deleteResultForWorkbench,
  } = await import(pathToFileURL(path.join(root, "src/result-management-client.js")).href);

  const updatedAt = "2026-06-01T00:00:00.000Z";
  const schemeA = "generated-poster-state-a";
  const schemeB = "generated-poster-state-b";
  const resultA = makeResult("result-state-a", schemeA, updatedAt);
  const resultB = makeResult("result-state-b", schemeB, updatedAt);
  let serverSnapshot = {
    ...clone(workspaceSnapshot),
    activeMode: "poster",
    metadata: {
      ...workspaceSnapshot.metadata,
      revision: 30,
      updatedAt,
    },
    modeStates: (workspaceSnapshot.modeStates || []).map((modeState) => (
      modeState.mode === "poster"
        ? {
            ...modeState,
            selectedSchemeIds: [schemeA, schemeB],
            outputSettings: {
              ...modeState.outputSettings,
              schemeCount: 2,
              imagesPerScheme: 1,
            },
          }
        : modeState
    )),
    schemes: [
      makeScheme(schemeA, "State Sync A", updatedAt),
      makeScheme(schemeB, "State Sync B", updatedAt),
    ],
    results: [resultA, resultB],
    archiveRows: [
      makeArchiveRow(resultA, "State Sync A", updatedAt),
      makeArchiveRow(resultB, "State Sync B", updatedAt),
    ],
    queuePlans: [
      {
        job: { id: "job-state-sync", mode: "poster", status: "succeeded" },
        tasks: [
          {
            id: "task-state-a",
            kind: "imageGeneration",
            status: "succeeded",
            input: { schemeId: schemeA },
            cost: { estimatedCost: 0.05 },
            elapsedMs: 1000,
          },
          {
            id: "task-state-batch",
            kind: "imageGeneration",
            status: "queued",
            input: { schemeIds: [schemeA, schemeB] },
            cost: { estimatedCost: 0.1 },
            elapsedMs: 0,
          },
        ],
      },
    ],
    queueSummaries: [],
  };

  const fakeFetch = async (url, init) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    if (String(url).endsWith(`/api/workspaces/${serverSnapshot.metadata.workspaceId}/snapshot`)) {
      serverSnapshot = body?.snapshot || serverSnapshot;
      return {
        async json() {
          return {
            ok: true,
            data: {
              summary: {
                workspaceId: serverSnapshot.metadata.workspaceId,
                projectId: serverSnapshot.project.id,
                projectName: serverSnapshot.project.name,
                activeMode: serverSnapshot.activeMode,
                revision: serverSnapshot.metadata.revision,
                assetCount: serverSnapshot.assets.length,
                schemeCount: serverSnapshot.schemes.length,
                resultCount: serverSnapshot.results.length,
                runningQueueCount: 0,
                updatedAt: serverSnapshot.metadata.updatedAt,
              },
            },
          };
        },
      };
    }
    return {
      async json() {
        return {
          ok: false,
          error: { message: `Unexpected state sync request: ${url}` },
        };
      },
    };
  };

  state.apiMode = "http";
  setRuntimeWorkspaceSnapshot(serverSnapshot, "http");
  state.selectedScheme = schemeA;
  state.selectedResult = resultA.id;
  state.selectedResultUserSet = true;
  state.resultViewerOpen = true;
  state.selectedSchemeVariants = {
    [schemeA]: 2,
    [schemeB]: 1,
    "missing-scheme": 3,
  };
  state.archiveSelection = [`archive-${resultA.id}`, `archive-${resultB.id}`, "archive-missing"];
  state.resultOperations = [
    { id: "op-state-a", resultId: resultA.id, status: "done" },
    { id: "op-state-b", resultId: resultB.id, status: "done" },
  ];
  state.resultOperation = state.resultOperations[0];
  state.resultDeleteConfirmId = resultA.id;

  const resultDeleteEnvelope = await deleteResultForWorkbench({ resultId: resultA.id }, { fetchImpl: fakeFetch });
  const resultDeletedSnapshot = getRuntimeWorkspaceSnapshot();
  assert(resultDeleteEnvelope.ok, "deleteResultForWorkbench should persist through fake http");
  assert(resultDeletedSnapshot.schemes.some((scheme) => scheme.id === schemeA), "deleting a result should keep its scheme");
  assert(!resultDeletedSnapshot.results.some((result) => result.id === resultA.id), "deleted result should be removed from snapshot");
  assert(!resultDeletedSnapshot.archiveRows.some((row) => row.resultAssetId === resultA.id), "deleted result archive row should be removed");
  assert(state.selectedResult !== resultA.id, "selectedResult should move away from a directly deleted result");
  assert(state.resultViewerOpen === false, "result viewer should close when its selected result is directly deleted");
  assert(!state.archiveSelection.includes(`archive-${resultA.id}`), "directly deleted result archive selection should be cleared");
  assert(state.resultOperations.every((operation) => operation.resultId !== resultA.id), "directly deleted result operations should be cleared");
  assert(state.resultOperation === null, "current result operation should clear after directly deleting its source result");

  serverSnapshot = {
    ...serverSnapshot,
    results: [resultA, resultB],
    archiveRows: [
      makeArchiveRow(resultA, "State Sync A", updatedAt),
      makeArchiveRow(resultB, "State Sync B", updatedAt),
    ],
    metadata: {
      ...serverSnapshot.metadata,
      revision: serverSnapshot.metadata.revision + 1,
      updatedAt,
    },
  };
  setRuntimeWorkspaceSnapshot(serverSnapshot, "http");
  state.selectedScheme = schemeA;
  state.selectedResult = resultA.id;
  state.selectedResultUserSet = true;
  state.resultViewerOpen = true;
  state.selectedSchemeVariants = {
    [schemeA]: 2,
    [schemeB]: 1,
    "missing-scheme": 3,
  };
  state.archiveSelection = [`archive-${resultA.id}`, `archive-${resultB.id}`, "archive-missing"];
  state.resultOperations = [
    { id: "op-state-a", resultId: resultA.id, status: "done" },
    { id: "op-state-b", resultId: resultB.id, status: "done" },
  ];
  state.resultOperation = state.resultOperations[0];

  const deleteEnvelope = await deleteGeneratedSchemeForWorkbench({ schemeId: schemeA }, { fetchImpl: fakeFetch });
  const deletedSnapshot = getRuntimeWorkspaceSnapshot();
  assert(deleteEnvelope.ok, "deleteGeneratedSchemeForWorkbench should persist through fake http");
  assert(!deletedSnapshot.schemes.some((scheme) => scheme.id === schemeA), "deleted scheme should be removed from snapshot");
  assert(!deletedSnapshot.results.some((result) => result.id === resultA.id), "deleted scheme results should be removed from snapshot");
  assert(!deletedSnapshot.archiveRows.some((row) => row.resultAssetId === resultA.id), "deleted scheme archive rows should be removed");
  assert(!deletedSnapshot.queuePlans.some((plan) => (plan.tasks || []).some((task) => task.input?.schemeId === schemeA)), "deleted scheme queue tasks should be removed");
  assert(deletedSnapshot.queuePlans.some((plan) => (plan.tasks || []).some((task) => task.input?.schemeIds?.length === 1 && task.input.schemeIds[0] === schemeB)), "batch queue tasks should keep remaining scheme ids");
  assert(state.selectedScheme !== schemeA, "selectedScheme should move away from a deleted scheme");
  assert(state.selectedResult !== resultA.id, "selectedResult should move away from a deleted result");
  assert(state.resultViewerOpen === false, "result viewer should close when its selected result is deleted");
  assert(!(schemeA in state.selectedSchemeVariants), "deleted scheme variant state should be cleared");
  assert(!("missing-scheme" in state.selectedSchemeVariants), "unknown scheme variant state should be cleared");
  assert(state.selectedSchemeVariants[schemeB] === 1, "remaining scheme variant state should be preserved");
  assert(!state.archiveSelection.includes(`archive-${resultA.id}`), "removed archive row selection should be cleared");
  assert(state.archiveSelection.includes(`archive-${resultB.id}`), "remaining archive selection should be preserved");
  assert(state.resultOperations.every((operation) => operation.resultId !== resultA.id), "result operations for removed results should be cleared");
  assert(state.resultOperation === null, "current result operation should clear when its source result is removed");
  assert(state.resultDeleteConfirmId === "", "result delete confirmation should clear when confirmed result is removed");

  state.selectedScheme = schemeB;
  state.selectedResult = resultB.id;
  state.selectedResultUserSet = true;
  state.resultViewerOpen = true;
  state.resultOperations = [{ id: "op-state-b", resultId: resultB.id, status: "done" }];
  state.resultOperation = state.resultOperations[0];
  state.archiveSelection = [`archive-${resultB.id}`];
  const resetEnvelope = await resetGeneratedSchemeForWorkbench({ schemeId: schemeB }, { fetchImpl: fakeFetch });
  const resetSnapshot = getRuntimeWorkspaceSnapshot();
  const resetScheme = resetSnapshot.schemes.find((scheme) => scheme.id === schemeB);
  assert(resetEnvelope.ok, "resetGeneratedSchemeForWorkbench should persist through fake http");
  assert(resetScheme?.status === "pending", "reset scheme should remain but return to pending status");
  assert(resetSnapshot.results.every((result) => result.schemeId !== schemeB), "reset scheme should clear its old results");
  assert(state.selectedScheme === schemeB, "reset scheme should remain selected");
  assert(state.selectedResult === "", "selectedResult should clear when reset removes all results");
  assert(state.resultViewerOpen === false, "result viewer should close when reset removes the viewed result");
  assert(state.selectedSchemeVariants[schemeB] === 1, "reset should preserve variant state for the remaining scheme");
  assert(state.archiveSelection.length === 0, "archive selection should clear when reset removes archive rows");
  assert(state.resultOperations.length === 0, "result operations should clear when reset removes their source result");
  assert(state.resultOperation === null, "current result operation should clear after reset removes its source result");
}

await run();

if (issues.length > 0) {
  console.error("Workspace state sync checks failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Workspace state sync checks passed.");
