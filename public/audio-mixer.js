const clamp=v=>Math.max(0,Math.min(1,v));
export const BUS_LEVELS={playerEngine:.9,rivalEngines:.48,weapons:.85,tyres:.65,ambience:.28,ui:.6};
export function mixTargets({impact=0,speech=0}={}) {
  impact=clamp(impact);speech=clamp(speech);
  return {playerEngine:BUS_LEVELS.playerEngine*(1-.3*impact)*(1-.5*speech),
    rivalEngines:BUS_LEVELS.rivalEngines*(1-.65*impact)*(1-.7*speech),
    weapons:BUS_LEVELS.weapons*(1-.45*speech),tyres:BUS_LEVELS.tyres*(1-.2*impact)*(1-.45*speech),
    ambience:BUS_LEVELS.ambience*(1-.7*impact)*(1-.7*speech),ui:BUS_LEVELS.ui};
}
export class AudioMixer {
  constructor(context){
    this.context=context;this.buses={};this.impactUntil=0;this.impactStrength=0;this.speechUntil=0;
    this.compressor=context.createDynamicsCompressor();Object.assign(this.compressor.threshold,{value:-8});
    this.compressor.knee.value=6;this.compressor.ratio.value=8;this.compressor.attack.value=.003;this.compressor.release.value=.16;
    // Final bounded soft clip catches coincident transients the compressor's attack lets through.
    this.ceiling=context.createWaveShaper();const curve=new Float32Array(4097);
    for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1,a=Math.abs(x);curve[i]=Math.sign(x)*(a<=.86?a:.86+.12*Math.tanh((a-.86)/.12));}
    this.ceiling.curve=curve;this.ceiling.oversample='2x';
    this.master=context.createGain();this.master.gain.value=0;
    for(const [name,level]of Object.entries(BUS_LEVELS)){const bus=context.createGain();bus.gain.value=level;bus.connect(this.compressor);this.buses[name]=bus;}
    this.compressor.connect(this.ceiling);this.ceiling.connect(this.master);this.master.connect(context.destination);
  }
  bus(name){return this.buses[name];}
  accent(strength=1){const now=this.context.currentTime;this.impactStrength=Math.max(now<this.impactUntil?this.impactStrength:0,clamp(strength));this.impactUntil=now+.22;}
  update(enabled,speechLevel=0){
    const t=this.context.currentTime;if(speechLevel>.015)this.speechUntil=t+.25;
    const impact=t<this.impactUntil?this.impactStrength:0,speech=t<this.speechUntil?1:0;
    const targets=mixTargets({impact,speech});
    for(const [name,value]of Object.entries(targets)){const p=this.buses[name].gain;p.setTargetAtTime(value,t,value<p.value?.018:.28);}
    this.master.gain.setTargetAtTime(enabled?.8:0,t,enabled?.04:.012);
  }
  stop(){const t=this.context.currentTime;this.master.gain.cancelScheduledValues(t);this.master.gain.setTargetAtTime(0,t,.008);this.impactUntil=this.speechUntil=0;}
}
