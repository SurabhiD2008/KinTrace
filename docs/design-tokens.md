# KinTrace design

A pedigree chart on clinic drafting paper, marked up in highlighter the way a genetic counsellor annotates one. Values live in `src/styles/tokens.css` and are applied globally by `src/styles/global.css`. `tests/unit/tokens.test.ts` fails if a token drifts from this page or a text/background pair drops below WCAG AA.

## Colours

| Token | Value | Use |
| --- | --- | --- |
| `--color-paper` | `#EEF2EC` | Page background (chart paper) |
| `--color-card` | `#FBFCFA` | Sheets: cards, the tree, the report |
| `--color-ink` | `#14212B` | Text, drawn lines, control borders |
| `--color-blue` | `#1F3FBF` | Primary buttons, links, focus ring, selection on the tree |
| `--color-coral` | `#FF9F7D` | Meets criteria (highlighter) |
| `--color-mustard` | `#FFD84A` | Worth discussing; evidence rings; the marked phrase |
| `--color-mint` | `#A5E0C2` | No criteria met |
| `--color-magenta` | `#A8245F` | Errors, the heart badge |
| `--color-muted` | `#45535E` | Secondary text |
| `--color-tan` | `#D3D8D0` | Unknown, disabled, hover |
| `--color-rule` | `#C3CCC4` | Hairlines around and inside sheets |

## Surfaces

- The page is plain chart paper. The grid (`--chart-grid`: 12px squares, a heavier line every fifth) appears only where a tree is drawn.
- Sheets (cards, toolbars, tables, the report) have a 1px rule border, 2px corners (`--radius-sheet`) and no shadow.
- Controls (buttons, fields) have a 1.5px ink border and 8px corners (`--radius`); chips and step badges are pills (`--radius-pill`).
- `--shadow-float` is only for things that float: dialogs, the phone bottom sheet, the report page on its desk.
- Notices and the permanent banner are sheets with a 6px marker stripe down the left edge.

## Typography

- Headings (h1 to h4, the logo, the `.heading` class): Fraunces (variable, optical size), weight 560, sentence case, letter-spacing `-0.015em`, line height 1.12.
- Everything else: Atkinson Hyperlegible Next, chosen for legibility at every age and for low vision.
- Both are bundled from `@fontsource-variable` (Latin subset) with `font-display: optional`, so the app requests nothing from another site and text never re-wraps when a font arrives late. Other scripts fall back to the system font.

## Status

| Status | Background | Edge |
| --- | --- | --- |
| Meets criteria | coral | none |
| Worth discussing | mustard | none |
| No criteria met | mint | none |
| Unknown | tan | dashed |

A status label is a swipe of highlighter behind the words (`Sticker`), with uneven corners. Status is always carried by the text as well as the colour. Unknown is its own status and is never shown as healthy. Evidence on the tree is a band of mustard highlighter around the symbol with an ink line outside it, so it still reads as a second outline in black and white.

## Motion

One orchestrated moment: on the landing page the sample tree's lines trace in and the highlighter lands on the evidence. Controls change over 140ms. `prefers-reduced-motion: reduce` removes all of it.

## Accessibility

- Visible focus ring: 3px blue, offset 2px (`:focus-visible`).
- Minimum 44px touch targets (`--touch-target`).
- Contrast AA: ink on paper, card, coral, mustard, mint and tan; muted on paper, card and tan; card text on blue and on ink; blue on paper and card. All checked by test.

## Shared components (`src/ui`)

| Component | Props | Notes |
| --- | --- | --- |
| `Button` | `variant: 'primary' \| 'secondary'` plus native button props | `type="button"` by default. Disabled is tan with a dashed border. |
| `Sticker` | `status: 'meets' \| 'discuss' \| 'none' \| 'unknown' \| 'neutral'` | The highlighter label. Neutral is a plain outlined pill. |
| `Card` | `title?`, `headingLevel?: 2 \| 3 \| 4` | A `section` with an optional heading. |
