# Cookie and browser storage policy: proposed wording

**Status: proposal for the owner. There is no cookie policy page today, and nothing here is live.** I am not a lawyer: have the final text checked, especially the question of whether a consent banner is needed (**[LAWYER]**). Lines marked **[CONFIRM]** are your decisions.

## What I found by reading the code

| Question | Answer from the code |
|---|---|
| Does ChecIN set cookies? | **No cookies of its own.** The only cookie in the code is a "sidebar state" cookie inside a stock interface component (`ui/sidebar.tsx`) that **nothing imports**, so it never runs. |
| Does it use advertising or analytics tools? | **No.** I searched for analytics, tag managers, session recorders and ad code: none. |
| What does it store in the browser? | Sign-in (kept by Firebase's sign-in library), the menu open or collapsed choice, whether the "Get set up" card was hidden, the **tablet's pairing details** (only on a paired entrance tablet), and cached app files for installing on a phone. |
| Does it load anything from another company? | **Yes: fonts from Google Fonts** on every page. Google receives the visitor's internet address and browser details when a page loads. |
| Will it change? | Yes. **Billing will add a payment provider** that sets its own cookies at checkout. This policy must be updated then. |

**A concrete improvement (recommended):** host the fonts ourselves, so no page contacts Google. That removes the only third-party call, is a known privacy concern in Europe, and lets the policy say "nothing is loaded from another company". It is a small change, but it adds a font package or the font files to the project, so I want your OK first. **[CONFIRM]**

## Proposed text

> **Cookies and browser storage**
> Last updated: **[CONFIRM date]**
>
> ### In short
> - ChecIN does **not** use advertising cookies, tracking cookies or analytics.
> - ChecIN stores a few things in your browser so the service works. Without them you could not stay signed in.
> - **[after fonts are self-hosted]** Nothing on our pages is loaded from another company.
>
> ### What we store, and why
> | What | Why | How long |
> |---|---|---|
> | **Your sign-in** (kept by our sign-in provider, Google Firebase) | So you stay signed in between visits | Until you sign out or it expires |
> | **Your menu choice** (open or collapsed) | To remember how you like the menu | Until you clear your browser's data |
> | **"Get set up" card hidden** | So a card you hid does not come back | Until you clear your browser's data |
> | **An entrance tablet's pairing details** (only on a tablet that has been paired to an entrance) | So the tablet keeps showing the check-in code after it restarts | Until an administrator revokes the tablet |
> | **Saved app files** | So the app opens quickly and can be added to a phone's home screen. These hold no personal information | Until the app is updated |
> | **Notification permission and address** (only if you allow notifications) | To send you notices from your organization | Until you turn notifications off |
>
> ### Cookies
> ChecIN sets **no cookies** of its own at the moment. **[CONFIRM]** When billing is added, the payment provider will set cookies on its payment page. We will list them here before payments start.
>
> ### Other companies
> **[Choose one]**
> - *If fonts are self-hosted:* Our pages do not load anything from other companies.
> - *If not:* Our pages load text styles from Google Fonts. This means Google can see your internet address and browser details when a page loads.
>
> ### Your choices
> You can clear or block browser storage in your browser's settings. Signing out removes your sign-in. If you block storage, you will not be able to stay signed in. Clearing an entrance tablet's storage unpairs it, and an administrator will need to pair it again.
>
> ### Do we ask for consent?
> **[LAWYER]** Storage that is strictly needed for the service to work usually does not need a consent banner, but the rules differ by country and by who visits. Decide with your adviser whether a banner is needed for visitors from where your customers are. If every non-essential item is removed (fonts hosted by us, no analytics), the question mostly goes away.
>
> ### Contact and changes
> **[CONFIRM]** the contact address (see the privacy proposal). We will update this page and its date if this changes.

## What I need from you

1. **OK to host the fonts ourselves** (recommended)?
2. Which **domain** do you own and use for email? The app and its notification address use `checin.app`, but the pages and policies use `checin.com` addresses. Whichever it is, every contact address must match it.
3. A lawyer's view on whether a consent banner is needed.

This should be read together with the Privacy Policy and Terms proposals, and updated when billing is added.
