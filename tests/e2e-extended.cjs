/*
 * Extended QA test: edits, removals, plan lengths, shopping-list maths,
 * close/reopen persistence, clean-profile import and invalid imports.
 * Usage: npm run preview, then `node tests/e2e-extended.cjs [baseUrl] [workDir]`.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:4173/';
const WORK = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'ffp-qa-'));
const PROFILE = path.join(WORK, 'profile-main');
const CLEAN = path.join(WORK, 'profile-clean');
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.rmSync(CLEAN, { recursive: true, force: true });

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    if (global.__page) await global.__page.screenshot({ path: path.join(WORK, `fail-${results.length}.png`) }).catch(() => {});
    console.log(`FAIL  ${name}\n      ${String(e.message).split('\n')[0]}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

const readDb = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('family-food-planner');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
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

async function open(dir) {
  const ctx = await chromium.launchPersistentContext(dir, { viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(8000);
  global.__page = page;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return { ctx, page, errors };
}

async function addMember(page, name, age, allergies = []) {
  await page.goto(BASE + '#/family');
  await page.getByRole('button', { name: '+ Add member' }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Name').fill(name);
  await dlg.getByLabel('Age').fill(String(age));
  for (const a of allergies) await dlg.locator('fieldset', { hasText: 'Allergies' }).first().getByText(a, { exact: true }).click();
  await dlg.getByRole('button', { name: 'Add member' }).click();
  await dlg.waitFor({ state: 'detached' });
}

async function newPlan(page, startDate, days) {
  await page.goto(BASE + '#/planner');
  const more = page.locator('.plan-overview .day-more > summary');
  if (await more.count()) {
    await more.click();
    await page.getByRole('button', { name: '＋ Start a new plan' }).click();
  }
  await page.getByLabel('Starting day').fill(startDate);
  await page.getByRole('spinbutton', { name: 'Number of days' }).fill(String(days));
  await page.getByRole('button', { name: `Plan ${days} dinners` }).click();
  const confirm = page.getByRole('dialog').getByRole('button', { name: 'Start new plan' });
  if (await confirm.count()) await confirm.click();
  await page.locator('.day-card').first().waitFor();
}

(async () => {
  let { ctx, page, errors } = await open(PROFILE);
  await page.goto(BASE);

  await step('Household creation and editing', async () => {
    await page.getByLabel('Household name').fill('The Kellys');
    await page.getByRole('button', { name: 'Create household' }).click();
    await page.goto(BASE + '#/family');
    const save = page.getByRole('button', { name: 'Save household' });
    assert(await save.isDisabled(), 'save disabled until something changes');
    await page.getByLabel('Household name').fill('The Kelly Family');
    await page.getByLabel('Country').selectOption('United Kingdom');
    await save.click();
    await page.waitForTimeout(200);
    const db = await readDb(page);
    assert(db.households.length === 1 && db.households[0].name === 'The Kelly Family' && db.households[0].country === 'United Kingdom', 'edit saved, no duplicate household');
    // Empty name is rejected with a message.
    await page.getByLabel('Household name').fill('  ');
    await save.click();
    await page.getByText('Please give your household a name').waitFor();
    await page.getByLabel('Household name').fill('The Kelly Family');
    await page.getByLabel('Country').selectOption('Ireland');
    await save.click();
  });

  await step('Member form validation and allergy-as-food hint', async () => {
    await page.getByRole('button', { name: '+ Add member' }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Add member' }).click();
    await dlg.getByText('Please enter a name.').waitFor();
    await dlg.getByLabel('Name').fill('Róisín');
    await dlg.getByLabel('Age').fill('200');
    await dlg.getByRole('button', { name: 'Add member' }).click();
    await dlg.getByText('between 0 and 120').waitFor();
    await dlg.getByLabel('Age').fill('11');
    // Pick the *food* Milk as an allergy: the form should offer the full allergen.
    const allergies = dlg.locator('fieldset', { hasText: 'Allergies' }).first();
    await allergies.getByRole('searchbox').fill('milk');
    await allergies.getByRole('option', { name: 'Milk', exact: true }).click();
    await allergies.getByText('Choosing the food only avoids milk itself').waitFor();
    await allergies.getByRole('button', { name: 'Avoid all milk' }).click();
    assert(await allergies.locator('.check-pill.on', { hasText: 'Milk' }).isVisible(), 'Milk allergen ticked');
    await dlg.getByRole('button', { name: 'Add member' }).click();
    await dlg.waitFor({ state: 'detached' });
    const db = await readDb(page);
    const r = db.members.find((m) => m.name === 'Róisín');
    assert(r.allergies.some((a) => a.kind === 'allergen' && a.id === 'milk'), 'allergen stored');
  });

  await step('Adding and removing family members (removed from plan days too)', async () => {
    await addMember(page, 'Dad', 45);
    await addMember(page, 'Temp Visitor', 30);
    await newPlan(page, '2026-12-01', 3);
    let db = await readDb(page);
    const tempId = db.members.find((m) => m.name === 'Temp Visitor').id;
    assert(db.mealPlans[0].days.every((d) => d.eaters.includes(tempId)), 'new member eats every day by default');
    await page.goto(BASE + '#/family');
    const card = page.locator('.member-card', { hasText: 'Temp Visitor' });
    await card.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    assert((await page.locator('.member-card', { hasText: 'Temp Visitor' }).count()) === 1, 'cancel keeps member');
    await card.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
    await page.waitForTimeout(200);
    assert((await page.locator('.member-card', { hasText: 'Temp Visitor' }).count()) === 0, 'member removed');
    db = await readDb(page);
    assert(db.mealPlans[0].days.every((d) => !d.eaters.includes(tempId)), 'removed from plan days');
  });

  await step('Meal plans for different numbers of days and start dates', async () => {
    for (const [start, n] of [['2026-12-01', 1], ['2026-12-24', 3], ['2027-01-04', 14]]) {
      await newPlan(page, start, n);
      assert((await page.locator('.day-card').count()) === n, `${n} day cards`);
      const db = await readDb(page);
      const p = db.mealPlans[0];
      assert(db.mealPlans.length === 1 && p.days.length === n && p.days[0].date === start, `plan starts ${start}`);
      assert(p.days.every((d) => d.options[0] && d.options[1]), `${n}-day plan: two options every day`);
      const ids = p.days.flatMap((d) => d.options);
      if (n <= 14) assert(new Set(ids).size === ids.length, 'no repeated suggestion across the plan');
    }
    // The 14-day plan crosses a month and the dates are consecutive.
    const db = await readDb(page);
    assert(db.mealPlans[0].days[13].date === '2027-01-17', 'last date correct');
    // Add and remove a day with a custom length.
    await page.getByRole('button', { name: /Dates & length/ }).click();
    await page.getByRole('button', { name: 'Other' }).click();
    await page.getByRole('button', { name: 'Increase Number of days in plan' }).click();
    await page.locator('.day-card').nth(14).waitFor();
    assert((await page.locator('.day-card').count()) === 15, 'day added');
    await page.getByRole('button', { name: 'Decrease Number of days in plan' }).click();
    await page.waitForTimeout(200);
    assert((await page.locator('.day-card').count()) === 14, 'day removed (undecided, so no confirmation needed)');
  });

  await step('Changing who eats re-checks safety for that day', async () => {
    await newPlan(page, '2026-12-01', 7);
    let db = await readDb(page);
    const roisin = db.members.find((m) => m.name === 'Róisín');
    // Take Róisín (milk allergy) out of day 1, choose a milk-containing dinner via the library, then add her back.
    const day1 = page.locator('.day-card').nth(0);
    await day1.locator('.people-chip').click();
    await page.getByRole('dialog').getByRole('button', { name: /Róisín/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    await day1.locator('.day-more > summary').click();
    await day1.getByRole('button', { name: '🔍 Search recipes' }).click();
    await page.getByRole('dialog').getByLabel('Search recipes').fill('Fish Pie');
    await page.getByRole('dialog').getByRole('button', { name: 'Choose Fish Pie' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    db = await readDb(page);
    assert(db.mealPlans[0].days[0].options.includes('fish-pie'), 'fish pie chosen while Róisín not eating');
    await page.locator('.day-card').nth(0).locator('.people-chip').click();
    await page.getByRole('dialog').getByRole('button', { name: /Róisín/ }).click();
    await page.waitForTimeout(250);
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    db = await readDb(page);
    const recipes = new Map(db.recipes.map((r) => [r.id, r]));
    const d = db.mealPlans[0].days[0];
    assert(d.eaters.includes(roisin.id), 'Róisín eating again');
    assert(!d.options.includes('fish-pie'), 'unsafe fish pie replaced automatically');
    assert(d.options.every((id) => !recipes.get(id).allergens.includes('milk')), 'remaining options are milk-free');
  });

  await step('Recipe instructions are complete and readable', async () => {
    const db = await readDb(page);
    for (const id of ['irish-stew', 'chicken-chorizo-rice', 'lentil-ragu-spaghetti']) {
      await page.goto(BASE + '#/recipes/' + id);
      const r = db.recipes.find((x) => x.id === id);
      await page.getByRole('heading', { name: r.name, level: 1 }).waitFor();
      assert((await page.locator('.steps li').count()) === r.steps.length, `${id}: all steps shown`);
      assert((await page.locator('.ing-list li').count()) === r.ingredients.length, `${id}: all ingredients shown`);
    }
  });

  await step('Editing and removing custom foods', async () => {
    await page.goto(BASE + '#/foods');
    await page.getByRole('button', { name: '+ Add food' }).click();
    let dlg = page.getByRole('dialog');
    await dlg.getByLabel('Food name').fill('Halloumi');
    await dlg.getByRole('button', { name: 'Add food' }).click();
    await dlg.waitFor({ state: 'detached' });
    // Dislike it on Dad's profile and like it for the household.
    await page.getByLabel('Search foods').fill('hallou');
    await page.getByRole('button', { name: 'Like: Halloumi', exact: true }).click();
    await page.locator('.food-card', { hasText: 'Halloumi' }).getByRole('button', { name: 'Edit' }).click();
    dlg = page.getByRole('dialog');
    await dlg.getByLabel('Food name').fill('Halloumi cheese');
    await dlg.getByLabel('Description (optional)').fill('For grilling');
    await dlg.getByText("I've checked the label").click();
    await dlg.getByText('Milk', { exact: true }).click();
    await dlg.getByRole('button', { name: 'Save food' }).click();
    await dlg.waitFor({ state: 'detached' });
    await page.getByLabel('Search foods').fill('halloumi ch');
    await page.locator('.food-card', { hasText: 'Halloumi cheese' }).waitFor();
    let db = await readDb(page);
    const f = db.foods.find((x) => x.name === 'Halloumi cheese');
    assert(f.allergenInfo === 'declared' && f.allergens.includes('milk') && f.description === 'For grilling', 'edits saved');
    // Remove: cancel first, then confirm.
    await page.locator('.food-card', { hasText: 'Halloumi cheese' }).getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete food' }).click();
    await page.getByRole('dialog').last().getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete food' }).click();
    await page.getByRole('dialog').last().getByRole('button', { name: 'Delete food' }).click();
    await page.waitForTimeout(300);
    assert((await page.getByRole('dialog').count()) === 0, 'dialogs closed');
    await page.getByLabel('Search foods').fill('halloumi');
    await page.getByText('No foods match').waitFor();
    db = await readDb(page);
    assert(!db.foods.some((x) => x.id === f.id) && !(f.id in db.preferences[0].status), 'removed from catalogue and preferences');
  });

  let expected;
  await step('Shopping list maths for a multi-day plan with overlapping ingredients', async () => {
    await newPlan(page, '2026-12-01', 5);
    for (let i = 0; i < 5; i++) await page.locator('.day-card').nth(i).getByRole('button', { name: /^Choose / }).first().click();
    // Different portion counts per day.
    await page.locator('.day-card').nth(1).locator('.people-chip').click();
    await page.getByRole('dialog').getByRole('spinbutton', { name: /^Portions on/ }).fill('7');
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    await page.locator('.day-card').nth(3).locator('.people-chip').click();
    await page.getByRole('dialog').getByRole('button', { name: /^Increase Guests/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: '🛒 Shopping list' }).click();
    await page.getByRole('heading', { name: 'Shopping list' }).waitFor();
    const db = await readDb(page);
    const recipes = new Map(db.recipes.map((r) => [r.id, r]));
    // Independent recalculation.
    const toBase = { g: ['mass', 1], kg: ['mass', 1000], ml: ['vol', 1], l: ['vol', 1000], tsp: ['vol', 5], tbsp: ['vol', 15] };
    const sums = new Map();
    for (const d of db.mealPlans[0].days) {
      const r = recipes.get(d.options[d.selected]);
      const portions = d.portions ?? d.eaters.length + d.guests;
      for (const ing of r.ingredients) {
        const [fam, f] = toBase[ing.unit] ?? [`count:${ing.unit}`, 1];
        const key = `${ing.foodId}|${fam}`;
        sums.set(key, (sums.get(key) ?? 0) + (ing.amount * f * portions) / r.servings);
      }
    }
    expected = sums;
    const items = db.shoppingLists[0].items;
    const keys = items.map((i) => i.key);
    assert(new Set(keys).size === keys.length, 'one line per food');
    let overlaps = 0;
    for (const [key, want] of sums) {
      const [foodId, fam] = key.split('|');
      const item = items.find((i) => i.foodId === foodId);
      assert(item, `missing ${foodId}`);
      const q = item.quantities.find((x) => (toBase[x.unit]?.[0] ?? `count:${x.unit}`) === fam);
      assert(q, `${foodId}: no ${fam} quantity`);
      const got = q.amount * (toBase[q.unit]?.[1] ?? 1);
      // Rounded up for shopping: never less than needed (small tolerance for whole items), never wildly more.
      assert(got >= want - 0.16 * (fam.startsWith('count') ? 1 : 0) - 0.001, `${foodId}: ${got} < needed ${want}`);
      assert(got <= want * 1.15 + (fam.startsWith('count') ? 1 : fam === 'vol' ? 8 : 10), `${foodId}: ${got} far above ${want}`);
      if (item.recipes.length > 1) overlaps++;
    }
    assert(overlaps >= 3, 'several ingredients combined across recipes: ' + overlaps);
    assert(items.length === new Set([...sums.keys()].map((k) => k.split('|')[0])).size, 'no extra items');
  });

  await step('Already-have ticks persist and the outstanding list is accurate', async () => {
    const boxes = page.locator('.shop-row:not(.have)');
    const names = [];
    for (let i = 0; i < 3; i++) {
      const item = page.locator('.shop-row').first();
      names.push(await item.locator('.shop-name').innerText());
      await item.click();
      await page.waitForTimeout(120);
    }
    const db = await readDb(page);
    const items = db.shoppingLists[0].items;
    const outstanding = items.filter((i) => !i.have).length;
    assert((await boxes.count()) === outstanding, 'visible rows = outstanding items');
    assert(Number(await page.locator('.shop-summary span', { hasText: 'still needed' }).locator('strong').innerText()) === outstanding, 'counter matches');
    assert(names.every((n) => items.find((i) => i.name === n).have), 'ticks saved');
    // Rebuilding from the plan keeps ticks.
    await page.getByRole('tab', { name: 'Full list' }).click();
    await page.getByRole('button', { name: /Update from plan/ }).click();
    await page.waitForTimeout(250);
    const after = (await readDb(page)).shoppingLists[0].items;
    assert(names.every((n) => after.find((i) => i.name === n).have), 'ticks kept after rebuild');
    // Manual entry with a unit, and one without a quantity.
    await page.locator('.add-item').getByLabel('Item', { exact: true }).fill('Washing-up liquid');
    await page.locator('.add-item').getByRole('button', { name: 'Add', exact: true }).click();
    await page.locator('.add-item').getByLabel('Item', { exact: true }).fill('Oat milk');
    await page.locator('.add-item').getByLabel('Amount', { exact: true }).fill('2');
    await page.locator('.add-item').getByLabel('Unit').selectOption('l');
    await page.locator('.add-item').getByLabel('Section').selectOption('dairy');
    await page.locator('.add-item').getByRole('button', { name: 'Add', exact: true }).click();
    await page.locator('.aisle', { hasText: 'Dairy' }).locator('.item', { hasText: 'Oat milk' }).getByText('2 litres').waitFor();
    await page.locator('.item', { hasText: 'Washing-up liquid' }).waitFor();
  });

  let snapshot;
  await step('Close the browser completely and reopen: everything is still there', async () => {
    snapshot = await readDb(page);
    await ctx.close();
    ({ ctx, page, errors } = await open(PROFILE));
    await page.goto(BASE + '#/shopping');
    await page.locator('.item', { hasText: 'Oat milk' }).waitFor();
    const db = await readDb(page);
    for (const s of Object.keys(snapshot)) assert(JSON.stringify(db[s]) === JSON.stringify(snapshot[s]), `${s} identical after reopening`);
    await page.reload();
    await page.locator('.item', { hasText: 'Oat milk' }).waitFor();
  });

  let backupPath;
  await step('Invalid imports are rejected and leave existing data untouched', async () => {
    await page.goto(BASE + '#/settings');
    const cases = {
      'not-json.json': '{ this is not json',
      'wrong-app.json': JSON.stringify({ app: 'other-app', version: 1, data: {} }),
      'wrong-shape.json': JSON.stringify({ app: 'family-food-planner', version: 1, data: { households: 'nope', members: [{ id: 'x' }] } }),
      'future.json': JSON.stringify({ app: 'family-food-planner', version: 99, data: snapshot }),
      'dangling.json': JSON.stringify({ app: 'family-food-planner', version: 1, data: { ...snapshot, households: [] } }),
    };
    for (const [name, content] of Object.entries(cases)) {
      const p = path.join(WORK, name);
      fs.writeFileSync(p, content);
      await page.locator('input[type=file]').setInputFiles(p);
      await page.getByText('this file cannot be imported').waitFor();
      assert((await page.getByRole('button', { name: 'Replace my data with this backup' }).count()) === 0, `${name}: no import button`);
    }
    const db = await readDb(page);
    for (const s of Object.keys(snapshot)) assert(JSON.stringify(db[s]) === JSON.stringify(snapshot[s]), `${s} untouched`);
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: '⬇ Export backup (JSON)' }).click();
    backupPath = path.join(WORK, 'backup.json');
    await (await dl).saveAs(backupPath);
  });

  await ctx.close();

  await step('Import into a completely clean browser profile', async () => {
    ({ ctx, page, errors } = await open(CLEAN));
    await page.goto(BASE);
    await page.getByLabel('Household name').waitFor();
    await page.goto(BASE + '#/settings');
    await page.locator('input[type=file]').setInputFiles(backupPath);
    await page.getByText('this backup is valid').waitFor();
    await page.getByRole('button', { name: 'Replace my data with this backup' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Replace my data' }).click();
    await page.waitForTimeout(300);
    const db = await readDb(page);
    for (const s of Object.keys(snapshot)) assert(JSON.stringify(db[s]) === JSON.stringify(snapshot[s]), `${s} imported exactly`);
    await page.goto(BASE + '#/home');
    await page.getByText('The Kelly Family').first().waitFor();
    await page.goto(BASE + '#/shopping');
    await page.locator('.item', { hasText: 'Oat milk' }).waitFor();
    await ctx.close();
  });

  await step('Number controls (+ / −, typing, day shortcuts) work with touch on a phone', async () => {
    const { devices } = require('playwright');
    const browser = await chromium.launch();
    const c = await browser.newContext({ ...devices['iPhone 13'] });
    const p = await c.newPage();
    p.setDefaultTimeout(8000);
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(BASE);
    await p.getByLabel('Household name').fill('Touch');
    await p.getByRole('button', { name: 'Create household' }).tap();
    await p.goto(BASE + '#family');
    await p.getByRole('button', { name: '+ Add member' }).first().tap();
    await p.getByRole('dialog').getByLabel('Name').fill('A');
    await p.getByRole('dialog').getByRole('button', { name: 'Add member' }).tap();
    await p.goto(BASE + '#planner');
    const days = p.getByRole('spinbutton', { name: 'Number of days' });
    const inc = p.getByRole('button', { name: 'Increase Number of days' });
    const dec = p.getByRole('button', { name: 'Decrease Number of days' });
    const box = await inc.boundingBox();
    assert(box.width >= 44 && box.height >= 44, `buttons are at least 44px (${box.width}x${box.height})`);
    await inc.tap();
    assert((await days.inputValue()) === '8', 'single tap +');
    // Two quick taps must both count (no double-tap zoom swallowing one).
    await inc.tap();
    await inc.tap();
    assert((await days.inputValue()) === '10', 'quick double tap counted twice: ' + (await days.inputValue()));
    await dec.tap();
    assert((await days.inputValue()) === '9', 'tap −');
    // Keyboard open in the box, then tap + : it still counts.
    await days.tap();
    await inc.tap();
    assert((await days.inputValue()) === '10', 'tap + while typing: ' + (await days.inputValue()));
    // Clear the box and type a new number (previously snapped back).
    await days.tap();
    await p.keyboard.press('Backspace');
    await p.keyboard.press('Backspace');
    assert((await days.inputValue()) === '', 'box can be emptied while typing');
    await p.keyboard.type('14');
    await p.getByRole('heading', { name: 'Meal Planner' }).tap();
    assert((await days.inputValue()) === '14', 'typed 14');
    // Emptying and leaving restores the last valid number.
    await days.tap();
    await p.keyboard.press('Backspace');
    await p.keyboard.press('Backspace');
    await p.getByRole('heading', { name: 'Meal Planner' }).tap();
    assert((await days.inputValue()) === '14', 'empty box falls back to 14');
    // Limits: typing 99 is capped by the + button being disabled at the max.
    await days.fill('31');
    assert(await inc.isDisabled(), '+ disabled at maximum');
    // Shortcuts
    await p.getByRole('button', { name: '5 days' }).tap();
    assert((await days.inputValue()) === '5', 'shortcut 5 days');
    await p.getByRole('button', { name: 'Plan 5 dinners' }).tap();
    await p.locator('.day-card').first().waitFor();
    assert((await p.locator('.day-card').count()) === 5, '5 days generated');
    // Guests and portions for one day (in the "who's eating" panel).
    await p.locator('.day-card').first().locator('.people-chip').tap();
    const sheet = p.getByRole('dialog');
    const guests = sheet.getByRole('spinbutton', { name: /^Guests on/ });
    const portions = sheet.getByRole('spinbutton', { name: /^Portions on/ });
    await sheet.getByRole('button', { name: /^Increase Guests/ }).tap();
    await sheet.getByRole('button', { name: /^Increase Guests/ }).tap();
    assert((await guests.inputValue()) === '2' && (await portions.inputValue()) === '3', 'two guests add two portions');
    await sheet.getByRole('button', { name: /^Decrease Guests/ }).tap();
    assert((await guests.inputValue()) === '1', 'guest removed');
    await sheet.getByRole('button', { name: /^Increase Portions/ }).tap();
    assert((await portions.inputValue()) === '3', 'portions override');
    await sheet.getByRole('button', { name: 'Done' }).tap();
    await p.reload();
    await p.locator('.day-card').first().locator('.people-chip').tap();
    assert((await p.getByRole('dialog').getByRole('spinbutton', { name: /^Guests on/ }).inputValue()) === '1', 'guests saved after reload');
    await p.getByRole('dialog').getByRole('button', { name: 'Done' }).tap();
    // Recipe page portions.
    await p.goto(BASE + '#recipe-spaghetti-bolognese');
    const rp = p.getByRole('spinbutton', { name: 'Portions' });
    await rp.waitFor();
    const start = Number(await rp.inputValue());
    await p.getByRole('button', { name: 'Increase Portions' }).tap();
    assert(Number(await rp.inputValue()) === start + 1, 'recipe portions +');
    assert(errs.length === 0, errs.join('; '));
    await browser.close();
  });

  await step('No console or runtime errors', async () => assert(errors.length === 0, errors.join('\n')));

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
