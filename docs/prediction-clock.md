# Stable prediction clock

The previous client used the number of unacknowledged input packets as elapsed
simulation time after every snapshot. In reported low-ping captures, that produced
one/two-tick position corrections even while rendering and server timing stayed
healthy. The correction spring converted these into visible speed changes.

Net-v4 keeps a monotonic client target tick, replays authority to that tick, and
uses acknowledgement only to retire applied controls. All cars and predicted
combat share that target. The camera continues to follow the corrected fleet.
Clock correction is limited to ±2% outside recovery. See NETWORK_DIAGNOSTICS.md
for bounds, recovery behavior and new report fields.

## Verification

The 60 Hz, constant-30-m/s A/B model produced:

- Low ping: previous displayed speed 26.89–33.29 m/s; candidate 30 m/s to numerical precision.
- Five-second uplink jitter: previous −2.58–52.54 m/s; candidate 30 m/s to numerical precision.
- Downlink jitter: previous 26.73–33.29 m/s; candidate 30 m/s to numerical precision.
- 80 ms client frames: previous 24.00–42.47 m/s; candidate 29.40–30.60 m/s.

The fixtures deliberately use constant motion, so they exclude legitimate physical
speed changes. They do not promise these exact results in normal gameplay.
Anonymous arrival/ack/tick timings from the fb2a0021 report produce no state-time
corrections in the new clock at 30/60/120 Hz. That test does not replay the original
user's complete controls, which were not present in the diagnostic export.

A local browser capture with three cars and active bots recorded 600 racing
snapshots over 30 seconds with one clock initialization and no additional rebases.
The clock rate ranged from 1.0 to 1.017. Median fleet correction was about 1 mm;
p95 was 0.262 m, with a 1.322 m maximum. This is a different driving scenario from
the user captures and is not a controlled before/after comparison. Browser console
inspection found no client errors during the check.

Re-run timing tests with:

```sh
node --test test/prediction-clock.test.js test/render-motion.test.js
```

The existing `scripts/diagnose-motion.mjs` intentionally remains a legacy timing
model of net-v3; the new A/B harness is in `test/prediction-clock.test.js`.

Normal gameplay still needs player feedback: prediction cannot anticipate another
player's new control or an authoritative weapon impact, and long outages still
require recovery. Use Report recent lag for any remaining slow/fast motion.

## Recovery and first rollout, 15 October

The initial interrupted session built the prediction-clock image but did not deploy
it. Reports captured at 22:59 and 23:12 AEDT on 14 October both identify net-v3 and
content revision 31505f2d…, so neither measures the candidate clock. Remote main's
subsequent revert restored the tree to the pre-diagnostics base. The conflicted
workspace was backed up to /tmp/bonked-before-stash-recovery-20261015.tgz, main was
reset to origin/main f3fd794, and the preserved stash reapplied without conflicts.
The stash was kept for recovery.

The 22:59 capture includes a 66.8 ms client frame in the requested 5–10-second
window, alongside prediction corrections and a race finishing. Its final seconds
include a return to the lobby; the large reset displacement is not a lag event.
In the 23:12 capture, the final five seconds have steady frame/delivery timing and
roughly 0.6 m corrections, consistent with the earlier net-v3 reports. These cannot
establish an improvement from a change that was not running.

Remote sky-target presentation initially estimated velocity between simulation
ticks. Further player feedback found remaining jitter, so it now uses a bounded
140 ms interpolation buffer with time-aware cubic interpolation, monotonic playback,
no extrapolation beyond the latest sample, and a critically damped visual spring.
The local cursor remains immediate. Constant-speed irregular-update tests cover
30/60/120 Hz; additional tests verify outage bounds, teleport resets and the actual
SkyBeamView wiring. Lag captures include both displayed and raw targets.
