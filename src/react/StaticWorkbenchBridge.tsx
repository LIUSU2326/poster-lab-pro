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
import { mountWorkbenchSections, type MountedWorkbenchSections, type WorkbenchRenderOptions } from "./mount-workbench-sections";
import {
  configScrollTopForElement,
  consumePreservedWorkbenchConfigScrollTop,
  preserveWorkbenchConfigScrollTop,
  restoreWorkbenchConfigScrollTop,
} from "./workbench-scroll-preservation";

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

    const preserveConfigScrollFromEvent = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".config-scroll")) return;
      const configScrollTop = configScrollTopForElement(target);
      if (configScrollTop !== null) preserveWorkbenchConfigScrollTop(configScrollTop);
    };
    const markStableRefreshSurface = (surface: Element | null) => {
      if (surface instanceof HTMLElement) {
        surface.dataset.stableRefresh = "true";
      }
    };

    host.addEventListener("pointerdown", preserveConfigScrollFromEvent, true);
    host.addEventListener("click", preserveConfigScrollFromEvent, true);
    host.addEventListener("change", preserveConfigScrollFromEvent, true);
    host.addEventListener("keydown", preserveConfigScrollFromEvent, true);
    host.addEventListener("drop", preserveConfigScrollFromEvent, true);

    const render = (options?: WorkbenchRenderOptions) => {
      const requestedConfigScrollTop = Number(options?.configScrollTop);
      const preservedConfigScrollTop = consumePreservedWorkbenchConfigScrollTop();
      const stateConfigScrollTop = Number(state.preservedConfigScrollTop);
      const configScrollTop = Number.isFinite(requestedConfigScrollTop)
        ? requestedConfigScrollTop
        : preservedConfigScrollTop ?? (Number.isFinite(stateConfigScrollTop) ? stateConfigScrollTop : null) ?? host.querySelector<HTMLElement>(".config-scroll")?.scrollTop ?? 0;
      state.preservedConfigScrollTop = null;
      ensureSelectedScheme();
      document.documentElement.dataset.theme = state.theme;
      const hadRenderedWorkbench = Boolean(host.firstElementChild);
      mountedSectionsRef.current?.unmount();
      mountedSectionsRef.current = null;
      host.innerHTML = renderShell(getActiveMode(), getSelectedScheme());
      if (hadRenderedWorkbench) markStableRefreshSurface(host.firstElementChild);
      bindEvents(render);
      mountedSectionsRef.current = mountWorkbenchSections(host, { onRequestRender: render });
      restoreWorkbenchConfigScrollTop(host, configScrollTop);
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
      host.removeEventListener("pointerdown", preserveConfigScrollFromEvent, true);
      host.removeEventListener("click", preserveConfigScrollFromEvent, true);
      host.removeEventListener("change", preserveConfigScrollFromEvent, true);
      host.removeEventListener("keydown", preserveConfigScrollFromEvent, true);
      host.removeEventListener("drop", preserveConfigScrollFromEvent, true);
      mountedSectionsRef.current?.unmount();
      mountedSectionsRef.current = null;
    };
  }, []);

  return <div id="app" ref={hostRef} />;
}
