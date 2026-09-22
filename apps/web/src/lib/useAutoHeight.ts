import { useLayoutEffect, useRef, useState } from "react";

/** Tracks an element's content height for smooth container animations. */
export function useAutoHeight<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // offsetHeight ignores transforms (e.g. active-hand scale) so pulse/layout
      // animations don't feed back into the felt height and cause jitter.
      const next = Math.round(el.offsetHeight);
      setHeight((prev) =>
        prev != null && Math.abs(prev - next) < 2 ? prev : next
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, height };
}
