# Ubuntu backend

## Support

Ubuntu 26.10 and 26.04 LTS are the release references reviewed for this backend. GNOME Shell 48–51 is required. Ubuntu 24.04's default GNOME 46 is outside the Shell compatibility range. Ubuntu derivatives selected through `ID_LIKE` are best-effort targets.

## Requirements

- APT, including `apt-get`
- Existing readable repository indexes and the dpkg database
- GNU `timeout` from coreutils
- Standard GNOME/GJS runtime dependencies listed in the main README

```sh
sudo apt install apt gir1.2-soup-3.0
```

## Update query

Ubuntu uses the [shared APT implementation](../apt/README.md):

```sh
apt-get indextargets --format '$(FILENAME)' 'Identifier: Packages'
apt-get --simulate -o Debug::NoLocking=true -o APT::Color=0 upgrade
```

These commands do not update indexes or install packages. The first verifies that package indexes exist. The second reports planned upgrades of already-installed packages. Installed and candidate versions are parsed from `Inst` records and checked against the upgrade summary. Exit 0 is success; APT errors, including exit 100, are failures.

## Metadata freshness

Counts reflect existing APT indexes. The extension never runs `sudo apt update`, invokes an authentication dialog, or starts a distribution upgrade. Index freshness depends on Ubuntu's normal update services or administrator actions. The check interval controls how often indexes are queried, not how often the repositories are synchronized.

## Change detection

The shared backend monitors atomic replacements and changes of `/var/lib/dpkg/status`, coalescing writes for 1.5 seconds. Persistent APT/dpkg lock files are not checked for existence. A long transaction can produce intermediate notifications; later database writes schedule another read. Cancelling before dpkg changes its status file does not trigger a package recount.

## Limitations

- Held-back packages, upgrades requiring new dependencies, and packages deferred by Ubuntu's phased-update policy may not be included in the simulated `apt-get upgrade` plan.
- The count is not a list of every newer remote candidate or a complete `full-upgrade` plan.
- Snap and release upgrades are not counted.
- Nonstandard dpkg administrative directories are not monitored. Periodic checks still use APT configuration.
- APT simulation runs without locks and is not an atomic transaction snapshot; unreadable private APT configuration can affect unprivileged queries.

## References

Reviewed 2026-11-16:

- [Ubuntu current releases](https://ubuntu.com/project/docs/release-team/list-of-releases/)
- [Ubuntu 26.10 release notes](https://documentation.ubuntu.com/release-notes/26.10/)
- [Ubuntu package management](https://ubuntu.com/server/docs/how-to/software/package-management)
- [apt-get manual](https://manpages.debian.org/trixie/apt/apt-get.8.en.html)
- [Shared APT implementation](../apt/README.md)
