# Font licences

ChecIN's text is set in two typefaces. Both are free to use, including commercially, under the **SIL Open Font License, Version 1.1** (https://openfontlicense.org). The files are served from our own address (`public/fonts/`) so a visitor's browser never contacts another company to show our pages.

| Typeface | Designer | Files in `public/fonts/` | Used for |
|---|---|---|---|
| **Inter** | Rasmus Andersson | `inter-latin.woff2`, `inter-latin-ext.woff2` | Almost all text (weights 300 to 800) |
| **Geist** | Vercel and Basement Studio | `geist-latin.woff2`, `geist-latin-ext.woff2` | The `.font-geist` style (weights 400 to 600) |

**What the licence lets us do:** use, copy and embed the fonts in a website or app, including for money, as long as the fonts are not sold on their own and the licence notice stays with them. We have not changed the fonts.

**Where they came from:** downloaded on 2026-10-20 from Google Fonts (https://fonts.google.com), which distributes both under the same licence. Only the **latin** and **latin-ext** alphabets are included (English, and letters used in Ghanaian names such as the open e and open o). Add another alphabet only if a customer needs one.

**Rules:**
- Never load a font from another company's address. A test fails the build if any page does.
- A new font needs a row here, with its licence, before it is added.
- Keep every file small (a test enforces a limit), and keep `font-display: swap` so text is readable while a font loads.
