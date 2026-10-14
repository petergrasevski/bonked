# Diagnosing online rubber-banding

The menu and race HUD show server round-trip ping beside Settings. In Settings,
**Copy network log** copies the last two minutes of client summaries plus the
most recent server summary. Play for at least 20 seconds before copying.

Every 10 seconds, the browser console emits `[net-client]` JSON. Numeric client
metrics are also sent to the game server and printed in Render logs under the
same prefix, with a temporary diagnostic client ID (no player names, session
credentials, voice data or IP addresses). `[net-server]` reports server health.
Match client reports by diagnostic ID and compare their time windows. Reports
from hidden tabs are marked `hidden: 1`; those should not be used to judge FPS.

Client metrics:
- `rttMs`: round-trip time from an application ping, including any event-loop stall.
- `snapshotGapMs` (server log: `gapP95Ms` / `gapMaxMs`): expected around 50 ms.
- `frameMs` / `frameP95Ms`: browser frame durations; 60 FPS is about 16.7 ms.
- `correctionM` / `correctionP95M`: distance between predicted and reconciled local
  positions before visual smoothing. Repeated large corrections indicate divergence.
- `replaySteps`: unacknowledged control frames replayed after each snapshot.
- `stalls`: number of update gaps crossing 250 ms in this window.
- `presentation`: `predicted-fleet` in net-v3. All cars use the same predicted
  timeline as collision detection; remote poses are no longer buffered separately.
- `bufferMs`: zero in net-v3 (net-v2 used a 100–220 ms remote-only buffer).
- `underruns`: zero in net-v3; retained for older log compatibility.

Server metrics:
- `tickHz`: expected near 60; sustained lower values indicate simulation overload.
- `cpuCores`: CPU seconds per wall second; **0.10 means a tenth of one core**,
  approximately the Render Free allocation, not 10% of that allocation.
- `eventLoopP95Ms` / `eventLoopMaxMs`: event-loop delay, with a 10 ms sampling floor.
- `tickMs`: simulation step cost across all rooms.
- `inputGapMs`: spacing of incoming controls, normally about 16.7 ms. The first
  packet after an idle lobby or reconnect can have a large gap.
- `applicationRttMs`: server-initiated ping echoed by the browser, measuring the
  full round trip without relying on synchronized clocks.
- `transportHopRttMs`: native WebSocket control-frame RTT. A hosting proxy may
  answer these itself, so this can measure only the server-to-proxy hop. Do not
  interpret a low value as low player latency.
- `droppedMs`: wall time discarded after stalls longer than 250 ms.
- `staleInputs`: car-ticks where input was over one second old and neutralized.
- `backpressure`: sends skipped because a socket had over 128 KiB queued.
- `snapshotKBps`: uncompressed outgoing state bytes per millisecond (decimal KB/s).

Interpretation: high browser frame times indicate client rendering/JS load.
Application RTT includes network delay and stalls at either endpoint; the two
application ping directions help correlate reports without clock assumptions. Low server tickHz or high event
loop delay points to the server. Stable tickHz/frame times but irregular snapshot
gaps points to delivery jitter. Large corrections despite stable timing indicate
prediction mismatch rather than insufficient bandwidth.

`/health` includes the network version and Render commit revision. The Blueprint
uses `autoDeployTrigger: commit`. A service created manually may still need its
Dashboard Auto-Deploy setting enabled; changing YAML does not configure a service
that is not managed by that Blueprint.

## Local weapon presentation (net-v3)

The client runs a disposable copy of combat alongside car prediction and input
replay. Firing, ammunition, projectiles, beams, shields, mines and chains appear
without waiting for a round trip. Owner + shot-counter + effect-type identifiers
match authoritative events, preventing confirmation from playing a second shot.
Every snapshot replaces speculative combat state; the server alone awards weapon
damage and knockback. Incorrect predictions can still be corrected, especially
when the other driver changes direction during a long round trip.

## Track-title delivery

The picker loads 960×480 transparent WebP files (about 367 KiB total versus
5.5 MiB of source PNGs). HTML preloads them before the game's module graph/3D
scene initializes. Their filenames include SHA-256 prefixes and the server sends
one-year immutable cache headers. Keep the source PNGs for future artwork changes;
regenerate WebP with `cwebp -q 85 -alpha_q 100 -m 6 -resize 960 480`, rename with the
first 12 hex characters of its SHA-256, and update both `track-title-assets.js`
and the three HTML preload URLs together. No extra hosting service is required.

## Report recent lag

Open **Settings → Dev logs → Report recent lag** within about 20 seconds of an
incident. The recorder runs even while Dev logs is off. The button freezes the
previous 30 seconds immediately, then waits at most 2.5 seconds for matching
server diagnostics and downloads `bonked-lag-<incident ID>.json`.

The report contains sampled displayed/predicted car poses and camera motion,
maximum frame gaps, client time discarded by the 50 ms frame cap, snapshot timing,
input acknowledgements, replay lead, largest fleet correction, ping, visibility,
overlay state, graphics settings and the client content revision. Car/camera
samples are taken at most ten times per second; snapshot events retain their
arrival order. History is capped at 1,200 events and 30 seconds. A newly opened or
long-backgrounded tab may have less history, reported as `availableWindowMs`.
It records numeric game diagnostics, not names, room codes, tokens or microphone
audio. Large foreground/background gaps are labelled and must not be interpreted
as network stalls alone.

The latest report is also saved in this browser's local storage when available.
**Download last lag report** recovers it after a reload or if automatic download
was blocked. Downloaded files are the durable copy; clearing browser storage
removes the browser backup. If storage is full/blocked, the download still works.
Offline, timeout, no-room and rate-limit outcomes still export the client data.
Only the incident ID is sent to the server, not the client's detailed trace.

The server maintains rolling one-second timing summaries. A report captures the
last 30 seconds available when the request reaches the server, returns those
samples to the client, and writes `[lag-incident]` plus `[lag-server]` entries to
platform logs with the same incident ID. Use the returned server timestamps and
the client's ping/clock-offset events when aligning windows. The server keeps
its latest 20 incidents in memory until restart, accessible only via authenticated
SSH to the loopback-only `GET /internal/lag-reports` endpoint. Platform logs are
subject to the hosting provider's retention; this is not permanent remote storage.
No volume/database is required. Reports are limited to one per connection per
30 seconds and ten server-wide per minute; duplicate request IDs reuse the last
capture on that connection.

For retrieval, run `flyctl ssh console --app bonked` and then inside the machine:

```sh
node -e "fetch('http://127.0.0.1:3210/internal/lag-reports').then(r=>r.text()).then(console.log)"
```

The public endpoint is forbidden. A client response contains only its requested
incident, never the collection of other incident reports. Share the downloaded
JSON file when asking for analysis; reports from two players at the same moment
are particularly useful.

Server diagnostics now sample every second, with ordinary console output still
limited to once per ten seconds. Each sample includes `at` and `windowMs`; a pong
contains the latest completed one-second sample. `/health` now uses the same
content-derived revision as the client and `/api/version`.

## Stable prediction timeline (net-v4)

Snapshots now carry an integer per-round `simulationTick`. The browser advances
one monotonic clock for cars, collision bodies and predicted combat, independently
of the count of outstanding input packets. Reconciliation replays from the server
tick to the existing client target tick; acknowledgements retire input history,
including already-applied one-shot actions, without changing the replay duration.
The camera uses the same rendered fleet as before.

The clock estimates server progress from the lowest arrival offset over a bounded
ten-second window, compensates using a bounded low RTT sample, and reserves two
simulation ticks of headroom. Small synchronization corrections change its rate by
at most ±2%. This estimate cannot perfectly identify asymmetric network latency.
Only the newest queued snapshot is reconciled per display frame, after advancing
the prediction clock. Existing replicated event arrays still carry combat effects.

Prediction can catch up through frames up to 250 ms, with replay bounded to 45
steps (750 ms). Longer frame pauses, lost stream freshness, reconnects and round
changes suspend/rebase the clock. A large recovery correction may still snap when
it exceeds the existing render correction threshold. The rendered fractional tick
is preserved when the clock pauses, and corrections preserve the old fractional
pose when a recovery rebase changes that fraction. The 50 ms clamp still applies
to input-send accumulation and world animation; the report's legacy `discardedMs`
field measures that clamp, **not lost prediction-clock time** in net-v4.

Lag-report snapshot events include `receivedAt` (actual message receipt),
`serverTick`, `predictionTick`, `clockRate` and `clockRebases`. Their event `t` is
now reconciliation time at the rendering frame, so use `receivedAt` for delivery
gaps. Ordinary diagnostics still measure every raw snapshot arrival. Presentation
is reported as `predicted-fleet-clock`.

Validation includes constant-speed A/B timing models at 30/60/120 Hz, five-second
uplink/downlink jitter, 80 ms client frames, acknowledgement/control retirement,
round/pause recovery, fractional-pose continuity, and anonymous timing extracted
from the reported fb2a0021 incident. These models isolate timing and do not claim
perfect prediction of unpredictable steering, weapon hits or collisions.

## Sky-beam target presentation

The local spectator cursor remains immediate and screen-anchored to the rendered
camera. Other players' markers use a separate critically damped visual filter.
In net-v4 that filter estimates target velocity between authoritative simulation
ticks and advances toward the rendered race time, avoiding repeated acceleration
into held 20 Hz target positions. Extrapolation is limited to 150 ms and measured
speed to 120 game metres/second. Long gaps clear the velocity estimate, and large
teleports or round changes reset it. Only marker presentation is extrapolated;
beam positions, firing and hits remain authoritative.

Lag-report frame events now include displayed `skyTargets` and each car's latest
authoritative `skyTarget`, allowing target/camera motion to be compared. This adds
only bounded numeric pose samples to the existing local recorder.
