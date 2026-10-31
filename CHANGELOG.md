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
