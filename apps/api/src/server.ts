import { createApp } from './app.js';
import { loadEnvironment } from './config/environment.js';

const environment = loadEnvironment();
const server = createApp().listen(environment.PORT);

server.on('error', (error) => {
  process.stderr.write(`API server error: ${error.message}\n`);
  process.exitCode = 1;
});

function stopServer(): void {
  const forceExitTimeout = setTimeout(() => process.exit(1), 10_000);
  forceExitTimeout.unref();

  server.close((error) => {
    clearTimeout(forceExitTimeout);

    if (error !== undefined) {
      process.stderr.write(`API shutdown error: ${error.message}\n`);
      process.exit(1);
    }

    process.exit(0);
  });
}

process.once('SIGINT', stopServer);
process.once('SIGTERM', stopServer);
