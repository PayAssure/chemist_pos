import { navigate, pathForTab } from "../lib/navigation";
import type { Tab } from "../types";
import { appTabs, tabLabels } from "./tabs";
import { useVisibleTabs } from "./useVisibleTabs";

export default function HeaderNavigation({ tab }: { tab: Tab }) {
  const { navRef, measureRef, overflowRef, visibleIndexes } = useVisibleTabs(tab);
  const visible = (index: number) => visibleIndexes.includes(index);
  const hiddenTabs = appTabs.filter((_, index) => !visible(index));
  return (
    <nav ref={navRef} className="header-nav" aria-label="POS sections">
      {appTabs.map((name, index) => visible(index) && (
        <button
          key={name}
          className={`tab ${tab === name ? "active" : ""}`}
          aria-current={tab === name ? "page" : undefined}
          onClick={() => navigate(pathForTab(name))}
        >
          {tabLabels[name]}
        </button>
      ))}
      {hiddenTabs.length > 0 && (
        <details ref={overflowRef} className="tab-overflow">
          <summary className="tab-overflow-trigger" aria-label="More sections" title="More sections">
            <span aria-hidden="true">⋯</span>
          </summary>
          <div className="tab-overflow-menu">
            {hiddenTabs.map((name) => (
              <button
                key={name}
                className={`tab-overflow-item ${tab === name ? "active" : ""}`}
                aria-current={tab === name ? "page" : undefined}
                onClick={() => {
                  navigate(pathForTab(name));
                  if (overflowRef.current) overflowRef.current.open = false;
                }}
              >
                {tabLabels[name]}
              </button>
            ))}
          </div>
        </details>
      )}
      <div ref={measureRef} className="header-nav-measure" aria-hidden="true">
        {appTabs.map((name) => (
          <button key={name} type="button" className="tab" tabIndex={-1}>
            {tabLabels[name]}
          </button>
        ))}
        <button type="button" className="tab-overflow-trigger" tabIndex={-1}>⋯</button>
      </div>
    </nav>
  );
}
