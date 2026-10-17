// The startup shell is independent of the game and its large 3D module graph.
export function createStartup({ view, delay = setTimeout, cancel = clearTimeout }) {
  let sceneReady = false,
    online = false,
    done = false,
    failed = false,
    slow = false;
  const timer = delay(() => {
    slow = true;
    render();
  }, 15000);
  function render() {
    if (done || failed) return;
    if (sceneReady && online) {
      done = true;
      cancel(timer);
      view.ready();
      return;
    }
    if (sceneReady)
      view.status(slow ? 'Still connecting to the race server…' : 'Connecting to the race server…');
    view.slow(slow);
  }
  return {
    progress(message) {
      if (!done && !failed) {
        view.status(message);
      }
    },
    connected(value) {
      online = value;
      render();
    },
    sceneReady() {
      sceneReady = true;
      render();
    },
    fail(message) {
      if (done || failed) return;
      failed = true;
      cancel(timer);
      view.error(message);
    },
  };
}
export async function start() {
  const $ = (id) => document.getElementById(id);
  const startup = (window.bonkedStartup = createStartup({
    view: {
      status: (message) => {
        $('startup-status').textContent = message;
      },
      slow: (value) => {
        $('startup-help').hidden = !value;
        $('startup-retry').hidden = !value;
      },
      ready: () => {
        $('startup').hidden = true;
        document.body.classList.remove('booting');
        window.dispatchEvent(new Event('bonked-ready'));
      },
      error: (message) => {
        $('startup-status').textContent = message;
        $('startup').classList.add('failed');
        $('startup').setAttribute('aria-busy', 'false');
        $('startup-help').hidden = true;
        $('startup-retry').hidden = false;
      },
    },
  }));
  try {
    await import('./app.js?v=1.0.0');
    // Let the first game frame render before revealing interactive controls.
    requestAnimationFrame(() => startup.sceneReady());
  } catch (error) {
    console.error('Bonked startup failed', error);
    startup.fail('Could not load Bonked. Check your connection and try again.');
  }
}
