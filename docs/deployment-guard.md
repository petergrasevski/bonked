# Deploy only when rooms are empty

The GitHub workflow builds and pushes its image before waiting. It checks the live server every 30 seconds, for up to twenty minutes. Connected human players in any room phase block deployment. Disconnected humans also block it for the existing twenty-second reconnect grace period. Menu visitors and bots alone do not block it.

The check uses Fly's authenticated SSH tunnel to call `POST /internal/deployment?action=acquire` on the target machine's loopback address. The endpoint rejects requests from the Fly proxy, LAN and private-network peers; forwarded headers cannot grant access. No new app secret is needed. The workflow's Fly token must permit SSH as well as deployment.

An empty check and entry pause happen synchronously inside the game server, so room creation cannot slip between them. The workflow owns the pause using a random UUID. Until deployment finishes, create/join attempts receive an updating message; clients retry every two seconds. The workflow deploys the prebuilt image with an eight-minute command timeout, and releases the pause on success or failure. If cancelled or unable to release, the pause expires after ten minutes. Restarting the server clears it immediately.

If the server stays occupied, the workflow records **Deployment deferred** in its job summary and leaves the old version running. It skips the multiplayer smoke test, which would create rooms, and must be rerun later. A missing guard, failed SSH request, unhealthy server or unexpected response fails the workflow without deploying. Concurrency serializes deployments, and the existing single-machine checks remain.

## First rollout

The currently deployed version predates the guard. Pushing this workflow alone will fail closed until the guarded server has been installed. Install the prebuilt image once in a deliberate idle window, after checking `/health` reports zero rooms and players have finished. The old version cannot atomically pause room entry, so this first upgrade needs that controlled window. Subsequent workflow deployments use the guard automatically. There is intentionally no automatic fallback to an unguarded deployment.

## Scope

This protects deployments performed by the GitHub workflow. Direct `flyctl deploy`, secret changes, machine updates and platform restarts do not invoke the guard. It postpones upgrades; it does not persist rooms across a restart or migrate games to another machine. No extra requests are made by players already in a room during the waiting period.
