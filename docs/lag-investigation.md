# Intermittent slow/fast motion: investigation and test plan

Investigated 14 October 2026, approximately 16:17–16:23 AEDT, against https://bonked.fly.dev. The reported symptom is several seconds of smoothly varying car/camera speed, possibly simultaneous across multiple MacBook Pros sharing good Wi-Fi.

## Conclusion

There is a reproducible timing weakness in the shipped client: acknowledgement packet counts determine how far the entire fleet is predicted ahead. Changing uplink latency changes that lead even when the server and cars move at a constant rate. The render spring keeps position continuous but necessarily slows/speeds the visible cars while removing that error. Camera targets derive from those same corrected cars.

This is a demonstrated mechanism, not yet a confirmed explanation of the reported live incidents. The short production run did not reproduce a five-second shared slowdown. Server overload, shared network queueing, and coordinated scene/render work remain candidates for the initiating disturbance. The strongest next step is a synchronized, multi-device capture and an A/B test of a stable prediction timeline, not stronger position smoothing.

## What was actually tested

1. Verified the production `app.js` and `shared/netcode.js` matched the local files byte-for-byte. Fly reports deployed image `ci-dd6d7d64ee099b4962783a1c482b74b4375c8338-38515281381-1`, one Sydney machine, one performance CPU and 2 GiB RAM. `/health` incorrectly reports revision `local`; deployment identity came from Fly, not that field.
2. Ran the existing `scripts/load-public.mjs` for 120 seconds, 16:17:41–16:19:42 AEDT: three rooms, six WebSocket drivers per room, all three circuits. Voice phases were no speakers, two speakers per room, then six speakers per room. Races restart when too few cars survive, so this is not 18 continuously racing cars. Average live cars per ten-second window ranged approximately 12–16. A separate browser observer room overlapped part of the run.
3. Opened the actual production game, created a private Glacier Run room with two bots, enabled existing Dev logs, and captured several racing/spectating intervals. Typical browser readings were 60 FPS, frame p95 about 17.3 ms, and ping 5–9 ms. Individual 183–200 ms frame gaps occurred around mixed transition windows; a 1.77-second gap occurred in a window including circuit loading/countdown. These must not be labelled steady-state racing failures. Screenshots establish the rendered scene, not continuous motion quality. No frame-by-frame video or real-device multi-client motion capture was collected.
4. Added `scripts/diagnose-motion.mjs`, an offline deterministic timing experiment using the actual `replayWindow`, `RenderCorrections`, and camera-target functions. It reproduces the app's packet-count replay, frame-time cap, and prediction timeout around an ideal constant-speed straight-line car. It deliberately excludes steering, collisions, full physics/combat, WebGL, and final camera easing. FIFO delivery is preserved. This isolates timing from legitimate acceleration.
5. Ran the existing network and render-motion suites: all 16 tests passed. Some network tests exercise the old `RemoteSnapshots` interpolation class, which the current app does not use for fleet presentation. Existing active-path tests mostly cover small correction offsets and continuity, not end-to-end acknowledgement timing.

The load test completed with no errors. All test rooms were removed; `/health` reported zero rooms afterward. No production code, configuration, or deployment was changed.

## Measurements

Production load:

- Server simulation: 59.9–60.1 Hz; zero discarded simulation milliseconds and zero snapshot backpressure in captured reports.
- Server CPU: up to 0.49 cores in the captured ten-second windows. Event-loop maximum peaked at 48.86 ms.
- Snapshot arrival p95 generally 58–70 ms (nominal snapshots are 50 ms apart); worst observed gap 308.43 ms. This is evidence of an arrival disturbance, not proof of its cause.
- Load-generator RTT p95 per window: 17–61 ms. A server-observed application RTT maximum of 1425.89 ms includes other connected clients, including the browser during loading, and cannot be attributed to all test clients.
- Outgoing snapshot diagnostics approached 5.2 MB/s aggregate, **before compression**. This is not measured wire throughput. Voice adds bandwidth separately. Compression is enabled for game sockets.

Offline model, with a true speed of 30 m/s:

- Stable 20 ms in each direction: displayed speed range 27.46–33.29 m/s, RMS speed error 1.38 m/s.
- For five seconds, alternate uplink delay between 20 and 180 ms every 300 ms: displayed range −2.48–51.85 m/s, RMS error 11.01 m/s. Across the complete measured run, 5th/95th percentiles were 4.64/48.92 m/s. Camera-target speed follows the same disturbance.
- A simple downlink delay increase from 20 to 180 ms did **not** cause comparable disruption in this ideal constant-input model. Do not generalize the uplink result to every kind of jitter.
- A 900 ms downlink outage crosses the 750 ms prediction limit and produces stopping/catch-up artifacts. Client frames of 80 ms also expose the effect of advancing simulation and spring time by at most 50 ms per frame.

These are synthetic model measurements, not measured speeds from the production browser. The model rounds frame scheduling to whole milliseconds, uses simplified RTT sampling, and does not include all game lifecycle behavior. Its value is a repeatable causal counterexample, not a prediction of precise live severity.

## Why the mechanism exists

`server.js` retains the latest received input and sets `appliedSeq` to its sequence when a simulation tick uses it. It does not run one physics tick for every received input packet. Nevertheless, `public/app.js:reconcileSnapshot` filters pending packets using this acknowledgement and runs one prediction step per remaining packet for the entire fleet. Pending packet count therefore acts as a clock even though it includes delivery and scheduling variation.

`RenderCorrections` in `shared/netcode.js` preserves visual position and velocity at reconciliation, then removes the displacement with a critically damped spring (omega 18). Continuity prevents an instantaneous snap; it does not guarantee constant speed during recovery. Even a 3 m correction with no initial rate mismatch can contribute roughly 20 m/s of correction velocity at the spring's peak. `renderedState` builds the camera target from corrected player progress, so the camera inherits the timing disturbance.

A second vulnerability is `frame()` limiting elapsed time to 50 ms before feeding both physics and visual correction. An 80 ms frame advances only 50 ms locally; subsequent authoritative snapshots move the client forward again. This needs bounded catch-up and explicit lost-time accounting, not simply removing all limits.

A third issue is observability. `correctionM` measures only the local car. During spectating it can remain zero while moving peers and the camera are being corrected. Ten-second percentiles also dilute a short incident and do not show event ordering. “60 FPS” plus zero local correction is insufficient evidence of smooth fleet motion.

## Testing plan

### 1. Add a bounded incident recorder before the next friends session

Keep 60 seconds of local numeric traces in memory, including every snapshot and a bounded sample of rendered frames. Export on a “Mark lag” action, retaining ten seconds after the mark. Avoid per-frame console output or continuously uploading full traces.

Record:

- Build revision, temporary room/client identifiers, track, round, phase, visibility, frame interval, actual elapsed time, clamped/discarded client milliseconds, and JS render time.
- Server simulation tick/race time, snapshot sequence and publish time, arrival time, input acknowledgement, pending count, replay count, estimated snapshot age, and predicted race-time lead. Use monotonic elapsed times and a documented clock mapping; wall-clock timestamps alone cannot establish one-way latency.
- Largest fleet correction plus local correction, spring displacement/velocity, raw predicted motion, displayed motion, camera target and final camera pose. Capture all moving cars, including when the local player is eliminated.
- One-second server tick/callback/publish/serialization summaries, maximum event-loop delay, dropped simulation time, send queue sizes, and compression/send completion timing. Measure actual wire bytes separately from JSON bytes.

Keep a low-cost one-second server history and return relevant windows when an incident is marked. Include server-window timestamps in replies; the existing pong may carry a summary from the previous ten-second window. Do not record names, credentials, microphone contents, or raw network addresses. Fix build identification and make the existing hidden “Copy network log” control accessible with Dev logs enabled.

### 2. Reproduce on the real production client

Use an isolated room with four to six MacBooks. Keep the game foreground and record the selected refresh rate and graphics setting. Start on Glacier Run's long straight with held acceleration and no steering, collisions, weapons, or boost pads for the measurement segment; then repeat normal combat on all circuits.

Run ten-minute phases with voice off, two speakers, then normal party voice. Mark each perceived event immediately on at least two machines; capture screen recordings alongside logs where available. Synchronize by server tick/round and incident time, not by recollection.

Repeat with one Mac on Ethernet or a separate mobile connection while the others remain on the original Wi-Fi. A simultaneous event on independent networks points more strongly toward the server or synchronized game work. A shared-Wi-Fi-only event points more strongly toward that path. Simultaneous frame stalls with steady server/arrival timing points toward client work triggered by the same game event.

Keep the server capacity soak separate from normal-client measurements: synthetic clients help test server capacity but do not exercise GPU rendering, thermal limits, or browser scheduling. Extend the existing soak to 20 minutes in an idle window, and stop if server tick rate falls persistently, backpressure grows, or real players are affected.

### 3. Apply repeatable impairments to test clients only

Use a development test harness/proxy with per-connection delay, preserving WebSocket ordering, while connecting to a private room on production. Do not stall the production event loop or change the shared server's network settings.

Test uplink and downlink separately: constant 20/80/180 ms, five-second bursts alternating 20/180 ms, then 250/500/900 ms delivery gaps. Test 30/60/120 Hz and deliberate 50/80/150 ms client stalls. Repeat with one affected client and all test clients affected together. Fix random seeds and log the exact impairment schedule. Transport packet loss requires a transport-level emulator; discarding application snapshots is not an equivalent test of TCP loss.

For every run, plot server tick rate, snapshot arrivals, acknowledgement/replay lead, frame time, displayed speed error, and camera motion on the same timeline. Evaluate physical speed changes separately from reconciliation-induced speed changes.

### 4. Validate a candidate fix with A/B replay

Replay the same captures and impairment seeds through current and candidate code, then compare in real browsers. Initial acceptance targets for the controlled constant-speed, no-contact case:

- Stable network: p95 absolute displayed speed error under 10% of true speed, with no reversal or pause.
- Five-second moderate jitter: no recurring slow/fast cycle, no reversal, and a substantial reduction in speed-error RMS versus the current model. Choose the latency/accuracy budget explicitly before setting a final threshold.
- A long outage may require a visible pause; recovery must be bounded without replaying a backlog of obsolete worlds or allowing an unlimited catch-up loop.
- Driving, collisions, weapons, camera framing, countdown, elimination, reconnect, and round transitions retain correct authority. Remote collision bodies and displayed peers must not silently use incompatible timelines.

Deploy diagnostics or a validated change using the existing empty-room deployment guard, then repeat the normal friends session. Retain the previous image for rollback. No deployment was necessary for the initial measurements above.

## Recommended improvements, in order

1. **Make prediction time independent of unacknowledged packet count.** Add an authoritative simulation tick and maintain a stable, bounded client target tick. Use input history to choose held controls over simulation intervals; use acknowledgement to retire history, not to decide elapsed simulation time. Slew any latency/lead adjustment gradually. Keep the fleet/collision timeline coherent. This needs a real end-to-end test before rollout; merely replacing replay with RTT/2 is not sufficient.
2. **Handle client stalls explicitly.** Separate wall time, fixed-step simulation time, and visual smoothing time. Allow bounded simulation catch-up; record discarded time and reset/rebase gracefully after larger interruptions. Avoid a sustained 50 ms-per-frame slow-motion clock when real frames are longer.
3. **Coalesce obsolete snapshot work and reduce payload/queueing if measured.** Apply the newest usable snapshot before a render frame instead of repeatedly reconciling a delivered burst. Preserve authoritative one-shot events separately. Measure serialization/compression and wire traffic before choosing quantization, static-field removal, or deltas. Voice activity is a useful A/B factor.
4. **Tune smoothing only after timeline correctness.** Longer smoothing can conceal displacement while extending the speed error. A buffered presentation timeline is another design option, but it must account for existing predicted collisions; restoring remote-only delayed poses would reintroduce invisible contacts.

There is no current evidence from this run that another server CPU upgrade is the first action to take. A short successful run cannot rule out occasional host stalls.

## Reproduce and inspect the evidence

Run from the repository root:

```sh
node scripts/diagnose-motion.mjs
node --test test/network-timing.test.js test/render-motion.test.js
# Controlled production load; creates its own rooms and cleans them up.
node scripts/load-public.mjs https://bonked.fly.dev 120 test-results/lag-investigation-2026-10-14/repeat
```

Evidence from this investigation is in `test-results/lag-investigation-2026-10-14/`: `live/summary.json`, `live/client-windows.jsonl`, `live/server-diagnostics.jsonl`, `browser-logs.json`, `browser.png`, and `model/motion.json`. These artifacts are intentionally ignored by Git. The existing untracked load harness was used without modifying it. The new timing harness and this report are the only source additions.
