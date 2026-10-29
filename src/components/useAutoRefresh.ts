"use client";

import { useEffect } from "react";

/** Calls `load` on mount and whenever the tab regains focus, so decisions show up without a manual reload. */
export function useAutoRefresh(load: () => void) {
  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);
}
