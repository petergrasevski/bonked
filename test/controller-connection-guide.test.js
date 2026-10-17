import test from 'node:test';
import assert from 'node:assert/strict';
import {
  controllerGuideOS,
  connectionInstructions,
} from '../public/controller-connection-guide.js';

test('controller guide detects Mac and Windows using modern hints or legacy platform data', () => {
  assert.equal(
    controllerGuideOS({ userAgentData: { platform: 'macOS' }, platform: 'MacIntel' }),
    'mac',
  );
  assert.equal(
    controllerGuideOS({ userAgentData: { platform: 'Windows' }, platform: 'Win32' }),
    'windows',
  );
  assert.equal(controllerGuideOS({ platform: 'MacIntel' }), 'mac');
  assert.equal(
    controllerGuideOS({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }),
    'windows',
  );
});
test('controller guide does not confuse desktop-mode iPads or phones with the host laptop', () => {
  assert.equal(controllerGuideOS({ platform: 'MacIntel', maxTouchPoints: 5 }), 'ios');
  assert.equal(controllerGuideOS({ userAgent: 'iPhone; CPU iPhone OS like Mac OS X' }), 'ios');
  assert.equal(
    controllerGuideOS({ userAgentData: { platform: 'Android' }, userAgent: 'Android' }),
    'android',
  );
  assert.equal(controllerGuideOS({ platform: 'Linux x86_64' }), 'other');
});
test('OS-specific paths and Switch 2 compatibility guidance stay separate', () => {
  const mac = connectionInstructions('mac', 'ps5'),
    windows = connectionInstructions('windows', 'ps4');
  assert.match(mac.path, /System Settings/);
  assert.doesNotMatch(mac.path, /Start/);
  assert.match(windows.path, /Add device/);
  assert.match(connectionInstructions('windows', 'switch2-pro').compatibility, /bridge/);
  assert.match(connectionInstructions('mac', 'joy-con2').compatibility, /does not run on Mac/);
  assert.equal(connectionInstructions('other', 'ps5').path, null);
  assert.equal(connectionInstructions('mac', 'unrecognized').controller.id, 'ps5');
});
