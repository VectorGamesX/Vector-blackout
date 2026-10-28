/* Renderer: cached tile map, fog-of-war visibility polygon, entities, tracers, particles, minimap, animated menu backdrop. */
const R=(()=>{
  const TAU=Math.PI*2;
  const TH={
    neon:{floor:'#0a1120',grid:'#122038',wall:'#1b2c4d',top:'#2d4470',edge:'#19e6ff'},
    dock:{floor:'#0a1317',grid:'#122028',wall:'#222c38',top:'#36445a',edge:'#ff9d1a'},
    city:{floor:'#0c0c14',grid:'#171726',wall:'#1e1a2d',top:'#322a47',edge:'#c9a7ff'},
    bridge:{floor:'#09111a',grid:'#0f202d',wall:'#1b2735',top:'#2c3e54',edge:'#8ff0c3'}};
  const CONT=['#9a3f1e','#1d5a86','#2c7348','#7b5a1c'];
  const hash=(x,y)=>((x*73856093)^(y*19349663))>>>0;
  let cv,ctx,fog,fctx,floor,mini,mctx,mmini,dpr=1,W=0,H=0,zoom=1,cam={x:0,y:0},camInit=false,view={x:0,y:0,z:1};
  const R={};
  R.init=()=>{
    cv=$('#game');ctx=cv.getContext('2d');fog=document.createElement('canvas');fctx=fog.getContext('2d');mini=$('#mini');mctx=mini.getContext('2d');
    R.resize();addEventListener('resize',R.resize);
  };
  R.resize=()=>{
    dpr=Math.min(2,window.devicePixelRatio||1);W=innerWidth;H=innerHeight;
    cv.width=W*dpr;cv.height=H*dpr;fog.width=cv.width;fog.height=cv.height;
    const small=Math.min(W,H)<560;zoom=Math.max(.5,Math.min(1.5,Math.min(W/(small?820:1100),H/(small?520:680))));
  };
  R.buildMap=()=>{
    const m=G.map,th=TH[G.mapDef.theme]||TH.neon,c=document.createElement('canvas');c.width=m.pw;c.height=m.ph;const x=c.getContext('2d');
    x.fillStyle=th.floor;x.fillRect(0,0,m.pw,m.ph);
    const rows=m.rows,at=(tx,ty)=>(tx<0||ty<0||tx>=m.w||ty>=m.h)?'#':rows[ty][tx];
    const solid=ch=>ch==='#'||ch==='X';
    for(let ty=0;ty<m.h;ty++)for(let tx=0;tx<m.w;tx++){
      const ch=rows[ty][tx],px=tx*TS,py=ty*TS,h=hash(tx,ty);
      if(!solid(ch)&&ch!=='~'){
        x.fillStyle=((tx+ty)&1)?'rgba(255,255,255,.012)':'rgba(0,0,0,.05)';x.fillRect(px,py,TS,TS);
        x.strokeStyle=th.grid;x.lineWidth=1;x.strokeRect(px+.5,py+.5,TS-1,TS-1);
        if(ch==='A'||ch==='B'){x.fillStyle=ch==='A'?'rgba(25,230,255,.07)':'rgba(255,157,26,.07)';x.fillRect(px,py,TS,TS);}
        if(h%23===0){x.fillStyle='rgba(255,255,255,.04)';x.fillRect(px+8,py+14,16,2);}
      }
      if(ch==='~'){
        const g=x.createLinearGradient(px,py,px,py+TS);g.addColorStop(0,'#06222e');g.addColorStop(1,'#041822');x.fillStyle=g;x.fillRect(px,py,TS,TS);
        x.strokeStyle='rgba(60,170,200,.10)';x.beginPath();x.moveTo(px+3,py+10+(h%8));x.lineTo(px+13,py+10+(h%8));x.moveTo(px+17,py+22-(h%6));x.lineTo(px+28,py+22-(h%6));x.stroke();
        if(!(at(tx,ty-1)==='~')){x.fillStyle='rgba(25,230,255,.18)';x.fillRect(px,py,TS,1.5);}
        if(!(at(tx,ty+1)==='~')){x.fillStyle='rgba(25,230,255,.18)';x.fillRect(px,py+TS-1.5,TS,1.5);}
      }
    }
    /* solid blocks: shadows first, then bodies so neighbours merge */
    for(let ty=0;ty<m.h;ty++)for(let tx=0;tx<m.w;tx++){const ch=rows[ty][tx];if(!(solid(ch)||ch==='x'))continue;x.fillStyle='rgba(0,0,0,.4)';x.fillRect(tx*TS+3,ty*TS+6,TS,TS);}
    for(let ty=0;ty<m.h;ty++)for(let tx=0;tx<m.w;tx++){
      const ch=rows[ty][tx],px=tx*TS,py=ty*TS,h=hash(tx,ty);
      if(ch==='#'){
        const below=!solid(at(tx,ty+1));
        if(below){x.fillStyle=th.wall;x.fillRect(px,py+TS-2,TS,9);x.fillStyle='rgba(0,0,0,.35)';x.fillRect(px,py+TS+5,TS,2);}
        x.fillStyle=th.top;x.fillRect(px,py,TS,TS);
        x.fillStyle='rgba(255,255,255,.035)';x.fillRect(px+3,py+3,TS-6,TS-6);
        x.fillStyle=th.edge;x.globalAlpha=.55;
        if(!solid(at(tx,ty-1)))x.fillRect(px,py,TS,1.5);if(!solid(at(tx-1,ty)))x.fillRect(px,py,1.5,TS);if(!solid(at(tx+1,ty)))x.fillRect(px+TS-1.5,py,1.5,TS);if(below)x.fillRect(px,py+TS-1,TS,1.5);
        x.globalAlpha=1;
        if(h%11===0){x.fillStyle='rgba(255,220,120,.55)';x.fillRect(px+8+(h%3)*6,py+9,4,5);}
      }else if(ch==='X'){
        const col=CONT[h%CONT.length];x.fillStyle='rgba(0,0,0,.5)';x.fillRect(px,py+TS-1,TS,8);
        x.fillStyle=col;x.fillRect(px,py,TS,TS);x.fillStyle='rgba(0,0,0,.25)';for(let i=4;i<TS;i+=6)x.fillRect(px+i,py,2,TS);
        x.fillStyle='rgba(255,255,255,.22)';x.fillRect(px,py,TS,2);x.strokeStyle='rgba(0,0,0,.6)';x.strokeRect(px+.5,py+.5,TS-1,TS-1);
      }else if(ch==='x'){
        x.fillStyle='#4a3f2a';x.fillRect(px+2,py+5,TS-4,TS-7);x.fillStyle='#7a6842';x.fillRect(px+2,py+2,TS-4,TS-7);
        x.strokeStyle='rgba(255,185,40,.55)';x.lineWidth=3;x.beginPath();for(let i=-TS;i<TS;i+=10){x.moveTo(px+4+i,py+TS-6);x.lineTo(px+4+i+TS-8,py+2);}x.save();x.beginPath();x.rect(px+2,py+2,TS-4,TS-7);x.clip();x.stroke();x.restore();x.lineWidth=1;
        x.strokeStyle='rgba(0,0,0,.6)';x.strokeRect(px+2.5,py+2.5,TS-5,TS-8);
      }
    }
    floor=c;
    /* minimap */
    const sc=3;mmini=document.createElement('canvas');mmini.width=m.w*sc;mmini.height=m.h*sc;const q=mmini.getContext('2d');
    q.fillStyle='rgba(8,14,26,.85)';q.fillRect(0,0,mmini.width,mmini.height);
    for(let ty=0;ty<m.h;ty++)for(let tx=0;tx<m.w;tx++){const ch=rows[ty][tx];q.fillStyle=solid(ch)?'#3a4f7a':ch==='x'?'#6b5a3a':ch==='~'?'#0c3a4a':null;if(q.fillStyle&&(solid(ch)||ch==='x'||ch==='~'))q.fillRect(tx*sc,ty*sc,sc,sc);}
    mini.width=mmini.width;mini.height=mmini.height;camInit=false;
  };
  /* ---------- particles ---------- */
  R.sparks=(x,y,ang,n,col)=>{for(let i=0;i<n;i++){const a=ang+(Math.random()-.5)*2.2,s=80+Math.random()*220;G.fx.parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,t:performance.now(),life:.18+Math.random()*.25,col,sz:1+Math.random()*1.5,k:'s'});}};
  R.burst=(x,y,col,n)=>{for(let i=0;i<n;i++){const a=Math.random()*TAU,s=40+Math.random()*180;G.fx.parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,t:performance.now(),life:.4+Math.random()*.5,col,sz:2+Math.random()*3,k:'b'});}};
  /* ---------- visibility ---------- */
  function visPoly(x,y,rad){
    const N=320,pts=new Array(N*2),map=G.map;
    for(let i=0;i<N;i++){const a=i/N*TAU,dx=Math.cos(a),dy=Math.sin(a);let d=VB.rayGrid(map,x,y,dx,dy,rad,VB.SIGHT_SOLID);d=Math.min(rad,d+10);pts[i*2]=x+dx*d;pts[i*2+1]=y+dy*d;}
    return pts;
  }
  /* ---------- entities ---------- */
  function drawBody(c,x,y,a,col,ring,wid,alpha,flags,isMe,hpPct,name,spent){
    c.save();c.globalAlpha=alpha;c.translate(x,y);
    c.fillStyle='rgba(0,0,0,.4)';c.beginPath();c.ellipse(2,5,12,9,0,0,TAU);c.fill();
    if(flags&4){c.strokeStyle='rgba(255,157,26,.9)';c.lineWidth=2.5;c.beginPath();c.arc(0,0,18,0,TAU);c.stroke();}
    if(flags&64){c.strokeStyle='rgba(255,255,255,.55)';c.lineWidth=1.5;c.setLineDash([4,4]);c.beginPath();c.arc(0,0,17,0,TAU);c.stroke();c.setLineDash([]);}
    c.rotate(a);
    const w=G.cfg.weapons[wid]||{},len=(w.pellets>1?17:w.range>1000?24:w.rpm>600?15:19);
    c.fillStyle='#10151f';c.fillRect(6,-2.5,len,5);c.fillStyle=w.color||'#ccc';c.fillRect(6+len-6,-1.6,6,3.2);
    c.fillStyle=col;c.beginPath();c.ellipse(0,0,8.5,12,0,0,TAU);c.fill();
    c.fillStyle='rgba(0,0,0,.28)';c.beginPath();c.ellipse(-2,0,5,8,0,0,TAU);c.fill();
    c.strokeStyle=ring;c.lineWidth=2.2;c.beginPath();c.ellipse(0,0,8.5,12,0,0,TAU);c.stroke();
    c.fillStyle='#e9f2ff';c.beginPath();c.arc(2,0,5.2,0,TAU);c.fill();c.fillStyle=ring;c.fillRect(3,-4.5,2.2,9);
    c.fillStyle=col;c.beginPath();c.arc(7,-9.5,3,0,TAU);c.arc(7,9.5,3,0,TAU);c.fill();
    c.restore();
    if(hpPct!=null&&!isMe){c.save();c.globalAlpha=Math.min(1,alpha+.2);c.fillStyle='rgba(0,0,0,.6)';c.fillRect(x-12,y-24,24,3.5);c.fillStyle=hpPct>.5?'#8ff0c3':hpPct>.25?'#ffd166':'#ff4d6d';c.fillRect(x-12,y-24,24*hpPct,3.5);c.restore();}
    if(name){c.save();c.globalAlpha=Math.min(1,alpha+.25);c.font='600 11px "Rajdhani",system-ui,sans-serif';c.textAlign='center';c.fillStyle='rgba(0,0,0,.7)';c.fillText(name,x+1,y-28);c.fillStyle=ring;c.fillText(name,x,y-29);c.restore();}
  }
  /* ---------- main frame ---------- */
  R.frame=(dt,t)=>{
    const me=G.me,map=G.map,cfg=G.cfg;if(!map||!floor)return;
    const sx=document.body.classList.contains('touch')?0:0;
    /* camera */
    const ax=me.x+Math.cos(me.a)*70,ay=me.y+Math.sin(me.a)*70;
    if(!camInit||G.camSnap){cam.x=me.x;cam.y=me.y;camInit=true;G.camSnap=false;}
    const k=Math.min(1,dt*9);cam.x+=(ax-cam.x)*k;cam.y+=(ay-cam.y)*k;
    G.shake=Math.max(0,G.shake-dt*30);const shx=(Math.random()-.5)*G.shake,shy=(Math.random()-.5)*G.shake;
    const z=zoom*dpr;
    view.x=cam.x+shx;view.y=cam.y+shy;view.z=zoom;
    const setT=c=>c.setTransform(z,0,0,z,W*dpr/2-view.x*z,H*dpr/2-view.y*z);
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#04070d';ctx.fillRect(0,0,cv.width,cv.height);
    setT(ctx);
    ctx.drawImage(floor,0,0);
    /* pickups */
    for(const p of G.pickups){
      const col=p.type==='h'?'#ff4d6d':p.type==='a'?'#19e6ff':p.type==='w'?'#ffd166':'#c9a7ff';
      ctx.save();ctx.translate(p.x,p.y);
      if(p.up){const pul=1+Math.sin(t/260+p.id)*.08;ctx.globalAlpha=.25;ctx.fillStyle=col;ctx.beginPath();ctx.arc(0,0,17*pul,0,TAU);ctx.fill();ctx.globalAlpha=1;
        ctx.fillStyle='#0b1220';ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,10,0,TAU);ctx.fill();ctx.stroke();
        ctx.fillStyle=col;ctx.font='700 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.type==='h'?'+':p.type==='a'?'◆':p.type==='w'?'W':'⚡',0,.5);}
      else{ctx.globalAlpha=.25;ctx.strokeStyle=col;ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();ctx.arc(0,0,10,0,TAU);ctx.stroke();}
      ctx.restore();
    }
    /* fog of war */
    const rad=cfg.player.vision;
    fctx.setTransform(1,0,0,1,0,0);fctx.globalCompositeOperation='source-over';fctx.fillStyle='rgba(2,4,10,.74)';fctx.fillRect(0,0,fog.width,fog.height);
    setT(fctx);fctx.globalCompositeOperation='destination-out';
    const poly=visPoly(me.x,me.y,rad),g=fctx.createRadialGradient(me.x,me.y,rad*.35,me.x,me.y,rad);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(.75,'rgba(0,0,0,.92)');g.addColorStop(1,'rgba(0,0,0,0)');
    fctx.fillStyle=g;fctx.beginPath();fctx.moveTo(poly[0],poly[1]);for(let i=2;i<poly.length;i+=2)fctx.lineTo(poly[i],poly[i+1]);fctx.closePath();fctx.fill();
    const g2=fctx.createRadialGradient(me.x,me.y,0,me.x,me.y,70);g2.addColorStop(0,'rgba(0,0,0,.9)');g2.addColorStop(1,'rgba(0,0,0,0)');fctx.fillStyle=g2;fctx.beginPath();fctx.arc(me.x,me.y,70,0,TAU);fctx.fill();
    /* teammates light their surroundings a little */
    const others=viewOthers();
    if(G.modeIsTeam()){for(const [id,e] of others){if(e.f&16)continue;const r=G.roster.get(id);if(!r||r.t!==G.team)continue;const g3=fctx.createRadialGradient(e.x,e.y,0,e.x,e.y,150);g3.addColorStop(0,'rgba(0,0,0,.55)');g3.addColorStop(1,'rgba(0,0,0,0)');fctx.fillStyle=g3;fctx.beginPath();fctx.arc(e.x,e.y,150,0,TAU);fctx.fill();}}
    for(const f of G.fx.flashes){const age=(performance.now()-f.t)/90;if(age>1)continue;const g4=fctx.createRadialGradient(f.x,f.y,0,f.x,f.y,f.r);g4.addColorStop(0,'rgba(0,0,0,'+(.8*(1-age))+')');g4.addColorStop(1,'rgba(0,0,0,0)');fctx.fillStyle=g4;fctx.beginPath();fctx.arc(f.x,f.y,f.r,0,TAU);fctx.fill();}
    ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(fog,0,0);
    setT(ctx);
    /* zone */
    if(G.modeType()==='zone'&&map.zones.length){
      const mo=cfg.modes[G.modeId]||{},zr=mo.zoneRadius||96;
      map.zones.forEach((zz,i)=>{
        if(i!==G.zi){ctx.globalAlpha=.25;ctx.strokeStyle='#8aa';ctx.setLineDash([4,6]);ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(zz.x,zz.y,24,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;return;}
        const col=G.zs===-2?'#ff4d6d':G.zs>=0?teamCol(G.zs):'#e8f2ff',pul=.5+.5*Math.sin(t/320);
        ctx.fillStyle=col;ctx.globalAlpha=.07+.05*pul;ctx.beginPath();ctx.arc(zz.x,zz.y,zr,0,TAU);ctx.fill();ctx.globalAlpha=.9;ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.setLineDash([14,10]);ctx.lineDashOffset=-t/60;ctx.beginPath();ctx.arc(zz.x,zz.y,zr,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
      });
    }
    /* entities */
    const dead=!me.al;
    for(const [id,e] of others){
      const r=G.roster.get(id)||{t:-1,c:'ronin',n:'?'};
      if(e.f&16){const p=.5+.5*Math.sin(t/180+id);ctx.strokeStyle='rgba(255,77,109,'+(.25+.35*p)+')';ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,16+p*8,0,TAU);ctx.stroke();ctx.fillStyle='rgba(255,77,109,.7)';ctx.font='700 12px sans-serif';ctx.textAlign='center';ctx.fillText('?',e.x,e.y+4);continue;}
      const mate=G.modeIsTeam()&&r.t===G.team,cl=cfg.classes[r.c]||{color:'#fff'},ring=G.modeIsTeam()?teamCol(r.t):'#ff4d6d',cloak=e.f&2;
      const d=Math.hypot(e.x-me.x,e.y-me.y);
      if(e.f&8){ctx.globalAlpha=.25;drawBody(ctx,e.x-Math.cos(e.a)*18,e.y-Math.sin(e.a)*18,e.a,cl.color,ring,e.w,.4,0,false,null,null);ctx.globalAlpha=1;}
      drawBody(ctx,e.x,e.y,e.a,cl.color,ring,e.w,cloak?(mate?.4:.18):1,e.f,false,e.h/((cfg.classes[r.c]&&cfg.classes[r.c].hp)||100),(mate||d<420)?r.n:null);
    }
    if(!dead){const cl=cfg.classes[me.cls]||{color:'#fff'};
      ctx.save();ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=1;ctx.setLineDash([2,6]);ctx.beginPath();ctx.moveTo(me.x+Math.cos(me.a)*26,me.y+Math.sin(me.a)*26);ctx.lineTo(me.x+Math.cos(me.a)*(G.cfg.weapons[me.wid]?Math.min(900,G.cfg.weapons[me.wid].range):500),me.y+Math.sin(me.a)*(G.cfg.weapons[me.wid]?Math.min(900,G.cfg.weapons[me.wid].range):500));ctx.stroke();ctx.restore();
      const cl2=(cfg.classes[me.cls]&&cfg.classes[me.cls].ability==='cloak'&&me.at>0);
      if(me.dashT>0){ctx.globalAlpha=.3;drawBody(ctx,me.x-me.dashDx*20,me.y-me.dashDy*20,me.a,cl.color,teamCol(G.team<0?-1:G.team),me.wid,.4,0,true);ctx.globalAlpha=1;}
      drawBody(ctx,me.x,me.y,me.a,cl.color,G.modeIsTeam()?teamCol(G.team):'#ffffff',me.wid,cl2?.55:1,(me.surge?4:0)|(me.inv?64:0),true,null,null);
      ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(me.x,me.y,19,0,TAU);ctx.stroke();
    }
    /* tracers */
    const nowP=performance.now();
    ctx.lineCap='round';G.fx.tracers=G.fx.tracers.filter(tr=>nowP-tr.t<140);
    for(const tr of G.fx.tracers){const age=(nowP-tr.t)/140,ex=tr.x+Math.cos(tr.ang)*tr.l,ey=tr.y+Math.sin(tr.ang)*tr.l;
      const head=Math.min(1,age*2.2+.1),tail=Math.max(0,age*1.6-.2),x0=tr.x+(ex-tr.x)*tail,y0=tr.y+(ey-tr.y)*tail,x1=tr.x+(ex-tr.x)*head,y1=tr.y+(ey-tr.y)*head;
      ctx.globalAlpha=(1-age)*.4;ctx.strokeStyle=tr.col;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
      ctx.globalAlpha=1-age;ctx.strokeStyle='#fff';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();}
    ctx.globalAlpha=1;
    /* particles */
    G.fx.parts=G.fx.parts.filter(p=>(nowP-p.t)/1000<p.life);
    for(const p of G.fx.parts){const a=(nowP-p.t)/1000,k=1-a/p.life;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.93;p.vy*=.93;ctx.globalAlpha=k;ctx.fillStyle=p.col;
      if(p.k==='s'){ctx.fillRect(p.x-p.sz/2,p.y-p.sz/2,p.sz*2,p.sz);}else{ctx.beginPath();ctx.arc(p.x,p.y,p.sz*k,0,TAU);ctx.fill();}}
    ctx.globalAlpha=1;
    /* rings */
    G.fx.rings=G.fx.rings.filter(r=>nowP-r.t<500);
    for(const r of G.fx.rings){const k=(nowP-r.t)/500;ctx.globalAlpha=(1-k)*.8;ctx.strokeStyle=r.col;ctx.lineWidth=2.5*(1-k)+.5;ctx.beginPath();ctx.arc(r.x,r.y,r.r*(.2+.8*k),0,TAU);ctx.stroke();}
    ctx.globalAlpha=1;
    /* additive muzzle light */
    ctx.globalCompositeOperation='lighter';
    G.fx.flashes=G.fx.flashes.filter(f=>nowP-f.t<90);
    for(const f of G.fx.flashes){const age=(nowP-f.t)/90,g5=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,f.r*.7);g5.addColorStop(0,f.col);g5.addColorStop(1,'rgba(0,0,0,0)');ctx.globalAlpha=(1-age)*.45;ctx.fillStyle=g5;ctx.beginPath();ctx.arc(f.x,f.y,f.r*.7,0,TAU);ctx.fill();}
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    /* screen-space: damage vignette */
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const da=Math.max(0,1-(nowP-G.dmgT)/700);
    if(da>0||me.hp<30&&me.al){const a=Math.max(da*.55,me.al&&me.hp<30?.18+.1*Math.sin(t/200):0),vg=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.3,W/2,H/2,Math.max(W,H)*.75);vg.addColorStop(0,'rgba(255,0,40,0)');vg.addColorStop(1,'rgba(255,0,40,'+a+')');ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
      if(da>0&&me.al){const sa=G.dmgA-0;ctx.save();ctx.translate(W/2,H/2);ctx.rotate(sa);ctx.fillStyle='rgba(255,60,80,'+da+')';ctx.beginPath();ctx.moveTo(Math.min(W,H)*.34,0);ctx.lineTo(Math.min(W,H)*.34-18,-12);ctx.lineTo(Math.min(W,H)*.34-18,12);ctx.fill();ctx.restore();}}
    /* hit marker */
    const ha=1-(nowP-G.hitT)/260;
    if(ha>0){const cx=INP.sx!=null?INP.sx:W/2,cy=INP.sy!=null?INP.sy:H/2;ctx.strokeStyle=G.hitKill?'rgba(255,77,109,'+ha+')':'rgba(255,255,255,'+ha+')';ctx.lineWidth=2.4;const s=G.hitKill?11:7,e=s+6;ctx.beginPath();for(const [a,b] of [[1,1],[-1,1],[1,-1],[-1,-1]]){ctx.moveTo(cx+a*s,cy+b*s);ctx.lineTo(cx+a*e,cy+b*e);}ctx.stroke();}
    R.drawMini(others);
  };
  /* world <-> screen helpers for input */
  R.screenToWorld=(sx,sy)=>({x:view.x+(sx-W/2)/view.z,y:view.y+(sy-H/2)/view.z});
  R.drawMini=(others)=>{
    const m=G.map,sc=3,me=G.me;mctx.clearRect(0,0,mini.width,mini.height);mctx.drawImage(mmini,0,0);
    const t=G.team;
    if(G.modeType()==='zone'&&m.zones.length){const z=m.zones[G.zi];mctx.strokeStyle=G.zs===-2?'#ff4d6d':G.zs>=0?teamCol(G.zs):'#fff';mctx.lineWidth=1.5;mctx.beginPath();mctx.arc(z.x/TS*sc,z.y/TS*sc,(G.cfg.modes[G.modeId].zoneRadius||96)/TS*sc,0,TAU);mctx.stroke();}
    for(const p of G.pickups){if(!p.up)continue;mctx.fillStyle=p.type==='h'?'#ff4d6d':p.type==='a'?'#19e6ff':p.type==='w'?'#ffd166':'#c9a7ff';mctx.fillRect(p.x/TS*sc-1,p.y/TS*sc-1,2,2);}
    for(const [id,e] of others){const r=G.roster.get(id)||{t:-1};const mate=G.modeIsTeam()&&r.t===t;mctx.fillStyle=(e.f&16)?'rgba(255,77,109,.5)':mate?teamCol(r.t):'#ff4d6d';mctx.beginPath();mctx.arc(e.x/TS*sc,e.y/TS*sc,mate?2.2:2,0,TAU);mctx.fill();}
    if(me.al){mctx.fillStyle='#fff';mctx.beginPath();mctx.arc(me.x/TS*sc,me.y/TS*sc,2.6,0,TAU);mctx.fill();mctx.strokeStyle='#fff';mctx.beginPath();mctx.moveTo(me.x/TS*sc,me.y/TS*sc);mctx.lineTo(me.x/TS*sc+Math.cos(me.a)*7,me.y/TS*sc+Math.sin(me.a)*7);mctx.stroke();}
  };
  /* ---------- animated menu backdrop ---------- */
  R.menuBg=(c,w,h,t)=>{
    const x=c.getContext('2d');x.clearRect(0,0,w,h);
    const g=x.createLinearGradient(0,0,0,h);g.addColorStop(0,'#04060d');g.addColorStop(.6,'#0a1226');g.addColorStop(1,'#12102a');x.fillStyle=g;x.fillRect(0,0,w,h);
    /* sun glow */
    const gx=w*.72,gy=h*.62,gr=x.createRadialGradient(gx,gy,0,gx,gy,h*.7);gr.addColorStop(0,'rgba(255,157,26,.28)');gr.addColorStop(.5,'rgba(255,60,120,.08)');gr.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=gr;x.fillRect(0,0,w,h);
    /* skyline layers */
    for(let L=0;L<3;L++){const base=h*(.62+L*.07),sp=(t/(2200-L*500))%1,cols=['#0a1020','#0d1530','#111b3a'];x.fillStyle=cols[L];
      for(let i=-1;i<22;i++){const seed=((i+L*7)*2654435761>>>0),bw=w/16+(seed%40),bh=h*(.12+L*.04)+((seed>>8)%(h*.22)),bx=(i*w/16-sp*w/16)+L*14;x.fillRect(bx,base-bh,bw,bh+h);
        if(L===2)for(let k=0;k<6;k++){if(((seed>>k)&3)===0){x.fillStyle='rgba(255,220,140,.5)';x.fillRect(bx+6+(k%3)*12,base-bh+10+((k/3)|0)*16,5,7);x.fillStyle=cols[L];}}}}
    /* perspective grid */
    x.save();const hz=h*.74;x.strokeStyle='rgba(25,230,255,.16)';x.lineWidth=1;
    for(let i=-14;i<=14;i++){x.beginPath();x.moveTo(w/2+i*30,hz);x.lineTo(w/2+i*(w*.14),h);x.stroke();}
    for(let i=0;i<10;i++){const k=((i+(t/900)%1)/10),y=hz+(h-hz)*k*k;x.beginPath();x.moveTo(0,y);x.lineTo(w,y);x.stroke();}
    x.restore();
    /* drifting embers */
    for(let i=0;i<40;i++){const s=(i*9301+49297)%233280/233280,px=(s*w+t*.01*(1+s))%w,py=h-((t*.02*(.4+s)+s*h*3)%h);x.fillStyle='rgba(255,180,80,'+(.1+.3*((i%5)/5))+')';x.fillRect(px,py,1.5,1.5);}
    /* scanline vignette */
    const v=x.createRadialGradient(w/2,h/2,h*.3,w/2,h/2,h*.95);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.65)');x.fillStyle=v;x.fillRect(0,0,w,h);
  };
  return R;
})();
G.modeType=()=>{const m=G.cfg&&G.cfg.modes[G.modeId];return m?(m.type||G.modeId):'tdm';};
G.modeIsTeam=()=>G.modeType()!=='ffa';
