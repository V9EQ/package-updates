# Arch Linux backend

## Support

Arch Linux rolling release with GNOME Shell 48–51. Arch-like distributions selected through `ID_LIKE` are best-effort targets. The optional out-of-date source always refers to Arch repositories, not derivative-specific packages.

## Requirements

- `pacman`, including `pacman-conf` and `vercmp`
- `pacman-contrib` for `checkupdates` and its `fakeroot` dependency
- GNU `timeout` from coreutils
- libsoup 3 and its GJS introspection data for GitLab and AUR requests

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

The optional out-of-date query uses the public Arch GitLab group issues API with `state=opened` and `package::out-of-date`. It fetches all pages, deduplicates by project and counts package bases, not binary packages or installed packages.

The independent, opt-in **AUR updates** source runs `pacman -Qm` to read installed foreign package names and versions, then queries `https://aur.archlinux.org/rpc/v5/info` with repeated `arg[]` parameters. Exit 1 from `pacman -Qm` means no foreign packages only when both output streams are empty. Foreign names missing from AUR are excluded, not treated as errors. Counts are per installed binary package, including split packages, not per package base. No `yay`, `paru`, `curl`, `jq` or additional dependencies are used.

AUR requests include a user agent and are sent sequentially in batches of at most 100 names with URLs no longer than 4000 bytes. HTTP errors, bot-protection HTML, malformed responses and duplicate/unrequested entries fail the whole check. Versions are compared with pacman's `vercmp`, including epoch and pkgrel semantics; only negative comparisons (installed older than AUR) count. Identical strings require no subprocess. `vercmp` must exit 0 with an integer on stdout. No PKGBUILD is downloaded or executed. Previews link to the corresponding AUR package page.

## Metadata freshness

`checkupdates` refreshes its separate repository database without synchronizing the system database. The local post-transaction query uses pacman's own existing sync metadata. GitLab samples are fetched on each enabled check; there is no stored history or partial-count fallback.

AUR metadata is fetched on each enabled scheduled/manual check and cached only in memory after a completely successful check. After a database change, installed versions are compared with that cache without making HTTP requests. A newly installed foreign name absent from the cache marks the result stale until the next scheduled/manual refresh; removals and version changes of known names can be recounted immediately. Cache entries also remember names not found in AUR. Enabling AUR checks starts a remote check immediately; disabling cancels AUR commands and requests without affecting other sources. Disabling the entire extension discards the cache.

## Change detection

`pacman-conf DBPath` supplies the database directory. The backend monitors changes under `local/` and waits for the removable `db.lck` to disappear, then coalesces events for 750 ms. A cancelled confirmation with no database writes does not trigger a recount. If a failed transaction changed packages, the next read reflects those actual changes rather than assuming an all-or-nothing rollback.

## Limitations

- AUR checks are disabled by default. Enabling them sends the names of installed foreign packages, including locally built/private names, to aur.archlinux.org.
- AUR counts published recipe versions, not upstream releases or new commits for `*-git`/other VCS packages. The AUR out-of-date flag alone does not imply an available update.
- AUR does not resolve dependencies, apply pacman's IgnorePkg/IgnoreGroup rules, detect renames/replacements or check AUR packages served through configured binary repositories (these are not foreign).
- AUR's documented limit is 4000 requests per day per IP. Short polling intervals and large foreign-package lists can exceed it, especially behind a shared IP; there are no automatic retries.
- GitLab flags do not mean an upgrade is already available through pacman.
- Out-of-date reports cover all Arch package bases, even on an Arch derivative.
- GitLab scans are paginated live views, not atomic snapshots. Network, rate-limit and format errors retain the last successful result.
- Missing dependencies or database locks are errors, not zero updates.

## References

AUR references reviewed 2026-11-20; other references reviewed 2026-11-16:

- [Arch rolling release model](https://archlinux.org/about/)
- [checkupdates manual and exit codes](https://man.archlinux.org/man/checkupdates.8.en)
- [pacman manual](https://man.archlinux.org/man/pacman.8.en)
- [pacman-conf manual](https://man.archlinux.org/man/pacman-conf.8.en)
- [AUR RPC v5, batching and request limits](https://wiki.archlinux.org/title/Aurweb_RPC_interface)
- [vercmp comparison semantics](https://man.archlinux.org/man/vercmp.8.en)
- [libsoup asynchronous HTTP and cancellation](https://libsoup.gnome.org/libsoup-3.0/method.Session.send_and_read_async.html)
- [Arch out-of-date reports](https://gitlab.archlinux.org/groups/archlinux/packaging/packages/-/issues?state=opened&label_name%5B%5D=package%3A%3Aout-of-date)
