'use strict';
const fs=require('fs'),path=require('path');
const {defaultMaps}=require('./maps');
const DATA=process.env.DATA_DIR||path.join(__dirname,'data'),FILE=path.join(DATA,'config.json');
fs.mkdirSync(path.join(DATA,'music'),{recursive:true});
const DEFAULTS={
  brand:{title:'VECTOR: BLACKOUT',studio:'VectorGamex',tagline:'Lagos, 2049. The grid is down. Take it back.',motd:'Welcome to the grid, operator. Pick a callsign and drop in.',accent:'#19e6ff',accent2:'#ff9d1a',teamA:'MAINLAND',teamB:'ISLAND',rules:'Fog of war is real. Cut the lights, flank the grid, talk to your team. Enemies hear you when you get close.'},
  player:{hp:100,armorMax:100,speed:190,radius:11,respawn:3,dashSpeed:900,vision:640,hearing:420,armorAbsorb:.6},
  weapons:{
    pistol:{name:'K9 Sidearm',damage:22,rpm:360,mag:12,reload:1.1,spread:1.2,range:720,pellets:1,auto:false,moveSpeed:1,color:'#cfe8ff'},
    smg:{name:'Okada SMG',damage:11,rpm:780,mag:30,reload:1.6,spread:4,range:560,pellets:1,auto:true,moveSpeed:1,color:'#ffe08a'},
    rifle:{name:'Naija AR-9',damage:19,rpm:520,mag:24,reload:1.9,spread:2,range:820,pellets:1,auto:true,moveSpeed:.96,color:'#8ff0c3'},
    shotgun:{name:'Danfo Scatter',damage:11,rpm:72,mag:6,reload:2.2,spread:9,range:340,pellets:8,auto:false,moveSpeed:.95,color:'#ff9d6a'},
    sniper:{name:'Lagoon Longshot',damage:88,rpm:46,mag:4,reload:2.6,spread:.15,range:1500,pellets:1,auto:false,moveSpeed:.85,color:'#c9a7ff'}},
  classes:{
    ronin:{name:'Ronin',desc:'Balanced assault. DASH: a short burst of speed that slips past bullets.',hp:100,speed:1,primary:'rifle',ability:'dash',cd:6,dur:.18,color:'#19e6ff'},
    ghost:{name:'Ghost',desc:'Fast and fragile. CLOAK: near-invisible to enemies for a few seconds.',hp:80,speed:1.1,primary:'smg',ability:'cloak',cd:14,dur:4,color:'#c9a7ff'},
    bulwark:{name:'Bulwark',desc:'Heavy and tough. SURGE: take 45% less damage and regenerate.',hp:130,speed:.9,primary:'shotgun',ability:'surge',cd:16,dur:3.5,color:'#ff9d1a'},
    hacker:{name:'Hacker',desc:'Intel specialist. SCAN: reveals enemies through walls for your team.',hp:90,speed:1,primary:'smg',ability:'scan',cd:12,dur:3,radius:560,color:'#8ff0c3'}},
  modes:{
    tdm:{type:'tdm',name:'Team Deathmatch',desc:'Mainland vs Island. First to the kill limit wins.',team:true,scoreLimit:30,timeLimit:300},
    ffa:{type:'ffa',name:'Free For All',desc:'Everyone for themselves.',team:false,scoreLimit:20,timeLimit:300},
    zone:{type:'zone',name:'Grid Control',desc:'Hold the live zone to power your side. The zone moves.',team:true,scoreLimit:120,timeLimit:360,zoneRadius:96,zoneMove:40}},
  match:{countdown:5,endScreen:12,botSkill:.6,botFill:6,maxPlayers:12,spawnProtect:1.5,pickupRespawn:20,pickupHeal:45,pickupArmor:50},
  maps:null,mapOrder:['eko_docks','ikeja_grid','third_mainland'],
  music:{tracks:[],useSynth:true,volume:.45}
};
const COLL=new Set(['weapons','classes','modes','maps']);
function merge(base,over,depth=0){
  if(Array.isArray(base)||typeof base!=='object'||base===null)return over===undefined?base:over;
  const out={};
  for(const k of Object.keys(base)){
    if(depth===0&&COLL.has(k)){out[k]=(over&&over[k]&&typeof over[k]==='object'&&Object.keys(over[k]).length)?over[k]:base[k];continue;}
    out[k]=(over&&k in over)?merge(base[k],over[k],depth+1):base[k];
  }
  if(over&&typeof over==='object')for(const k of Object.keys(over))if(!(k in base))out[k]=over[k];
  return out;
}
let cfg;
function load(){
  let saved={};try{saved=JSON.parse(fs.readFileSync(FILE,'utf8'));}catch(e){}
  cfg=merge(DEFAULTS,saved);
  if(!cfg.maps||!Object.keys(cfg.maps).length)cfg.maps=defaultMaps();
  cfg.mapOrder=cfg.mapOrder.filter(id=>cfg.maps[id]);Object.keys(cfg.maps).forEach(id=>{if(!cfg.mapOrder.includes(id))cfg.mapOrder.push(id);});
  return cfg;
}
function save(){const tmp=FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(cfg,null,1));fs.renameSync(tmp,FILE);}
function get(){return cfg||load();}
/* validation of dev edits: numbers must be finite and inside sane bounds, maps must be rectangular */
function sanitize(next){
  const d=merge(DEFAULTS,next);
  const chk=(o,path)=>{for(const k in o){const v=o[k];if(typeof v==='number'){if(!isFinite(v)||Math.abs(v)>1e6)throw new Error('Bad number at '+path+k);}else if(v&&typeof v==='object'&&!Array.isArray(v)&&k!=='maps')chk(v,path+k+'.');}};
  chk(d,'');
  const ids=Object.keys(d.maps||{});if(!ids.length)throw new Error('At least one map is required');
  for(const id of ids){const m=d.maps[id];if(!/^[a-z0-9_]{2,24}$/.test(id))throw new Error('Bad map id '+id);
    if(!Array.isArray(m.rows)||m.rows.length<12||m.rows.length>80)throw new Error('Map '+id+': 12 to 80 rows');
    const w=m.rows[0].length;if(w<16||w>120)throw new Error('Map '+id+': 16 to 120 columns');
    if(!m.rows.every(r=>typeof r==='string'&&r.length===w))throw new Error('Map '+id+': all rows must be the same width');
    if(!m.rows.every(r=>/^[.#xX~AFBZhawc]+$/.test(r)))throw new Error('Map '+id+': unknown tile character');
    const edge=m.rows[0]+m.rows[m.rows.length-1];if(/[^#X~]/.test(edge))throw new Error('Map '+id+': top and bottom rows must be solid');
    const text=m.rows.join('');if(!/A/.test(text)&&!/F/.test(text))throw new Error('Map '+id+': needs at least one spawn (A, B or F)');
    m.name=String(m.name||id).slice(0,40);m.desc=String(m.desc||'').slice(0,160);}
  d.mapOrder=(d.mapOrder||[]).filter(id=>d.maps[id]);ids.forEach(id=>{if(!d.mapOrder.includes(id))d.mapOrder.push(id);});
  for(const k of ['title','studio','tagline','motd','teamA','teamB','rules'])d.brand[k]=String(d.brand[k]).slice(0,k==='rules'||k==='motd'?400:80);
  for(const k of ['accent','accent2'])if(!/^#[0-9a-fA-F]{6}$/.test(d.brand[k]))throw new Error('Bad colour '+k);
  const num=(o,k,def)=>{if(typeof o[k]!=='number')o[k]=def;};
  for(const id in d.classes){const c=d.classes[id];if(!/^[a-z0-9_]{2,24}$/.test(id))throw new Error('Bad class id '+id);if(!['dash','cloak','surge','scan'].includes(c.ability))c.ability='dash';
    num(c,'hp',100);num(c,'speed',1);num(c,'cd',8);num(c,'dur',2);c.name=String(c.name||id).slice(0,24);c.desc=String(c.desc||'').slice(0,200);if(!/^#[0-9a-fA-F]{6}$/.test(c.color||''))c.color='#ffffff';
    if(!d.weapons[c.primary])c.primary=Object.keys(d.weapons)[0];if(c.hp<1)throw new Error('Class '+id+' needs hp >= 1');}
  for(const id in d.modes){const m=d.modes[id];if(!/^[a-z0-9_]{2,24}$/.test(id))throw new Error('Bad mode id '+id);if(!['tdm','ffa','zone'].includes(m.type))m.type=['tdm','ffa','zone'].includes(id)?id:'tdm';
    num(m,'scoreLimit',30);num(m,'timeLimit',300);m.name=String(m.name||id).slice(0,30);m.desc=String(m.desc||'').slice(0,160);if(m.type==='zone'){num(m,'zoneRadius',96);num(m,'zoneMove',40);}}
  if(!Object.keys(d.classes).length||!Object.keys(d.modes).length||!Object.keys(d.weapons).length)throw new Error('Need at least one weapon, class and mode');
  for(const id in d.weapons){const w=d.weapons[id];if(!/^[a-z0-9_]{2,24}$/.test(id))throw new Error('Bad weapon id '+id);num(w,'damage',10);num(w,'rpm',300);num(w,'mag',10);num(w,'reload',1.5);num(w,'spread',2);num(w,'range',600);num(w,'pellets',1);num(w,'moveSpeed',1);w.name=String(w.name||id).slice(0,24);if(!/^#[0-9a-fA-F]{6}$/.test(w.color||''))w.color='#ffffff';
    if(w.rpm<=0||w.mag<1||w.pellets<1)throw new Error('Weapon '+id+' has invalid rate/mag/pellets');}
  return d;
}
function set(next){cfg=sanitize(next);save();return cfg;}
/* what clients receive: everything except nothing secret (no PIN is ever stored here) */
function publicCfg(){const c=get();return{brand:c.brand,player:c.player,weapons:c.weapons,classes:c.classes,modes:c.modes,match:{countdown:c.match.countdown,maxPlayers:c.match.maxPlayers,botFill:c.match.botFill},music:c.music,mapList:c.mapOrder.map(id=>({id,name:c.maps[id].name,desc:c.maps[id].desc,w:c.maps[id].rows[0].length,h:c.maps[id].rows.length}))};}
load();
module.exports={get,set,save,load,publicCfg,DATA,DEFAULTS,sanitize};
