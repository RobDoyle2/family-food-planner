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
npm test                # 104 unit tests: plate matching, sides/veg sharing, cupboard staples, nutrition, allergy safety, generator quality across 7 household types, plan editing, takeaways, migration, shopping list, backup
npm run preview &       # then, with Playwright available:
npm run test:e2e        # 18 end-to-end checks covering the full user journey (desktop, tablet and mobile)
npm run test:e2e:extended   # 14 QA checks: edits/removals, plan lengths, shopping maths, close/reopen, clean import, invalid imports, phone controls
npm run test:e2e:own        # 8 checks for your own recipes: create, edit, plan, shopping list, delete
npm run test:e2e:plate      # 21 checks: the full "Plan your plate" family scenario (foods first, recipes, swaps, takeaway, allergies, cupboard, nutrition, reopen, layouts)
npm run test:e2e:journeys   # 14 phone-sized journeys: resize plans, change one dinner, saved meals, sharing, takeaway nights, shop mode, upgrade from older data
```

`tests/e2e.cjs` uses the `playwright` package. If it isn't installed, run `npm i -D playwright && npx playwright install chromium`.

## Using it on your phone

The app is published as a private claude.ai artifact. Open its link on your phone while signed in to Claude.
- Your data stays in that phone's browser.
- Use **Settings → Export backup** regularly. On claude.ai you'll be asked to confirm each save.
- Inside claude.ai there is no Print button and no offline mode. Host the `dist/` folder on any HTTPS site to get those back.

## Using the app

The five main sections are **Home · Plan · Saved · Shopping · Family**. Settings is the ⚙️ in the top bar.

1. **Home**: create your household (country defaults to Ireland). Afterwards, Home shows tonight's dinner, your plan at a glance, shopping progress and your saved meals.
2. **Family › People**: add each person's name, age, optional sex, **allergies**, **intolerances**, dietary requirements, disliked foods and (adults only) optional nutritional preferences. Allergies and intolerances are strict rules that are never relaxed.
3. **Family › Food likes & dislikes**: browse or search the catalogue (partial names work, e.g. "zucch" finds Courgettes). Mark foods **Like**, **Dislike** or **Exclude**, rank your favourites, and add your own foods.
4. **Build your week — plan your plate** (Plan › 🍽 **Build your week**, also on Home): the main way to plan.
   * **Days**: start date, number of days and how many people are eating each day.
   * **Mains**: tap a picture tile for each day (chicken, beef, pork, lamb, turkey, duck, fish, salmon, tuna, prawns, seafood, eggs, vegetarian, vegan). Meats offer optional cuts or products, such as bacon, ham or sausages for pork. Takeaway night and Nothing planned are here too.
   * **Sides**: say how often you'd like rice, pasta, potatoes and so on, then **Share them across the week**. The app avoids the same side two days running. Or set each day yourself.
   * **Veg**: choose the week's vegetables, share them across the days or pick per day. Counts show how often each is used.
   * **Recipes**: see each day's plate (e.g. Monday: Chicken | Rice | Broccoli | Carrots) and tap **✨ Find my recipes**.
     * You get two different ideas per day that use those foods and are always safe for everyone eating.
     * Choose, view, save or share an idea, ask for a **New recipe for Tuesday**, search, write your own with those foods, or swap days with ↑ ↓.
     * When nothing suits, the app explains why. Allergy rules are never relaxed.
   * Every step is optional: skip anything and you still get safe ideas.
   * Back in the plan, each day shows its foods, with **Edit foods**. Ideas update straight away, and a chosen dinner is never replaced without asking.
   * Plan › **"or let us suggest dinners straight away"** still makes a whole plan in one tap: choose a start day and 3, 5, 7, 10, 14 or any number of days, then **Plan dinners**.
5. **Plan**: each day offers two ideas; tap **Choose**. and 3, 5, 7, 10, 14 or any number of days, then **Plan dinners**. Each day offers two ideas; tap **Choose**.
   * **Change** on any day: other ideas, search the recipes, pick from your saved meals, or make it a takeaway night. Only that evening changes.
   * **👥** on a day: who's eating, guests and portions to cook.
   * **⋯ More** on a day: move the meal to another day, takeaway night, cook instead, leave unplanned.
   * **Dates & length**: change the start date or number of days without losing anything already planned.
   * **⋯ More** at the top: share or save this week, start a new plan.
6. **Takeaway nights**: pick the type (Chinese, Indian, Chipper, Pizza…), optionally the restaurant and your usual order, or one of your favourite takeaways. They're never added to the shopping list. If someone has allergies, you're reminded to check with the restaurant.
7. **Saved**: your saved meals (search, filter, "we loved it", add to any day, share), your favourite takeaways (with phone, website and usual order) and saved weekly plans you can reuse.
8. **Shopping**: tap **🛒 Shopping list** in the plan. Ingredients from your chosen dinners are scaled to portions and combined.
   * The list is split into **Main shopping items** (your proteins, sides and vegetables) and **Additional recipe ingredients**.
   * **🧂 Add cupboard items** sets up staples such as oils, salt, pepper, garlic, stock, herbs and spices. **Use the suggested staples** gives you a starting list.
     * For each staple choose one: *usually have at home*, *add to every list*, *only add when running low* or *don't add automatically*.
     * Mark how much is left: *have plenty*, *running low* or *need to buy*. Running low or need to buy puts it on the list, tagged "cupboard".
     * Staples you have at home are left off and listed as "assumed at home this week".
   * **Shop** view is a compact checklist for the supermarket: tap a row to tick it off, with undo.
   * **Full list** lets you edit quantities and sections, add items, export, copy or print.
9. **Recipes**: 83 family dinners with scaled ingredients, method, allergens and a per-person suitability check. **Save**, **Share**, **🛒 Add ingredients to shopping list**, customise the ingredients or add your own photo. Each recipe has a **nutrition estimate**: energy, protein, carbohydrate, fat, fibre, saturates, sugars and salt, per serving or for the whole recipe.
10. **Own recipes** (Recipes › Own recipes › **＋ Add your own recipe**): add your family's dinners with ingredients chosen from the food list and a step-by-step method.
   * The app works out allergens and diets, suggests your recipes in the planner (only when safe), and puts their ingredients on the shopping list.
   * You can edit or delete them at any time.

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
* A catalogue of 155 foods across the four required categories, with aliases, allergens, parent groups, shop sections and pack sizes.
* Flexible planner with takeaway nights, saved meals and weeks, sharing, and a supermarket-ready shopping mode (see CHANGELOG 1.2.0).
* 83 complete recipes. Each has a description, main protein, ingredients by role with quantities for a stated number of servings, prep and cook times, difficulty, a method, and derived dietary tags, allergens and components. Most are Irish and European family favourites.
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
* **Plan your plate** (1.4.0): foods-first planning with picture tiles, side and vegetable sharing across the week, plate-matched recipe suggestions, cupboard staples and a split shopping list.
* **Nutrition estimates** calculated from each recipe's quantities.
  * They use a documented local table of typical values per 100 g, rounded from USDA FoodData Central and UK CoFID (`src/data/nutrition.ts`).
  * Every built-in recipe is fully covered. Foods without data are listed, never guessed.
  * They are always labelled as estimates and are not medical advice.
* Favourites, dashboard summary, next dinner, progress, quick links.
* IndexedDB persistence across refreshes and restarts. If storage fails, a banner appears and the app falls back to an in-memory session.
* JSON export and validated import, plus reset.
* PWA: a web manifest and icons, and a service worker that precaches the built app, so it works fully offline after the first visit (verified with the network switched off).

## Known limitations

* **Images**: the app doesn't ship real photographs, because there is no image API and none could be bundled with clear licensing. Foods and recipes use illustrated "plate" tiles, and every image is labelled with its name. You can add your own photos to custom foods and recipes; they are resized and stored on the device.
* Allergen data reflects typical Irish supermarket products. Brands differ, so always read the label. The app is not a medical or dietetic service.
* Guests' allergies aren't known to the app, and the planner reminds you of this.
* Dinner is the only meal planned (Version 1). The app supports one active household per device.
* Food tiles use illustrated emoji artwork (an animal for each meat), not photographs, because no licensed image source can be bundled.
* Nutrition figures are estimates from typical values and don't account for cooking losses or specific brands.
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
