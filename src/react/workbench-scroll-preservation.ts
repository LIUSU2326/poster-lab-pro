"use client";

const CONFIG_SCROLL_TOP_KEY = "posterLab.configScrollTop";

export function configScrollTopForElement(element: Element | null | undefined): number | null {
  const configScroll = element?.closest(".config-scroll") as HTMLElement | null | undefined;
  if (!configScroll) return null;
  const scrollTop = Number(configScroll.scrollTop);
  return Number.isFinite(scrollTop) ? scrollTop : null;
}

export function preserveWorkbenchConfigScrollTop(scrollTop: number | null | undefined) {
  if (typeof window === "undefined") return;
  const value = Number(scrollTop);
  if (!Number.isFinite(value)) return;
  try {
    window.sessionStorage.setItem(CONFIG_SCROLL_TOP_KEY, String(Math.max(0, value)));
  } catch {
    // The component ref still covers the normal path when storage is unavailable.
  }
}

export function readPreservedWorkbenchConfigScrollTop(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const value = Number(window.sessionStorage.getItem(CONFIG_SCROLL_TOP_KEY));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function consumePreservedWorkbenchConfigScrollTop(): number | null {
  const value = readPreservedWorkbenchConfigScrollTop();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(CONFIG_SCROLL_TOP_KEY);
    } catch {
      // Ignore storage failures.
    }
  }
  return value;
}

export function restoreWorkbenchConfigScrollTop(host: HTMLElement, scrollTop: number | null | undefined) {
  const value = Number(scrollTop);
  if (!Number.isFinite(value) || value <= 0) return;

  const restore = () => {
    const nextConfigScroll = host.querySelector<HTMLElement>(".config-scroll");
    if (!nextConfigScroll) return;
    const maxScrollTop = Math.max(0, nextConfigScroll.scrollHeight - nextConfigScroll.clientHeight);
    nextConfigScroll.scrollTop = Math.min(value, maxScrollTop);
  };

  restore();
  window.requestAnimationFrame(restore);
  window.setTimeout(restore, 0);
  window.setTimeout(restore, 120);
}
