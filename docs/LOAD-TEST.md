# Load test

Why: every capacity claim in [SYSTEM-DESIGN.md](SYSTEM-DESIGN.md) and [SCALE-PLAN.md](SCALE-PLAN.md) is a guess until this has run. It simulates employees scanning and kiosks polling against **staging** and reports latency and errors. It creates its own throwaway organization and deletes it afterwards.

## Safety

- **Staging only.** The script refuses to start if the service account belongs to the production project (`checin-d172e`). Test people are created with that key, so a production key would put fake employees into real data.
- Every secret comes from environment variables. Nothing is written to disk. Do not paste these values into a PR, issue or chat.
- Run it when nobody else is testing on staging, so the Firestore usage numbers below mean something.

## Run

Set these in your terminal (staging values from your `.env`, not production):

| Variable | What |
|---|---|
| `LOADTEST_BASE_URL` | The staging site, e.g. the staging Vercel URL |
| `FIREBASE_SERVICE_ACCOUNT` | Staging service-account JSON (raw or base64) |
| `FIREBASE_WEB_API_KEY` | Staging web API key (the same value as `VITE_FIREBASE_API_KEY`) |

```bash
npm run loadtest -- --employees 50 --kiosks 2 --ramp 60
```

| Option | Meaning | Default |
|---|---|---|
| `--employees` | Simulated employees | 50 |
| `--kiosks` | Simulated entrance tablets (each polls like the real kiosk) | 2 |
| `--ramp` | Seconds over which first scans are spread; use `900` for a 15-minute morning rush | 60 |
| `--rounds` | `1` = check in; `2` = check in, then check out after the 60 s cooldown | 1 |
| `--keep` | Leave the test data in place | off |

## Recording the baseline (do this before the scan rewrite, P2)

1. Open Firebase console, staging project, Firestore, **Usage**. Note today's reads and writes.
2. Run the test at 50, then 200, then 1,000 employees (`--ramp 120`, `--ramp 300`, `--ramp 900`).
3. Note the usage again. **Reads per scan = increase in reads / successful scans** (kiosk polling adds reads too: run once with `--employees 1` to see the polling-only cost per minute and subtract it).
4. Paste the output and the usage numbers into the PR that changes the scan path, as "before" and "after".

## Reading the result

- **p95 scan latency** should stay under about 1.5 s at the morning-rush rate. If it climbs as you add employees, find which Firestore read or transaction is serialising.
- **`failed` > 0** with status 429 means the cooldown (expected on `--rounds 2` only if timing is off); 401/403 means a setup problem; 5xx or 0 means the server fell over, which is the finding.
- The kiosk numbers show the cost of polling: requests per kiosk per minute x kiosks.
