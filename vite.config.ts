import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// BASE_PATH lets GitHub Pages serve the app from /<repo>/; defaults to relative paths.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
