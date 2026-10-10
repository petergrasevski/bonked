import test from 'node:test';
import assert from 'node:assert/strict';
import {detectDevice,getInstallGuide,appPresentation} from '../public/display.js';
test('iPhone Safari and Chrome get their own share-button instructions',()=>{
  const safari=detectDevice({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1'});
  const chrome=detectDevice({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0 Mobile/15E148 Safari/604.1'});
  assert.deepEqual(safari,{os:'ios',browser:'safari',mobile:true});assert.equal(chrome.browser,'chrome');
  assert.match(getInstallGuide(safari).steps.join(' '),/Safari’s Share/);assert.match(getInstallGuide(chrome).steps.join(' '),/Chrome’s address bar/);
});
test('Android Chrome uses Install, embedded and other browsers offer a supported route',()=>{
  const chrome=detectDevice({userAgent:'Mozilla/5.0 (Linux; Android 16; Pixel) Chrome/140.0 Mobile Safari/537.36'});
  assert.equal(chrome.os,'android');assert.equal(chrome.browser,'chrome');assert.match(getInstallGuide(chrome).steps.join(' '),/three-dot menu/);
  const samsung=detectDevice({userAgent:'Mozilla/5.0 (Linux; Android 16) SamsungBrowser/29.0 Chrome/140.0 Mobile Safari/537.36'});assert.equal(samsung.browser,'samsung');assert.match(getInstallGuide(samsung).steps[0],/Open this game link in Chrome/);
  const embedded=detectDevice({userAgent:'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300'});assert.equal(embedded.browser,'in-app');assert.match(getInstallGuide(embedded).steps[0],/Safari/);
});
test('desktop-identifying iPads are recognized without treating touch laptops as iOS',()=>{
  assert.equal(detectDevice({platform:'MacIntel',maxTouchPoints:5}).os,'ios');assert.equal(detectDevice({platform:'Win32',maxTouchPoints:5}).os,'desktop');assert.equal(detectDevice({platform:'MacIntel',maxTouchPoints:0}).os,'desktop');
});
test('browser, home-screen app and actual fullscreen stay distinct',()=>{
  assert.equal(appPresentation(), 'browser');assert.equal(appPresentation({standalone:true}), 'app');assert.equal(appPresentation({fullscreen:true}), 'fullscreen');assert.equal(appPresentation({standalone:true,fullscreen:true}), 'fullscreen');
});
