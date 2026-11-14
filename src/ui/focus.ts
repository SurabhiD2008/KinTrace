/**
 * Moves keyboard focus to the current page's main heading, so a keyboard or
 * screen-reader user is never left on the page body. The heading is made
 * focusable from script only (tabindex -1), so it is not an extra Tab stop.
 */
export function focusPageHeading(): void {
  const heading = document.querySelector<HTMLElement>('main h1');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: false });
}

/** React may remove a control a moment after it loses focus, so the check runs twice. */
const CHECKS_MS = [0, 50];

/**
 * When the focused control is removed (a button that closes what it is in, a
 * notice that is dismissed), focus would fall back to the page body. This puts
 * it on the page heading instead. Returns a function that stops listening.
 */
export function keepFocusOnPage(target: Document = document): () => void {
  const onFocusOut = (event: FocusEvent) => {
    const removed = event.target;
    for (const delay of CHECKS_MS) {
      setTimeout(() => {
        if (removed instanceof Element && !removed.isConnected && target.activeElement === target.body) focusPageHeading();
      }, delay);
    }
  };
  target.addEventListener('focusout', onFocusOut, true);
  return () => target.removeEventListener('focusout', onFocusOut, true);
}
