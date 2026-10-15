# Additional circuits

Five circuits are selectable in a horizontal carousel with mouse dragging, touch
scrolling, wheel scrolling, keyboard arrows and previous/next buttons that move one card at a time. Every circuit uses text artwork layered over a live preview.

## Skid Mark Industries

The elevated race route runs inside one enormous car assembly hall, with walls,
ceiling trusses, lights, overhead ducts, maintenance walkways, production belts,
robotic welders, car bodies, inspection stations, supply bins and tool cabinets.

- Three 220–230m conveyors reverse every three seconds over a 1.5-second transition.
  Blue/yellow colors blend continuously and chevrons flatten through zero speed
  before bending the other way.
- Stamping presses occupy the geometric inside of corners and cycle every three
  seconds with amber warning lamps, a smooth hydraulic stroke and steam exhaust.
  Wider plates move laterally before stamping within the inner two thirds,
  always leaving the outer third clear.
- Two 48m rotating platforms have two concentric rings of physical walls and
  generous gaps. Their rotation and collisions share the same simulation clock.
  The outer deck turns at .234 radians/second; a nested 22.6m deck rotates
  in the opposite direction at 1.2 times that speed. Walls have irregular profiles
  and short inward tails. Neither platform has perimeter rails.
  The road widens to meet the platforms. Bots plan routes through the moving gaps.
- Many outer corner rails and several straight guard sections are absent, allowing
  other drivers to shove cars off the raised route.

Later in the lap, a large left-lane pressure button sits after the right-lane
tipping deck, allowing leaders to catch following rivals. Normal road surfacing
and a dotted border mark the panel: a 0.25-second drop to 35 degrees, 1.5-second
hold and 1.55-second eased return. Both panel ends release cars below the fixed
road instead of lifting them onto it. Activation is replicated to
every racer and replayed by prediction. The downhill force can be fought by
driving left uphill; falling cars drop toward an assembly line below. Contact
with the factory floor eliminates immediately, even before the usual fall timer.

## Krakatoa

The road circles a tall volcano at 140–152m elevation, with a crater rising to
330m. The inner hillside climbs above the road and the outer side alternates steep cliffs with broader tumble slopes.
Two gentle shoulders (near 16% and 66% of the lap) support driving off the road
and returning. The same physical terrain remains reachable elsewhere: steep
slopes reduce engine traction and pull cars downhill. Volcano contact remains survivable only on slopes up to 35 degrees with an
unbroken climbable route back to the road. Steeper terrain or leaving that area
starts a 1.2-second death timer that only clears on reachable safe terrain;
flatter land below a cliff does not reset it. Race progress continues on supported shoulders. Rendered mountainside triangles also form the physical terrain.

- Flowing procedural lava has shared organic banks and tapered ends. Red fractured
  basalt, outcrops and molten rivers cover the mountainside; 14 four-rock clusters
  sit along alternating road edges, leaving the middle racing line clear.
- Hot lanes give 40% extra engine speed immediately, rising to 80% over three
  seconds. Heat builds and cools at one second per second, capped at three.
- Above one second, burning starts at 6.67 damage/sec, rising to 13.33 at three
  seconds. Burning persists while cooling until heat falls to one second.
- Larger wheel flames grow with heat. Every heated car has a thermometer above
  it, including remote players; the red threshold marks one second. The indicator
  disappears only when fully cooled.
- Eighteen varied claw-shaped fissures span different lanes, angles and sizes.
  They constantly release steam. Each staggered three-second
  eruption emits fresh faster particles; existing wisps retain their own lifetime.
  Launches use jump landings to preserve driving momentum.
- Optional `TRACKS[id].camera` yaw/pitch offsets adjust the existing camera target
  before shared smoothing and frustum containment. Volcano uses a 25-degree outside view that moves farther sideways and lowers
  to 20 degrees as cars spread out; tracks without a profile retain their normal
  camera.

The water circuit and its dedicated geometry, scenery, surface shader, simulation,
picker entry and tests have been removed. Coastal water on Saltwater Circuit is
unaffected.

Run `npm test` for physics, bots, prediction, live socket races and browser-module
coverage. Browser checks cover rendering, all-player heat overlays, carousel
interaction and phone layouts.

Krakatoa’s two recoverable shoulders have varied, non-colliding volcanic scrub along their actual recovery boundary. Placement traces the authoritative slope/path predicate, including the tapered ends; the terrain breaks more steeply below the outer lip. Shrubs are static, spatially batched scenery and do not change car collision or other circuits.
