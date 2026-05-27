import { createQueueViewModel } from '../data/queue-view-model.js';
import { state } from '../state.js';

function envelopeStatus(envelope) {
  if (!envelope) return "待处理";
  return envelope.ok ? "正常" : envelope.error?.code || "错误";
}

function formatServiceSteps(serviceFlow) {
  if (!serviceFlow) return "等待";
  return [
    `保存:${envelopeStatus(serviceFlow.savedSnapshot)}`,
    `提示词:${envelopeStatus(serviceFlow.promptPackageCreate)}`,
    `映射:${envelopeStatus(serviceFlow.providerRequestMap)}`,
    `队列:${envelopeStatus(serviceFlow.queuePlanCreate)}`,
    `执行:${envelopeStatus(serviceFlow.queueRun)}`,
    `刷新:${envelopeStatus(serviceFlow.workspaceReload)}`,
  ].join(" / ");
}

function formatServiceQueue(serviceFlow) {
  const summary = serviceFlow?.queueRun?.ok
    ? serviceFlow.queueRun.data.summary
    : serviceFlow?.queuePlanCreate?.ok
      ? serviceFlow.queuePlanCreate.data.summary
      : null;
  if (!summary) return "队列待处理";
  return `${summary.completed || 0}/${summary.total} 个任务 / $${summary.estimatedCost.toFixed(2)}`;
}

function formatValidationIssues(validation) {
  if (!validation?.results?.length) return "校验待处理";
  const failedIssues = validation.results
    .filter((item) => !item.ok)
    .flatMap((item) => {
      const issues = Array.isArray(item.issues) && item.issues.length > 0
        ? item.issues
        : [{ path: item.name, message: "校验失败。" }];
      return issues.map((validationIssue) => `${item.name}.${validationIssue.path}: ${validationIssue.message}`);
    });
  if (failedIssues.length === 0) {
    return validation.results.map((item) => `${item.name}:正常`).join(" / ");
  }
  return failedIssues.slice(0, 3).join(" / ");
}

export function renderTaskChrome(activeMode) {
  const queue = createQueueViewModel(activeMode);
  const submission = state.submission;
  const activeOperation = state.resultOperation;
  const operationRows = state.resultOperations || [];
  const modeLabel = getModeLabel(activeMode.id);

  return `
    <footer class="task-chrome ${state.taskOpen ? "open" : ""}" aria-label="批量任务队列">
      <button class="task-handle" type="button" data-action="toggle-task" aria-label="${state.taskOpen ? "收起批量任务" : "展开批量任务"}"></button>
      <button class="task-slim" type="button" data-action="toggle-task">
        <strong>${modeLabel}任务</strong>
        <span>${queue.summary.completed} / ${queue.summary.total} 完成</span>
        <span>${submission ? `表单 ${submission.status}` : `阶段 ${queue.summary.currentStage}`}</span>
        <span class="task-fail">${queue.summary.failed} 失败</span>
        <span class="manual-live-slim ${activeOperation ? "success" : ""}">${activeOperation ? `操作 ${activeOperation.status}` : "无操作"}</span>
        <b>${state.taskOpen ? "收起" : "详情"}</b>
      </button>
      ${state.taskOpen ? `
        <div class="task-drawer">
          ${activeOperation ? `
            <div class="result-operation-context success">
              <div>
                <span>结果操作</span>
                <strong>${escapeHtml(activeOperation.label)}</strong>
                <small>${escapeHtml(activeOperation.message)}</small>
              </div>
              <div>
                <span>结果</span>
                <strong>${escapeHtml(activeOperation.resultId)}</strong>
                <small>${escapeHtml(activeOperation.mode)} / ${escapeHtml(activeOperation.createdAt)}</small>
              </div>
              <div>
                <span>队列</span>
                <strong>${activeOperation.progress}%</strong>
                <small>${escapeHtml(activeOperation.cost)} / ${escapeHtml(activeOperation.elapsed)}</small>
              </div>
            </div>
          ` : ""}
          ${submission ? `
            <div class="submission-card compact">
              <div>
                <span>当前任务</span>
                <strong>${escapeHtml(submission.schemeTitle)}</strong>
                <small>${escapeHtml(submission.providerId)} / ${escapeHtml(submission.transport)} / ${escapeHtml(submission.status)}</small>
              </div>
              <div>
                <span>校验</span>
                <strong>${submission.validation.ok ? "就绪" : "无效"}</strong>
                <small>${escapeHtml(formatValidationIssues(submission.validation))}</small>
              </div>
              <div>
                <span>队列</span>
                <strong>${envelopeStatus(submission.serviceFlow?.queueRun || submission.serviceFlow?.queuePlanCreate)}</strong>
                <small>${escapeHtml(formatServiceQueue(submission.serviceFlow))}</small>
              </div>
            </div>
          ` : ""}
          <div class="task-stats">
            <div><span>进度</span><strong>${queue.summary.progress}%</strong></div>
            <div><span>预估成本</span><strong>${queue.summary.estimatedCost}</strong></div>
            <div><span>耗时</span><strong>${queue.summary.elapsed}</strong></div>
            <div><span>失败处理</span><strong>${queue.summary.failureAction}</strong></div>
          </div>
          <div class="queue-list">
            ${operationRows.map((item) => `
              <div class="queue-row result-operation-row">
                <div><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.resultId)}</span></div>
                <span>${escapeHtml(item.status)}</span>
                <span>${escapeHtml(item.cost)}</span>
                <span>${escapeHtml(item.elapsed)}</span>
                <i><em style="width:${item.progress}%"></em></i>
              </div>
            `).join("")}
            ${queue.rows.map((item) => `
              <div class="queue-row">
                <div><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.detail)}</span></div>
                <span>${escapeHtml(item.state)}</span>
                <span>${escapeHtml(item.cost)}</span>
                <span>${escapeHtml(item.time)}</span>
                <i><em style="width:${item.progress}%"></em></i>
              </div>
            `).join("")}
          </div>
        </div>
      ` : ""}
    </footer>
  `;
}

function getModeLabel(modeId) {
  return {
    poster: "海报",
    collab: "联名",
    announcement: "公告",
    logo: "标识",
    icon: "图标",
  }[modeId] || "批量";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
