'use strict';
/* Bot brains: flow-field navigation, line-of-sight targeting, skill-scaled aim, class abilities. They feed the same input pipeline as humans. */
const VB=require('./public/js/shared.js');
const {TS,DT}=VB;
const TAU=Math.PI*2;
const angDiff=(a,b)=>{let d=(b-a)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d;};

function think(room,b,cfg){
  const inp=b.binp||(b.binp={mx:0,my:0,a:b.a,fire:0,ab:0,rl:0});
  inp.ab=0;inp.rl=0;inp.fire=0;inp.mx=0;inp.my=0;
  if(!b.alive){b.tgt=null;return;}
  const sk=b.skill,w=cfg.weapons[b.wid],cls=cfg.classes[b.cls];
  const B=b.brain||(b.brain={tT:0,goal:null,goalT:0,react:0,errT:0,err:0,stuckT:0,lx:b.x,ly:b.y,strafe:1,strafeT:0,fireTog:false,lastSeen:null,idle:0});
  /* retarget */
  B.tT-=DT;
  if(B.tT<=0){
    B.tT=.2+Math.random()*.15;let best=null,bd=1e9;
    for(const e of room.players.values()){
      if(e===b||!e.alive||(room.team&&e.team===b.team)||e.invT>.6)continue;
      const d=Math.hypot(e.x-b.x,e.y-b.y);if(d>cfg.player.vision||(e.cloak&&d>120)||d>=bd)continue;
      if(VB.los(room.map,b.x,b.y,e.x,e.y)){best=e;bd=d;}
    }
    if(best&&(!b.tgt||b.tgt.id!==best.id)){B.react=(1-sk)*.55+.12;}
    b.tgt=best;if(best)B.lastSeen={x:best.x,y:best.y,t:0};
  }
  if(b.tgt&&!b.tgt.alive)b.tgt=null;
  const t=b.tgt;
  /* choose a goal */
  B.goalT-=DT;B.idle=t?0:B.idle+DT;
  const pickGoal=()=>{
    const m=room.map;
    if(b.hp<(cls.hp||100)*.45){const hp=room.pickups.filter(k=>k.up&&k.type==='h').sort((p,q)=>Math.hypot(p.x-b.x,p.y-b.y)-Math.hypot(q.x-b.x,q.y-b.y))[0];if(hp)return{x:hp.x,y:hp.y};}
    if(room.type==='zone'&&m.zones.length&&Math.random()<.75){const z=m.zones[room.zi];return{x:z.x+(Math.random()-.5)*80,y:z.y+(Math.random()-.5)*80};}
    if(B.lastSeen&&B.lastSeen.t<6&&Math.random()<.6)return{x:B.lastSeen.x,y:B.lastSeen.y};
    const ups=room.pickups.filter(k=>k.up);if(ups.length&&Math.random()<.35){const k=ups[(Math.random()*ups.length)|0];return{x:k.x,y:k.y};}
    /* head for the enemy half / a random open tile */
    for(let i=0;i<30;i++){const x=1+((Math.random()*(m.w-2))|0),y=1+((Math.random()*(m.h-2))|0);if(!VB.MOVE_SOLID.has(m.rows[y][x]))return{x:x*TS+TS/2,y:y*TS+TS/2};}
    return{x:m.pw/2,y:m.ph/2};
  };
  if(B.lastSeen)B.lastSeen.t+=DT;
  if(!B.goal||B.goalT<=0||Math.hypot(B.goal.x-b.x,B.goal.y-b.y)<28){B.goal=pickGoal();B.goalT=3+Math.random()*4;}
  /* movement */
  let dest=B.goal,engage=false;
  if(t){
    const d=Math.hypot(t.x-b.x,t.y-b.y),pref=w.range<450?150:w.range>1000?520:300;
    engage=true;
    if(d>pref*1.25)dest={x:t.x,y:t.y};else if(d<pref*.6){dest=null;inp.mx=(b.x-t.x)/d;inp.my=(b.y-t.y)/d;}
    else dest=null;
    B.strafeT-=DT;if(B.strafeT<=0){B.strafe=Math.random()<.5?-1:1;B.strafeT=.6+Math.random()*1.2;}
    if(!dest){const ax=(t.x-b.x)/d,ay=(t.y-b.y)/d;inp.mx+=-ay*B.strafe*(.6+.4*sk);inp.my+=ax*B.strafe*(.6+.4*sk);}
  }
  if(dest){
    const m=room.map,tx=Math.floor(b.x/TS),ty=Math.floor(b.y/TS),gx=Math.floor(dest.x/TS),gy=Math.floor(dest.y/TS);
    if(tx===gx&&ty===gy){const d=Math.hypot(dest.x-b.x,dest.y-b.y)||1;inp.mx=(dest.x-b.x)/d;inp.my=(dest.y-b.y)/d;}
    else{
      const f=room.flow(gx,gy);let bd=f[tx+ty*m.w],bx=0,by=0;if(bd<0)bd=1e9;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=tx+dx,ny=ty+dy;if(nx<0||ny<0||nx>=m.w||ny>=m.h)continue;
        if(dx&&dy&&(VB.MOVE_SOLID.has(m.rows[ty][nx])||VB.MOVE_SOLID.has(m.rows[ny][tx])))continue;
        const v=f[nx+ny*m.w];if(v>=0&&v<bd){bd=v;bx=dx;by=dy;}}
      if(bx||by){const cx=(tx+bx)*TS+TS/2-b.x,cy=(ty+by)*TS+TS/2-b.y,d=Math.hypot(cx,cy)||1;inp.mx=cx/d;inp.my=cy/d;}
      else B.goalT=0;
    }
  }
  /* unstick */
  B.stuckT+=DT;if(B.stuckT>1){if(Math.hypot(b.x-B.lx,b.y-B.ly)<14&&(inp.mx||inp.my)){B.goalT=0;B.strafe*=-1;}B.stuckT=0;B.lx=b.x;B.ly=b.y;}
  /* aim + fire */
  let want=b.a;
  if(t){want=Math.atan2(t.y-b.y,t.x-b.x);B.errT-=DT;if(B.errT<=0){B.errT=.25+Math.random()*.25;B.err=(Math.random()-.5)*(1-sk)*.34;}want+=B.err;}
  else if(inp.mx||inp.my)want=Math.atan2(inp.my,inp.mx);
  const diff=angDiff(b.a,want),turn=(5+sk*9)*DT;b.a+=Math.max(-turn,Math.min(turn,diff));inp.a=b.a;
  if(t){
    B.react-=DT;const d=Math.hypot(t.x-b.x,t.y-b.y);
    if(B.react<=0&&d<w.range*.92&&Math.abs(angDiff(b.a,want))<.14){
      if(w.auto)inp.fire=1;else{B.fireTog=!B.fireTog;inp.fire=B.fireTog?1:0;}
    }
    /* abilities */
    if(b.abCD<=0&&b.abT<=0){
      const ab=cls.ability;
      if(ab==='dash'&&(b.hp<(cls.hp||100)*.4||(d>380&&Math.random()<.04))){inp.ab=1;if(b.hp<(cls.hp||100)*.4){inp.mx=(b.x-t.x)/(d||1);inp.my=(b.y-t.y)/(d||1);}}
      else if(ab==='cloak'&&d>200&&Math.random()<.05)inp.ab=1;
      else if(ab==='surge'&&(b.hp<(cls.hp||100)*.75||d<220)&&Math.random()<.08)inp.ab=1;
    }
  }else if(b.abCD<=0&&b.abT<=0&&cls.ability==='scan'&&B.idle>2.5&&Math.random()<.02)inp.ab=1;
  if(b.ammo<w.mag*.3&&!t)inp.rl=1;
}
module.exports={think};
