export function readCameraView(storage){try{return storage?.getItem('bonked.cameraView')==='personal'?'personal':'shared';}catch{return 'shared';}}
export function saveCameraView(storage,value){const view=value==='personal'?'personal':'shared';try{storage?.setItem('bonked.cameraView',view);}catch{}return view;}
