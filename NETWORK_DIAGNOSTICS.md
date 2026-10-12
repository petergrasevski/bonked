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
- `bufferMs`: extra buffering for remote cars, adaptively 100–220 ms.
- `underruns`: frames since stream reset that ran out of buffered remote samples.

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
