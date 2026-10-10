# Tounched

A playable browser combat-racing prototype inspired by the shared overhead racing of Wrecked. Original procedural 3D artwork, one coastal circuit, distance-based elimination, three-lap races, and private rooms for up to six cars. The in-game title is “Tounched”.

## Run on this laptop

Requires Node.js 22 or newer.

```sh
cd /Users/pgrasevski/src/atlassian/wrecked
npm ci
npm start
```

Open **http://localhost:3210**. The server prints the laptop's Wi-Fi address on startup. Port 3210 is used because port 3000 was already occupied during development.

For this laptop's current network, try **http://192.168.1.180:3210** on a phone connected to the same Wi-Fi. The IP can change when you switch networks. **Settings → Open on your phone** shows the current address and a QR code; **Copy invite** includes your room code.

Keep the laptop awake and the server running. If macOS prompts about incoming connections, allow Node for your local network. Guest Wi-Fi/client isolation or a VPN may prevent devices from reaching each other. Do not disable security protections blindly. The development environment can access localhost but returned an empty response when checking the private LAN address; physical phone access still needs confirmation.

To use another port: `PORT=4000 npm start`. To bind only to this machine: `HOST=127.0.0.1 npm start`. `npm run dev` restarts the server on edits; a restart ends active rooms.

## Play

1. Enter a name and create a room. Share its three-letter code or invite URL.
2. Friends join and receive different random colours. The host starts the race.
3. Add optional practice drivers to try it alone. Bots count toward the six-car limit.
4. Keep ahead of the red elimination line. It stays **108 game metres of road distance behind the leader**, roughly three seconds at the normal maximum speed. It is not a timer: a stopped leader does not make the line creep forward. Crossing behind it eliminates your car; eliminated drivers spectate. In multiplayer, the last survivor wins. If more than one survives, the three-lap finish still applies. Round scores carry forward automatically. Every connected human can tap Ready; the next countdown starts as soon as everyone is ready or five seconds elapse. The next grid forms behind the previous winner’s finishing checkpoint.

Landscape is required: portrait shows a full-screen rotate prompt, and controls are released when the device rotates. The circuit is approximately **2.43 km, 30% shorter than v0.2**, with two extended straights and fewer turns on a narrow island causeway. Both exposed edges drop into water and kill the car; scenery islands are separated from the road by water. There is no safe field runoff. Everyone shares a perspective camera behind the surviving pack. It anticipates bends, includes **20 metres ahead of the leader** and **10 metres behind the last car**, and rises gradually from a 26° chase view toward a 70° overhead view as the pack spreads out. The death line enters view when it approaches the last car. Viewport fitting keeps every surviving car and its roof weapon in frame, including during camera turns and local prediction.

| Control | Phone | Keyboard |
| --- | --- | --- |
| Accelerate | Hold GO, lower right | W / Up |
| Steer | Hold LEFT or RIGHT | A/D or Left/Right |
| Reverse | Hold DRIFT/R for at least 0.35 seconds; release to reset | Hold Space, or S / Down |
| Handbrake / drift | Briefly hold DRIFT/R, above and right of GO | Briefly hold Space |
| Nudge sideways | Top-left / top-right corner | Q / R |
| Use pickup | WEAPON button above and right of GO | E |

Holding GO through the countdown continues driving at GO. Start holding it with **1,000 ms remaining, within ±20 ms**, for a 0.8-second launch boost (35% extra acceleration, 10% extra speed ceiling). Hold continuously from **more than 2,000 ms before GO** and the car spins for 1.1 seconds before accelerating. Releasing GO resets the attempt. Controls carry their original press timestamp in the synchronized server clock; the server bounds timestamp compensation to 250 ms and owns the outcome. Countdown numbers update at animation-frame frequency.

Tap a corner nudge to shift one car width sideways over 0.2 seconds, with a 0.8-second cooldown. Contact deals 8 damage once per target, pushes the other car about 1.75 widths and turns it away. Barriers and shields still apply.

Cars reach 36 game metres/second (20% faster than v0.2) at full health. Damage reduces engine acceleration and the speed ceiling linearly: `0.8 + 0.2 × (health − 1) / 99`, giving 100% speed at 100 HP and 80% speed at 1 HP. Damage also reduces lateral grip and steering response, making battered cars drift more. External crash/weapon impulses can temporarily exceed the engine limit.

The long, low chassis is fitted directly to the shared **4.9 × 2.1m** oriented collision box, including bumpers and wheels. Contacts use the overlap of bumper/door faces, friction, and six solver passes with road constraints. Impulses transfer momentum and rotation, so contact can push cars into barriers or off unprotected outer edges. Cars have 100 HP, five damage states, increasing smoke and fire, and an eight-second shield. Hard barrier impacts and car crashes also cause damage. Zero HP creates an airborne, tumbling wreck that remains a physical obstacle until the round ends.

| Pickup | Behaviour | Damage |
| --- | --- | --- |
| Pulse | Two radial pushes, one second apart; 16m radius | 8 per wave |
| Homing rocket | Targets the next car ahead in race order; can be intercepted | 42 |
| Machine gun | Hold to fire 30 fast, swept-hit rounds | 2 per round |
| Shield | Bubble blocks damage and weapon knockback for 8 seconds | — |
| Railgun | One instant 150m piercing shot with a lingering trail and a small airborne launch | 75 per target |
| Mines | Three taps; arm after 0.1s; launch and tumble cars | 28 |
| Ball & chain | Momentum-driven tether about two car lengths behind; detonates on contact | 45 |
| Flamethrower | Hold for up to 3 seconds of fuel; forward cone about two car lengths | 12/second |
| Plasma cannon | 12 straight shots at 54m/s; hold to continue | 8 per shot |
| Shotgun | Four shells with a 0.3s cooldown; five pellets out each side with outward knockback | Up to 35 per side |

Weapon pickups form rows of three or four across the road, spaced about ten seconds apart at full speed. These are initial balance values. Pickups are slowly rotating 3D weapon models with a coloured ground glow. The server chooses each visible weapon in advance, awards exactly that item, and chooses the next one for its six-second respawn. Sound is opt-in. The physics is a lightweight arcade simulation: planar rigid-body impulses, a constrained swinging ball, and ballistic height/roll/pitch. Landing orientation determines whether a live car lands upright or is stranded on its roof until the elimination line catches it; it is not a full suspension or general-purpose 3D rigid-body engine.

The race uses the full screen, with Settings, round count and segmented score thermometers centred at the top. Score segments glow more as players approach the winning total. Rendering uses worn asphalt and concrete, rounded chassis, softer billboard smoke, muted coastal colours, water highlights, and a light vignette. All textures and models are generated locally; no remote art assets or image processing passes are required.

## Multiplayer design

- One Node process serves the assets and a same-origin WebSocket endpoint at `/ws`.
- Server-authoritative physics at 60 Hz; snapshots at 20 Hz. Clients send input, never authoritative positions, lap counts, item ownership, or finish times.
- The server owns elimination and broadcasts the common chase/camera frame. The cutoff uses unwrapped race distance, including across the lap seam.
- Shared physics powers immediate local prediction. Unacknowledged inputs are replayed with nearby body contact; all opponents extrapolate on the same ticks while driving so delayed remote cars do not overlap the predicted local car. Authoritative snapshots continually correct this short prediction. Render smoothing also resolves body overlap. Spectators and the shared camera retain roughly 90 ms of interpolation. This is a prototype reconciliation model, not a deterministic lockstep engine.
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

To make the localhost lobby's **Copy invite** and phone QR use that address too, restart the game server with:

```sh
PUBLIC_URL=https://your-generated-address.trycloudflare.com npm start
```

Opening the game directly at the public URL automatically uses it for invites. For other server ports, update `--url` in the share command accordingly.

Quick Tunnels are for development and have no uptime guarantee. See [Cloudflare's documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). For independent, persistent hosting, use the container below.

A Docker image is included for the next stage:

```sh
docker build -t wrecked .
docker run -d --name wrecked --restart unless-stopped -p 3210:3210 wrecked
```

Deploy this container to a host that supports **persistent WebSockets**, with TLS and an HTTPS public domain. Terminate TLS at the host's reverse proxy and forward both HTTP and WebSocket upgrades to port 3210. The browser automatically uses `wss://` on HTTPS. Set `PUBLIC_URL=https://your-game.example` for generated invites/QR codes when opening through localhost.

Use one always-running instance initially, in a region near the players, with automatic process restart and `/health` as its health check. Avoid services that sleep when idle or impose short-lived request limits. A static-site-only host cannot run the coordination server.

Rooms live in process memory. This first version is **not highly available**: a deploy, process crash, or host outage ends races. Multiple instances require room-aware routing plus a shared room directory (or a dedicated per-room game-server model); adding load balancing alone will not work. Public hosting should be measured with the actual friends' devices and networks before claiming latency or uptime targets.

## Verification

```sh
npm test
```

The tests start a separate server on localhost:33211 and use six real WebSocket connections to verify unique colours, capacity rejection, host-only start, authoritative positions, countdown, token reconnection, pickups, elimination, a last-survivor finish, shared camera bounds, tournament readiness, score retention, advancing start grids, and host handover. Physics and combat tests cover road clearance, full-course navigation, steering validation, reverse, drift, solid collisions, wall damage, persistent wrecks, upside-down landings, and the damage, ammo, timing and targeting rules of all ten weapons. Network tests also reject client-supplied health and weapons. Launch tests cover the exact ±20ms boundaries, release/reset, held GO across GO, and all three start outcomes using live sockets. Regression checks cover health-speed endpoints, both fatal road edges, camera lookahead, bumper/door impulses, and peer collision prediction.

Browser QA uses landscape phone emulation in Chrome: multi-touch, long holds, double taps, release/reset, reverse timing, and rotation to portrait. CSS touch-action, user-select and -webkit-touch-callout plus non-passive game-surface touch handlers suppress browser gestures while keeping lobby inputs editable. Input text is at least 16px to avoid iPhone focus zoom. Actual iPhone Safari verification is still needed: emulation cannot reproduce every iOS callout or OS edge gesture. Add to Home Screen can reduce browser chrome; it does not remove system gestures. A native wrapper is a possible later option, not required for these normal touch controls.

## Files

- `server.js`: HTTP, WebSockets, rooms, race lifecycle, item authority.
- `shared/game.js`: track geometry, car simulation, collisions, bot driving and brake-hold timing.
- `shared/combat.js`: weapon definitions, server-owned damage, projectiles, mines, and tether physics.
- `shared/prediction.js`: client prediction of the local car and peer contact on a common timeline.
- `shared/chase.js`: fixed-distance elimination, shared camera framing and result ordering.
- `public/pickups.js`: ten reusable 3D weapon models with distinct silhouettes.
- `public/world.js`: Three.js scene, procedural models, lighting, camera and effects.
- `public/app.js`: networking, prediction, lobby, results, touch/keyboard input and audio.
- `public/style.css`: responsive lobby and racing interface.
- `test/`: deterministic physics checks and end-to-end server protocol tests.

A track is currently authored in `shared/game.js`, with its scenery in `public/world.js`. A track registry and map selection can be introduced when a second circuit is added.


### October visual / phone update

The road widens smoothly around bends (up to 18m) and three passing plazas (24m). Raised red/concrete walls with dark caps protect the edge; yellow paint alone marks unprotected drops. Six yellow/black solid traffic islands divide the plazas. The server, local prediction, camera, pickups and bots use the same road widths and obstacle positions.

Settings contains engine audio, controls, fullscreen and the phone QR link. Music has been removed. Engine audio mutes immediately on elimination, falling, finish, stale state or disconnection.

### Tournament and landmarks

Six-car scoring is **+3, +2, +1, 0, −1, −2**. With fewer cars, first still earns +3, intermediate places use the same descending awards, and last loses −2 (a solo driver earns +3). Every grid size adds points overall. The target is fixed when a tournament starts: **15 with 1–4 cars; 10 with 5–6**. Bot cars count toward grid size and are automatically ready. Connected humans vote ready; otherwise the server advances after five seconds. Round awards are applied once on the server. Scores survive a brief reconnect; completed tournaments wait for the host to start a new one.

Eight landmarks are spaced about 303 road metres apart (roughly ten seconds at racing speed): Palm Island, Ember Caldera, Geyser Springs, Cargo Harbour, Sunken Temple, Twin Falls, Beacon Point, and Wreck Bay. Animated features share the particle budget; static geometry uses the existing batching. Wall and centre-island damage is `max(0, speedBefore − speedAfter − 1.5) × 0.3`, reducing grazing damage sharply.

### Laptop-independent free hosting

`render.yaml` configures one **Free** Node web service in Singapore, with `/health` checks and manual deployments. Connect the game's private repository in Render, select Node, `npm ci --omit=dev`, `node server.js`, Singapore, and **Free ($0)**. No database, disk or paid compute is required. This account was prompted for card verification even on Free; deployment was stopped at the user’s request and no cloud service exists yet. Keep paid upgrades off; without a payment method, exceeding included bandwidth suspends the free service rather than charging. Render's free service sleeps after 15 minutes of no incoming HTTP/WebSocket traffic and takes roughly one minute to wake. Active games send input and ping messages. Free services may also restart, so this is hobby hosting, not guaranteed uptime; rooms and scores are in memory and reset on a restart. [Official free-tier limits](https://render.com/docs/free).

WebSocket snapshots use low-level compression to reduce free-tier bandwidth. A public smoke test accepts any deployed origin: `node scripts/check-public.mjs https://YOUR-SERVICE.onrender.com`.
