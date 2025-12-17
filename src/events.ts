import type { CookieListItem } from './types';

/**
 * Event fired when cookies are changed
 * Per WHATWG spec: https://cookiestore.spec.whatwg.org/
 * - changed: cookies that were modified or created
 * - deleted: cookies that were removed (includes expired cookies)
 */
export class CookieChangeEvent extends Event {
  readonly changed: CookieListItem[];
  readonly deleted: CookieListItem[];

  constructor(changed: CookieListItem[] = [], deleted: CookieListItem[] = []) {
    super('change', { bubbles: false, cancelable: false });
    this.changed = changed;
    this.deleted = deleted;
  }
}

/**
 * ExtendableCookieChangeEvent for ServiceWorker contexts
 * Allows service workers to extend event handling with waitUntil()
 */
export class ExtendableCookieChangeEvent extends CookieChangeEvent {
  private promises: Promise<void>[] = [];

  /**
   * Extend the service worker's lifetime
   * The service worker won't terminate until all promises settle
   */
  waitUntil(promise: Promise<void>): void {
    this.promises.push(promise);
  }

  /**
   * Get all promises to wait for
   * @internal
   */
  getPromises(): Promise<void>[] {
    return this.promises;
  }
}
