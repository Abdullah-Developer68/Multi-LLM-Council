# Council design system — "shadcn dark"

Ported from the **StudyBot → shadcn** design on the Doop canvas *StudyBot — App Screens* (the `--color-sn-*` token set, dark theme), following its **mobile** frames (M01 chat, M01a drawer, M01b new chat, M04 settings, M06 sheet). Council is a phone app; there is no desktop or tablet layout.

The look is shadcn/ui: a near-black canvas, one raised card surface, hairline borders, a white primary and Geist type. Dark is the default theme. Light uses the same roles with the canvas's light values.

Values live in [`src/theme/tokens.ts`](src/theme/tokens.ts). Components ask for roles (`colors.card`, `radius.md`) and never use literal values.

## Colour roles

| Role | Dark | Light | Use |
| --- | --- | --- | --- |
| `background` | `#0A0A0A` | `#F7F7F7` | Ground for grouped screens (settings, status, insights) and the drawer. |
| `card` | `#141414` | `#FFFFFF` | The chat screen surface, cards, list groups, the composer, sheets. |
| `popover` | `#171717` | `#FFFFFF` | Toasts. |
| `muted` | `#212121` | `#F2F2F2` | Hover, the active row, the user bubble, icon tiles, skeletons. |
| `foreground` | `#FAFAFA` | `#111111` | Default text and icons. |
| `mutedForeground` | `#A1A1A1` | `#737373` | Descriptions, captions, inactive icons, placeholders. |
| `faint` | `#6B6B6B` | `#A3A3A3` | Overflow icons, indices, the muted line of a headline. |
| `border` | `#262626` | `#E8E8E8` | Dividers and card outlines. |
| `input` | `#333333` | `#E0E0E0` | Control outlines: inputs, outline buttons, toggle groups. |
| `ring` | `#525252` | `#A3A3A3` | Focus border (with a 3px `muted` halo). |
| `primary` / `primaryForeground` | `#FAFAFA` / `#0A0A0A` | `#0A0A0A` / `#FFFFFF` | The one strong action per view. |
| `link` | `#60A5FA` | `#2563EB` | Inline links only. |
| `success` · `warning` · `destructive` (+ `*Soft`) | | | Status badges, alerts, destructive actions. |

The design has no brand hue: emphasis comes from the white primary. Each seat keeps a coloured identity dot (`colors.seats`) for status, and that is the only other colour.

## Type: Geist / Geist Mono

| Variant | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `display` | 24 / 30, −0.03em | 500 | New-chat greeting, big numbers. |
| `title` | 20 / 26 | 600 | Page hero, sign-in card. |
| `headline` | 15 / 21 | 600 | Card titles. |
| `message` | 15 / 24 | 400 | Chat answers. |
| `body` / `bodyMedium` | 14 / 21 | 400 / 500 | Default text, header titles. |
| `callout` / `calloutMedium` | 13.5 / 19 | 400 / 500 | Sidebar rows, card descriptions, list items. |
| `caption` | 12.5 / 18 | 400 | Hints, metadata. |
| `label` | 12 / 16 | 500 | Group labels, badges. |
| `mono` | 12 / 17 | Mono | Counters, model ids, pagers. |

## Shape and spacing

- Radius: `sm 6`; `md 8` for controls, inputs, icon buttons and drawer rows; `lg 12` for cards and list groups; `xl 16` for the composer, the sheet's top corners and the drawer's right edge; `pill` for buttons and badges.
- Control heights: `sm 32`, `md 36`, `lg 40`. Header icon buttons and the drawer's new-chat button use 40 so they are easy to tap.
- Screens use 16px gutters and a 56px header with a centered title. The chat screen sits on `card`. Grouped screens sit on `background` with cards on top.
- The drawer is at most 320px wide (82% of the screen). It sits on `background` with a hairline and a rounded right edge.
- Elevation is used sparingly. Only floating things get `elevation()`: the composer, the sheet and toasts.
- Touch feedback: pressed rows fill with `muted` and pressed solid buttons dim to 80%. There are no hover states.

## Components

| Component | File | Notes |
| --- | --- | --- |
| `Button` | `components/ui/button.tsx` | Variants: `default`, `outline`, `secondary`, `ghost`, `destructive`. Sizes: `sm`, `md`, `lg`. Pill-shaped. |
| `IconButton` | same | 32px square with radius md (`round` for the composer). Uses the same variants. |
| `Segmented` | `components/ui/controls.tsx` | `group` is the drawer's bordered toggle group. `tabs` is a `muted` track with a raised active pill, used for the theme switch in Settings. |
| `Toggle` | same | shadcn switch. |
| `TextField` | `components/ui/text-field.tsx` | Label above the field. The focus ring is a `ring` border plus a 3px halo. Accepts a `trailing` slot. |
| `Card`, `CardHeader` | `components/ui/layout.tsx` | Card surface with a title and description. |
| `Badge` | same | 22px pill. Variants: `outline`, `secondary`, `default`, `success`, `warning`, `destructive`, plus an optional status dot. |
| `ListGroup`, `ListItem` | same | Grouped settings rows: icon tile, title, value or control, and a chevron when the row navigates. |
| `Avatar`, `IconTile`, `Divider`, `SectionHeader` | same | |
| `Skeleton`, `Progress`, `Alert`, `ToastHost` | `components/ui/feedback.tsx` | |
| `Sheet` | `components/ui/sheet.tsx` | Bottom sheet with a drag handle. Drag down to dismiss. |
| `Screen`, `AppHeader`, `BackButton` | `components/shell.tsx` | Safe-area screen frame, the centered 56px header and its back chevron. |
| `DrawerSidebar` | `components/chat/sidebar.tsx` | Edge-swipe drawer with section tabs, search, new chat, history and an account footer. |
| `LogoTile`, `Wordmark` | `components/brand.tsx` | The mark on a primary tile. |

## Rules

1. Allow one `default` (primary) button per view. Secondary actions are `outline` or `ghost`.
2. Raised surfaces are `card` sitting on `background`. Floating surfaces are `popover`. Never stack two cards of the same colour without a border between them.
3. Pressed and selected states use `muted`. Text weight changes only on selection.
4. Icons are lucide at 16px with `strokeWidth={1.75}`. Use `mutedForeground` at rest and `foreground` when active.
5. Copy is sentence case. Labels are short.
