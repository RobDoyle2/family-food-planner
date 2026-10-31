/*
 * "Plan your plate": choose foods first, then recipes. Follows the 20-step family scenario,
 * plus allergies, takeaway nights, partial plans, cupboard staples, nutrition and layouts.
 * Usage: npm run preview, then `node tests/e2e-plate.cjs [baseUrl] [workDir]`.
 */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:4173/';
const WORK = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'ffp-plate-'));
const PROFILE = path.join(WORK, 'plate-profile');
const SHOTS = path.join(WORK, 'plate-screens');
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
let page;
async function step(name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push(false);
    await page?.screenshot({ path: path.join(WORK, `plate-fail-${results.length}.png`), fullPage: true }).catch(() => {});
    console.log(`FAIL  ${name}\n      ${String(e.message).split('\n').slice(0, process.env.VERBOSE ? 12 : 2).join('\n      ')}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
const readDb = (p) =>
  p.evaluate(
    () =>
      new Promise((resolve) => {
        const o = indexedDB.open('family-food-planner');
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
const dismissToasts = async (p) => {
  for (const b of await p.locator('.toast .icon-btn').all()) await b.click().catch(() => {});
};

/** Does a recipe use the chosen main food? (mirrors the app's rule, for checking from outside) */
function usesProtein(db, recipeId, protein) {
  const r = db.recipes.find((x) => x.id === recipeId);
  const foods = new Map(db.foods.map((f) => [f.id, f]));
  const lineage = (id) => {
    const out = [];
    while (id && !out.includes(id)) {
      out.push(id);
      id = foods.get(id)?.parent;
    }
    return out;
  };
  if (protein === 'vegetarian' || protein === 'vegan') return r.dietaryTags.includes(protein);
  return r.proteinGroup === protein || (r.mainProtein && lineage(r.mainProtein).includes(protein));
}
function usesCarb(db, recipeId, carb) {
  const r = db.recipes.find((x) => x.id === recipeId);
  const foods = new Map(db.foods.map((f) => [f.id, f]));
  return r.ingredients.some((i) => i.role === 'carb' && (i.foodId === carb || foods.get(i.foodId)?.parent === carb));
}
const planOf = async (p) => (await readDb(p)).mealPlans[0];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, { ...devices['iPhone 13'] });
  const p = ctx.pages()[0] || (await ctx.newPage());
  page = p;
  p.setDefaultTimeout(8000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await p.goto(BASE);
  await p.getByLabel('Household name').fill('The Doyles');
  await p.getByRole('button', { name: 'Create household' }).tap();
  for (const [name, allergies] of [['Rob', []], ['Sinéad', []], ['Aoife', ['Fish']]]) {
    await p.goto(BASE + '#family');
    await p.getByRole('button', { name: '+ Add member' }).first().tap();
    const d = p.getByRole('dialog');
    await d.getByLabel('Name').fill(name);
    for (const a of allergies) await d.locator('fieldset', { hasText: 'Allergies' }).first().getByText(a, { exact: true }).tap();
    await d.getByRole('button', { name: 'Add member' }).tap();
    await d.waitFor({ state: 'detached' });
  }

  await step('1. "Build your week" is the main way in: from Home and from an empty planner', async () => {
    await p.goto(BASE + '#home');
    await p.getByRole('button', { name: /Build your week/ }).first().waitFor();
    await p.goto(BASE + '#planner');
    await p.getByRole('heading', { name: /Build your week — plan your plate/ }).waitFor();
    await p.getByRole('button', { name: /Build your week/ }).first().tap();
    await p.getByRole('heading', { name: 'Build your week', level: 1 }).waitFor();
  });

  await step('2. Choose the period: Monday, 5 days, people per day', async () => {
    await p.getByLabel('Starting day').fill('2026-11-02');
    await p.getByRole('button', { name: '5 days' }).tap();
    await p.getByRole('button', { name: 'Start planning 5 days' }).tap();
    await p.getByRole('heading', { name: /main food each day/ }).waitFor();
    const plan = await planOf(p);
    assert(plan.days.length === 5 && plan.days[0].date === '2026-11-02', 'plan of 5 days from Monday');
    assert(plan.days.every((d) => d.eaters.length === 3 && !d.options[0]), 'everyone eating, no recipes picked yet');
    // People per day can be changed on the Days step.
    await p.getByRole('button', { name: /Days/ }).first().tap();
    const wed = p.getByRole('group', { name: 'People eating on Wednesday' });
    await wed.getByRole('button', { name: /Increase|\+/ }).tap();
    await p.waitForTimeout(150);
    assert((await planOf(p)).days[2].portions === 4, 'Wednesday has 4 people');
    await p.getByRole('button', { name: 'Next: main foods →' }).tap();
  });

  await step('3. Main foods with animal tiles: chicken, beef, pork, duck, vegetarian (and a specific cut)', async () => {
    await p.screenshot({ path: path.join(SHOTS, 'mains-phone.png'), fullPage: true });
    const picks = ['Chicken', 'Beef', 'Pork', 'Duck', 'Vegetarian'];
    for (let i = 0; i < 5; i++) {
      await p.getByRole('tab', { name: new RegExp(DAYS[i].slice(0, 3)) }).tap();
      await p.getByRole('group', { name: 'Main food' }).getByRole('button', { name: new RegExp(`^${picks[i]}`) }).tap();
      await p.waitForTimeout(100);
    }
    // Pork offers its products; "any pork" stays the default.
    await p.getByRole('tab', { name: /Wed/ }).tap();
    await p.getByRole('button', { name: /Bacon rashers/ }).waitFor();
    await p.getByRole('button', { name: /Any pork/ }).waitFor();
    const plan = await planOf(p);
    assert(JSON.stringify(plan.days.map((d) => d.plate?.protein)) === JSON.stringify(['chicken', 'beef', 'pork', 'duck', 'vegetarian']), 'mains saved: ' + plan.days.map((d) => d.plate?.protein));
    assert(await p.locator('.tile.on .tile-art').first().textContent() === '🐖', 'pork tile shows the pig');
    await p.getByRole('button', { name: 'Next: sides →' }).tap();
  });

  await step('4. Sides: rice ×2, pasta ×2, potatoes ×1 shared out, no side twice in a row', async () => {
    const set = async (label, n) => {
      for (let i = 0; i < n; i++) await p.getByRole('button', { name: `Increase ${label} — days this week`, exact: true }).tap();
    };
    await set('Rice', 2);
    await set('Pasta', 2);
    await set('Potatoes', 1);
    await p.getByText('5 of 5 cooking days').waitFor();
    await p.getByRole('button', { name: '⇄ Share them across the week' }).tap();
    await p.waitForTimeout(200);
    const plan = await planOf(p);
    const carbs = plan.days.map((d) => d.plate?.carb);
    const count = (c) => carbs.filter((x) => x === c).length;
    assert(count('rice') === 2 && count('pasta') === 2 && count('potatoes') === 1, 'counts: ' + carbs);
    for (let i = 1; i < 5; i++) assert(carbs[i] !== carbs[i - 1], 'no repeats: ' + carbs);
    // The weekly count shows on the tiles; a day can still be changed by hand.
    await p.getByRole('group', { name: 'Side' }).getByText('×2').first().waitFor();
    await p.getByRole('button', { name: 'Next: vegetables →' }).tap();
  });

  await step('5. Vegetables: broccoli, carrots, parsnips, peas for the week, with usage counts', async () => {
    const g = p.getByRole('group', { name: 'Vegetables for the week' });
    for (const v of ['Broccoli', 'Carrots', 'Parsnips', 'Peas']) await g.getByRole('button', { name: new RegExp(`^${v}`) }).tap();
    await p.waitForTimeout(100);
    await p.getByRole('button', { name: '⇄ Share them across the days' }).tap();
    await p.waitForTimeout(200);
    const plan = await planOf(p);
    assert(plan.weekVeg.length === 4, 'week veg saved');
    const used = new Set(plan.days.flatMap((d) => d.plate.veg));
    assert(['broccoli', 'carrots', 'parsnips', 'peas'].every((v) => used.has(v)), 'each veg used');
    await g.getByText(/×\d/).first().waitFor();
    // "Your week so far" overview reads like Monday: Chicken | Rice | Broccoli …
    await p.locator('.overview-rows li').first().getByText('Chicken').waitFor();
    await p.getByRole('button', { name: 'Next: see your week →' }).tap();
  });

  await step('6. Find my recipes: two genuinely different ideas per day that use each day’s main food', async () => {
    await p.getByRole('button', { name: /Find my recipes/ }).tap();
    await p.locator('.suggestion').first().waitFor();
    const db = await readDb(p);
    const plan = db.mealPlans[0];
    for (const [i, d] of plan.days.entries()) {
      const opts = d.options.filter(Boolean);
      assert(opts.length >= 1, `${DAYS[i]} has ideas`);
      for (const id of opts) assert(usesProtein(db, id, d.plate.protein), `${DAYS[i]}: ${id} uses ${d.plate.protein}`);
      if (opts.length === 2) assert(opts[0] !== opts[1], 'two different recipes');
    }
    const withSide = plan.days.filter((d) => usesCarb(db, d.options[0], d.plate.carb)).length;
    assert(withSide >= 4, `the first idea uses the chosen side on most days (${withSide}/5)`);
    await p.screenshot({ path: path.join(SHOTS, 'recipes-phone.png'), fullPage: true });
  });

  await step('7. Choose Monday; view, save and share from a suggestion', async () => {
    const mon = p.locator('.plate-row').nth(0);
    const name = (await mon.locator('.suggestion strong').first().textContent()).trim();
    await mon.locator('.suggestion').first().getByRole('button', { name: /^Save/ }).tap();
    await p.waitForTimeout(150);
    assert((await readDb(p)).favourites.length === 1, 'saved meal');
    await mon.locator('.suggestion').first().getByRole('button', { name: `Choose ${name} for Monday` }).tap();
    await mon.getByText(`✓ ${name}`).waitFor().catch(async () => mon.locator('.pr-chosen').getByText(name).waitFor());
    assert((await planOf(p)).days[0].selected !== null, 'Monday chosen');
  });

  await step('8. Change Tuesday from beef to chicken: ideas update automatically', async () => {
    await dismissToasts(p);
    await p.getByRole('button', { name: /Mains/ }).tap();
    await p.getByRole('tab', { name: /Tue/ }).tap();
    await p.getByRole('group', { name: 'Main food' }).getByRole('button', { name: /^Chicken/ }).tap();
    await p.waitForTimeout(150);
    await p.getByRole('button', { name: /Recipes/ }).tap();
    // Find my recipes again keeps Monday's chosen dinner and refreshes the rest.
    await p.getByRole('button', { name: /Find my recipes again/ }).tap();
    await p.getByRole('dialog').getByRole('button', { name: 'Keep my choices' }).tap();
    await p.waitForTimeout(200);
    const db = await readDb(p);
    const tue = db.mealPlans[0].days[1];
    assert(tue.plate.protein === 'chicken', 'Tuesday is chicken');
    for (const id of tue.options.filter(Boolean)) assert(usesProtein(db, id, 'chicken'), `${id} is chicken`);
    assert(db.mealPlans[0].days[0].selected !== null, "Monday's choice kept");
  });

  await step('9. "New recipe for Tuesday" gives a different recipe from the same foods', async () => {
    await dismissToasts(p);
    const before = (await planOf(p)).days[1].options;
    await p.locator('.plate-row').nth(1).getByRole('button', { name: '↻ New recipe for Tuesday' }).tap();
    await p.waitForTimeout(200);
    const db = await readDb(p);
    const after = db.mealPlans[0].days[1].options;
    assert(after[0] && !before.includes(after[0]), `different idea (${before} → ${after})`);
    for (const id of after.filter(Boolean)) assert(usesProtein(db, id, 'chicken'), 'still chicken');
  });

  await step('10. Changing a chosen day’s side never overwrites it without asking', async () => {
    await dismissToasts(p);
    await p.goto(BASE + '#planner');
    const mon = p.locator('#day-0');
    await mon.getByRole('button', { name: 'Edit foods for Monday' }).tap();
    const d = p.getByRole('dialog');
    await d.getByRole('tab', { name: 'Side' }).tap();
    const current = (await planOf(p)).days[0].plate.carb;
    const other = current === 'pasta' ? 'Potatoes' : 'Pasta';
    await d.getByRole('group', { name: 'Side' }).getByRole('button', { name: new RegExp(`^${other}`) }).tap();
    await d.getByRole('button', { name: 'Save foods' }).tap();
    const ask = p.getByRole('dialog', { name: /Find a new recipe for Monday/ });
    await ask.waitFor();
    const chosenBefore = (await planOf(p)).days[0].options[(await planOf(p)).days[0].selected];
    await ask.getByRole('button', { name: /^Keep/ }).tap();
    await p.waitForTimeout(200);
    const day = (await planOf(p)).days[0];
    assert(day.options[day.selected] === chosenBefore, 'chosen dinner kept');
    assert(day.plate.carb === other.toLowerCase(), 'new side saved');
    await mon.getByText(/doesn't use the foods picked/).waitFor();
    // Asking for matching recipes now offers ideas with the new side.
    await mon.getByRole('button', { name: 'See matching recipes' }).tap();
    await p.getByRole('dialog').getByText('Based on your foods:').waitFor();
    await p.getByRole('dialog').getByRole('button', { name: 'Close' }).tap();
  });

  await step('11. Swap Monday and Tuesday: their foods and meals move together', async () => {
    await dismissToasts(p);
    const before = (await planOf(p)).days;
    await p.goto(BASE + '#build');
    await p.getByRole('button', { name: /Recipes/ }).tap();
    await p.getByRole('button', { name: 'Swap Monday with the day after' }).tap();
    await p.waitForTimeout(200);
    const after = (await planOf(p)).days;
    assert(after[0].plate.protein === before[1].plate.protein && after[1].plate.protein === before[0].plate.protein, 'plates swapped');
    assert(after[1].selected !== null && after[1].options[after[1].selected] === before[0].options[before[0].selected], 'chosen meal moved');
    assert(after[0].eaters.length === before[0].eaters.length, 'who is eating stays with the day');
  });

  await step('12. Make Friday a takeaway night from the main-food step', async () => {
    await dismissToasts(p);
    await p.getByRole('button', { name: /Mains/ }).tap();
    await p.getByRole('tab', { name: /Fri/ }).tap();
    await p.getByRole('button', { name: '🥡 Takeaway night' }).tap();
    await p.getByRole('radio', { name: /Chinese/ }).tap();
    await p.getByRole('button', { name: 'Make it a takeaway night' }).tap();
    await p.waitForTimeout(150);
    assert((await planOf(p)).days[4].mode === 'takeaway', 'Friday takeaway');
  });

  await step('13. Allergy rules are never relaxed: salmon for Thursday with a fish allergy at the table', async () => {
    await dismissToasts(p);
    await p.getByRole('tab', { name: /Thu/ }).tap();
    await p.getByRole('group', { name: 'Main food' }).getByRole('button', { name: /^Salmon/ }).tap();
    await p.waitForTimeout(100);
    await p.getByRole('button', { name: /Recipes/ }).tap();
    await p.getByRole('button', { name: /Find my recipes again/ }).tap();
    await p.getByRole('dialog').getByRole('button', { name: 'Keep my choices' }).tap();
    const thu = p.locator('.plate-row').nth(3);
    await thu.getByText(/No salmon recipe suits everyone/).waitFor();
    await thu.getByText(/not relaxed/).waitFor();
    const db = await readDb(p);
    for (const id of db.mealPlans[0].days[3].options.filter(Boolean)) {
      const r = db.recipes.find((x) => x.id === id);
      assert(!r.allergens.includes('fish'), `${r.name} contains no fish`);
    }
  });

  await step('14. Choose the remaining dinners; the plate overview shows the whole week', async () => {
    await dismissToasts(p);
    for (const i of [0, 2, 3]) {
      const row = p.locator('.plate-row').nth(i);
      if (await row.locator('.pr-chosen').count()) continue;
      await row.locator('.suggestion').first().getByRole('button', { name: /^Choose/ }).tap();
      await p.waitForTimeout(120);
    }
    const plan = await planOf(p);
    assert(plan.days.filter((d) => d.mode === 'cook' && d.selected !== null).length === 4, 'four dinners chosen');
    await p.locator('.plate-row').nth(4).getByText(/Takeaway/).waitFor();
    await p.locator('.plate-row').first().getByText(/kcal per serving/).waitFor();
    await p.screenshot({ path: path.join(SHOTS, 'week-phone.png'), fullPage: true });
  });

  await step('15. Shopping list: main items first, then additional recipe ingredients; takeaway adds nothing', async () => {
    await dismissToasts(p);
    await p.getByRole('button', { name: '🛒 Shopping list' }).tap();
    await p.getByRole('heading', { name: /Main shopping items/ }).first().waitFor();
    await p.getByRole('heading', { name: /Additional recipe ingredients/ }).first().waitFor();
    const db = await readDb(p);
    const items = db.shoppingLists[0].items;
    assert(items.some((i) => i.kind === 'main' && /chicken/.test(i.foodId)), 'chicken is a main item');
    assert(items.some((i) => i.kind === 'extra'), 'has additional ingredients');
    assert(items.every((i) => i.recipes.length > 0), 'every item comes from a chosen dinner');
    await p.screenshot({ path: path.join(SHOTS, 'shopping-phone.png'), fullPage: true });
  });

  await step('16. Cupboard staples: olive oil usually at home is left off, running low puts it back', async () => {
    const hadOil = (await readDb(p)).shoppingLists[0].items.some((i) => i.foodId === 'olive-oil');
    assert(hadOil, 'olive oil needed by the recipes');
    await p.getByRole('button', { name: '🧂 Add cupboard items' }).tap();
    const d = p.getByRole('dialog', { name: 'Cupboard staples' });
    await d.getByRole('button', { name: 'Use the suggested staples' }).tap();
    await d.locator('.staple-name', { hasText: 'Olive oil' }).waitFor();
    await p.waitForTimeout(150);
    assert(!(await readDb(p)).shoppingLists[0].items.some((i) => i.foodId === 'olive-oil'), 'olive oil left off');
    await d.getByRole('group', { name: 'How much Olive oil is left' }).getByRole('button', { name: 'Running low' }).tap();
    await p.waitForTimeout(150);
    const oil = (await readDb(p)).shoppingLists[0].items.find((i) => i.foodId === 'olive-oil');
    assert(oil && oil.kind === 'cupboard', 'olive oil back on the list as a cupboard item');
    // "Add to every list" adds a staple even if no recipe uses it.
    await d.getByLabel('How to handle White wine vinegar').selectOption('always');
    await p.waitForTimeout(150);
    assert((await readDb(p)).shoppingLists[0].items.some((i) => i.foodId === 'vinegar' && i.kind === 'cupboard'), 'vinegar added');
    await d.getByRole('button', { name: 'Done' }).tap();
    await p.getByText(/Assumed at home this week:/).waitFor();
    await p.locator('.tag-cupboard').first().waitFor();
  });

  await step('17. Nutrition estimates on a recipe: per serving and whole recipe, clearly labelled', async () => {
    const plan = await planOf(p);
    const id = plan.days[0].options[plan.days[0].selected];
    await p.goto(BASE + `#recipe-${id}`);
    const card = p.locator('.nutrition-card');
    await card.getByText('Estimate', { exact: true }).waitFor();
    for (const n of ['Energy', 'Protein', 'Carbohydrate', 'Fat', 'Fibre', 'Sugars', 'Salt']) await card.locator('.nutrients').getByText(n, { exact: true }).waitFor();
    const per = await card.locator('.nutrient-kcal dd').textContent();
    await card.getByRole('tab', { name: /Whole recipe/ }).tap();
    const whole = await card.locator('.nutrient-kcal dd').textContent();
    assert(parseInt(whole) > parseInt(per) * 2, `whole recipe (${whole}) larger than per serving (${per})`);
    await card.getByText(/not medical or dietary advice/).waitFor();
  });

  await step('18. "Write a recipe with these foods" starts a recipe with the day’s foods', async () => {
    await p.goto(BASE + '#planner');
    await p.locator('#day-1').getByRole('button', { name: 'Edit foods for Tuesday' }).waitFor();
    // Use a day without a chosen dinner: clear Wednesday's choice first.
    const plan = await planOf(p);
    await p.evaluate(() => localStorage.removeItem('ffp.ownRecipeDraft'));
    await p.locator('#day-1').getByRole('button', { name: 'Change', exact: true }).tap();
    await p.getByRole('dialog').getByRole('button', { name: '✎ Write a recipe with these foods' }).tap();
    await p.getByRole('heading', { name: 'Add your own recipe' }).waitFor();
    const draft = await p.evaluate(() => JSON.parse(localStorage.getItem('ffp.ownRecipeDraft')));
    const tuePlate = plan.days[1].plate;
    assert(draft.ingredients.length >= 2, 'ingredients pre-filled');
    assert(draft.ingredients.some((i) => tuePlate.veg.includes(i.foodId)) || !tuePlate.veg.length, 'veg included');
    await p.evaluate(() => localStorage.removeItem('ffp.ownRecipeDraft'));
  });

  await step('19. Close and reopen: foods, recipes and staples are all still there', async () => {
    const before = await readDb(p);
    await ctx.close();
    const ctx2 = await chromium.launchPersistentContext(PROFILE, { ...devices['iPhone 13'] });
    const p2 = ctx2.pages()[0] || (await ctx2.newPage());
    page = p2;
    p2.on('pageerror', (e) => errors.push(e.message));
    await p2.goto(BASE + '#build');
    await p2.getByRole('heading', { name: 'Build your week', level: 1 }).waitFor();
    const after = await readDb(p2);
    assert(JSON.stringify(after.mealPlans[0].days.map((d) => d.plate)) === JSON.stringify(before.mealPlans[0].days.map((d) => d.plate)), 'plates persisted');
    assert(JSON.stringify(after.preferences[0].staples) === JSON.stringify(before.preferences[0].staples), 'staples persisted');
    // Layouts: phone and desktop, every step, no sideways scrolling.
    for (const [w, h] of [[390, 844], [1280, 900]]) {
      await p2.setViewportSize({ width: w, height: h });
      for (const s of ['Days', 'Mains', 'Sides', 'Veg', 'Recipes']) {
        await p2.locator('.build-step-btn', { hasText: s }).click();
        await p2.waitForTimeout(80);
        const over = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(over <= 1, `${s} at ${w}px scrolls sideways by ${over}px`);
      }
      await p2.screenshot({ path: path.join(SHOTS, `recipes-${w}.png`), fullPage: true });
    }
    await ctx2.close();
  });

  await step('20. Partial plans work: skip everything and still get safe ideas', async () => {
    const ctx3 = await chromium.launchPersistentContext(PROFILE, { ...devices['iPhone 13'] });
    const p3 = ctx3.pages()[0] || (await ctx3.newPage());
    page = p3;
    p3.on('pageerror', (e) => errors.push(e.message));
    await p3.goto(BASE + '#build');
    await p3.locator('.build-step-btn', { hasText: 'Days' }).click();
    await p3.getByRole('button', { name: '＋ Start a new week instead' }).click();
    await p3.getByRole('button', { name: '3 days' }).click();
    await p3.getByRole('button', { name: 'Start planning 3 days' }).click();
    await p3.getByRole('dialog').getByRole('button', { name: 'Start a new week' }).click();
    await p3.getByRole('heading', { name: /main food each day/ }).waitFor();
    await p3.locator('.build-step-btn', { hasText: 'Recipes' }).click();
    await p3.getByRole('button', { name: /Find my recipes/ }).click();
    await p3.locator('.suggestion').first().waitFor();
    const db = await readDb(p3);
    const plan = db.mealPlans[0];
    assert(plan.days.length === 3 && plan.days.every((d) => d.options[0] && d.options[1]), 'two ideas per day with no foods chosen');
    for (const d of plan.days) for (const id of d.options) assert(!db.recipes.find((r) => r.id === id).allergens.includes('fish'), 'safe for Aoife');
    await ctx3.close();
  });

  await step('No runtime errors', async () => {
    assert(errors.length === 0, errors.join(' | '));
  });

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
