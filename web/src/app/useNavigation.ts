import { useEffect, useState } from "react";
import { navigate, pathForTab, tabFromPath } from "../lib/navigation";

export function useNavigation() {
  const [tab, setTab] = useState(() => tabFromPath(window.location.pathname));
  useEffect(() => {
    if (window.location.pathname === "/") {
      window.history.replaceState({}, "", pathForTab("dashboard"));
    }
    const sync = () => setTab(tabFromPath(window.location.pathname));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return { tab, navigate };
}
