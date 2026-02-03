/**
 * Ensures mouse wheel / trackpad scroll works inside dropdowns, filters, and any
 * overflow:auto/scroll container. Radix and other libs often block wheel at document
 * level; we run in capture phase so we handle the event first and scroll the
 * innermost scrollable element under the pointer.
 */
function findScrollable(el: HTMLElement | null): HTMLElement | null {
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const canScrollY = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    const canScrollX = overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay';
    if (canScrollY && el.scrollHeight > el.clientHeight) return el;
    if (canScrollX && el.scrollWidth > el.clientWidth) return el;
    el = el.parentElement;
  }
  return null;
}

function isPageScrollRoot(el: HTMLElement): boolean {
  return el === document.documentElement || el === document.body;
}

export function installScrollWheelCapture(): () => void {
  const handler = (e: WheelEvent) => {
    const target = e.target as Node;
    if (!target || !document.body.contains(target)) return;
    const scrollable = findScrollable(e.target as HTMLElement);
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
