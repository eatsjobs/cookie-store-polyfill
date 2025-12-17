import { CookieChangeEvent } from './events';
import { CookieStoreManager } from './manager';
import { getSafeSessionStorage } from './storage';
import type {
  CookieInit,
  CookieListItem,
  CookieStoreGetOptions,
  InternalCookieItem,
  MonitoringConfig,
} from './types';
import { getContext } from './utils';

/**
 * Simple polyfill for CookieStore API
 * Provides basic asynchronous cookie management functionality using document.cookie
 *
 * Implements the subset of the CookieStore API suitable for a polyfill:
 * - Basic cookie get/set/delete operations
 * - Partitioned attribute support (new for Privacy Sandbox)
 * - Limited URL-based filtering for secure flag and path matching
 *
 * LIMITATIONS:
 * 1. document.cookie doesn't expose cookie attributes (domain, path, expires, secure, sameSite)
 *    Retrieved cookies from native sources will only have name/value.
 *    Metadata is only preserved for cookies explicitly set through this polyfill API.
 *
 * 2. URL filtering (get/getAll with url option) has limited implementation:
 *    - Secure flag filtering works: HTTP URLs won't match secure cookies
 *    - Domain/path filtering only works for cookies set through this polyfill
 *    - Cookies set via document.cookie directly won't have domain/path metadata
 *
 * 3. Expires/max-age handling:
 *    - Setting expires via the polyfill API writes to document.cookie correctly
 *    - However, retrieving doesn't expose expires (document.cookie limitation)
 *
 * This polyfill prioritizes compatibility and reliability over full spec compliance.
 * For production use with full CookieStore features, browsers with native support
 * will be preferred (feature detection via "cookieStore" in globalThis).
 */
export class CookieStorePolyfill extends EventTarget {
  // Shared metadata storage across all instances (singleton pattern)
  static readonly cookieMetadata = new Map<string, InternalCookieItem>();
  static readonly metadataKey = '__cookiestore_polyfill_metadata__';
  static readonly safeSessionStorage = getSafeSessionStorage();

  // Monitoring configuration
  static monitoringConfig: Required<MonitoringConfig> = {
    enablePolling: true,
    pollingInterval: 50,
  };

  // Track the last known cookie state for polling
  static lastKnownCookieString = '';
  static pollingIntervalId: ReturnType<typeof setInterval> | null = null;
  static setterHookInstalled = false;
  static instances: Set<CookieStorePolyfill> = new Set();

  /**
   * Start monitoring document.cookie for external changes
   * Uses polling to detect when cookies are set externally via document.cookie
   */
  static startMonitoring(): void {
    if (CookieStorePolyfill.pollingIntervalId) {
      return; // Already monitoring
    }

    // Update initial state
    CookieStorePolyfill.lastKnownCookieString = document.cookie;

    // Only set up polling if enabled in configuration
    if (!CookieStorePolyfill.monitoringConfig.enablePolling) {
      return;
    }

    // Set up polling to detect external cookie changes
    CookieStorePolyfill.pollingIntervalId = setInterval(() => {
      const currentCookieString = document.cookie;
      if (currentCookieString !== CookieStorePolyfill.lastKnownCookieString) {
        CookieStorePolyfill.lastKnownCookieString = currentCookieString;
        CookieStorePolyfill.notifyAllInstances();
      }
    }, CookieStorePolyfill.monitoringConfig.pollingInterval);
  }

  /**
   * Stop monitoring document.cookie
   */
  static stopMonitoring(): void {
    if (CookieStorePolyfill.pollingIntervalId) {
      clearInterval(CookieStorePolyfill.pollingIntervalId);
      CookieStorePolyfill.pollingIntervalId = null;
    }
  }

  /**
   * Notify all instances of external cookie changes
   */
  private static notifyAllInstances(): void {
    for (const instance of CookieStorePolyfill.instances) {
      instance.detectExternalCookieChanges();
    }
  }

  /**
   * Encode cookie name/value similar to js-cookie
   * Keeps safe characters readable while escaping dangerous ones
   */
  private static encodeCookieComponent(str: string): string {
    // First, encode everything
    let encoded = encodeURIComponent(str);
    // Then decode safe characters that don't need escaping
    // %23 (#), %24 ($), %26 (&), %2B (+), %5E (^), %60 (`), %7C (|)
    encoded = encoded.replace(/%(23|24|26|2B|5E|60|7C)/g, decodeURIComponent);
    // Escape parentheses as they can cause issues
    encoded = encoded.replace(/[()]/g, c => {
      return `%${c.charCodeAt(0).toString(16).toUpperCase()}`;
    });
    return encoded;
  }

  /**
   * Decode cookie component (inverse of encodeCookieComponent)
   */
  private static decodeCookieComponent(str: string): string {
    return decodeURIComponent(str);
  }

  /**
   * Normalize SameSite value to canonical form
   * Converts lowercase variants to uppercase (e.g., 'lax' -> 'Lax')
   */
  private static normalizeSameSite(
    sameSite: 'Strict' | 'Lax' | 'None' | 'lax' | 'none' | undefined
  ): 'Strict' | 'Lax' | 'None' | undefined {
    if (sameSite == null) return undefined;
    const lower = sameSite.toLowerCase();
    if (lower === 'strict') return 'Strict';
    if (lower === 'lax') return 'Lax';
    if (lower === 'none') return 'None';
    return sameSite as 'Strict' | 'Lax' | 'None';
  }

  /**
   * Check if a URL path matches a cookie path (RFC 6265 rules)
   * The cookie path matches a URL path if:
   * 1. The paths are identical, OR
   * 2. The cookie path is a prefix of the URL path AND either:
   *    a. The cookie path ends with "/" OR
   *    b: The character at position len(cookie-path) in URL path is "/"
   */
  private static pathMatches(cookiePath: string, urlPath: string): boolean {
    // Exact match
    if (cookiePath === urlPath) {
      return true;
    }

    // Cookie path must be a prefix of URL path
    if (!urlPath.startsWith(cookiePath)) {
      return false;
    }

    // If cookie path ends with "/", it's always a match (we already checked prefix)
    if (cookiePath.endsWith('/')) {
      return true;
    }

    // Check that the next character in URL path is "/"
    // This prevents "/admin" from matching "/admin-panel"
    const nextCharIndex = cookiePath.length;
    return urlPath[nextCharIndex] === '/';
  }

  // CookieStore event handler property
  onchange: ((this: CookieStore, ev: CookieChangeEvent) => unknown) | null = null;

  constructor() {
    super();
    // Register this instance for monitoring
    CookieStorePolyfill.instances.add(this);

    // Start monitoring when first instance is created
    if (CookieStorePolyfill.instances.size === 1) {
      CookieStorePolyfill.startMonitoring();
    }

    // Wire up the onchange handler to the change event
    this.addEventListener('change', ((event: Event) => {
      if (this.onchange) {
        this.onchange.call(this as CookieStore, event as CookieChangeEvent);
      }
    }) as EventListener);
  }

  private getMetadata(): Map<string, InternalCookieItem> {
    return CookieStorePolyfill.cookieMetadata;
  }

  private toCookieListItem(internal: InternalCookieItem): CookieListItem {
    return {
      name: internal.name,
      value: internal.value,
      domain: internal.domain ?? undefined,
      path: internal.path ?? undefined,
      expires: internal.expires ?? undefined,
      secure: internal.secure,
      sameSite: internal.sameSite,
      partitioned: internal.partitioned,
    };
  }

  private setMetadata(metadata: Map<string, InternalCookieItem>): void {
    // Store metadata entries for session storage before clearing
    const entries = Array.from(metadata.entries());

    // Update in-memory storage (primary storage)
    CookieStorePolyfill.cookieMetadata.clear();
    for (const [key, value] of entries) {
      CookieStorePolyfill.cookieMetadata.set(key, value);
    }

    // Also try to persist to SafeStorage for multi-tab/window scenarios
    try {
      CookieStorePolyfill.safeSessionStorage.setItem(
        CookieStorePolyfill.metadataKey,
        JSON.stringify(entries)
      );
    } catch {
      // If serialization fails, at least the in-memory store is updated
    }
  }

  private matchesUrl(cookie: CookieListItem, url: string): boolean {
    const urlObj = new URL(url);

    // Check secure flag
    if (cookie.secure === true && urlObj.protocol !== 'https:') {
      return false;
    }

    // Check domain
    if (cookie.domain != null) {
      const cookieDomain = cookie.domain.startsWith('.')
        ? cookie.domain.substring(1)
        : cookie.domain;
      const urlDomain = urlObj.hostname ?? '';
      if (!urlDomain.endsWith(cookieDomain) && urlDomain !== cookieDomain) {
        return false;
      }
    }

    // Check path using RFC 6265 matching rules
    const cookiePath = cookie.path ?? '/';
    const urlPath = urlObj.pathname || '/';
    if (!CookieStorePolyfill.pathMatches(cookiePath, urlPath)) {
      return false;
    }

    return true;
  }

  /**
   * Detect and handle cookies that were set or deleted externally (via document.cookie)
   */
  private detectExternalCookieChanges(): void {
    const metadata = this.getMetadata();
    const currentCookies = new Map<string, string>();

    // Parse current document.cookie
    const cookieList = document.cookie.split(';');
    for (const cookie of cookieList) {
      const trimmedCookie = cookie.trim();
      if (trimmedCookie === '') continue;

      const eqIndex = trimmedCookie.indexOf('=');
      if (eqIndex === -1) continue;

      const name = CookieStorePolyfill.decodeCookieComponent(trimmedCookie.substring(0, eqIndex));
      const value = CookieStorePolyfill.decodeCookieComponent(trimmedCookie.substring(eqIndex + 1));
      currentCookies.set(name, value);
    }

    const changedCookies: InternalCookieItem[] = [];
    const deletedCookies: InternalCookieItem[] = [];
    const processedNames = new Set<string>();

    // Check for new or modified cookies
    for (const [name, value] of currentCookies.entries()) {
      processedNames.add(name);
      const existingCookie = metadata.get(name);

      if (!existingCookie || existingCookie.value !== value) {
        // New or modified cookie
        const cookieData: InternalCookieItem = {
          name,
          value,
          // Keep existing metadata if available
          domain: existingCookie?.domain,
          path: existingCookie?.path,
          expires: existingCookie?.expires,
          secure: existingCookie?.secure,
          sameSite: existingCookie?.sameSite,
          partitioned: existingCookie?.partitioned,
        };
        metadata.set(name, cookieData);
        changedCookies.push(cookieData);
      }
    }

    // Check for deleted cookies
    for (const [name, cookie] of metadata.entries()) {
      if (!processedNames.has(name)) {
        // Cookie was deleted externally
        deletedCookies.push(cookie);
        metadata.delete(name);
      }
    }

    // Update metadata and dispatch event if there were changes
    if (changedCookies.length > 0 || deletedCookies.length > 0) {
      this.setMetadata(metadata);
      this.dispatchEvent(
        new CookieChangeEvent(
          changedCookies.map(c => this.toCookieListItem(c)),
          deletedCookies.map(c => this.toCookieListItem(c))
        )
      );
    }
  }

  private detectAndRemoveExpiredCookies(): InternalCookieItem[] {
    const metadata = this.getMetadata();
    const expiredCookies: InternalCookieItem[] = [];
    const now = Date.now();

    for (const [name, cookie] of metadata.entries()) {
      if (cookie.expires != null && cookie.expires < now) {
        expiredCookies.push(cookie);
        metadata.delete(name);
        // Also delete from document.cookie
        const cookieString = `${CookieStorePolyfill.encodeCookieComponent(name)}=; max-age=-1; path=/`;
        // biome-ignore lint/suspicious/noDocumentCookie: we need to delete the cookie from the document.cookie
        document.cookie = cookieString;
      }
    }

    if (expiredCookies.length > 0) {
      this.setMetadata(metadata);
    }

    return expiredCookies;
  }

  async get(options?: CookieStoreGetOptions | string): Promise<CookieListItem | null> {
    const name = typeof options === 'string' ? options : options?.name;
    const url = typeof options === 'object' ? options?.url : undefined;

    if (name == null) {
      return null;
    }

    // Validate URL if provided
    if (url != null) {
      try {
        new URL(url);
      } catch {
        throw new TypeError(`Invalid URL: ${url}`);
      }
    }

    // Check for expired cookies and dispatch event if any (expired are treated as deleted)
    const expiredCookies = this.detectAndRemoveExpiredCookies();
    if (expiredCookies.length > 0) {
      this.dispatchEvent(
        new CookieChangeEvent([], expiredCookies.map(c => this.toCookieListItem(c)))
      );
    }

    const encodedName = CookieStorePolyfill.encodeCookieComponent(name);
    const nameEQ = `${encodedName}=`;
    const cookies = document.cookie.split(';');
    const metadata = this.getMetadata();

    for (const cookie of cookies) {
      const trimmedCookie = cookie.trim();
      if (trimmedCookie.startsWith(nameEQ)) {
        const decodedValue = CookieStorePolyfill.decodeCookieComponent(
          trimmedCookie.substring(nameEQ.length)
        );
        const cookieData = metadata.get(name) ?? {
          name,
          value: decodedValue,
        };

        // Update value from current document.cookie
        cookieData.value = decodedValue;

        // If URL is provided, check if cookie matches
        if (url != null && !this.matchesUrl(this.toCookieListItem(cookieData), url)) {
          return null;
        }

        return this.toCookieListItem(cookieData);
      }
    }
    return null;
  }

  async getAll(name?: string): Promise<CookieListItem[]>;
  async getAll(options?: CookieStoreGetOptions): Promise<CookieListItem[]>;
  async getAll(nameOrOptions?: string | CookieStoreGetOptions): Promise<CookieListItem[]> {
    const options = typeof nameOrOptions === 'string' ? { name: nameOrOptions } : nameOrOptions;

    // Validate URL if provided
    if (options?.url != null) {
      try {
        new URL(options.url);
      } catch {
        throw new TypeError(`Invalid URL: ${options.url}`);
      }
    }

    // Check for expired cookies and dispatch event if any (expired are treated as deleted)
    const expiredCookies = this.detectAndRemoveExpiredCookies();
    if (expiredCookies.length > 0) {
      this.dispatchEvent(
        new CookieChangeEvent([], expiredCookies.map(c => this.toCookieListItem(c)))
      );
    }

    const cookies: CookieListItem[] = [];
    const nameFilter = options?.name;
    const url = options?.url;
    const metadata = this.getMetadata();

    const cookieList = document.cookie.split(';');
    for (const cookie of cookieList) {
      const trimmedCookie = cookie.trim();
      if (trimmedCookie === '') continue;

      const eqIndex = trimmedCookie.indexOf('=');
      if (eqIndex === -1) continue;

      const name = CookieStorePolyfill.decodeCookieComponent(trimmedCookie.substring(0, eqIndex));
      const decodedValue = CookieStorePolyfill.decodeCookieComponent(
        trimmedCookie.substring(eqIndex + 1)
      );

      if (nameFilter != null && name !== nameFilter) {
        continue;
      }

      // Merge metadata with current value
      const cookieData = metadata.get(name) ?? {
        name,
        value: decodedValue,
      };
      cookieData.value = decodedValue;

      // Convert to public interface
      const publicCookie = this.toCookieListItem(cookieData);

      // If URL is provided, filter by URL match
      if (url != null && !this.matchesUrl(publicCookie, url)) {
        continue;
      }

      cookies.push(publicCookie);
    }
    return cookies;
  }

  private validateCookieInit(cookie: CookieInit): void {
    // Validate cookie name
    if (!cookie.name || typeof cookie.name !== 'string') {
      throw new TypeError('Cookie name must be a non-empty string');
    }

    // Validate cookie value
    if (typeof cookie.value !== 'string') {
      throw new TypeError('Cookie value must be a string');
    }

    // Validate sameSite
    if (cookie.sameSite != null) {
      const validSameSite = ['Strict', 'Lax', 'None', 'lax', 'none'];
      if (!validSameSite.includes(cookie.sameSite)) {
        throw new TypeError(
          `Invalid SameSite value: ${cookie.sameSite}. Must be one of: ${validSameSite.join(', ')}`
        );
      }
    }

    // Validate expires
    if (cookie.expires != null) {
      if (
        typeof cookie.expires !== 'number' ||
        Number.isNaN(cookie.expires) ||
        !Number.isFinite(cookie.expires)
      ) {
        throw new TypeError('Cookie expires must be a valid timestamp');
      }
      // Allow negative expires (treated as already expired) but limit upper bound
      if (cookie.expires > 32503680000000) {
        throw new TypeError('Cookie expires timestamp is too far in the future (beyond year 3000)');
      }
    }
  }

  async set(name: string, value: string): Promise<void>;
  async set(options: CookieInit): Promise<void>;
  async set(options: CookieInit | string, value?: string): Promise<void> {
    let cookieInit: CookieInit;

    if (typeof options === 'string') {
      cookieInit = {
        name: options,
        value: value ?? '',
      };
    } else {
      cookieInit = options;
    }

    // Validate cookie
    this.validateCookieInit(cookieInit);

    // Apply defaults per WHATWG spec
    const normalizedPath = cookieInit.path ?? '/';
    const normalizedSameSite = CookieStorePolyfill.normalizeSameSite(cookieInit.sameSite);

    let cookieString = `${CookieStorePolyfill.encodeCookieComponent(cookieInit.name)}=${CookieStorePolyfill.encodeCookieComponent(cookieInit.value)}`;

    // Always set path (defaults to "/" if not specified)
    cookieString += `; path=${normalizedPath}`;

    if (cookieInit.domain != null) {
      cookieString += `; domain=${cookieInit.domain}`;
    }

    if (cookieInit.expires != null) {
      const date = new Date(cookieInit.expires);
      cookieString += `; expires=${date.toUTCString()}`;
    }

    if (cookieInit.secure === true) {
      cookieString += '; secure';
    }

    if (normalizedSameSite != null) {
      cookieString += `; samesite=${normalizedSameSite}`;
    }

    if (cookieInit.partitioned === true) {
      cookieString += '; partitioned';
    }

    // biome-ignore lint/suspicious/noDocumentCookie: we need to set the cookie in the document.cookie
    document.cookie = cookieString;

    // Store metadata for attribute retrieval
    const cookieData: InternalCookieItem = {
      name: cookieInit.name,
      value: cookieInit.value,
      domain: cookieInit.domain,
      path: normalizedPath,
      expires: cookieInit.expires,
      secure: cookieInit.secure,
      sameSite: normalizedSameSite,
      partitioned: cookieInit.partitioned,
    };
    const metadata = this.getMetadata();
    metadata.set(cookieInit.name, cookieData);
    this.setMetadata(metadata);

    // Dispatch change event
    const cookieListItem = this.toCookieListItem(cookieData);
    this.dispatchEvent(new CookieChangeEvent([cookieListItem]));

    // Dispatch to ServiceWorker subscriptions if applicable
    CookieStorePolyfill.dispatchToSubscriptions([cookieListItem], []);
  }

  async delete(options: CookieStoreGetOptions | string): Promise<void> {
    const name = typeof options === 'string' ? options : options?.name;
    if (name == null) {
      return;
    }

    // Validate cookie name
    if (typeof name !== 'string' || !name) {
      throw new TypeError('Cookie name must be a non-empty string');
    }

    // Validate URL if provided
    const url = typeof options === 'object' ? options?.url : undefined;
    if (url != null) {
      try {
        new URL(url);
      } catch {
        throw new TypeError(`Invalid URL: ${url}`);
      }
    }

    // Delete by setting max-age to -1
    const cookieString = `${CookieStorePolyfill.encodeCookieComponent(name)}=; max-age=-1; path=/`;
    // biome-ignore lint/suspicious/noDocumentCookie: we need to delete the cookie from the document.cookie
    document.cookie = cookieString;

    // Remove metadata
    const metadata = this.getMetadata();
    metadata.delete(name);
    this.setMetadata(metadata);

    // Dispatch change event
    const deletedCookie = { name, value: '' };
    this.dispatchEvent(new CookieChangeEvent([], [deletedCookie]));

    // Dispatch to ServiceWorker subscriptions if applicable
    CookieStorePolyfill.dispatchToSubscriptions([], [deletedCookie]);
  }

  /**
   * Dispatch cookie change events to ServiceWorker subscriptions
   * @internal
   */
  static dispatchToSubscriptions(changed: CookieListItem[], deleted: CookieListItem[]): void {
    const self = globalThis as any;
    if (self.registration && self.registration.cookies instanceof CookieStoreManager) {
      self.registration.cookies.dispatchChangeEvent(changed, deleted);
    }
  }
}

/**
 * Install the CookieStore polyfill if it doesn't exist
 * Works in both Window and ServiceWorker contexts
 *
 * @param config Optional monitoring configuration for external cookie detection
 * @export
 * @returns {boolean} True if the polyfill was installed, false if it already exists
 */
export function installCookieStorePolyfillIfNeeded(config?: MonitoringConfig): boolean {
  if (typeof globalThis === 'undefined' || 'cookieStore' in globalThis) {
    return false;
  }

  const context = getContext();
  if (context === 'unknown') {
    return false;
  }

  // Apply configuration if provided
  if (config) {
    CookieStorePolyfill.monitoringConfig = {
      enablePolling: config.enablePolling ?? CookieStorePolyfill.monitoringConfig.enablePolling,
      pollingInterval:
        config.pollingInterval ?? CookieStorePolyfill.monitoringConfig.pollingInterval,
    };
  }

  globalThis.cookieStore = new CookieStorePolyfill() as CookieStore;

  // Install CookieStoreManager in ServiceWorker context
  if (context === 'serviceworker') {
    const self = globalThis as any;
    if (self.registration && !('cookies' in self.registration)) {
      self.registration.cookies = new CookieStoreManager();
    }
  }

  return true;
}

/**
 * Configure monitoring behavior for external cookie detection
 * Can be called at any time to change polling settings
 *
 * @param config New monitoring configuration (partial - only specified properties are updated)
 * @export
 * @example
 * // Disable polling entirely
 * configureMonitoring({ enablePolling: false });
 *
 * // Use faster polling (25ms instead of 50ms)
 * configureMonitoring({ pollingInterval: 25 });
 */
export function configureMonitoring(config: MonitoringConfig): void {
  // Update monitoring configuration (shared with CookieStoreManager)
  CookieStorePolyfill.monitoringConfig = {
    enablePolling: config.enablePolling ?? CookieStorePolyfill.monitoringConfig.enablePolling,
    pollingInterval: config.pollingInterval ?? CookieStorePolyfill.monitoringConfig.pollingInterval,
  };

  // If polling was disabled and is now enabled, restart monitoring
  if (config.enablePolling === true && !CookieStorePolyfill.pollingIntervalId) {
    CookieStorePolyfill.stopMonitoring();
    CookieStorePolyfill.startMonitoring();
  }

  // If polling was enabled and is now disabled, stop monitoring
  if (config.enablePolling === false && CookieStorePolyfill.pollingIntervalId) {
    CookieStorePolyfill.stopMonitoring();
  }
}

/**
 * Clear the cookie metadata store
 * This is primarily used for testing purposes
 * @internal
 */
export function clearCookieMetadata(): void {
  CookieStorePolyfill.cookieMetadata.clear();
  CookieStorePolyfill.safeSessionStorage.removeItem(CookieStorePolyfill.metadataKey);
}
