/** Scroll so `el` sits fully above the action drawer / chat chrome (and below the header). */
export function scrollSeatIntoClearView(el: HTMLElement) {
  const header = document.querySelector<HTMLElement>(".header");
  const drawer = document.querySelector<HTMLElement>(".action-drawer");
  const chat = document.querySelector<HTMLElement>(".table-chat");
  const topInset = (header?.getBoundingClientRect().bottom ?? 56) + 12;
  const drawerTop = drawer?.getBoundingClientRect().top ?? window.innerHeight;
  const chatTop = chat?.getBoundingClientRect().top ?? drawerTop;
  // Chat pill sits above the drawer; keep seat clear of whichever is higher.
  const bottomLimit = Math.min(drawerTop, chatTop) - 28;

  const rect = el.getBoundingClientRect();
  let delta = 0;

  // Prefer: seat bottom just above the chrome.
  if (rect.bottom > bottomLimit) {
    delta = rect.bottom - bottomLimit;
  } else if (rect.top < topInset) {
    delta = rect.top - topInset;
  }

  // After scrolling down for the drawer, don't bury the seat under the header.
  if (rect.top - delta < topInset) {
    delta = rect.top - topInset;
  }

  if (Math.abs(delta) < 8) return;
  window.scrollBy({ top: delta, behavior: "smooth" });
}

/** Retry after drawer open animation / pad settles. */
export function scheduleScrollSeatIntoClearView(el: HTMLElement) {
  const run = () => scrollSeatIntoClearView(el);
  run();
  const raf = window.requestAnimationFrame(() => {
    run();
    window.setTimeout(run, 120);
    window.setTimeout(run, 320);
  });
  return () => window.cancelAnimationFrame(raf);
}
