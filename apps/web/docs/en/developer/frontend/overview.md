# Frontend overview

The dashboard is a React app in `apps/web`, built with Vite, TypeScript, and Tailwind. Production serves the compiled files from the same Node process as the API. In development, Vite runs on port 5173 and proxies `/api` and `/health` to port 3000. It also proxies `^/s/`, `^/l/`, and `^/files/` so the default short-link prefix, the default page prefix, and media files can be opened from the dashboard origin. Other prefixes are served only by the API.

`npm run build -w @sharry/web` writes `apps/web/dist`. The API serves `dist/assets` at `/assets/` and returns `dist/index.html` for dashboard routes. That static registration runs only when `NODE_ENV` is `production` and the assets directory exists.

Shared types and Zod schemas come from `@sharry/shared`. The UI components live in `apps/web/src/components/ui`. Shared table cells cap long text and show an ellipsis, while a button, button group, or select in a cell keeps its full width. Pages live in `apps/web/src/pages`. The shell, navigation, and sign-out are `apps/web/src/components/shell.tsx`. On a small screen the top bar holds the menu, the current page title from the route's `handle.title`, and a search button that opens the command palette. The page heading stays in the page. A page with its own small-screen menu renders it with `SubNav` from `apps/web/src/components/sub-nav.tsx`. The shell gives it a full-width row that sticks under the top bar, and wide screens do not show it. Docs puts its page list there, and Chat puts New chat and Chats there. A page without a `SubNav` leaves that row empty. Buttons passed to `PageHeader` as its action sit in one row with the heading on a wide screen, and that same action moves into this bar on a small screen. The bar stays one row high and scrolls sideways when its buttons are wider than the screen. On a small screen each table column keeps a readable minimum width and the table scrolls sideways. A wide screen still fits the columns to the page. A code block in the docs has a copy button in its top-right corner. Lists inside a side sheet scroll on their own when they are taller than the screen. The current item in the sidebar has a primary edge, and appearance is one button that cycles light, dark, and system. A page that is still loading shows a placeholder instead of an empty list. Chat fills the main area: the transcript scrolls on its own, and the message box stays at the bottom of that column. The title, messages, and message box share a centered column with a maximum width. On a small screen a link puts Save, Copy, and Delete into the bar under the top bar, and a campaign puts Save and Delete there. A result that belongs to one field is a tooltip on an icon beside that field’s label. Closing that tooltip keeps it closed when you return to the page. A save, copy, or failed load is a toast at the bottom right that leaves after a few seconds. Overview, Links, Campaigns, and Analytics are the main menu. Docs and the administrator pages sit below a divider, in a smaller type size. Each route sets the browser title to `Page · APP_NAME`. `APP_NAME` defaults to `Sharry`. The dashboard sends `noindex, nofollow` so search engines do not index it.

User and developer docs are markdown files in `apps/web/docs/<locale>`. English lives in `apps/web/docs/en` and German in `apps/web/docs/de`. Vite loads them with `import.meta.glob` as raw text and shows the folder that matches the active language, falling back to English when a page is missing. The API reference is generated from the JSDoc block above each route in `apps/api/src` by `apps/web/api-docs-plugin.ts` while Vite builds or serves the app. Those English strings are translated in the browser with `t()`. A fenced `mermaid` block renders as a diagram.

## Page builder

The landing page editor is `apps/web/src/pages/page-editor.tsx`, and its parts live in `apps/web/src/components/page-builder`:

| File | Role |
| --- | --- |
| `block-tree.tsx` | The block list with nesting, selection, drag and drop, move, duplicate, and delete |
| `add-block-dialog.tsx` | The Add block dialog, grouped by Layout, Content, and Media from the registry |
| `field-editor.tsx` | Builds the inspector from a block's fields. One control per field kind |
| `rich-text-editor.tsx` | TipTap editor for rich text fields. Its output is cleaned with `cleanRichText` |
| `page-preview.tsx` | Renders the draft with the shared `renderPage` into a sandboxed `srcdoc` iframe, debounced by 150 ms, with desktop and mobile widths |
| `page-settings-sheet.tsx` | Page settings: address, folder, redirect domain, search engines, social sharing, and look |
| `page-status.tsx` | Status badge and the status filter options |
| `block-icons.tsx` | Maps the icon names from the block definitions to lucide icons |

The editor has no code per block. Adding a component is described in [Page builder blocks](/docs/developer/frontend/page-blocks).

## Dialogs and touch targets

The dashboard never calls `window.confirm`, `window.alert`, or `window.prompt`. A yes-or-no question uses `ConfirmDialog`, or `useConfirm()` from `components/ui/confirm-dialog.tsx` when the question sits in the middle of an async handler: `if (!(await confirm({ title, description, confirmLabel, destructive: true }))) return;`, with `{dialog}` rendered once in the page. A question that needs input, such as the link address in the rich text editor, is its own `Dialog` with a `Field`, so a wrong value shows next to the field instead of in an alert. `src/no-native-dialogs.test.ts` fails when a browser dialog comes back.

On a touch screen every control is at least 44 by 44 pixels. The sizes use Tailwind's `pointer-coarse:` variant, so a mouse keeps the compact sizes and nothing moves while a page is open. `Button` already does this for every size. A custom icon button, chip, swatch, or toolbar button adds `pointer-coarse:size-11` (or `pointer-coarse:h-11`) itself. A `DataTable` row menu opens on right-click, and on touch with a long press of half a second. Column widths resize with pointer events, so a finger can drag them too.

## Languages

The dashboard calls `t("English sentence")` from `apps/web/src/i18n`. The English sentence is the key. A missing translation stays in English. German strings live in `apps/web/src/i18n/de.ts`. The signed-in account stores `users.locale`. Account saves it with `PATCH /api/auth/locale`. The allowed codes are `locales` in `@sharry/shared`.

To add a language:

1. Add its code to `locales` in `packages/shared/src/schemas.ts`.
2. Add `apps/web/src/i18n/<code>.ts` and register it next to German.
3. Copy `apps/web/docs/en` to `apps/web/docs/<code>` and translate the pages.

No database migration is required. The column is plain text, and the API rejects a code that is not in the list.
