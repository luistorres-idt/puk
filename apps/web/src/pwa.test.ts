import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { router } from './router';

describe('PWA and static assets configuration', () => {
  const publicDir = path.resolve(__dirname, '../public');

  it('provides a valid web manifest with standalone display and icons', () => {
    const manifestPath = path.join(publicDir, 'manifest.webmanifest');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifestContent.display).toBe('standalone');
    expect(manifestContent.name).toContain('Bull Dog Solution');
    expect(Array.isArray(manifestContent.icons)).toBe(true);
    expect(manifestContent.icons.length).toBeGreaterThanOrEqual(2);

    for (const icon of manifestContent.icons) {
      const iconPath = path.join(publicDir, icon.src);
      expect(fs.existsSync(iconPath)).toBe(true);
    }
  });

  it('service worker explicitly excludes API and health routes from caching', () => {
    const swPath = path.join(publicDir, 'sw.js');
    expect(fs.existsSync(swPath)).toBe(true);

    const swContent = fs.readFileSync(swPath, 'utf-8');
    // Ensure API & health routes are never cached
    expect(swContent).toContain("url.pathname.startsWith('/api/')");
    expect(swContent).toContain("url.pathname.startsWith('/health')");
    // Ensure only GET requests are considered for caching
    expect(swContent).toContain("event.request.method !== 'GET'");
  });

  it('index.html links manifest and icons', () => {
    const indexPath = path.resolve(__dirname, '../index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    expect(indexContent).toContain('rel="manifest"');
    expect(indexContent).toContain('href="/manifest.webmanifest"');
    expect(indexContent).toContain('rel="icon"');
  });

  it('all application routes are configured with deferred/lazy loading', () => {
    const routes = router.getRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(6);

    for (const route of routes) {
      if (route.components?.default) {
        // Must be a function (lazy import), not a plain component object
        expect(typeof route.components.default).toBe('function');
      }
    }
  });
});
