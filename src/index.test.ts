import { beforeEach, describe, expect, it } from 'vitest';
import { clearCookieMetadata, configureMonitoring, installCookieStorePolyfill } from './index';

describe('CookieStore Polyfill - Basic Functionality', () => {
  beforeEach(() => {
    // Reset the global polyfill
    delete (globalThis as any).cookieStore;
    clearCookieMetadata();
    // Clear all cookies
    document.cookie.split(';').forEach(c => {
      const cookieName = c.split('=')[0].trim();
      if (cookieName) {
        document.cookie = `${cookieName}=;expires=${new Date(0).toUTCString()}`;
      }
    });
  });

  it('should install the polyfill', () => {
    const installed = installCookieStorePolyfill();
    expect(installed).toBe(true);
    expect('cookieStore' in globalThis).toBe(true);
  });

  it('should set and get a cookie', async () => {
    installCookieStorePolyfill();
    const store = globalThis.cookieStore as CookieStore;

    await store.set('test-cookie', 'test-value');
    const cookie = await store.get('test-cookie');

    expect(cookie).not.toBeNull();
    expect(cookie?.name).toBe('test-cookie');
    expect(cookie?.value).toBe('test-value');
  });

  it('should dispatch change event on set', async () => {
    installCookieStorePolyfill();
    const store = globalThis.cookieStore as CookieStore;

    let changeEvent: any = null;

    store.addEventListener('change', (event: any) => {
      changeEvent = event;
    });

    await store.set('test', 'value');

    expect(changeEvent).not.toBeNull();
    expect(changeEvent.changed).toBeDefined();
    expect(changeEvent.changed[0]?.name).toBe('test');
  });

  it('should support removeEventListener', async () => {
    installCookieStorePolyfill();
    const store = globalThis.cookieStore as CookieStore;

    const events: any[] = [];

    const listener = (event: any) => {
      events.push(event);
    };

    store.addEventListener('change', listener);

    await store.set('test1', 'value1');
    expect(events.length).toBe(1);

    // Remove the listener
    store.removeEventListener('change', listener);

    await store.set('test2', 'value2');
    // Should still be 1, not 2, because we removed the listener
    expect(events.length).toBe(1);
  });

  it('should support multiple event listeners', async () => {
    installCookieStorePolyfill();
    const store = globalThis.cookieStore as CookieStore;

    const events1: any[] = [];
    const events2: any[] = [];

    const listener1 = (event: any) => {
      events1.push(event);
    };

    const listener2 = (event: any) => {
      events2.push(event);
    };

    store.addEventListener('change', listener1);
    store.addEventListener('change', listener2);

    await store.set('test', 'value');

    expect(events1.length).toBe(1);
    expect(events2.length).toBe(1);
  });
});

describe('CookieStore Polyfill - Validation and Error Handling', () => {
  beforeEach(() => {
    delete (globalThis as any).cookieStore;
    clearCookieMetadata();
    document.cookie.split(';').forEach(c => {
      const cookieName = c.split('=')[0].trim();
      if (cookieName) {
        document.cookie = `${cookieName}=;expires=${new Date(0).toUTCString()}`;
      }
    });
    installCookieStorePolyfill();
  });

  it('should reject empty cookie names', async () => {
    const store = globalThis.cookieStore as CookieStore;

    await expect(store.set('', 'value')).rejects.toThrow(TypeError);
  });

  it('should reject invalid sameSite values', async () => {
    const store = globalThis.cookieStore as CookieStore;

    await expect(
      store.set({
        name: 'test',
        value: 'value',
        sameSite: 'Invalid' as any,
      })
    ).rejects.toThrow(TypeError);
  });

  it('should reject invalid expires values', async () => {
    const store = globalThis.cookieStore as CookieStore;

    await expect(
      store.set({
        name: 'test',
        value: 'value',
        expires: 'not-a-number' as any,
      })
    ).rejects.toThrow(TypeError);
  });

  it('should reject Infinity as expires', async () => {
    const store = globalThis.cookieStore as CookieStore;

    await expect(
      store.set({
        name: 'test',
        value: 'value',
        expires: Infinity,
      })
    ).rejects.toThrow(TypeError);
  });

  it('should reject negative expires values', async () => {
    const store = globalThis.cookieStore as CookieStore;

    await expect(
      store.set({
        name: 'test',
        value: 'value',
        expires: -1000,
      })
    ).rejects.toThrow(TypeError);
  });

  it('should reject expires timestamps beyond year 3000', async () => {
    const store = globalThis.cookieStore as CookieStore;

    await expect(
      store.set({
        name: 'test',
        value: 'value',
        expires: 33000000000000, // Year 3004
      })
    ).rejects.toThrow(TypeError);
  });

  it('should accept valid expires timestamps', async () => {
    const store = globalThis.cookieStore as CookieStore;

    // Current time and future times should be accepted
    const validTimestamps = [
      Date.now(), // Now
      Date.now() + 86400000, // Tomorrow
      0, // Epoch start
      32503680000000, // Year 3000
    ];

    for (const timestamp of validTimestamps) {
      await expect(
        store.set({
          name: `test-${timestamp}`,
          value: 'value',
          expires: timestamp,
        })
      ).resolves.toBeUndefined();
    }
  });

  it('should reject invalid URLs in get', async () => {
    const store = globalThis.cookieStore as CookieStore;

    await expect(
      store.get({
        name: 'test',
        url: 'not-a-valid-url',
      })
    ).rejects.toThrow(TypeError);
  });

  it('should reject invalid URLs in getAll', async () => {
    const store = globalThis.cookieStore as CookieStore;

    await expect(
      store.getAll({
        url: 'not-a-valid-url',
      })
    ).rejects.toThrow(TypeError);
  });

  it('should accept valid sameSite values', async () => {
    const store = globalThis.cookieStore as CookieStore;

    const validValues = ['Strict', 'Lax', 'None'];
    for (const sameSite of validValues) {
      await expect(
        store.set({
          name: `test-${sameSite}`,
          value: 'value',
          sameSite: sameSite as any,
        })
      ).resolves.toBeUndefined();
    }
  });
});

describe('CookieStore Polyfill - Special Characters', () => {
  beforeEach(() => {
    delete (globalThis as any).cookieStore;
    clearCookieMetadata();
    document.cookie.split(';').forEach(c => {
      const cookieName = c.split('=')[0].trim();
      if (cookieName) {
        document.cookie = `${cookieName}=;expires=${new Date(0).toUTCString()}`;
      }
    });
    installCookieStorePolyfill();
  });

  it('should handle special characters in cookie name', async () => {
    const store = globalThis.cookieStore as CookieStore;

    await store.set('cookie-with-dash_and_underscore', 'value');
    const cookie = await store.get('cookie-with-dash_and_underscore');
    expect(cookie?.name).toBe('cookie-with-dash_and_underscore');
  });

  it('should handle special characters in cookie value', async () => {
    const store = globalThis.cookieStore as CookieStore;

    const specialValue = 'value with spaces, commas; semicolons:colons!';
    await store.set('test', specialValue);
    const cookie = await store.get('test');
    expect(cookie?.value).toBe(specialValue);
  });

  it('should handle unicode characters', async () => {
    const store = globalThis.cookieStore as CookieStore;

    const unicodeValue = 'café ☕ 中文 日本語 🍪';
    await store.set('unicode', unicodeValue);
    const cookie = await store.get('unicode');
    expect(cookie?.value).toBe(unicodeValue);
  });

  it('should handle equals sign in value', async () => {
    const store = globalThis.cookieStore as CookieStore;

    const valueWithEquals = 'a=b=c';
    await store.set('test', valueWithEquals);
    const cookie = await store.get('test');
    expect(cookie?.value).toBe(valueWithEquals);
  });

  it('should handle empty value', async () => {
    const store = globalThis.cookieStore as CookieStore;

    await store.set('empty', '');
    const cookie = await store.get('empty');
    expect(cookie?.name).toBe('empty');
    expect(cookie?.value).toBe('');
  });

  it('should handle very long values', async () => {
    const store = globalThis.cookieStore as CookieStore;

    const longValue = 'x'.repeat(4000);
    await store.set('long', longValue);
    const cookie = await store.get('long');
    expect(cookie?.value).toBe(longValue);
  });

  it('should handle special characters in getAll', async () => {
    const store = globalThis.cookieStore as CookieStore;

    await store.set('test1', 'value1');
    await store.set('test2', 'value with spaces');
    await store.set('test3', 'café');

    const cookies = await store.getAll();
    expect(cookies.length).toBe(3);
    expect(cookies.find(c => c.name === 'test2')?.value).toBe('value with spaces');
    expect(cookies.find(c => c.name === 'test3')?.value).toBe('café');
  });

  it('should handle js-cookie safe characters', async () => {
    const store = globalThis.cookieStore as CookieStore;

    // These characters are kept readable in js-cookie: # $ & + ^ ` |
    const valueWithSafeChars = 'value with #hash $dollar &ampersand +plus ^caret `backtick |pipe';
    await store.set('safe-chars', valueWithSafeChars);
    const cookie = await store.get('safe-chars');
    expect(cookie?.value).toBe(valueWithSafeChars);
  });

  it('should handle parentheses in values', async () => {
    const store = globalThis.cookieStore as CookieStore;

    const valueWithParens = 'value with (parentheses) and [brackets]';
    await store.set('parens', valueWithParens);
    const cookie = await store.get('parens');
    expect(cookie?.value).toBe(valueWithParens);
  });
});

describe('CookieStore Polyfill - Expired Cookies', () => {
  beforeEach(() => {
    clearCookieMetadata();
    // Clear all cookies
    document.cookie.split(';').forEach(c => {
      const cookieName = c.split('=')[0].trim();
      if (cookieName) {
        document.cookie = `${cookieName}=;expires=${new Date(0).toUTCString()}`;
      }
    });
    // Reinstall for each test
    delete (globalThis as any).cookieStore;
    installCookieStorePolyfill();
  });

  it('should remove expired cookies from results', async () => {
    const store = globalThis.cookieStore as CookieStore;

    // Set a cookie that expires in the past (already expired)
    const pastTime = Date.now() - 1000; // 1 second ago
    await store.set({
      name: 'expired-cookie',
      value: 'test-value',
      expires: pastTime,
    });

    // Immediately check if it exists - should be removed due to expiration
    const cookie = await store.get('expired-cookie');

    // The cookie should be expired/removed
    expect(cookie).toBeNull();
  });

  it('should detect and report expired cookies in events', async () => {
    const store = globalThis.cookieStore as CookieStore;

    const events: any[] = [];

    store.addEventListener('change', (event: any) => {
      events.push({
        type: 'change',
        changed: event.changed?.length ?? 0,
        deleted: event.deleted?.length ?? 0,
        expired: event.expired?.length ?? 0,
      });
    });

    // Set a cookie that expires in the past (already expired)
    const pastTime = Date.now() - 1000; // 1 second ago
    await store.set({
      name: 'expired-cookie',
      value: 'test-value',
      expires: pastTime,
    });

    // We should have 1 event from set
    expect(events.length).toBe(1);

    // Clear events
    events.length = 0;

    // Immediately check if it exists - should trigger expiration detection
    const cookie = await store.get('expired-cookie');

    // The cookie should be expired/removed
    expect(cookie).toBeNull();

    // Check if there was an expiration event
    expect(events.length).toBe(1);
    expect(events[0].expired).toBe(1);
  });
});

describe('CookieStore Polyfill - Monitoring Configuration', () => {
  beforeEach(() => {
    delete (globalThis as any).cookieStore;
    clearCookieMetadata();
    document.cookie.split(';').forEach(c => {
      const cookieName = c.split('=')[0].trim();
      if (cookieName) {
        document.cookie = `${cookieName}=;expires=${new Date(0).toUTCString()}`;
      }
    });
  });

  it('should allow disabling polling on install', async () => {
    const installed = installCookieStorePolyfill({ enablePolling: false });
    expect(installed).toBe(true);
    expect('cookieStore' in globalThis).toBe(true);

    // Polling should be disabled, so no interval should be active
    const store = globalThis.cookieStore as CookieStore;
    const events: any[] = [];

    store.addEventListener('change', (event: any) => {
      events.push(event);
    });

    // Write via the API should still work
    await store.set('test', 'value');
    expect(events.length).toBe(1); // Should have received the set event

    // But external changes won't be detected since polling is disabled
    events.length = 0;
    document.cookie = 'external=value';

    // Wait a bit to see if polling would have detected it (it won't)
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(events.length).toBe(0); // No external detection events
  });

  it('should allow configuring polling interval at install', async () => {
    const installed = installCookieStorePolyfill({ pollingInterval: 100 });
    expect(installed).toBe(true);

    // Just verify it installed without errors
    expect('cookieStore' in globalThis).toBe(true);
  });

  it('should allow changing polling interval at runtime', async () => {
    installCookieStorePolyfill({ enablePolling: true, pollingInterval: 50 });

    // Change the interval
    configureMonitoring({ pollingInterval: 100 });

    // Verify the polyfill still works
    const store = globalThis.cookieStore as CookieStore;
    await store.set('test', 'value');
    const cookie = await store.get('test');
    expect(cookie?.value).toBe('value');
  });

  it('should allow enabling polling at runtime if it was disabled', async () => {
    installCookieStorePolyfill({ enablePolling: false });

    // Re-enable polling
    configureMonitoring({ enablePolling: true, pollingInterval: 50 });

    // Verify the polyfill still works
    const store = globalThis.cookieStore as CookieStore;
    await store.set('test', 'value');
    const cookie = await store.get('test');
    expect(cookie?.value).toBe('value');
  });

  it('should allow disabling polling at runtime', async () => {
    installCookieStorePolyfill({ enablePolling: true });
    const store = globalThis.cookieStore as CookieStore;

    // Set a cookie to verify the API still works
    await store.set('test', 'value');
    expect(await store.get('test')).not.toBeNull();

    // Disable polling
    configureMonitoring({ enablePolling: false });

    // API should still work
    await store.set('test2', 'value2');
    const cookie = await store.get('test2');
    expect(cookie?.value).toBe('value2');
  });

  it('should accept partial config updates', async () => {
    installCookieStorePolyfill({ enablePolling: true, pollingInterval: 50 });

    // Update only the polling interval
    configureMonitoring({ pollingInterval: 200 });

    // Verify it still works
    const store = globalThis.cookieStore as CookieStore;
    await store.set('test', 'value');
    const cookie = await store.get('test');
    expect(cookie?.value).toBe('value');
  });
});
