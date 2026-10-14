// Capture the real game renderer and overlay the exact home-screen title SVG.
// Requires Playwright and Chrome; run against a local Bonked server.
import {mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2]||'http://127.0.0.1:3210';
const output=process.argv[3]||'test-results/app-icon';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:1});
  page.on('pageerror',error=>console.error(error.message));
  await page.route('**/__app-icon-capture',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>
    *{box-sizing:border-box}html,body{margin:0;width:1024px;height:1024px;overflow:hidden;background:#101c23}
    #scene{position:absolute;inset:0}#title{position:absolute;top:40px;left:62px;width:900px;height:auto;z-index:2}
    </style><script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/utils/BufferGeometryUtils.js":"/vendor/BufferGeometryUtils.js"}}</script></head>
    <body><div id="scene"></div><img id="title" src="/logo.svg?v=bonked" alt="Bonked">
    <script type="module">
      import {World} from '/world.js';
      import {selectTrack,trackAt,spawnCar,CAR_WIDTH,COLORS} from '/shared/game.js';
      selectTrack('coast');
      const world=new World(document.querySelector('#scene'),{preview:true});
      world.renderer.setPixelRatio(1);world.renderer.setSize(1024,1024);world.camera.aspect=1;world.camera.updateProjectionMatrix();
      const fraction=.025,road=trackAt(fraction),fx=Math.cos(road.angle),fz=Math.sin(road.angle);
      const players=[0,1].map((slot)=>{
        const car=spawnCar(slot,fraction),side=slot===0?-1:1,along=slot===0?.55:-.55;
        return {...car,id:'icon-'+slot,name:'',color:COLORS[slot===0?0:4],x:road.x+road.nx*side*CAR_WIDTH/2+fx*along,z:road.z+road.nz*side*CAR_WIDTH/2+fz*along,y:road.y,groundY:road.y,angle:road.angle,trackFraction:fraction,progress:fraction,health:100,vx:fx*22,vz:fz*22,nudgeDirection:-side,nudgeTime:0};
      });
      const state={code:'ICON',round:1,phase:'racing',raceTime:10,time:10000,players,skyBeams:[],pickups:[],boostPads:[],projectiles:[],effects:[],mines:[],chains:[],arcs:[],sounds:[],pulses:[]};
      world.update(state,null,null,1/60,10000);
      for(const player of players){player.nudgeTime=.12;player.nudgeCooldown=.75;}
      world.update(state,null,null,1/60,10016);
      // Frame the real models closely for an app icon, with room for the title.
      world.camera.position.set(road.x+fx*6+road.nx*3.5,road.y+5,road.z+fz*6+road.nz*3.5);
      world.camera.lookAt(road.x,road.y+2.1,road.z);world.camera.updateMatrixWorld();
      world.cullDistantScenery(world.camera);world.renderer.render(world.scene,world.camera);
      window.iconCapture={world,road,players};
      await document.querySelector('#title').decode();await document.fonts.ready;
      window.captureReady=true;
    </script></body></html>`}));
  await page.goto(base+'/__app-icon-capture');await page.waitForFunction(()=>window.captureReady,null,{timeout:90000});
  await page.screenshot({path:output+'/bonked-game-master.png'});
  await page.locator('#title').evaluate(img=>img.hidden=true);
  await page.screenshot({path:output+'/bonked-game-scene.png'});
  console.log('Saved game screenshot and title composite to '+output);
}finally{await browser.close();}
