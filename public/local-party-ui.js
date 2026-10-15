import {STANDARD_MAPPING,gamepadButton} from './controller.js';

const node=(tag,text,cls)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(cls)element.className=cls;return element;};
const action=(text,callback)=>{const button=node('button',text,'text-button');button.type='button';button.onclick=callback;return button;};
export function createLocalPartyUI({root,dialog,claim,manager,getState,onRelease}){
  const devices=root.querySelector('[data-devices]'),summary=root.querySelector('[data-summary]');
  const form=dialog.querySelector('form'),fields=dialog.querySelector('[data-fields]'),preview=dialog.querySelector('[data-preview]'),error=dialog.querySelector('[data-error]');
  let key='',claimKey='',mappingIndex=null,mappingId=null,previousFocus=null;
  function closeMapping(){dialog.hidden=true;mappingIndex=null;mappingId=null;onRelease();if(previousFocus?.checkVisibility?.())previousFocus.focus();}
  function configure(device){
    if(getState()?.phase!=='lobby')return;
    previousFocus=document.activeElement;onRelease();mappingIndex=device.index;mappingId=device.rawId;fields.replaceChildren();error.textContent='';
    dialog.querySelector('h2').textContent='Configure '+(manager.slots.get(device.slotId)?.name||device.label);
    const mapping=device.mapping||STANDARD_MAPPING;
    function select(name,label,count,value){
      const row=node('label',label),input=node('select');input.name=name;input.append(new Option('Not used',''));
      for(let i=0;i<count;i++)input.append(new Option(`${name.includes('Axis')?'Axis':'Button'} ${i+1}`,String(i)));
      input.value=Number.isInteger(value)&&value<count?String(value):'';row.append(input);fields.append(row);
    }
    function checkbox(name,label,checked){const row=node('label',label),input=node('input');input.type='checkbox';input.name=name;input.checked=!!checked;row.append(input);fields.append(row);}
    select('steerAxis','Steering axis',device.pad.axes.length,mapping.steerAxis);checkbox('invertSteer','Reverse steering axis',mapping.invertSteer);
    select('aimAxis','Sky beam up / down axis',device.pad.axes.length,mapping.aimAxis);checkbox('invertAim','Reverse sky beam axis',mapping.invertAim);
    for(const [name,label]of Object.entries({throttle:'Accelerate',reverse:'Reverse',fire:'Fire weapon',left:'Nudge left',right:'Nudge right',ready:'Ready for next round',steerLeft:'Steer left button (optional)',steerRight:'Steer right button (optional)'}))select(name,label,device.pad.buttons.length,mapping.buttons[name]);
    dialog.hidden=false;form.querySelector('select')?.focus();
  }
  form.onsubmit=event=>{event.preventDefault();const data=new FormData(form),value=name=>data.get(name)===''?null:Number(data.get(name));const mapping={steerAxis:value('steerAxis'),aimAxis:value('aimAxis'),invertSteer:data.has('invertSteer'),invertAim:data.has('invertAim'),buttons:{}};
    for(const name of Object.keys(STANDARD_MAPPING.buttons))mapping.buttons[name]=value(name);
    if(!manager.setMapping(mappingIndex,mapping)){error.textContent='Choose a steering axis (or both steering buttons), plus accelerate, reverse and fire buttons.';return;}
    closeMapping();
  };
  dialog.querySelector('[data-close]').onclick=closeMapping;
  dialog.addEventListener('keydown',event=>{if(event.key==='Tab'){const focusable=[...dialog.querySelectorAll('button,input,select')].filter(e=>!e.disabled),first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}if(event.key==='Escape'){event.stopPropagation();closeMapping();}});
  function update(now){
    const state=getState(),lobby=state?.phase==='lobby';
    summary.textContent=`Laptop controllers · ${[...manager.slots.values()].filter(s=>s.device!==null).length} joined · ${manager.devices.size} detected`;
    const nextKey=JSON.stringify([lobby,[...manager.devices.values()].map(d=>[d.index,d.label,d.slotId,!!d.mapping,d.canSplit,d.joyConSide]),[...manager.slots.values()].map(s=>[s.id,s.name,s.device,s.accepted])]);
    if(nextKey!==key){key=nextKey;devices.replaceChildren();
      for(const device of manager.devices.values()){
        const slot=manager.slots.get(device.slotId),row=node('div',undefined,'local-device');row.dataset.device=String(device.index);
        row.append(node('strong',slot?.name||device.label),node('span',slot?(slot.accepted?'Joined':'Joining…'):device.mapping?'Press a button to join':'Press a button to configure'));
        if(device.canSplit||device.joyConSide==='L'){const split=action(device.canSplit?'Split Joy-Con pair':'Combine Joy-Con pair',()=>manager.setJoyConSplit(device.index,!!device.canSplit));split.disabled=!lobby;row.append(split);}
        if(device.joyConSide)row.append(node('span','Hold sideways · bottom face: GO · left face: reverse · top face: fire · − / +: ready','fine'));
        const mapping=action('Configure',()=>configure(device));mapping.disabled=!lobby;row.append(mapping);
        if(slot){const remove=action('Remove',()=>manager.forget(slot.id));remove.disabled=!lobby;row.append(remove);}
        devices.append(row);
      }
      for(const slot of manager.slots.values())if(slot.device===null){const row=node('div',undefined,'local-device disconnected');row.append(node('strong',slot.name),node('span','Disconnected · press a button to reclaim'));const remove=action('Remove',()=>manager.forget(slot.id));remove.disabled=!lobby;row.append(remove);devices.append(row);}
      if(!manager.devices.size)devices.append(node('p','Connect controllers by USB or pair them in the laptop’s Bluetooth settings. Press a button so the browser can detect them.','fine'));
    }
    for(const row of devices.querySelectorAll('[data-device]')){const device=manager.devices.get(Number(row.dataset.device)),slot=manager.slots.get(device?.slotId);row.classList.toggle('controller-active',!!slot&&now<slot.highlightUntil);}
    const pending=manager.devices.get(manager.pendingDevice),reserved=[...manager.slots.values()].filter(s=>s.device===null);
    const nextClaim=JSON.stringify([pending?.index,reserved.map(s=>s.id),lobby]);
    if(nextClaim!==claimKey){claimKey=nextClaim;claim.replaceChildren();claim.hidden=!pending;
      if(pending){claim.append(node('p',`${pending.label}: choose the player to reclaim`));for(const slot of reserved)claim.append(action('Reclaim '+slot.name,()=>manager.reclaim(slot.id)));if(lobby)claim.append(action('Join as new player',()=>manager.joinNew()));claim.append(action('Cancel',()=>manager.cancelReclaim()));}
    }
    if(!dialog.hidden){const device=manager.devices.get(mappingIndex);if(!device||device.rawId!==mappingId||!lobby){closeMapping();return;}const buttons=device.pad.buttons.map((_,i)=>gamepadButton(device.pad,i)?i+1:null).filter(Boolean);preview.textContent=`Pressed buttons: ${buttons.join(', ')||'none'} · Axes: ${device.pad.axes.map((v,i)=>`${i+1}: ${Number(v).toFixed(2)}`).join(' · ')||'none'}`;}
  }
  return {configure,update,isOpen:()=>!dialog.hidden,dispose:()=>{closeMapping();claim.hidden=true;}};
}
