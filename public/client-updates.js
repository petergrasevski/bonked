// A surviving home-screen page keeps its modules until explicitly reloaded.
export function canReloadClient({hidden,connected,resuming,busy,session,state,fresh}){
  if(hidden||!connected||resuming||busy)return false;
  if(!session&&!state)return true;
  if(!state||!fresh)return false;
  // Intermediate results auto-advance after five seconds (or when everyone is
  // ready). Wait for a lobby or completed tournament rather than miss a start.
  return state.phase==='lobby'||(state.phase==='finished'&&state.tournamentComplete===true);
}

export function createClientUpdates({revision,fetcher=globalThis.fetch.bind(globalThis),safe,reload,notify=()=>{}}){
  let pending=false,reloading=false,inflight=null;
  function apply(){
    if(pending&&!reloading&&safe()){reloading=true;reload();return true;}
    return false;
  }
  function check(){
    if(inflight)return inflight;
    if(reloading||!revision)return Promise.resolve();
    inflight=(async()=>{
      try{
        const response=await fetcher('/api/version',{cache:'no-store',signal:AbortSignal.timeout(5000)});
        if(!response.ok)return;
        const latest=await response.json();
        if(typeof latest.revision!=='string'||!latest.revision)return;
        const changed=latest.revision!==revision;
        if(changed&&!pending)notify();
        pending=changed;apply();
      }catch{/* Offline and failed checks leave the current game running. */}
    })().finally(()=>{inflight=null;});
    return inflight;
  }
  return {check,apply};
}
