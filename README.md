# Family Food Planner

Plan family dinners, respect everyone's allergies and preferences, and get an accurate, combined shopping list.
It's a React + TypeScript + Vite Progressive Web App. Everything is stored on the device in IndexedDB: no account, no backend, no paid APIs.

## Getting started

Requirements: Node.js 18 or later (tested on Node 22).

```bash
npm install
npm run dev        # development server at http://localhost:5173
```

Production build (with offline support):

```bash
npm run build
npm run preview    # serves dist/ at http://localhost:4173
```

The `dist/` folder is a static site. You can host it on any static web host (Netlify, GitHub Pages, an S3 bucket and so on).
To install it on a phone, the site must be served over **HTTPS** (or from localhost).

### Tests

```bash
npm test                # 60 unit tests: allergy safety, generator quality across 7 household types, scaling, shopping list, backup
npm run preview &       # then, with Playwright available:
npm run test:e2e        # 18 end-to-end checks covering the full user journey (desktop, tablet and mobile)
npm run test:e2e:extended   # 13 QA checks: edits/removals, plan lengths, shopping maths, close/reopen, clean import, invalid imports
```

`tests/e2e.cjs` uses the `playwright` package. If it isn't installed, run `npm i -D playwright && npx playwright install chromium`.

## Using it on your phone

The app is published as a private claude.ai artifact. Open its link on your phone while signed in to Claude.
- Your data stays in that phone's browser.
- Use **Settings → Export backup** regularly. On claude.ai you'll be asked to confirm each save.
- Inside claude.ai there is no Print button and no offline mode. Host the `dist/` folder on any HTTPS site to get those back.

## Using the app

1. **Home**: create your household (country defaults to Ireland).
2. **My Family**: add each person's name, age, optional sex, **allergies**, **intolerances**, dietary requirements, disliked foods and (adults only) optional nutritional preferences. You can pick allergies from the 14 EU allergens or choose any specific food. For lactose intolerance, choose *Milk*.
3. **Food Preferences**: browse or search the catalogue (partial names and aliases work, e.g. "zucch" finds Courgettes). Mark foods **Like**, **Dislike** or **Exclude** (Exclude means never suggest).
   * **Rank favourites**: drag liked foods into order. The arrow buttons also work, and dragging works with touch and the keyboard. Turn ranking off if you'd rather not rank.
   * **+ Add food**: add foods that aren't in the catalogue. The app suggests a category, which you can change, and warns about duplicates or near-duplicates. You can also create your own categories.
4. **Meal Planner**: pick a start day, the number of days (default 7) and an optional maximum cooking time, then select **Generate**.
   * Every day gets **two alternative dinners**. You can **Choose this**, **↻ Replace** either one, ask for **New suggestions**, **Pick from recipes**, **Swap with…** another day, **Leave unplanned**, add or remove days, or **Regenerate unchosen days**.
   * Tap names to set who's eating each day, add guests, or override portions.
   * If too few recipes suit the people eating, the app explains why. It never relaxes allergy, intolerance, diet or exclusion rules.
5. **Recipes**: 77 family dinners. Open a recipe for scaled ingredients, the method, allergens, and a per-person suitability check. From a recipe you can:
   * Save it as a favourite (♥).
   * Add your own photo.
   * **Customise ingredients**: map your custom foods into a recipe, swap ingredients or change amounts. **Restore original** undoes this.
6. **Shopping List**: select **🛒 Build shopping list** in the planner. Ingredients from the chosen dinners are scaled to portions, combined and grouped by shop section.
   * Tick **Already have it** to move an item off the "Still to buy" view. It stays in the full list.
   * You can add, edit and remove items, and **Print**, **Export** (text or CSV) or **Copy** the list.

## Backing up your data

Data lives only in this browser on this device.

* **Settings → Export backup (JSON)** downloads a complete backup. Do this regularly.
* **Settings → Restore from a backup** checks the whole file first and lists any problems. Nothing is replaced until you confirm.
* **Settings → Keep my data permanently** asks the browser not to evict storage. Installing the app as a PWA also helps.
* **Settings → Reset all data** wipes everything after confirmation.

## Completed features

* Five main sections (Home, My Family, Food Preferences, Meal Planner, Shopping List) plus Settings and a recipe library. The layout is responsive: bottom tab bar on mobile, top navigation on desktop.
* Household and member profiles with allergies, intolerances, diets, dislikes and nutrition preferences stored as separate fields. You can edit and delete them.
* **Safety rules**:
  * Allergies, intolerances, dietary requirements and household exclusions are hard filters. They are checked against allergens and dietary flags derived from each ingredient, including nested components (pesto contains nuts and milk; Worcestershire sauce contains fish) and food groups (excluding "Fish" excludes salmon, cod and so on).
  * A custom food has *unknown* allergen information until you declare it. Recipes that use it are flagged **Needs review** and are never presented as allergen-safe.
  * Brand-variable products are marked "check the label".
  * Children can't be given nutritional goals, and there are no weight-loss or calorie-restricted plans.
* A catalogue of 153 foods across the four required categories, with aliases, allergens, parent groups, shop sections and pack sizes.
* 77 complete recipes. Each has a description, main protein, ingredients by role with quantities for a stated number of servings, prep and cook times, difficulty, a method, and derived dietary tags, allergens and components. Most are Irish and European family favourites.
* A **deterministic** selection engine:
  * It scores likes, rankings, dislikes, favourites, adult nutrition preferences and ingredient availability.
  * It keeps meals varied: no repeated recipe, and a different protein from the day before.
  * The two alternatives for a day always differ in protein and in ingredients.
  * It reuses perishable ingredients across the week to cut waste.
  * The same inputs and seed always give the same plan, so plans are testable.
* Portion scaling with sensible kitchen rounding (½ onion, 750 g), and practical shopping rounding (whole items, tidy weights, pack hints such as "≈ 2 packs (500 g)").
* A combined shopping list:
  * Compatible units merge (g/kg; ml/l/tsp/tbsp, with large spoon totals shown in ml). Incompatible units are never merged.
  * Rebuilding the list keeps your "already have" ticks and manual items.
* Favourites, dashboard summary, next dinner, progress, quick links.
* IndexedDB persistence across refreshes and restarts. If storage fails, a banner appears and the app falls back to an in-memory session.
* JSON export and validated import, plus reset.
* PWA: a web manifest and icons, and a service worker that precaches the built app, so it works fully offline after the first visit (verified with the network switched off).

## Known limitations

* **Images**: the app doesn't ship real photographs, because there is no image API and none could be bundled with clear licensing. Foods and recipes use illustrated "plate" tiles, and every image is labelled with its name. You can add your own photos to custom foods and recipes; they are resized and stored on the device.
* Allergen data reflects typical Irish supermarket products. Brands differ, so always read the label. The app is not a medical or dietetic service.
* Guests' allergies aren't known to the app, and the planner reminds you of this.
* Dinner is the only meal planned (Version 1). The app supports one active household per device.
* You can customise recipes and map foods into them, but you can't yet create brand-new recipes from scratch.
* There is no sync between devices. Use export and import to move your data.
* Some emoji may look slightly different on different operating systems.

## Project structure

```
src/
  types.ts               data model (all records are structured JSON)
  data/                  constants, food catalogue, recipe catalogue
  lib/                   pure logic: planner engine, units, shopping list, foods, recipes, backup, IndexedDB
  state/                 app store (React context + IndexedDB) and UI helpers (toasts, dialogs, routing)
  components/            reusable components (images, pickers, steppers, food form)
  pages/                 Home, Family, Foods, Planner, Recipes, RecipeDetail, Shopping, Settings
sw.template.js           service worker (asset list injected at build time)
tests/e2e.cjs            end-to-end acceptance test
```
