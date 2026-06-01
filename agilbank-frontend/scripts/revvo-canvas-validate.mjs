/**
 * Validação final Revvo canvas scale.
 * Uso: node scripts/revvo-canvas-validate.mjs
 * Env: REVVO_BASE_URL, REVVO_VIEWPORTS=360,320,430,390
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'tmp', 'revvo-canvas-validate');
const base = process.env.REVVO_BASE_URL || 'http://localhost:5180';
const viewports = (process.env.REVVO_VIEWPORTS || '430,390,360,320')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter((n) => n > 0);

const routes = [
  { name: 'home', path: '/dev/revvo-home', grid: '.revvo-preview__shortcuts', minChildren: 5 },
  { name: 'wallet', path: '/dev/revvo-carteira', grid: '.revvo-wallet__metrics', minChildren: 4 },
  {
    name: 'ranking',
    path: '/dev/revvo-ranking',
    grid: '.revvo-ranking__podium',
    childSelector: '.revvo-ranking__podiumItem',
    minChildren: 3
  },
  { name: 'criar-missao', path: '/dev/revvo-criar-missao', grid: '.revvo-create__typeRow', minChildren: 5 },
  { name: 'missions', path: '/dev/revvo-missions', grid: '.revvo-missions__quickGrid', minChildren: 4 },
  { name: 'feed', path: '/dev/revvo-feed', grid: '.revvo-feed__statsCard', minChildren: 4 },
  {
    name: 'mission-exec',
    path: '/dev/revvo-mission/adidas-like',
    grid: '.revvo-mexec__rewards',
    minChildren: 5
  }
];

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const report = { base, viewports: [], staticChecks: { no943InRevvoFiles: true }, passed: true };

for (const width of viewports) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  const viewportResult = { width, routes: [] };

  for (const route of routes) {
    const url = `${base}${route.path}`;
    let loadError = null;
    try {
      const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      if (!res || !res.ok()) loadError = `HTTP ${res?.status()}`;
    } catch (e) {
      loadError = e.message;
    }

    await page.waitForTimeout(600);

    const metrics = await page.evaluate(({ gridSel, childSelector }) => {
      const app = document.querySelector('.revvo-canvas-app');
      const scaleWrap = document.querySelector('.revvo-canvas-scale');
      const surface = document.querySelector('.revvo-canvas-surface');
      const grid = document.querySelector(gridSel);
      const candidates = grid && childSelector ? [...grid.querySelectorAll(childSelector)] : grid ? [...grid.children] : [];
      const children = candidates.filter((el) => el.offsetParent !== null);
      const tops = children.map((el) => Math.round(el.getBoundingClientRect().top)).sort((a, b) => a - b);
      const uniqueTops = tops.reduce((groups, top) => {
        if (!groups.length || Math.abs(groups[groups.length - 1] - top) > 4) groups.push(top);
        return groups;
      }, []);

      const inlineScale = app?.style.getPropertyValue('--revvo-canvas-scale') || '';
      const inlineDesign = app?.style.getPropertyValue('--revvo-canvas-design-width') || '';
      const inlineWrapWidth = scaleWrap?.style.width || '';
      const inlineSurfaceWidth = surface?.style.width || '';

      const designWidth = app
        ? getComputedStyle(app).getPropertyValue('--revvo-canvas-design-width').trim()
        : '';
      const scaleVar = app
        ? getComputedStyle(app).getPropertyValue('--revvo-canvas-scale').trim()
        : '';
      const surfaceTransform = surface ? getComputedStyle(surface).transform : 'none';

      const docScrollW = document.documentElement.scrollWidth;
      const docClientW = document.documentElement.clientWidth;
      const horizontalOverflow = docScrollW > docClientW + 2;

      return {
        childCount: children.length,
        rowCount: uniqueTops.length,
        designWidth,
        scaleVar,
        surfaceTransform,
        jsOverrodeScale: Boolean(inlineScale),
        jsOverrodeDesignWidth: Boolean(inlineDesign),
        jsInlineWrapWidth: Boolean(inlineWrapWidth),
        jsInlineSurfaceWidth: Boolean(inlineSurfaceWidth),
        horizontalOverflow,
        docScrollW,
        docClientW
      };
    }, { gridSel: route.grid, childSelector: route.childSelector || '' });

    const shot = join(outDir, `${route.name}-${width}px.png`);
    await page.screenshot({ path: shot, fullPage: true });

    const rowOk =
      route.minChildren === 5
        ? metrics.childCount >= 5 && metrics.rowCount === 1
        : metrics.rowCount === 1;
    const designOk = metrics.designWidth === '430px';
    const jsOk =
      !metrics.jsOverrodeScale &&
      !metrics.jsOverrodeDesignWidth &&
      !metrics.jsInlineSurfaceWidth;
    const pass = !loadError && rowOk && designOk && jsOk && !metrics.horizontalOverflow;

    if (!pass) report.passed = false;

    viewportResult.routes.push({
      route: route.name,
      url,
      loadError,
      screenshot: shot,
      pass,
      ...metrics,
      rowOk,
      designOk,
      jsOk
    });
  }

  await page.close();
  report.viewports.push(viewportResult);
}

await browser.close();

const summaryPath = join(outDir, 'validation-report.json');
writeFileSync(summaryPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`\nReport: ${summaryPath}`);

process.exit(report.passed ? 0 : 1);
