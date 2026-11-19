import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  base: process.env.VITE_BASE_PATH || '/dark_fantasy_2d_arpg/',
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts']
  }
});
