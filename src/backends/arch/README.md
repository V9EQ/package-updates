# Arch Linux backend

## Support

Arch Linux rolling release with GNOME Shell 48–51. Arch-like distributions selected through `ID_LIKE` are best-effort targets.

## Requirements

- `pacman`, including `pacman-conf` and `vercmp`
- `pacman-contrib` for `checkupdates` and its `fakeroot` dependency
- GNU `timeout` from coreutils
- libsoup 3 and its GJS introspection data for AUR requests

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

Optional **AUR updates** reads `pacman -Qm`, queries AUR RPC v5 in batches and compares versions with `vercmp`. Exit 1 follows the same empty-result rule as above. It counts installed packages with newer published AUR versions; names absent from AUR are excluded. No helper, additional dependency or PKGBUILD execution is required.

## Metadata freshness

`checkupdates` refreshes its separate repository database without synchronizing the system database. The local post-transaction query uses pacman's own existing sync metadata.

AUR checks refresh an in-memory cache. Database-change recounts reuse it without HTTP; newly installed names without cache entries require a scheduled/manual refresh. Failed checks retain the last result.

## Change detection

`pacman-conf DBPath` supplies the database directory. The backend monitors changes under `local/` and waits for the removable `db.lck` to disappear, then coalesces events for 750 ms. A cancelled confirmation with no database writes does not trigger a recount. If a failed transaction changed packages, the next read reflects those actual changes rather than assuming an all-or-nothing rollback.

## Limitations

- AUR checks send foreign package names, including private/local names, to aur.archlinux.org (4000 requests/day/IP).
- AUR does not track new VCS commits or apply pacman's ignore rules. Packages in configured binary repositories are not foreign.
- Missing dependencies or database locks are errors, not zero updates.

## References

AUR references reviewed 2026-11-20; other references reviewed 2026-11-16:

- [Arch rolling release model](https://archlinux.org/about/)
- [checkupdates manual and exit codes](https://man.archlinux.org/man/checkupdates.8.en)
- [pacman manual](https://man.archlinux.org/man/pacman.8.en)
- [pacman-conf manual](https://man.archlinux.org/man/pacman-conf.8.en)
- [AUR RPC v5, batching and request limits](https://wiki.archlinux.org/title/Aurweb_RPC_interface)
- [vercmp comparison semantics](https://man.archlinux.org/man/vercmp.8.en)
