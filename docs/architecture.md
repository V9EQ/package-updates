# Multi-distribution architecture

## Scope

Documentation reviewed on 2026-11-16. This is a source-based compatibility target, not a claim of runtime verification on every distribution.

| Distribution | Current release reference | Package interface | Metadata policy |
| --- | --- | --- | --- |
| Arch Linux | Rolling release | `checkupdates`, `pacman` | Separate checkupdates database; read-only cached query after logged upgrades |
| Ubuntu | 26.10; 26.04 LTS | `apt-get --simulate upgrade` | Read existing system indexes; never run privileged index refresh |
| Debian | 13 (trixie), currently 13.7 | `apt-get --simulate upgrade` | Same APT implementation as Ubuntu |
| Fedora Workstation | 45 | DNF5 structured update query | Unprivileged DNF metadata cache; cache-only query after database changes |

Target GNOME Shell versions are 48–51: Debian 13 ships GNOME 48, and current Ubuntu/Fedora releases ship GNOME 51. Older GNOME releases are outside this change. Traditional package-based Fedora is supported; rpm-ostree/image-based variants are not.

The project is **Package Updates** at [V9EQ/package-updates](https://github.com/V9EQ/package-updates), with UUID `package-updates@v9eq.github.io` and schema ID `org.gnome.shell.extensions.package-updates`. Settings are stored under `/org/gnome/shell/extensions/package-updates/`.

## Implementation boundaries

- `platform.js`: OS identification through `GLib.get_os_info()`, using `ID` first and ordered `ID_LIKE` fallback. Never execute `/etc/os-release` as shell code. Reject unsupported/image-based systems instead of guessing from installed executables.
- `command.js`: one cancellable, timeout-bounded command runner. No shell interpolation, elevated privileges or package-changing commands.
- `backends/arch`, `backends/ubuntu`, `backends/debian`, `backends/fedora`: distribution adapters with the same public methods and README format. Ubuntu and Debian share an APT implementation under `backends/apt`.
- `services.js`: select the adapter and expose a common service interface to the Shell.
- `monitor.js`: shared debounced database-change notifications where appropriate. Arch waits for `db.lck` to disappear and checks the pacman log for upgrades. Persistent APT/RPM lock files must not be treated like pacman's removable `db.lck`.
- Opt-in AUR updates are an **Arch-only capability**.
- The optional Flatpak source is independent of native backends and owns its command runner. Its results share the update counter but have separate menu details.
- Preserve independent source cancellation, last-known results, concise error messages and deduplicated diagnostic logs.

APT's simulated upgrade counts planned upgrades of already-installed packages, not held-back packages or newly installed dependencies. It is not a claim that remote indexes were just refreshed. Fedora's count must use DNF5's documented structured output, validate exit codes, and reject unavailable repositories rather than silently count an incomplete result. No apt CLI scraping or DNF4 text fallback.

## Repository and installed layout

Keep source code under `src/`, with `icons/` and `schemas/` at repository root. Build into an ignored staging directory before invoking `gnome-extensions pack`.

The installed archive must still contain `extension.js`, `metadata.json`, `prefs.js`, `stylesheet.css`, `icons/` and `schemas/` at its root. `schemas/` is a runtime convention; `src/` is a repository convention. Neither GNOME nor the pack command requires resources to live above source files in the repository.

Backend README files are development documentation and should not be included in the runtime archive. Use the same headings for every backend: **Support**, **Requirements**, **Update query**, **Metadata freshness**, **Change detection**, **Limitations**, **References**.

## Delivery stages

1. Record current references and design decisions.
2. Extract the command runner and Arch adapter; introduce system detection and resource staging.
3. Add Ubuntu/Debian APT and Fedora DNF5 adapters.
4. Connect detection, capabilities and database monitoring to the interface and preferences.
5. Complete uniform documentation and validate syntax, schemas and archive layout.
6. Rename the GitHub repository, refresh About/topics and project URLs, and push the completed stages.

Commit each stage separately. Do not add tests unless explicitly requested. Syntax checking and packaging are not a claim that another OS was run. Do not install packages, refresh the host's system package indexes, change network settings or launch a separate Shell session as part of this work.

## References

### Distribution releases

- [Ubuntu current releases](https://ubuntu.com/project/docs/release-team/list-of-releases/)
- [Ubuntu 26.10 release notes](https://documentation.ubuntu.com/release-notes/26.10/)
- [Debian stable release](https://www.debian.org/releases/stable/)
- [Debian 13 desktop versions](https://www.debian.org/releases/trixie/release-notes/whats-new.en.html)
- [Fedora 45 announcement](https://fedoramagazine.org/announcing-fedora-linux-45/)
- [Fedora Workstation 45 / GNOME 51](https://fedoramagazine.org/whats-new-fedora-workstation-45/)
- [Arch rolling release model](https://archlinux.org/about/)

### Interfaces

- [os-release specification](https://www.freedesktop.org/software/systemd/man/latest/os-release.html)
- [GLib.get_os_info](https://docs.gtk.org/glib/func.get_os_info.html)
- [checkupdates manual](https://man.archlinux.org/man/checkupdates.8.en)
- [Ubuntu package management](https://ubuntu.com/server/docs/how-to/software/package-management)
- [Debian apt-get manual](https://manpages.debian.org/trixie/apt/apt-get.8.en.html)
- [Debian package-management reference](https://www.debian.org/doc/manuals/debian-reference/ch02.en.html)
- [DNF5 check-upgrade JSON and exit codes](https://dnf5.readthedocs.io/en/latest/commands/check-upgrade.8.html)
- [DNF5 global options](https://dnf5.readthedocs.io/en/latest/dnf5.8.html)
- [DNF5 cache behavior](https://dnf5.readthedocs.io/en/stable/misc/caching.7.html)

### GNOME

- [Extension anatomy and installed layout](https://gjs.guide/extensions/overview/anatomy.html)
- [Schemas and automatic compilation](https://gjs.guide/extensions/development/preferences.html)
- [gnome-extensions pack source-directory semantics](https://manpages.debian.org/trixie/gnome-shell/gnome-extensions.1.en.html)
- [GNOME 48 porting guide](https://gjs.guide/extensions/upgrading/gnome-shell-48.html)
- [GNOME 49 porting guide](https://gjs.guide/extensions/upgrading/gnome-shell-49.html)
- [GNOME 50 porting guide](https://gjs.guide/extensions/upgrading/gnome-shell-50.html)
- [GNOME 51 porting guide](https://gjs.guide/extensions/upgrading/gnome-shell-51.html)
