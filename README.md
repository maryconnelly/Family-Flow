# FamilyFlow

A personal planner that runs on your laptop. It puts your Google Calendar, to-dos, meal plan and grocery list in one place.

- **Week**: one card per day showing your Google Calendar events, breakfast/lunch/dinner, and that day's to-dos. Overdue to-dos show up on today's card.
- **To-dos**: as many lists as you like, with optional due dates.
- **Meals**: plan the week and keep a recipe library with ingredients.
- **Groceries**: a list grouped by store section. One click adds the ingredients for the week's planned recipes and combines duplicates (for example, 2 cloves of garlic + 3 cloves becomes 5 cloves).

Your data is saved to `data/familyflow.json` on your computer. It isn't synced anywhere and isn't committed to git, so back up that file if it matters to you.

## Run it

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Connect Google Calendar (one-time setup, ~10 minutes)

The app only asks for **read-only** access to your calendars.

1. Go to https://console.cloud.google.com and create a new project (e.g. "FamilyFlow").
2. **APIs & Services → Library**: search for **Google Calendar API** and click **Enable**.
3. **Google Auth Platform → Branding** (or "OAuth consent screen"): choose **External**, give the app a name, and enter your email.
4. **Audience**: under **Test users**, add your own Google account.
5. **Clients → Create client**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:5173` and `http://localhost:3001`
6. Copy the **Client ID** (ends in `.apps.googleusercontent.com`), then:
   ```bash
   cp .env.example .env.local
   ```
   and paste it after `VITE_GOOGLE_CLIENT_ID=` in `.env.local`.
7. Restart `npm run dev` and click **Connect Google Calendar** on the Week tab.

Google will warn that the app "hasn't been verified." That's expected for a personal app. Click **Continue**.

Notes:
- Events come from every calendar that's checked in Google Calendar. Events you declined are hidden.
- Google sign-in lasts about an hour. When it runs out, click **Reconnect**.

## Run without the dev server

```bash
npm run build
npm start
```

Then open http://localhost:3001.

## Ideas for later

- AI meal suggestions based on how busy each evening is (quick meals on packed days)
- A "pantry staples" list to skip when building the grocery list
