# Sachin's Whiteboard

**Live:** https://sachinpatilgit.github.io/sachins-whiteboard/

A self-hosted, excalidraw.com-style whiteboard built on the official
[`@excalidraw/excalidraw`](https://www.npmjs.com/package/@excalidraw/excalidraw)
editor component (MIT licensed). Everything runs in the browser — no account,
no backend, no data leaves the machine.

## What's included

**Editing**
- All tools: selection, hand, rectangle, diamond, ellipse, arrow, line,
  free draw, text, image, eraser, plus the extra-tools menu (frame, web embed,
  laser pointer, Mermaid to Excalidraw)
- Shapes panel with the standard shape library
- Full properties: stroke/background colors, fill styles, stroke width/style,
  sloppiness, edges, arrow type, arrowheads (sharp/round), opacity, layers
- Text with multiple font families and sizes, alignment controls
- Arrow binding, element grouping, align/distribute, flip, lock, z-order
- Copy/paste, duplicate, undo/redo, find on canvas, zoom controls, grid mode,
  zen mode, study/stats, help dialog with all shortcuts

**Files & data**
- Export to PNG / JPEG / WebP / SVG, copy to clipboard, export `.excalidraw`
  JSON, save/open local files (File System Access where available)
- Libraries sidebar with install-from-[libraries.excalidraw.com](https://libraries.excalidraw.com)
- **Mermaid to Excalidraw** — converts Mermaid diagrams to native elements
  entirely offline (flowchart, sequence, class diagrams)
- **Browser autosave**: scene + your preferences to localStorage, embedded
  images and shape libraries to IndexedDB — restored on every reload, flushed
  on tab close

**Experience**
- Branded welcome screen (logo, tagline, GitHub link) on an empty canvas
- Light / dark / system theme with a 3-way selector (persisted)
- UI language picker with all Excalidraw translations (persisted, auto-detected
  from the browser on first run)
- Full main menu, keyboard shortcuts (`Shift+Alt+D` toggles theme)

## Not included (server-backed on excalidraw.com)

These features on excalidraw.com rely on Excalidraw's hosted services and are
intentionally not replicated, since this app is fully self-contained:

- Live collaboration rooms (requires running an `excalidraw-room` WebSocket
  server; the editor component itself supports it — the socket client layer
  would need to be added)
- Shareable links saved to a backend, and the Excalidraw+ cloud account
- AI "Text to diagram" / "Wireframe to code" (needs an AI backend; the
  Mermaid tab of that dialog works fully offline)
- Command palette (the component is not exported by the npm package)

## Deployment

Pushing to `main` triggers the
[Deploy to GitHub Pages](.github/workflows/deploy.yml) workflow: it installs
dependencies with `npm ci`, builds the app with Vite and publishes `dist/` to
GitHub Pages. The site is fully static — no server required.

## Getting started

```bash
npm install
npm run dev      # dev server (Vite)
npm run build    # typecheck + production build to dist/
npm run preview  # serve the production build locally
```

## How it works

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Composition: editor, branded welcome screen, main menu (theme + language + GitHub), autosave wiring, theme/language state |
| `src/persistence.ts` | localStorage scene snapshots (debounced + flush on unload), IndexedDB stores for binary files and libraries, theme/language persistence |
| `src/LanguagePicker.tsx` | Language dropdown rendered inside the main menu |
| `src/assets/brand-logo.svg` | Logo mark used in the welcome screen and as favicon artwork |
| `src/brand.css` | Brand styles for the welcome-screen logo (mark + wordmark) |
| `index.html` | Title/meta + boot script that applies the theme before first paint (no flash) |

The editor itself (`@excalidraw/excalidraw`) provides the entire canvas,
toolbars, dialogs and export pipeline — this project wires the app shell,
branding and persistence around it, mirroring how excalidraw.com composes the
same package.

To update the editor: `npm update @excalidraw/excalidraw` (opinionated pin in
`package.json`).

## Branding

- App title, meta tags and favicon: `index.html`, `public/favicon.svg`
- Welcome-screen logo (mark + wordmark + tagline): `src/App.tsx`, styled in
  `src/brand.css` — swap `src/assets/brand-logo.svg` to change the mark

## License

Application code: this repository, MIT (see [`LICENSE`](LICENSE)). Editor
component: [Excalidraw](https://github.com/excalidraw/excalidraw), MIT —
bundled via npm, notices preserved. "Excalidraw" branding inside the editor
belongs to the Excalidraw project; this app is not affiliated with it.
