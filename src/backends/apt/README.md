# Shared APT backend

## Support

Internal implementation shared by the Ubuntu and Debian adapters. It is not an extra distribution selector. See the [Ubuntu](../ubuntu/README.md) and [Debian](../debian/README.md) release targets.

## Requirements

- APT commands and readable repository/dpkg metadata
- GNU coreutils for command timeouts
- The shared GJS runtime

No Python bindings, PackageKit service, privileged helper or shell script is required.

## Update query

```sh
apt-get indextargets --format '$(FILENAME)' 'Identifier: Packages'
apt-get --simulate -o Debug::NoLocking=true -o APT::Color=0 upgrade
```

Index-target paths are obtained from APT, not constructed from source-list names. At least one existing package index is required. The literal `$(FILENAME)` is passed as an argv element, never evaluated by a shell.

The simulation is executed with `LC_ALL=C`. Only `Inst name [installed-version] (candidate-version ...)` records contribute to the count. New-package records without an installed version are not counted. Package identities retain any architecture qualification. Results are deduplicated and checked against the English summary's upgraded-package total. Unexpected formats fail instead of yielding a partial or zero count.

APT exit 100 is an error; it must not be confused with DNF's available-updates status 100. The interactive `apt list` output is not parsed.

## Metadata freshness

No remote metadata refresh is performed. Existing indexes may be stale or incomplete; their presence is not proof that every configured repository was recently synchronized. OS update services or the administrator are responsible for normal index maintenance.

## Change detection

A directory monitor filters `/var/lib/dpkg/status` events, including rename destinations, and debounces for 1.5 seconds. No idle polling is introduced. APT/dpkg lock files are persistent advisory locks, so checking their presence would incorrectly block every refresh.

Notifications are best-effort database-change signals, not proof that a whole transaction finished. Long transactions can produce intermediate views, followed by another query after further writes. The common refresh queue prevents older in-flight reads from remaining the final result.

## Limitations

- The query describes the conservative `apt-get upgrade` plan, not all repository candidates or `full-upgrade`.
- Held-back/dependency-changing/phased updates can be absent from that plan.
- Simulation disables locking; concurrent changes or private unreadable configuration may affect results.
- A nonstandard dpkg administrative directory is not monitored.
- The adapter does not modify repository definitions, APT hooks or system timers.

## References

Reviewed 2026-11-16:

- [apt-get simulation, index targets and diagnostics](https://manpages.debian.org/trixie/apt/apt-get.8.en.html)
- [APT index-target format, existing filenames and compression](https://github.com/Debian/apt/blob/main/doc/acquire-additional-files.md)
- [Debian APT scripting recommendation](https://www.debian.org/doc/manuals/debian-reference/ch02.en.html)
- [dpkg status and administrative database](https://manpages.debian.org/trixie/dpkg/dpkg.1.en.html)
- [GIO directory monitoring](https://docs.gtk.org/gio/method.File.monitor_directory.html)
