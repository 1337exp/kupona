#!/usr/bin/env node
/**
 * Screenshots of the app for the README (both languages share the same files).
 *
 *   npm run screenshot                                         starts its own dev server on a spare port
 *   SCREENSHOT_URL=http://localhost:5173 npm run screenshot    use a server that is already running
 *
 * Needs Chrome or Edge installed (driven through playwright-core, nothing is downloaded).
 * Output: docs/media/*.png. The data is the built-in OFZ 26248 example, so every run gives the same pictures.
 * Скриншоты для README (оба языка делят одни файлы). Данные: встроенный пример ОФЗ 26248, каждый запуск даёт те же кадры.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const PORT = 5195;
// Tall on purpose: the chain grows downwards, and the whole of it should be readable. / Высокий кадр: цепочка растёт вниз, и её надо видеть целиком.
const VIEWPORT = { width: 1280, height: 1500 };
/** The chain grows level by level (about half a second each) and the camera follows. / Цепочка растёт по уровням, камера следует. */
const GROW_MS = 6500;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'media');
mkdirSync(OUT, { recursive: true });

async function waitFor(url, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        try {
            if ((await fetch(url)).ok) return;
        } catch {
            // not up yet
        }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`The dev server did not come up at ${url}`);
}

async function startServer() {
    if (process.env.SCREENSHOT_URL) return { url: process.env.SCREENSHOT_URL, stop() {} };
    const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
    const child = spawn(process.execPath, [vite, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
    const url = `http://localhost:${PORT}`;
    await waitFor(url);
    return { url, stop: () => child.kill() };
}

async function launch() {
    for (const channel of ['chrome', 'msedge']) {
        try {
            return await chromium.launch({ channel });
        } catch {
            // try the next one
        }
    }
    throw new Error('Neither Chrome nor Edge could be launched');
}

const server = await startServer();
const browser = await launch();
try {
    /** A clean page in a language and a theme, with the chain grown from the example. / Чистая страница с выросшей цепочкой. */
    const grown = async (locale, scheme, button) => {
        const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: scheme, locale });
        const page = await context.newPage();
        await page.addInitScript(() => localStorage.clear());
        await page.goto(server.url);
        await page.getByRole('button', { name: button }).click();
        await page.waitForTimeout(GROW_MS);
        return page;
    };

    const shot = async (page, name) => {
        await page.screenshot({ path: join(OUT, `${name}.png`) });
        console.log(`docs/media/${name}.png`);
        await page.context().close();
    };

    await shot(await grown('ru-RU', 'dark', 'Посчитать'), 'chain-dark');
    await shot(await grown('en-US', 'light', 'Calculate'), 'chain-light');
} finally {
    await browser.close();
    server.stop();
}
