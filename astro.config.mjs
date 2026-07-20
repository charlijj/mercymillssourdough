// @ts-check
import { defineConfig } from 'astro/config';

// Site config for Mercy Mills Sourdough.
// `site` is used for canonical URLs and sitemap generation.
export default defineConfig({
  site: 'https://mercymillsourdough.com',
  // Astro builds static HTML into ./dist, which is what Firebase Hosting serves.
  build: {
    format: 'directory',
  },
});
