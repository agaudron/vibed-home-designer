import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build works at any address: the site root (Docker) or a
  // sub-path such as https://<user>.github.io/<repo>/ (GitHub Pages).
  base: './',
});
