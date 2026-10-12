export function detectDevice({userAgent='',platform='',maxTouchPoints=0}={}){
  const os=/iPhone|iPad|iPod/i.test(userAgent)||(platform==='MacIntel'&&maxTouchPoints>1)?'ios':/Android/i.test(userAgent)?'android':'desktop';
  const embedded=/FBAN|FBAV|Instagram|Line\/|; wv\)/i.test(userAgent);
  const browser=embedded?'in-app':/CriOS|Chrome\//.test(userAgent)&&!/Edg|OPR|SamsungBrowser/.test(userAgent)?'chrome':/SamsungBrowser/.test(userAgent)?'samsung':/FxiOS|Firefox/.test(userAgent)?'firefox':/Edg/.test(userAgent)?'edge':/Safari/.test(userAgent)&&!/Chrome|CriOS|FxiOS|Edg|OPR/.test(userAgent)?'safari':'other';
  return {os,browser,mobile:os!=='desktop'};
}
export const appPresentation=({fullscreen=false,standalone=false}={})=>fullscreen?'fullscreen':standalone?'app':'browser';
export function getInstallGuide(device){
  const {os,browser}=device;
  if(os==='ios'){
    const supported=browser==='safari'||browser==='chrome';
    return {title:'Add to your Home Screen',device:`iPhone / iPad · ${supported?(browser==='chrome'?'Chrome':'Safari'):'Browser'}`,intro:'This way the game can go full screen',steps:[
      ...(!supported?['Open this game link in Safari.']:[]),
      browser==='chrome'?'Tap Share next to Chrome’s address bar.':'Tap Safari’s Share button (square with an upward arrow). You may need to open the More menu first.',
      'Choose Add to Home Screen. If it is hidden, tap View More or scroll down the share sheet.',
      'Leave Open as Web App switched on if shown, then tap Add.',
      'Open Bonked from your Home Screen and turn your phone sideways.',
    ],note:'If your browser only adds a bookmark, repeat these steps in Safari.'};
  }
  if(os==='android')return {title:'Add to your Home Screen',device:`Android · ${browser==='chrome'?'Chrome':browser==='samsung'?'Samsung Internet':'Browser'}`,intro:'This way the game can go full screen',steps:[
    ...(browser!=='chrome'?['Open this game link in Chrome for the app installation steps below.']:[]),
    'Tap Chrome’s three-dot menu (⋮).',
    'Choose Add to Home screen, then Install. Some versions show Install app directly.',
    'Confirm Install, then open Bonked from your Home screen or app drawer.',
    'Turn your phone sideways to race.',
  ],note:'If you see Create shortcut, use Install when available so the game opens without the address bar.'};
  return {title:'Give the race the whole screen',device:'Desktop browser',intro:'Enter fullscreen to make more room for the circuit.',steps:['Choose Enter fullscreen below.','Press Escape when you want to leave fullscreen.'],note:'On a phone, adding Bonked to the Home Screen also removes the browser controls.'};
}
export function initDisplayGuide({onOpen=()=>{},onClose=()=>{}}={}){
  const device=detectDevice(navigator),dialog=document.getElementById('install-guide');
  const $=id=>document.getElementById(id);
  const modes=['standalone','fullscreen'].map(mode=>matchMedia(`(display-mode: ${mode})`));
  let installPrompt=null,previousFocus=null;
  const presentation=()=>appPresentation({fullscreen:!!document.fullscreenElement||modes[1].matches,standalone:navigator.standalone===true||modes[0].matches});
  const close=()=>{dialog.hidden=true;document.body.classList.remove('installing');onClose();previousFocus?.focus();};
  const update=()=>{
    const mode=presentation();
    $('install-continue').textContent=mode==='browser'?'Continue in browser':'Back to game';
    $('install-native').hidden=!installPrompt||mode!=='browser';
    $('install-fullscreen').hidden=mode!=='browser'||!document.fullscreenEnabled;
    if(mode!=='browser'&&!dialog.hidden)close();
  };
  const show=()=>{
    previousFocus=document.activeElement;onOpen();
    const guide=getInstallGuide(device);$('install-title').textContent=guide.title;$('install-intro').textContent=guide.intro;$('install-note').textContent=guide.note;
    const steps=$('install-steps');steps.replaceChildren();for(const step of guide.steps){const li=document.createElement('li');const action=step.match(/^(Tap (?:Safari’s Share button|Share|Chrome’s three-dot menu)|Choose Add to Home [Ss]creen|Leave Open as Web App|Confirm Install|Open Bonked|Turn your phone sideways|Open this game link in (?:Safari|Chrome))/)?.[0]||step.split('.')[0];const bold=document.createElement('strong');bold.textContent=action;li.append(bold,document.createTextNode(step.slice(action.length)));steps.append(li);}
    const mode=presentation();if(mode!=='browser'){$('install-title').textContent=mode==='app'?'You’re playing as an app':'You’re in fullscreen';$('install-intro').textContent='The game already has its own screen. You’re ready to race.';steps.replaceChildren();$('install-note').textContent='';}
    update();dialog.hidden=false;document.body.classList.add('installing');$('install-continue').focus();
  };
  $('install-continue').onclick=()=>{try{sessionStorage.setItem('bonked-display-guide-dismissed','1');}catch{}close();};
  dialog.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();$('install-continue').click();}
    if(e.key==='Tab'){const buttons=[...dialog.querySelectorAll('button')].filter(button=>!button.hidden);const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
  $('install-fullscreen').onclick=async()=>{try{await document.documentElement.requestFullscreen();}catch{$('install-note').textContent='Your browser could not enter fullscreen. Use the Home Screen steps above, or your browser’s fullscreen menu.';}};
  $('install-native').onclick=async()=>{const prompt=installPrompt;if(!prompt)return;installPrompt=null;update();await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted'){$('install-note').textContent='App added. Open Bonked from your Home screen to play.';}};
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;update();});
  window.addEventListener('appinstalled',()=>{installPrompt=null;update();});
  document.addEventListener('fullscreenchange',update);for(const mode of modes)mode.addEventListener('change',update);
  update();let dismissed=false;try{dismissed=sessionStorage.getItem('bonked-display-guide-dismissed')==='1';}catch{}
  if(device.mobile&&presentation()==='browser'&&!dismissed)show();
  return {show,presentation,isOpen:()=>!dialog.hidden};
}
