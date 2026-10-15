import * as THREE from 'three';
export class HeatOverlay{
  constructor(container){this.root=document.createElement('div');this.root.className='heat-overlay';this.root.setAttribute('aria-hidden','true');container.append(this.root);this.items=new Map();this.point=new THREE.Vector3();}
  update(cars,camera,width,height){
    const present=new Set();for(const car of cars){if(!(car.circuitHeat>1e-6)||car.eliminated)continue;present.add(car.id);let item=this.items.get(car.id);
      if(!item){const element=document.createElement('div');element.className='car-thermometer';element.dataset.playerId=car.id;const tube=document.createElement('div');tube.className='thermometer-tube';const fill=document.createElement('div');fill.className='thermometer-fill';const limit=document.createElement('div');limit.className='thermometer-limit';tube.append(fill,limit);const bulb=document.createElement('div');bulb.className='thermometer-bulb';element.append(tube,bulb);this.root.append(element);item={element,fill};this.items.set(car.id,item);}
      const p=this.point.set(car.x,car.y+2.2,car.z).project(camera);item.element.hidden=p.z< -1||p.z>1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1;
      item.element.style.transform=`translate(${(p.x+1)*width/2+15}px,${(1-p.y)*height/2-50}px)`;
      item.fill.style.height=`${Math.min(1,car.circuitHeat/3)*100}%`;item.element.classList.toggle('burning',car.circuitHeat>1);item.element.title=`${car.name||'Car'}: ${Math.round(car.circuitHeat/3*100)}% heat`;
    }
    for(const [id,item]of this.items)if(!present.has(id)){item.element.remove();this.items.delete(id);}
  }
  dispose(){this.root.remove();this.items.clear();}
}
