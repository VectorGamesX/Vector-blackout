/* Shared simulation code: runs on the server (authoritative) and in the browser (prediction). */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.VB=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const TS=32,DT=1/30;
const MOVE_SOLID=new Set(['#','x','~','X']),BULLET_SOLID=new Set(['#','x','X']),SIGHT_SOLID=new Set(['#','X']);
function parseMap(m){
  const rows=m.rows,h=rows.length,w=rows[0].length,out={id:m.id,name:m.name,w,h,rows,pw:w*TS,ph:h*TS,spawns:{A:[],B:[],F:[]},zones:[],pickups:[],lights:[]};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=rows[y][x],cx=x*TS+TS/2,cy=y*TS+TS/2;
    if(c==='A')out.spawns.A.push({x:cx,y:cy});else if(c==='B')out.spawns.B.push({x:cx,y:cy});else if(c==='F')out.spawns.F.push({x:cx,y:cy});
    else if(c==='Z')out.zones.push({x:cx,y:cy});
    else if('hawc'.includes(c))out.pickups.push({x:cx,y:cy,type:c});}
  if(!out.spawns.F.length)out.spawns.F=out.spawns.A.concat(out.spawns.B);
  if(!out.spawns.A.length)out.spawns.A=out.spawns.F.slice();if(!out.spawns.B.length)out.spawns.B=out.spawns.F.slice();
  return out;
}
const tile=(map,tx,ty)=>(tx<0||ty<0||tx>=map.w||ty>=map.h)?'#':map.rows[ty][tx];
const solidAt=(map,x,y)=>MOVE_SOLID.has(tile(map,Math.floor(x/TS),Math.floor(y/TS)));
/* push a circle out of solid tiles */
function resolve(map,e,r){
  const x0=Math.floor((e.x-r)/TS),x1=Math.floor((e.x+r)/TS),y0=Math.floor((e.y-r)/TS),y1=Math.floor((e.y+r)/TS);
  for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){
    if(!MOVE_SOLID.has(tile(map,tx,ty)))continue;
    const rx=tx*TS,ry=ty*TS,cx=Math.max(rx,Math.min(e.x,rx+TS)),cy=Math.max(ry,Math.min(e.y,ry+TS));
    let dx=e.x-cx,dy=e.y-cy,d2=dx*dx+dy*dy;
    if(d2<r*r){
      if(d2<1e-6){/* centre inside tile: push along the shallowest axis */
        const l=e.x-rx,rr=rx+TS-e.x,t=e.y-ry,b=ry+TS-e.y,m=Math.min(l,rr,t,b);
        if(m===l)e.x=rx-r;else if(m===rr)e.x=rx+TS+r;else if(m===t)e.y=ry-r;else e.y=ry+TS+r;
      }else{const d=Math.sqrt(d2),k=(r-d)/d;e.x+=dx*k;e.y+=dy*k;}
    }
  }
}
function moveCircle(map,e,dx,dy,r){
  /* sub-step so fast dashes can't tunnel through 1-tile walls */
  const n=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/(r*.9)));
  for(let i=0;i<n;i++){e.x+=dx/n;e.y+=dy/n;resolve(map,e,r);}
  e.x=Math.max(r,Math.min(map.pw-r,e.x));e.y=Math.max(r,Math.min(map.ph-r,e.y));
}
/* DDA ray over the tile grid. Returns distance to the first tile in `set`, or maxDist */
function rayGrid(map,x,y,dx,dy,maxDist,set){
  let tx=Math.floor(x/TS),ty=Math.floor(y/TS);
  const sx=dx>0?1:-1,sy=dy>0?1:-1,ddx=dx===0?1e30:Math.abs(TS/dx),ddy=dy===0?1e30:Math.abs(TS/dy);
  let tmx=dx===0?1e30:((dx>0?(tx+1)*TS-x:x-tx*TS)/Math.abs(dx)),tmy=dy===0?1e30:((dy>0?(ty+1)*TS-y:y-ty*TS)/Math.abs(dy));
  let t=0;
  if(set.has(tile(map,tx,ty)))return 0;
  while(t<maxDist){
    if(tmx<tmy){t=tmx;tmx+=ddx;tx+=sx;}else{t=tmy;tmy+=ddy;ty+=sy;}
    if(t>=maxDist)break;
    if(set.has(tile(map,tx,ty)))return t;
  }
  return maxDist;
}
function los(map,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,d=Math.hypot(dx,dy);if(d<1)return true;return rayGrid(map,x1,y1,dx/d,dy/d,d,SIGHT_SOLID)>=d-.5;}
function bulletClear(map,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,d=Math.hypot(dx,dy);if(d<1)return true;return rayGrid(map,x1,y1,dx/d,dy/d,d,BULLET_SOLID)>=d-.5;}
/* ray vs circle: returns distance or -1 */
function rayCircle(ox,oy,dx,dy,cx,cy,r,maxD){const fx=cx-ox,fy=cy-oy,t=fx*dx+fy*dy;if(t<0)return -1;const px=ox+dx*t-cx,py=oy+dy*t-cy,d2=px*px+py*py;if(d2>r*r)return -1;const h=Math.sqrt(r*r-d2),d=t-h;return d>maxD?-1:Math.max(0,d);}
/* deterministic movement step shared by client prediction and server */
function stepPlayer(p,inp,dt,cfg,map){
  const cls=cfg.classes[p.cls]||cfg.classes.ronin,w=cfg.weapons[p.wid]||{},base=cfg.player.speed*(cls.speed||1)*(w.moveSpeed||1)*(p.surge?1.12:1);
  let mx=inp.mx||0,my=inp.my||0;const l=Math.hypot(mx,my);if(l>1){mx/=l;my/=l;}
  if(p.dashT>0){p.dashT--;moveCircle(map,p,p.dashDx*cfg.player.dashSpeed*dt,p.dashDy*cfg.player.dashSpeed*dt,cfg.player.radius);p.vx=p.dashDx*base;p.vy=p.dashDy*base;}
  else{
    const k=Math.min(1,dt*14);p.vx+=(mx*base-p.vx)*k;p.vy+=(my*base-p.vy)*k;
    moveCircle(map,p,p.vx*dt,p.vy*dt,cfg.player.radius);
  }
  p.a=inp.a;
}
/* one input step: ability start (dash) + movement. Identical on server and client. */
function stepInput(p,inp,dt,cfg,map){
  const cls=cfg.classes[p.cls]||cfg.classes.ronin;
  if(p.abCD>0)p.abCD=Math.max(0,p.abCD-dt);
  if(inp.ab&&cls.ability==='dash'&&p.abCD<=0&&!(p.dashT>0)){
    let dx=inp.mx||0,dy=inp.my||0;const l=Math.hypot(dx,dy);
    if(l<.1){dx=Math.cos(inp.a);dy=Math.sin(inp.a);}else{dx/=l;dy/=l;}
    p.dashDx=dx;p.dashDy=dy;p.dashT=Math.max(1,Math.round((cls.dur||.18)/dt));p.abCD=cls.cd;p.dashJust=true;
  }
  stepPlayer(p,inp,dt,cfg,map);
}
return{TS,DT,stepInput,MOVE_SOLID,BULLET_SOLID,SIGHT_SOLID,parseMap,tile,solidAt,moveCircle,rayGrid,los,bulletClear,rayCircle,stepPlayer};
});
