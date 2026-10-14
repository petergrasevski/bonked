# Bonked home-screen icon

The icon is a screenshot of the actual game renderer, with the original home-screen title artwork (`public/logo.svg`) overlaid. It uses the game's car models, paint colours, coastal circuit, lighting, shadows and nudge feedback. The two cars and close camera are staged for the capture; this is not an AI-generated rendering or a screenshot of a naturally occurring online race.

Opaque square exports are stored at `public/icons/bonked-game-180.png`, `public/icons/bonked-game-192.png` and `public/icons/bonked-game-512.png`. The Apple touch icon, manifest and install prompt use these new paths. The manifest identity and start URL are unchanged.

## Recreate the capture

`scripts/capture-app-icon.mjs` opens a temporary capture page in headless Chrome. The page imports the existing game modules from a running local Bonked server and overlays the original title SVG. No production game code is modified for capture.

The capture script requires Playwright and Chrome. Point `PLAYWRIGHT_MODULE` at an installed Playwright module if it is not available through normal package resolution.

```sh
node server.js
node scripts/capture-app-icon.mjs http://127.0.0.1:3210 test-results/app-icon
sips -z 512 512 test-results/app-icon/bonked-game-master.png --out public/icons/bonked-game-512.png
sips -z 192 192 test-results/app-icon/bonked-game-master.png --out public/icons/bonked-game-192.png
sips -z 180 180 test-results/app-icon/bonked-game-master.png --out public/icons/bonked-game-180.png
```

The screenshot before overlay is saved as `bonked-game-scene.png`; the full composite is `bonked-game-master.png`. Capture output under `test-results/` is ignored by Git.

## Installed icon updates

Existing iPhone/iPad Home Screen installations generally retain their installed icon. Remove the old Home Screen app and add Bonked again from Safari to reliably pick up this artwork. Chrome Android WebAPK installations can update manifest icons automatically, with browser-controlled timing. See [web.dev's platform update guidance](https://web.dev/learn/pwa/update).
