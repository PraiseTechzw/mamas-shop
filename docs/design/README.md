# Product design reference

The approved UI/UX design references are the product source of truth for screen layout, visual styling, interaction states, and navigation affordances. Developers and coding agents should consult them before implementing or changing product screens.

## Current references

- [Mama's Shop Mobile App UI Showcase](../../design/Mama%E2%80%99s%20Shop%20Mobile%20App%20UI%20Showcase.png) — main Mama's Shop visual direction and screens.
- [Small Business App UI Showcase](../../design/Small%20Business%20App%20UI%20Showcase.png) — supplementary, more detailed inventory, stock, credit, seller, notification, and offline-sync screens.

Together, these references show the intended mobile-first interface: light backgrounds and cards, navy text, blue/purple primary actions, compact shop data, and bottom navigation for Home, Sales, Inventory, Credit, and More. They cover the dashboard, product and stock flows, checkout and payments, customer credit and repayments, expenses, reporting, settings, notifications, and offline sync.

Use the images as visual and interaction references, while following product requirements for exact copy, validation, and business rules. Do not copy incidental mockup errors or example values as production data. Do not treat the route scaffold placeholder screens as final UI.

## Handoff

- Design source: repository `design/` directory (linked above)
- Target platforms: Android and iOS; web behavior should remain functional where the product supports it.
- Shared tokens and reusable implementation: `src/constants/`, `src/global.css`, and `src/components/`.
- Screen and interaction implementation: the owning folder under `src/features/`, exposed through `src/app/` routes.
