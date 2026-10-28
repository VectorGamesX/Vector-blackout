/* Procedural SFX + generative synth music + optional uploaded playlist (set from the dev console). */
const AUD=(()=>{
  let ac=null,master,musicG,sfxG,noiseBuf,started=false,mode='menu',timer=null,step=0,nextT=0,cfg=null,playlistEl=null,plIdx=0,plKey='';
  const S={music:.7,sfx:.8};try{Object.assign(S,JSON.parse(localStorage.getItem('vb_aud')||'{}'));}catch(e){}
  const save=()=>{try{localStorage.setItem('vb_aud',JSON.stringify(S));}catch(e){}};
  function init(){
    if(ac)return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;ac=new C();
    master=ac.createGain();master.gain.value=.9;master.connect(ac.destination);
    musicG=ac.createGain();musicG.connect(master);sfxG=ac.createGain();sfxG.connect(master);applyVol();
    const n=ac.sampleRate;noiseBuf=ac.createBuffer(1,n,n);const d=noiseBuf.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
  }
  function applyVol(){if(!ac)return;const mv=cfg&&cfg.music?cfg.music.volume:.45;musicG.gain.value=S.music*mv*1.4;sfxG.gain.value=S.sfx;if(playlistEl)playlistEl.volume=Math.min(1,S.music*(mv*1.6));}
  function resume(){init();if(ac&&ac.state!=='running')ac.resume();}
  const now=()=>ac.currentTime;
  function tone(o){/* {f,f2,type,t,d,g,dest,pan,lp} */
    if(!ac)return;const t=o.t||now(),osc=ac.createOscillator(),g=ac.createGain();osc.type=o.type||'sine';osc.frequency.setValueAtTime(o.f,t);
    if(o.f2)osc.frequency.exponentialRampToValueAtTime(Math.max(1,o.f2),t+o.d);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(o.g||.2,t+(o.a||.005));g.gain.exponentialRampToValueAtTime(.0001,t+o.d);
    let n=osc;if(o.lp){const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.value=o.lp;n.connect(f);n=f;}
    n.connect(g);let out=g;if(o.pan){const p=ac.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,o.pan));g.connect(p);out=p;}
    out.connect(o.dest||sfxG);osc.start(t);osc.stop(t+o.d+.05);
  }
  function noise(o){/* {t,d,g,type,f,f2,q,dest,pan} */
    if(!ac)return;const t=o.t||now(),src=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();src.buffer=noiseBuf;src.loop=true;
    f.type=o.type||'bandpass';f.frequency.setValueAtTime(o.f||1000,t);if(o.f2)f.frequency.exponentialRampToValueAtTime(o.f2,t+o.d);f.Q.value=o.q||1;
    g.gain.setValueAtTime(o.g||.2,t);g.gain.exponentialRampToValueAtTime(.0001,t+o.d);src.connect(f);f.connect(g);
    let out=g;if(o.pan){const p=ac.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,o.pan));g.connect(p);out=p;}
    out.connect(o.dest||sfxG);src.start(t,Math.random()*.5);src.stop(t+o.d+.05);
  }
  /* position-aware: vol 0..1, pan -1..1 */
  const SFX={
    shot(w,v=1,pan=0){const big=w==='sniper'?1:w==='shotgun'?.8:w==='rifle'?.55:w==='smg'?.4:.45;
      noise({d:.08+big*.18,g:.5*v,type:'bandpass',f:2400-big*1400,f2:300,q:.8,pan});
      tone({f:150-big*60,f2:40,type:'triangle',d:.12+big*.15,g:.55*v,pan});
      if(w==='sniper')tone({f:900,f2:200,type:'sawtooth',d:.35,g:.12*v,pan,lp:1800});},
    hit(){tone({f:1900,f2:1300,type:'square',d:.05,g:.12});},kill(){tone({f:700,f2:1500,type:'square',d:.09,g:.14});tone({f:1500,f2:900,t:now()+.09,type:'square',d:.12,g:.12});},
    hurt(){noise({d:.14,g:.35,f:600,f2:150,type:'lowpass'});tone({f:110,f2:60,d:.2,g:.4,type:'sawtooth',lp:500});},
    reload(v=1,pan=0){tone({f:380,f2:300,type:'square',d:.04,g:.08*v,pan});tone({f:520,t:now()+.45,type:'square',d:.05,g:.09*v,pan});},
    dash(v=1,pan=0){noise({d:.25,g:.35*v,type:'bandpass',f:400,f2:3600,q:2,pan});},
    cloak(v=1,pan=0){tone({f:1400,f2:300,type:'sine',d:.7,g:.18*v,pan});tone({f:1900,f2:500,type:'sine',d:.7,g:.1*v,pan});},
    surge(v=1,pan=0){tone({f:80,f2:220,type:'sawtooth',d:.5,g:.25*v,pan,lp:700});},
    scan(v=1,pan=0){tone({f:600,f2:1800,type:'sine',d:.55,g:.2*v,pan});noise({d:.5,g:.1*v,f:3000,f2:6000,type:'highpass',pan});},
    pick(){tone({f:660,type:'sine',d:.1,g:.15});tone({f:990,t:now()+.07,type:'sine',d:.16,g:.15});},
    click(){tone({f:900,f2:600,type:'square',d:.03,g:.06});},
    beep(hi){tone({f:hi?1320:880,type:'square',d:hi?.35:.12,g:.12});},
    spawn(){tone({f:200,f2:900,type:'sawtooth',d:.35,g:.12,lp:1200});},
    zone(){tone({f:440,type:'sine',d:.25,g:.12});tone({f:660,t:now()+.15,type:'sine',d:.3,g:.12});},
    win(){[523,659,784,1046].forEach((f,i)=>tone({f,t:now()+i*.12,type:'triangle',d:.5,g:.18}));},
    lose(){[392,311,262,196].forEach((f,i)=>tone({f,t:now()+i*.16,type:'triangle',d:.6,g:.16}));},
    shine(){/* VectorGamex logo sting */
      [1046,1318,1568,2093,2637].forEach((f,i)=>tone({f,t:now()+i*.07,type:'sine',d:1.1-i*.08,g:.13}));noise({d:.9,g:.07,type:'highpass',f:5000,f2:9000});},
    ping(){tone({f:1200,f2:800,d:.12,type:'sine',g:.08});},
  };
  function play(name,...a){if(!ac||!S.sfx)return;try{SFX[name]&&SFX[name](...a);}catch(e){}}
  /* ---------- generative music ---------- */
  const PROG=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]],ROOT=[45,41,36,43],mf=n=>440*Math.pow(2,(n-69)/12);
  function sched(){
    if(!ac||mode==='off')return;
    const bpm=mode==='match'?112:92,sd=60/bpm/4;
    while(nextT<now()+.25){
      const t=Math.max(nextT,now()),bar=(step>>4)&3,s=step&15,ch=PROG[bar],rt=ROOT[bar],full=mode==='match';
      if(s===0){ch.forEach(n=>tone({f:mf(n),type:'sawtooth',t,d:sd*16,g:.035,a:.4,dest:musicG,lp:900}));tone({f:mf(rt),type:'sine',t,d:sd*8,g:.16,dest:musicG});}
      if(full&&(s%4===0))tone({f:140,f2:42,type:'sine',t,d:.22,g:.6,dest:musicG});
      if(full&&(s===4||s===12))noise({t,d:.14,g:.22,type:'bandpass',f:1800,q:.7,dest:musicG});
      if(full&&s%2===0)noise({t,d:.04,g:.05,type:'highpass',f:7000,dest:musicG});
      if(s%2===0||(full&&s%3===0)){const arp=ch[(s>>1)%3]+(s%8>=4?12:0);tone({f:mf(arp+12),type:'square',t,d:sd*1.6,g:full?.03:.022,dest:musicG,lp:2600});}
      if(full&&(s===0||s===6||s===10||s===14))tone({f:mf(rt+12),type:'sawtooth',t,d:sd*1.8,g:.07,dest:musicG,lp:500});
      nextT+=sd;step++;
    }
  }
  function startSynth(){if(timer)return;nextT=now()+.05;step=0;timer=setInterval(sched,40);}
  function stopSynth(){if(timer){clearInterval(timer);timer=null;}}
  /* ---------- uploaded playlist ---------- */
  function playlistTracks(){if(!cfg||!cfg.music)return[];const w=mode==='match'?'match':'menu';return(cfg.music.tracks||[]).filter(t=>t.where==='both'||t.where===w||!t.where);}
  function startPlaylist(){
    const tr=playlistTracks();if(!tr.length)return false;
    const key=mode+':'+tr.map(t=>t.id).join(',');if(playlistEl&&plKey===key)return true;
    stopPlaylist();plKey=key;plIdx=0;
    const next=()=>{const t=tr[plIdx%tr.length];plIdx++;playlistEl=new Audio('/music/'+t.file);playlistEl.volume=Math.min(1,S.music*(cfg.music.volume||.45)*1.6);playlistEl.onended=next;playlistEl.onerror=()=>{if(tr.length>1)setTimeout(next,500);};playlistEl.play().catch(()=>{});};
    next();return true;
  }
  function stopPlaylist(){if(playlistEl){playlistEl.onended=null;playlistEl.pause();playlistEl=null;}plKey='';}
  function refreshMusic(){
    if(!ac)return;
    if(mode==='off'){stopSynth();stopPlaylist();return;}
    const useList=cfg&&cfg.music&&cfg.music.useSynth===false&&playlistTracks().length>0;
    if(useList){stopSynth();startPlaylist();}else{stopPlaylist();startSynth();}
  }
  return{
    unlock(){resume();refreshMusic();},play,S,
    setMode(m){mode=m;refreshMusic();},
    setCfg(c){cfg=c;plKey='';applyVol();refreshMusic();},
    vol(k,v){S[k]=v;save();applyVol();},
    get ctx(){return ac;},
    /* world sounds relative to listener */
    at(name,x,y,lx,ly,a1){const d=Math.hypot(x-lx,y-ly),v=Math.max(0,1-d/1000);if(v<=.02)return;const pan=Math.max(-1,Math.min(1,(x-lx)/500));if(name==='shot')play('shot',a1,v,pan);else play(name,v,pan);},
  };
})();
