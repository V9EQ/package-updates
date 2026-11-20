# Fedora backend

## Support

Traditional, package-based Fedora Workstation 45 with DNF5. GNOME Shell 48–51 is the extension compatibility range; Workstation 45 ships GNOME 51. Fedora derivatives are best-effort targets. Atomic desktops and rpm-ostree/bootc deployments are excluded.

## Requirements

- DNF5 with `check-upgrade --json` support
- `rpm` with a readable SQLite package database
- GNU `timeout` from coreutils
- Standard GNOME/GJS runtime dependencies listed in the main README

```sh
sudo dnf install dnf5 rpm libsoup3
```

There is no DNF4 text-output fallback. A missing JSON option is reported as a failed check rather than silently changing the query semantics.

## Update query

Regular checks:

```sh
dnf5 --quiet --assumeno --color=never \
  --setopt='*.skip_if_unavailable=False' check-upgrade --json
```

Database-change checks add `--cacheonly` and make no metadata-download request. The option override is command-local; repository configuration is not rewritten. `--assumeno` prevents interactive confirmations, including missing repository-key approval.

The backend reads the documented JSON package sections and deduplicates top-level candidates by name and architecture. An upgrade candidate repeated in an obsoletes section is counted once. Nested obsoleted-package lists do not create extra entries. This is a count of available upgrade/replacement candidates, not a transaction solver's final install/remove plan.

DNF documents status 100 when updates exist and 0 when none exist. JSON-mode implementations can return 0 immediately after printing structured output, so both statuses are parsed. Other statuses fail. Invalid JSON and contradictory non-empty-update statuses are errors, never an assumed zero.

## Metadata freshness

Unprivileged DNF5 uses its user cache, normally `~/.cache/libdnf5`, and may clone readable root metadata. Regular checks follow DNF's metadata-expiration configuration and may download expired/missing metadata. They do not force a repository refresh on every check. Post-change checks use cache only. Missing/unavailable enabled repositories are not silently skipped.

## Change detection

`rpm --eval '%{_dbpath}'` supplies the RPM database path. Changes to `rpmdb.sqlite` and `rpmdb.sqlite-wal` are coalesced for 1.5 seconds. Shared-memory and lock files are deliberately ignored to avoid false notifications from readers. Later writes during a long transaction can schedule another query; this is not a separate transaction-completion API.

## Limitations

- Image-based Fedora systems, DNF4-only installations and legacy non-SQLite RPM databases are outside this backend's scope.
- A cache-only check can fail until metadata is available; the previous count is kept rather than replaced with zero.
- Counts follow DNF repository/exclude configuration and may differ from a subsequent solved transaction.
- Firmware and Fedora release upgrades are not included.
- Arch out-of-date reports and their preference are unavailable.

## References

Reviewed 2026-11-16:

- [Fedora 45 release announcement](https://fedoramagazine.org/announcing-fedora-linux-45/)
- [Fedora Workstation 45 / GNOME 51](https://fedoramagazine.org/whats-new-fedora-workstation-45/)
- [DNF5 package versions](https://packages.fedoraproject.org/pkgs/dnf5/dnf5/index.html)
- [check-upgrade JSON and exit codes](https://dnf5.readthedocs.io/en/latest/commands/check-upgrade.8.html)
- [DNF5 options](https://dnf5.readthedocs.io/en/latest/dnf5.8.html)
- [DNF5 configuration](https://dnf5.readthedocs.io/en/latest/dnf5.conf.5.html)
- [DNF5 cache behavior](https://dnf5.readthedocs.io/en/stable/misc/caching.7.html)
- [check-upgrade implementation](https://github.com/rpm-software-management/dnf5/blob/main/dnf5/commands/check-upgrade/check-upgrade.cpp)
- [JSON sections implementation](https://github.com/rpm-software-management/dnf5/blob/main/libdnf5-cli/output/package_list_sections.cpp)
