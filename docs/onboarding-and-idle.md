# How to play and idle connections

How to play appears once after successful startup, and is remembered in local storage when dismissed. It is available from Settings and the question-mark button beside the audio controls in the menu/lobby. The four short sections explain scoring, weapons, the death line, and sky-beam bonks. Fire/aim instructions follow keyboard, touch or standard controller input. The existing mobile installation prompt is suppressed on that first visit so it cannot cover onboarding.

The previews render actual sports cars, the machine-gun pickup, the shared elimination-line factory, and the sky-strike/pulse effects. They use the existing game renderer with small render targets and 2D canvases, with no screenshot assets or additional WebGL context. Preview animations run only while the panel is visible, at up to 20fps; reduced-motion mode shows a still frame. Background scene rendering pauses while help is open.

Human connections expire after ten minutes without activity, checked by the existing ten-second heartbeat. Room actions, trusted pointer/keyboard interactions, held driving controls, controller input and audible outgoing microphone frames count as activity. Network pings, diagnostics, neutral game inputs, incoming chat and silent microphones do not. Removing the last human removes the room, including its bots, and closes that player's voice connection.

An idle client clears its room token and stops reconnecting or polling for releases. A new interaction or returning from the background reconnects it. This allows the existing Fly connection-based autostop configuration to see an unused machine. Fly decides when to stop it; the ten-minute timeout is not an exact machine-shutdown deadline. Other traffic can keep it running.
