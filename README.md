# Bonked

A playable browser combat-racing prototype inspired by the shared overhead racing of Wrecked. Original procedural 3D artwork, three selectable circuits, distance-based elimination, three-lap races, and private rooms for up to eight cars. The in-game title is “Bonked”.

## Run on this laptop

Requires Node.js 22 or newer.

```sh
cd /Users/pgrasevski/src/tmp/bonked
npm ci
npm start
```

Open **http://localhost:3210**. The server prints the laptop's Wi-Fi address on startup. Port 3210 is used because port 3000 was already occupied during development.

For this laptop's current network, try **http://192.168.1.180:3210** on a phone connected to the same Wi-Fi. The IP can change when you switch networks. **Copy invite** includes the share address and your room code.

Keep the laptop awake and the server running. If macOS prompts about incoming connections, allow Node for your local network. Guest Wi-Fi/client isolation or a VPN may prevent devices from reaching each other. Do not disable security protections blindly. The development environment can access localhost but returned an empty response when checking the private LAN address; physical phone access still needs confirmation.

To use another port: `PORT=4000 npm start`. To bind only to this machine: `HOST=127.0.0.1 npm start`. `npm run dev` restarts the server on edits; a restart ends active rooms.

## Play

1. Enter a name and create a room. Share its three-letter code or invite URL.
2. Friends join and receive different random colours. The host starts the race.
3. Add optional practice drivers to try it alone. Bots count toward the eight-car limit.
4. Keep ahead of the red elimination line. It stays **81 game metres of road distance behind the leader**, roughly 2.25 seconds at the normal maximum speed. It is not a timer: a stopped leader does not make the line creep forward. Crossing behind it eliminates your car; eliminated drivers spectate. In multiplayer, the last survivor wins. If more than one survives, the three-lap finish still applies. Round scores carry forward automatically. Every connected human can tap Ready (or press Enter on a computer); the next countdown starts as soon as everyone is ready or five seconds elapse. The next grid forms behind the previous winner’s finishing checkpoint.

On phones, landscape is required: portrait shows a rotate prompt and releases controls. Desktop browsers work in either orientation and hide the touch buttons; a weapon indicator remains visible. The circuit is approximately **2.43 km, 30% shorter than v0.2**, with two extended straights and fewer turns on a narrow island causeway. Visible dry coastal shoulders support driving and recovery; unsupported falls and the sea remain lethal. Landmark islands and beach slopes also provide solid contacts for tumbling wrecks. The road now crosses land beneath the volcano, geyser, temple and waterfall. Everyone shares a perspective camera behind the surviving pack. It anticipates bends, includes **10 metres ahead of the leader** and **10 metres behind the last car**, and rises gradually from a 26° chase view toward a 70° overhead view as the pack spreads out. The death line enters view when it approaches the last car, following the same corrected fractional-frame progress as the cars while elimination remains authoritative. Viewport fitting keeps every surviving car and its roof weapon in frame, including during camera turns and local prediction.

| Control | Phone / tablet touch | Computer | Standard controller / DualSense |
| --- | --- | --- | --- |
| Accelerate | Automatic | W | X (bottom face button) |
| Steer | Hold the full-height left/right areas | A / D | Left stick, proportional with 14% deadzone |
| Reverse | REVERSE | S | Square (left face button) |
| Weapon | WEAPON | Enter (including numpad Enter) | R1 |
| Nudge | Swipe left/right across the steering areas | Left / right arrows | L2 / R2 |

On phones and tablets using touch controls, acceleration starts automatically at GO, without an early-start spinout. Hold the larger REVERSE button above WEAPON to brake, stop, and then back up; release it to accelerate forwards again. The largest button at the lower right is WEAPON (tap or hold, depending on the item). Hold either of the two full-height areas covering the left third (one-sixth of the screen each) to steer, or make a quick horizontal swipe across them to nudge. Each swipe nudges once and stops that touch steering until lifted. Slow drags switch steering areas without nudging. Keyboard and controller mappings are unchanged. Connecting a gamepad switches acceleration back to its manual button; disconnecting it restores automatic acceleration.

If you land on your roof, hold **W + A or D** (controller: accelerator + full left/right stick) to roll back onto your wheels in about **0.9 seconds**. On touch devices, hold either steering area; automatic acceleration supplies the throttle. Keep holding until upright. Side impacts and nudges can rock or help turn you over throughout recovery. Destroyed cars and cars already eliminated cannot recover into the race.

Reverse responds immediately: while travelling forwards it brakes and loosens rear grip, then drives backwards through zero speed. There is no hold timer or separate drift mode. Controller buttons are polled every animation frame. On connection or after opening a menu, release the controls once to arm them again. On-screen touch controls remain available on phones and tablets even with a controller. Unmapped controllers are ignored to avoid incorrect button bindings.

DualSense can pair to iPhone over Bluetooth: hold Create + PS until its light flashes, then select the controller in Settings → Bluetooth. Open the HTTPS game and press a controller button. See [Apple’s pairing guide](https://support.apple.com/en-au/111100). Real-device iPhone/controller validation remains recommended.

### Circuits

The host selects a circuit in the lobby; every room has its own selection. After a round, **Change circuit** returns everyone to the lobby and resets the tournament.

- **Saltwater Circuit:** the original 2.43 km coastal course, with low amber sunset light, coastal haze and matching warm water reflections. Detailed volcano, geyser, temple and waterfall sit on connected islands; exposed sand stretches slope down into the sea.
- **Glacier Run:** a 2.03 km long, thin rectangular loop with 914m straights, broad square-ended turns, and low lateral grip. Each straight splits into two lanes around a crevasse halfway along, with alternating barriers and exposed edges. Elsewhere, only the U-turn bends have bumpers; their approaches stay exposed. Exposed edges drop off the ice shelf. Wind-driven snow, overcast light and snow-covered pines surround an ice surface with irregular fractures and broad frost patches. A meandering river with flow-aligned ripples, reflective highlights and shallow-bank foam separates the straights, mountains enclose the valley, and two ski resorts have continuously moving chairlifts. Protected edges use stacked ice-block walls. The ice road is raised another metre above matte, wind-scoured snow, with blue shelf faces and soft contact shadows making exposed drops clear.
- **Redrock Overpass:** a 1.86 km desert figure eight with the original 20 m overpass, plus a separate 36 m bridge between two mountains on the right loop. The ascent and descent have exposed cliff edges; the high bridge retains fences. Four 10 m-long, 1.8 m-high timber ramps have chevrons, striped launch lips and warning signs. The low left loop opens into a fenced 252 m-long, 30.24 m-wide mole field (about seven seconds at full speed), with gentle 21 m transitions. Twenty-six moles, including extra clusters in the centre and along the inner right-hand racing line, warn with disturbed soil before emerging; lowered holes are fully driveable and raised heads are physical obstacles. Rock mesas use joined layer contours without open seams, and mountain skirts extend below the ground with a depth bias on the sand plane to avoid flicker. Seven solid cacti sit just inside the roadside fences. The final climb narrows smoothly from 18 m to 9 m after the last weapon pickup, holds that width for a short boost row, then widens before the finish. Physics preserves the route at the crossing; collisions, pickups and weapons respect height. Ramps launch cars ballistically, retaining speed on upright landings. Matte sand, world-space dune/grain detail, harsh overhead sunlight and weathered wooden fences establish the desert setting. Its shadow frustum covers 450 m across, over three times the previous width.

Moles share a fixed-step, server-owned per-round clock across collision, client prediction and animation. They cycle every six seconds with staggered 0.6-second warnings and gradual rise/retraction. Impacts push cars back and deal speed-dependent damage with a cooldown; airborne cars can clear them. The whole field uses six instanced model/soil draws. Mountain terrain never covers the original crossing, the overpass pylons leave the lower road and its verges clear, and the new bridge spans an open canyon.

### Rendering and scenery

Track palettes, skies, fog and snowfall are in `public/atmosphere.js`. The blizzard uses one GPU-driven point draw (1,600 flakes on touch devices, 2,200 otherwise), with no per-frame particle buffer uploads. Sky reflections are baked once on track creation. Fog eases when the chase camera rises so distant cars remain readable; scenery beyond the opaque haze is culled. Touch devices use a 1,024-pixel shadow map.

`public/scenery.js` supplies curved palms with individual leaflets, layered irregular shorelines, snow-laden pines, eroded rocks and ribbed cacti. Landmark detail includes harbor crane bracing, lighthouse railings and lantern frames, temple masonry and shipwreck rigging. Static scenery shares materials and is merged into 70 m spatial batches for frustum culling. The ice material uses a single packed 512-pixel texture with three stochastic world-space samples, reducing repeated cracks and tile seams without another render pass. Desktop browser checks include phone-sized landscape views; physical-phone thermal and GPU performance still needs device validation.

Exposed edges check all four tyre contact points. Lost support applies gravity torque, reduced grip and progressive body tilt; regaining support can save the car. Once the body slips off, chassis contact impulses let it tumble along the terrain. Coastal banks and desert mountains share triangle geometry between rendering and collision, indexed into local spatial cells. The server builds those meshes before accepting players, avoiding first-fall frame stalls. Unsupported falls eliminate after 1.2 seconds (or sooner in water), while an upright landing on dry coastal sand can recover the car. Wrecks keep colliding with the ground.

The glacier valley adds fewer than 35,000 static triangles, with one river draw and two instanced chairlift batches. Coastal landmark terrain feeds the ocean shallows and foam mask. All additions reuse the existing renderer and static batching.

### Party voice

Joining a room enables incoming party audio with the microphone off. Microphone permission is requested only when you press the circular mic button. A crossed-out mic means off; a plain mic means live. Every connected human in that room can hear the others in the lobby, during the race, while spectating and between rounds. Muting stops transmission while keeping incoming audio enabled. Joining or reconnecting starts with the microphone off. Leaving the room stops microphone tracks and clears playback. Hidden pages stop transmitting. Browser/iOS background suspension can interrupt reception until the game is foregrounded again.

Voice requires HTTPS (the public tunnel provides it) or localhost. If audio playback is blocked, tap the page. Permission denial leaves the game playable and lets you listen; **Enable mic** retries. Audio uses the device’s selected speaker/headphone output. Echo cancellation and noise suppression are requested; headphones work best when several players share a room.

A separate authenticated `/voice` WebSocket relays 16 kHz mono PCM in 20 ms packets, with per-speaker bounded jitter buffers. No voice account, TURN server or paid service is needed. The server relays audio only within the authenticated lobby and does not record it. Transport is encrypted on the public HTTPS/WSS link; this is not end-to-end encrypted. Each unmuted mic uploads about 32 KB/s, and a listener receives up to 160 KB/s with five other speakers, plus transport overhead. A slow connection may drop audio instead of accumulating seconds of delay.

For manual acceleration (keyboard or gamepad), holding accelerate through the countdown continues driving at GO. Start holding it with **1,000 ms remaining, within ±20 ms**, for a 0.8-second launch boost (35% extra acceleration, 10% extra speed ceiling). Hold continuously from **more than 2,000 ms before GO** and the car spins for 1.1 seconds before accelerating. Releasing GO resets the attempt. Controls carry their original press timestamp in the synchronized server clock; the server bounds timestamp compensation to 250 ms and owns the outcome. Countdown numbers update at animation-frame frequency.

Drifting leaves two narrow, connected rear-tyre tracks with subtle rubber grooves. Their darkness follows sideways slip, with softer marks on ice; they conform to road slopes and fade over four seconds. Straight-line boosts do not leave skid marks. Tracks use one fixed-size client render batch, sampled at up to 30 Hz, with no server or network changes.

A nudge shifts the car one car width sideways over 0.1 seconds, with a 0.8-second cooldown. Four tyre streaks follow the sideways slide and fade over 1.8 seconds. Five soft motion lines trail the shove for 0.28 seconds, for both local and remote cars. These are client-only visuals in two bounded render batches; they add no network messages or server physics work. Contact deals 5 damage once per target, applies a physical sideways impulse with half-strength recoil and spin on the initiating car. Off-center hits also spin the other car according to the contact point; reduced grip briefly lets it skid. Barriers and shields still apply.

Saltwater and Redrock steering builds progressively (roughly 0.25 seconds to 90% response) and recentres a little more slowly (roughly 0.37 seconds to shed 90%). Drift builds progressively in faster corners above half of normal top speed, reducing lateral grip and how quickly velocity follows steering. Low-speed handling and straight-line grip recovery stay unchanged. Glacier retains immediate steering, with additional momentum in stronger turns. Steering state is replicated and replayed with the shared car physics.

Cars reach 36 game metres/second at full health after roughly four seconds of straight acceleration. Turning adds drag, so sustained corners reduce speed and straightening up gradually restores it. On dry circuits, high-speed cornering progressively reduces lateral grip and velocity alignment, allowing the rear to swing out with momentum; grip returns as steering centres. Low-speed dry-road grip is unchanged. Glacier retains more sideways momentum under steering load, especially in fast U-turns, and settles gradually when steering is released. Damage penalties begin below 60 HP: acceleration and the speed ceiling fall linearly from 100% at 60 HP to 80% at 1 HP, while lateral grip and steering response fall from 100% to 40%. Paint darkening also starts below 60 HP; smoke/fire stages begin at 60, 45, 30 and 15 HP. External crash/weapon impulses can temporarily exceed the engine limit.

The long, low chassis is fitted directly to the shared **4.9 × 2.1m** oriented collision box, including bumpers and wheels. Contacts use the overlap of bumper/door faces, friction, and six solver passes with road constraints. Impulses transfer momentum and rotation, so contact can push cars into barriers or off unprotected outer edges. Cars have 100 HP, five damage states, increasing smoke and fire, and an eight-second shield. Hard barrier impacts and car crashes also cause damage. Zero HP creates an airborne, tumbling wreck that remains a physical obstacle until the round ends.

| Pickup | Behaviour | Damage |
| --- | --- | --- |
| Pulse | Two radial pushes, one second apart; 16m radius | 8 per wave |
| Homing rocket | Targets the next car ahead along the road, follows elevation and jump lips, explodes against protected edges; can be intercepted | 42 |
| Machine gun | Hold to fire 30 fast, swept-hit rounds | 2 per round |
| Shield | Bubble blocks damage and weapon knockback for 8 seconds | — |
| Railgun | One instant 150m piercing shot with a lingering trail and a small airborne launch | 75 per target |
| Mines | Three taps; arm after 0.1s; launch and tumble cars | 28 |
| Ball & chain | Momentum-driven tether about two car lengths behind; detonates on contact | 45 |
| Flamethrower | Hold for up to 3 seconds of fuel; 16.2m forward reach (1.5× its original range) | 12/second |
| Plasma cannon | 12 straight shots at 54m/s; hold to continue | 8 per shot |
| Taser | Hold for up to 5 seconds; arcs to every unshielded rival within 8.575m (1.75 car lengths), with poor grip and oscillating steering while in range | 15/second |
| Shotgun | Four shells with a 0.3s cooldown; three separately aimed barrel shots out each side with outward knockback | 12 per hit; up to 36 per side |

Mines sample the road at the drop point behind the car, align to its slope and retain the correct deck at crossings. Their trigger height follows the same slope.

Directional weapons use the rendered car’s full pitch/roll/yaw for their muzzle, aim and swept 3D hit detection. Grounded cars align to road slopes; airborne rotation still changes aim. Plasma and tracer visuals predict vertical velocity as well as horizontal movement. Rails and shotgun beams show their actual 3D path; bridge decks stay separate for hits.

Weapon pickups form rows of three or four across the road, spaced about ten seconds apart at full speed. These are initial balance values. Pickups are slowly rotating 3D weapon models with a coloured ground glow. The server chooses each visible weapon in advance, awards exactly that item, and chooses the next one for its 2-second respawn. Sound effects are on by default at **40%**, with music at **100%**, with independent **Settings → Sound effects / Music** sliders saved on this device. Effects at 100% retain the original mixer level; 0% mutes them. Music plays Chill Menu by Not Jam as a continuous loop. Each weapon has a distinct layered sound: shots and impacts play once from server events, while the flamethrower and taser loop only while firing. Nearby opponents are audible with distance attenuation and stereo positioning; muting, leaving, hiding the page or losing connection stops effects. The physics is a lightweight arcade simulation: planar car-to-car impulses, wheel support and 3D terrain contacts at exposed edges, a constrained swinging ball, and ballistic height/roll/pitch. Landing orientation determines whether a live car lands upright or on its roof. Roof landings allow powered recovery and collision-driven rocking/rolling; it is not a full suspension or general-purpose 3D rigid-body engine.

The race uses the full screen, with Settings and segmented score thermometers in the upper-left on every device. Optional Dev logs adds FPS and ping beside Settings. Score segments glow more as players approach the winning total. Results show the same thermometers from highest to lowest leaderboard total, with bright new points and half-opacity lost points. Your result card has a bright car-colour outline, tinted background and YOU badge, and scrolls into view within the leaderboard on narrow screens. Ready ticks appear beside each ready driver (including every bot), and the centred Ready button fills from 70% to full opacity over the five-second wait. Rendering uses worn asphalt and concrete, rounded chassis, softer billboard smoke, muted coastal colours, water highlights, and a light vignette. All textures and models are generated locally; no remote art assets or image processing passes are required.

Bots keep the shared track-following steering, with small lane preferences and deliberate detours for reachable weapon pickups and boost pads. Steering looks farther ahead at speed and corrects sideways momentum; corner speed follows road curvature instead of treating a drifting chassis angle as a sharper bend. They choose targets about five times per second, check weapon opportunities about ten times per second, and nudge nearby opponents when grounded with road clearance. Pickup interest, nudge decisions and reaction times vary slightly; target choices stay stable during an approach. Six seconds without using a weapon triggers using up its remaining ammo or fuel. Decisions live in `bots.js` on the server and are not included in car snapshots. Ice bots approach splits earlier and take the guarded branch on the first straight. Wide ice hairpins allow a faster inside aim and more sideways drift. About ten times per second, bots compare a few legal passing lanes around nearby wrecks, overturned cars, mines, and active or emerging moles; they ease off when clearance is limited and never choose a route across an ice gap.

## Multiplayer design

- One Node process serves the assets and a same-origin WebSocket endpoint at `/ws`.
- Server-authoritative physics at 60 Hz; snapshots at 20 Hz. Clients send input, never authoritative positions, lap counts, item ownership, or finish times.
- The server owns elimination and broadcasts the common chase/camera frame. The cutoff uses unwrapped race distance, including across the lap seam.
- Shared physics predicts all cars on a common timeline using replicated steering inputs, so opponents follow turns instead of repeatedly extrapolating straight and snapping back. Snapshots acknowledge input only after a simulation tick has consumed it. Visual correction offsets use a critically damped spring that preserves both position and velocity when snapshots arrive, independently of physics. Reconciliation includes fractional-tick motion so mid-frame velocity updates do not shift the chassis. Fractional-tick motion supports high-refresh displays. Race progress, pitch and roll use the same correction path as the chassis, preventing the route camera and slope rotations from repeating/jumping on alternate frames. Movement rates are measured after nudges and contact resolution using the same helper in prediction and the server, and included in every authoritative snapshot. Fully acknowledged snapshots therefore use fresh sideways drift, rotation and road-progress rates even when there are no input ticks to replay. Pitch and roll derivatives unwrap across ±π. Camera containment uses a heading-independent chassis envelope, preventing tail-out rotation from pumping the zoom. Rendering never runs another collision solver. These changes address the original repeated car vibration; prediction remains approximate under packet stalls and collisions.
- Fixed simulation steps with bounded catch-up avoid runaway work after an event-loop pause.
- Input goes neutral after 250 ms without a fresh command. Touch release/cancel, visibility changes, and window blur also clear controls.
- Exponential reconnect backoff, WebSocket heartbeats, and a 20-second disconnected-seat reservation. A private resume token restores the same driver; it is held in sessionStorage and is never broadcast. Active rooms survive a short connection interruption, but not a server restart.
- Connected players inherit hosting when the host disconnects or leaves. Only the host can start, add bots, or request a rematch.
- Payload limits, message-rate limits, same-origin checks, room/client caps, validated controls, and bounded outgoing buffers protect the small server from routine malformed input or slow consumers.
- All game assets and dependencies are served locally. No third-party runtime CDN, art downloads, account service, database, or analytics.

## Public internet hosting

A free Cloudflare Quick Tunnel can expose this game over HTTPS, including its WebSocket server. It requires no account or domain. The laptop still runs the game; it is not independent cloud hosting.

With `npm start` running, open a second terminal in this directory:

```sh
npm run share
```

The command prints a public `https://…trycloudflare.com` address. Share that address with friends; it works from other networks and mobile data. It changes whenever the tunnel is recreated and stops when the tunnel exits or the laptop sleeps. Stop the tunnel with Ctrl+C. Only the game on port 3210 is exposed.

To make the localhost lobby's **Copy invite** use that address too, restart the game server with:

```sh
PUBLIC_URL=https://your-generated-address.trycloudflare.com npm start
```

Opening the game directly at the public URL automatically uses it for invites. For other server ports, update `--url` in the share command accordingly.

Quick Tunnels are for development and have no uptime guarantee. See [Cloudflare's documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). For independent, persistent hosting, use the container below.

A Docker image is included for the next stage:

```sh
docker build -t bonked .
docker run -d --name bonked --restart unless-stopped -p 3210:3210 bonked
```

Deploy this container to a host that supports **persistent WebSockets**, with TLS and an HTTPS public domain. Terminate TLS at the host's reverse proxy and forward both HTTP and WebSocket upgrades to port 3210. The browser automatically uses `wss://` on HTTPS. Set `PUBLIC_URL=https://your-game.example` for generated invites/QR codes when opening through localhost.

Use one always-running instance initially, in a region near the players, with automatic process restart and `/health` as its health check. Avoid services that sleep when idle or impose short-lived request limits. A static-site-only host cannot run the coordination server.

Rooms live in process memory. This first version is **not highly available**: a deploy, process crash, or host outage ends races. Multiple instances require room-aware routing plus a shared room directory (or a dedicated per-room game-server model); adding load balancing alone will not work. Public hosting should be measured with the actual friends' devices and networks before claiming latency or uptime targets.

## Verification

```sh
npm test
```

The tests start a separate server on localhost:33211 and use eight real WebSocket connections to verify unique colours, capacity rejection, host-only start, authoritative positions, countdown, token reconnection, pickups, elimination, a last-survivor finish, shared camera bounds, tournament readiness, score retention, advancing start grids, and host handover. Physics and combat tests cover road clearance, full-course navigation, steering validation, reverse, drift, solid collisions, wall damage, persistent wrecks, upside-down landings, and the damage, ammo, timing and targeting rules of all eleven weapons. Network tests also reject client-supplied health and weapons. Launch tests cover the exact ±20ms boundaries, release/reset, held GO across GO, and all three start outcomes using live sockets. Regression checks cover health-speed endpoints, both fatal road edges, camera lookahead, bumper/door impulses, and peer collision prediction.

Browser QA uses landscape phone emulation in Chrome: multi-touch, long holds, double taps, release/reset, forward braking into reverse, and rotation to portrait. CSS touch-action, user-select and -webkit-touch-callout plus non-passive game-surface touch handlers suppress browser gestures while keeping lobby inputs editable. Input text is at least 16px to avoid iPhone focus zoom. Actual iPhone Safari verification is still needed: emulation cannot reproduce every iOS callout or OS edge gesture. Add to Home Screen can reduce browser chrome; it does not remove system gestures. A native wrapper is a possible later option, not required for these normal touch controls.

## Files

- `server.js`: HTTP, WebSockets, rooms, race lifecycle, item authority.
- `shared/game.js`: track geometry, car simulation, collisions, bot driving and brake-hold timing.
- `shared/combat.js`: weapon definitions, server-owned damage, projectiles, mines, and tether physics.
- `shared/prediction.js`: client prediction of the local car and peer contact on a common timeline.
- `shared/chase.js`: fixed-distance elimination, shared camera framing and result ordering.
- `public/pickups.js`: eleven reusable 3D weapon models with distinct silhouettes.
- `public/world.js`: Three.js scene, procedural models, lighting, camera and effects.
- `public/app.js`: networking, prediction, lobby, results, touch/keyboard input and audio.
- `public/style.css`: responsive lobby and racing interface.
- `test/`: deterministic physics checks and end-to-end server protocol tests.

The cached track registry lives in `shared/game.js`; `selectTrack(room.trackId)` selects live geometry before synchronous room simulation and snapshots. New courses share physics, camera, pickups and bots. Scenery is in `public/world.js`. Do not insert asynchronous work between selecting a room’s track and simulating it. Voice transport is in `public/voice.js` and its AudioWorklet in `public/voice-worklet.js`.


### October visual / phone update

The road widens smoothly around bends (up to 18m) and three passing plazas (24m). Raised red/concrete walls with dark caps protect the edge; yellow paint alone marks unprotected drops. Six yellow/black solid traffic islands divide the plazas. The server, local prediction, camera, pickups and bots use the same road widths and obstacle positions.

Main menu, lobby, results and settings use the Pit Console design: clipped metal frames, recessed controls, a painted top edge and angled primary buttons. The entry screen starts with the shared Name field, and Join stays disabled until the room code contains three letters (including after editing and while a request is pending). The menu demo uses two cars side by side with a 1.7m longitudinal stagger. Saltwater and Redrock preview cameras pan forwards to leave their volcano and bridge visible below the title artwork. Headings, primary buttons and score totals use the locally hosted Righteous typeface; dense labels and inputs retain the system sans-serif. The font and its SIL Open Font License are in `public/fonts/`. Settings contains sound effects and music volume sliders and, during a race, Leave race. The landscape lobby respects both screen safe areas and keeps Start tournament aligned with the circuit cards. The speaker button beside the microphone mutes game audio while leaving incoming party chat audible. Each car’s engine stops on elimination, falling or finish. Opponent engines and weapons remain audible while spectating; the listening position follows the shared camera instead of the eliminated car. Game effects stop on mute, stale state, disconnection, hiding the page, or leaving the room. Music continues across menus and rooms, and pauses when muted or the page is hidden.

### Circuit loading

Circuit selection highlights immediately and shows a spinner while the local world
loads. Other lobby actions, including Start tournament, remain available. There is
no client-ready handshake or server loading gate: a slower renderer catches up to
the latest authoritative snapshot when ready. The race clock continues during
loading, so a slow device can miss the start or be eliminated before it finishes.
Building yields between major stages; individual geometry/GPU tasks can still
briefly pause a slower device. Failed builds expose Retry. New selections cancel
stale builds without publishing an obsolete world.

Unselected circuit cards use 320px WebP captures in `public/track-previews` (about
40 KB total), avoiding extra complete 3D world builds in the lobby. The selected
circuit still has a live preview and the existing tilt interaction. Add bot inserts
a pending slot immediately, matched to the authoritative bot by request ID. Failed
or timed-out requests roll back; pending slots count toward the eight-player cap.

The host can use Settings → Change circuit to return everyone to the lobby,
stopping an unfinished round without awarding it points. Scores carry through
lobby returns, circuit switches and subsequent starts. A completed tournament
resets when the host starts fresh or returns to the lobby. Reset scores in the
lobby explicitly clears everyone's totals; guests cannot invoke host controls.
The roster shows each driver's current score. Leave sits beside Copy invite.

### Tournament and landmarks

Eight-car scoring is **+3, +2, +1, 0, −1, −1, −1, −2**. With fewer cars, first still earns +3, intermediate places use the same descending awards, and last loses −2 (a solo driver earns +3). The target is fixed when a tournament starts: **15 with 1–4 cars; 10 with 5–8**. Bot cars count toward grid size and are automatically ready. Connected humans vote ready; otherwise the server advances after five seconds. Scores never drop below zero; results show the actual points gained or lost. Round awards are applied once on the server. Scores survive a brief reconnect; completed tournaments wait for the host to start a new one.

Eight landmarks are spaced about 303 road metres apart (roughly ten seconds at racing speed): Palm Island, Ember Caldera, Geyser Springs, Cargo Harbour, Sunken Temple, Twin Falls, Beacon Point, and Wreck Bay. Animated features share the particle budget; static geometry uses the existing batching. Wall and centre-island damage is `max(0, speedBefore − speedAfter − 1.5) × 0.3`, reducing grazing damage sharply.

### Fly.io hosting

`fly.toml` deploys [Bonked on Fly.io](https://bonked.fly.dev) to Sydney using the existing Dockerfile, one shared CPU and 256 MB RAM. HTTPS and `/health` checks are enabled. The machine starts on requests and stops when idle.

Pushes to `main` run `.github/workflows/fly-deploy.yml`: install dependencies, run the regression suite, deploy one machine, then check public eight-player multiplayer. The repository's `FLY_API_TOKEN` Actions secret must contain a Fly deploy token scoped to the `bonked` app. Rotate that token before its expiry.

To deploy manually from this directory after signing in to the Fly CLI:

```sh
flyctl deploy --remote-only --ha=false
node scripts/check-public.mjs https://bonked.fly.dev
```

Keep exactly one application machine: rooms, scores and voice authentication live in process memory, so multiple machines cannot share a room. Restarts and deployments end active games. No database or persistent volume is required. `PUBLIC_URL` in `fly.toml` sets the invite address; update it along with `app` if using a different Fly app name.

Deployments use the `rolling` strategy to update the existing machine in place and wait for its health check, with `--ha=false` to prevent a spare machine. CI checks the machine count before and after deployment. Fly autostart wakes this existing machine and does not create more machines. Fly does not offer a per-app hard cap against a manual scale/clone command; keep manual scaling at one. The old `bonked-peter` app has no machines.

Fly.io's [free trial](https://docs.fly.io/about/free-trial) lasts for two total machine-hours or seven days from signup, whichever comes first. Trial machines automatically stop after five minutes, disconnecting players and clearing rooms. When the trial expires, the app stops until billing is configured. Adding a payment method ends the trial and starts usage billing; there is no ongoing free tier for new accounts.

### Render hosting alternative

`render.yaml` configures one **Free** Node web service in Singapore, with `/health` checks and deployments on commits. Connect [the game's repository](https://github.com/petergrasevski/bonked) in Render, select Node, `npm ci --omit=dev`, `node server.js`, Singapore, and **Free ($0)**. No database, disk or paid compute is required. This account was prompted for card verification even on Free; deployment was stopped at the user’s request and no cloud service exists yet. Keep paid upgrades off; without a payment method, exceeding included bandwidth suspends the free service rather than charging. Render's free service sleeps after 15 minutes of no incoming HTTP/WebSocket traffic and takes roughly one minute to wake. Active games send input and ping messages. Free services may also restart, so this is hobby hosting, not guaranteed uptime; rooms and scores are in memory and reset on a restart. [Official free-tier limits](https://render.com/docs/free).

WebSocket snapshots use low-level compression to reduce free-tier bandwidth. A public smoke test accepts any deployed origin: `node scripts/check-public.mjs https://YOUR-SERVICE.onrender.com`.

### October tracks, inputs, smooth movement and party chat

Regression coverage now also includes ice geometry and grip, a full bot lap on each new track, both jumps, stacked bridge contacts and pickups, independent room tracks, host-only track changes, DualSense mapping, correction continuity and fractional ticks, audio packet timing and mixing, voice authentication, room isolation and cleanup. Browser QA covers desktop rendering and keyboard input. Physical iPhone Bluetooth mapping, speaker echo cancellation and mobile background behavior need verification on the actual devices.

### October feedback update

Glacier Run's two long straight centre lines are each 914.4m, exactly 60% of their former 1,524m. Each has a tapered 230m split around its midpoint, with two 10m lanes separated by an 8m crevasse at the widest point. The boost-fed right branch on the first straight has no inner or outer barriers. The left branch and return-straight fork retain their alternating guarded and exposed sections. End barriers start only on the U-turn bends; their straight approaches stay exposed. Pickups, bots, rematch grids, collision checks and visible surfaces all account for the split.

Projectiles now advance at display-frame frequency using velocity, with soft corrections when 20Hz snapshots arrive and a 150ms extrapolation limit during stalls. Damage/hits remain authoritative. Shotguns mount three barrels pointing out each side. The taser uses a polished steel bulb and rod, animated lightning, a visible range ring, and a blue hit glow.

Lighting uses a prefiltered HDR sky environment generated once at scene creation, warm sunlight, cool fill, ACES tone mapping, reflective clearcoat paint and ice, material roughness/bump maps, fine cracks and grain, longer fogged sightlines, clustered ice crystals and layered desert rock formations. Geometry remains batched and there are no additional full-screen rendering passes. Physical phone performance and speaker/controller behaviour still require device testing.

### Spectator audio and coastal water

Engine audio is now mixed for every nearby live car, including bots, using stereo placement and distance attenuation from the camera’s ground target. A rounded combustion waveform, low rumble and filtered intake noise respond to throttle/load and engine RPM. Five automatic gears have hysteresis and a brief shift dip; revs and volumes ease smoothly. One shared compressor controls the combined engine mix. Sources are released when inaudible, eliminated or muted. The local driver dying does not mute the remaining race.

Coastal water uses displaced swells, irregular fine ripple normals, Fresnel sky reflection, sunlight glints, a generated shallow-water colour map, subtle whitecaps and animated foam along the causeway. It uses two scene draws, with no mirror-camera renders or screen-space reflection passes. Fog blends the water into the existing atmosphere. Regression tests cover spectator listening position, engines for other drivers, rev/gear behaviour, throttle response and audio lifecycle; browser QA exercises a real elimination with opponent engines still active and real Web Audio offline rendering.

Neon-blue double-chevron boost pads are 1.5 car widths wide. They ramp forward speed linearly to 150% of normal top speed over 0.4 seconds, then ease back over 2 seconds. Each pad turns dull blue for a one-second shared cooldown; already-boosted cars cannot consume another pad. Swept, height-aware contacts prevent missed triggers or collecting a pad on another deck. Pad availability belongs to each room; the boost envelope runs in shared authoritative/predicted physics. The light-blue bases are 50% transparent, and the forward chevrons advance at three frames per second. Twin exhaust flames grow with acceleration and fade through the two-second decay. All pads on a course render in three batched draws; their surfaces follow the road triangles exactly through mountain curves and changes of grade.

Saltwater has paired pads at the start and middle of its long gentle stretches, excluding the pair nearest the starting line. Glacier has four rows at the one-third/two-thirds points of the two straights: paired to one side, opposite edges, paired centrally, and a full row. Redrock has pads along the outside of the mole field, the mountain climb/descent, and a row at the narrow finish approach.

The chain ball now has gravity and a 3D tether anchored to the pitched car chassis. It samples its own road/terrain contact, uses height-aware swept hits, and renders with velocity-led corrections in all three axes. Links interpolate between the ball and the visible rear attachment, lifting over intervening road crests.

The lobby offers three square circuit cards with transparent illustrated titles and views rendered from the current track geometry. Inactive cards are generated once while idle; the selected view targets ten frames per second, with no preview work during a race. Hosts add a bot from the first empty slot and remove individual bots using their row’s × button. The roster and circuit cards sit side by side on wide screens, with a compact landscape layout and stacked portrait layout. Brushed silver grille accents replace lime green; primary buttons and circuit cards follow the mouse with a subtle 3D tilt and reflected highlight, respecting reduced-motion preferences and touch input. Eight unique colours and starting-grid slots support up to eight human or bot drivers.

Redrock has roaming dust storms: the first arrives 15 seconds into the race, crosses the map for 42 seconds, then leaves 45 seconds clear before the next pass. Each elliptical cloud is 25% wider and deeper than before and moves one-third slower and alternates crossing direction between visits. Sand haze reduces distant visibility and sunlight while keeping nearby cars and road edges legible, including at high camera zoom. Clouds and airborne grit use two fixed GPU draws (48 cloud billboards and 550 grains on phones). Within the cloud, smooth one-second gusts (70% stronger) push left, right or backward, with two seconds between gusts. Three animated curved wind lines around each affected car flow in the actual gust direction and fade with its strength, using one fixed instanced draw and reusable buffers. Weather positions, coverage and wind use the same deterministic race clock in authoritative physics and client prediction; coastal and ice handling are unaffected.

Desktop controls use keyboard keycaps with bold action labels. Enter fires weapons (hold for continuous weapons); Space is unbound. The desktop weapon HUD shows an empty ring when unarmed, then the actual 3D pickup model with its matching colour, name and remaining ammo. Portraits are rendered once per weapon into a cached canvas using the existing game renderer, with no additional per-frame WebGL scene.

Each of Saltwater Circuit’s four open beach sections has three scuttling crabs. Their staggered crossings repeat every six seconds and take one second across the road, with an approach from and return to the water. Crabs push cars as moving, immovable obstacles; cars and weapons cannot displace or damage them. Shared deterministic movement keeps collisions and visuals on the same race timeline. Shells, eyes and animated legs use three instanced draws for all twelve crabs.

### Spectator sky beam

Eliminated human players can aim a sky beam with WASD, a phone joystick, or a controller's left stick. Enter, the existing weapon button, or R1 fires it. The coloured ground target follows a fixed screen position as the race camera moves, and conforms to road grades, terrain and the upper deck of bridges. Firing locks a world position; the descending bolt hits after 0.6 seconds and produces one player-coloured Pulse-sized shockwave with the same radial push but no direct damage. Shields and vertical separation still apply. The server enforces a three-second cooldown from firing; the target fades while recharging. Driving and nudging remain disabled for spectators, and each round clears pending strikes and cooldowns. Bots do not use spectator beams. Terrain indices are built once during loading; target mesh buffers rebuild only when crossing a terrain cell.

### Landscape detail

Each map includes twelve additional decorative scenery types, arranged in small scenes outside the racing surface. Coastal docks carry lifeguard towers, loungers, surf racks, fishing equipment, bait shacks, seafood stalls, picnic tables, diving platforms and lobster pots, with kayaks, buoys and rescue dinghies on the water. Desert scenes include windpumps, pumpjacks, solar panels, camps, fossils, wagons, wells, survey equipment, communications dishes, rock arches, agaves and fuel stops. Ice scenes include tents, research cabins, radar dishes, snowcats, sleds, snowmen, fishing huts, skis, weather stations, supply caches, crystals and igloos.

Placement is deterministic, checks clearance against every road segment and existing grouped scenery, rejects steep ground, and leaves the central ice river open. These are visual props only: no changes to collision, vehicle physics, server work or network traffic. The added scenery shares one vertex-colour material per map, merged into culled 70-metre spatial batches, with no per-frame prop updates or extra textures/lights.

The desert is enclosed by continuous eroded sandstone canyon walls. Saltwater has a large offshore mainland with sandy beaches, basalt cliffs, mountain ridges and an instanced broadleaf forest. These distant backdrops are purely visual, add one desert / three coastal render batches, and cast no extra shadows. The camera range accommodates the large landforms while small static scenery retains its previous distance limit. The Saltwater selection card now looks across a crab beach; primary actions are rectangular, Add bot matches Copy invite, and bot removal uses a borderless cross.

### Rendering and graphics budgets

The scene renders directly to the canvas. Bloom, screen-space ambient occlusion
and the HDR/MSAA post-processing pipeline have been removed. The grey atmospheric
fade remains in scene materials and reaches full fog before the far clip plane.
Base scenery ranges are 260 units on the coast, 240 on ice and 300 in the desert;
the camera extends these when needed to keep the racing pack in view. The former
1,600-unit backdrop override is gone. Weather density, particles and storms are
unchanged.

Each circuit bakes fixed scenery's sun shadows once while loading into a cached
RGBA depth texture (up to 4096 square, about 64 MiB). The temporary bake depth
buffer is released after the copy. Moving objects retain a camera-following
1024-square live shadow map. The static map shades sunlight only, preserving
ambient/rim lighting, and is rebuilt/disposed when changing circuit. This is a
runtime bake, so it does not add a downloaded shadow asset.

Sand, snow, rock weathering and water noise reuse small, shared, mipmapped noise
textures generated once per material family. World scale, wetness, colour,
ripples, lighting and animated water waves remain; ice keeps its existing baked
fracture texture and reflective material. The noise lattice matches the previous
hash within the stored tile, with byte quantization and seamless repetition.

Large terrain ribbons are split into spatial batches without changing triangles
or physics. Decorative scenery has two simpler distant meshes with hysteresis;
nearby decorations retain their original geometry. Forest instances are spatially
batched, and offscreen crab instances are omitted from rendering without changing
simulation. Circuit cards remain static images.

Dev logs shows the last unobscured scene's FPS, frame interval, JavaScript time,
all-pass draw/triangle counts and geometry/texture counts. JavaScript submission
time does not measure asynchronous GPU execution. Diagnostics retain at most 60
one-second samples in memory and do not send extra server telemetry.

Cars now roll their wheels, steer the front wheels, and brighten their brake lamps
when braking or reversing. Glacier cars have working headlights illuminating the
road. Saltwater's animated landmarks include erupting lava and ash, a cargo crane,
walking tourists, cascading falls and a geyser boardwalk. Landmarks occupy prominent
bends. Grainy, rippled sand slopes gently into animated waves and foam; the bank
uses the same surface triangles for rendering and collision.

Weapon effects use bounded batches for layered fire, sparks, smoke, shockwaves,
energy trails and branched arcs. Shields and sky strikes have animated energy
surfaces. Visual effects leave weapon damage and timing unchanged.

### Sampled audio and volume controls

The local bank contains 33 CC0 effects and loops (about 4.2 MB), with source URLs,
processing details and SHA-256 hashes in `public/sounds/sources.json`. Engine RPM
bands, recorded gunfire, rubber skids, wind and coastal ambience feed separate mixer
buses. Player sounds and nearby threats take priority over distant engines and ambience;
impacts and party speech duck less important layers. Effects run through compression
and a bounded output stage before the volume control. The music bus has an independent
volume and ducks under important impacts and party speech. Browser audio unlocks on the first interaction.

Death-line eliminations play a centered bass impact for everyone, regardless of camera distance.
The railgun layers its energy crack with a deeper, longer bass impact. Machine gun and
plasma shots are softer; the taser holds a seamless irregular electric arc while firing.
Death-line eliminations emit a server event for a bass-drum boom, with the eliminated
player's own cue kept audible. Results play a short two-note chime once per race
transition. Final impacts can decay over the results screen; held sounds stop. The
taser, rail body, elimination and chime samples are original deterministic synthesis
in `tools/build-audio.py`, included under CC0 with no attribution requirement.

Run `node --test --test-concurrency=1 test/*.test.js` for regressions. Open
`/audio-check.html` and press Run audio checks for a real Web Audio offline render
covering the bank, an eight-car mix, weapon bursts, spectator transitions, results
cues and cleanup. Rebuild assets using `python tools/build-audio.py SOURCE_DIRECTORY`
with NumPy, SciPy and soundfile installed, and the inputs named in the manifest.

### Chill Menu soundtrack

Chill Menu by Not Jam (CC0) plays continuously through menus, racing and results,
starting after the first interaction. The shipped 32-bar loop excludes the original
ending fade and uses an 8ms seam blend. Stereo Vorbis is 630 KB; the MP3 fallback
for browsers without Vorbis support is 683 KB. Only the selected format downloads,
on demand when music is enabled, independently of game loading. The source manifest
is `public/music/source.json`; `tools/build-music.py` reproduces both files from the
author's official player OGG. No uncompressed music file is shipped.

The circular speaker button sits next to the microphone and displays a red slash
when muted. It mutes music and all game effects without changing voice chat or the
two saved sliders. Its mute state persists. Hiding the page stops the soundtrack;
unmuting or returning resumes the saved position instead of restarting the song.

### Mines, coastal shoulders and automatic resolution

Mine hits add 5.2 m/s of vertical velocity and modest contact-dependent angular
velocity. Close mine clusters accumulate height and spin; an upright mine landing
retains 88% of horizontal velocity. Other weapon launches and lethal damage keep
their existing behavior. This remains an arcade simulation with gravity and tyre/
chassis contacts, rather than a full suspension or rigid-body engine.

Saltwater Circuit's visible dry banks support tyres using the same triangles as
the scenery. Cars follow the slope, can drive back onto the road, and can recover
an upright landing on dry sand. Submerged ground, empty space, ice gaps and desert
cliffs remain unsupported. Race progress still requires proximity to the road.

The 3D renderer measures foreground frame times, gradually raises resolution when
there is room, and lowers it more quickly under sustained load. It targets around
60 FPS, caps the drawing buffer at four million pixels and 3x CSS resolution, and
remembers stable settings per circuit, viewport and menu/race mode for seven days.
It continues adapting to race load and thermal changes; FPS cannot be guaranteed
on every device. Loading/background pauses and open settings/dialog overlays are
excluded. Auto retries higher resolution after 15 seconds of recovery instead of
holding a lower ceiling for 90 seconds; isolated moderate stalls are ignored.
The HUD stays native.

Settings → 3D resolution offers Auto and High (fixed), saved locally. High locks
the renderer to its maximum within the native/3x/four-million-pixel limits and
does not reduce resolution when FPS drops. The settings readout shows the actual
3D drawing-buffer dimensions and percentage of native resolution. The v3 Auto
cache ignores old resolution choices measured before the rendering optimizations.

Settings → Dev logs opts into the FPS/ping display and client console reports.
It is off for both new and existing installations until explicitly enabled, and
is saved locally. The existing server telemetry is unchanged.
