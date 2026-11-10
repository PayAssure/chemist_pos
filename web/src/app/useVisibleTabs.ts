import { useLayoutEffect, useRef, useState } from "react";
import { appTabs } from "./tabs";
import type { Tab } from "../types";

export function useVisibleTabs(tab: Tab) {
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDetailsElement>(null);
  const [visibleIndexes, setVisibleIndexes] = useState<number[]>(
    appTabs.map((_, index) => index),
  );

  useLayoutEffect(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (!nav || !measure) return;
    const update = () => {
      const buttons = Array.from(measure.querySelectorAll<HTMLElement>(".tab"));
      const overflow = measure.querySelector<HTMLElement>(".tab-overflow-trigger");
      if (!overflow || buttons.length !== appTabs.length) return;
      const gap = parseFloat(getComputedStyle(nav).columnGap) || 0;
      const widths = buttons.map((button) => button.getBoundingClientRect().width);
      const fullWidth = widths.reduce((sum, width) => sum + width, 0) + gap * 6;
      if (fullWidth <= nav.clientWidth) {
        setVisibleIndexes(appTabs.map((_, index) => index));
        return;
      }
      const visible = new Set<number>();
      let used = 0;
      const tryAdd = (index: number) => {
        const total = used + (visible.size ? gap : 0) + widths[index] + gap +
          overflow.getBoundingClientRect().width;
        if (total > nav.clientWidth) return;
        used += (visible.size ? gap : 0) + widths[index];
        visible.add(index);
      };
      tryAdd(appTabs.indexOf(tab));
      appTabs.forEach((_, index) => index !== appTabs.indexOf(tab) && tryAdd(index));
      const next = [...visible].sort((a, b) => a - b);
      setVisibleIndexes((current) =>
        current.join(",") === next.join(",") ? current : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    [nav, measure, ...measure.querySelectorAll(".tab, .tab-overflow-trigger")]
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [tab]);

  return { navRef, measureRef, overflowRef, visibleIndexes };
}
