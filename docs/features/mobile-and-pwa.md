# Mobile-first UI & PWA

JobFlow is designed phone-first: every screen is a single responsive codebase (no separate
mobile routes) using mobile-first Tailwind — the unprefixed styles target a narrow phone and
`sm:`/`md:`/`lg:` prefixes progressively upgrade for wider viewports.

## Navigation shell

The header/nav is a client component, `src/components/SiteNav.tsx`, rendered by the root
layout (`src/app/layout.tsx`, which stays a server component and passes the signed-in user in
as a prop). It adapts by breakpoint:

- **Desktop (`md+`)** — a horizontal top bar: wordmark, inline links, user email, sign-out.
- **Mobile (`< md`)** — a slim top bar (wordmark + hamburger) **plus** a fixed **bottom tab
  bar** with the primary destinations (Dashboard, Calendar, New, Analytics) and a **More**
  tab. The hamburger and More both open a slide-in **drawer** containing every link plus the
  user email and sign-out.

Active state is derived from `usePathname()`. The drawer closes on route change. `<main>`
carries `pb-24 md:pb-6` so the fixed bottom bar never covers content; safe-area insets
(`.pb-safe`/`.pt-safe`, defined in `globals.css`) handle notched devices.

## Responsive patterns

- **Tables → cards.** Wide tables (dashboard applications, contacts) render as a stacked card
  list on mobile (`md:hidden`) and as a `<table>` only at `md+` (`hidden md:block`).
- **Calendar.** The 7-column month grid shows at `md+`; on mobile an **agenda list** grouped
  by day (reusing the same event data + `EventRow`) replaces it. See [calendar](calendar.md).
- **Resume editor.** The side-by-side sticky PDF `<iframe>` renders only at `lg+` (mobile
  browsers embed PDFs poorly); on smaller screens a **"Preview PDF"** link opens the inline
  PDF in the device's native viewer, with the editor shown first.
- **Dense field grids** (capture form, `JobDetailsPanel`) re-baseline to `grid-cols-1` and
  step up via `sm:`/`md:`. Note: `col-span-*` on children must also carry a breakpoint prefix
  (`sm:col-span-2`), otherwise a wider span forces an implicit extra column on a 1-column grid.

## Base styles (`src/app/globals.css`)

A `@media (max-width: 640px)` block sizes `.input/.textarea/.select` to `16px` (prevents iOS
focus-zoom) and gives `.btn/.input/.select` a 44px minimum touch target. Design tokens and the
`.card/.btn/.input/.badge` primitives are shared across all breakpoints.

## PWA

Installable / add-to-home-screen support with no service worker:

- `src/app/manifest.ts` — Next.js metadata route → `/manifest.webmanifest` (name, `standalone`
  display, theme/background colors, icons pointing at `/public/icon.svg`).
- `src/app/icon.tsx` and `src/app/apple-icon.tsx` — icons generated with `next/og`
  `ImageResponse` (no binary assets checked in); Next injects the `<link>` tags automatically.
- `viewport` export in `layout.tsx` sets `width=device-width`, `viewport-fit=cover`, and a
  light/dark `theme-color`.
- `src/middleware.ts` exempts `/manifest.webmanifest`, `/icon`, `/apple-icon`, and `/icon.svg`
  from the auth gate so the browser can fetch them (the manifest link is requested without
  credentials, even on the login page).

## Related

- [Architecture overview](../architecture/overview.md) ·
  [Sessions & middleware](../auth/sessions-and-middleware.md) · [Calendar](calendar.md) ·
  [Resume generation](resume-generation.md)
