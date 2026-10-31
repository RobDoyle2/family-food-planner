/*
 * Own recipes: create, validate, review flag, edit, plan, shopping list, add-to-list, draft, delete.
 * Usage: npm run preview, then `node tests/e2e-own-recipes.cjs [baseUrl] [workDir]`.
 */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:4173/';
const WORK = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'ffp-own-'));
fs.rmSync(path.join(WORK, 'profile'), { recursive: true, force: true });
const results = [];
let page;
async function step(name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push(false);
    await page?.screenshot({ path: path.join(WORK, `fail-${results.length}.png`) }).catch(() => {});
    console.log(`FAIL  ${name}\n      ${String(e.message).split('\n').slice(0, process.env.VERBOSE ? 12 : 1).join('\n      ')}`);
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
const NAME = "Granny's Lamb Stew";

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(WORK, 'profile'), { ...devices['iPhone 13'] });
  const p = ctx.pages()[0] || (await ctx.newPage());
  page = p;
  p.setDefaultTimeout(8000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await p.goto(BASE);
  await p.getByLabel('Household name').fill('The Doyles');
  await p.getByRole('button', { name: 'Create household' }).tap();
  for (const [name, allergies] of [['Rob', []], ['Aoife', ['Milk']]]) {
    await p.goto(BASE + '#family');
    await p.getByRole('button', { name: '+ Add member' }).first().tap();
    const d = p.getByRole('dialog');
    await d.getByLabel('Name').fill(name);
    for (const a of allergies) await d.locator('fieldset', { hasText: 'Allergies' }).first().getByText(a, { exact: true }).tap();
    await d.getByRole('button', { name: 'Add member' }).tap();
    await d.waitFor({ state: 'detached' });
  }

  await step('"Own recipes" sits beside "All recipes", with a clear way to add one', async () => {
    await p.goto(BASE + '#recipes');
    await p.getByRole('tab', { name: /All recipes/ }).waitFor();
    await p.getByRole('tab', { name: /Own recipes/ }).tap();
    await p.getByText('No recipes of your own yet').waitFor();
    await p.getByRole('button', { name: '＋ Add your own recipe' }).last().tap();
    await p.getByRole('heading', { name: 'Add your own recipe' }).waitFor();
  });

  await step('Create a recipe: validation, ingredients from the food list, a brand-new food, live allergy check', async () => {
    await p.getByRole('button', { name: 'Save recipe' }).tap();
    await p.getByText('Please give your recipe a name.').waitFor();
    await p.getByText('Add at least one ingredient').waitFor();
    await p.getByLabel('Recipe name').fill(NAME);
    await p.getByLabel('Short description (optional)').fill('The one everyone asks for on a Sunday.');
    await p.getByRole('radio', { name: 'Picture 🍲' }).tap();
    for (const q of ['Diced lamb', 'Carrots', 'Potatoes', 'Leeks']) {
      await p.getByRole('searchbox', { name: 'Add an ingredient' }).fill(q);
      await p.getByRole('option', { name: q, exact: true }).tap();
    }
    assert((await p.getByLabel('Amount of Diced lamb').inputValue()) === '800', 'lamb amount defaults from the catalogue (800 g)');
    assert((await p.getByLabel('Unit for Carrots').inputValue()) === 'item', 'carrots counted, like the catalogue');
    await p.getByLabel('Amount of Diced lamb').fill('750');
    await p.getByLabel('Note for Carrots').fill('thick slices');
    // A food that isn't in the catalogue yet.
    await p.getByRole('button', { name: /Add a new food/ }).tap();
    const f = p.getByRole('dialog');
    await f.getByLabel('Food name').fill('Pearl barley');
    await f.getByRole('button', { name: 'Add food' }).tap();
    await f.waitFor({ state: 'detached' });
    await p.getByText('Pearl barley').first().waitFor();
    await p.getByLabel('Amount of Pearl barley').fill('100');
    await p.getByLabel('Unit for Pearl barley').selectOption('g');
    await p.locator('.safety-card .issue', { hasText: 'Needs review' }).waitFor();
    await p.getByLabel('Steps — one per line').fill('Brown the lamb.\nAdd the vegetables and barley.\nSimmer for 1½ hours.');
    await p.getByRole('button', { name: 'Save recipe' }).tap();
    await p.getByRole('heading', { name: NAME, level: 1 }).waitFor();
    assert((await p.locator('.steps li').count()) === 3, '3 method steps');
    assert((await p.locator('.ing-list li').count()) === 5, '5 ingredients');
    await p.locator('.safety-card .issue', { hasText: 'Needs review' }).waitFor();
    const db = await readDb(p);
    const r = db.recipes.find((x) => x.name === NAME);
    assert(r && r.own && !r.builtIn && r.proteinGroup === 'lamb' && r.servings === 4, 'saved as own recipe');
    assert(r.ingredients.find((i) => i.foodId === 'lamb-diced').amount === 750, 'amount saved');
  });

  await step('Edit the recipe (remove the unchecked food) and it becomes safe for Aoife', async () => {
    await p.getByRole('button', { name: '✎ Edit recipe' }).tap();
    await p.getByRole('heading', { name: `Edit ${NAME}` }).waitFor();
    await p.getByRole('button', { name: 'Remove Pearl barley' }).tap();
    await p.getByRole('button', { name: 'Increase Serves' }).tap();
    await p.getByRole('button', { name: 'Save changes' }).tap();
    await p.getByRole('heading', { name: NAME, level: 1 }).waitFor();
    assert((await p.locator('.safety-card .issue').count()) === 0, 'no longer needs review');
    await p.locator('.suit-list li.ok', { hasText: 'Aoife' }).waitFor();
    const r = (await readDb(p)).recipes.filter((x) => x.name === NAME);
    assert(r.length === 1 && r[0].servings === 5 && r[0].ingredients.length === 4, 'edited in place, not duplicated');
    await p.goto(BASE + '#own-recipes');
    await p.locator('.recipe-card', { hasText: NAME }).getByText('Your recipe').waitFor();
    assert((await p.locator('.recipe-card').count()) === 1, 'only own recipes on this tab');
    await p.getByRole('tab', { name: /All recipes/ }).tap();
    assert((await p.locator('.recipe-card').count()) > 30, 'all recipes tab lists everything');
  });

  await step('Plan it for a dinner; its ingredients go on the shopping list', async () => {
    await p.goto(BASE + '#planner');
    await p.getByRole('button', { name: 'Plan 7 dinners' }).tap();
    const card = p.locator('.day-card').first();
    await card.getByRole('button', { name: 'More ideas', exact: true }).tap();
    await p.getByRole('dialog').getByRole('tab', { name: 'Search' }).tap();
    await p.getByRole('dialog').getByLabel('Search recipes').fill('granny');
    await p.getByRole('dialog').getByRole('button', { name: `Choose ${NAME}` }).tap();
    await card.getByRole('heading', { name: NAME }).waitFor();
    await p.getByRole('button', { name: '🛒 Shopping list' }).tap();
    await p.getByRole('heading', { name: 'Shopping list' }).waitFor();
    const lamb = p.locator('.shop-row', { hasText: 'Diced lamb' });
    assert((await lamb.locator('.shop-qty').innerText()) === '300 g', 'lamb scaled from 5 servings to the 2 people eating (750 g × 2/5): ' + (await lamb.locator('.shop-qty').innerText()));
    const item = (await readDb(p)).shoppingLists[0].items.find((i) => i.foodId === 'lamb-diced');
    assert(item.recipes.includes(NAME), 'item linked to the recipe');
  });

  await step('Add another recipe’s ingredients straight to the list: combined, removable, undoable', async () => {
    await p.goto(BASE + '#recipe-irish-stew');
    await p.getByRole('spinbutton', { name: 'Portions' }).fill('4');
    await p.getByRole('button', { name: /Add ingredients to shopping list/ }).tap();
    await p.getByRole('button', { name: /On your list \(4\)/ }).waitFor();
    await p.goto(BASE + '#shopping');
    await p.locator('.extra-meals', { hasText: 'Irish Stew' }).waitFor();
    const db = await readDb(p);
    const lambs = db.shoppingLists[0].items.filter((i) => i.foodId === 'lamb-diced');
    assert(lambs.length === 1 && lambs[0].quantities[0].amount === 1100 && lambs[0].recipes.length === 2, `one combined lamb line (300 + 800 g): ${JSON.stringify(lambs.map((l) => l.quantities))}`);
    assert((await p.locator('.shop-row', { hasText: 'Diced lamb' }).locator('.shop-qty').innerText()) === '1.1 kg', 'shown as 1.1 kg');
    await p.getByRole('button', { name: 'Take Irish Stew off the shopping list' }).tap();
    assert((await p.locator('.shop-row', { hasText: 'Diced lamb' }).locator('.shop-qty').innerText()) === '300 g', 'back to 300 g');
    await p.locator('.toast').getByRole('button', { name: 'Undo' }).tap();
    await p.locator('.extra-meals', { hasText: 'Irish Stew' }).waitFor();
    // Works with a built-in recipe the household has never planned, and survives a reload.
    await p.reload();
    await p.locator('.extra-meals', { hasText: 'Irish Stew' }).waitFor();
  });

  await step('An unfinished new recipe is kept as a draft', async () => {
    await p.goto(BASE + '#new-recipe');
    await p.getByLabel('Recipe name').fill('Half-written soup');
    await p.goto(BASE + '#home');
    await p.goto(BASE + '#new-recipe');
    assert((await p.getByLabel('Recipe name').inputValue()) === 'Half-written soup', 'draft restored');
    await p.getByText('We kept the recipe you started earlier').waitFor();
    await p.getByRole('button', { name: 'Start again' }).tap();
    await p.getByRole('dialog').getByRole('button', { name: 'Clear form' }).tap();
    assert((await p.getByLabel('Recipe name').inputValue()) === '', 'cleared');
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(over <= 1, 'editor fits the phone screen: ' + over);
    await p.screenshot({ path: path.join(WORK, 'editor-phone.png'), fullPage: true });
  });

  await step('Delete the recipe: removed from the plan, saved meals and shopping list', async () => {
    await p.goto(BASE + '#own-recipes');
    await p.locator('.recipe-card', { hasText: NAME }).getByRole('link').first().tap();
    await p.getByRole('button', { name: `Save ${NAME}` }).tap();
    await p.getByRole('button', { name: 'Delete recipe' }).tap();
    await p.getByRole('dialog').getByText('taken out of your meal plan').waitFor();
    await p.getByRole('dialog').getByRole('button', { name: 'Delete recipe' }).tap();
    await p.getByText('No recipes of your own yet').waitFor();
    const db = await readDb(p);
    const id = 'gone';
    assert(!db.recipes.some((r) => r.name === NAME), 'recipe deleted');
    assert(db.favourites.length === 0, 'removed from saved meals');
    assert(db.mealPlans[0].days[0].selected === null, 'that day needs a dinner again');
    assert(!db.shoppingLists[0].items.some((i) => i.recipes.includes(NAME)), 'its ingredients left the list');
    assert(db.shoppingLists[0].items.some((i) => i.recipes.includes('Irish Stew')), 'other list recipes kept');
    void id;
  });

  await step('No runtime errors', async () => assert(errors.length === 0, errors.join('\n')));
  await ctx.close();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
