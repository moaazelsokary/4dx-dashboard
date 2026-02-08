/**
 * Ensures mouse wheel / trackpad scroll works inside dropdowns and modals.
 * Runs in capture phase so we handle the event before Radix scroll lock.
 * Uses pointer position (elementsFromPoint) so we scroll the list under the cursor.
 */
function findScrollable(el: HTMLElement | null): HTMLElement | null {
  while (el && el !== document.body) {
    if (el.hasAttribute?.('data-dropdown-scroll') || el.hasAttribute?.('data-radix-scroll-area-viewport')) return el;
    const style = getComputedStyle(el);
    const oy = style.overflowY;
    const ox = style.overflowX;
    const scrollableY = (oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight;
    const scrollableX = (ox === 'auto' || ox === 'scroll' || ox === 'overlay') && el.scrollWidth > el.clientWidth;
    if (scrollableY || scrollableX) return el;
    el = el.parentElement;
  }
  return null;
}

function isPageRoot(el: HTMLElement): boolean {
  return el === document.documentElement || el === document.body;
}

export function installScrollWheelCapture(): () => void {
  const handler = (e: WheelEvent) => {
    const x = e.clientX;
    const y = e.clientY;
    const atPoint =
      typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(x, y)
        : [document.elementFromPoint(x, y)].filter(Boolean);

    let scrollable: HTMLElement | null = null;
    for (let i = 0; i < atPoint.length; i++) {
      const el = atPoint[i] as HTMLElement;
      if (!el?.isConnected) continue;
      if (el.hasAttribute?.('data-skip-wheel-overlay')) continue;
      scrollable = findScrollable(el);
      if (scrollable && !isPageRoot(scrollable)) break;
    }
    if (!scrollable && (e.target as HTMLElement)?.isConnected) {
      scrollable = findScrollable(e.target as HTMLElement);
      if (scrollable && isPageRoot(scrollable)) scrollable = null;
    }
    if (!scrollable || isPageRoot(scrollable)) return;

    const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = scrollable;
    const maxTop = scrollHeight - clientHeight;
    const maxLeft = scrollWidth - clientWidth;
    const lineHeight = 40;
    const dy =
      e.deltaMode === 1 ? e.deltaY * lineHeight : e.deltaMode === 2 ? e.deltaY * clientHeight : e.deltaY;
    const dx =
      e.deltaMode === 1 ? e.deltaX * lineHeight : e.deltaMode === 2 ? e.deltaX * clientWidth : e.deltaX;

    // Minimum scroll step for trackpad (small deltas still move the list)
    const minStep = 8;
    const stepY = Math.abs(dy) < minStep && dy !== 0 ? (dy > 0 ? minStep : -minStep) : dy;
    const stepX = Math.abs(dx) < minStep && dx !== 0 ? (dx > 0 ? minStep : -minStep) : dx;

    if (stepY !== 0 && maxTop > 0) {
      const newTop = stepY > 0 ? Math.min(scrollTop + stepY, maxTop) : Math.max(scrollTop + stepY, 0);
      if (newTop !== scrollTop) {
        scrollable.scrollTop = newTop;
        e.preventDefault();
        e.stopPropagation();
      }
    } else if (stepX !== 0 && maxLeft > 0) {
      const newLeft = stepX > 0 ? Math.min(scrollLeft + stepX, maxLeft) : Math.max(scrollLeft + stepX, 0);
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
