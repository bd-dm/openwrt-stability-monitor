# OpenWrt Stability Monitor

LuCI application and background service for monitoring IPv4 WAN connectivity on
OpenWrt. It continuously pings configured IPv4 targets through one selected
OpenWrt network interface, records summarized outage and latency data, and shows
the current status in LuCI.

This package is intended for OpenWrt 25.12 and newer systems using APK packages.

## Target Device

The included GitHub Actions workflow builds APK artifacts for:

- OpenWrt target: `rockchip/armv8`
- Package architecture: `all`
- Example device: FriendlyElec NanoPi R6S

The package itself is architecture-independent LuCI and shell code, but it is
built with the matching OpenWrt SDK for the target platform.

## Package feed

The signed OpenWrt 25.12+ APK feed is published at:

```text
https://bd-dm.github.io/openwrt-stability-monitor/packages.adb
```

Its public signing key is available at:

```text
https://bd-dm.github.io/openwrt-stability-monitor/stability-monitor.pem
```

### Add the feed to OpenWrt

OpenWrt must trust the feed signing key before it will accept the repository.
OpenWrt 25.12 LuCI does not currently provide a signing-key import control, so
the initial enrollment requires one short SSH session. Installation and future
updates can then be performed entirely through LuCI.

1. Connect to the router:

   ```sh
   ssh root@192.168.1.1
   ```

2. Download the public signing key into APK's trusted-key directory:

   ```sh
   wget -O /etc/apk/keys/stability-monitor.pem \
     https://bd-dm.github.io/openwrt-stability-monitor/stability-monitor.pem
   ```

3. Register the package index:

   ```sh
   printf '%s\n' \
     'https://bd-dm.github.io/openwrt-stability-monitor/packages.adb' \
     > /etc/apk/repositories.d/stability-monitor.list
   ```

4. Open **LuCI → System → Software** and click **Update lists**.

5. Search for `luci-app-stability-monitor` in the available packages and click
   **Install**. Log out and back in if the new menu does not appear immediately.

### Update through LuCI

Open **LuCI → System → Software**, click **Update lists**, switch to the
installed/upgradable package view, and upgrade `luci-app-stability-monitor`.
The UCI configuration at `/etc/config/stability-monitor` is preserved across
package updates.

### Remove the feed

Removing the repository does not uninstall the package. To stop receiving
updates from this feed, delete its repository file and optionally its trusted
key:

```sh
rm /etc/apk/repositories.d/stability-monitor.list
rm /etc/apk/keys/stability-monitor.pem
```

The feed URLs start working after the first release containing the feed
publishing workflow has completed successfully.

## Release downloads

1. Open this repository on GitHub.
2. Go to **Releases**.
3. Download the latest `luci-app-stability-monitor-*.apk` asset.

The workflow also keeps a copy as a GitHub Actions artifact, but releases are
the easiest place to download installable builds.

## Versioning and Releases

The project uses [Semantic Versioning](https://semver.org/) and Release Please.
Version bumps, `CHANGELOG.md`, Git tags, and GitHub releases are automated from
Conventional Commit messages merged into `main`:

- `fix:` creates a patch release.
- `feat:` creates a minor release.
- A `BREAKING CHANGE:` footer or `!` after the commit type creates a major
  release.
- Other commit types, such as `docs:`, do not trigger a version bump by
  themselves.

After releasable commits reach `main`, the workflow creates or updates a release
pull request. Merging that pull request updates `version.txt`, the package
version in `Makefile`, and `CHANGELOG.md`, then creates a `vX.Y.Z` GitHub release
and attaches the built APK. `PKG_RELEASE` remains the OpenWrt packaging revision
and should only be increased when packaging changes without a new upstream
version.

## Local installation fallback

Copy the APK to the router:

```sh
scp luci-app-stability-monitor-*.apk root@192.168.1.1:/tmp/
```

SSH into the router:

```sh
ssh root@192.168.1.1
```

Install the package:

```sh
apk add --allow-untrusted /tmp/luci-app-stability-monitor-*.apk
```

Restart LuCI if the menu does not appear immediately:

```sh
/etc/init.d/uhttpd restart
```

## About `UNTRUSTED signature`

If you install through LuCI upload or run `apk add /tmp/upload.apk`, OpenWrt may
show:

```text
ERROR: /tmp/upload.apk: UNTRUSTED signature
```

This happens because the APK was built by GitHub Actions as a standalone release
asset, not from a signed OpenWrt package feed trusted by your router.

For this package, install the downloaded local APK with:

```sh
apk add --allow-untrusted /tmp/luci-app-stability-monitor-*.apk
```

Only use `--allow-untrusted` for APK files you intentionally downloaded from
this repository's releases or built yourself.

## Use

After installation, open LuCI:

```text
Status -> Stability Monitor
```

The settings page is available at:

```text
Status -> Stability Monitor -> Settings
```

Default configuration:

- Enabled: yes
- Monitored interface: `wan`
- Ping targets: `1.1.1.1 8.8.8.8`
- Probe interval: `1` second
- Ping timeout: `1` second
- Outage starts after: `3` consecutive failures
- Recovery starts after: `3` consecutive successes
- Storage path: `/etc/stability-monitor`
- Retention: `30` days

The monitor sends IPv4 pings through the selected OpenWrt network interface.
Choose the logical interface that represents the WAN path you want to monitor,
for example `wan`, `pppoe-wan`, or another interface from your router config.

## Service Commands

The background service is named `stability-monitor`.

Check status:

```sh
/etc/init.d/stability-monitor status
```

Start, stop, restart, or reload:

```sh
/etc/init.d/stability-monitor start
/etc/init.d/stability-monitor stop
/etc/init.d/stability-monitor restart
/etc/init.d/stability-monitor reload
```

Enable or disable startup on boot:

```sh
/etc/init.d/stability-monitor enable
/etc/init.d/stability-monitor disable
```

Read current JSON status from the command line:

```sh
stability-monitor-status json
```

View service logs:

```sh
logread -e stability-monitor
```

## Configuration File

The UCI config file is:

```text
/etc/config/stability-monitor
```

Example:

```text
config monitor 'monitor'
	option enabled '1'
	option interface 'wan'
	option targets '1.1.1.1 8.8.8.8'
	option interval '1'
	option timeout '1'
	option fail_threshold '3'
	option recovery_threshold '3'
	option retention_days '30'
	option storage_path '/etc/stability-monitor'
	option flush_seconds '60'
```

After editing manually, reload the service:

```sh
/etc/init.d/stability-monitor reload
```

## Stored Data

Persistent summary data is stored under the configured `storage_path`, which is
`/etc/stability-monitor` by default.

Files:

- `minute-buckets.jsonl`: summarized probe, latency, and packet-loss buckets
- `outages.jsonl`: recorded outage events

Runtime status is stored under:

```text
/var/run/stability-monitor/status.json
```

## Uninstall

Remove the package:

```sh
apk del luci-app-stability-monitor
```

Remove retained monitoring data if you no longer need it:

```sh
rm -rf /etc/stability-monitor
```
