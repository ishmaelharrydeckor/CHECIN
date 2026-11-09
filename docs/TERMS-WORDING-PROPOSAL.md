# Terms of Service: proposed plain-language wording

**Status: proposal for the owner to read and approve. The live page (`/terms`) is unchanged.**

I am not a lawyer. Terms of Service are a contract, so unlike the privacy wording, some parts of this one **must be written or checked by a lawyer**: who is liable for what, the limits on that liability, and which country's courts apply. I have marked those parts **[LAWYER]** and have not invented legal wording for them. Lines marked **[CONFIRM]** are business decisions only you can make.

## What is wrong with the current terms

1. **Developer words:** "independent data isolation boundaries", "short-lived cryptographic tokens", "reverse-engineer", "verification endpoints", "server clocks", "SLA".
2. **It promises things that do not exist yet.**
   - **"99.9% uptime" and "SLA".** There is no uptime measurement, and ChecIN depends on Google Firebase and Vercel staying up. A number in a contract is a promise. Take it out unless you can back it.
   - **"terminate their subscription", "active subscription", "30 days following cancellation".** There is no billing or subscription system in the product today. The 14-day trial is only a label stored when an organization signs up, and nothing enforces it. Terms that talk about a subscription describe a system that is not built. The 30-day export window is also not implemented by anything.
3. **It is missing things every business agreement needs:** what people may and may not do with the service, who owns the records, what happens if someone breaks the rules, what the service costs, how the terms change, and the legal basics (liability, governing law).
4. **It speaks to "users" who never agreed to it.** Employees who check in did not sign these terms. The organization agrees, and is responsible for its people. The plain wording says so.
5. **The first section is out of date.** Sign-up now shows "By continuing, you agree to the Terms of Service and Privacy Policy", so the terms should line up with that.

## Proposed text

> **Terms of Service**
> Last updated: **[CONFIRM date]**
>
> ### In short
> - ChecIN records when people check in and out of your workplace, using a code on a tablet at your entrance.
> - The organization that signs up is responsible for its account, its tablets and its people. Employees use ChecIN because their organization asked them to.
> - Do not check in for someone else, and do not copy or interfere with the codes on the tablet.
>
> ### 1. Who these terms are between
> These terms are between ChecIN and the organization that creates an account (**"your organization"**). By creating an organization account, pairing a tablet, or accepting an invitation to join, you agree to these terms on behalf of your organization. **[LAWYER]** confirm the wording that makes the person signing up able to bind the organization, and the real company name. The page currently says "ChecIN Technologies Inc." and I could not verify it.
>
> ### 2. Accounts and who does what
> - **Administrators** manage the organization. They set up entrances, pair and revoke tablets, and decide who is invited.
> - **Managers** can invite people to their own team and see that team's records.
> - **Employees** check in and out and see their own records.
>
> Your organization is responsible for keeping its accounts secure, for the people it invites, and for removing access when someone leaves. If a tablet is lost or stolen, an administrator should revoke it in Settings straight away.
>
> ### 3. How check-in works, and what is not allowed
> ChecIN trusts the tablet at the entrance. The code on it changes every few seconds. You agree not to:
> - check in or out for someone else, or ask someone to check in for you;
> - photograph, copy, forward or try to work out the code, a pairing code or a tablet's secret, or find ways around the check;
> - use a tablet that has not been paired to your organization by an administrator;
> - use ChecIN to break the law or to harm other people or the service.
>
> We may limit or stop access if these rules are broken, if the service is being misused, or if an account looks like it has been taken over. **[CONFIRM]** whether you will warn first and how.
>
> ### 4. Your records
> The check-in, leave, shift and other records belong to your organization. ChecIN keeps them safe and lets you use them for your own attendance purposes. We use them only to run the service. How we handle personal information is in our [Privacy Policy](/privacy), which is part of these terms.
>
> ChecIN records what happens at the entrance and applies the late and early rules your organization sets. **Your organization decides how to use the records, for example in pay or discipline.** Managers and administrators can excuse a late arrival, and ChecIN keeps a record of who did that and why.
>
> ### 5. Keeping the service running
> ChecIN needs an internet connection on the tablet and on the phone to check someone in, because the code has to be confirmed fresh. If a phone is offline, the check-in does not go through and nothing is saved for later. **[CONFIRM]** We work to keep the service available, but we do not promise it will never be interrupted. If you want a promise about uptime, **[CONFIRM]** decide the figure only after you have measured it, and say what you will do if you miss it.
>
> ### 6. Price and payment
> **[CONFIRM: pricing is still being decided.]** Say here what is free, what costs money, how and when you charge, and what the free trial really includes. Do not describe a subscription or a cancellation process until billing is built.
>
> ### 7. Ending your use, and getting your records out
> You can stop using ChecIN at any time. While your organization uses ChecIN, its administrators and managers can export attendance records as CSV, Excel and PDF files. **[CONFIRM]** what happens to the records when an organization stops: how long you keep them, and whether you delete them or hand them back. The current text promises "30 days after cancellation". That is only safe to say once something actually does it. It must match the retention period in the Privacy Policy.
>
> ### 8. Changes to the service and these terms
> We may improve or change ChecIN. If we change these terms we will update the date above. **[CONFIRM]** For changes that matter, we will tell organization administrators before they apply.
>
> ### 9. Responsibility and the law
> **[LAWYER]** Needs your lawyer's wording: what ChecIN is and is not responsible for, the limits on that responsibility, and which country's law and courts apply. Do not leave this out. It is the part that protects you most.
>
> ### 10. Contact
> **[CONFIRM]** A real address that someone reads. The pages currently mention `privacy@checin.com` for privacy and `support@checin.com` for enterprise enquiries, and I could not verify either.

## What I checked in the code (so the text above is true)

| Statement | Checked against | Result |
|---|---|---|
| Administrators set up entrances, pair tablets, invite people | The locations and invite routes | True. Managers can also invite people to their own team |
| Managers see their team, employees see their own records | The access rules and routes | True |
| A lost tablet can be revoked by an administrator | The revoke route and the setup guide | True |
| Codes change every few seconds and only the paired tablet makes them | The kiosk and scan routes | True |
| Check-in needs a connection and nothing is saved for later | The scan design rule and the scan screen | True |
| Late marks can be excused with a reason, and who did it is recorded | The late-excuse feature | True |
| Exports are CSV, Excel and PDF | The exporters | True |
| There is a subscription, billing, a cancellation process | Searched for payment or subscription code | **None.** The 14-day trial is only a label |
| 99.9% uptime | Nothing measures or guarantees it | **Cannot be backed.** Removed |
| Records are exportable for 30 days after cancellation | Nothing implements it | **Not true today.** Marked **[CONFIRM]** |

## What I need from you

1. Approve the plain wording, or tell me what to change.
2. Decide the **[CONFIRM]** items: pricing and trial, what happens to records when an organization leaves, how changes are announced, and the contact address.
3. **Get a lawyer to write sections 1 and 9** (who can bind the organization, liability, governing law). I will not guess at those.
4. Settle the Privacy Policy first. The two documents must agree on how long records are kept.

When it is all settled I will put the approved wording on `/terms`.
