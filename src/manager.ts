import { ExtendableCookieChangeEvent } from './events';
import type { CookieChangeSubscription, CookieListItem } from './types';

/**
 * CookieStoreManager for ServiceWorker cookie subscriptions
 * Allows service workers to subscribe to cookie change events for specific cookies
 * Shares the same monitoring configuration with CookieStorePolyfill
 */
export class CookieStoreManager {
  // Store subscriptions organized per cookie name for efficient lookup
  // Map key is cookie name (or undefined for subscriptions without a specific name)
  private subscriptionsByName: Map<string | undefined, CookieChangeSubscription[]> = new Map();
  // Keep track of all subscriptions for getSubscriptions()
  private allSubscriptions: CookieChangeSubscription[] = [];

  /**
   * Subscribe to cookie change events for specific cookies
   * @param subscriptions Array of cookie subscriptions (by name and/or url)
   */
  async subscribe(subscriptions: CookieChangeSubscription[]): Promise<void> {
    for (const subscription of subscriptions) {
      // Avoid duplicate subscriptions
      if (this.allSubscriptions.some(s => this.isSameSubscription(s, subscription))) {
        continue;
      }

      this.allSubscriptions.push(subscription);

      // Index by cookie name for efficient lookup
      const key = subscription.name;
      const existing = this.subscriptionsByName.get(key) || [];
      existing.push(subscription);
      this.subscriptionsByName.set(key, existing);
    }
  }

  /**
   * Unsubscribe from cookie change events
   * @param subscriptions Array of cookie subscriptions to remove
   */
  async unsubscribe(subscriptions: CookieChangeSubscription[]): Promise<void> {
    for (const subscription of subscriptions) {
      const index = this.allSubscriptions.findIndex(s => this.isSameSubscription(s, subscription));
      if (index > -1) {
        this.allSubscriptions.splice(index, 1);

        // Remove from indexed subscriptions
        const key = subscription.name;
        const existing = this.subscriptionsByName.get(key) || [];
        const indexed = existing.findIndex(s => this.isSameSubscription(s, subscription));
        if (indexed > -1) {
          existing.splice(indexed, 1);
          if (existing.length === 0) {
            this.subscriptionsByName.delete(key);
          }
        }
      }
    }
  }

  /**
   * Get all current subscriptions
   * @returns Array of cookie subscriptions
   */
  async getSubscriptions(): Promise<CookieChangeSubscription[]> {
    return [...this.allSubscriptions];
  }

  /**
   * Check if two subscriptions are the same
   * @internal
   */
  private isSameSubscription(
    sub1: CookieChangeSubscription,
    sub2: CookieChangeSubscription
  ): boolean {
    return sub1.name === sub2.name && sub1.url === sub2.url;
  }

  /**
   * Check if a cookie change should trigger subscription events
   * Uses the shared monitoring configuration from CookieStorePolyfill
   * Efficiently looks up subscriptions by cookie name
   * @internal
   */
  matchesSubscription(cookieName: string, cookieUrl?: string): boolean {
    // Check subscriptions for this specific cookie name
    const namedSubscriptions = this.subscriptionsByName.get(cookieName) || [];
    for (const sub of namedSubscriptions) {
      const urlMatches = !sub.url || cookieUrl?.startsWith(sub.url);
      if (urlMatches) {
        return true;
      }
    }

    // Check subscriptions without a specific name (catch-all subscriptions)
    const catchAllSubscriptions = this.subscriptionsByName.get(undefined) || [];
    for (const sub of catchAllSubscriptions) {
      const urlMatches = !sub.url || cookieUrl?.startsWith(sub.url);
      if (urlMatches) {
        return true;
      }
    }

    return false;
  }

  /**
   * Dispatch a cookie change event to the ServiceWorker if subscriptions match
   * @internal
   */
  dispatchChangeEvent(changed: CookieListItem[], deleted: CookieListItem[]): void {
    // Check if any subscriptions match the changed/deleted cookies
    for (const cookie of changed) {
      if (this.matchesSubscription(cookie.name, cookie.domain)) {
        this.emitCookieChangeEvent(changed, deleted);
        return;
      }
    }
    for (const cookie of deleted) {
      if (this.matchesSubscription(cookie.name, cookie.domain)) {
        this.emitCookieChangeEvent(changed, deleted);
        return;
      }
    }
  }

  /**
   * Emit the actual cookiechange event to the ServiceWorker global scope
   * @internal
   */
  private emitCookieChangeEvent(changed: CookieListItem[], deleted: CookieListItem[]): void {
    const self = globalThis as any;
    if (self.dispatchEvent) {
      // Use ExtendableCookieChangeEvent in ServiceWorker contexts for waitUntil() support
      const event = new ExtendableCookieChangeEvent(changed, deleted);
      self.dispatchEvent(event);
    }
  }
}
