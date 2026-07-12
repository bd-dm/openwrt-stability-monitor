# Traffic Monitor Requirements

## Purpose

Add optional passive traffic analysis to Stability Monitor so an administrator
can investigate why websites and Internet services are intermittently slow. The
feature should observe routed traffic, derive connection-level timing and
quality signals, correlate them with existing WAN stability data, and present
summarized results in LuCI.

The feature must complement, not replace, the existing active ping monitor. It
must remain disabled by default and must not affect routing when disabled.

## Goals

- Identify whether slowness is associated with DNS resolution, TCP connection
  establishment, TLS negotiation, waiting for the first server data, packet
  loss, or slow transfer.
- Break results down by LAN client, hostname or domain when observable, remote
  IP address, protocol, and time range.
- Correlate slow connections with existing WAN latency, packet loss, degraded
  periods, and outages.
- Retain compact summaries suitable for an OpenWrt router without retaining
  packet payloads or a permanent packet capture.
- Clearly communicate measurement confidence and the limits imposed by
  encryption, multiplexing, tunnels, and connection reuse.

## Non-Goals

- Decrypting HTTPS, TLS, QUIC, VPN, or other encrypted traffic.
- Acting as a transparent proxy or installing a local certificate authority.
- Recording URLs, HTTP bodies, cookies, credentials, or complete packets.
- Reproducing browser rendering metrics such as DOM processing, JavaScript
  execution, Largest Contentful Paint, or page load completion.
- Guaranteeing hostname attribution for every connection.
- Providing intrusion detection, content filtering, parental controls, or
  traffic shaping.
- Exporting collected data to a cloud service in the initial version.

## Terminology

- **Flow**: A bidirectional conversation identified by source and destination
  addresses, source and destination ports, IP protocol, and observation point.
- **Network-observed timing**: A timing derived from packets visible to the
  router. It is an estimate and is not necessarily equal to a browser's timing.
- **Client**: A LAN device originating routed traffic.
- **Hostname attribution**: Association of a flow with a hostname using visible
  protocol information or a recent client-specific DNS answer.
- **Slow event**: A completed or expired flow whose timing, loss, or transfer
  metric exceeds a configured or automatically derived threshold.

## Configuration Requirements

### Traffic Analysis Toggle

- Add an **Enable traffic analysis** toggle to the existing Settings page.
- The UCI option should be named `traffic_monitor_enabled`.
- The default value must be `0` (disabled).
- Enabling or disabling the option must apply through the existing service
  reload/restart behavior without requiring a router reboot.
- When disabled:
  - No traffic capture or flow-analysis process may run.
  - No new traffic-analysis records may be written.
  - Existing stored history must remain available until reset or expired by
    retention policy.
  - The existing ping monitor must continue operating normally.
- The setting must explain that traffic analysis uses additional CPU and memory
  and observes connection metadata.

### Observation Point

- The initial default observation point should follow the interface configured
  for Stability Monitor where technically appropriate.
- The implementation must distinguish an OpenWrt logical network name from its
  resolved Linux device name.
- If observing the WAN device would hide pre-NAT client identity or original
  destinations, the implementation may use a LAN-side or firewall-hook
  observation point while limiting analysis to forwarded Internet traffic.
- Locally generated router traffic and LAN-to-LAN traffic should be excluded by
  default.
- The current observation point and resolved device must be visible in the
  Traffic Analysis UI.
- The implementation must document behavior with bridges, VLANs, PPPoE, VPNs,
  Passwall2 or similar policy routing, software flow offloading, and hardware
  flow offloading.

### Retention and Resource Controls

- Traffic-analysis retention should default to the existing monitor retention
  period unless a separate value is introduced later.
- Configuration must include conservative limits for:
  - Maximum simultaneously tracked flows.
  - Flow idle timeout.
  - Maximum hostname mappings.
  - Maximum stored domain/IP groups per time bucket.
- Limits must be bounded even when configuration is invalid or malicious.
- Resource-limit exhaustion must drop or aggregate observations gracefully; it
  must never disrupt forwarding.

## Functional Requirements

### Flow Collection

- Track forwarded IPv4 TCP flows in the first implementation.
- The design should permit later IPv6 and UDP/QUIC support without changing the
  stored schema incompatibly.
- For each observable TCP flow, collect where available:
  - Start and end timestamps.
  - Client IP address and, when available, MAC address or DHCP hostname.
  - Remote IP address and port.
  - Transport and detected application protocol.
  - Connection outcome: established, reset, refused, timed out, incomplete, or
    evicted because of a resource limit.
  - Bytes and packets in each direction.
  - Flow duration and idle periods.
  - TCP connection establishment time from initial SYN to SYN/ACK.
  - Retransmission or loss indicators observable at the collection point.
  - First client application-data timestamp.
  - First server application-data timestamp.

### DNS Timing and Attribution

- Observe plaintext DNS over UDP or TCP when it crosses the selected collection
  point.
- Measure DNS response time by matching a query to its response.
- Associate DNS answers with the requesting client, hostname, returned address,
  response code, and bounded expiration time.
- Use the client-specific DNS mapping as one possible source of later flow
  hostname attribution.
- Do not assume a DNS-derived hostname uniquely owns an IP address.
- DNS over HTTPS, DNS over TLS, DNS inside a VPN, cached DNS results, and DNS
  requests made outside the observation point must be reported as unobservable,
  not as zero-duration DNS.

### TLS Timing and Attribution

- Detect a visible TLS handshake without decrypting application data.
- When visible, extract only metadata required for analysis, such as:
  - Server Name Indication (SNI).
  - TLS version.
  - Negotiated or offered ALPN when practical.
- Estimate TLS negotiation time using visible handshake boundaries.
- Encrypted Client Hello (ECH), resumed sessions, zero-round-trip data,
  incomplete capture, and other ambiguous cases must be marked accordingly.
- TLS SNI should take precedence over DNS inference for hostname attribution
  when the value is visible and valid.

### First Server Data and Transfer Timing

- Record time from first client application data to first server application
  data when both are observable.
- Present this as **first server data**, not guaranteed HTTP TTFB.
- Record transfer duration, average observed throughput, and significant stalls
  when practical.
- For multiplexed HTTP/2 connections, connection reuse, and encrypted QUIC
  streams, the system must not claim request-level timing that it cannot
  observe.

### Hostname Attribution

- A flow may be labeled using, in descending preference:
  1. Visible TLS SNI or another directly observed application hostname.
  2. A recent client-specific DNS answer containing the remote address.
  3. The remote IP address only.
- Every attributed hostname must include a source and confidence level such as
  `direct/high`, `dns/medium`, or `ip_only/none`.
- Ambiguous mappings should remain ambiguous or IP-only instead of selecting an
  arbitrary hostname.
- Reverse DNS must not be treated as authoritative hostname attribution.

### Aggregation and Correlation

- Keep active flows and short-lived protocol correlation state in memory.
- Persist summaries rather than raw packets or indefinite per-flow history.
- Aggregate by configurable or implementation-defined time buckets, initially
  one minute, with at least:
  - Flow count and failed-flow count.
  - Median and high-percentile TCP connect time.
  - Median and high-percentile DNS response time.
  - Median and high-percentile TLS negotiation time.
  - Median and high-percentile first-server-data time.
  - Bytes in each direction and observed throughput.
  - Retransmission/loss indicators.
  - Count of unattributed and partially observed flows.
- Percentiles must be computed with a bounded-memory algorithm or bounded
  histogram suitable for the target router.
- Summaries must support grouping by client, hostname/domain, remote IP, and
  protocol.
- Traffic buckets should be correlatable by timestamp with existing ping and
  outage buckets.
- The system should derive diagnostic hints such as:
  - DNS slow across multiple destinations.
  - TCP establishment slow across multiple destinations.
  - High retransmission indicators coinciding with increased WAN latency.
  - One hostname slow while general WAN health remains normal.
  - One client affected while other clients remain normal.
- Diagnostic hints must be described as evidence, not definitive root-cause
  conclusions.

## Traffic Analysis LuCI Tab

- Add a separate top-level tab within Stability Monitor named **Traffic
  Analysis**.
- The tab should remain visible while analysis is disabled so users can discover
  and enable the feature.
- When disabled, the tab must show:
  - That traffic analysis is disabled.
  - A short explanation of what it measures and its privacy/resource impact.
  - A link or action leading to the relevant Settings section.
  - Previously retained results, if present, clearly labeled as historical.
- When enabled, the tab must show collection state, observation point, active
  flow count, last update time, dropped/evicted observation counts, and any
  capture or compatibility warning.

### Overview View

The default Traffic Analysis view should include:

- A time-range selector, initially supporting last hour, last 24 hours, last 7
  days, and last 30 days where retention permits.
- Summary cards for flow count, failed flows, slow events, transferred bytes,
  hostname attribution coverage, and retransmission/loss indicators.
- A phase-latency timeline showing DNS, TCP connect, TLS, and first server data
  as separate series where data exists.
- Correlation with WAN latency, packet loss, degraded periods, and outages.
- A list of recent diagnostic hints and slow events.

### Domains and Destinations View

- Show a sortable table grouped by hostname/domain, falling back to remote IP.
- Include flow count, clients, failures, bytes, median and high-percentile phase
  timings, retransmission indicators, and last-seen time.
- Allow filtering by hostname/domain, remote IP, client, protocol, and outcome.
- Make attribution confidence visible.
- Selecting an entry should show its time trend and recent aggregated events,
  without exposing payload content.

### Clients View

- Show per-client flow counts, bytes, failures, slow events, timing summaries,
  and last-seen time.
- Use a DHCP hostname or configured device name when available, while retaining
  the IP/MAC identifier needed to disambiguate devices.
- Selecting a client should filter domains, destinations, and diagnostic events
  to that client.

### Measurement Explanations

- Every phase metric must have an accessible explanation of what is measured.
- Missing measurements must render as **not observed** or **not applicable**,
  never as zero.
- The UI must visibly warn when results may be incomplete because of:
  - VPN or proxy tunneling.
  - Encrypted DNS or ECH.
  - HTTP/2 connection reuse or HTTP/3/QUIC.
  - Software or hardware flow offloading.
  - Capture loss or resource-limit eviction.

## Storage Requirements

- Store traffic-analysis data separately from existing ping buckets and outage
  records.
- Use atomic writes for current status and crash-tolerant append or rotation for
  persistent summaries.
- Avoid writing an entry for every packet.
- Avoid long-term raw per-flow storage by default. A small bounded recent-event
  window may be retained for diagnosis if documented and configurable.
- Apply retention cleanup without loading the entire history into memory.
- Store schema/version information so future releases can migrate or ignore
  incompatible records safely.
- Resetting traffic-analysis history must not reset ping/outage history, and
  resetting existing stability history must not implicitly erase traffic data.

## Privacy and Security Requirements

- The feature must be opt-in and disabled by default.
- Capture only the minimum packet bytes necessary to parse required headers and
  visible handshake metadata.
- Never persist packet payloads, HTTP request paths, query strings, headers,
  cookies, credentials, or content bodies.
- Hostnames, client identifiers, and remote addresses must remain local to the
  router unless a future explicit export feature is enabled by the user.
- LuCI access must use the existing authenticated authorization model and a
  narrowly scoped rpcd ACL.
- User-controlled filters and labels must be escaped before inclusion in shell
  commands, JSON, logs, or HTML.
- Malformed packets must not crash the collector or cause unbounded allocation.
- Logs should describe collector failures without logging sensitive payloads.

## Performance and Reliability Requirements

- Forwarding must continue normally if the collector crashes, is killed, runs
  out of resources, or cannot parse traffic.
- The collector must not modify packets, firewall decisions, routes, DNS
  answers, or connection tracking state.
- CPU and memory usage must be bounded and observable in status output.
- Collection must degrade by sampling, aggregation, or eviction under load
  rather than exhausting router resources.
- The implementation should avoid shell processing in the per-packet path. A
  target-compiled collector is acceptable and likely required.
- The package must declare all new runtime and kernel dependencies explicitly.
- Enabling analysis on an unsupported device or configuration must produce an
  actionable warning and leave the existing stability monitor functional.
- Service stop, restart, configuration reload, interface reconnect, and router
  reboot must not leave capture hooks or orphaned processes behind.

## Compatibility Requirements

- Target OpenWrt 25.12 and newer, consistent with the parent project.
- Initially support the project's `rockchip/armv8` build target and NanoPi R6S
  example device.
- Account for nftables/firewall4, NAT, bridges, VLANs, DHCP WAN, PPPoE, VPNs,
  and policy routing.
- Test with Passwall2 or an equivalent policy-routing/tunneling setup.
- Detect and report when flow offloading prevents complete observation. The
  feature must not silently disable flow offloading without explicit user
  action and explanation.

## Proposed Component Boundaries

- Existing stability daemon: continue active ping monitoring and outage
  summaries without taking on packet-processing responsibilities.
- Traffic collector: optional, procd-managed process responsible for passive
  observation, bounded flow state, protocol timing, and aggregation.
- Status/data command or rpcd endpoint: validate requests and return bounded
  traffic status, summaries, filters, and detail data to LuCI.
- LuCI Settings: manage the opt-in toggle and future resource controls.
- LuCI Traffic Analysis tab: render overview, destinations/domains, clients,
  warnings, and measurement explanations.

The implementation may reuse a suitable parsing library, but the installed
feature must not require a third-party cloud service.

## Delivery Phases

### Phase 1: TCP Flow Foundation

- Default-off setting and process lifecycle.
- Bounded IPv4 TCP flow tracking.
- Client, remote IP/port, connection outcome, connect time, duration, bytes,
  and basic retransmission indicators.
- Minute summaries and Traffic Analysis overview/destinations/clients views.
- Correlation with existing stability buckets.

### Phase 2: DNS and TLS

- Plaintext DNS timing and client-specific answer cache.
- TLS detection, visible SNI, ALPN/version metadata, and approximate handshake
  timing.
- Hostname attribution with source/confidence.
- Phase-specific charts and diagnostic hints.

### Phase 3: Advanced Protocols and Diagnostics

- UDP and coarse QUIC/HTTP/3 flow support where meaningful.
- Improved bounded percentile and stall analysis.
- Additional compatibility handling for tunneling and flow offloading.
- Optional active synthetic probes if passive data cannot answer a diagnosis.

## MVP Acceptance Criteria

- A fresh installation has traffic analysis disabled.
- Settings contains an **Enable traffic analysis** toggle, and applying it starts
  or stops only the traffic collector without disrupting ping monitoring.
- Stability Monitor contains a separate **Traffic Analysis** tab.
- The disabled view explains the feature and can direct the user to enable it.
- With analysis enabled, forwarded IPv4 TCP flows are summarized without
  storing payloads or packet captures.
- The UI can show results by time, client, and remote IP, including TCP connect
  time, failures, duration, bytes, and retransmission indicators.
- The UI correlates traffic summaries with existing WAN latency/loss data.
- Missing or unobservable phases are labeled honestly rather than shown as
  zero.
- Collection and storage are bounded under sustained traffic load.
- Disabling the feature stops capture and new traffic-data writes while keeping
  prior history available.
- Collector failure or resource exhaustion does not interfere with forwarding,
  LuCI, or the existing stability monitor.
- Relevant automated tests and target-device validation cover enable/disable,
  service restart, retention, malformed traffic, high flow counts, interface
  reconnect, and flow-offloading warnings.

## Open Design Decisions

- Which capture mechanism best balances visibility, kernel compatibility, and
  router overhead: packet socket/libpcap, netfilter hooks, conntrack events,
  eBPF, or a hybrid.
- Whether client identity is most reliably preserved at a LAN device, an
  `inet` firewall hook, or another pre-NAT observation point.
- Whether software flow offloading can be observed sufficiently or must be
  disabled explicitly while analysis is enabled.
- The exact bounded histogram/percentile representation and on-disk rollup
  schema.
- Whether recent per-flow slow events should be persisted or remain volatile.
- Whether the collector should be part of the LuCI package or a separate
  architecture-specific dependency package.
