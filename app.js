import {
  applyPrototypeStateFromUrl,
  ensureSelectedResult,
  ensureSelectedScheme,
  getActiveMode,
  getSelectedScheme,
  state,
} from './src/state.js';
import { renderShell } from './src/render/shell.js';
import { bindEvents } from './src/events.js';
import { hydrateLocalSubmissionDraft } from './src/local-draft-store.js';
import { loadProviderCredentialStatusForWorkbench } from './src/provider-credential-client.js';
import { loadWorkspaceSnapshotForWorkbench } from './src/workspace-data-service.js';

const app = document.querySelector('#app');

applyPrototypeStateFromUrl();
hydrateLocalSubmissionDraft(state);
ensureSelectedScheme();
render();
loadWorkspaceSnapshotForWorkbench()
  .finally(() => render());
if (state.settingsOpen) {
  loadProviderCredentialStatusForWorkbench({ providerId: state.provider })
    .finally(() => render());
}

function render() {
  ensureSelectedScheme();
  ensureSelectedResult();
  document.documentElement.dataset.theme = state.theme;

  const activeMode = getActiveMode();
  const selected = getSelectedScheme();

  app.innerHTML = renderShell(activeMode, selected);
  bindEvents(render);
}
