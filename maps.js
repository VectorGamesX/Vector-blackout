'use strict';
/* Procedural, mirror-symmetric arenas. Generated once, then stored in data/config.json where the dev console can edit them. */
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function gen(id,name,o){
  const W=o.w||48,H=o.h||30,R=rng(o.seed),g=Array.from({length:H},()=>Array(W).fill('.')),half=W>>1;
  for(let x=0;x<W;x++){g[0][x]='#';g[H-1][x]='#';}for(let y=0;y<H;y++){g[y][0]='#';g[y][W-1]='#';}
  const free=(x0,y0,w,h)=>{for(let y=y0-1;y<y0+h+1;y++)for(let x=x0-1;x<x0+w+1;x++){if(x<1||y<1||x>=half-1||y>=H-1)return false;if(g[y][x]!=='.')return false;}return true;};
  const put=(x0,y0,w,h,c)=>{for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)g[y][x]=c;};
  /* keep a clear spawn pocket and the centre lane */
  const keep=(x,y)=>(x<8)||(Math.abs(y-H/2)<2&&x>half-10);
  if(o.water){const band=o.water;for(let y=1;y<=band;y++)for(let x=1;x<W-1;x++){g[y][x]='~';g[H-1-y][x]='~';}}
  const top=o.water?o.water+2:2,bot=o.water?H-o.water-3:H-4;
  let placed=0;for(let i=0;i<o.buildings*12&&placed<o.buildings;i++){
    const w=3+Math.floor(R()*(o.maxW||5)),h=2+Math.floor(R()*(o.maxH||4)),x=9+Math.floor(R()*(half-11)),y=top+Math.floor(R()*(bot-top-h));
    if(y<top||y+h>bot)continue;let ok=true;for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(keep(xx,yy))ok=false;
    if(ok&&free(x,y,w,h)){put(x,y,w,h,o.tall&&R()<.5?'X':'#');placed++;}
  }
  let cp=0;for(let i=0;i<o.crates*8&&cp<o.crates;i++){
    const x=7+Math.floor(R()*(half-8)),y=top+Math.floor(R()*(bot-top)),w=1+Math.floor(R()*2),h=1+Math.floor(R()*2);
    if(y+h>bot||keep(x,y)||keep(x+w,y+h))continue;if(free(x,y,w,h)){put(x,y,w,h,'x');cp++;}
  }
  /* mirror left -> right */
  for(let y=0;y<H;y++)for(let x=0;x<half;x++)g[y][W-1-x]=g[y][x];
  /* bridge across water */
  if(o.water){for(let y=H/2-2;y<=H/2+1;y++)for(let x=1;x<W-1;x++)if(g[y][x]==='~')g[y][x]='.';}
  /* spawn pockets */
  for(let i=0;i<5;i++){const y=Math.floor(H/2)-2+i;g[y][2]='A';g[y][W-3]='B';}
  g[Math.floor(H/2)-4][3]='A';g[Math.floor(H/2)+4][3]='A';g[Math.floor(H/2)-4][W-4]='B';g[Math.floor(H/2)+4][W-4]='B';
  /* FFA spawns scattered symmetrically on free tiles */
  let f=0;for(let tries=0;tries<400&&f<8;tries++){const x=3+Math.floor(R()*(half-5)),y=3+Math.floor(R()*(H-6));if(g[y][x]==='.'&&g[y][W-1-x]==='.'){g[y][x]='F';g[y][W-1-x]='F';f+=2;}}
  /* zones + pickups on free tiles */
  const setFree=(x,y,c)=>{for(let r=0;r<6;r++){for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const xx=x+dx,yy=y+dy;if(xx>0&&yy>0&&xx<W-1&&yy<H-1&&g[yy][xx]==='.'){g[yy][xx]=c;return [xx,yy];}}}return null;};
  setFree(W/2-1,Math.floor(H/2),'Z');
  const zc=[[half-9,Math.floor(H*.25)],[half-9,Math.floor(H*.75)]];zc.forEach(([x,y])=>{const p=setFree(x,y,'Z');if(p&&g[p[1]][W-1-p[0]]==='.')g[p[1]][W-1-p[0]]='Z';});
  const pk=[['h',half-4,Math.floor(H*.3)],['h',half-4,Math.floor(H*.7)],['a',half-14,Math.floor(H*.5)-3],['a',half-14,Math.floor(H*.5)+3],['w',half-2,Math.floor(H/2)-1],['c',half-7,Math.floor(H*.5)],['w',half-12,Math.floor(H*.25)],['w',half-12,Math.floor(H*.75)]];
  pk.forEach(([c,x,y])=>{const p=setFree(x,y,c);if(p&&g[p[1]][W-1-p[0]]==='.')g[p[1]][W-1-p[0]]=c;});
  /* seal unreachable floor pockets */
  const sx=2,sy=Math.floor(H/2),seen=Array.from({length:H},()=>Array(W).fill(false)),q=[[sx,sy]];seen[sy][sx]=true;
  const passable=c=>!'#xX~'.includes(c);
  while(q.length){const [x,y]=q.pop();for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx>0&&ny>0&&nx<W-1&&ny<H-1&&!seen[ny][nx]&&passable(g[ny][nx])){seen[ny][nx]=true;q.push([nx,ny]);}}}
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++)if(passable(g[y][x])&&!seen[y][x])g[y][x]='#';
  return{id,name,desc:o.desc||'',rows:g.map(r=>r.join('')),theme:o.theme||'neon'};
}
function defaultMaps(){
  const list=[
    gen('eko_docks','Eko Docks',{seed:7,buildings:16,crates:22,tall:true,water:3,maxW:6,maxH:4,desc:'Container stacks and open lagoon edges. Long sightlines, hard cover.',theme:'dock'}),
    gen('ikeja_grid','Ikeja Grid',{seed:21,buildings:30,crates:14,maxW:4,maxH:3,desc:'Tight alleys and blind corners. Shotguns welcome.',theme:'city'}),
    gen('third_mainland','Third Mainland',{seed:99,buildings:8,crates:28,water:6,maxW:5,maxH:3,desc:'A bridge over the lagoon. Hold the middle or lose the span.',theme:'bridge'})];
  const out={};list.forEach(m=>out[m.id]=m);return out;
}
module.exports={gen,defaultMaps};
