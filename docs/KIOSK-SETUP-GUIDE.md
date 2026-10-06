# Setting up the entrance tablet so it survives power and internet cuts

For whoever looks after the lab's check-in tablet. No technical knowledge needed.

## What to use
- **A small tablet or an old phone**, not the smart board. A tablet has its own battery, so the code stays on screen when the power goes out. The smart board is the wrong device for this job.
- **A power bank** to charge it during a long cut (or keep it plugged in, with the battery as backup).
- **Its own internet:** a SIM with data, or a phone set up as a hotspot (kept on a power bank). When the lab's power is out the router is usually off too, so the tablet must not depend on it.

## One-time setup
1. Open the tablet's browser and go to the kiosk page: `<your site address>/kiosk`.
2. In **Settings** on the ChecIN dashboard, press **Generate Pairing Code**, then type that code into the tablet. The tablet remembers it. This only needs doing once, or after a revoke.
3. Make the kiosk page the browser's **home page**, or add it to the home screen, so it opens easily after a restart.
4. If the tablet has a setting like **"turn on when plugged in"** or **"auto power on"**, switch it on, so it comes back by itself after a full power cut.
5. In the tablet's display settings, set **screen timeout to the longest** option, and switch off battery-saver. (The kiosk page also asks the screen to stay awake.)
6. Put it where people can reach and scan it, at the entrance, with a stand if possible.

## What the screen can show
| You see | What it means | What to do |
|---|---|---|
| A QR code | Working normally | Nothing |
| **"Waiting for internet. Check-in is paused."** and no QR code | The tablet cannot reach the server | Check the tablet's data or hotspot. It resumes by itself within seconds of the connection returning |
| **"Token Minting Paused" with Re-pair** | The tablet's pairing was revoked or replaced | Press **Re-pair** and enter a new pairing code from Settings |
| A black or sleeping screen | The tablet's screen turned off or the battery is flat | Wake it, charge it, and reopen the kiosk page if needed |

The QR code is hidden on purpose when the tablet cannot refresh it. A code that cannot refresh stops working within about 30 seconds, and a code on screen that no longer works would only cause failed scans.

## Test it once (2 minutes)
1. With the kiosk showing a QR code, turn the tablet's **Wi-Fi and data off**.
2. Within about 20 seconds the QR code should disappear and say **"Waiting for internet"**.
3. Turn the connection **back on**. A fresh QR code should appear within a few seconds, with no refresh needed.
4. Scan once with a test employee account to confirm check-in works.

## If check-in is impossible
If neither the tablet nor employees' phones have any internet, check-in cannot work. That is by design: the server must confirm each scan. Ask the manager to note who was present, so attendance can be added later (a manual-entry feature is planned).
