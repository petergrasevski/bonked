# Audio

Enable **Settings → Engine & effects** before starting a race. The browser loads and decodes the local sample bank once per tab; no third-party service or account is required at runtime. A failed sample can be retried by toggling sound. Previously consumed weapon events never replay after loading or unmuting.

## Sounds and provenance

The 30 mono WAV assets total approximately 4 MB. Every imported source is CC0 1.0 (public domain, no attribution required). `public/sounds/sources.json` records the source pages, authors, download URLs, processing, output durations and SHA-256 hashes. The author names are an internal provenance record, not a requirement for in-game credits.

- Engine: GiocoSound's BMW 120d exterior idle, low, medium and high RPM recordings from Freesound. Four equal-power bands with modest pitch changes, throttle filtering, gear hysteresis and a shift dip. Band RPM anchors are artistic tuning, not measured vehicle telemetry; separate recorded on-load/off-load sets are not available in this bank.
- Physical weapons: recorded gunfire from BlacklightKabuki and michorvath on Freesound, layered with Kenney metal/impact samples.
- Sci-fi weapons: Kenney Sci-fi Sounds and Impact Sounds. Multiple variants avoid immediate repetitions. These include designed/synthesized effects, not recordings of real sci-fi weapons.
- Coast: Noted451's ocean recording. Wind: florianreichelt's Soft Wind. Quiet ambience follows the circuit, with desert storm coverage increasing the wind.
- Skid: johnnydekk's recorded rubber foley. Lateral velocity controls intensity; straight acceleration, boosts, airborne cars, nudges and wrecks do not trigger drift squeal. Ice has a softer, darker mix.

Freesound inputs currently use the site's publicly linked high-quality MP3 previews, which are lossy; they are not the original WAV masters. Kenney inputs use the original OGG pack files. Outputs are trimmed, filtered, DC-corrected and level-matched 32 kHz PCM WAV for straightforward browser decoding. Loop ends are crossfaded. WAV output does not restore information lost in the source MP3s. Downloads and source HTML stay outside the game repository.

To rebuild, install `numpy scipy soundfile` into a Python virtual environment and run `python tools/build-audio.py SOURCE_DIRECTORY`. Download the inputs listed in `sources.json` using the recorded filenames (`engine-idle.mp3`, etc.), put `freesound-sources.json` containing the manifest's `sources` array alongside them, and extract the two Kenney archives as `sci-fi/` and `impact/`. The renderer is deterministic. Do not add non-CC0 replacements without changing the provenance and checking their terms.

## Mix

`AudioMixer` owns player-engine, rival-engine, weapon, tyre, ambience and UI buses. The local engine remains audible at the edge of the shared camera view. Opponent engines and effects use camera-relative stereo placement and distance attenuation; distant weapon effects also lose high frequencies. The listener follows the race after elimination.

Important nearby/player shots briefly reduce rival engines and ambience, with a lighter dip in the player's engine and tyres. Incoming party speech reduces game effects using an analyser on existing incoming playback; it neither requests microphone permission nor records speech. A compressor and bounded soft clip provide headroom for simultaneous impacts. The weapon allocator prefers important local events over distant small shots and is bounded to 32 active voices plus at most eight releasing voices. Skids are limited to the local car and three nearby rivals.

All continuous sources stop on mute, hidden pages, disconnect, leaving, round changes or inactive race phases. Decoded buffers remain cached. Wreck explosions now generate sound events, and weapon sound events carry their owner so the mixer can identify the player's actions.

## Validation

Run `npm test` for lifecycle, priority, loading/retry, provenance, physics and network coverage. Open `/audio-check.html` on the local game server and press **Run audio checks** for real Web Audio offline rendering: eight cars, all weapon families, a 60-shot overload, drifting, all three circuits, incoming-speech ducking, local elimination and final mute. It reports peak/RMS, non-finite samples, remaining voices and tail silence. This is a developer diagnostic page, not part of normal gameplay.

The initial Chrome render decoded all 30 files, peaked below 0.78 full scale, retained seven opponent engines after local elimination, and ended with zero voices and a silent tail. These technical checks do not replace subjective headphone/phone-speaker listening or physical iPhone validation.
