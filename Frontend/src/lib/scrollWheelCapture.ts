/**
 * Ensures mouse wheel / trackpad scroll works inside dropdowns, filters, and any
 * overflow:auto/scroll container. We run in capture phase so we handle the event
 * before scroll-lock or other listeners. Uses pointer position (elementFromPoint)
 * so we scroll the list under the cursor even when the event target is the focused
 * trigger (e.g. filter button) and the list is in a portal.
 */
const POPOVER_SELECTORS = '[data-dropdown-content], [data-radix-popper-content-wrapper], [data-radix-select-content], [role="listbox"], [role="menu"]';

function findScrollable(el: HTMLElement | null): HTMLElement | null {
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const canScrollY = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    const canScrollX = overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay';
    const hasOverflowY = el.scrollHeight > el.clientHeight;
    const hasOverflowX = el.scrollWidth > el.clientWidth;
    if (canScrollY && hasOverflowY) return el;
    if (canScrollX && hasOverflowX) return el;
    // Radix Scroll Area viewport: treat as scrollable even when overflow not yet reported
    // (e.g. overflow: hidden, or scrollHeight === clientHeight due to layout/timing)
    if (el.hasAttribute?.('data-radix-scroll-area-viewport')) return el;
    // Inside dropdown/popover, any overflowing element may be the list container
    if (hasOverflowY && el.closest?.(POPOVER_SELECTORS)) return el;
    el = el.parentElement;
  }
  return null;
}

function isPageScrollRoot(el: HTMLElement): boolean {
  return el === document.documentElement || el === document.body;
}

export function installScrollWheelCapture(): () => void {
  const handler = (e: WheelEvent) => {
    // Use elementsFromPoint so we find a scrollable even when the topmost element
    // is an overlay or non-scrollable (e.g. dialog backdrop). Then fallback to e.target.
    const atPoint =
      typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(e.clientX, e.clientY)
        : [document.elementFromPoint(e.clientX, e.clientY)].filter(Boolean);
    let scrollable: HTMLElement | null = null;
    for (let i = 0; i < atPoint.length; i++) {
      const el = atPoint[i] as HTMLElement;
      if (!el || !document.body.contains(el)) continue;
      // Skip full-screen overlays so we scroll the content/dropdown under the cursor
      if (el.hasAttribute?.('data-skip-wheel-overlay')) continue;
      scrollable = findScrollable(el);
      if (scrollable && !isPageScrollRoot(scrollable)) break;
    }
    if (!scrollable && (e.target as Node) && document.body.contains(e.target as Node)) {
      scrollable = findScrollable(e.target as HTMLElement);
    }
    if (!scrollable || isPageScrollRoot(scrollable)) return;

    const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = scrollable;
    const maxScrollTop = scrollHeight - clientHeight;
    const maxScrollLeft = scrollWidth - clientWidth;

    // deltaMode: 0 = pixels, 1 = lines, 2 = pages
    const lineHeight = 40;
    const dy = e.deltaMode === 1 ? e.deltaY * lineHeight : e.deltaMode === 2 ? e.deltaY * clientHeight : e.deltaY;
    const dx = e.deltaMode === 1 ? e.deltaX * lineHeight : e.deltaMode === 2 ? e.deltaX * clientWidth : e.deltaX;

    if (dy !== 0 && maxScrollTop > 0) {
      const newTop = dy > 0
        ? Math.min(scrollTop + dy, maxScrollTop)
        : Math.max(scrollTop + dy, 0);
      if (newTop !== scrollTop) {
        scrollable.scrollTop = newTop;
        e.preventDefault();
        e.stopPropagation();
      }
    } else if (dx !== 0 && maxScrollLeft > 0) {
      const newLeft = dx > 0
        ? Math.min(scrollLeft + dx, maxScrollLeft)
        : Math.max(scrollLeft + dx, 0);
      if (newLeft !== scrollLeft) {
        scrollable.scrollLeft = newLeft;
        e.preventDefault();
        e.stopPropagation();
      }
    }
  };

  document.addEventListener('wheel', handler, { capture: true, passive: false });
  return () => document.removeEventListener('wheel', handler, { capture: true });
}
