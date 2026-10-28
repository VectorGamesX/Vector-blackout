/* Core: shared client state, networking, snapshot handling, prediction/reconciliation, event dispatch. */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const G={
  cfg:null,ice:null,ws:null,online:0,you:0,team:-1,room:'',priv:false,modeId:'',mapDef:null,map:null,pickups:[],roster:new Map(),snaps:[],
  me:{x:0,y:0,vx:0,vy:0,a:0,cls:'ronin',wid:'pistol',dashT:0,dashDx:0,dashDy:0,abCD:0,surge:false,hp:100,ar:0,am:0,rl:0,al:0,rs:0,at:0,inv:0,k:0,d:0},
  pend:[],seq:0,phase:'countdown',pt:0,tl:0,sc:[0,0],zi:0,zs:-1,ping:0,state:'splash',endData:null,
  fx:{tracers:[],parts:[],flashes:[],rings:[],texts:[]},kills:[],chat:[],hitT:0,hitKill:0,dmgT:0,dmgA:0,shake:0,lfcd:0,fireHeld:false,serverT:0,banner:'',lastSnap:0
};
const TS=VB.TS,DT=VB.DT;
const wcol=w=>(G.cfg&&G.cfg.weapons[w]&&G.cfg.weapons[w].color)||'#fff';
const teamCol=t=>t===0?G.cfg.brand.accent:t===1?G.cfg.brand.accent2:'#ff4d6d';
/* ---------- network ---------- */
function send(o){if(G.ws&&G.ws.readyState===1)G.ws.send(JSON.stringify(o));}
VOICE.send=send;
let reconTimer=0,pingTimer=0;
function connect(){
  if(G.ws&&G.ws.readyState<=1)return;
  const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');G.ws=ws;
  ws.onopen=()=>{UI.conn(true);clearInterval(pingTimer);pingTimer=setInterval(()=>send({t:'ping',c:performance.now()}),2000);};
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch(x){return;}onMsg(m);};
  ws.onclose=()=>{UI.conn(false);clearInterval(pingTimer);if(G.state==='play'||G.state==='menu'){if(G.state==='play')UI.toMenu('Connection lost');}clearTimeout(reconTimer);reconTimer=setTimeout(connect,2000);};
  ws.onerror=()=>{};
}
function onMsg(m){
  switch(m.t){
    case 'hi':G.online=m.online||0;G.banner=m.banner||'';setCfg(m.cfg,m.ice);UI.menuUpdate();break;
    case 'cfg':G.banner=m.banner||'';setCfg(m.cfg,m.ice);UI.menuUpdate();break;
    case 'w':onWorld(m);break;
    case 's':onSnap(m);break;
    case 'r':G.roster=new Map(m.p.map(p=>[p.i,p]));UI.rosterChanged();break;
    case 'pl':VOICE.drop(m.id);break;
    case 'c':UI.chatMsg(m);break;
    case 'sys':UI.sysMsg(m.m,m.big);break;
    case 'kick':UI.toMenu(m.m||'Disconnected');break;
    case 'err':UI.toast(m.m);UI.busy(false);break;
    case 'vg':VOICE.setGains(m.g);break;
    case 'vp':if(m.ice)VOICE.ice=m.ice;VOICE.onPeers(m.ids);break;
    case 'vx':VOICE.drop(m.id);break;
    case 'sig':VOICE.onSig(m.from,m.d);break;
    case 'pong':G.ping=Math.round(performance.now()-m.c);break;
  }
}
function setCfg(cfg,ice){
  if(cfg){G.cfg=cfg;AUD.setCfg(cfg);UI.theme();}
  if(ice){G.ice=ice;VOICE.ice=ice;}
}
function onWorld(m){
  VOICE.leaveRoom();
  G.you=m.you;G.team=m.team;G.room=m.room;G.priv=!!m.priv;G.modeId=m.mode;G.mapDef=m.map;G.map=VB.parseMap(m.map);
  G.pickups=m.pickups.map(k=>({...k,up:!!k.up}));G.snaps.length=0;G.pend.length=0;G.seq=0;G.endData=null;
  Object.assign(G.fx,{tracers:[],parts:[],flashes:[],rings:[],texts:[]});G.kills=[];
  const me=G.me;me.al=0;me.k=0;me.d=0;me.dashT=0;me.abCD=0;
  R.buildMap();UI.enterGame();
}
/* ---------- snapshots ---------- */
function onSnap(m){
  if(G.state!=='play')return;
  const cfg=G.cfg,map=G.map,me=G.me,s=m.me,now=performance.now();
  G.lastSnap=now;
  G.snaps.push({t:now,p:m.p});if(G.snaps.length>24)G.snaps.shift();
  const wasAlive=me.al;
  me.cls=s.cls;me.wid=s.wid;me.hp=s.hp;me.ar=s.ar;me.am=s.am;me.rl=s.rl;me.al=s.al;me.rs=s.rs;me.at=s.at;me.inv=s.inv;me.k=s.sk;me.d=s.sd;
  me.x=s.x;me.y=s.y;me.vx=s.vx;me.vy=s.vy;me.dashT=s.dt;me.dashDx=s.ddx;me.dashDy=s.ddy;me.abCD=s.cd;me.surge=!!s.sg;
  G.phase=m.ph;G.pt=m.pt;G.tl=m.tl;G.sc=m.sc;G.zs=m.zs;
  if(G.zi!==m.zi){G.zi=m.zi;}
  /* drop acked inputs, replay the rest */
  G.pend=G.pend.filter(i=>i.seq>m.ack);
  if(me.al)for(const i of G.pend)VB.stepInput(me,i,DT,cfg,map);
  if(!wasAlive&&me.al){AUD.play('spawn');G.camSnap=true;}
  for(const e of m.ev)onEvent(e);
}
function onEvent(e){
  const me=G.me,cfg=G.cfg,fx=G.fx,now=performance.now();
  switch(e.e){
    case 's':{
      const col=wcol(e.w),mine=e.i===G.you;
      for(const [a,l] of e.ls){fx.tracers.push({x:e.x,y:e.y,a:e.a+0*a,ang:a,l,t:now,col,mine});
        if(l<(cfg.weapons[e.w]?cfg.weapons[e.w].range-2:9999)){const ex=e.x+Math.cos(a)*l,ey=e.y+Math.sin(a)*l;R.sparks(ex,ey,a+Math.PI,5,col);}}
      fx.flashes.push({x:e.x+Math.cos(e.a)*10,y:e.y+Math.sin(e.a)*10,t:now,col,r:mine?150:110});
      if(!mine)AUD.at('shot',e.x,e.y,me.x,me.y,e.w);
      G.shakeAmt(mine?(e.w==='shotgun'||e.w==='sniper'?5:2):0);break;}
    case 'dm':G.dmgT=now;G.dmgA=e.a;G.shake=Math.min(14,G.shake+4+e.n*.12);AUD.play('hurt');break;
    case 'ht':G.hitT=now;G.hitKill=e.k;AUD.play(e.k?'kill':'hit');break;
    case 'k':{
      UI.killFeed(e);
      const v=G.roster.get(e.v);R.burst(e.x,e.y,v?teamCol(v.t):'#ff4d6d',26);fx.rings.push({x:e.x,y:e.y,t:now,col:'#ff4d6d',r:60});
      if(e.v===G.you){UI.died(e);}else AUD.at('hurt',e.x,e.y,me.x,me.y);
      break;}
    case 'pk':{const k=G.pickups[e.id];if(k){k.up=!!e.u;if(!e.u&&e.by===G.you)AUD.play('pick');if(!e.u)fx.rings.push({x:k.x,y:k.y,t:now,col:'#8ff0c3',r:40});}break;}
    case 'ab':{AUD.at(e.k,e.x,e.y,me.x,me.y);fx.rings.push({x:e.x,y:e.y,t:now,col:e.k==='scan'?'#8ff0c3':e.k==='cloak'?'#c9a7ff':e.k==='surge'?'#ff9d1a':'#19e6ff',r:e.k==='scan'?(cfg.classes.hacker?cfg.classes.hacker.radius:560):90});
      if(e.i===G.you&&e.k==='scan')UI.toast('SCAN ONLINE');break;}
    case 'sp':fx.rings.push({x:e.x,y:e.y,t:now,col:'#19e6ff',r:50});if(e.i===G.you)AUD.play('spawn');break;
    case 'zn':UI.toast('GRID ZONE RELOCATED');AUD.play('zone');break;
    case 'go':UI.banner('GO','');AUD.play('beep',true);break;
    case 'rl':if(e.i===G.you)AUD.play('reload');else{const p=G.lastOthers&&G.lastOthers.get(e.i);if(p)AUD.at('reload',p.x,p.y,me.x,me.y);}break;
    case 'end':UI.matchEnd(e);break;
  }
}
G.shakeAmt=a=>{G.shake=Math.min(14,G.shake+a);};
/* ---------- fixed-rate input + prediction ---------- */
const INP={mx:0,my:0,a:0,fire:0,ab:false,rl:false,acc:0};
function inputTick(dt){
  if(G.state!=='play'||!G.ws||G.ws.readyState!==1)return;
  INP.acc+=dt;let n=0;
  while(INP.acc>=DT&&n<4){
    INP.acc-=DT;n++;
    const i={seq:++G.seq,mx:INP.mx,my:INP.my,a:INP.a,fire:UI.typing()?0:INP.fire,ab:INP.ab?1:0,rl:INP.rl?1:0};
    INP.ab=false;INP.rl=false;
    const me=G.me;
    if(me.al){VB.stepInput(me,i,DT,G.cfg,G.map);
      /* local feedback so firing feels instant */
      if(G.lfcd>0)G.lfcd-=DT;
      const w=G.cfg.weapons[me.wid];
      if(i.fire&&w&&G.lfcd<=0&&me.am>0&&me.rl<=0&&G.phase==='live'&&(w.auto||!G.fireHeld)){G.lfcd=60/w.rpm;AUD.play('shot',me.wid,.8,0);
        G.fx.flashes.push({x:me.x+Math.cos(me.a)*12,y:me.y+Math.sin(me.a)*12,t:performance.now(),col:wcol(me.wid),r:130});}
      G.fireHeld=!!i.fire;
      if(i.ab&&me.abCD>0&&G.cfg.classes[me.cls]&&G.cfg.classes[me.cls].ability!=='dash'){}
    }
    G.pend.push(i);if(G.pend.length>90)G.pend.shift();
    send({t:'in',seq:i.seq,mx:+i.mx.toFixed(3),my:+i.my.toFixed(3),a:+i.a.toFixed(3),fire:i.fire,ab:i.ab,rl:i.rl});
  }
  if(n>=4)INP.acc=0;
}
/* interpolated view of other entities */
function viewOthers(){
  const rt=performance.now()-100,sn=G.snaps,out=new Map();
  if(!sn.length)return out;
  let a=sn[0],b=sn[sn.length-1];
  for(let i=sn.length-1;i>0;i--){if(sn[i-1].t<=rt){a=sn[i-1];b=sn[i];break;}a=sn[i-1];b=sn[i];}
  const k=b.t===a.t?1:Math.max(0,Math.min(1.2,(rt-a.t)/(b.t-a.t)));
  const am=new Map(a.p.map(e=>[e.i,e]));
  for(const e of b.p){
    const o=am.get(e.i);
    if(o&&!(e.f&16)&&!(o.f&16)){let da=e.a-o.a;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;
      out.set(e.i,{...e,x:o.x+(e.x-o.x)*k,y:o.y+(e.y-o.y)*k,a:o.a+da*k});}
    else out.set(e.i,e);
  }
  G.lastOthers=out;return out;
}
