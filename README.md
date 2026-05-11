# Pokemon TCG Anti Meta

A local prototype that ranks Pokemon TCG archetypes by how well they perform into the most common LimitlessTCG decks.

## Run

```powershell
npm start
```

Then open:

```text
http://localhost:4173
```

## How It Scores

The anti-meta score is a weighted average of a deck's matchup win rates against the most common decks on Limitless.

```text
score = sum(matchup win rate * opponent meta share) / sum(opponent meta share)
```

The app fetches data through the local Node server so the browser does not run into CORS restrictions.

## Deploy To Vercel

This project is ready for Vercel:

- Static frontend lives in `public/`
- Serverless API routes live in `api/`
- `vercel.json` increases the API timeout for heavier Limitless refreshes

Recommended deployment flow:

1. Push this folder to a GitHub repository.
2. In Vercel, choose **Add New Project** and import that repository.
3. Leave framework preset as **Other**.
4. Leave build command empty.
5. Leave output directory empty.
6. Deploy.

The public URL will serve the same app and use the Vercel API routes:

```text
/api/rankings
/api/decks/[slug]
```

The API responses use Vercel edge caching for 10 minutes with stale revalidation.

## Notes

- The app uses live LimitlessTCG pages and caches responses in memory for 10 minutes.
- Keep candidate and meta deck counts moderate if you want fast refreshes.
- This is designed for small-group use. A larger public deployment should add stricter caching and use the official Limitless API where available.
