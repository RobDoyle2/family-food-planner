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
