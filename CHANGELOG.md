# Change log — Family Food Planner

Every change made in response to feedback is recorded here, newest first.
The version number is shown in the app under **Settings → About & safety**.

Each feedback entry records:
- **Feedback**: what you reported, in your words.
- **Problem**: what was actually going wrong, or what was missing.
- **Change**: what was changed and where.
- **Knock-on effects**: other features affected, and how they were protected.
- **Data**: whether saved household data was affected (it is always preserved).
- **Tested**: how the change was verified.

---

## 1.4.0 — Plan your plate: choose your foods first, find recipes second

- **Feedback:** "Major meal planning workflow upgrade — Plan Your Plate: choose your foods first, discover your recipes second."

- **Change:**
  - **Build your week** (new page, `#build`): the main planning path, linked from Home and the planner. It has five steps.
    1. **Days**: start date, number of days (7 by default) and people eating per day.
    2. **Mains**: picture tiles with an animal for each meat (🐔 🐄 🐖 🐑 🦃 🦆), plus fish, salmon, tuna, prawns, seafood, eggs, vegetarian, vegan and other.
       - Meats offer optional cuts and products: bacon, ham, sausages and chorizo are pork, for example.
       - Takeaway night, Nothing planned and Not decided yet are available on every day.
    3. **Sides**: weekly counts (e.g. rice ×2, pasta ×2, potatoes ×1) shared across the days.
       - The same side is never used two days running.
       - Main food and side pairs that have recipes are preferred.
       - Each day can be set by hand, and tiles show how often each side is used.
    4. **Veg**: choose the week's vegetables and share them across the days, or choose per day. Usage counts are shown.
    5. **Recipes**: a plate overview for every day (Monday: Chicken | Rice | Broccoli | Carrots), then **✨ Find my recipes**.
       - Two genuinely different ideas per day that use that day's main food, preferring the chosen side and vegetables.
       - Each idea can be chosen, viewed, saved or shared, with kcal per serving shown.
       - Per day: **New recipe for Tuesday**, Search, **Write my own with these foods**, and swap with the day before or after.
       - If you've already chosen some dinners, it asks before replacing them.
  - **Safety:** allergy, intolerance and diet rules are never relaxed. When no recipe with the chosen food suits everyone, the day explains why and shows other safe ideas.
  - **Planner:**
    - Each day shows its foods with **Edit foods**, a tile sheet for main food, side and vegetables.
    - If no dinner is chosen, the ideas update immediately. A chosen dinner is never overwritten: you're asked whether to find new ideas or keep it.
    - Days whose chosen dinner no longer matches their foods show a notice with **See matching recipes**.
    - **Change › Ideas** shows "Based on your foods", a **New recipe for <day>** button and **Write a recipe with these foods**, which opens the recipe editor with those ingredients filled in.
    - Moving or swapping a meal moves its foods with it.
  - **Shopping list:** split into **Main shopping items** (proteins, sides and vegetables, plus foods chosen for plates) and **Additional recipe ingredients**, in both Shop and Full views.
  - **Cupboard staples** (🧂 **Add cupboard items** on the shopping list):
    - A suggested list: oils, salt, pepper, garlic, onions, flour, cornflour, sugar, honey, butter, stocks, herbs, spices, soy sauce, tomato purée, ketchup and vinegar.
    - Each staple has a handling mode: usually have at home, add to every list, only add when running low, or don't add automatically.
    - Each staple has a stock level: have plenty, running low, or need to buy.
    - Staples to buy are tagged "cupboard". Staples at home are listed as "assumed at home this week". The list updates as you change them.
    - Nothing changes until you set staples up.
  - **Nutrition estimates:**
    - A card on every recipe, per serving or for the whole recipe: energy, protein, carbohydrate, fat, fibre, saturates, sugars and salt, plus a per-ingredient breakdown.
    - kcal per serving on planned days and suggestions.
    - Calculated from the actual ingredient quantities, using a documented local table of typical values per 100 g (rounded from USDA FoodData Central and UK CoFID) with unit-to-gram conversions.
    - All 83 recipes are fully covered. Foods without data are listed rather than guessed.
    - Clearly labelled as estimates, with no medical advice.
  - **Catalogue:**
    - Six new recipes so common combinations have a match: creamy pork & broccoli pasta, pork meatball pasta, duck with potatoes & parsnips, beef & broccoli rice, sticky chicken drumsticks, salmon & pea pasta.
    - Two new foods: pork mince and chicken drumsticks.

- **Fixed while testing:** the shopping list button on Build your week opened an empty list. It now builds the list first.

- **Knock-on effects:**
  - The engine's ranking takes each day's foods into account. Days without chosen foods behave exactly as before.
  - Saved weeks remember each day's foods.
  - Existing plans and lists keep working: items without a group are treated as main items.

- **Data:**
  - New optional fields only: `PlanDay.plate`, `MealPlan.weekVeg`, `FoodPreferences.staples`, `ShoppingItem.kind` and `Food.nutrition`.
  - The catalogue upgrade (seed version 4) adds the new foods and recipes without touching your own.
  - Nothing existing is changed or removed.

- **Tested:**
  - 104 unit tests (24 new), covering:
    - Matching chosen foods to recipes, and the engine's behaviour with chosen foods.
    - Allergies with chosen foods, and households of 1 and 8.
    - Sharing sides and vegetables, edits that never overwrite a chosen dinner, and swaps.
    - Shopping groups, cupboard staple modes, nutrition maths and coverage, and the write-your-own draft.
  - A new 21-step browser scenario (`npm run test:e2e:plate`), on a phone-sized screen:
    - 5 days from Monday with chicken, beef, pork, duck and vegetarian; rice ×2, pasta ×2, potatoes ×1; broccoli, carrots, parsnips and peas.
    - Find recipes, change Tuesday to chicken and get a new recipe, then change a chosen day's side and keep its dinner.
    - Swap days, a takeaway night, and salmon with a fish allergy at the table.
    - Split shopping list, the olive-oil staple behaviour, nutrition, write-your-own, and closing and reopening.
    - Layouts at 390 px and 1280 px, and a partial plan with nothing chosen.
  - All earlier suites still pass: 18 + 14 + 14 + 8 checks.

---

## 1.3.0 — Your own recipes

- **Feedback:** "Give me the option to add my own recipes. The ingredients should also be on the list. Beside all recipes add Own Recipes."
- **Change:**
  - **Recipes page:** **All recipes** and **Own recipes** tabs side by side, with a **＋ Add your own recipe** button.
  - **Add your own recipe** form:
    - Name, short description, a picture (choose one, or add your own photo), type of food.
    - Serves, preparation and cooking time, difficulty.
    - Ingredients and the method (one step per line).
  - **Ingredients come from the food list:**
    - Each one is checked for allergies and goes on the shopping list.
    - Each food starts with the unit and amount the catalogue normally uses, so quantities combine with other dinners.
    - **"Can't find it? ＋ Add a new food"** creates a food on the spot and adds it to the recipe.
  - **Live allergens and suitability panel:**
    - Shows what the recipe contains, which diets it suits, and whether each family member can eat it.
    - A food whose allergens haven't been checked marks the recipe **Needs review**, and it won't be suggested to anyone with allergies, intolerances or diets until that food is checked.
  - **Unsaved new recipes** are kept as a draft on the device, with a "Start again" option.
  - **On your own recipe's page:** **✎ Edit recipe** and **Delete recipe**. Deleting asks first, takes it out of the meal plan (that day then needs a dinner choosing), saved meals and shopping list.
  - **In the planner:**
    - Own recipes are suggested alongside the built-in ones, always within allergy and diet rules.
    - They're gently preferred and labelled "Your recipe".
    - You can choose one for any day via **Change › Search** or **Saved**.
  - **Shopping list:**
    - A planned own recipe's ingredients are added and combined like any other dinner.
    - New **🛒 Add ingredients to shopping list** on every recipe page adds that recipe at the chosen portions without planning it. It shows "On your list (n)".
    - The list shows "Also on this list: …" with ✕ to take a recipe back off (with Undo).
    - Ingredients shared with planned dinners stay on one combined line.
- **Knock-on effects:** none for built-in recipes. "Customise ingredients" is unchanged for them; own recipes use Edit instead.
- **Data:**
  - Own recipes are stored with the other recipes, so they're included in backups and kept through catalogue upgrades.
  - The shopping list gains an optional list of recipes added directly.
  - No migration needed; existing data is unchanged.
- **Tested:**
  - 80 unit tests pass, 6 of them new: allergens and diets worked out from ingredients, never suggested when unsafe, review flag for unchecked foods, default amounts, form checks, and combining on the shopping list.
  - New phone-sized browser test `tests/e2e-own-recipes.cjs`: 8 / 8 pass, covering create, validation, new food, review flag, edit, plan, shopping list, add-to-list with undo, draft, and delete.
  - All earlier browser suites still pass.

## 1.2.0 — Product vision upgrade: flexible planner, saved meals, takeaway nights, shop mode

**Brief:** Great food. Happy families. Dinner sorted. A busy parent should be able to plan the week's dinners and have the shopping list ready in a few minutes.

### Where to find things
- **Navigation:** Home · Plan · Saved · Shopping · Family. Family holds two tabs: *People* and *Food likes & dislikes*. Recipes is reachable from Home, the plan and Saved. Settings is in the top bar.
- **Saved (My Saved Meals):** three tabs, *Meals*, *Takeaways* (your favourite takeaways) and *Weekly plans*.

### Meal planner (rebuilt for editing)
- **Week at a glance:**
  - "5 of 7 days sorted", with a link to the days still to choose.
  - A day strip showing dinners ✓, takeaway nights (their emoji) and undecided days (?).
- **Dates & length:**
  - Choose 3, 5, 7, 10 or 14 days, or any custom number up to 31.
  - Adding days keeps every existing day untouched and gives only the new days fresh ideas.
  - Shortening lists exactly which planned meals will be removed before asking, and can be undone. Undecided days are removed without a prompt.
  - Changing the start date moves the dates and keeps the dinners in order.
- **Each day card:** day and date, dinner name, picture, short description, prep + cook time, portions, and a clear status (Dinner sorted / Choose a dinner / Takeaway night / Nothing planned).
- **Day actions:**
  - **Change** opens one panel with *Ideas* (the alternatives plus "Show two more ideas"), *Search* (the whole catalogue, unsafe recipes hidden), *Saved* (saved meals, with a reason if one doesn't suit that day) and *Takeaway*.
  - **Save** and **Share** sit on the card.
  - **⋯ More** offers Move to another day (swaps if needed), Make it a takeaway night, Cook a dinner instead, Search recipes, Pick from saved meals, We loved this one (past days) and Leave unplanned.
  - The **👥** button sets who's eating, guests and portions for that day.
- **Plan actions:** Shopping list, Fresh ideas for undecided days (chosen dinners are kept), and under ⋯ More: Share this week, Save this week, Start a new plan, Delete plan.
- **Undo instead of confirmations:** simple changes save immediately with an Undo button. Only removing planned meals or replacing the whole plan asks first.
- **Only what you touch changes:** changing one evening never regenerates the rest of the week.

### Saved meals and sharing (new)
- One tap ♡ Save on any dinner idea, plan day or recipe, without saving a whole week.
- Saved meals: search; filter by *All*, *Loved* or *Not in this plan*; "We loved it" marker; add to any day (safety-checked); share; remove with Undo.
- Weekly plans: save a week as a template and reuse it from any start date. Saved recipes that no longer suit everyone are replaced with safe new ideas, and you're told which.
- **Share** uses the phone's share sheet where available, including the recipe photo if you've added one; otherwise it copies a text summary. If neither works, the text is shown ready to copy.
  - The summary includes the recipe name, description, times, servings, ingredients with quantities, method, dietary tags, allergens and a label reminder.
  - It never includes household names, profiles or preferences.
- Share this week sends the list of dinners only.

### Takeaway nights (new)
- Any day can become a takeaway night, and back to cooking with its recipe ideas restored.
- 14 built-in takeaway types shown as labelled tiles, plus your own types.
- Optional restaurant name and note (e.g. the usual order); a one-tap option saves the place as a favourite.
- **My Favourite Takeaways:** name, type, address, phone (tap to call), website, usual order and notes. Pick a favourite straight from the planner, or plan it for a night from the Saved page.
- Takeaway nights look different (terracotta) and say "not on the shopping list". They add nothing to the shopping list.
- **Safety:** where anyone eating has allergies, intolerances or diets, a takeaway night shows "Ingredients unknown — ask the restaurant about Aoife (milk); Seán (peanuts, tree nuts)". A takeaway is never presented as safe.

### Shopping list for the supermarket
- **Shop view** (the default): a compact checklist.
  - Large tick boxes; the whole row is tappable.
  - Name and quantity only.
  - Collapsible sections showing "n left".
  - Ticked items hide automatically, with Undo; they stay in a "Ticked off" section where they can be unticked. The *Hide ticked items* switch is remembered.
  - Quick "＋ Add an item".
- **Full list view:** everything as before (edit quantities and sections, remove with Undo, add with quantity, unit and section, update from the plan, text/CSV export, copy, print, clear).
- **The app remembers** which view you used.
- **Ten shop sections:** Fruit and vegetables · Meat and poultry · Fish and seafood · Dairy and eggs · Bakery · Dry goods and pasta · Tinned and packaged goods · Frozen foods · Sauces, herbs and spices · Other.
- **Summary at the top:** items, still needed, ticked off, plus a progress bar.
- **Automatic updates:** the list follows changes to the plan unless you've edited plan items by hand, in which case you're asked first.

### Look and feel
- Brand palette: cream #F7F4EC, sage #E9EFE5, terracotta #D9B9A6, forest green #526052, charcoal #343A35.
- Fewer borders, softer shadows and 12–18px corners.
- Home rebuilt around the promise: tonight's dinner, this plan, shopping progress, saved meals and Explore links.
- On phones, messages appear at the top, never covering the button you're tapping, and opening a panel clears them.
- One message at a time.
- The recipe page has Save and Share buttons; the old duplicate heart on the photo was removed.

### Existing features changed
- **Plan controls moved:**
  - "Choose this" → **Choose**.
  - Replace and New suggestions → **Change › Ideas › Show two more ideas**.
  - "Swap with…" → **⋯ More › Move to another day**.
  - "Pick from recipes" → **Change › Search**.
- **Who's eating, guests and portions** moved from each day card into the 👥 panel.
- **"Already have it"** is now **"Got it" / tick off** (same saved data).
- **Food Preferences** moved under **Family › Food likes & dislikes**.

### Data (all existing data preserved)
- **Database version 2:** new stores for takeaway places, takeaway types and saved weekly plans; existing stores untouched.
- **Automatic migration on load and on import:**
  - "skipped" days become *Nothing planned*.
  - The old "Meat and fish" section splits into *Meat and poultry* and *Fish and seafood*, keeping ticks.
  - Custom foods and manual items are kept.
  - Running it twice changes nothing.
- **Backups:** format version 2 includes the new data; version-1 backups still import.
- **Catalogue version 3:** built-in foods are re-sorted into the new sections. Custom foods, photos and customised recipes are kept.

### Tested
- **Unit tests:** 74 passed, including plan editing, takeaways, saved weeks and the version-1 migration.
- **New journey suite** (`tests/e2e-journeys.cjs`, phone size, touch): 14 / 14 passed. It covers all 13 requested journeys, plus reusing a saved week and opening data written by the previous version.
- **Earlier suites** (ported to the new controls): 18 / 18 and 14 / 14 passed.
- **Problems found in testing and fixed:**
  - Messages covered buttons and panel titles on phones.
  - Day buttons wrapped onto two lines.
  - The Saved card overflowed on phones.
  - "⋯ More" menus stayed open after a choice.
  - The recipe page had two save buttons.
  - The planner's top section was too tall on phones.

### Not done
- **Real food photographs:** this environment blocks every external image source, so the app still uses illustrated plates. You can add your own photos to recipes.
- **Public share links** need a server, which the app doesn't have, so sharing sends a text summary (as the brief allows).

## 1.1.2 — + / − buttons on phones, and choosing the number of days

- **Feedback:** "On the planning page… guests and something else… those buttons don't work. There's a plus and minus. And that seems to be the same throughout the app… you have to choose how many days you want it for, so it's important."
- **Problem:** Every + / − control in the app (number of days, guests, portions on each day, portions on recipe pages) is one shared component. The fault couldn't be reproduced in Chrome's phone emulation, where every tap worked. Reviewing the component for real-phone behaviour (especially iPhone Safari, which can't be run in the test environment) found four weaknesses:
  1. **Small buttons:** 36–40px, below the 44px minimum for fingers, so slightly-off taps landed on the number box and opened the keyboard instead.
  2. **Lost quick taps:** two quick taps could be read by iPhones as "double-tap to zoom", swallowing the tap.
  3. **Keyboard in the way:** with the number box's keyboard open, the next tap often only closed the keyboard.
  4. **Typing didn't work:** clearing the box to type a new number snapped straight back to the old value.
- **Change** (`Stepper` in `src/components/common.tsx`, styles in `src/styles.css`):
  - Round 44px − / + buttons with visible press feedback.
  - Double-tap zoom turned off for all buttons and inputs in the app.
  - Pressing − / + closes the keyboard first.
  - Tapping the number selects it, so typing replaces it. You can clear it while typing; leaving it empty falls back to the last valid number.
  - Numbers stay within their limits (1–31 days, 0–20 guests, 1–40 portions).
  - New quick-pick buttons for the plan length: 3, 5, 7, 10 and 14 days.
  - "Portions" renamed "Portions to cook", with a one-line tip on the plan explaining guests and portions.
- **Knock-on effects:** none. Every screen that uses the control gets the fix automatically, and what each control changes is unchanged.
- **Data:** no change to saved data.
- **Tested:**
  - New phone test (iPhone-sized, touch input): single taps, quick double taps, tapping + with the keyboard open, clearing and retyping, limits, day shortcuts, guests adding portions, values saved after reload, recipe-page portions.
  - All 60 unit tests and all browser checks (18 + 14) pass.
  - Not yet confirmed on a real iPhone.

## 1.1.1 — Use the app on your phone

- **Feedback:** "Can I test the app on my phone? No."
- **Problem:** The app only ran inside the development workspace (`localhost`), which a phone can't reach.
- **Change:** The built app is published as a private claude.ai artifact, so it opens from a link on your phone while you're signed in to Claude. Four small changes were needed for it to work inside claude.ai's secure frame:
  - **Page addresses:** they now use plain names (`#planner`, `#recipe-irish-stew`, `#app-settings`). Old `#/planner`-style links still work.
  - **Backups and list exports:** these go through claude.ai's save prompt (the `downloads` capability). If saving isn't possible, the backup is copied for you to paste into a note or email.
  - **Print button:** hidden where printing is blocked.
  - **Offline mode:** not set up inside claude.ai, because it blocks the offline helper (service worker).
  - Also, the top bar respects the phone's notch and safe area.
- **Knock-on effects:** none on a normal browser tab. Printing, normal downloads and offline mode work exactly as before when the app is hosted normally.
- **Data:** no change to saved data. The phone version keeps its own data in that phone's browser, separate from any other copy, so move data between copies with Export and Import.
- **Tested:**
  - All 60 unit tests and both browser suites (18 + 13 checks) pass.
  - In a sandboxed frame that imitates the claude.ai frame, routes, saving, the hidden Print button and data surviving a reload were all checked.
  - Not yet tested on a real phone.

## 1.1.0 — Quality review (QA round)

**Fixes**
- Creating a new meal plan now replaces the old plan. Previously the old plan stayed in storage and was still shown.
- Excluding the food "Fish" now also excludes recipes with hidden fish (Worcestershire sauce). Oyster sauce is now linked to seafood in the same way.
- Choosing a specific food such as "Milk" as an allergy now offers a one-tap "Avoid all milk", so butter, cheese and cream are covered too.
- Category chips keep a fixed order after a reload.
- After an update installs, the app reloads once so the new version is used straight away.

**Recipe generator**
- Added 16 recipes for gluten-free, dairy-free, vegetarian and vegan households (77 in total).
  - Coeliac plus a child with a milk allergy: 5 → 13 suitable recipes.
  - Vegetarian: 15 → 22.
  - Vegan: 7 → 10.
- The two options for a day now differ in protein type, cuisine and main carbohydrate where possible.

**Shopping list**
- Large spoon totals are shown in ml.
- Garlic shows bulbs and celery shows heads ("≈ 1 bulb", "≈ 1 head").
- Celery is listed as sticks.
- The leek soup uses cooked ham instead of a raw bacon joint.

**Design**
- Phone layout: shopping items use the full width.
- The unchosen dinner option no longer looks disabled.
- Less-used day actions are now under "⋯ More".
- Intolerances show the common four, with "Show all 14 allergens".
- Food tiles are shorter on phones.
- Vegetarian recipes show "Main ingredient" instead of "Main protein".

**Data**
- The built-in catalogue is upgraded automatically (catalogue version 2). Households, members, custom foods, customised recipes, favourites, plans and shopping lists are all preserved; this was tested with data created on 1.0.0.

**Tests**
- Unit tests: 21 → 60 (generator quality across seven household types).
- New extended browser QA suite: 13 checks.

## 1.0.0 — First working version
- Household and member profiles, food catalogue with custom foods and ranking, two-option meal planner, recipe library, combined shopping list, favourites, JSON backup and restore, offline PWA.
