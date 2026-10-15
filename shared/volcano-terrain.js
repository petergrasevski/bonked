// A continuous mountainside anchored to both edges of the actual road ribbon.
// The renderer and terrain contact index consume these exact same triangles.
export const VOLCANO_RUNOFFS=[.16,.66];
export function volcanoRunoffWeight(fraction){
  return Math.max(...VOLCANO_RUNOFFS.map(f=>{const d=Math.abs(((fraction-f+.5)%1+1)%1-.5);return d<.055?Math.cos(d/.055*Math.PI/2)**2:0;}));
}
export function volcanoCliffFactor(fraction){
  const x=Math.sin(fraction*Math.PI*8+.7)*.5+.5,base=x*x*(3-2*x);
  return base+(1-base)*.58*(1-volcanoRunoffWeight(fraction));
}
export function volcanoTerrain(trackAt){
  const bands=[[],[],[]],N=300,TAU=Math.PI*2;
  const point=(f,ring)=>{
    const p=trackAt(f),r=Math.hypot(p.x,p.z),ux=p.x/r,uz=p.z/r,angle=Math.atan2(p.z,p.x);
    if(ring===0)return [ux*42,307,uz*42];
    if(ring===1)return [ux*(58+Math.sin(angle*13)*3),330+Math.sin(angle*7)*5+Math.cos(angle*19)*3,uz*(58+Math.sin(angle*13)*3)];
    if(ring===2)return [ux*(r*.52+Math.sin(angle*17)*9+Math.cos(angle*31)*4),258+Math.sin(angle*9)*13+Math.cos(angle*23)*8,uz*(r*.52+Math.sin(angle*17)*9+Math.cos(angle*31)*4)];
    if(ring===3)return [p.x+p.nx*(p.halfWidth+24),p.y+29+Math.abs(Math.sin(angle*19))*10,p.z+p.nz*(p.halfWidth+24)];
    if(ring===4)return [p.x+p.nx*(p.halfWidth+.7),p.y-.18,p.z+p.nz*(p.halfWidth+.7)];
    if(ring===5)return [p.x-p.nx*(p.halfWidth+.7),p.y-.18,p.z-p.nz*(p.halfWidth+.7)];
    if(ring===6){const cliff=volcanoCliffFactor(f),offset=p.halfWidth+7+(1-cliff)*22;return [p.x-p.nx*offset,p.y-8-24*cliff,p.z-p.nz*offset];}
    if(ring===7)return [ux*(r+110),42+Math.sin(angle*11)*12,uz*(r+110)];
    return [ux*(r+260),-5,uz*(r+260)];
  };
  const sculpt=(f,ring)=>{
    const j=Math.floor(ring),u=ring-j,a=point(f,j),b=point(f,Math.min(8,j+1)),q=a.map((v,k)=>{
      // A sharper break below the recoverable shelf makes its lip readable.
      // Keep elevation continuous and preserve the gentle upper driving surface.
      const blend=j===6&&k!==1?(u<=.25?u*.4:.1+(u-.25)*1.2):u;
      return v+(b[k]-v)*blend;
    });
    // Broad fractured ribs, with changing radial phase rather than concentric terraces.
    if(j<3||j>=7){const angle=Math.atan2(q[2],q[0]),fade=Math.sin(Math.PI*u),noise=(Math.sin(angle*37+ring*3.1)*3+Math.sin(angle*17-ring*4.7)*5)*fade;
      q[1]+=noise*(j===3?.35:1);const r=Math.hypot(q[0],q[2]);q[0]+=q[0]/r*noise*.7;q[2]+=q[2]/r*noise*.7;}
    return q;
  };
  for(let i=0;i<N;i++)for(let j=0;j<8;j++)for(let sub=0;sub<4;sub++){
    if(j===4)continue;
    const ring=j+sub/4,next=ring+.25;
    const a=sculpt(i/N,ring),b=sculpt(i/N,next),c=sculpt((i+1)/N,next),d=sculpt((i+1)/N,ring),v=bands[j%3];
    const tri=(a,b,c)=>{const up=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);if(up<0)v.push(...a,...c,...b);else v.push(...a,...b,...c);};
    tri(a,b,c);tri(a,c,d);
  }
  return bands;
}
