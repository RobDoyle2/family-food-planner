/*
 * End-to-end acceptance test for Family Food Planner.
 * Usage: start `npm run preview` (port 4173), then `node tests/e2e.cjs [baseUrl] [screenshotDir]`.
 * Requires the `playwright` package (pre-installed in many environments, or `npm i -D playwright`).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:4173/';
const SHOTS = process.argv[3] || path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`FAIL  ${name}\n      ${e.message.split('\n')[0]}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Reads every IndexedDB store straight from the browser for verification. */
async function readDb(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('family-food-planner');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const names = Array.from(db.objectStoreNames);
          const tx = db.transaction(names);
          const out = {};
          let pending = names.length;
          names.forEach((n) => {
            const r = tx.objectStore(n).getAll();
            r.onsuccess = () => {
              out[n] = r.result;
              if (--pending === 0) {
                db.close();
                resolve(out);
              }
            };
          });
        };
      }),
  );
}

async function addMember(page, { name, age, sex, allergies = [], intolerances = [], diets = [], dislike, nutrition = [] }) {
  await page.getByRole('button', { name: '+ Add member' }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Name').fill(name);
  await dlg.getByLabel('Age').fill(String(age));
  if (sex) await dlg.getByLabel('Sex (optional)').selectOption(sex);
  for (const a of allergies) await dlg.locator('fieldset', { hasText: 'Allergies' }).first().getByText(a, { exact: true }).click();
  if (intolerances.length) {
    const fs = dlg.locator('fieldset', { hasText: 'Intolerances' });
    const more = fs.getByRole('button', { name: 'Show all 14 allergens' });
    if (await more.count()) await more.click();
    for (const a of intolerances) await fs.getByText(a, { exact: true }).click();
  }
  for (const d of diets) await dlg.locator('fieldset', { hasText: 'Dietary requirements' }).getByText(d, { exact: true }).click();
  if (dislike) {
    const fs = dlg.locator('fieldset', { hasText: 'Foods disliked' });
    await fs.getByRole('searchbox').fill(dislike);
    await fs.getByRole('option').first().click();
  }
  for (const n of nutrition) await dlg.locator('fieldset', { hasText: 'Nutritional preferences' }).getByText(n, { exact: true }).click();
  await dlg.getByRole('button', { name: 'Add member' }).click();
  await dlg.waitFor({ state: 'detached' });
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(BASE);
  await page.waitForSelector('h1');

  await step('1. Create a household', async () => {
    await page.getByLabel('Household name').fill('The Murphys');
    await page.getByRole('button', { name: 'Create household' }).click();
    await page.getByRole('heading', { name: 'The Murphys' }).waitFor();
    const db = await readDb(page);
    assert(db.households.length === 1 && db.households[0].country === 'Ireland', 'household with default country Ireland saved');
  });

  await step('2–3. Add several family members with allergies, intolerances and preferences', async () => {
    await page.goto(BASE + '#/family');
    await addMember(page, { name: 'Siobhán', age: 42, sex: 'female', nutrition: ['More vegetables'] });
    await addMember(page, { name: 'Ciarán', age: 44, sex: 'male', dislike: 'mushro' });
    await addMember(page, { name: 'Aoife', age: 9, allergies: ['Milk'] });
    await addMember(page, { name: 'Seán', age: 6, allergies: ['Peanuts', 'Tree nuts'], intolerances: ['Sesame'] });
    const cards = page.locator('.member-card');
    assert((await cards.count()) === 4, 'four member cards shown');
    const db = await readDb(page);
    const aoife = db.members.find((m) => m.name === 'Aoife');
    assert(aoife.allergies.some((a) => a.id === 'milk'), 'Aoife milk allergy stored');
    const sean = db.members.find((m) => m.name === 'Seán');
    assert(sean.allergies.length === 2 && sean.intolerances[0].id === 'sesame', 'Seán allergies + intolerance stored separately');
    assert(db.members.find((m) => m.name === 'Ciarán').dislikes.includes('mushrooms'), 'dislike stored');
    // Children are never offered nutritional goals.
    await page.locator('.member-card', { hasText: 'Aoife' }).getByRole('button', { name: 'Edit' }).click();
    assert(await page.getByRole('dialog').getByText('Nutritional goals are not offered for children').isVisible(), 'child nutrition notice');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    // Edit a profile
    await page.locator('.member-card', { hasText: 'Ciarán' }).getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('dialog').getByLabel('Age').fill('45');
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
    await page.locator('.member-card', { hasText: '45 years' }).waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'desktop-family.png'), fullPage: true });
  });

  await step('4. Add custom foods (with category suggestion and duplicate warning)', async () => {
    await page.goto(BASE + '#/foods');
    await page.getByRole('button', { name: '+ Add food' }).click();
    let dlg = page.getByRole('dialog');
    await dlg.getByLabel('Food name').fill('carrot');
    assert(await dlg.getByText('already exists in the catalogue').isVisible(), 'duplicate warning for carrot');
    await dlg.getByLabel('Food name').fill('Smoked mackerel');
    assert((await dlg.getByLabel('Category').inputValue()) === 'protein', 'category suggested: protein');
    await dlg.getByText('Suggested automatically').waitFor();
    await dlg.getByLabel('Description (optional)').fill('Fillets from the fishmonger');
    await page.screenshot({ path: path.join(SHOTS, 'desktop-add-food.png') });
    await dlg.getByRole('button', { name: 'Add food' }).click();
    await dlg.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '+ Add food' }).click();
    dlg = page.getByRole('dialog');
    await dlg.getByLabel('Food name').fill('Pak choi');
    assert((await dlg.getByLabel('Category').inputValue()) === 'vegetables', 'category suggested: vegetables');
    await dlg.getByRole('button', { name: 'Add food' }).click();
    await dlg.waitFor({ state: 'detached' });
    const db = await readDb(page);
    const custom = db.foods.filter((f) => f.custom);
    assert(custom.length === 2, 'two custom foods persisted');
    assert(custom.every((f) => f.allergenInfo === 'unknown' && f.allergens.length === 0), 'custom foods have unknown allergen info, nothing invented');
  });

  await step('5. Search for custom foods by partial name', async () => {
    await page.getByLabel('Search foods').fill('mack');
    await page.locator('.food-card', { hasText: 'Smoked mackerel' }).waitFor();
    assert((await page.locator('.food-card').count()) === 1, 'one result for "mack"');
    await page.getByLabel('Search foods').fill('pak');
    await page.locator('.food-card', { hasText: 'Pak choi' }).waitFor();
    await page.getByLabel('Search foods').fill('');
  });

  await step('6. Change food categories (incl. a user-created category)', async () => {
    await page.getByLabel('Search foods').fill('Pak choi');
    await page.locator('.food-card', { hasText: 'Pak choi' }).getByRole('button', { name: 'Edit' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Category').selectOption('__new');
    await dlg.getByLabel('New category name').fill('Asian greens');
    await dlg.getByRole('button', { name: 'Save food' }).click();
    await dlg.waitFor({ state: 'detached' });
    await page.getByLabel('Search foods').fill('');
    await page.getByRole('button', { name: /Asian greens/ }).click();
    await page.locator('.food-card', { hasText: 'Pak choi' }).waitFor();
    assert((await page.locator('.food-card').count()) === 1, 'Pak choi in new category');
    // Change the category back to a built-in one.
    await page.locator('.food-card', { hasText: 'Pak choi' }).getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('dialog').getByLabel('Category').selectOption('vegetables');
    await page.getByRole('dialog').getByRole('button', { name: 'Save food' }).click();
    await page.getByRole('button', { name: /Vegetables/ }).click();
    await page.locator('.food-card', { hasText: 'Pak choi' }).waitFor();
    await page.getByRole('button', { name: 'All', exact: true }).click();
  });

  await step('7. Like, exclude and rank food preferences (drag and drop + buttons)', async () => {
    for (const [q, label] of [['Chicken breast', 'Like: Chicken breast'], ['Salmon', 'Like: Salmon fillets'], ['Beef mince', 'Like: Beef mince'], ['Potatoes', 'Like: Potatoes'], ['Duck breast', 'Exclude: Duck breast'], ['Aubergines', 'Dislike: Aubergines']]) {
      await page.getByLabel('Search foods').fill(q);
      await page.getByRole('button', { name: label, exact: true }).click();
    }
    await page.getByLabel('Search foods').fill('');
    await page.getByRole('tab', { name: /Rank favourites/ }).click();
    const names = async () => page.locator('.rank-name').allInnerTexts();
    let order = await names();
    assert(order.join() === 'Chicken breast,Salmon fillets,Beef mince,Potatoes', 'initial order = order liked: ' + order);
    // Drag Salmon above Chicken with the mouse.
    const handle = page.getByRole('button', { name: 'Drag to reorder Salmon fillets' });
    const target = page.getByRole('button', { name: 'Drag to reorder Chicken breast' });
    const hb = await handle.boundingBox();
    const tb = await target.boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2, hb.y - 10, { steps: 5 });
    await page.mouse.move(tb.x + tb.width / 2, tb.y + 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    order = await names();
    assert(order[0] === 'Salmon fillets', 'drag moved Salmon to top: ' + order);
    await page.getByRole('button', { name: 'Move Potatoes up' }).click();
    order = await names();
    assert(order.join() === 'Salmon fillets,Chicken breast,Potatoes,Beef mince', 'move-up button works: ' + order);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-ranking.png'), fullPage: true });
    const db = await readDb(page);
    assert(db.preferences[0].ranking[0] === 'salmon' && db.preferences[0].status['duck-breast'] === 'exclude', 'ranking + exclusion persisted');
    // Choosing not to rank
    await page.getByText('Use ranking').click();
    await page.getByText('Ranking is off').waitFor();
    await page.getByText('Use ranking').click();
  });

  let planDb;
  await step('8–9. Generate a seven-day plan with two alternatives per day', async () => {
    await page.goto(BASE + '#/planner');
    assert((await page.getByRole('spinbutton', { name: 'Number of days' }).inputValue()) === '7', 'default 7 days');
    await page.getByRole('button', { name: 'Generate 7-day plan' }).click();
    await page.locator('.day-card').first().waitFor();
    assert((await page.locator('.day-card').count()) === 7, '7 day cards');
    for (let i = 0; i < 7; i++) {
      const n = await page.locator('.day-card').nth(i).locator('.option-card:not(.option-empty)').count();
      assert(n === 2, `day ${i + 1} has 2 options (got ${n})`);
    }
    planDb = await readDb(page);
    const p = planDb.mealPlans[0];
    const recipes = new Map(planDb.recipes.map((r) => [r.id, r]));
    p.days.forEach((d, i) => {
      const [a, b] = d.options.map((id) => recipes.get(id));
      assert(a.id !== b.id && a.proteinGroup !== b.proteinGroup, `day ${i + 1} alternatives differ in protein`);
      if (i > 0) assert(recipes.get(p.days[i - 1].options[0]).proteinGroup !== a.proteinGroup, `day ${i + 1} protein differs from previous day`);
    });
    await page.screenshot({ path: path.join(SHOTS, 'desktop-planner.png'), fullPage: false });
  });

  await step('10. Select, replace, swap and skip recipes', async () => {
    const day1 = page.locator('.day-card').nth(0);
    const before = await day1.locator('.option-card h4').nth(1).innerText();
    await day1.getByRole('button', { name: /^Replace .* with another suggestion/ }).nth(1).click();
    await page.waitForTimeout(150);
    const after = await day1.locator('.option-card h4').nth(1).innerText();
    assert(before !== after, `replace changed option 2 (${before} → ${after})`);
    for (let i = 0; i < 7; i++) await page.locator('.day-card').nth(i).getByRole('button', { name: 'Choose this' }).first().click();
    assert((await page.getByText('7 of 7').count()) > 0, 'all 7 chosen');
    // Swap day 1 and day 2
    const d1 = await page.locator('.day-card').nth(0).locator('.option-card.chosen h4').innerText();
    const d2 = await page.locator('.day-card').nth(1).locator('.option-card.chosen h4').innerText();
    await page.locator('.day-card').nth(0).getByText('⋯ More').click();
    await page.locator('.day-card').nth(0).getByLabel('Swap meals with another day').selectOption({ index: 1 });
    await page.waitForTimeout(150);
    assert((await page.locator('.day-card').nth(0).locator('.option-card.chosen h4').innerText()) === d2, 'swap moved day 2 meal to day 1');
    assert((await page.locator('.day-card').nth(1).locator('.option-card.chosen h4').innerText()) === d1, 'swap moved day 1 meal to day 2');
    // Leave day 7 unplanned, then plan it again.
    await page.locator('.day-card').nth(6).getByRole('button', { name: '⊘ Leave unplanned' }).click();
    await page.locator('.day-card').nth(6).getByText('No dinner planned').waitFor();
    await page.locator('.day-card').nth(6).getByRole('button', { name: '＋ Plan this day' }).click();
    await page.locator('.day-card').nth(6).getByRole('button', { name: 'Choose this' }).first().click();
  });

  await step('11. Change portion sizes (planner + recipe scaling)', async () => {
    const day1 = page.locator('.day-card').nth(0);
    const portions = day1.getByRole('spinbutton', { name: /^Portions on/ });
    assert((await portions.inputValue()) === '4', 'default portions = 4 people');
    await day1.getByRole('button', { name: /^Increase Portions/ }).click();
    await day1.getByRole('button', { name: /^Increase Portions/ }).click();
    assert((await portions.inputValue()) === '6', 'portions now 6');
    // A guest also adds a portion automatically on another day.
    const day3 = page.locator('.day-card').nth(2);
    await day3.getByRole('button', { name: /^Increase Guests/ }).click();
    assert((await day3.getByRole('spinbutton', { name: /^Portions on/ }).inputValue()) === '5', 'guest adds a portion');
    // Recipe page scaling
    await page.goto(BASE + '#/recipes/spaghetti-bolognese');
    await page.getByRole('heading', { name: 'Spaghetti Bolognese' }).waitFor();
    await page.getByRole('spinbutton', { name: 'Portions' }).fill('6');
    const mince = await page.locator('.ing-list li', { hasText: 'Beef mince' }).innerText();
    assert(mince.includes('750 g'), 'mince scaled 500 g → 750 g for 6: ' + mince);
    const onion = await page.locator('.ing-list li', { hasText: 'Onions' }).innerText();
    assert(onion.includes('1½'), 'onion scaled to 1½: ' + onion);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-recipe.png'), fullPage: true });
    await page.getByRole('button', { name: 'Reset' }).click();
    assert((await page.getByRole('spinbutton', { name: 'Portions' }).inputValue()) === '4', 'original recipe kept');
  });

  await step('12–13. Generate a combined shopping list without duplicates', async () => {
    await page.goto(BASE + '#/planner');
    await page.getByRole('button', { name: '🛒 Build shopping list' }).click();
    await page.getByRole('heading', { name: 'Shopping List' }).waitFor();
    const db = await readDb(page);
    const items = db.shoppingLists[0].items;
    assert(items.length > 15, 'list has items: ' + items.length);
    const keys = items.map((i) => i.key);
    assert(new Set(keys).size === keys.length, 'no duplicate entries');
    const multi = items.filter((i) => i.recipes.length > 1);
    assert(multi.length > 3, 'ingredients combined across recipes: ' + multi.map((i) => i.name).join(', '));
    const sections = await page.locator('.aisle-title').allInnerTexts();
    assert(sections.some((s) => s.includes('Meat and fish')) && sections.some((s) => s.includes('Fruit and vegetables')), 'grouped by section');
    await page.screenshot({ path: path.join(SHOTS, 'desktop-shopping.png'), fullPage: true });
  });

  await step('14. Tick items as already available', async () => {
    const stat = async (label) => Number(await page.locator('.stat', { hasText: label }).locator('.stat-num').innerText());
    const total = await stat('Total ingredients');
    const toBuy = await stat('Still to buy');
    const first = page.locator('.item').first();
    const name = await first.locator('.item-name').innerText();
    await first.getByRole('checkbox').click();
    await page.waitForTimeout(150);
    assert((await stat('Still to buy')) === toBuy - 1, 'to-buy decreased');
    assert((await stat('Already have')) === 1, 'have = 1');
    assert((await stat('Total ingredients')) === total, 'total unchanged');
    assert((await page.locator('.item-name', { hasText: name }).count()) === 0 || !(await page.locator('.item', { hasText: name }).first().isVisible()), 'hidden from outstanding list');
    await page.getByRole('tab', { name: /Full list/ }).click();
    assert(await page.locator('.item.have', { hasText: name }).first().isVisible(), 'still in full list, marked have');
  });

  await step('15. Add, edit and remove manual shopping items', async () => {
    await page.locator('.add-item').getByLabel('Item', { exact: true }).fill('Kitchen roll');
    await page.locator('.add-item').getByLabel('Amount', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.locator('.item', { hasText: 'Kitchen roll' }).waitFor();
    await page.getByRole('button', { name: 'Edit Kitchen roll' }).click();
    await page.getByRole('dialog').getByLabel('Amount').fill('4');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    assert((await page.locator('.item', { hasText: 'Kitchen roll' }).innerText()).includes('4'), 'quantity edited');
    await page.locator('.add-item').getByLabel('Item', { exact: true }).fill('Matches');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Remove Matches' }).click();
    await page.waitForTimeout(100);
    assert((await page.locator('.item', { hasText: 'Matches' }).count()) === 0, 'removed');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '⬇ Export text' }).click();
    const d = await download;
    const txt = fs.readFileSync(await d.path(), 'utf8');
    assert(txt.includes('Kitchen roll') && txt.includes('MEAT AND FISH'), 'text export contains list');
  });

  await step('16. Save favourites', async () => {
    await page.goto(BASE + '#/recipes');
    await page.getByRole('button', { name: 'Save Beef Stir-fry as a favourite' }).click();
    await page.goto(BASE + '#/home');
    await page.locator('.fav-card', { hasText: 'Beef Stir-fry' }).waitFor();
  });

  let before;
  await step('17. Refresh the application — data persists', async () => {
    before = await readDb(page);
    await page.reload();
    await page.getByRole('heading', { name: 'The Murphys' }).waitFor();
    const after = await readDb(page);
    for (const s of ['households', 'members', 'foods', 'preferences', 'mealPlans', 'shoppingLists', 'favourites']) {
      assert(JSON.stringify(after[s]) === JSON.stringify(before[s]), `${s} unchanged after reload`);
    }
    await page.locator('.fav-card', { hasText: 'Beef Stir-fry' }).waitFor();
    // A brand-new browser tab (same profile) sees the same data, as after closing and reopening.
    const p2 = await context.newPage();
    await p2.goto(BASE + '#/family');
    await p2.locator('.member-card').nth(3).waitFor();
    await p2.close();
    await page.screenshot({ path: path.join(SHOTS, 'desktop-home.png'), fullPage: true });
  });

  await step('18. Export and import JSON (with validation)', async () => {
    await page.goto(BASE + '#/settings');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '⬇ Export backup (JSON)' }).click();
    const file = await (await download).path();
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert(json.app === 'family-food-planner' && json.data.members.length === 4, 'valid JSON export');
    // Invalid file is rejected with errors and nothing changes.
    const badPath = path.join(SHOTS, 'bad-backup.json');
    fs.writeFileSync(badPath, JSON.stringify({ app: 'family-food-planner', version: 1, data: { members: [{ name: 1 }] } }));
    await page.locator('input[type=file]').setInputFiles(badPath);
    await page.getByText('this file cannot be imported').waitFor();
    assert((await page.locator('.error-list li').count()) > 3, 'errors listed');
    // Reset, then import the good file.
    await page.getByRole('button', { name: 'Reset all data' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click();
    await page.waitForTimeout(300);
    let db = await readDb(page);
    assert(db.households.length === 0 && db.members.length === 0, 'reset cleared data');
    await page.locator('input[type=file]').setInputFiles(file);
    await page.getByText('this backup is valid').waitFor();
    await page.getByRole('button', { name: 'Replace my data with this backup' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Replace my data' }).click();
    await page.waitForTimeout(300);
    db = await readDb(page);
    assert(db.members.length === 4 && db.mealPlans.length === 1 && db.foods.filter((f) => f.custom).length === 2, 'import restored data');
    assert(JSON.stringify(db.shoppingLists) === JSON.stringify(before.shoppingLists), 'shopping list restored exactly');
  });

  await step('20. Allergy exclusions are enforced (and explained)', async () => {
    const db = await readDb(page);
    const recipes = new Map(db.recipes.map((r) => [r.id, r]));
    const p = db.mealPlans[0];
    const shown = p.days.flatMap((d) => d.options).filter(Boolean);
    for (const id of shown) {
      const r = recipes.get(id);
      for (const a of ['milk', 'peanuts', 'nuts', 'sesame']) assert(!r.allergens.includes(a), `${r.name} contains ${a}`);
      assert(!r.components.includes('duck-breast'), `${r.name} contains excluded duck`);
    }
    // Recipe page explains why a dish isn't suitable.
    await page.goto(BASE + '#/recipes/chicken-satay');
    await page.locator('.suit-list li.no', { hasText: 'Seán' }).waitFor();
    assert((await page.locator('.suit-list li.no', { hasText: 'Seán' }).innerText()).toLowerCase().includes('peanuts'), 'peanut reason shown');
    // Library "suitable for my whole family" hides fish pie (milk) for this household.
    await page.goto(BASE + '#/recipes');
    assert((await page.locator('.recipe-card', { hasText: 'Fish Pie' }).count()) === 0, 'fish pie hidden');
    // Custom unchecked ingredient mapped into a recipe → flagged for review, not allergen-safe.
    await page.goto(BASE + '#/recipes/red-lentil-dhal');
    await page.getByRole('button', { name: '✎ Customise ingredients' }).click();
    await page.getByRole('searchbox').last().fill('mackerel');
    await page.getByRole('option', { name: /Smoked mackerel/ }).click();
    await page.getByText('Allergen review needed').waitFor();
    await page.getByRole('button', { name: 'Save ingredients' }).click();
    await page.locator('.safety-card .issue').waitFor();
    await page.locator('.suit-list li.no', { hasText: 'Aoife' }).waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'desktop-review-flag.png'), fullPage: true });
    await page.getByRole('button', { name: 'Restore original' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
    await page.waitForTimeout(200);
    assert((await page.locator('.safety-card .issue').count()) === 0, 'restored original recipe');
    // Insufficient recipes are explained, never relaxed: vegan + gluten-free + bean intolerance.
    await page.goto(BASE + '#/family');
    await addMember(page, { name: 'Guest Gran', age: 70, diets: ['Vegan', 'Gluten-free'], intolerances: ['Celery'] });
    await page.goto(BASE + '#/planner');
    await page.getByRole('button', { name: 'New plan' }).click();
    const sum = await page.locator('.suitability').innerText();
    assert(/\d+ of \d+/.test(sum), 'suitability summary shown: ' + sum.slice(0, 80));
    await page.locator('.suitability summary').click();
    await page.screenshot({ path: path.join(SHOTS, 'desktop-suitability.png') });
    await page.getByRole('button', { name: 'Back to current plan' }).click();
    // Remove the extra member again
    await page.goto(BASE + '#/family');
    await page.locator('.member-card', { hasText: 'Guest Gran' }).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  });

  await step('19. Mobile and desktop layouts (no horizontal scrolling)', async () => {
    const pages = ['home', 'family', 'foods', 'planner', 'recipes', 'recipes/fish-pie', 'shopping', 'settings'];
    for (const [label, vp] of [['mobile', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1180 }], ['desktop', { width: 1280, height: 900 }]]) {
      await page.setViewportSize(vp);
      for (const pg of pages) {
        await page.goto(BASE + '#/' + pg);
        await page.waitForTimeout(150);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(overflow <= 1, `${label} ${pg} overflows by ${overflow}px`);
        if (label !== 'desktop') await page.screenshot({ path: path.join(SHOTS, `${label}-${pg.replace('/', '-')}.png`), fullPage: label === 'mobile' && ['planner', 'shopping', 'home'].includes(pg) ? false : false });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + '#/planner');
    assert(await page.locator('.bottomnav').isVisible(), 'bottom navigation on mobile');
    await page.setViewportSize({ width: 1280, height: 900 });
    assert(await page.locator('.topnav').isVisible(), 'top navigation on desktop');
  });

  await step('No console or runtime errors', async () => {
    assert(errors.length === 0, errors.join('\n'));
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
