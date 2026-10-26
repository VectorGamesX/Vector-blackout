'use strict';
/* Authoritative room simulation: players + bots, weapons, abilities, pickups, modes, per-recipient fog-of-war snapshots. */
const VB=require('./game js/shared.js');
const CFG=require('./config');
const Bots=require('./bots');
const {TS,DT}=VB;
let NEXT_ID=1;
const r1=n=>Math.round(n*10)/10;
const rnd=(a,b)=>a+Math.random()*(b-a);

class Room{
  constructor(code,opts,hub){
    this.code=code;this.hub=hub;this.priv=!!opts.priv;this.modeId=opts.mode;this.mapId=opts.map;
    this.players=new Map();this.events=[];this.zoneState=-1;this.tick=0;this.emptyT=0;this.flowCache=new Map();this.rosterDirty=true;this.rosterT=0;this.vgT=0;this.locked=false;
    this.loadMatch();
  }
  cfg(){return CFG.get();}
  loadMatch(){
    const cfg=this.cfg();
    if(!cfg.modes[this.modeId])this.modeId=Object.keys(cfg.modes)[0];
    if(!cfg.maps[this.mapId])this.mapId=cfg.mapOrder[0];
    this.mode=cfg.modes[this.modeId];this.type=this.mode.type||this.modeId;this.team=this.type!=='ffa';
    this.mapDef=cfg.maps[this.mapId];this.map=VB.parseMap(this.mapDef);this.flowCache.clear();
    this.pickups=this.map.pickups.map((p,i)=>({id:i,x:p.x,y:p.y,type:p.type,up:true,t:0}));
    this.phase='countdown';this.phaseT=cfg.match.countdown;this.timeLeft=this.mode.timeLimit||300;
    this.score=[0,0];this.zi=0;this.zoneT=0;this.zoneCap=0;this.winner=null;this.pending=[];
    for(const p of this.players.values()){p.k=0;p.d=0;p.sc=0;if(this.team&&p.team<0)p.team=this.pickTeam();if(!this.team)p.team=-1;this.spawn(p,true);}
    this.rosterDirty=true;
  }
  humans(){const a=[];for(const p of this.players.values())if(!p.bot)a.push(p);return a;}
  bots(){const a=[];for(const p of this.players.values())if(p.bot)a.push(p);return a;}
  pickTeam(){let a=0,b=0;for(const p of this.players.values()){if(p.team===0)a++;else if(p.team===1)b++;}
    /* humans prefer the side with fewer humans so bots rebalance around them */return a<=b?0:1;}
  add(opts){
    const cfg=this.cfg();const clsId=cfg.classes[opts.cls]?opts.cls:Object.keys(cfg.classes)[0];
    const p={id:NEXT_ID++,name:opts.name,bot:!!opts.bot,ws:opts.ws||null,client:opts.client||null,team:this.team?(opts.team!=null?opts.team:this.pickTeam()):-1,cls:clsId,nextCls:clsId,wid:'pistol',
      x:0,y:0,vx:0,vy:0,a:0,hp:100,armor:0,alive:false,rsT:0,ammo:0,rlT:0,fcd:0,abT:0,abCD:0,dashT:0,dashDx:0,dashDy:0,surge:false,cloak:false,
      k:0,d:0,sc:0,invT:0,q:[],last:{mx:0,my:0,a:0,fire:0,ab:0,rl:0,seq:0},seq:0,fp:0,voice:false,noise:0,hitT:0,skill:opts.skill||.6,born:Date.now()};
    this.players.set(p.id,p);this.spawn(p,true);this.rosterDirty=true;if(!p.bot)this.balanceBots();return p;
  }
  remove(p){this.players.delete(p.id);this.rosterDirty=true;if(!p.bot)this.balanceBots();}
  /* keep the lobby alive with bots up to botFill, replacing them as humans arrive */
  balanceBots(){
    const cfg=this.cfg(),want=Math.max(0,Math.min(cfg.match.botFill|0,cfg.match.maxPlayers+8)),hum=this.humans().length;
    if(hum===0){for(const b of this.bots())this.players.delete(b.id);return;}
    let bots=this.bots(),need=Math.max(0,want-hum);
    while(bots.length>need){const b=bots.pop();this.players.delete(b.id);this.rosterDirty=true;}
    this.evenTeams();
    const names=['Tunde','Ngozi','Kelechi','Femi','Amara','Dayo','Sade','Obi','Zainab','Chidi','Ife','Bisi','Emeka','Yemi','Kola','Nneka'];
    const cls=Object.keys(cfg.classes);
    while(bots.length<need){
      let team=-1;if(this.team){let a=0,b=0;for(const p of this.players.values()){if(p.team===0)a++;else b++;}team=a<=b?0:1;}
      const nm=names[(Math.random()*names.length)|0]+'_'+(10+(Math.random()*89|0));
      bots.push(this.add({name:nm,bot:true,team,cls:cls[(Math.random()*cls.length)|0],skill:Math.max(.15,Math.min(.95,cfg.match.botSkill+rnd(-.12,.12)))}));
    }
    this.evenTeams();
  }
  evenTeams(){
    if(!this.team)return;
    for(let n=0;n<8;n++){
      const t=[[],[]];for(const p of this.players.values())if(p.team===0||p.team===1)t[p.team].push(p);
      if(Math.abs(t[0].length-t[1].length)<=1)return;
      const big=t[0].length>t[1].length?0:1,bot=t[big].find(p=>p.bot);if(!bot)return;
      bot.team=1-big;this.spawn(bot,true);this.rosterDirty=true;
    }
  }
  /* ---------- spawning ---------- */
  spawn(p,quiet){
    const cfg=this.cfg();if(cfg.classes[p.nextCls])p.cls=p.nextCls;const cls=cfg.classes[p.cls];
    const set=this.team?(p.team===0?this.map.spawns.A:this.map.spawns.B):this.map.spawns.F;
    let best=null,bs=-1;const cand=set.slice().sort(()=>Math.random()-.5).slice(0,6);
    for(const s of cand){let md=1e9;for(const o of this.players.values()){if(o===p||!o.alive||(this.team&&o.team===p.team))continue;md=Math.min(md,Math.hypot(o.x-s.x,o.y-s.y));}
      if(md>bs){bs=md;best=s;}}
    best=best||{x:this.map.pw/2,y:this.map.ph/2};
    p.x=best.x+rnd(-4,4);p.y=best.y+rnd(-4,4);p.vx=p.vy=0;p.alive=true;p.hp=cls.hp||cfg.player.hp;p.armor=0;
    p.wid=cfg.weapons[cls.primary]?cls.primary:Object.keys(cfg.weapons)[0];p.ammo=cfg.weapons[p.wid].mag;p.rlT=0;p.fcd=0;p.abT=0;p.abCD=Math.min(cls.cd||0,4);
    p.dashT=0;p.surge=false;p.cloak=false;p.invT=cfg.match.spawnProtect||1.5;p.q.length=0;
    p.a=this.team?(p.team===0?0:Math.PI):rnd(0,Math.PI*2);
    if(!quiet)this.ev({e:'sp',i:p.id,x:r1(p.x),y:r1(p.y)});
  }
  ev(e,only){this.events.push(only?{...e,_to:only}:e);}
  /* ---------- fixed step ---------- */
  step(){
    const cfg=this.cfg();this.tick++;this.events=[];
    const hum=this.humans().length;
    if(!hum){this.emptyT+=DT;return;}this.emptyT=0;
    if(this.phase==='countdown'){this.phaseT-=DT;if(this.phaseT<=0){this.phase='live';this.ev({e:'go'});}}
    else if(this.phase==='live'){this.timeLeft-=DT;this.modeTick(cfg);if(this.timeLeft<=0)this.endMatch('time');}
    else if(this.phase==='end'){this.phaseT-=DT;if(this.phaseT<=0)this.nextMatch();}
    for(const p of this.players.values())this.stepPlayerSim(p,cfg);
    for(const k of this.pickups)if(!k.up){k.t-=DT;if(k.t<=0){k.up=true;this.ev({e:'pk',id:k.id,u:1});}}
    if(this.rosterDirty&&(this.tick-this.rosterT)>=15){this.rosterT=this.tick;this.rosterDirty=false;this.hub.sendRoster(this);}
    if(this.tick%8===0)this.hub.sendVoiceGains(this);
  }
  modeTick(cfg){
    if(this.type!=='zone'||!this.map.zones.length)return;
    const z=this.map.zones[this.zi],R=this.mode.zoneRadius||96;
    this.zoneT+=DT;if(this.zoneT>=(this.mode.zoneMove||40)){this.zoneT=0;this.zi=(this.zi+1)%this.map.zones.length;this.ev({e:'zn',zi:this.zi});}
    let a=0,b=0;for(const p of this.players.values())if(p.alive&&Math.hypot(p.x-z.x,p.y-z.y)<R){if(p.team===0)a++;else if(p.team===1)b++;}
    this.zoneState=a&&!b?0:b&&!a?1:a&&b?-2:-1;
    if(this.zoneState>=0){this.zoneCap+=DT;if(this.zoneCap>=1){this.zoneCap-=1;this.score[this.zoneState]++;this.checkLimit();}}
  }
  stepPlayerSim(p,cfg){
    const w=cfg.weapons[p.wid]||cfg.weapons[Object.keys(cfg.weapons)[0]],cls=cfg.classes[p.cls]||cfg.classes[Object.keys(cfg.classes)[0]];
    let inp;
    if(p.bot){Bots.think(this,p,cfg);inp=p.binp;}
    else{if(p.q.length>4)p.q.splice(0,p.q.length-2);if(p.q.length){inp=p.q.shift();p.seq=inp.seq;p.last=inp;}else inp=p.last;}
    if(this.phase==='end')inp={mx:0,my:0,a:p.a,fire:0,ab:0,rl:0};
    if(!p.alive){p.rsT-=DT;if(p.rsT<=0&&this.phase!=='end')this.spawn(p);return;}
    if(p.invT>0)p.invT-=DT;if(p.fcd>0)p.fcd-=DT;if(p.hitT>0)p.hitT-=DT;
    if(p.abT>0){p.abT-=DT;if(p.abT<=0){p.abT=0;}}
    p.cloak=cls.ability==='cloak'&&p.abT>0;p.surge=cls.ability==='surge'&&p.abT>0;
    if(p.surge)p.hp=Math.min(cls.hp||cfg.player.hp,p.hp+14*DT);
    /* non-dash abilities activate on the server */
    if(inp.ab&&p.abCD<=0&&p.abT<=0&&cls.ability!=='dash'){p.abT=cls.dur||3;p.abCD=cls.cd||10;this.ev({e:'ab',i:p.id,k:cls.ability,x:r1(p.x),y:r1(p.y)});
      p.cloak=cls.ability==='cloak';p.surge=cls.ability==='surge';}
    const wasDash=p.dashT>0;
    p.dashJust=false;VB.stepInput(p,inp,DT,cfg,this.map);
    if(p.dashJust)this.ev({e:'ab',i:p.id,k:'dash',x:r1(p.x),y:r1(p.y)});
    p.noise=Math.hypot(p.vx,p.vy)>cfg.player.speed*.6?.4:(p.noise>0?p.noise-DT:0);
    /* reload / fire */
    if(p.rlT>0){p.rlT-=DT;if(p.rlT<=0){p.rlT=0;p.ammo=w.mag;}}
    else if((inp.rl&&p.ammo<w.mag)||p.ammo<=0){if(p.ammo<w.mag){p.rlT=w.reload;this.ev({e:'rl',i:p.id},null);}}
    const fire=!!inp.fire;
    if(fire&&p.fcd<=0&&p.rlT<=0&&p.ammo>0&&this.phase==='live'&&(w.auto||!p.fp))this.shoot(p,w);
    p.fp=fire;
    /* pickups */
    for(const k of this.pickups){if(!k.up)continue;if(Math.abs(k.x-p.x)>22||Math.abs(k.y-p.y)>22)continue;this.takePickup(p,k,cfg);}
  }
  takePickup(p,k,cfg){
    const cls=cfg.classes[p.cls],maxHp=cls.hp||cfg.player.hp,m=cfg.match;let ok=false;
    if(k.type==='h'){if(p.hp<maxHp){p.hp=Math.min(maxHp,p.hp+m.pickupHeal);ok=true;}}
    else if(k.type==='a'){if(p.armor<cfg.player.armorMax){p.armor=Math.min(cfg.player.armorMax,p.armor+m.pickupArmor);ok=true;}}
    else if(k.type==='w'){const ids=Object.keys(cfg.weapons).filter(i=>i!==p.wid);p.wid=ids[(Math.random()*ids.length)|0];p.ammo=cfg.weapons[p.wid].mag;p.rlT=0;ok=true;}
    else if(k.type==='c'){p.abCD=0;p.invT=Math.max(p.invT,.4);ok=true;}
    if(!ok)return;k.up=false;k.t=m.pickupRespawn;this.ev({e:'pk',id:k.id,u:0,by:p.id});
  }
  /* ---------- weapons ---------- */
  shoot(p,w){
    p.fcd=60/Math.max(1,w.rpm);p.ammo--;p.invT=0;p.noise=.5;
    const map=this.map,R=this.cfg().player.radius,pel=Math.max(1,w.pellets|0),rays=[];
    let ox=p.x+Math.cos(p.a)*14,oy=p.y+Math.sin(p.a)*14;if(!VB.bulletClear(map,p.x,p.y,ox,oy)){ox=p.x;oy=p.y;}
    const dmgTo=new Map();
    for(let i=0;i<pel;i++){
      const ang=p.a+(Math.random()-.5)*2*(w.spread||0)*Math.PI/180,dx=Math.cos(ang),dy=Math.sin(ang);
      let len=VB.rayGrid(map,ox,oy,dx,dy,w.range,VB.BULLET_SOLID),hit=null;
      for(const t of this.players.values()){
        if(t===p||!t.alive||t.invT>0||t.dashT>0)continue;if(this.team&&t.team===p.team)continue;
        const d=VB.rayCircle(ox,oy,dx,dy,t.x,t.y,R+1,len);if(d>=0&&d<=len){len=d;hit=t;}
      }
      if(hit){let dm=w.damage;if(pel>1)dm*=1-.55*Math.min(1,len/w.range);dmgTo.set(hit,(dmgTo.get(hit)||0)+dm);}
      rays.push([Math.round(ang*1000)/1000,Math.round(len)]);
    }
    this.ev({e:'s',i:p.id,x:r1(ox),y:r1(oy),a:Math.round(p.a*1000)/1000,w:p.wid,ls:rays});
    for(const [t,dm] of dmgTo)this.hurt(t,dm,p,w);
  }
  hurt(t,dm,by,w){
    const cfg=this.cfg();if(!t.alive||t.invT>0)return;
    if(t.surge)dm*=.55;
    const ab=Math.min(t.armor,dm*(cfg.player.armorAbsorb||.6));t.armor-=ab;dm-=ab;t.hp-=dm;t.hitT=.3;
    this.ev({e:'dm',a:Math.round(Math.atan2(by.y-t.y,by.x-t.x)*100)/100,n:Math.round(dm)},t.id);
    this.ev({e:'ht',k:t.hp<=0?1:0},by.id);
    if(t.hp<=0)this.kill(t,by,w);
  }
  kill(t,by,w){
    const cfg=this.cfg();t.alive=false;t.hp=0;t.d++;t.rsT=cfg.player.respawn;t.dashT=0;t.abT=0;t.cloak=false;t.surge=false;
    if(by&&by!==t){by.k++;if(this.type==='tdm')this.score[by.team]++;else if(this.type==='ffa')by.sc++;}
    this.ev({e:'k',a:by?by.id:0,v:t.id,w:by?by.wid:'',x:r1(t.x),y:r1(t.y)});this.rosterDirty=true;
    this.checkLimit();
  }
  checkLimit(){
    if(this.phase!=='live')return;const lim=this.mode.scoreLimit||30;
    if(this.team){if(this.score[0]>=lim||this.score[1]>=lim)this.endMatch('limit');}
    else{for(const p of this.players.values())if(p.sc>=lim){this.endMatch('limit');break;}}
  }
  endMatch(why){
    if(this.phase==='end')return;this.phase='end';this.phaseT=this.cfg().match.endScreen;
    let win=null;
    if(this.team)win=this.score[0]===this.score[1]?-1:(this.score[0]>this.score[1]?0:1);
    else{let b=null;for(const p of this.players.values())if(!b||p.sc>b.sc)b=p;win=b?b.id:-1;}
    this.winner=win;const cfg=this.cfg();
    const rows=[...this.players.values()].map(p=>({i:p.id,n:p.name,t:p.team,k:p.k,d:p.d,b:p.bot?1:0})).sort((a,b)=>b.k-a.k||a.d-b.d);
    this.ev({e:'end',win,why,score:this.score,rows,next:this.nextMapId()});
  }
  nextMapId(){const o=this.cfg().mapOrder;if(!o.length)return this.mapId;return o[(o.indexOf(this.mapId)+1)%o.length];}
  nextMatch(){this.mapId=this.priv&&this.keepMap?this.mapId:this.nextMapId();this.loadMatch();this.hub.sendWorld(this);}
  /* ---------- queries ---------- */
  flow(gx,gy){
    const m=this.map,key=gy*m.w+gx;let f=this.flowCache.get(key);if(f)return f;
    f=new Int16Array(m.w*m.h).fill(-1);const q=[gx+gy*m.w];f[q[0]]=0;
    for(let h=0;h<q.length;h++){const c=q[h],x=c%m.w,y=(c/m.w)|0,d=f[c];
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=m.w||ny>=m.h)continue;const n=nx+ny*m.w;if(f[n]>=0||VB.MOVE_SOLID.has(m.rows[ny][nx]))continue;f[n]=d+1;q.push(n);}}
    if(this.flowCache.size>24)this.flowCache.clear();this.flowCache.set(key,f);return f;
  }
  /* is entity e visible to recipient r (fog of war, team vision, scan, cloak) */
  sees(r,e,cfg){
    if(r===e)return 0;
    const vis=cfg.player.vision,hear=cfg.player.hearing,map=this.map;
    const check=(o)=>{
      const d=Math.hypot(e.x-o.x,e.y-o.y);
      const cl=cfg.classes[o.cls];
      if(cl&&cl.ability==='scan'&&o.abT>0&&d<(cl.radius||560))return 1;
      if(d>vis)return 0;if(e.cloak&&d>110)return 0;
      return VB.los(map,o.x,o.y,e.x,e.y)?1:0;
    };
    if(this.team&&r.team===e.team)return 1;
    if(check(r))return 1;
    if(this.team)for(const o of this.players.values())if(o!==r&&o.alive&&o.team===r.team&&check(o))return 1;
    if(!e.cloak&&e.noise>0&&Math.hypot(e.x-r.x,e.y-r.y)<hear)return 2;
    return 0;
  }
  snapshotFor(r,cfg){
    const list=[];
    for(const e of this.players.values()){
      if(e===r||!e.alive)continue;const v=this.sees(r,e,cfg);if(!v)continue;
      let f=1;if(e.cloak)f|=2;if(e.surge)f|=4;if(e.dashT>0)f|=8;if(e.invT>0)f|=64;
      if(v===2){list.push({i:e.id,x:Math.round(e.x/48)*48,y:Math.round(e.y/48)*48,a:0,h:100,f:16});continue;}
      list.push({i:e.id,x:r1(e.x),y:r1(e.y),a:Math.round(e.a*100)/100,h:Math.max(1,Math.round(e.hp)),f,w:e.wid});
    }
    const evs=[];
    for(const e of this.events){
      if(e._to){if(e._to!==r.id)continue;const{_to,...c}=e;evs.push(c);continue;}
      if(e.e==='s'||e.e==='ab'||e.e==='sp'){
        const who=this.players.get(e.i);if(who&&who!==r){
          const d=Math.hypot(who.x-r.x,who.y-r.y),mate=this.team&&who.team===r.team;
          if(!mate&&d>1100&&!list.some(l=>l.i===e.i))continue;}
      }
      if(e.e==='rl'){const who=this.players.get(e.i);if(!who||(who!==r&&!list.some(l=>l.i===e.i)))continue;}
      evs.push(e);
    }
    const cls=cfg.classes[r.cls]||{};
    return{t:'s',k:this.tick,ack:r.seq,
      me:{x:r1(r.x),y:r1(r.y),vx:r1(r.vx),vy:r1(r.vy),hp:Math.round(r.hp),ar:Math.round(r.armor),am:r.ammo,rl:Math.round(r.rlT*100)/100,cd:Math.round(r.abCD*100)/100,at:Math.round(r.abT*100)/100,dt:r.dashT,ddx:Math.round(r.dashDx*100)/100,ddy:Math.round(r.dashDy*100)/100,sg:r.surge?1:0,al:r.alive?1:0,rs:Math.round(Math.max(0,r.rsT)*10)/10,wid:r.wid,cls:r.cls,inv:r.invT>0?1:0,sk:r.k,sd:r.d},
      p:list,ev:evs,ph:this.phase,pt:Math.round(this.phaseT*10)/10,tl:Math.round(this.timeLeft),sc:this.score,zi:this.zi,zs:this.zoneState==null?-1:this.zoneState};
  }
}
module.exports={Room};
