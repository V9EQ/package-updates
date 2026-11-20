# Flatpak source

## Support

Independent of the distribution backend. The preference appears only when `flatpak` is installed and is disabled by default.

## Requirements

The `flatpak` CLI with `list --columns` and `remote-ls --updates` support. No additional helper or elevated permissions are needed.

## Update query

`flatpak list --all --columns=installation` discovers installations with deployed refs. Each is checked with `remote-ls --updates --all --arch=* --columns=ref,origin`, using `--user`, `--system` or `--installation=NAME`. Plain, tab-separated output is requested. Nonzero exits, stderr diagnostics and malformed rows fail the check.

Counts include applications, runtimes and extensions, keyed by installation and full ref. Flatpak compares commits, not version strings. The main counter includes enabled Flatpak results; the menu lists them separately.

## Metadata freshness

Scheduled/manual checks may download remote metadata, never application packages. Failed checks retain the last successful result. Disabling cancels only Flatpak commands.

## Change detection

Scheduled and manual checks only; native package-database notifications do not trigger Flatpak requests.

## Limitations

Available ref changes are not a resolved transaction: masks, rebases and missing dependencies can make `flatpak update` differ. Disabled remotes are excluded. No repository configuration is changed.

## References

Reviewed 2026-11-20:

- [Flatpak command reference](https://docs.flatpak.org/en/latest/flatpak-command-reference.html)
- [Flatpak 1.16.1 remote-ls implementation](https://github.com/flatpak/flatpak/blob/1.16.1/app/flatpak-builtins-remote-ls.c)
