# Keyboard shortcuts

This page is generated from the table the app reads (`src/lib/shortcuts.ts`) with `node scripts/gen-shortcuts-doc.mjs`, and a test fails if it is out of date. Press `?` anywhere in the app to see the list for your own role.

## How they behave
- They never fire while you are typing in a box, and never while a dialog is open (except a and f inside a person's day on the work diary review, which each ask you to confirm).
- `g` then a letter must be pressed within about a second and a half. Only pages in your own menu can be reached.
- Nothing destructive happens on one key: approving or flagging a day always asks first.
- Single-letter shortcuts can be switched off in My account. Ctrl or Cmd with K and B always work.
- No shortcut uses a combination the browser owns (Ctrl with N, T, W, R, L, S, P or F, and F5).

## Everyone
| Keys | What it does |
|---|---|
| `Ctrl or Cmd` `K` | Jump to a page |
| `?` | Show this list |
| `/` | Go to the search box on the page |
| `Ctrl or Cmd` `B` | Collapse or open the left menu |
| `Esc` | Close a box |
| `g` then `u` | Go to my account |
| `g` then `a` | Go to Announcements |
| `g` then `h` | Go to Holidays |
| `g` then `l` | Go to Leave |

## Managers and admins
| Keys | What it does |
|---|---|
| `g` then `d` | Go to the Dashboard |
| `g` then `r` | Go to Reports |
| `g` then `s` | Go to Shifts |
| `g` then `w` | Go to the Work diary review |
| `g` then `,` | Go to Settings |
| `r` | Refresh the numbers on this page |
| `1` to `5` | On the roster: Everyone, Here today, Late, Away, Not here yet |
| `[` and `]` | Previous and next day (work diary review) |
| `i` | Invite staff (on the dashboard) |

## Employees
| Keys | What it does |
|---|---|
| `g` then `d` | Go to My History |
| `g` then `m` | Go to My page |
| `g` then `s` | Go to My Shifts |
| `g` then `w` | Go to my Work diary |
| `s` | Open the scanner (on My page) |

## Reviewing the work diary (managers and admins)
| Keys | What it does |
|---|---|
| `j` and `k` | Move down and up the list of people (work diary review) |
| `Enter` | Open the person you are on |
| `a` | Approve the day (asks you to confirm) |
| `f` | Flag the day (asks you to confirm) |
