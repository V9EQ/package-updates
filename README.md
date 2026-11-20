# Package Updates

A GNOME Shell extension that shows package update counts for **Arch Linux, Ubuntu, Debian and Fedora**. The distribution and package manager are detected automatically.

## Features

- Update counts and package previews in the top bar.
- Configurable check interval; 30 minutes by default.
- Left, center or right panel placement.
- Rechecks after installed-package database changes.
- Optional Arch-only AUR update checks without helpers.
- Optional Arch-only out-of-date package reports.
- Last-known counts remain visible when a check fails.

## Compatibility

GNOME Shell **48–51** is required. Package backends target the following releases; see each module for its exact count and metadata-refresh semantics.

| Distribution | Reference release | Backend | Documentation |
| --- | --- | --- | --- |
| Arch Linux | Rolling | pacman / checkupdates | [Arch module](src/backends/arch/README.md) |
| Ubuntu | 26.10, 26.04 LTS | APT | [Ubuntu module](src/backends/ubuntu/README.md) |
| Debian | 13 / trixie | APT | [Debian module](src/backends/debian/README.md) |
| Fedora Workstation | 45 | DNF5 | [Fedora module](src/backends/fedora/README.md) |

These targets are based on upstream documentation, not runtime verification on every distribution. Related distributions can use `ID_LIKE` fallback on a best-effort basis. Unsupported systems show **Unsupported system**, not a zero count. Fedora Atomic, rpm-ostree/bootc deployments, Snap and Flatpak are outside the supported scope.

**Metadata freshness differs:** Arch refreshes a separate database; APT reads existing indexes maintained by the OS or administrator; DNF5 follows its metadata-expiration policy. Changing the check interval does not refresh APT indexes.

## Installation

Install the dependencies for your distribution:

```sh
# Arch Linux
sudo pacman -S --needed pacman-contrib libsoup3 make

# Ubuntu / Debian
sudo apt install apt gir1.2-soup-3.0 libglib2.0-bin make

# Fedora Workstation
sudo dnf install dnf5 rpm libsoup3 glib2 make
```

GNU coreutils, GJS, GTK 4, libadwaita and the GNOME extension tools must also be available. They are normally present in a GNOME installation. Fedora requires a DNF5 version supporting `check-upgrade --json`; there is no DNF4 fallback.

```sh
git clone https://github.com/V9EQ/package-updates.git
cd package-updates
make install
```

Log out and back in, then enable the extension:

```sh
gnome-extensions enable package-updates@v9eq.github.io
```

## Configuration

Select **Open preferences** from the menu, or run:

```sh
gnome-extensions prefs package-updates@v9eq.github.io
```

- **Top bar position:** left, center or right.
- **Check interval (minutes):** 1–1440; default 30.
- **AUR updates:** Arch-based systems only; disabled by default. Includes AUR in the update count. Sends installed foreign package names to aur.archlinux.org.
- **Outdated packages:** Arch-based systems only. Disabling it hides the out-of-date counter and reports action and cancels GitLab requests. Re-enabling starts a check immediately.

System detection uses `ID`, then ordered `ID_LIKE` values from `os-release` through GLib. An installed package-manager executable alone does not select a backend. Settings changes take effect without restarting Shell.

## Counts and status

The primary section is labelled **Pacman updates**, **APT updates** or **DNF updates**. Package previews show up to 15 entries; the counter includes the complete result. On Arch, the top-bar counter combines Pacman and enabled AUR updates; their details remain separate in the menu.

On Arch, **Outdated packages** counts unique package bases with open `package::out-of-date` reports across Arch Linux repositories, not just installed packages. This indicates lag behind upstream, not necessarily an upgrade available through pacman. Arch reports are never queried on Ubuntu, Debian or Fedora.

| Status | Meaning |
| --- | --- |
| `…` | No result yet |
| `!` | Unavailable without an earlier result |
| `*` after a count | Last-known count; the latest check failed |
| `Sync failed` | No successful result is available |
| `Sync failed · cached data` | Previous results are retained |
| `Unsupported system` | No applicable backend is available |

Technical error details go to the journal. Repeated identical failures are logged once per source until a check succeeds.

## Safety and resource use

The extension does not install, remove or upgrade packages, run privileged commands, or alter repository, network or desktop configuration. APT checks are simulations and do not refresh system indexes. Arch and DNF5 may download repository metadata to user caches, never package archives.

Commands run asynchronously with a 120-second limit and a 5-second termination grace period. Source checks do not overlap. Database notifications are coalesced; Arch waits for its transaction lock, while APT/RPM notifications can occur during a long transaction and schedule another read after later writes. Disabling removes timers and file monitors, cancels HTTP requests and terminates outstanding commands.

## Build and repository layout

```sh
make pack
```

The bundle is `dist/package-updates@v9eq.github.io.shell-extension.zip`. Install it manually with:

```sh
gnome-extensions install --force dist/package-updates@v9eq.github.io.shell-extension.zip
```

```text
src/             Runtime JavaScript, metadata and Shell stylesheet
  backends/      Distribution adapters and their README files
icons/           Symbolic SVGs and icon license
schemas/         GSettings XML
.build/          Generated runtime staging directory (ignored)
dist/            Generated ZIP (ignored)
docs/            Architecture and upstream references
```

The archive contains `extension.js`, `metadata.json`, `prefs.js`, `icons/` and `schemas/` at its root, as expected by GNOME. The extension installer compiles schemas automatically. Backend README files are not bundled. See [Architecture](docs/architecture.md) and [Contributing](CONTRIBUTING.md) for implementation details.

## Troubleshooting and removal

Include your distribution, GNOME Shell version, backend command output and relevant logs when filing an [issue](https://github.com/V9EQ/package-updates/issues):

```sh
journalctl -b _COMM=gnome-shell | grep 'Package Updates:'
```

Review logs before sharing them, especially when using private repositories. For APT, check that repository indexes have been refreshed normally; for Fedora, confirm DNF5 JSON support and repository availability.

To remove:

```sh
gnome-extensions disable package-updates@v9eq.github.io
gnome-extensions uninstall package-updates@v9eq.github.io
```

## License

Code: [GPL-2.0-or-later](LICENSE). Icons: [Lucide](https://lucide.dev/), under the terms in [icons/LICENSE](icons/LICENSE).
