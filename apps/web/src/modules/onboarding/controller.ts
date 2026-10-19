import type { Config, Driver, DriveStep } from 'driver.js';

type DriverFactory = (config: Config) => Driver;

async function loadDriver(): Promise<DriverFactory> {
  const [module] = await Promise.all([
    import('driver.js'),
    import('driver.js/dist/driver.css'),
    import('./onboarding.css'),
  ]);
  return module.driver;
}

export function createTourController(load: () => Promise<DriverFactory> = loadDriver) {
  let generation = 0;
  let active: Driver | undefined;

  function stop(): void {
    generation += 1;
    active?.destroy();
    active = undefined;
  }

  return {
    stop,
    async start(options: {
      steps: DriveStep[];
      reducedMotion: boolean;
      onComplete: () => void;
      onEnd: () => void;
    }): Promise<void> {
      stop();
      const current = generation;
      const driver = await load();
      if (current !== generation) return;
      const instance = driver({
        steps: options.steps,
        animate: !options.reducedMotion,
        smoothScroll: false,
        disableActiveInteraction: true,
        advanceOnClick: false,
        overlayClickBehavior: 'close',
        allowKeyboardControl: true,
        allowClose: true,
        showProgress: true,
        progressText: '{{current}} de {{total}}',
        nextBtnText: 'Siguiente',
        prevBtnText: 'Anterior',
        doneBtnText: 'Terminar guía',
        closeBtnLabel: 'Cerrar guía',
        popoverClass: 'puk-tour',
        onDestroyed: (_element, _step, { reason }) => {
          if (active === instance) active = undefined;
          if (current !== generation) return;
          if (reason === 'done') options.onComplete();
          options.onEnd();
        },
      });
      active = instance;
      instance.drive();
    },
  };
}
