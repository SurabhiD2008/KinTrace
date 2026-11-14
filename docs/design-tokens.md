# KinTrace design

The look is fixed. Values live in `src/styles/tokens.css` and are applied globally by `src/styles/global.css`. `tests/unit/tokens.test.ts` fails if a token drifts from this page or a text/background pair drops below WCAG AA.

## Colours

| Token | Value | Use |
| --- | --- | --- |
| `--color-paper` | `#F4ECDC` | Page background |
| `--color-card` | `#FFFBF2` | Cards, default buttons |
| `--color-ink` | `#17163F` | Text, borders, shadows |
| `--color-blue` | `#2B2D8F` | Primary buttons, links, focus ring |
| `--color-coral` | `#FF7A59` | Meets criteria |
| `--color-mustard` | `#F4C542` | Worth discussing |
| `--color-mint` | `#9ADBC0` | No criteria met |
| `--color-magenta` | `#B0307A` | Accent |
| `--color-muted` | `#3C3B66` | Secondary text |
| `--color-tan` | `#CBBF9F` | Unknown, disabled |

## Page background

Paper with a dot grid:

```css
background-color: #F4ECDC;
background-image: radial-gradient(rgba(23, 22, 63, .16) 1.2px, transparent 1.4px);
background-size: 22px 22px;
```

## Cards and buttons

- 2px solid ink border, 4px radius.
- Hard offset shadow `4px 4px 0` ink, no blur.
- Pressed buttons shift 2px (right and down) and the shadow shrinks to `2px 2px 0`.

## Typography

- Headings (h1 to h4, big numerals, logo, section titles): `'Agency FB','Agency FB Bold','Barlow Condensed','Arial Narrow',sans-serif`; weight 700; uppercase; letter-spacing `.01em`. Barlow Condensed 500 to 700 is loaded from Google Fonts in `index.html` as the fallback. Use the `.heading` class for numerals and titles that are not heading elements.
- Everything else (body, buttons, form fields, tables, chips, small sticker labels): `Arial, Helvetica, sans-serif`.
- Sticker labels: 12px, uppercase, letter-spacing `.03em`, 2px ink border.

## Status colours

| Status | Background | Border |
| --- | --- | --- |
| Meets criteria | coral | solid |
| Worth discussing | mustard | solid |
| No criteria met | mint | solid |
| Unknown | tan | dashed |

Status is always carried by the text label as well as the colour. Unknown is its own status and is never shown as healthy.

## Accessibility

- Visible focus ring: 3px blue, offset 2px (`:focus-visible`).
- Minimum 44px touch targets (`--touch-target`).
- Contrast AA: ink on paper, card, coral, mustard, mint and tan; muted on paper and card; card text on blue; blue on paper and card. All checked by test.
- `prefers-reduced-motion: reduce` removes transitions and animations.

## Shared components (`src/ui`)

| Component | Props | Notes |
| --- | --- | --- |
| `Button` | `variant: 'primary' \| 'secondary'` plus native button props | `type="button"` by default. Disabled is tan with a dashed border. |
| `Sticker` | `status: 'meets' \| 'discuss' \| 'none' \| 'unknown' \| 'neutral'` | The chip. Neutral is a plain card-coloured label. |
| `Card` | `title?`, `headingLevel?: 2 \| 3 \| 4` | A `section` with an optional heading. |
