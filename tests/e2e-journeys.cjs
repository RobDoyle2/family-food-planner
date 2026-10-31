/*
 * v1.2 user journeys: flexible planning, saved meals, sharing, takeaway nights,
 * shop mode, persistence, layouts, and upgrading data from the previous version.
 * Usage: npm run preview, then `node tests/e2e-journeys.cjs [baseUrl] [workDir]`.
 */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:4173/';
const WORK = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'ffp-journeys-'));
const PROFILE = path.join(WORK, 'profile');
const SHOTS = path.join(WORK, 'screens');
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let page;
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    if (page) await page.screenshot({ path: path.join(WORK, `fail-${results.length}.png`) }).catch(() => {});
    console.log(`FAIL  ${name}\n      ${String(e.message).split('\n').slice(0, process.env.VERBOSE ? 14 : 1).join('\n      ')}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
const readDb = (p) =>
  p.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const o = indexedDB.open('family-food-planner');
        o.onerror = () => reject(o.error);
        o.onsuccess = () => {
          const db = o.result;
          const names = Array.from(db.objectStoreNames);
          const tx = db.transaction(names);
          const out = {};
          let n = names.length;
          names.forEach((s) => {
            const r = tx.objectStore(s).getAll();
            r.onsuccess = () => {
              out[s] = r.result;
              if (--n === 0) {
                db.close();
                resolve(out);
              }
            };
          });
        };
      }),
  );
const savedCard = (p, name) => p.locator('.saved-card').filter({ has: p.getByRole('heading', { name, exact: true }) });
const planOf = async (p) => (await readDb(p)).mealPlans[0];
const dismissToasts = async (p) => {
  for (const b of await p.locator('.toast .icon-btn').all()) await b.click().catch(() => {});
};

async function open(device = devices['iPhone 13']) {
  const ctx = await chromium.launchPersistentContext(PROFILE, { ...device, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = ctx.pages()[0] || (await ctx.newPage());
  p.setDefaultTimeout(8000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return { ctx, p, errors };
}

(async () => {
  let { ctx, p, errors } = await open();
  page = p;

  // ---------- Set up a household with allergies ----------
  await p.goto(BASE);
  await p.getByLabel('Household name').fill('The Doyles');
  await p.getByRole('button', { name: 'Create household' }).tap();
  for (const [name, age, allergies] of [['Rob', 44, []], ['Siobhán', 42, []], ['Aoife', 9, ['Milk']], ['Seán', 6, ['Peanuts', 'Tree nuts']]]) {
    await p.goto(BASE + '#family');
    await p.getByRole('button', { name: '+ Add member' }).first().tap();
    const d = p.getByRole('dialog');
    await d.getByLabel('Name').fill(name);
    await d.getByLabel('Age').fill(String(age));
    for (const a of allergies) await d.locator('fieldset', { hasText: 'Allergies' }).first().getByText(a, { exact: true }).tap();
    await d.getByRole('button', { name: 'Add member' }).tap();
    await d.waitFor({ state: 'detached' });
  }
  await p.goto(BASE + '#planner');
  await p.getByRole('button', { name: '7 days' }).tap();
  await p.getByRole('button', { name: 'Plan 7 dinners' }).tap();
  await p.locator('.day-card').first().waitFor();
  // Choose the first idea every day.
  while (await p.locator('.day-card.open').count()) {
    await p.locator('.day-card.open').first().getByRole('button', { name: /^Choose / }).first().tap();
  }
  await dismissToasts(p);
  const week = await planOf(p);

  await step('2. Extend a plan from 7 to 10 days without losing existing meals', async () => {
    await p.getByRole('button', { name: /Dates & length/ }).tap();
    await p.getByRole('button', { name: '10 days' }).tap();
    await p.locator('.day-card').nth(9).waitFor();
    const plan = await planOf(p);
    assert(plan.days.length === 10, '10 days');
    assert(JSON.stringify(plan.days.slice(0, 7)) === JSON.stringify(week.days), 'first 7 days unchanged');
    assert(plan.days.slice(7).every((d) => d.options[0] && d.options[1] && d.selected === null), 'new days have two ideas each');
    assert((await p.locator('.day-card.open').count()) === 3, '3 days need attention');
    assert((await p.getByText('3 still to choose').count()) === 1, 'summary shows 3 still to choose');
  });

  await step('1. Change a seven-day plan to five days (explained, confirmed, undoable)', async () => {
    await p.getByRole('button', { name: '7 days' }).tap();
    let plan = await planOf(p);
    assert(plan.days.length === 7 && JSON.stringify(plan.days) === JSON.stringify(week.days), 'back to the original 7 (undecided new days removed without fuss)');
    await p.getByRole('button', { name: '5 days' }).tap();
    const dlg = p.getByRole('dialog');
    await dlg.getByText('These days at the end will be removed').waitFor();
    const listed = await dlg.locator('.removed-list li').allInnerTexts();
    assert(listed.length === 2, 'two days listed: ' + listed);
    await dlg.getByRole('button', { name: 'Remove days' }).tap();
    await p.locator('.toast', { hasText: 'shortened' }).getByRole('button', { name: 'Undo' }).waitFor();
    plan = await planOf(p);
    assert(plan.days.length === 5 && JSON.stringify(plan.days) === JSON.stringify(week.days.slice(0, 5)), 'first five kept exactly');
    await p.locator('.toast').getByRole('button', { name: 'Undo' }).tap();
    await p.waitForTimeout(200);
    plan = await planOf(p);
    assert(plan.days.length === 7 && JSON.stringify(plan.days) === JSON.stringify(week.days), 'Undo restores the week');
    // Start date moves without changing meals.
    await p.getByLabel('Plan start date').fill('2026-11-09');
    await p.waitForTimeout(200);
    plan = await planOf(p);
    assert(plan.days[0].date === '2026-11-09' && JSON.stringify(plan.days.map((d) => d.options)) === JSON.stringify(week.days.map((d) => d.options)), 'start date moved, meals kept');
    await p.locator('.toast').getByRole('button', { name: 'Undo' }).tap();
    await p.waitForTimeout(300);
    assert((await planOf(p)).days[0].date === week.days[0].date, 'start date restored by Undo');
  });

  await step('3. Change one dinner without regenerating the plan', async () => {
    await p.waitForTimeout(300);
    assert((await p.getByRole('dialog').count()) === 0, 'no panel left open');
    const before = await planOf(p);
    const card = p.locator('.day-card').nth(2);
    await card.getByRole('button', { name: 'Change', exact: true }).tap();
    const sheet = p.getByRole('dialog');
    await sheet.getByRole('tab', { name: 'Search' }).tap();
    await sheet.getByLabel('Search recipes').fill('dhal');
    await sheet.getByRole('button', { name: 'Choose Red Lentil Dhal' }).tap();
    await sheet.waitFor({ state: 'detached' });
    const after = await planOf(p);
    const d = after.days[2];
    assert(d.options[d.selected] === 'red-lentil-dhal', 'dhal chosen');
    after.days.forEach((x, i) => i !== 2 && assert(JSON.stringify(x) === JSON.stringify(before.days[i]), `day ${i + 1} untouched`));
    assert(await card.getByRole('heading', { name: 'Red Lentil Dhal' }).isVisible(), 'card shows the new dinner');
    // Unsafe searched recipes are not offered.
    await card.getByRole('button', { name: 'Change', exact: true }).tap();
    await p.getByRole('dialog').getByRole('tab', { name: 'Search' }).tap();
    await p.getByRole('dialog').getByLabel('Search recipes').fill('fish pie');
    assert((await p.getByRole('dialog').getByRole('button', { name: 'Choose Fish Pie' }).count()) === 0, 'fish pie (milk) not offered');
    await p.keyboard.press('Escape');
    // Alternatives: "Show two more ideas" then choose one.
    await card.getByRole('button', { name: 'Change', exact: true }).tap();
    await p.getByRole('dialog').getByRole('button', { name: /Show two more ideas/ }).tap();
    const names = await p.getByRole('dialog').locator('.recipe-row strong').allInnerTexts();
    assert(names.length === 2 && !names.includes('Red Lentil Dhal'), 'two new ideas: ' + names);
    await p.keyboard.press('Escape');
    assert((await planOf(p)).days[2].options.includes('red-lentil-dhal'), 'closing without choosing changes nothing');
  });

  await step('4. Save a suggested meal and find it again', async () => {
    await dismissToasts(p);
    const card = p.locator('.day-card').nth(4);
    const name = await card.locator('.meal-body h4').innerText();
    await card.getByRole('button', { name: `Save ${name}` }).tap();
    await p.locator('.toast', { hasText: 'Saved to My Saved Meals' }).waitFor();
    // Also save an idea that is not in the plan, from the Change sheet.
    await p.locator('.day-card').nth(0).getByRole('button', { name: 'Change', exact: true }).tap();
    await p.getByRole('dialog').getByRole('button', { name: /Show two more ideas/ }).tap();
    const idea = (await p.getByRole('dialog').locator('.recipe-row strong').allInnerTexts()).find((x) => x !== name);
    await p.keyboard.press('Escape');
    await p.goto(BASE + `#recipe-${(await readDb(p)).recipes.find((r) => r.name === idea).id}`);
    await p.getByRole('button', { name: `Save ${idea}` }).tap();
    await p.goto(BASE + '#saved');
    await savedCard(p, name).waitFor();
    await p.getByLabel('Search saved meals').fill(idea.split(' ')[0]);
    await savedCard(p, idea).waitFor();
    await p.getByLabel('Search saved meals').fill('');
    await p.getByRole('button', { name: 'Not in this plan' }).tap();
    assert((await savedCard(p, idea).count()) === 1 && (await savedCard(p, name).count()) === 0, 'filter: not in this plan');
    await p.getByRole('button', { name: /^All/ }).tap();
    await savedCard(p, idea).getByRole('button', { name: 'We loved it' }).tap();
    await p.getByRole('button', { name: /Loved \(1\)/ }).waitFor();
    // Add the saved idea to a day in the plan.
    await savedCard(p, idea).getByLabel(`Add ${idea} to a day`).selectOption({ index: 6 });
    await p.locator('.toast', { hasText: 'planned for' }).waitFor();
    const plan = await planOf(p);
    const d6 = plan.days[5];
    assert(plan.days[5] && (await readDb(p)).recipes.find((r) => r.id === d6.options[d6.selected]).name === idea, 'saved idea added to day 6');
    // Remove with undo.
    await savedCard(p, name).getByRole('button', { name: `Remove ${name} from saved meals` }).tap();
    assert((await savedCard(p, name).count()) === 0, 'removed');
    await p.locator('.toast').getByRole('button', { name: 'Undo' }).tap();
    await savedCard(p, name).waitFor();
  });

  await step('5. Share a recipe (native share sheet, then clipboard fallback) without household details', async () => {
    await p.goto(BASE + '#planner');
    const card = p.locator('.day-card').nth(1);
    const name = await card.locator('.meal-body h4').innerText();
    // Native share sheet.
    await p.evaluate(() => {
      window.__shared = null;
      navigator.share = async (d) => {
        window.__shared = d;
      };
    });
    await card.getByRole('button', { name: `Share ${name}` }).tap();
    await p.locator('.toast', { hasText: 'Shared' }).waitFor();
    const shared = await p.evaluate(() => window.__shared);
    assert(shared.title === name && shared.text.includes('INGREDIENTS') && shared.text.includes('METHOD'), 'share sheet got the recipe');
    // Clipboard fallback when sharing isn't available.
    await p.evaluate(() => {
      delete navigator.share;
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    });
    await card.getByRole('button', { name: `Share ${name}` }).tap();
    await p.locator('.toast', { hasText: 'Recipe copied' }).waitFor();
    const text = await p.evaluate(() => navigator.clipboard.readText());
    for (const must of [name, 'Prep', 'Serves 4', 'INGREDIENTS', 'METHOD', '⚠', '•']) assert(text.includes(must), `shared text has ${must}`);
    for (const never of ['Doyle', 'Rob', 'Siobhán', 'Aoife', 'Seán']) assert(!text.includes(never), `no household detail: ${never}`);
  });

  await step('6. Add a takeaway night (with allergy caution)', async () => {
    await p.goto(BASE + '#planner');
    await dismissToasts(p);
    const card = p.locator('.day-card').nth(3);
    await card.locator('.day-more > summary').tap();
    await card.getByRole('button', { name: /Make it a takeaway night/ }).tap();
    const sheet = p.getByRole('dialog');
    await sheet.getByRole('radio', { name: /Indian/ }).tap();
    await sheet.getByLabel('Restaurant or takeaway (optional)').fill('Taj Mahal');
    await sheet.getByLabel('Usual order or note (optional)').fill('2 kormas, pilau rice, naan');
    await sheet.getByText('Save “Taj Mahal” to My Favourite Takeaways').tap();
    await sheet.getByRole('button', { name: 'Make it a takeaway night' }).tap();
    await sheet.waitFor({ state: 'detached' });
    await card.getByRole('heading', { name: 'Taj Mahal' }).waitFor();
    assert(await card.getByText('Takeaway night · Indian · not on the shopping list').isVisible(), 'takeaway styling + label');
    const caution = await card.locator('.ta-caution').innerText();
    assert(/Aoife \(milk\)/.test(caution) && /Seán \(peanuts, tree nuts\)/.test(caution), 'allergy caution: ' + caution);
    const plan = await planOf(p);
    assert(plan.days[3].mode === 'takeaway' && plan.days[3].takeaway.name === 'Taj Mahal', 'saved as takeaway');
    assert(plan.days[3].options[0], 'recipe ideas kept underneath');
    assert(await p.locator('.week-chip.takeaway').first().isVisible(), 'week strip shows takeaway');
  });

  await step('7. Choose a takeaway category and a saved favourite takeaway; back to cooking', async () => {
    // Add a favourite from the Saved section.
    await p.goto(BASE + '#takeaways');
    await p.getByRole('button', { name: '+ Add a takeaway' }).tap();
    const f = p.getByRole('dialog');
    await f.getByLabel('Name').fill('Luigi’s');
    await f.getByRole('radio', { name: /Pizza/ }).tap();
    await f.getByLabel('Phone (optional)').fill('01 234 5678');
    await f.getByLabel('Website (optional)').fill('luigis.ie');
    await f.getByLabel('Favourite dishes or usual order (optional)').fill('Large margherita, garlic bread');
    await f.getByRole('button', { name: 'Add takeaway' }).tap();
    await f.waitFor({ state: 'detached' });
    await p.locator('.takeaway-card', { hasText: 'Taj Mahal' }).waitFor();
    const luigi = p.locator('.takeaway-card', { hasText: 'Luigi’s' });
    assert((await luigi.getByRole('link', { name: /luigis\.ie/ }).getAttribute('href')) === 'https://luigis.ie/', 'website link');
    // Pick the saved favourite in the planner.
    await p.goto(BASE + '#planner');
    const card = p.locator('.day-card').nth(5);
    await card.locator('.day-more > summary').tap();
    await card.getByRole('button', { name: /Make it a takeaway night/ }).tap();
    const sheet = p.getByRole('dialog');
    await sheet.getByRole('button', { name: /Luigi’s/ }).tap();
    assert((await sheet.getByLabel('Usual order or note (optional)').inputValue()) === 'Large margherita, garlic bread', 'usual order filled in');
    await sheet.getByRole('button', { name: 'Make it a takeaway night' }).tap();
    await card.getByRole('heading', { name: 'Luigi’s' }).waitFor();
    // Custom category.
    await p.locator('.day-card').nth(6).locator('.day-more > summary').tap();
    await p.locator('.day-card').nth(6).getByRole('button', { name: /Make it a takeaway night/ }).tap();
    await p.getByRole('dialog').getByRole('button', { name: /Add your own/ }).tap();
    await p.getByRole('dialog').getByLabel('New takeaway type').fill('Vietnamese');
    await p.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).tap();
    await p.getByRole('dialog').getByRole('radio', { name: /Vietnamese/, checked: true }).waitFor();
    await p.getByRole('dialog').getByRole('button', { name: 'Make it a takeaway night' }).tap();
    await p.locator('.day-card').nth(6).getByRole('heading', { name: 'Vietnamese takeaway' }).waitFor();
    // And back to cooking: the same recipe ideas return.
    const before = (await planOf(p)).days[6];
    await p.locator('.day-card').nth(6).locator('.day-more > summary').tap();
    await p.locator('.day-card').nth(6).getByRole('button', { name: /Cook a dinner instead/ }).tap();
    const after = (await planOf(p)).days[6];
    assert(after.mode === 'cook' && JSON.stringify(after.options) === JSON.stringify(before.options), 'back to cooking with the same dinner');
  });

  let list;
  await step('8–10. Shopping list from several recipes: takeaways excluded, duplicates combined', async () => {
    await p.goto(BASE + '#planner');
    await p.getByRole('button', { name: '🛒 Shopping list' }).tap();
    await p.getByRole('heading', { name: 'Shopping list' }).waitFor();
    const db = await readDb(p);
    const plan = db.mealPlans[0];
    const recipes = new Map(db.recipes.map((r) => [r.id, r]));
    list = db.shoppingLists[0];
    const usedIn = new Set(list.items.flatMap((i) => i.recipes));
    const cooked = plan.days.filter((d) => d.mode === 'cook' && d.selected !== null).map((d) => recipes.get(d.options[d.selected]).name);
    const takeawayRecipes = plan.days.filter((d) => d.mode === 'takeaway').map((d) => recipes.get(d.options[d.selected ?? 0])?.name);
    assert(cooked.length === 5 && plan.days.filter((d) => d.mode === 'takeaway').length === 2, '5 cooked dinners + 2 takeaways: ' + cooked.length);
    for (const r of cooked) assert(usedIn.has(r), `${r} on the list`);
    for (const r of takeawayRecipes) if (!cooked.includes(r)) assert(!usedIn.has(r), `takeaway day's recipe ${r} not on the list`);
    assert(await p.getByText(/2 takeaway nights need nothing from the shop/).isVisible(), 'takeaway note shown');
    const keys = list.items.map((i) => i.key);
    assert(new Set(keys).size === keys.length, 'one line per ingredient');
    assert(list.items.filter((i) => i.recipes.length > 1).length >= 3, 'ingredients combined across recipes');
    // Compatible units summed: check one combined item against the recipes.
    const toBase = { g: 1, kg: 1000, ml: 1, l: 1000, tsp: 5, tbsp: 15 };
    const multi = list.items.find((i) => i.recipes.length > 1 && i.quantities.length === 1 && toBase[i.quantities[0].unit]);
    let need = 0;
    for (const d of plan.days.filter((x) => x.mode === 'cook' && x.selected !== null)) {
      const r = recipes.get(d.options[d.selected]);
      const portions = d.portions ?? d.eaters.length + d.guests;
      for (const ing of r.ingredients) if (ing.foodId === multi.foodId) need += (ing.amount * (toBase[ing.unit] ?? 1) * portions) / r.servings;
    }
    const got = multi.quantities[0].amount * toBase[multi.quantities[0].unit];
    assert(got >= need - 0.01 && got <= need * 1.15 + 15, `${multi.name}: ${got} vs needed ${need}`);
    assert(new Set(list.items.map((i) => i.aisle)).size >= 5, 'several shop sections used');
  });

  await step('11. Compact shopping mode: tick off, hide, untick, collapse, remembered view', async () => {
    const stat = async (label) => Number((await p.locator('.shop-summary span', { hasText: label }).locator('strong').innerText()).trim());
    const total = await stat('items');
    const first = p.locator('.shop-row').first();
    const name = await first.locator('.shop-name').innerText();
    const box = await first.boundingBox();
    assert(box.height >= 48 && box.height <= 72, `compact rows (${box.height}px)`);
    await first.tap();
    await p.locator('.toast', { hasText: `${name} ticked off` }).waitFor();
    assert((await stat('still needed')) === total - 1 && (await stat('ticked off')) === 1, 'counts update');
    assert((await p.locator('.shop-row', { hasText: name }).count()) === 0, 'ticked item hidden');
    // Undo, then tick two more.
    await p.locator('.toast').getByRole('button', { name: 'Undo' }).tap();
    await p.locator('.shop-row', { hasText: name }).waitFor();
    await p.locator('.shop-row').first().tap();
    await p.locator('.shop-row').first().tap();
    assert((await stat('ticked off')) === 2, 'two ticked');
    // Ticked items stay in the "Ticked off" section and can be unticked.
    await p.getByRole('button', { name: /Ticked off/ }).tap();
    const tickedRows = p.locator('.ticked-section .shop-row');
    assert((await tickedRows.count()) === 2, 'ticked section lists 2');
    await tickedRows.first().tap();
    assert((await stat('ticked off')) === 1, 'unticked');
    // Collapse a section.
    const section = p.locator('.shop-section').first();
    const btn = section.locator('.shop-section-btn');
    await btn.tap();
    assert((await btn.getAttribute('aria-expanded')) === 'false' && (await section.locator('.shop-row').count()) === 0, 'collapsed');
    await btn.tap();
    // Manual quick add.
    await p.getByLabel('Add an item').fill('Kitchen roll');
    await p.getByRole('button', { name: 'Add', exact: true }).tap();
    await p.locator('.shop-row', { hasText: 'Kitchen roll' }).waitFor();
    // Full list: edit quantity.
    await p.getByRole('tab', { name: 'Full list' }).tap();
    await p.getByRole('button', { name: 'Edit Kitchen roll' }).tap();
    await p.getByRole('dialog').getByLabel('Amount').fill('2');
    await p.getByRole('dialog').getByRole('button', { name: 'Save' }).tap();
    await p.locator('.item', { hasText: 'Kitchen roll' }).getByText('2').waitFor();
    await p.reload();
    await p.getByRole('tab', { name: 'Full list', selected: true }).waitFor();
    await p.getByRole('tab', { name: 'Shop' }).tap();
    await p.reload();
    await p.getByRole('tab', { name: 'Shop', selected: true }).waitFor();
  });

  let snapshot;
  await step('12. Close and reopen the app: everything is still saved', async () => {
    snapshot = await readDb(p);
    await ctx.close();
    ({ ctx, p, errors } = await open());
    page = p;
    await p.goto(BASE + '#planner');
    await p.locator('.day-card').nth(3).getByRole('heading', { name: 'Taj Mahal' }).waitFor();
    const db = await readDb(p);
    for (const s of Object.keys(snapshot)) assert(JSON.stringify(db[s]) === JSON.stringify(snapshot[s]), `${s} identical after reopening`);
    assert(db.takeawayPlaces.length === 2 && db.favourites.length === 2, 'takeaways and saved meals kept');
    // Export and import keep the new data too.
    await p.goto(BASE + '#app-settings');
    const dl = p.waitForEvent('download');
    await p.getByRole('button', { name: /Export backup/ }).tap();
    const file = path.join(WORK, 'backup.json');
    await (await dl).saveAs(file);
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert(json.version === 2 && json.data.takeawayPlaces.length === 2 && json.data.savedPlans, 'backup includes takeaways');
  });

  await step('Save a week and reuse it', async () => {
    await p.goto(BASE + '#planner');
    await p.locator('.plan-overview .day-more > summary').tap();
    await p.getByRole('button', { name: '♡ Save this week' }).tap();
    await p.getByRole('dialog').getByLabel('Name').fill('Our usual week');
    await p.getByRole('dialog').getByRole('button', { name: 'Save week' }).tap();
    await p.goto(BASE + '#saved');
    await p.getByRole('tab', { name: /Weekly plans/ }).tap();
    await p.locator('.week-card', { hasText: 'Our usual week' }).getByRole('button', { name: 'Use this week' }).tap();
    await p.getByRole('dialog').getByLabel('Starting day').fill('2026-12-07');
    await p.getByRole('dialog').getByRole('button', { name: 'Use this week' }).tap();
    await p.locator('.day-card').first().waitFor();
    const plan = await planOf(p);
    assert(plan.days[0].date === '2026-12-07' && plan.days[3].mode === 'takeaway' && plan.days[3].takeaway.name === 'Taj Mahal', 'week reused with takeaway');
    assert(plan.days.filter((d) => d.mode === 'cook' && d.selected !== null).length === snapshot.mealPlans[0].days.filter((d) => d.mode === 'cook' && d.selected !== null).length, 'same dinners chosen');
  });

  await step('13. Main screens at phone and desktop sizes (no sideways scrolling)', async () => {
    for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
      await p.setViewportSize(vp);
      for (const pg of ['home', 'planner', 'saved', 'takeaways', 'shopping', 'family', 'foods', 'recipes', 'recipe-irish-stew', 'app-settings']) {
        await p.goto(BASE + '#' + pg);
        await p.waitForTimeout(250);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(over <= 1, `${label} ${pg} overflows by ${over}px`);
        if (['home', 'planner', 'saved', 'shopping'].includes(pg)) await p.screenshot({ path: path.join(SHOTS, `${label}-${pg}.png`) });
      }
    }
  });

  await step('No runtime errors', async () => assert(errors.length === 0, errors.join('\n')));
  await ctx.close();

  await step('Upgrade: data saved by the previous version opens correctly', async () => {
    const dir = path.join(WORK, 'profile-v1');
    fs.rmSync(dir, { recursive: true, force: true });
    const c = await chromium.launchPersistentContext(dir, { viewport: { width: 1280, height: 900 } });
    const q = c.pages()[0] || (await c.newPage());
    q.setDefaultTimeout(8000);
    const errs = [];
    q.on('pageerror', (e) => errs.push(e.message));
    // Write version-1 data straight into storage, as the old app would have left it.
    await q.goto(BASE + 'icon.svg');
    await q.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const stores = ['households', 'members', 'foods', 'categories', 'preferences', 'recipes', 'mealPlans', 'shoppingLists', 'favourites', 'settings'];
          const o = indexedDB.open('family-food-planner', 1);
          o.onupgradeneeded = () => stores.forEach((s) => o.result.createObjectStore(s, { keyPath: 'id' }));
          o.onerror = () => reject(o.error);
          o.onsuccess = () => {
            const db = o.result;
            const tx = db.transaction(stores, 'readwrite');
            const put = (s, v) => tx.objectStore(s).put(v);
            const t = '2026-10-01T10:00:00.000Z';
            put('settings', { id: 'app', activeHouseholdId: 'hh1', seedVersion: 2, recentRecipeIds: [] });
            put('households', { id: 'hh1', name: 'The Old Family', country: 'Ireland', createdAt: t, updatedAt: t });
            put('members', { id: 'm1', householdId: 'hh1', name: 'Nora', age: 40, sex: '', allergies: [{ kind: 'allergen', id: 'milk' }], intolerances: [], dietary: [], dislikes: [], nutrition: [], createdAt: t, updatedAt: t });
            put('foods', { id: 'food_bp', name: 'Black pudding', category: 'protein', emoji: '🍖', aisle: 'meat-fish', allergens: [], allergenInfo: 'unknown', diet: {}, custom: true });
            put('favourites', { id: 'hh1:irish-stew', householdId: 'hh1', recipeId: 'irish-stew', addedAt: t });
            put('mealPlans', { id: 'p1', householdId: 'hh1', startDate: '2026-11-02', seed: 1, maxMinutes: null, createdAt: t, updatedAt: t, days: [
              { date: '2026-11-02', options: ['irish-stew', 'red-lentil-dhal'], selected: 0, skipped: false, eaters: ['m1'], guests: 0, portions: null, rejected: [] },
              { date: '2026-11-03', options: [null, null], selected: null, skipped: true, eaters: ['m1'], guests: 0, portions: null, rejected: [] },
            ] });
            put('shoppingLists', { id: 'hh1', householdId: 'hh1', planId: 'p1', generatedAt: t, updatedAt: t, items: [
              { id: 'i1', key: 'lamb-diced', foodId: 'lamb-diced', name: 'Diced lamb', aisle: 'meat-fish', quantities: [{ amount: 200, unit: 'g' }], have: true, source: 'plan', recipes: ['Irish Stew'] },
              { id: 'i2', key: 'salmon', foodId: 'salmon', name: 'Salmon fillets', aisle: 'meat-fish', quantities: [{ amount: 2, unit: 'item' }], have: false, source: 'plan', recipes: ['X'] },
              { id: 'i3', key: 'i3', name: 'Kitchen roll', aisle: 'other', quantities: [], have: false, source: 'manual', recipes: [] },
            ] });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
          };
        }),
    );
    await q.goto(BASE + '#planner');
    await q.getByRole('heading', { name: 'Irish Stew' }).waitFor();
    assert(await q.locator('.day-card').nth(1).getByText('Nothing planned').first().isVisible(), 'skipped day became "nothing planned"');
    const db = await readDb(q);
    assert(db.households[0].name === 'The Old Family' && db.members[0].allergies[0].id === 'milk', 'household and allergy kept');
    assert(db.foods.some((f) => f.name === 'Black pudding' && f.aisle === 'meat'), 'custom food kept, section upgraded');
    assert(db.recipes.length >= 77, 'catalogue upgraded');
    const items = Object.fromEntries(db.shoppingLists[0].items.map((i) => [i.name, i]));
    assert(items['Diced lamb'].aisle === 'meat' && items['Diced lamb'].have === true, 'lamb → Meat and poultry, tick kept');
    assert(items['Salmon fillets'].aisle === 'fish', 'salmon → Fish and seafood');
    assert(items['Kitchen roll'], 'manual item kept');
    assert(db.favourites.length === 1 && Array.isArray(db.takeawayPlaces), 'saved meals kept; new stores created');
    await q.goto(BASE + '#saved');
    await q.locator('.saved-card', { hasText: 'Irish Stew' }).waitFor();
    assert(errs.length === 0, errs.join('; '));
    await c.close();
  });

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
