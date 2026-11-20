# Debian backend

## Support

Debian 13 (trixie), currently 13.7 in the reviewed release information. Debian 13 ships GNOME 48, within the extension's GNOME Shell 48–51 range. Debian-like distributions selected through `ID_LIKE` are best-effort targets; testing and unstable are not separate support targets.

## Requirements

- APT, including `apt-get`
- Existing readable repository indexes and the dpkg database
- GNU `timeout` from coreutils
- Standard GNOME/GJS runtime dependencies listed in the main README

```sh
sudo apt install apt gir1.2-soup-3.0
```

## Update query

Debian uses the [shared APT implementation](../apt/README.md):

```sh
apt-get indextargets --format '$(FILENAME)' 'Identifier: Packages'
apt-get --simulate -o Debug::NoLocking=true -o APT::Color=0 upgrade
```

These are read-only queries. Existing indexes are checked first. Installed-package upgrades are extracted from `Inst` records and reconciled with APT's upgrade summary. Newly installed dependencies are not counted. Exit 0 is success; other statuses, including APT's error code 100, fail the check.

## Metadata freshness

The backend reads existing indexes. It does not run `apt update`, escalate privileges, or enable/change repositories. Debian's existing update services or the administrator must maintain metadata. Increasing the check frequency does not make stale indexes current.

## Change detection

The shared backend watches `/var/lib/dpkg/status` through its parent directory so atomic replacements remain visible. Writes are coalesced for 1.5 seconds; subsequent writes during long transactions schedule further reads. Persistent lock-file existence is not used as a transaction-state signal. Cancelling before database writes does not trigger a recount.

## Limitations

- The count follows `apt-get upgrade`, not `dist-upgrade` or every newer candidate version. Held-back packages and upgrades requiring new dependencies are excluded.
- Snap, firmware and distribution-release upgrades are not included.
- Arch out-of-date reports and their preference are unavailable.
- Nonstandard dpkg administrative directories are not monitored; scheduled APT queries still work according to APT configuration.
- APT simulation does not lock the database. Concurrent package operations and unreadable private configuration can affect its view.

## References

Reviewed 2026-11-16:

- [Debian stable release information](https://www.debian.org/releases/stable/)
- [Debian 13 desktop versions](https://www.debian.org/releases/trixie/release-notes/whats-new.en.html)
- [Debian package-management reference](https://www.debian.org/doc/manuals/debian-reference/ch02.en.html)
- [apt-get manual](https://manpages.debian.org/trixie/apt/apt-get.8.en.html)
- [dpkg manual](https://manpages.debian.org/trixie/dpkg/dpkg.1.en.html)
- [Shared APT implementation](../apt/README.md)
