// Browser tests run in CI against the same static files that Pages publishes.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const types = new Map([
  ['index.html', 'text/html'],
  ['style.css', 'text/css'],
  ['icon.svg', 'image/svg+xml'],
  ...['app.js', 'engine.js', 'frontline.js', 'bot.js', 'renderer.js', 'session.js'].map(name => [name, 'text/javascript'])
]);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = url.pathname === '/Tanks/' ? 'index.html' : url.pathname.slice('/Tanks/'.length);
  if (!url.pathname.startsWith('/Tanks/') || !types.has(file)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const data = await fs.readFile(path.join(root, file));
    res.writeHead(200, {'Content-Type': types.get(file)});
    res.end(data);
  } catch {
    res.writeHead(500).end();
  }
});

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/Tanks/`;
  const browser = await chromium.launch();
  const errors = [];
  async function newPage(options = {}) {
    const context = await browser.newContext({reducedMotion: 'reduce', ...options});
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    return page;
  }
  try {
    const local = await newPage();
    await local.locator('#scenario').selectOption('classic');
    await local.locator('#count').selectOption('4');
    await local.getByRole('button', {name: 'Start match'}).click();
    assert.equal(await local.locator('.player').count(), 4);
    await local.keyboard.press('d');
    assert.equal(await local.locator('#move').inputValue(), '6');
    await local.keyboard.press('Space');
    await local.getByRole('heading', {name: 'Ember’s turn'}).waitFor();
    assert.equal(await local.locator('#turn-label').textContent(), 'TURN 02');
    await local.reload();
    await local.getByRole('button', {name: 'Resume saved match'}).click();
    await local.getByRole('heading', {name: 'Ember’s turn'}).waitFor();

    const first = await newPage();
    await first.locator('#mode').selectOption('link');
    assert.equal(await first.locator('#count').isDisabled(), true);
    await first.getByRole('button', {name: 'Start match'}).click();
    await first.getByRole('button', {name: 'Finish deployment'}).click();
    await first.getByRole('heading', {name: 'Pass the turn'}).waitFor();
    const next = await first.locator('#share-url').inputValue();
    assert.ok(next.startsWith(url + '#turn='));
    const second = await newPage();
    await second.goto(next);
    await second.getByRole('button', {name: 'Open shared turn'}).click();
    await second.getByRole('heading', {name: 'Ember’s turn'}).waitFor();
    assert.equal(await second.locator('#turn-label').textContent(), 'TURN 02');
    assert.equal(await second.locator('#seed-label').textContent(), await first.locator('#seed-label').textContent());
    await second.getByRole('button', {name: 'Finish deployment'}).click();
    await second.getByRole('heading', {name: 'Pass the turn'}).waitFor();
    const returned = await second.locator('#share-url').inputValue();
    await first.goto(returned);
    await first.getByRole('button', {name: 'Open shared turn'}).waitFor();
    first.once('dialog', dialog => dialog.accept());
    await first.getByRole('button', {name: 'Open shared turn'}).click();
    await first.getByRole('heading', {name: 'Tide’s turn'}).waitFor();
    assert.equal(await first.locator('#turn-label').textContent(), 'TURN 03');
    await first.goto(url + '#turn=broken');
    await first.getByText('This turn link is invalid or incomplete.', {exact: false}).waitFor();
    await first.getByRole('heading', {name: 'Tide’s turn'}).waitFor();

    const mobile = await newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    await mobile.getByRole('button', {name: 'Start match'}).tap();
    await mobile.getByRole('button', {name: 'Finish deployment'}).tap();
    await mobile.getByRole('heading', {name: 'Ember’s turn'}).waitFor();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

    const frontline = await newPage({viewport: {width: 1366, height: 900}});
    await frontline.getByRole('button', {name: 'Start match'}).click();
    assert.equal(await frontline.locator('#units button').count(), 3);
    const battlefield = await frontline.locator('#field').boundingBox();
    assert.ok(battlefield.width >= 820 && battlefield.height >= 410);
    assert.equal(await frontline.getByRole('button', {name: /^Air Raid/}).count(), 0);
    await frontline.getByRole('button', {name: 'Finish deployment'}).click();
    await frontline.getByRole('heading', {name: 'Ember’s turn'}).waitFor();
    await frontline.getByRole('button', {name: 'Finish deployment'}).click();
    await frontline.getByRole('button', {name: /^Air Raid/}).click();
    await frontline.getByRole('button', {name: 'Call air raid'}).click();
    await frontline.getByRole('heading', {name: 'Ember’s turn'}).waitFor();
    assert.equal(await frontline.locator('#turn-label').textContent(), 'TURN 04');
    assert.equal(await frontline.getByRole('button', {name: 'Fire'}).isEnabled(), true);
    assert.equal(await frontline.locator('#bot-status').isVisible(), false);

    const solo = await newPage();
    await solo.locator('#mode').selectOption('solo');
    await solo.locator('#difficulty').selectOption('recruit');
    await solo.getByRole('button', {name: 'Start match'}).click();
    await solo.getByRole('button', {name: 'Finish deployment'}).click();
    await solo.getByRole('heading', {name: 'Ember AI'}).waitFor();
    assert.equal(await solo.locator('#controls').isVisible(), false);
    await solo.reload();
    await solo.getByRole('button', {name: 'Resume saved match'}).click();
    await solo.getByRole('heading', {name: 'Tide’s turn'}).waitFor({timeout: 12000});
    assert.equal(await solo.locator('#turn-label').textContent(), 'TURN 03');
    await solo.reload();
    await solo.getByRole('button', {name: 'Resume saved match'}).click();
    assert.equal(await solo.locator('#turn-label').textContent(), 'TURN 03');

    await solo.getByRole('button', {name: 'Fire'}).click();
    await solo.getByRole('heading', {name: 'Tide’s turn'}).waitFor({timeout: 12000});
    assert.equal(await solo.locator('#turn-label').textContent(), 'TURN 05');

    assert.deepEqual(errors, []);
    console.log('Chromium verified Classic, Frontline, solo recovery, two-context exchange, same-tab import, desktop battlefield and narrow touch play.');
  } finally {
    await browser.close();
    server.close();
  }
}
run().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
