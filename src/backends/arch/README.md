# Arch Linux backend

## Support

Arch Linux rolling release with GNOME Shell 48–51. Arch-like distributions selected through `ID_LIKE` are best-effort targets. The optional out-of-date source always refers to Arch repositories, not derivative-specific packages.

## Requirements

- `pacman`, including `pacman-conf`
- `pacman-contrib` for `checkupdates` and its `fakeroot` dependency
- GNU `timeout` from coreutils
- libsoup 3 and its GJS introspection data for GitLab requests

```sh
sudo pacman -S --needed pacman-contrib libsoup3
```

## Update query

Regular checks:

```sh
checkupdates --nocolor
```

`CHECKUPDATES_DB` is set to `$XDG_CACHE_HOME/package-updates/checkupdates`, defaulting to `~/.cache/package-updates/checkupdates`. Exit 0 contains updates, 2 means no updates, and other statuses are errors.

After an installed-package change:

```sh
pacman -Qu
```

This is read-only. Exit 1 is treated as an empty result only if both output streams are empty. Package previews show the installed and candidate versions; ignored-package lines are excluded consistently with checkupdates.

The optional second query uses the public Arch GitLab group issues API with `state=opened` and `package::out-of-date`. It fetches all pages, deduplicates by project and counts package bases, not binary packages or installed packages.

## Metadata freshness

`checkupdates` refreshes its separate repository database without synchronizing the system database. The local post-transaction query uses pacman's own existing sync metadata. GitLab samples are fetched on each enabled check; there is no stored history or partial-count fallback.

## Change detection

`pacman-conf DBPath` supplies the database directory. The backend monitors changes under `local/` and waits for the removable `db.lck` to disappear, then coalesces events for 750 ms. A cancelled confirmation with no database writes does not trigger a recount. If a failed transaction changed packages, the next read reflects those actual changes rather than assuming an all-or-nothing rollback.

## Limitations

- AUR updates are not counted.
- GitLab flags do not mean an upgrade is already available through pacman.
- Out-of-date reports cover all Arch package bases, even on an Arch derivative.
- GitLab scans are paginated live views, not atomic snapshots. Network, rate-limit and format errors retain the last successful result.
- Missing dependencies or database locks are errors, not zero updates.

## References

Reviewed 2026-11-16:

- [Arch rolling release model](https://archlinux.org/about/)
- [checkupdates manual and exit codes](https://man.archlinux.org/man/checkupdates.8.en)
- [pacman manual](https://man.archlinux.org/man/pacman.8.en)
- [pacman-conf manual](https://man.archlinux.org/man/pacman-conf.8.en)
- [Arch out-of-date reports](https://gitlab.archlinux.org/groups/archlinux/packaging/packages/-/issues?state=opened&label_name%5B%5D=package%3A%3Aout-of-date)
