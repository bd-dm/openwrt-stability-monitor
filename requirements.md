# OpenWrt LuCI WAN Ping Monitor Requirements

## Purpose

Build an OpenWrt LuCI application that monitors IPv4 connectivity through one selected WAN interface continuously, records summarized stability statistics, and presents the results in a dashboard. The main goal is to collect evidence of intermittent ISP interruptions that are difficult to observe manually.

## Target Platform

- OpenWrt 25+
- LuCI web interface
- Installable as a standard OpenWrt package using `apk`
- Intended for routers with DHCP WAN, VPN, and policy-based routing in use
- Must work correctly when Passwall2 or similar routing policies are present

## Scope

### In Scope

- Monitor one WAN interface at a time
- Allow the monitored interface to be selected in settings
- IPv4 ping monitoring only
- Probe once per second
- Store summarized statistics only
- Persist collected summaries to writable storage
- Provide a LuCI dashboard for current and historical stability
- Package for installation via `apk`

### Out of Scope

- IPv6 monitoring
- DNS monitoring
- Raw per-ping history retention
- Multi-WAN simultaneous monitoring
- Notifications, webhooks, email, or messaging integrations
- Full ISP report generation in the first version

## Functional Requirements

### Interface Selection

- The user can choose exactly one OpenWrt network interface to monitor.
- The selected interface should be configurable from LuCI.
- The app must route probes through the selected WAN interface, not merely through the system default route.
- The app should support common interface names such as `wan`, `pppoe-wan`, or custom logical interfaces.
- The app should handle DHCP WAN environments.
- The app must be compatible with systems using VPN and policy-based routing, including Passwall2.

### Ping Monitoring

- The app sends IPv4 ping probes every 1 second.
- Ping targets should be configurable.
- Default targets should be stable public IPv4 addresses, for example:
  - `1.1.1.1`
  - `8.8.8.8`
- The app should allow multiple targets, but the monitored WAN interface remains singular.
- The implementation should avoid DNS dependency by default by using IP addresses.
- Ping timeout should be configurable.

### Outage Detection

- The app should avoid treating a single failed ping as a confirmed outage.
- An outage should begin only after a configurable number of consecutive failed probes.
- Recovery should be confirmed only after a configurable number of consecutive successful probes.
- Suggested defaults:
  - Outage starts after 3 consecutive failed probes
  - Recovery starts after 3 consecutive successful probes
- The app should record outage start time, end time, and duration.

### Statistics

The app should collect summarized statistics, including:

- Current status: online, degraded, or offline
- Current latency
- Average latency
- Minimum latency
- Maximum latency
- Packet loss percentage
- Outage count
- Last outage time
- Last outage duration
- Longest outage
- Total downtime

Statistics should be available for practical dashboard ranges such as:

- Last hour
- Today
- Last 24 hours
- Last 7 days
- Last 30 days

### Storage

- The app stores summarized data persistently.
- Raw per-ping samples should not be retained long-term.
- The storage format should minimize unnecessary flash writes.
- Aggregation should happen in memory and be flushed periodically.
- Suggested storage model:
  - Short interval summaries, for example 1-minute buckets
  - Longer retention summaries, for example hourly and daily rollups
  - Separate outage event records

### LuCI Dashboard

The LuCI app should provide a dashboard showing:

- Selected monitored interface
- Current monitoring state
- Current latency
- Recent packet loss
- Online/degraded/offline status
- Last outage
- Outages today
- Total downtime today
- Latency trend
- Packet loss trend
- Outage history list

The dashboard should be useful without requiring external tools or command-line access.

### LuCI Settings

The settings page should allow configuration of:

- Monitored WAN interface
- Ping target IPv4 addresses
- Probe interval, fixed by default to 1 second
- Ping timeout
- Consecutive failures required to mark outage
- Consecutive successes required to mark recovery
- Data retention period
- Storage path, if configurable

### Service Behavior

- The monitor runs as a background service.
- The service starts automatically on boot.
- The service continues running independently of LuCI.
- The service can be started, stopped, restarted, and reloaded.
- Configuration changes from LuCI should apply cleanly without requiring a router reboot.

## Non-Functional Requirements

- Low CPU usage suitable for consumer OpenWrt routers
- Low memory usage
- Minimal dependencies
- No requirement for a heavyweight database
- Must avoid disrupting routing, firewall, VPN, or Passwall2 behavior
- Must survive router reboot
- Must tolerate temporary WAN interface down states
- Must not rely on DNS for default monitoring
- Must use OpenWrt-native configuration and service patterns where possible

## Packaging Requirements

- Provide an OpenWrt package installable via `apk`.
- Include LuCI application files.
- Include backend monitoring service files.
- Include default UCI configuration.
- Include init/procd service integration.
- Package should be suitable for OpenWrt 25+.

## Suggested Architecture

- LuCI frontend for dashboard and settings
- UCI config file for persistent configuration
- procd-managed monitoring daemon or script
- ubus or JSON status endpoint for LuCI to read live status
- Persistent summarized storage for historical data

## Key Technical Concern

Because the router uses VPN and policy-based routing through Passwall2, the most important implementation detail is ensuring that ping probes actually leave through the selected WAN interface. The design must explicitly handle interface-bound or policy-aware probing instead of assuming the default routing table reflects the intended WAN path.

## MVP Acceptance Criteria

- User installs the package with `apk`.
- User opens LuCI and selects one WAN interface.
- App pings configured IPv4 targets every second through that WAN interface.
- App detects short outages using consecutive failure thresholds.
- App stores summarized statistics persistently.
- Dashboard shows current status, latency, packet loss, outage count, and outage history.
- Monitoring continues after LuCI is closed and after router reboot.
