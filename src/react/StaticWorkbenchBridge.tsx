"use client";

import { useEffect, useRef } from "react";
import {
  applyPrototypeStateFromUrl,
  ensureSelectedScheme,
  getActiveMode,
  getSelectedScheme,
  state,
} from "../state.js";
import { renderShell } from "../render/shell.js";
import { bindEvents } from "../events.js";
import { hydrateLocalOutputPreferences, hydrateLocalProviderPreferences, hydrateLocalSubmissionDraft } from "../local-draft-store.js";
import { loadWorkspaceSnapshotForWorkbench } from "../workspace-data-service.js";
import { mountWorkbenchSections, type MountedWorkbenchSections } from "./mount-workbench-sections";

export function StaticWorkbenchBridge() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mountedSectionsRef = useRef<MountedWorkbenchSections | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    applyPrototypeStateFromUrl();
    hydrateLocalSubmissionDraft(state);
    hydrateLocalProviderPreferences(state);
    hydrateLocalOutputPreferences(state);
    state.apiMode = state.apiMode === "static" && window.location.search.includes("api=static") ? "static" : "http";
    ensureSelectedScheme();

    const render = () => {
      ensureSelectedScheme();
      document.documentElement.dataset.theme = state.theme;
      mountedSectionsRef.current?.unmount();
      mountedSectionsRef.current = null;
      host.innerHTML = renderShell(getActiveMode(), getSelectedScheme());
      bindEvents(render);
      mountedSectionsRef.current = mountWorkbenchSections(host, { onRequestRender: render });
    };

    render();

    if (state.apiMode === "http") {
      loadWorkspaceSnapshotForWorkbench()
        .catch((error) => {
          state.workspaceLoadStatus = "error";
          state.workspaceLoadError = error instanceof Error ? error.message : "Failed to load workspace snapshot.";
        })
        .finally(() => {
          hydrateLocalOutputPreferences(state);
          render();
        });
    }

    return () => {
      mountedSectionsRef.current?.unmount();
      mountedSectionsRef.current = null;
    };
  }, []);

  return <div id="app" ref={hostRef} />;
}
