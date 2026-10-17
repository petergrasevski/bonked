// Pairing steps checked against the linked manufacturers' documentation.
export const CONTROLLER_GUIDES = [
  {
    id: 'ps5',
    name: 'PS5 · DualSense',
    steps: [
      'Unplug the USB cable. If the controller is on, hold the PS button until its lights turn off.',
      'Hold Create (the small button to the left of the touchpad), then hold PS as well. Release when the light bar starts blinking.',
    ],
    device: 'DualSense Wireless Controller or Wireless Controller',
    usb: 'Use a USB-C cable that carries data.',
    source: [
      'Sony: DualSense pairing',
      'https://www.playstation.com/en-us/support/hardware/pair-dualsense-controller-bluetooth/',
    ],
  },
  {
    id: 'ps4',
    name: 'PS4 · DUALSHOCK 4',
    steps: [
      'Disconnect the USB cable and turn the controller off. Hold PS until its light goes out if needed.',
      'Hold SHARE and PS together until the light bar flashes.',
    ],
    device: 'DUALSHOCK 4 Wireless Controller or Wireless Controller',
    usb: 'Use a micro-USB cable that carries data.',
    source: [
      'Sony: DUALSHOCK 4 pairing',
      'https://www.playstation.com/en-us/support/hardware/ps4-pair-dualshock-4-wireless-with-pc-or-mac/',
    ],
  },
  {
    id: 'switch-pro',
    name: 'Switch 1 · Pro Controller',
    steps: [
      'Disconnect the USB cable. Find the small SYNC button on the top edge, next to the USB-C port.',
      'Hold SYNC for at least one second, until the player lights start moving.',
    ],
    device: 'Pro Controller',
    usb: 'Try a USB-C data cable. Recognition varies with the OS and browser; charging alone does not mean game inputs are available.',
    source: [
      'Nintendo: original Pro Controller pairing',
      'https://www.nintendo.com/au/support/articles/how-to-pair-the-nintendo-switch-pro-controller/',
    ],
  },
  {
    id: 'joy-con',
    name: 'Switch 1 · Joy-Con (L / R)',
    steps: [
      'Detach the Joy-Con from the Switch and remove its strap to reach the inner rail.',
      'Hold the small SYNC button on that rail until the player lights start moving. Repeat for the other Joy-Con if needed.',
    ],
    device: 'Joy-Con (L) or Joy-Con (R)',
    usb: 'Original Joy-Con have no direct USB data port. A charging grip or charging cable is not a guaranteed wired gamepad connection to your laptop. Use Bluetooth.',
    note: 'The OS may expose the left and right Joy-Con separately or as a pair. For a combined original pair, choose Split Joy-Con pair in the Local party lobby, then press a face button on each half to join separately. Hold sideways: bottom face accelerates, left face reverses and right face fires. SL and SR nudge left and right when exposed by the browser. Choose Configure to adjust either layout.',
    source: [
      'Nintendo: original Joy-Con pairing',
      'https://www.nintendo.com/au/support/articles/how-to-pair-joy-con-controllers/',
    ],
  },
  {
    id: 'switch2-pro',
    name: 'Switch 2 · Pro Controller',
    switch2: true,
    steps: [
      'Check desktop compatibility first: normal Bluetooth pairing is not a confirmed plug-and-play route for this controller in Bonked.',
      'If you already use a compatible desktop bridge, choose its Switch 2 Pro Controller mode and follow its pairing prompt. The small SYNC button is on the controller’s top edge. Hold it until the player lights flash when the bridge asks you to pair.',
    ],
    device: null,
    usb: 'Do not assume USB-C is plug-and-play. Some desktop software can read this controller over USB, but that does not guarantee it is exposed to a browser.',
    source: [
      'Switch 2 desktop bridge documentation (third-party)',
      'https://github.com/TheFrano/joycon2cpp',
    ],
  },
  {
    id: 'joy-con2',
    name: 'Switch 2 · Joy-Con 2 (L / R)',
    switch2: true,
    steps: [
      'Detach the Joy-Con 2 from the console. These are different devices from the original Joy-Con and need compatible desktop support.',
      'If a compatible desktop bridge is already installed, choose left, right or paired Joy-Con 2 in that app and follow its pairing prompt. The SYNC button is on the inner attachment edge; hold it until the player lights flash when the bridge asks you to pair.',
    ],
    device: null,
    usb: 'A charging grip or USB charging connection does not establish browser controller support. Use a compatible desktop bridge only if it exposes a standard gamepad to the browser.',
    source: [
      'Switch 2 desktop bridge documentation (third-party)',
      'https://github.com/TheFrano/joycon2cpp',
    ],
  },
];
export function controllerGuideOS({
  userAgentData,
  platform = '',
  userAgent = '',
  maxTouchPoints = 0,
} = {}) {
  if (/Android/i.test(userAgentData?.platform || userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1))
    return 'ios';
  const hint = userAgentData?.platform || platform || userAgent;
  if (/mac/i.test(hint)) return 'mac';
  if (/win/i.test(hint)) return 'windows';
  return 'other';
}
export function connectionInstructions(os, id) {
  const controller = CONTROLLER_GUIDES.find((c) => c.id === id) || CONTROLLER_GUIDES[0];
  const mac = os === 'mac',
    windows = os === 'windows';
  const path = mac
    ? 'Apple menu → System Settings → Bluetooth'
    : windows
      ? 'Start → Settings → Bluetooth & devices → Add device → Bluetooth'
      : null;
  const compatibility = controller.switch2
    ? windows
      ? 'Windows: Switch 2 Bluetooth use can require a separate bridge and virtual-controller driver. Bonked does not include or verify that setup. The linked community project documents one Windows-only approach. Pairing in Windows Settings alone may not be enough.'
      : mac
        ? 'macOS: Bonked has not verified a built-in Bluetooth or USB route for this Switch 2 controller. The linked Windows bridge does not run on Mac. If your current macOS and browser do not expose it, use an original Switch controller, a PS4/PS5 controller or a phone.'
        : 'Switch 2 desktop support needs checking for your laptop. Select its OS above. Bonked cannot read the controller until the OS or a compatible bridge exposes a gamepad.'
    : controller.note ||
      'Pairing connects the controller to the laptop. Bonked reads it through the browser after you press a button.';
  return {
    controller,
    path,
    compatibility,
    osNote: mac
      ? 'On older Macs, open System Preferences → Bluetooth instead.'
      : windows
        ? 'Windows 10: Settings → Devices → Bluetooth & other devices → Add Bluetooth or other device → Bluetooth.'
        : 'Choose the laptop’s OS above to see its Bluetooth settings path.',
  };
}
const node = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};
export function createControllerConnectionGuide({
  root,
  environment = navigator,
  onOpen = () => {},
  onClose = () => {},
}) {
  const os = root.querySelector('[data-guide-os]'),
    controller = root.querySelector('[data-guide-controller]'),
    body = root.querySelector('[data-guide-body]'),
    close = root.querySelector('[data-guide-close]');
  let previousFocus = null;
  const detectedOS = controllerGuideOS(environment),
    mobile = ['ios', 'android'].includes(detectedOS);
  os.value = detectedOS;
  root.querySelector('.controller-guide-selectors').hidden = mobile;
  root.querySelector('#controller-configure-open').hidden = mobile;
  root.querySelector('[data-guide-intro]').textContent = mobile
    ? 'Connect a PS5 DualSense controller to your phone over Bluetooth.'
    : 'Pair in your laptop’s settings first, then join Bonked.';
  for (const guide of CONTROLLER_GUIDES) controller.add(new Option(guide.name, guide.id));
  function render() {
    if (mobile) {
      const guide = CONTROLLER_GUIDES[0];
      body.replaceChildren();
      body.append(node('h3', 'Pair your PS5 controller'));
      const steps = node('ol');
      for (const step of guide.steps) steps.append(node('li', step));
      steps.append(
        node(
          'li',
          detectedOS === 'ios'
            ? 'On your iPhone or iPad, open Settings → Bluetooth and turn Bluetooth on.'
            : 'On your phone, open Settings → Connected devices → Pair new device (or Settings → Bluetooth).',
        ),
      );
      steps.append(
        node(
          'li',
          'Select DualSense Wireless Controller (or Wireless Controller) in the Bluetooth device list. Wait for it to show as connected.',
        ),
      );
      body.append(
        steps,
        node('h3', 'Play Bonked'),
        node(
          'p',
          'Return to Bonked, then press a controller button so the browser can detect it. Create or join a room as usual. Keep this browser tab active while playing.',
        ),
        node('h3', 'Having trouble?'),
        node(
          'p',
          'Make sure the controller is connected to this phone. If needed, forget it in Bluetooth settings and pair again, then return to Bonked and press a button.',
        ),
      );
      const source = node('a', 'Sony: DualSense pairing');
      source.href = guide.source[1];
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      const sources = node('p');
      sources.className = 'controller-guide-sources';
      sources.append(source);
      body.append(sources);
      return;
    }
    const {
      controller: guide,
      path,
      compatibility,
      osNote,
    } = connectionInstructions(os.value, controller.value);
    body.replaceChildren();
    body.append(
      node('h3', guide.switch2 ? 'Check compatibility first' : 'Connect over Bluetooth'),
      node('p', compatibility),
    );
    if (!guide.switch2) {
      const steps = node('ol');
      if (path) steps.append(node('li', `On the laptop, open ${path}. Turn Bluetooth on.`));
      else
        steps.append(node('li', 'Choose the laptop’s OS above, then open its Bluetooth settings.'));
      for (const step of guide.steps) steps.append(node('li', step));
      steps.append(
        node(
          'li',
          `Select ${guide.device} in the laptop’s Bluetooth list${os.value === 'mac' ? ' and click Connect' : ''}.`,
        ),
      );
      body.append(steps, node('p', osNote));
    } else {
      const steps = node('ol');
      for (const step of guide.steps) steps.append(node('li', step));
      body.append(steps);
      body.append(
        node(
          'p',
          'If a bridge exposes a working gamepad to your browser, Bonked can use it. Seeing the controller in Bluetooth settings or Steam is not sufficient by itself.',
        ),
      );
    }
    body.append(
      node('h3', 'Then join Bonked'),
      node(
        'p',
        'Return to this browser tab. Choose Local party → Host local party, then press any controller button to join. Release it before driving. Each controller gets a name and car colour. If buttons are wrong, choose Configure in the lobby.',
      ),
    );
    const usb = node('details');
    usb.append(
      node('summary', 'Using a USB cable'),
      node('p', guide.usb),
      node(
        'p',
        'For supported wired controllers: connect directly to the laptop, wait for the OS to recognize it, then press a button in Bonked. If it only charges, try a data-capable cable or another USB port. A charge-only cable cannot send game inputs.',
      ),
    );
    body.append(usb);
    const help = node('details');
    help.append(
      node('summary', 'Paired but not working?'),
      node(
        'p',
        'Keep Bonked focused and press a button after connecting. Check the controller is connected to this laptop rather than its console. If pairing is stuck, remove / forget the device in Bluetooth settings and pair again. Try another current browser.',
      ),
    );
    if (os.value === 'windows')
      help.append(
        node(
          'p',
          'If Windows has no Bluetooth option, the laptop needs a working Bluetooth adapter and driver. A supported USB controller is an alternative.',
        ),
      );
    help.append(
      node(
        'p',
        'Already in a local party? Reconnecting controllers have a short reclaim window. Press a button, then choose Reclaim on the laptop.',
      ),
    );
    body.append(help);
    const sources = node('p');
    sources.className = 'controller-guide-sources';
    const link = (title, url) => {
      const a = node('a', title);
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      sources.append(a);
    };
    link(...guide.source);
    if (path)
      link(
        os.value === 'mac' ? 'Apple: connect a controller' : 'Microsoft: Bluetooth pairing',
        os.value === 'mac'
          ? 'https://support.apple.com/en-us/111099'
          : 'https://support.microsoft.com/en-us/windows/hardware/bluetooth/pair-a-bluetooth-device-in-windows',
      );
    body.append(sources);
  }
  function hide() {
    root.hidden = true;
    onClose();
    if (previousFocus?.checkVisibility?.()) previousFocus.focus();
  }
  os.onchange = controller.onchange = () => {
    render();
    root.querySelector('.controller-connect-card').scrollTop = 0;
  };
  close.onclick = hide;
  root.addEventListener('click', (event) => {
    if (event.target === root) hide();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      hide();
    }
    if (event.key === 'Tab') {
      const controls = [...root.querySelectorAll('button,select,a,summary')].filter((e) =>
        e.checkVisibility(),
      );
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  return {
    show() {
      previousFocus = document.activeElement;
      onOpen();
      render();
      root.hidden = false;
      root.querySelector('.controller-connect-card').scrollTop = 0;
      close.focus();
    },
    isOpen: () => !root.hidden,
    hide,
  };
}
