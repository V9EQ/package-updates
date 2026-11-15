# Arch Updates

A GNOME Shell extension that shows available pacman updates and out-of-date Arch Linux packages in the top bar.

## Features

- Two counters: **Pacman updates** for installed packages and **Outdated packages** for package bases across Arch Linux repositories.
- Automatic checks every 5 minutes, with a configurable interval.
- Refresh the available-updates counter after package installation, upgrade or removal.
- Left, center or right top bar placement.
- Package previews, manual refresh and links to out-of-date reports.
- Last known counts remain visible when a check fails.

The out-of-date counter uses open reports labelled `package::out-of-date` on [Arch Linux GitLab](https://gitlab.archlinux.org/groups/archlinux/packaging/packages/-/issues?state=opened&label_name%5B%5D=package%3A%3Aout-of-date). It covers **all Arch package bases**, not just installed packages. Multiple reports for the same package base count once. An out-of-date report does not necessarily mean an update is available through pacman.

AUR packages are not included in either counter.

## Requirements

- Arch Linux with GNOME Shell 51
- `pacman-contrib` and `libsoup3`
- `coreutils`, including GNU `timeout`
- `make` for installation from source

```sh
sudo pacman -S --needed pacman-contrib libsoup3
```

## Installation

```sh
git clone https://github.com/V9EQ/arch-updates.git
cd arch-updates
make install
```

Log out and back in, then enable the extension:

```sh
gnome-extensions enable arch-updates@v9eq.github.io
```

### Upgrading from the local version

If `arch-updates@aboba.local` is installed, disable it before enabling the new version to avoid duplicate indicators:

```sh
gnome-extensions disable arch-updates@aboba.local
```

Preferences are preserved because both versions use the same GSettings schema.

## Configuration

Select **Open preferences** from the indicator menu, or run:

```sh
gnome-extensions prefs arch-updates@v9eq.github.io
```

The default refresh interval is 5 minutes; the supported range is 1–1440 minutes. Panel placement changes take effect immediately.

Panel status:

| Symbol | Meaning |
| --- | --- |
| `…` | No result yet |
| `!` | Check failed without an earlier result |
| `*` after a count | Last known result; the latest check failed |

Open the menu for error details and the last successful check time. Package previews show up to 15 entries; the counters include all results.

## How it works

Available updates are queried asynchronously using `checkupdates --nocolor`. Repository metadata is stored in a separate database under `~/.cache/arch-updates/checkupdates` (or `$XDG_CACHE_HOME/arch-updates/checkupdates`). The system pacman database is not synchronized, and no packages are installed or upgraded.

The installed package database is monitored for changes using the path reported by `pacman-conf DBPath`. After packages change and pacman releases its database lock, the first counter is recalculated with a read-only `pacman -Qu` query. This requires no network access and does not refresh the GitLab counter. Cancelling before any packages are changed does not trigger a refresh. If an update check is already running, a recount is queued so its earlier result cannot overwrite the new count.

Out-of-date reports are fetched through the public GitLab API, with pagination and deduplication by package project. No API token is required.

Checks for the same source do not overlap. Disabling the extension removes its timers, file monitors and indicator, disconnects settings signals, cancels network requests and terminates running checks.

## Building

Extension files live in `src/`; packaging instructions and project documentation are in the repository root.

```sh
make pack
```

The bundle is written to `dist/arch-updates@v9eq.github.io.shell-extension.zip`.

To install a bundle manually:

```sh
gnome-extensions install --force dist/arch-updates@v9eq.github.io.shell-extension.zip
```

## Uninstalling

```sh
gnome-extensions disable arch-updates@v9eq.github.io
gnome-extensions uninstall arch-updates@v9eq.github.io
```

## Issues

Report bugs at [GitHub Issues](https://github.com/V9EQ/arch-updates/issues), including your GNOME Shell version and any relevant logs:

```sh
journalctl -b _COMM=gnome-shell
```

## License

Code is licensed under [GPL-2.0-or-later](LICENSE).

Icons are from [Lucide](https://lucide.dev/), distributed under ISC/MIT terms. See [icons/LICENSE](icons/LICENSE).
