# Image licences

Every photo on the ChecIN website and in the app must have a row here **before it is merged**: where it came from, who made it, and under what licence. A test (`scripts/tests/image-licences.test.mjs`) fails the build if a photo is added to `public/images/` without an entry.

**Rules for adding a photo**
- Only photos we own, photos we have **written consent** for, or photos under a licence that allows commercial use on a website.
- Never take a picture from another company's website or template, and never hot-link a picture from another site.
- Never use a photo to suggest the person in it is a customer, uses ChecIN, or endorses it. No names, no quotes, no "customer" captions on stock photos.
- Compress to WebP (under about 150 KB each), host it ourselves in `public/images/`, and give every use a plain-language description (alt text).
- No statistics we have not measured.

## Stock photos: Pexels
**Licence:** the [Pexels licence](https://www.pexels.com/license/) (checked 2026-10-19). All photos are free to use, including for commercial use; attribution is not required (credit is given below anyway). They may be modified. **Not allowed:** showing identifiable people in a bad or offensive light, selling unaltered copies as prints or products, and implying endorsement or association by the people or brands shown.

Downloaded on **2026-10-19** at 1600 px wide from Pexels, then resized and converted to WebP. The picture content is unchanged (no crops that change its meaning).

| File in `public/images/landing/` | Pexels photo | Photographer | Description (alt text) | Intended use |
|---|---|---|---|---|
| `checkin-phone.webp` | [woman standing beside glass wall using phone](https://www.pexels.com/photo/woman-standing-beside-glass-wall-using-phone-9479825/) (ID 9479825) | Monstera Production | A woman in a white shirt checks her phone beside a large window. | Hero or "one-tap check-in" |
| `team-lagos-office.webp` | [casual office meeting in Lagos, Nigeria](https://www.pexels.com/photo/casual-office-meeting-in-lagos-nigeria-30688593/) (ID 30688593) | Ninthgrid | A group of colleagues talking together in an office in Lagos. | "Live team view" |
| `team-laptop.webp` | [women smiling at the camera](https://www.pexels.com/photo/women-smiling-at-the-camera-3894376/) (ID 3894376) | PICHA Stock | Four women in colourful outfits gathered around a laptop. | "Built for every team" |
| `health-nurses.webp` | [group of African nurses in uniform and hijab](https://www.pexels.com/photo/group-of-african-nurses-in-uniform-and-hijab-34605560/) (ID 34605560) | Abdulkadir muhammad sani | Four nurses in matching blue uniforms and white headscarves. | Clinics and health teams |
| `manager-tablet.webp` | [African American man speaking on phone](https://www.pexels.com/photo/african-american-man-speaking-on-phone-3965221/) (ID 3965221) | Andrea Piacquadio | A smiling man holds a tablet in one hand and a phone to his ear. | Manager with a tablet |

## Our own screenshots
Captured on 2026-10-19 from ChecIN's own screens, rendered with made-up sample people and numbers (no real customer data). Owned by us; no licence needed.

| File in `public/images/product/` | What it shows | Source |
|---|---|---|
| `dashboard.webp` | The manager dashboard Today view: present, late, away and absent counts and the late, not-arrived and work-from-home lists. | The real Today panel with sample data |

| `kiosk-code.webp` | The entrance tablet's check-in screen with its QR code. | The real kiosk screen with a made-up sample code (cannot check anyone in) |
| `kiosk-pairing.webp` | The tablet setup screen taking a one-time pairing code. | The real kiosk screen with a made-up sample code |

| `../share-card.jpg` (in `public/`) | The picture shown when a ChecIN link is shared: our logo, the headline and the dashboard screenshot. 1200 x 630. | Made by us from our own logo and the real Today panel with sample data |

## Our own photos
None yet. When we take photos of our own team or a partner workplace, add a row here with the date, who took it, and where **written consent** from every identifiable person is kept.

## Not for use
Pictures that were on the landing page before 2026-10-19 came from another company's website template and were **removed**. Do not reuse them.
