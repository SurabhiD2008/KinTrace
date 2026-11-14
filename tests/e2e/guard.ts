import AxeBuilder from '@axe-core/playwright';
import { test as base, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

export { expect };

declare global {
  interface Window {
    /** Written by the guard's page watchers. */
    __guard?: { shift: number; lostFocus: string[] };
  }
}

// The browser guard. Every browser test imports `test` from here. While a test runs
// it records console errors and warnings, uncaught page errors and failed requests
// in every tab; when the test ends it inspects each open page for horizontal
// overflow, clipped text, small tap targets, accessibility violations, layout
// shift, a missing lang attribute and lost focus. Any finding fails the test and
// attaches a screenshot. tests/e2e/guard.selftest.spec.ts proves each check fires.

/** WCAG 2.5.5 (AAA) target size; the project's minimum for anything you tap or click. */
export const MIN_TARGET_PX = 44;
export const MAX_LAYOUT_SHIFT = 0.1;

/**
 * Cancelled requests are not failures: a navigation or reload cancels whatever
 * the old page was still loading. Each browser words it differently.
 */
const CANCELLED = /net::ERR_ABORTED|NS_BINDING_ABORTED|cancelled|Load request cancelled/i;

export interface Problems {
  /** A failure matching this pattern was caused on purpose by the test (a mocked error). */
  allow(pattern: RegExp): void;
  /** Skips the end-of-test page inspection for one named check, with the reason. */
  skipCheck(check: PageCheck, reason: string): void;
  list(): string[];
}

export type PageCheck = 'overflow' | 'clipped' | 'targets' | 'axe' | 'layoutShift' | 'lang' | 'focus';

/** Watches layout shift and lost focus from the first script on every page. */
export const PAGE_WATCHERS = () => {
  const state = { shift: 0, lostFocus: [] as string[] };
  window.__guard = state;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) state.shift += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    // Layout-shift entries exist only in Chromium; other browsers report no shift.
  }
  let lastPress = 0;
  // A press on empty page moves focus to the body on purpose; that is not lost focus. The check
  // waits 100 ms so the page's own focus handling (after a dialog closes, say) can run first.
  document.addEventListener('pointerdown', () => void (lastPress = performance.now()), true);
  document.addEventListener(
    'focusout',
    (event) => {
      const target = event.target as Element | null;
      // Focus moving to another element names it; a control removed while focused leaves for nowhere.
      if ((event as FocusEvent).relatedTarget !== null) return;
      const at = performance.now();
      setTimeout(() => {
        // The focused control was removed from the page and focus fell back to the body.
        if (target && !target.isConnected && lastPress <= at && document.activeElement === document.body && document.hasFocus()) {
          state.lostFocus.push(target.tagName.toLowerCase() + (target.textContent ? ` "${target.textContent.trim().slice(0, 30)}"` : ''));
        }
      }, 100);
    },
    true,
  );
};

/** Findings for one page, by check. Exported for the guard's self-test. */
export async function inspectPage(page: Page, skip: ReadonlySet<PageCheck> = new Set()): Promise<string[]> {
  const findings = await page.evaluate(
    ({ minTarget, maxShift, skipped }) => {
      const out: string[] = [];
      const on = (check: string) => !skipped.includes(check);
      const doc = document.documentElement;
      const visible = (el: Element) => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        const clippedAway = style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(50%)';
        return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && !clippedAway && !el.closest('[aria-hidden="true"]');
      };
      const describe = (el: Element) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)}"`;
      const scrolls = (el: Element) => {
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          const overflow = getComputedStyle(parent).overflowX;
          if ((overflow === 'auto' || overflow === 'scroll') && parent.scrollWidth > parent.clientWidth) return true;
        }
        return false;
      };

      if (on('overflow') && doc.scrollWidth > doc.clientWidth + 1) out.push(`overflow: page is ${doc.scrollWidth - doc.clientWidth}px wider than the window`);

      if (on('clipped')) {
        for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
          if (el instanceof SVGElement || !visible(el) || el.dataset.truncated !== undefined) continue;
          const style = getComputedStyle(el);
          const hides = ['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflowY);
          const hasText = [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
          if (hides && hasText && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) out.push(`clipped text: ${describe(el)}`);
        }
      }

      if (on('targets')) {
        const targets = document.body.querySelectorAll<HTMLElement>('button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"]');
        for (const el of targets) {
          // Nodes of the zoomable family tree are sized by the zoom level, not by the page.
          if (el.closest('svg') || !visible(el) || scrolls(el)) continue;
          // A link inside a sentence is exempt, as in WCAG 2.5.8.
          if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && el.parentElement.textContent !== el.textContent) continue;
          // A checkbox or radio is tapped through its label, so the label is what is measured.
          const measured = (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type) && el.closest('label')) || el;
          const box = measured.getBoundingClientRect();
          if (box.width < minTarget || box.height < minTarget) out.push(`small target (${Math.round(box.width)}x${Math.round(box.height)}): ${describe(el)}`);
        }
      }

      const guard = window.__guard;
      if (on('layoutShift') && guard && guard.shift > maxShift) out.push(`layout shift ${guard.shift.toFixed(3)} is over ${maxShift}`);
      if (on('focus') && guard) for (const lost of guard.lostFocus) out.push(`lost focus: ${lost} was removed while focused`);
      if (on('lang') && !doc.lang.trim()) out.push('missing lang attribute on <html>');
      return out;
    },
    { minTarget: MIN_TARGET_PX, maxShift: MAX_LAYOUT_SHIFT, skipped: [...skip] as string[] },
  );
  if (!skip.has('axe')) {
    const results = await new AxeBuilder({ page }).analyze();
    for (const violation of results.violations) {
      if (violation.impact !== 'serious' && violation.impact !== 'critical') continue;
      findings.push(`axe ${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
    }
  }
  return findings;
}

export function watchEvents(context: BrowserContext, found: string[], isAllowed: (text: string) => boolean) {
  context.on('console', (message) => {
    const type = message.type();
    if ((type === 'error' || type === 'warning') && !isAllowed(message.text())) found.push(`console.${type}: ${message.text()}`);
  });
  context.on('weberror', (error) => found.push(`page error: ${error.error().message}`));
  context.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? '';
    if (!CANCELLED.test(reason) && !isAllowed(request.url())) found.push(`request failed: ${request.url()} ${reason}`);
  });
  context.on('response', (response) => {
    if (response.status() >= 400 && !isAllowed(response.url())) found.push(`HTTP ${response.status()}: ${response.url()}`);
  });
}

export const test = base.extend<{ problems: Problems }>({
  problems: [
    async ({ context }, use, testInfo) => {
      const found: string[] = [];
      const allowed: RegExp[] = [];
      const skipped = new Set<PageCheck>();
      await context.addInitScript(PAGE_WATCHERS);
      watchEvents(context, found, (text) => allowed.some((pattern) => pattern.test(text)));
      await use({
        allow: (pattern) => allowed.push(pattern),
        skipCheck: (check) => skipped.add(check),
        list: () => [...found],
      });
      for (const page of context.pages()) {
        if (page.isClosed() || !/^https?:/.test(page.url())) continue;
        const findings = await inspectPage(page, skipped);
        found.push(...findings.map((finding) => `${new URL(page.url()).pathname}: ${finding}`));
      }
      // Taken before the screenshot: a screenshot can itself make the page log (WebKit refuses a style it injects).
      const findings = [...found];
      if (findings.length > 0) {
        for (const page of context.pages()) {
          if (page.isClosed()) continue;
          await testInfo.attach('guard-findings', { body: await page.screenshot({ fullPage: true, caret: 'initial' }), contentType: 'image/png' });
        }
      }
      expect(findings, 'browser guard findings').toEqual([]);
    },
    { auto: true },
  ],
});
