const KEY='bonked-dev-logs';
// A new opt-in key intentionally leaves existing installations disabled too.
export function readDevLogs(storage){try{return storage?.getItem(KEY)==='true';}catch{return false;}}
export function saveDevLogs(storage,enabled){try{storage?.setItem(KEY,String(enabled===true));}catch{}}
