import { getRuntimeWorkspaceSnapshot, state } from "./state.js";

export function summarizeReferenceAnalysisText(text, maxLength = 120) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function timestampForAnalysis(item) {
  const value = Date.parse(String(item?.updatedAt || item?.createdAt || ""));
  return Number.isFinite(value) ? value : 0;
}

function matchesReferenceAnalysis(item, key, role, kinds) {
  const itemKey = String(key || item?.key || "");
  const itemRole = String(item?.role || "");
  const itemKind = String(item?.kind || "");
  const roleMatches = role ? itemRole === role || itemKey.startsWith(`${role}:`) : true;
  const kindMatches = kinds.size === 0 || kinds.has(itemKind) || Array.from(kinds).some((kind) => itemKey === `${role}:${kind}`);
  return roleMatches && kindMatches && String(item?.text || "").trim();
}

export function latestReferenceAnalysis(options = {}) {
  const role = String(options.role || "");
  const kinds = new Set((options.kinds || []).map((kind) => String(kind)).filter(Boolean));
  const runtimeAnalyses = Object.entries(state.referenceAnalysis || {})
    .filter(([key, item]) => matchesReferenceAnalysis(item, key, role, kinds))
    .map(([key, item]) => ({
      key,
      ...item,
    }));
  const snapshotAnalyses = (getRuntimeWorkspaceSnapshot().referenceAnalyses || [])
    .filter((item) => matchesReferenceAnalysis(item, item?.key, role, kinds));

  return [...runtimeAnalyses, ...snapshotAnalyses]
    .sort((left, right) => timestampForAnalysis(right) - timestampForAnalysis(left))[0] || null;
}

export function latestReferenceAnalysisSummary(options = {}) {
  const item = latestReferenceAnalysis(options);
  return summarizeReferenceAnalysisText(item?.text, options.maxLength || 120);
}
