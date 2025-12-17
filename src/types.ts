/**
 * Internal cookie storage interface that allows null values
 */
export interface InternalCookieItem {
  name: string;
  value: string;
  domain?: string | null;
  path?: string | null;
  expires?: number | null;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None' | 'lax' | 'none';
  partitioned?: boolean;
}

/**
 * Cookie object returned by the CookieStore API
 * Per WHATWG spec: https://cookiestore.spec.whatwg.org/
 */
export interface CookieListItem {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  secure?: boolean;
  /** SameSite attribute in canonical form ('Strict', 'Lax', or 'None') */
  sameSite?: 'Strict' | 'Lax' | 'None';
  partitioned?: boolean;
}

/**
 * Options for setting a cookie
 */
export interface CookieInit {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None' | 'lax' | 'none';
  partitioned?: boolean;
}

/**
 * Options for getting/deleting a cookie
 */
export interface CookieStoreGetOptions {
  name?: string;
  url?: string;
}

/**
 * Cookie change subscription for CookieStoreManager
 */
export interface CookieChangeSubscription {
  name?: string;
  url?: string;
}

/**
 * Monitoring options for CookieStoreManager
 */
export interface MonitoringConfigOptions {
  enablePolling?: boolean;
  pollingInterval?: number;
}

/**
 * Configuration options for monitoring external cookie changes
 */
export interface MonitoringConfig {
  /**
   * Enable polling to detect external cookie changes (default: true)
   * When enabled, the polyfill will poll document.cookie at regular intervals
   * to detect changes made outside the polyfill API
   */
  enablePolling?: boolean;

  /**
   * Polling interval in milliseconds (default: 50)
   * Only used if enablePolling is true
   * Smaller values provide faster detection but use more CPU
   */
  pollingInterval?: number;
}
