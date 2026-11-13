async (page) => {
  page.setDefaultTimeout(15000);
  await page.getByRole('button', { name: /Stay$/ }).click();
  const stays = page.getByRole('region', { name: /Find (a space that feels like yours|your next stay)/ });
  await stays.waitFor();
  await stays.getByLabel('Search stays by city, area, or property').fill('Hyderabad');
  await stays.getByRole('button', { name: 'Increase guests', exact: true }).click();
  await stays.getByRole('button', { name: 'Filters', exact: true }).click();
  await stays.getByRole('button', { name: '4+ stars', exact: true }).click();
  await stays.getByRole('button', { name: 'Search', exact: true }).click();
  await stays.getByRole('button', { name: 'Map', exact: true }).click();
  await stays.getByRole('application', { name: 'Stays map interactive map' }).waitFor();
  await stays.locator('.leaflet-interactive').last().click();
  await stays.getByText('Property details', { exact: true }).waitFor();
  await stays.getByRole('button', { name: 'Open gallery image 2', exact: true }).click();
  await stays.getByText('Room / flat selection', { exact: true }).waitFor();
  await stays.getByText('Price breakdown', { exact: true }).waitFor();
  await stays.getByRole('button', { name: 'Continue to secure booking', exact: true }).click();
  await page.getByText('Select Payment Option:', { exact: false }).waitFor();
  return 'stays-search-filter-map-gallery-price-booking-pass';
}
