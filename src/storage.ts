/**
 * In-memory Storage implementation for environments where sessionStorage is unavailable
 */
export class InMemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }

  key(index: number): string | null {
    const keys = Array.from(this.data.keys());
    return keys[index] ?? null;
  }
}

/**
 * Get or create a safe sessionStorage implementation
 * In incognito/private mode, sessionStorage may not be available
 * This returns an in-memory Storage implementation if needed
 */
export function getSafeSessionStorage(): Storage {
  try {
    sessionStorage.setItem('__test__', '');
    sessionStorage.removeItem('__test__');
    return sessionStorage;
  } catch {
    // sessionStorage not available (incognito mode, etc.)
    return new InMemoryStorage();
  }
}
