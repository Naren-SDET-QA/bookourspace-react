async (page) => {
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  const checks = [];
  const pageErrors = [];
  const apiFailures = [];
  page.on('pageerror', error => pageErrors.push(error.message.slice(0, 200)));
  page.on('response', response => {
    if (response.url().includes('/api/') && response.status() >= 400) {
      apiFailures.push({ path: new URL(response.url()).pathname, status: response.status() });
    }
  });
  const check = async (name, action) => {
    try { checks.push({ name, status: 'PASS', details: await action() }); }
    catch (error) { checks.push({ name, status: 'FAIL', error: error.message.slice(0, 350) }); }
  };
  const home = async () => {
    await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '🎬 NEW Movies', exact: true }).waitFor();
  };
  const open = async name => {
    await home();
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('main').waitFor();
    if (name === '🏨 Stay') await page.locator('#stays-explorer-title').waitFor();
    if (name === '🛠️ LIVE Services') await page.locator('#services-explorer-title').waitFor();
    if (name === '🎬 NEW Movies') await page.locator('#now-showing-title').waitFor();
  };
  const inventory = async () => ({
    headings: await page.getByRole('main').locator('h2,h3').allTextContents(),
    interactiveCount: await page.locator('button,a,input,select,textarea').count(),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
  });
  await check('Home navigation', async () => {
    await home();
    return { modules: await page.getByRole('button').allTextContents() };
  });
  for (const [name, button] of [
    ['PGs', "PG's Hostels & Co-Living 🏠 ✓"],
    ['Classes', 'Classes IT, Academic & AI 🎓 LIVE'],
    ['Venues', '🏛️ Halls'],
    ['Services', '🛠️ LIVE Services'],
    ['Stays', '🏨 Stay'],
    ['Movies', '🎬 NEW Movies'],
  ]) {
    await check(`${name} opens`, async () => {
      await open(button);
      return await inventory();
    });
  }
  await check('Movies language filtering and reset', async () => {
    const region = page.getByRole('region', { name: 'Now Showing' });
    await region.getByRole('heading', { name: 'Metro Dreams', exact: true }).waitFor();
    await region.getByRole('button', { name: 'Hindi', exact: true }).click();
    await region.getByRole('heading', { name: 'Midnight Express', exact: true }).waitFor();
    if (await region.locator('article').count() !== 1) throw new Error('Hindi filter did not leave exactly one demo movie');
    await region.getByRole('button', { name: 'Now Running', exact: true }).click();
    await region.getByRole('heading', { name: 'Metro Dreams', exact: true }).waitFor();
    return { cards: await region.locator('article').count() };
  });
  await check('Movies search, empty state and recovery', async () => {
    const search = page.getByLabel('Search movies or theatres');
    await search.fill('no-such-movie-839');
    await page.getByText('No published screenings match your search.').waitFor();
    await search.fill('Metro Dreams');
    await page.getByRole('heading', { name: 'Metro Dreams', exact: true }).waitFor();
    return { cards: await page.getByRole('main').locator('article').count() };
  });
  await check('Movies read-only admin preview', async () => {
    await page.getByRole('button', { name: 'Theatre administration', exact: true }).click();
    await page.getByText('Sample theatre cards · read-only demo data', { exact: true }).waitFor();
    const switches = page.getByRole('switch');
    for (const element of await switches.all()) {
      if (!await element.isDisabled()) throw new Error('Demo visibility switch must be read-only');
    }
    const count = await switches.count();
    await page.getByRole('button', { name: 'Close theatre administration', exact: true }).click();
    return { disabledSwitches: count };
  });
  await check('Real browser geolocation API with emulated coordinates', async () => {
    await page.context().grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:3000' });
    await page.context().setGeolocation({ latitude: 17.4401, longitude: 78.3489 });
    await page.getByRole('button', { name: 'Use current location', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('select[aria-label="Select City or Locality in Hyderabad"]')?.value === 'Gachibowli Financial District');
    return { locality: await page.getByLabel('Select City or Locality in Hyderabad').inputValue(), hardware: 'emulated, not physical GPS' };
  });
  await check('Stays search, guests, filters, map and details', async () => {
    await open('🏨 Stay');
    const region = page.getByRole('region', { name: /Find (a space that feels like yours|your next stay)/ });
    await region.waitFor();
    await region.getByLabel('Search stays by city, area, or property').fill('Hyderabad');
    await region.getByRole('button', { name: 'Increase guests', exact: true }).click();
    await region.getByRole('button', { name: 'Filters', exact: true }).click();
    await region.getByRole('button', { name: '4+ stars', exact: true }).click();
    await region.getByRole('button', { name: 'Search', exact: true }).click();
    await region.getByRole('button', { name: 'Map', exact: true }).click();
    await region.getByRole('application', { name: 'Stays map interactive map' }).waitFor();
    await region.locator('.leaflet-interactive').last().click();
    await region.getByText('Property details', { exact: true }).waitFor();
    await region.getByRole('button', { name: 'Open gallery image 2', exact: true }).click();
    await region.getByText('Room / flat selection', { exact: true }).waitFor();
    await region.getByText('Price breakdown', { exact: true }).waitFor();
    await region.getByRole('button', { name: 'Continue to secure booking', exact: true }).click();
    await page.getByText('Select Payment Option:', { exact: false }).waitFor();
    return { handoff: 'booking form rendered; no booking/payment submitted' };
  });
  await check('Stay favorites persist after reload', async () => {
    await open('🏨 Stay');
    const region = page.getByRole('region', { name: /Find (a space that feels like yours|your next stay)/ });
    const card = region.locator('article').filter({ has: page.getByRole('button', { name: 'Save stay to favorites', exact: true }) }).first();
    const title = await card.locator('h4').innerText();
    await card.getByRole('button', { name: 'Save stay to favorites', exact: true }).click();
    await open('🏨 Stay');
    const saved = region.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await saved.getByRole('button', { name: 'Remove from favorites', exact: true }).waitFor();
    return { title, persistence: 'browser cache; Supabase account persistence not exercised' };
  });
  const responsive = [];
  for (const [width, height] of [[320, 740], [390, 844], [844, 390], [768, 1024], [1366, 900]]) {
    try {
      await page.setViewportSize({ width, height });
      await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
      await open('🎬 NEW Movies');
      await page.getByRole('heading', { name: 'Metro Dreams', exact: true }).waitFor();
      const metrics = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      responsive.push({ width, height, ...metrics, status: metrics.document <= metrics.viewport + 1 ? 'PASS' : 'FAIL' });
    } catch (error) { responsive.push({ width, height, status: 'FAIL', error: error.message.slice(0, 200) }); }
  }
  await check('Mobile screenshot', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('heading', { name: 'Now Showing', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/playwright/audit-${page.context().browser().browserType().name()}-mobile.png` });
  });
  return JSON.stringify({ browser: page.context().browser().version(), checks, responsive, pageErrors, apiFailures });
}
