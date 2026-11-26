// Static hosts such as GitHub Pages have no rewrite rules, so a deep link like /place/n123 would
// be a 404. They do serve 404.html for unknown paths: making it a copy of index.html lets the
// app boot and the router show the right screen. Run after `vite build`.
import { copyFile, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
await copyFile(new URL('index.html', dist), new URL('404.html', dist));
// Tells GitHub Pages to publish the folder as-is instead of running it through Jekyll.
await writeFile(new URL('.nojekyll', dist), '');
console.log('wrote dist/404.html and dist/.nojekyll');
