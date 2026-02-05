/**
 * Ensures mouse wheel / trackpad scroll works inside dropdowns, filters, and any
 * overflow:auto/scroll container. We run in capture phase so we handle the event
 * before scroll-lock or other listeners. Uses pointer position (elementFromPoint)
 * so we scroll the list under the cursor even when the event target is the focused
 * trigger (e.g. filter button) and the list is in a portal.
 */
function findScrollable(el: HTMLElement | null): HTMLElement | null {
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const canScrollY = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    const canScrollX = overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay';
    // Radix Scroll Area viewport can have overflowY: hidden until scrollbar is enabled
    const isRadixViewport = el.hasAttribute?.('data-radix-scroll-area-viewport');
    const hasOverflowY = el.scrollHeight > el.clientHeight;
    const hasOverflowX = el.scrollWidth > el.clientWidth;
    if (canScrollY && hasOverflowY) return el;
    if (canScrollX && hasOverflowX) return el;
    if (isRadixViewport && hasOverflowY) return el;
    el = el.parentElement;
  }
  return null;
}

function isPageScrollRoot(el: HTMLElement): boolean {
  return el === document.documentElement || el === document.body;
}

export function installScrollWheelCapture(): () => void {
  const handler = (e: WheelEvent) => {
    // Prefer element under pointer so we scroll the list in portaled dropdowns even
    // when e.target is the focused trigger. Fallback to e.target for normal page scroll.
    let el: HTMLElement | null = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (!el || !document.body.contains(el)) el = e.target as HTMLElement;
    if (!el || !document.body.contains(el)) return;
    let scrollable = findScrollable(el);
    if (!scrollable && el !== (e.target as HTMLElement)) scrollable = findScrollable(e.target as HTMLElement);
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
