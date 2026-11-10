import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
    // Relative, so the build works from any folder.
    // Относительные пути: сборку можно положить в любую подпапку.
    base: './',
    plugins: [vue()],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
        dedupe: ['vue'],
    },
});
