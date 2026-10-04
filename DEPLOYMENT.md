# ChecIN — Deployment & Manual Testing Runbook

This guide covers everything needed to push the repository to GitHub, deploy to Vercel, and manually test the entire ChecIN system from scratch.

---

## Part 1: GitHub & Vercel Deployment

### 1. Initialize Git & Push to GitHub

In your terminal (PowerShell):

```powershell
# 1. Initialize git
git init -b main

# 2. Add files (.gitignore ensures .env and secrets are safely ignored)
git add .

# 3. Create your initial commit
git commit -m "feat: initial commit of ChecIN workforce attendance SaaS"

# 4. Link your new GitHub repository (replace with your repo URL)
git remote add origin https://github.com/<your-username>/checin.git

# 5. Push to GitHub
git push -u origin main
```

---

### 2. Deploy on Vercel

1. Log into [Vercel](https://vercel.com) and click **"Add New" → "Project"**.
2. Import your `checin` GitHub repository.
3. Configure the **Build & Development Settings**:
   - **Framework Preset**: `Other` (or auto-detected Vite)
   - **Build Command**: `npm run build`
   - **Output Directory**: `.output/public`
4. Under **Environment Variables**, add the following:

| Variable Name | Value Description | Public/Secret |
| :--- | :--- | :--- |
| `NITRO_PRESET` | `vercel` | Required for server routes |
| `VITE_FIREBASE_API_KEY` | `AIzaSyAq_7tINW9Rcfu7X57IfZhmYici4got4nU` | Public |
| `VITE_FIREBASE_AUTH_DOMAIN` | `checin-d172e.firebaseapp.com` | Public |
| `VITE_FIREBASE_PROJECT_ID` | `checin-d172e` | Public |
| `VITE_FIREBASE_STORAGE_BUCKET` | `checin-d172e.firebasestorage.app` | Public |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `938492880362` | Public |
| `VITE_FIREBASE_APP_ID` | `1:938492880362:web:d9065bc93f7e8107a73e93` | Public |
| `FIREBASE_PROJECT_ID` | `checin-d172e` | Secret |
| `FIREBASE_SERVICE_ACCOUNT` | *(Paste the base64 string from your local `.env`)* | Secret |
| `VAPID_PUBLIC_KEY` | *(Paste from your local `.env`)* | Public |
| `VAPID_PRIVATE_KEY` | *(Paste from your local `.env`)* | Secret |
| `VAPID_SUBJECT` | `mailto:admin@checin.app` | Public |
| `VITE_VAPID_PUBLIC_KEY` | *(Paste from your local `.env`)* | Public |

5. Click **Deploy**. Vercel will build the frontend assets and serverless API endpoints.

---

## Part 2: Step-by-Step Manual Verification Checklist

Once deployed (or locally on `http://localhost:3001`), follow this sequential checklist to test every capability individually:

### 1. Manager Onboarding & Authentication
1. Navigate to `/auth` (or click **"Sign In"** / **"Get Started"** on the landing page).
2. Choose **"Continue with Google"** or create an account with email/password.
3. Upon first login, you are assigned the `org_admin` role for your company tenant.
4. You are directed to `/dashboard`.

---

### 2. Entrance Location & Kiosk Pairing
1. Go to **Settings** (`/settings`) from the sidebar.
2. In the **Entrance Terminals** card:
   - A new organization starts with no locations. Type a name (e.g. "Main Entrance") and click **"Add Location"**.
   - Click **"Generate Pairing Code"**.
   - A modal displays a single-use 6-digit code (e.g. `CHK-842714`) valid for 10 minutes.
3. Open a separate browser window or tablet at `/kiosk`:
   - Enter the pairing code from step 2.
   - Click **"Authorize Terminal"**.
4. The kiosk transitions into the **Entrance Display Mode**:
   - Digital clock and current date.
   - Dynamic SVG QR code that regenerates every 15 seconds.
   - Progress bar showing the countdown to the next token rotation.

---

### 3. Employee Scan & Live Punch Verification
1. On your phone, sign in as an employee and open `/scan`.
2. Point the phone camera at the rotating QR code on the kiosk screen.
3. **Observe the simultaneous triple-screen reaction**:
   - **Phone Scanner**: Shows a haptic confirmation: `"Clocked IN · Welcome to work!"`.
   - **Entrance Kiosk**: Flashes a high-visibility welcome toast at the top: `"👋 Welcome, Alex Mensah"`.
   - **Manager Dashboard**: The live table immediately prepends the check-in event at the top with timestamp, and the **"Present Today"** metric counter increments.

---

### 4. Clock-Out Verification
1. On the same scanner, scan again after more than a minute (there is a 60-second cooldown between scans).
2. The system detects the employee's last status was `IN` and automatically performs a **Clock OUT**.
3. **Observations**:
   - Phone flashes: `"Clocked OUT · See you tomorrow!"`.
   - Kiosk flashes: `"👋 Alex Mensah — Goodbye, see you tomorrow!"`.
   - Manager Dashboard updates the row status to `Clocked OUT` and decrements the present counter.

---

### 5. Staff Management & Reports
1. On the **Dashboard**:
   - Test the search bar (filter by an employee's name).
   - Test department and status filters (`Present`, `Checked Out`).
   - Click **"Export CSV"** to download the official timesheet audit report.
2. In **Team Invites**:
   - Click **"Invite Member"**, enter an email, and select role (`Manager` or `Employee`).
   - The invite link is generated with an expiring, single-use token.
