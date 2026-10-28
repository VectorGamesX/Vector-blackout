/* WebRTC mesh voice chat. Signalling goes through the game server; server-computed gains decide who you hear (team radio + proximity). */
const VOICE=(()=>{
  const V={on:false,stream:null,peers:new Map(),gains:{},talking:false,open:false,ice:[{urls:'stun:stun.l.google.com:19302'}],send:null,speaking:new Set(),listeners:[],micOK:false,vol:1,err:''};
  try{const s=JSON.parse(localStorage.getItem('vb_voice')||'{}');V.open=!!s.open;V.vol=s.vol!=null?s.vol:1;}catch(e){}
  const store=()=>{try{localStorage.setItem('vb_voice',JSON.stringify({open:V.open,vol:V.vol}));}catch(e){}};
  const emit=()=>V.listeners.forEach(f=>f());
  async function enable(){
    if(V.on)return;V.err='';
    if(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia){
      try{V.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});V.micOK=true;}
      catch(e){V.stream=null;V.micOK=false;V.err='Microphone blocked — listening only.';}
    }else V.err='Microphone needs HTTPS — listening only.';
    V.on=true;setTalk(V.open);V.send({t:'vo',on:true});emit();
  }
  function disable(){
    if(!V.on)return;V.on=false;V.send({t:'vo',on:false});
    for(const id of [...V.peers.keys()])drop(id);
    if(V.stream){V.stream.getTracks().forEach(t=>t.stop());V.stream=null;}V.micOK=false;V.talking=false;V.speaking.clear();emit();
  }
  function setTalk(on){V.talking=on||V.open;if(V.stream)V.stream.getAudioTracks().forEach(t=>t.enabled=V.talking);emit();}
  function ptt(down){if(!V.on)return;setTalk(down);}
  function setOpen(v){V.open=v;store();setTalk(v);}
  function setVol(v){V.vol=v;store();applyGains();}
  function drop(id){const p=V.peers.get(id);if(!p)return;try{p.pc.close();}catch(e){}if(p.el){p.el.srcObject=null;p.el.remove();}if(p.raf)cancelAnimationFrame(p.raf);V.peers.delete(id);V.speaking.delete(id);emit();}
  function applyGains(){for(const [id,p] of V.peers){const g=V.gains[id];if(p.el)p.el.volume=Math.max(0,Math.min(1,(g==null?.5:g)*V.vol));}}
  function watch(id,p,stream){
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    try{const ctx=AUD.ctx||new C(),an=ctx.createAnalyser();an.fftSize=256;ctx.createMediaStreamSource(stream).connect(an);const buf=new Uint8Array(an.frequencyBinCount);
      const tick=()=>{an.getByteTimeDomainData(buf);let m=0;for(let i=0;i<buf.length;i++)m=Math.max(m,Math.abs(buf[i]-128));const sp=m>14;if(sp!==V.speaking.has(id)){sp?V.speaking.add(id):V.speaking.delete(id);emit();}p.raf=requestAnimationFrame(tick);};tick();}catch(e){}
  }
  function mk(id,init){
    if(V.peers.has(id))return V.peers.get(id);
    const pc=new RTCPeerConnection({iceServers:V.ice}),p={pc,el:null,pend:[],raf:0,remote:false};V.peers.set(id,p);
    if(V.stream)V.stream.getTracks().forEach(t=>pc.addTrack(t,V.stream));else if(init)pc.addTransceiver('audio',{direction:'recvonly'});
    pc.onicecandidate=e=>{if(e.candidate)V.send({t:'sig',to:id,d:{c:e.candidate}});};
    pc.ontrack=e=>{if(p.el)return;const el=document.createElement('audio');el.autoplay=true;el.playsInline=true;el.srcObject=e.streams[0]||new MediaStream([e.track]);document.body.appendChild(el);el.style.display='none';p.el=el;el.play().catch(()=>{});watch(id,p,el.srcObject);applyGains();};
    pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState))drop(id);};
    if(init)pc.onnegotiationneeded=async()=>{try{await pc.setLocalDescription(await pc.createOffer());V.send({t:'sig',to:id,d:{s:pc.localDescription}});}catch(e){}};
    return p;
  }
  async function onSig(from,d){
    if(!V.on)return;
    try{
      if(d.s){const p=mk(from,false),pc=p.pc;await pc.setRemoteDescription(d.s);p.remote=true;
        if(d.s.type==='offer'){await pc.setLocalDescription(await pc.createAnswer());V.send({t:'sig',to:from,d:{s:pc.localDescription}});}
        for(const c of p.pend.splice(0))await pc.addIceCandidate(c).catch(()=>{});}
      else if(d.c){const p=mk(from,false);if(p.remote)await p.pc.addIceCandidate(d.c).catch(()=>{});else p.pend.push(d.c);}
    }catch(e){}
  }
  V.enable=enable;V.disable=disable;V.ptt=ptt;V.setOpen=setOpen;V.setVol=setVol;V.drop=drop;V.onSig=onSig;
  V.onPeers=ids=>{ids.forEach(id=>mk(id,true));};
  V.setGains=g=>{V.gains=g;applyGains();};
  V.leaveRoom=()=>{for(const id of [...V.peers.keys()])drop(id);};
  return V;
})();
