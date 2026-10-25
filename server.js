'use strict';
/* VECTOR: BLACKOUT server — static files, WebSocket game protocol, voice signalling relay, PIN-protected developer API. */
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),url=require('url');
const {WebSocketServer}=require('ws');
const CFG=require('./config');
const {Room}=require('./game');
const VB=require('./public/js/shared.js');
const {defaultMaps,gen}=require('./maps');

const PORT=+process.env.PORT||3000;
const DEV_PIN=String(process.env.DEV_PIN||'8881');
const PUB=path.join(__dirname,'public'),MUSIC=path.join(CFG.DATA,'music'),BANS=path.join(CFG.DATA,'bans.json');
const TURN=process.env.TURN_URL?{urls:process.env.TURN_URL.split(','),username:process.env.TURN_USER||'',credential:process.env.TURN_PASS||''}:null;
const ICE=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}].concat(TURN?[TURN]:[]);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.m4a':'audio/mp4','.webm':'audio/webm'};

/* ---------- bans ---------- */
let bans={};try{bans=JSON.parse(fs.readFileSync(BANS,'utf8'));}catch(e){}
const saveBans=()=>{try{fs.writeFileSync(BANS,JSON.stringify(bans));}catch(e){}};
const ipOf=(req)=>{const x=process.env.TRUST_PROXY==='0'?'':String(req.headers['x-forwarded-for']||'').split(',')[0].trim();return x||req.socket.remoteAddress||'?';};

/* ---------- hub ---------- */
const clients=new Set(),rooms=new Map();let locked=false,banner='';
const send=(ws,o)=>{if(ws&&ws.readyState===1&&ws.bufferedAmount<1.5e6){try{ws.send(JSON.stringify(o));}catch(e){}}};
const hub={
  sendRoster(room){
    const list=[...room.players.values()].map(p=>({i:p.id,n:p.name,t:p.team,c:p.cls,k:p.k,d:p.d,b:p.bot?1:0,v:p.voice?1:0}));
    for(const p of room.humans())send(p.ws,{t:'r',p:list});
  },
  sendWorld(room){
    const md=room.mapDef,msg={t:'w',room:room.code,mode:room.modeId,priv:room.priv?1:0,map:{id:md.id,name:md.name,rows:md.rows,theme:md.theme||'neon'},pickups:room.pickups.map(k=>({id:k.id,x:k.x,y:k.y,type:k.type,up:k.up?1:0}))};
    for(const p of room.humans())send(p.ws,{...msg,you:p.id,team:p.team});
    room.rosterDirty=true;
  },
  sendVoiceGains(room){
    const cfg=CFG.get(),hear=cfg.player.hearing*1.2,vs=room.humans().filter(p=>p.voice);
    if(vs.length<2)return;
    for(const a of vs){const g={};for(const b of vs){if(a===b)continue;
      const d=Math.hypot(a.x-b.x,a.y-b.y),mate=room.team&&a.team===b.team;
      let v=mate?1:Math.max(0,1-d/hear);if(!mate&&!b.alive)v=0;if(!a.alive&&!mate)v=0;if(mate&&b.alive&&a.alive)v=Math.max(.35,v);g[b.id]=Math.round(v*100)/100;}
      send(a.ws,{t:'vg',g});}
  }
};
function newCode(){const A='ABCDEFGHJKLMNPQRSTUVWXYZ';for(;;){let c='';for(let i=0;i<4;i++)c+=A[(Math.random()*A.length)|0];if(!rooms.has(c))return c;}}
function makeRoom(opts){const r=new Room(newCode(),opts,hub);rooms.set(r.code,r);return r;}
function findRoom(modeId,mapId){
  const max=CFG.get().match.maxPlayers;let best=null;
  for(const r of rooms.values()){if(r.priv||r.locked||r.modeId!==modeId)continue;if(r.humans().length>=max)continue;
    if(mapId&&r.mapId!==mapId)continue;if(!best||r.humans().length>best.humans().length)best=r;}
  return best||makeRoom({mode:modeId,map:mapId});
}
function cleanName(n){n=String(n||'').replace(/[^\p{L}\p{N} _\-.]/gu,'').trim().slice(0,16);return n||('Op'+(100+(Math.random()*899|0)));}
function joinRoom(c,room,o){
  leave(c);
  const p=room.add({name:cleanName(o.name),cls:o.cls,ws:c.ws,client:c});
  c.room=room;c.p=p;hub.sendWorld(room);
  send(c.ws,{t:'cfg',cfg:CFG.publicCfg(),ice:ICE,banner});
  send(c.ws,{t:'sys',m:p.name+' joined'});
  for(const q of room.humans())if(q!==p)send(q.ws,{t:'sys',m:p.name+' joined'});
}
function leave(c){
  if(!c.room)return;const room=c.room,p=c.p;room.remove(p);
  for(const q of room.humans()){send(q.ws,{t:'sys',m:p.name+' left'});send(q.ws,{t:'pl',id:p.id});}
  c.room=null;c.p=null;
}
const kickClient=(c,why)=>{send(c.ws,{t:'kick',m:why||'Removed by an admin.'});try{c.ws.close();}catch(e){}};

/* ---------- http ---------- */
const sessions=new Map(); /* token -> expiry */
const fails={};let globalFails=[],globalLock=0;
function body(req,limit){return new Promise((res,rej)=>{const ch=[];let n=0;req.on('data',d=>{n+=d.length;if(n>limit){rej(new Error('too large'));req.destroy();return;}ch.push(d);});req.on('end',()=>res(Buffer.concat(ch)));req.on('error',rej);});}
const json=(res,code,o)=>{const s=JSON.stringify(o);res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(s);};
function authed(req){const h=String(req.headers.authorization||'');const t=h.startsWith('Bearer ')?h.slice(7):'';const e=sessions.get(t);if(!e||e<Date.now()){sessions.delete(t);return false;}return true;}
function safeEq(a,b){const A=Buffer.from(String(a)),B=Buffer.from(String(b));if(A.length!==B.length){crypto.timingSafeEqual(A,A);return false;}return crypto.timingSafeEqual(A,B);}
function devState(){
  const cfg=CFG.get();
  return{config:cfg,online:[...clients].filter(c=>c.p).length,rooms:[...rooms.values()].map(r=>({code:r.code,mode:r.modeId,map:r.mapId,priv:r.priv,phase:r.phase,locked:r.locked,tl:Math.round(r.timeLeft),score:r.score,
    players:[...r.players.values()].map(p=>({id:p.id,name:p.name,bot:p.bot,team:p.team,cls:p.cls,k:p.k,d:p.d,voice:p.voice,ip:p.client?p.client.ip:''}))})),
    bans:Object.keys(bans),locked,banner,uptime:Math.round(process.uptime()),pinIsDefault:DEV_PIN==='8881'};
}
function pushCfg(){for(const c of clients)if(c.ws.readyState===1)send(c.ws,{t:'cfg',cfg:CFG.publicCfg(),ice:ICE,banner});}
async function devApi(req,res,u){
  const ip=ipOf(req);
  if(u.pathname==='/api/dev/login'&&req.method==='POST'){
    const now=Date.now();globalFails=globalFails.filter(t=>now-t<600000);
    const f=fails[ip]||(fails[ip]={n:0,t:now,lock:0});
    if(now<globalLock||now<f.lock)return json(res,429,{error:'Too many attempts. Try again later.'});
    let o={};try{o=JSON.parse((await body(req,1024)).toString()||'{}');}catch(e){}
    if(safeEq(String(o.pin||''),DEV_PIN)){f.n=0;const tok=crypto.randomBytes(24).toString('hex');sessions.set(tok,now+12*3600e3);return json(res,200,{token:tok});}
    f.n++;globalFails.push(now);if(f.n>=5){f.lock=now+5*60e3;f.n=0;}if(globalFails.length>=40){globalLock=now+15*60e3;globalFails=[];}
    return json(res,401,{error:'Wrong PIN'});
  }
  if(!authed(req))return json(res,401,{error:'Not signed in'});
  try{
    if(u.pathname==='/api/dev/state'&&req.method==='GET')return json(res,200,devState());
    if(u.pathname==='/api/dev/config'&&req.method==='POST'){
      const o=JSON.parse((await body(req,3e6)).toString());CFG.set(o.config);pushCfg();return json(res,200,{ok:true,config:CFG.get()});}
    if(u.pathname==='/api/dev/genmap'&&req.method==='POST'){
      const o=JSON.parse((await body(req,1024)).toString()||'{}'),n=(v,a,b,d)=>Math.max(a,Math.min(b,isFinite(+v)?+v|0:d));
      const w=n(o.w,24,80,48)&~1,h=n(o.h,16,50,30);
      const m=gen('tmp','tmp',{seed:n(o.seed,1,1e9,1),buildings:n(o.buildings,0,60,16),crates:n(o.crates,0,60,20),water:n(o.water,0,10,0),tall:!!o.tall,w,h,maxW:5,maxH:4});
      return json(200,{rows:m.rows});}
    if(u.pathname==='/api/dev/reset'&&req.method==='POST'){
      const o=JSON.parse((await body(req,1024)).toString()||'{}');const cur=CFG.get();
      if(o.what==='maps'){const next=JSON.parse(JSON.stringify(cur));next.maps=defaultMaps();next.mapOrder=Object.keys(next.maps);CFG.set(next);}
      else{const keep={maps:cur.maps,mapOrder:cur.mapOrder,music:cur.music};const d=JSON.parse(JSON.stringify(CFG.DEFAULTS));CFG.set(Object.assign(d,keep));}
      pushCfg();return json(res,200,{ok:true,config:CFG.get()});}
    if(u.pathname==='/api/dev/music'&&req.method==='POST'){
      const ext=String(u.query.ext||'').toLowerCase().replace(/[^a-z0-9]/g,'');if(!['mp3','ogg','wav','m4a','webm'].includes(ext))return json(res,400,{error:'Use mp3, ogg, wav, m4a or webm'});
      const buf=await body(req,25e6);if(buf.length<2000)return json(res,400,{error:'File looks empty'});
      const id=crypto.randomBytes(5).toString('hex'),file=id+'.'+ext;fs.writeFileSync(path.join(MUSIC,file),buf);
      const cfg=JSON.parse(JSON.stringify(CFG.get()));cfg.music.tracks.push({id,name:String(u.query.name||'Track').slice(0,60),file,where:'both'});CFG.set(cfg);pushCfg();return json(res,200,{ok:true,config:CFG.get()});}
    const m=u.pathname.match(/^\/api\/dev\/music\/([a-f0-9]+)$/);
    if(m&&req.method==='DELETE'){
      const cfg=JSON.parse(JSON.stringify(CFG.get())),i=cfg.music.tracks.findIndex(t=>t.id===m[1]);if(i<0)return json(res,404,{error:'No such track'});
      const [t]=cfg.music.tracks.splice(i,1);try{fs.unlinkSync(path.join(MUSIC,path.basename(t.file)));}catch(e){}CFG.set(cfg);pushCfg();return json(res,200,{ok:true,config:CFG.get()});}
    if(u.pathname==='/api/dev/act'&&req.method==='POST'){
      const o=JSON.parse((await body(req,4096)).toString());
      const findP=id=>{for(const r of rooms.values()){const p=r.players.get(id);if(p&&!p.bot)return p;}return null;};
      switch(o.a){
        case 'kick':{const p=findP(o.id);if(p&&p.client)kickClient(p.client,o.m);break;}
        case 'ban':{const p=findP(o.id);if(p&&p.client){bans[p.client.ip]=Date.now();saveBans();kickClient(p.client,'You have been banned.');}break;}
        case 'unban':delete bans[o.ip];saveBans();break;
        case 'say':{const m=String(o.m||'').slice(0,200);for(const c of clients)send(c.ws,{t:'sys',m:'[ADMIN] '+m,big:1});break;}
        case 'banner':banner=String(o.m||'').slice(0,200);pushCfg();break;
        case 'lock':locked=!!o.v;break;
        case 'closeRoom':{const r=rooms.get(o.code);if(r){for(const p of r.humans())if(p.client)kickClient(p.client,'Room closed by an admin.');rooms.delete(o.code);}break;}
        case 'restart':{const r=rooms.get(o.code);if(r){if(o.map)r.mapId=o.map;r.keepMap=true;r.loadMatch();hub.sendWorld(r);}break;}
        case 'fill':{const r=rooms.get(o.code);if(r)r.balanceBots();break;}
        default:return json(res,400,{error:'Unknown action'});
      }
      return json(res,200,{ok:true,state:devState()});}
  }catch(e){return json(res,400,{error:String(e.message||e)});}
  json(res,404,{error:'Not found'});
}
function serveFile(req,res,file,cache){
  fs.stat(file,(err,st)=>{
    if(err||!st.isFile()){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('Not found');}
    const ext=path.extname(file).toLowerCase(),type=MIME[ext]||'application/octet-stream',h={'Content-Type':type,'Accept-Ranges':'bytes','Cache-Control':cache||'no-cache','X-Content-Type-Options':'nosniff'};
    const rg=req.headers.range&&/bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if(rg){let s=rg[1]?+rg[1]:0,e=rg[2]?+rg[2]:st.size-1;if(s>=st.size||e<s){res.writeHead(416,{'Content-Range':'bytes */'+st.size});return res.end();}
      e=Math.min(e,st.size-1);res.writeHead(206,{...h,'Content-Range':`bytes ${s}-${e}/${st.size}`,'Content-Length':e-s+1});return fs.createReadStream(file,{start:s,end:e}).pipe(res);}
    res.writeHead(200,{...h,'Content-Length':st.size});if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
  });
}
const server=http.createServer((req,res)=>{
  const u=url.parse(req.url,true);let p=decodeURIComponent(u.pathname||'/');
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','microphone=(self)');
  if(p==='/health'){res.writeHead(200);return res.end('ok');}
  if(p.startsWith('/api/dev/'))return devApi(req,res,u);
  if(p==='/api/config'){return json(res,200,{cfg:CFG.publicCfg(),ice:ICE});}
  if(p.startsWith('/music/')){return serveFile(req,res,path.join(MUSIC,path.basename(p)),'public, max-age=3600');}
  if(p==='/')p='/index.html';if(p==='/dev')p='/dev.html';
  const f=path.normalize(path.join(PUB,p));if(!f.startsWith(PUB)){res.writeHead(403);return res.end();}
  serveFile(req,res,f);
});

/* ---------- websocket ---------- */
const wss=new WebSocketServer({server,maxPayload:16384,path:'/ws'});
wss.on('connection',(ws,req)=>{
  const ip=ipOf(req);
  if(bans[ip]){send(ws,{t:'kick',m:'You are banned from this server.'});return ws.close();}
  const c={ws,ip,room:null,p:null,msgs:0,msgT:Date.now(),chatT:0};clients.add(c);
  send(ws,{t:'hi',cfg:CFG.publicCfg(),ice:ICE,banner,online:[...clients].filter(x=>x.p).length});
  ws.on('message',raw=>{
    const now=Date.now();if(now-c.msgT>1000){c.msgT=now;c.msgs=0;}if(++c.msgs>90)return;
    let m;try{m=JSON.parse(raw);}catch(e){return;}if(!m||typeof m.t!=='string')return;
    const p=c.p,room=c.room;
    switch(m.t){
      case 'join':{
        if(locked)return send(ws,{t:'err',m:'Server is locked for maintenance.'});
        const cfg=CFG.get();let mode=cfg.modes[m.mode]?m.mode:Object.keys(cfg.modes)[0],map=cfg.maps[m.map]?m.map:null,r;
        const code=String(m.room||'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,4);
        if(m.create){if(rooms.size>=30)return send(ws,{t:'err',m:'Server is full of rooms. Try quick play.'});r=makeRoom({mode,map:map||cfg.mapOrder[0],priv:true});r.keepMap=true;}
        else if(code){r=rooms.get(code);if(!r)return send(ws,{t:'err',m:'No room with code '+code});if(r.humans().length>=cfg.match.maxPlayers)return send(ws,{t:'err',m:'That room is full.'});}
        else{if(rooms.size>=30&&![...rooms.values()].some(x=>!x.priv&&x.modeId===mode))return send(ws,{t:'err',m:'Server is busy. Try again soon.'});r=findRoom(mode,map);}
        joinRoom(c,r,m);break;}
      case 'in':{
        if(!p||!room)break;
        const inp={seq:m.seq|0,mx:Math.max(-1,Math.min(1,+m.mx||0)),my:Math.max(-1,Math.min(1,+m.my||0)),a:isFinite(+m.a)?+m.a:p.a,fire:m.fire?1:0,ab:m.ab?1:0,rl:m.rl?1:0};
        if(inp.seq<=p.last.seq&&p.q.length===0&&inp.seq<p.seq-1000)p.seq=0;
        p.q.push(inp);if(p.q.length>8)p.q.shift();break;}
      case 'cls':{if(p&&room){const cfg=CFG.get();if(cfg.classes[m.c]){p.nextCls=m.c;if(!p.alive||room.phase==='countdown'){/* applies on next spawn; instant while dead */}}}break;}
      case 'chat':{
        if(!p||!room||now-c.chatT<700)break;c.chatT=now;let txt=String(m.m||'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,160);if(!txt)break;
        let team=false;if(txt.startsWith('/t ')){team=true;txt=txt.slice(3);}
        for(const q of room.humans()){if(team&&room.team&&q.team!==p.team)continue;send(q.ws,{t:'c',i:p.id,n:p.name,tm:p.team,team:team?1:0,m:txt});}
        break;}
      case 'vo':{
        if(!p||!room)break;p.voice=!!m.on;room.rosterDirty=true;
        if(p.voice)send(ws,{t:'vp',ids:room.humans().filter(q=>q!==p&&q.voice).map(q=>q.id),ice:ICE});
        else for(const q of room.humans())if(q!==p)send(q.ws,{t:'vx',id:p.id});
        break;}
      case 'sig':{
        if(!p||!room||typeof m.d!=='object'||JSON.stringify(m.d).length>8000)break;
        const q=room.players.get(m.to|0);if(q&&!q.bot&&q.voice&&p.voice)send(q.ws,{t:'sig',from:p.id,d:m.d});break;}
      case 'leave':leave(c);break;
      case 'ping':send(ws,{t:'pong',c:m.c});break;
    }
  });
  const gone=()=>{leave(c);clients.delete(c);};
  ws.on('close',gone);ws.on('error',gone);
});

/* ---------- main loop ---------- */
const TICK=1000/30;let next=Date.now();
function loop(){
  const cfg=CFG.get();
  for(const r of rooms.values()){
    try{
      r.step();
      if(r.humans().length){
        for(const p of r.humans())send(p.ws,r.snapshotFor(p,cfg));
        r.events.length=0;
      }
    }catch(e){console.error('room error',r.code,e);}
    if(r.emptyT>20)rooms.delete(r.code);
  }
  next+=TICK;const d=next-Date.now();if(d<-250)next=Date.now();setTimeout(loop,Math.max(0,d));
}
loop();
process.on('uncaughtException',e=>console.error('uncaught',e));
server.listen(PORT,()=>console.log(`VECTOR: BLACKOUT listening on :${PORT}  (dev console: /dev, PIN ${DEV_PIN==='8881'?'8881 — set DEV_PIN to change it':'set via DEV_PIN'})`));
