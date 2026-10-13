import {readGraphicsQuality,saveGraphicsQuality} from './graphics-settings.js';
// Calibrate against the actual scene, then keep reacting to heavier races and
// thermal throttling. CSS/HUD resolution stays native; only the 3D buffer scales.
const CACHE='bonked-resolution-v3',WEEK=7*24*60*60*1000;
export class AdaptiveResolution{
  constructor({pixelRatio=1,width=1,height=1,trackId='coast',storage,now=()=>Date.now(),onChange=()=>{}}={}){
    Object.assign(this,{nativeRatio:pixelRatio,trackId,storage,now,onChange,mode:'menu',quality:readGraphicsQuality(storage),ratio:Math.min(pixelRatio,2)});
    this.resize(width,height);this.reset();
  }
  reset(){this.frames=[];this.elapsed=0;this.stable=0;this.slowWindows=0;this.warmup=2000;}
  resize(width,height){
    if(!(width>0&&height>0))return;
    this.width=width;this.height=height;
    this.max=Math.min(this.nativeRatio,3,Math.sqrt(4000000/(width*height)));this.min=Math.min(1,this.max);
    const size=[width,height].sort((a,b)=>a-b).map(n=>Math.round(n/100)*100).join('x');
    const profile=`${this.trackId}:${size}:${this.nativeRatio}`;
    if(profile!==this.profile){this.profile=profile;this.load();this.reset();}
    this.set(this.quality==='high'?this.max:this.ratio);
  }
  key(){return `${CACHE}:${this.profile}:${this.mode}`;}
  load(){
    if(this.quality==='high'){this.set(this.max);return;}
    let saved;try{saved=JSON.parse(this.storage?.getItem(this.key())||'null');}catch{}
    const valid=Number.isFinite(saved?.ratio)&&saved.ratio>0&&Number.isFinite(saved?.at)&&this.now()-saved.at>=0&&this.now()-saved.at<WEEK;
    this.ceiling=this.max;this.retryAt=0;this.set(valid?saved.ratio:Math.min(this.ratio,2));
  }
  setQuality(quality){
    this.quality=quality==='high'?'high':'auto';saveGraphicsQuality(this.storage,this.quality);
    this.load();this.reset();
  }
  set(value){const next=Math.max(this.min,Math.min(this.max,value));if(Math.abs(next-this.ratio)>.001){this.ratio=next;this.onChange(next);}else this.ratio=next;}
  save(){try{this.storage?.setItem(this.key(),JSON.stringify({ratio:this.ratio,at:this.now()}));}catch{}}
  sample(ms,{active=true,mode='menu'}={}){
    if(mode!==this.mode){this.mode=mode;this.load();this.reset();}
    if(this.quality==='high')return;
    if(!active||!Number.isFinite(ms)||ms<=0||ms>1000){this.reset();return;}
    if(this.warmup>0){this.warmup-=ms;return;}
    this.frames.push(ms);this.elapsed+=ms;if(this.elapsed<1000)return;
    const sorted=[...this.frames].sort((a,b)=>a-b),mean=this.elapsed/this.frames.length,p90=sorted[Math.floor(sorted.length*.9)],duration=this.elapsed;
    this.frames=[];this.elapsed=0;
    if(mean>20||p90>26){
      this.stable=0;this.slowWindows++;
      if(mean<=34&&this.slowWindows<2)return;
      if(this.ratio>this.min+.01){this.ceiling=Math.max(this.min,this.ratio-.2);this.retryAt=this.now()+15000;this.set(this.ratio*(mean>34?.75:.88));this.warmup=1000;}
      else this.save();
      return;
    }
    this.slowWindows=0;this.stable+=duration;if(this.stable<4000)return;
    this.save();this.stable=0;
    if(this.now()>=this.retryAt)this.ceiling=this.max;
    if(mean<18&&p90<21&&this.ratio<Math.min(this.max,this.ceiling)-.01){this.set(Math.min(this.ratio+.25,this.ceiling));this.warmup=1000;}
  }
}
