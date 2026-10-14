import os from 'node:os';
export function isLANAddress(host){
  if(host==='localhost'||host==='127.0.0.1'||host==='::1')return true;
  const parts=host.split('.').map(Number);
  return parts.length===4&&parts.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&(parts[0]===10||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===169&&parts[1]===254);
}
export function lanURLs(port,interfaces=os.networkInterfaces()){
  return [...new Set(Object.entries(interfaces).flatMap(([name,entries])=>(entries||[]).filter(n=>n.family==='IPv4'&&!n.internal&&!/^(utun|tun|docker|veth)/.test(name)&&isLANAddress(n.address)).map(n=>`http://${n.address}:${port}`)))];
}
export const RECONNECT_GRACE_MS=20000;
export const seatExpired=(player,now)=>!player.bot&&!player.ws&&Number.isFinite(player.disconnectedAt)&&now-player.disconnectedAt>RECONNECT_GRACE_MS;
