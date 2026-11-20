# Contributing

## Development environment

Use GNOME Shell 48–51, GJS, GNU make/coreutils, `glib-compile-schemas` and `gnome-extensions`. Follow the installation requirements of the backend you work on. Do not run package-changing commands or refresh the development host's system indexes just to inspect output.

## Architecture

Read [the design and upstream references](docs/architecture.md) before changing a package interface.

- `platform.js` selects a supported `ID` or ordered `ID_LIKE` fallback through GLib; it does not execute os-release or infer a distribution from arbitrary commands in PATH.
- `command.js` owns subprocesses, environment normalization, timeout handling and cancellation. Pass argv arrays, not shell command strings.
- `services.js` is the adapter facade. Keep distribution-specific queries out of the Shell UI.
- Backends expose `updatesTitle`, `getUpdates({local})`, `watchChanges(callback)` and `destroy()`.
- `getUpdates` resolves to sorted `{name, detail}` entries. `local: true` must not trigger remote metadata downloads.
- `watchChanges` resolves to an object with a synchronous `destroy()` method. The caller destroys a monitor that arrives after extension shutdown.
- Optional `outdated`, `aur` and `flatpak` sources expose `getPackages()`, `cancel()` and `destroy()` independently of native package queries; AUR also accepts `{local}`.
- Preserve last-known results on failure, reject partial/unrecognized output, and keep raw diagnostics out of the menu.

Do not use a removable pacman lock-file check for APT or RPM: their locking semantics differ. A file-change notification is not automatically an atomic transaction-completion signal.

## Adding or changing a backend

1. Check the current official release and package-manager documentation; record the review date and links.
2. Add the adapter under `src/backends/<distribution>/` and register it in the detection/factory mapping.
3. Reuse shared implementations instead of duplicating package-manager parsers.
4. Add a README using exactly these sections:
   - Support
   - Requirements
   - Update query
   - Metadata freshness
   - Change detection
   - Limitations
   - References
5. State count semantics, missing-cache behavior, exit statuses, permissions and unsupported variants explicitly.
6. Keep backend README files out of the runtime ZIP.

## Validation and commits

Do not add tests unless the maintainer explicitly requests them. For this change, permitted checks are JavaScript syntax, strict schema compilation, whitespace checks and archive inspection. Do not represent those checks as runtime verification on another distribution.

```sh
find src -type f -name '*.js' -print
# For each file:
node --input-type=module --check < src/extension.js
make pack
git diff --check
unzip -l dist/package-updates@v9eq.github.io.shell-extension.zip
```

Do not change desktop/network settings, launch an extra GNOME Shell session, or install packages without explicit permission. Commit each completed implementation stage separately. Do not amend published commits or push without an explicit request.

## Compatibility and packaging

Keep UUID `package-updates@v9eq.github.io` and the `/org/gnome/shell/extensions/package-updates/` schema path unless a further migration is explicitly approved. Resource directories may live outside `src/` in the repository, but installed `icons/` and `schemas/` must remain at archive root. The Makefile stages runtime files under `.build/extension`; generated files are ignored.

Only declare Shell versions supported by the APIs actually used. Consult the corresponding upstream porting guides when widening that range. Keep GTK/Adwaita imports in preferences, and St/Clutter imports in Shell code.
