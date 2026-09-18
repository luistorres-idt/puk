<script setup lang="ts">
import {
  darkTheme,
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NMessageProvider,
  NNotificationProvider,
} from 'naive-ui';

import { computed } from 'vue';
import { themeOverrides, darkThemeOverrides } from './app/theme';
import { useThemeStore } from './stores/theme';

const theme = useThemeStore();
const overrides = computed(() => (theme.isDark ? darkThemeOverrides : themeOverrides));
</script>

<template>
  <n-config-provider :theme="theme.isDark ? darkTheme : null" :theme-overrides="overrides">
    <n-global-style />
    <n-notification-provider>
      <n-dialog-provider>
        <n-message-provider>
          <router-view />
        </n-message-provider>
      </n-dialog-provider>
    </n-notification-provider>
  </n-config-provider>
</template>
