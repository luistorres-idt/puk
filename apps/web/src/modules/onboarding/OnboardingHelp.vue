<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { NButton, useMessage } from 'naive-ui';
import { useRoute } from 'vue-router';
import type { DriveStep } from 'driver.js';
import { useSessionStore } from '@/stores/session';
import { buildTour } from './catalog';
import { createTourController } from './controller';
import { isVisible, readContext, visibleTarget, waitForPage } from './dom';
import { createTourProgress } from './progress';

const session = useSessionStore();
const route = useRoute();
const message = useMessage();
const loading = ref(false);
const button = ref<InstanceType<typeof NButton> | null>(null);
const controller = createTourController();
const progress = createTourProgress(() => window.localStorage);
let pending: AbortController | undefined;
let observation: MutationObserver | undefined;

function stop(): void {
  pending?.abort();
  pending = undefined;
  observation?.disconnect();
  observation = undefined;
  controller.stop();
  loading.value = false;
}

watch(
  () => [session.user?.id, session.user?.role, session.user?.orderAccessMode, route.fullPath],
  () => {
    stop();
    progress.clearSession();
  },
  { flush: 'sync' },
);

async function start(): Promise<void> {
  stop();
  const user = session.user;
  const root = button.value?.$el.closest('.app-shell') as HTMLElement | null;
  if (!user || !root) return;
  const abort = new AbortController();
  pending = abort;
  loading.value = true;
  try {
    await waitForPage(root, abort.signal);
    if (abort.signal.aborted) return;
    const context = readContext(root);
    const tour = buildTour(user, context);
    const completed = progress.completed(user, tour.id);
    const targets: Element[] = [];
    const steps: DriveStep[] = [
      {
        popover: {
          title: tour.title,
          description: `${completed ? 'Puedes repetir la guía. ' : ''}${tour.description}`,
        },
      },
    ];
    for (const item of tour.steps) {
      const element = visibleTarget(root, item.target);
      if (!element) {
        throw new Error(`Tour target is not visible: ${item.target}`);
      }
      targets.push(element);
      steps.push({ element, popover: { title: item.title, description: item.description } });
    }
    const initialContext = JSON.stringify(context);
    observation = new MutationObserver(() => {
      if (
        JSON.stringify(readContext(root)) !== initialContext ||
        targets.some((target) => !isVisible(target))
      )
        stop();
    });
    observation.observe(root, { subtree: true, childList: true, attributes: true });
    await controller.start({
      steps,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      onComplete: () => progress.complete(user, tour.id),
      onEnd: () => {
        observation?.disconnect();
        observation = undefined;
        if (button.value?.$el.isConnected) button.value.$el.focus();
      },
    });
  } catch {
    if (!abort.signal.aborted) {
      stop();
      message.info('Espera a que cargue la pantalla o resuelve el error y vuelve a abrir Ayuda.');
    }
  } finally {
    if (pending === abort) loading.value = false;
  }
}

window.addEventListener('resize', stop);
onBeforeUnmount(() => {
  stop();
  window.removeEventListener('resize', stop);
});
</script>

<template>
  <n-button
    v-if="session.user"
    ref="button"
    data-tour="help"
    size="small"
    secondary
    :loading="loading"
    aria-label="Ayuda: ver recorrido"
    @click="start"
    >Ayuda</n-button
  >
</template>
