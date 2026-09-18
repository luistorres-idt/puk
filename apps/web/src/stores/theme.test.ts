import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, useThemeStore } from './theme';

describe('theme preference', () => {
  const storage = new Map<string, string>();
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: '' } };
  let systemDark = false;

  beforeEach(() => {
    storage.clear();
    systemDark = false;
    setActivePinia(createPinia());
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      matchMedia: () => ({ matches: systemDark }),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('uses the system preference without persisting it as an explicit choice', () => {
    systemDark = true;
    expect(useThemeStore().mode).toBe('dark');
    expect(root.dataset['theme']).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(storage.has(THEME_STORAGE_KEY)).toBe(false);
  });

  it('prefers a saved choice over the system preference', () => {
    systemDark = true;
    storage.set(THEME_STORAGE_KEY, 'light');
    expect(useThemeStore().isDark).toBe(false);
  });

  it('ignores invalid stored values', () => {
    storage.set(THEME_STORAGE_KEY, 'invalid');
    expect(useThemeStore().mode).toBe('light');
  });

  it('toggles both ways and restores the last choice in a new store', () => {
    const theme = useThemeStore();
    theme.toggle();
    expect(theme.isDark).toBe(true);
    expect(root.dataset['theme']).toBe('dark');
    expect(storage.get(THEME_STORAGE_KEY)).toBe('dark');
    setActivePinia(createPinia());
    expect(useThemeStore().mode).toBe('dark');
    useThemeStore().toggle();
    expect(root.style.colorScheme).toBe('light');
    expect(storage.get(THEME_STORAGE_KEY)).toBe('light');
  });

  it('still toggles when storage access throws', () => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Blocked');
      },
    });
    const theme = useThemeStore();
    expect(() => theme.toggle()).not.toThrow();
    expect(theme.mode).toBe('dark');
  });
});
