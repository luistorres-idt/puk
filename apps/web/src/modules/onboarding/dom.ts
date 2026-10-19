import type { TourContext } from './catalog';

export function isVisible(element: Element): boolean {
  const style = getComputedStyle(element);
  return (
    element.isConnected &&
    element.getClientRects().length > 0 &&
    style.visibility !== 'hidden' &&
    style.display !== 'none'
  );
}

export function visibleTarget(root: ParentNode, target: string): Element | undefined {
  return Array.from(root.querySelectorAll(`[data-tour="${target}"]`)).find(isVisible);
}

export function readContext(root: ParentNode): TourContext {
  const page = root.querySelector<HTMLElement>('[data-tour-page]');
  return {
    page: page?.dataset['tourPage'] ?? 'navigation',
    status: page?.dataset['tourStatus'] ?? '',
    step: page?.dataset['tourStep'] ?? '',
    unit: page?.dataset['tourUnit'] ?? '',
  };
}

export function waitForPage(root: ParentNode, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const check = (): void => {
      if (signal.aborted) return finish(new DOMException('Cancelled', 'AbortError'));
      const page = root.querySelector<HTMLElement>('[data-tour-page]');
      if (page?.dataset['tourError'] === 'true') return finish(new Error('page-error'));
      if (!page || page.dataset['tourReady'] !== 'false') finish();
    };
    const finish = (error?: Error): void => {
      observer.disconnect();
      clearTimeout(timeout);
      signal.removeEventListener('abort', check);
      if (error) reject(error);
      else resolve();
    };
    const observer = new MutationObserver(check);
    const timeout = setTimeout(() => finish(new Error('page-timeout')), 5000);
    observer.observe(root, { subtree: true, childList: true, attributes: true });
    signal.addEventListener('abort', check, { once: true });
    check();
  });
}
