# SSIM Editor

Cross-platform desktop app (Windows / macOS / Linux) for applying user-defined
business rules to IATA SSIM (Chapter 7) schedule files. The opened file is
never modified — rules preview live in the table and export as a new file.

## How it works

- **Open** a SSIM file. Type 3 (flight leg) records are parsed into a table;
  all other record types pass through untouched on export.
- **Rules** are condition/action pairs built visually (no coding): *if every
  condition matches a leg, apply the actions*. Rules run top to bottom and are
  saved automatically; they can be imported/exported as JSON to share.
  - Conditions: is / is not / is one of / contains / period overlaps / operates on day
  - Actions: set value / shift time by minutes / replace text (`old=>new`)
- **Preview**: modified values show in amber with a before → after tooltip;
  the status bar lists every change and warnings (e.g. a time shift crossing
  midnight, which may need a date-variation review).
- **Export** writes a new file (defaults to `<name>_modified.ssim`), emitting
  untouched lines byte-for-byte and splicing changed values into their exact
  fixed-width columns.

## Development

```sh
npm install
npm run tauri dev    # run the app (needs Rust: https://rustup.rs)
npm test             # parser + rules engine tests (vitest)
npm run tauri build  # produce installers for the current OS
```

Releases are built by CI (`.github/workflows/build.yml`): every tag push
`v*` builds macOS + Windows (x64 and ARM64) installers, runs the tests, and
attaches everything to a draft GitHub release; manual workflow runs upload
the installers as workflow artifacts instead.

UI-only smoke testing without Tauri: `npm run dev`, then open
`http://localhost:1420/?demo` in a browser — loads fixture data and a sample
rule (dev builds only).

## Layout

- `src/ssim/` — fixed-width parse/serialize (`types.ts` holds the column map)
- `src/rules/` — rule types, pure `applyRules` engine, persistence
- `src/components/` — flight table (virtualized), rules panel, rule editor
- `src-tauri/` — stock Tauri v2 shell; all logic lives in the webview
- `fixtures/sample.ssim` — sample file for manual testing
