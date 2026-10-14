# Client caching and updates

Static assets have content-based weak ETags. The browser validates ordinary assets on each fresh page load; the server returns a body-free 304 for unchanged content. Only changed files need downloading again, including after a release. Hashed track-title images retain their year-long immutable caching. No service worker or offline app shell is installed.

The release fingerprint hashes `public`, `shared` and the served Three.js modules at server startup. This works in the Fly image without Git metadata and stays stable across machine restarts. HTML includes its fingerprint; `/api/version` is never cached. Client checks run on foregrounding, page restoration, reconnection, returning online, and every minute while visible.

Fly deployments restart the server and clear its rooms. Reconnecting clients return to the menu, where a new release can load immediately.

A pending update reloads only in a visible connected menu, a lobby with a recent server snapshot, or completed tournament results. Countdown, racing, and intermediate results are protected: intermediate results automatically advance after five seconds. The room's session token survives the reload so the player can rejoin. Offline/failed checks leave play running. A reload recreates audio contexts and may require another tap to enable audio, as with any fresh launch.

A page running code from before this feature needs one normal refresh/relaunch to acquire the updater. Afterward future releases are detected automatically. Browser cache eviction still causes a full asset download. This reduces repeated asset transfers, not ongoing gameplay or voice bandwidth.
