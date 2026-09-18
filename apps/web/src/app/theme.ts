import type { GlobalThemeOverrides } from 'naive-ui';

export const themeOverrides: GlobalThemeOverrides = {
  common: {
    borderRadius: '10px',
    borderRadiusSmall: '8px',
    primaryColor: '#1d4ed8',
    primaryColorHover: '#2563eb',
    primaryColorPressed: '#1e40af',
  },
};

export const darkThemeOverrides: GlobalThemeOverrides = {
  common: {
    ...themeOverrides.common,
    primaryColor: '#60a5fa',
    primaryColorHover: '#93c5fd',
    primaryColorPressed: '#3b82f6',
    bodyColor: '#0f172a',
    cardColor: '#1e293b',
    modalColor: '#1e293b',
    popoverColor: '#1e293b',
  },
};
