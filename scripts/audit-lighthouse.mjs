import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Use an installed Lighthouse module, or supply its entry point as argument 4.
const [url = 'http://127.0.0.1:4330/', name = 'local', entry = 'lighthouse'] = process.argv.slice(2);
const { default: lighthouse } = await import(entry === 'lighthouse' ? entry : pathToFileURL(entry).href);
const { default: desktopConfig } = await import(entry === 'lighthouse'
  ? 'lighthouse/core/config/desktop-config.js'
  : new URL('./config/desktop-config.js', pathToFileURL(entry)).href);
await mkdir('reports/lighthouse', { recursive: true });
for (const formFactor of ['desktop', 'mobile']) {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--remote-debugging-port=9333'],
    ignoreDefaultArgs: ['--disable-back-forward-cache'],
  });
  try {
    const { lhr, report } = await lighthouse(url, {
      port: 9333,
      output: ['json', 'html'],
      logLevel: 'error',
    }, formFactor === 'desktop' ? desktopConfig : undefined);
    const base = `reports/lighthouse/${name}-${formFactor}`;
    await writeFile(`${base}.json`, report[0]);
    await writeFile(`${base}.html`, report[1]);
    if (lhr.runtimeError) throw new Error(JSON.stringify(lhr.runtimeError));
    console.log(JSON.stringify({
      url, formFactor,
      scores: Object.fromEntries(Object.entries(lhr.categories).map(([key, category]) => [key, category.score === null ? null : Math.round(category.score * 100)])),
      metrics: Object.fromEntries(['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'].map(key => [key, lhr.audits[key].displayValue])),
      failures: Object.values(lhr.audits).filter(audit => audit.score === 0).map(audit => audit.id),
    }, null, 2));
  } finally {
    await browser.close();
  }
}
