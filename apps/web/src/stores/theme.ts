import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';

export type ThemeMode = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'puk-theme';

function initialTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage may be disabled; the toggle still works for this session.
  }
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(initialTheme());
  const isDark = computed(() => mode.value === 'dark');

  watch(
    mode,
    (value) => {
      if (typeof document !== 'undefined') {
        document.documentElement.dataset['theme'] = value;
        document.documentElement.style.colorScheme = value;
      }
    },
    { immediate: true, flush: 'sync' },
  );

  function toggle(): void {
    mode.value = isDark.value ? 'light' : 'dark';
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode.value);
    } catch {
      // Keep the in-memory preference when storage is unavailable.
    }
  }

  return { mode, isDark, toggle };
});
