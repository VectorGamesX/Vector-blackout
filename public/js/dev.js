/* Developer console. Everything here is authorised server-side by the PIN-issued token; nothing in this file is trusted by the server. */
(()=>{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token=sessionStorage.getItem('vb_dev')||'',S=null,C=null,orig='',tab='dash',curMap='',tool='#',mirror=true,painting=false,undo=[];
const TABS=[['dash','Live'],['bal','Balance'],['maps','Maps'],['brand','Branding'],['music','Music'],['raw','Raw JSON']];
const TILES=[['.','Floor','#0b1220'],['#','Wall','#2d4470'],['x','Low cover','#7a6842'],['X','Container','#9a3f1e'],['~','Water','#06222e'],['A','Spawn A','#19e6ff'],['B','Spawn B','#ff9d1a'],['F','FFA spawn','#c9a7ff'],['Z','Zone point','#fff'],['h','Health','#ff4d6d'],['a','Armor','#19e6ff'],['w','Weapon','#ffd166'],['c','Ability reset','#8ff0c3']];
const ABIL=['dash','cloak','surge','scan'],THEMES=['neon','dock','city','bridge'];
function toast(m,bad){const t=$('#toast');t.textContent=m;t.className=bad?'bad':'';t.style.display='block';clearTimeout(toast.h);toast.h=setTimeout(()=>t.style.display='none',3200);}
async function api(path,method='GET',body,raw){
  const r=await fetch('/api/dev/'+path,{method,headers:Object.assign({Authorization:'Bearer '+token},raw?{'Content-Type':'application/octet-stream'}:body?{'Content-Type':'application/json'}:{}),body:raw?body:body?JSON.stringify(body):undefined});
  let j={};try{j=await r.json();}catch(e){}
  if(r.status===401&&path!=='login'){signOut();throw new Error('Signed out');}
  if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j;
}
function signOut(){token='';sessionStorage.removeItem('vb_dev');$('#app').style.display='none';$('#login').style.display='flex';}
async function login(){
  $('#err').textContent='';
  try{const j=await api('login','POST',{pin:$('#pin').value});token=j.token;sessionStorage.setItem('vb_dev',token);$('#pin').value='';await boot();}
  catch(e){$('#err').textContent=e.message;}
}
async function boot(){
  try{S=await api('state');}catch(e){return;}
  $('#login').style.display='none';$('#app').style.display='block';
  C=JSON.parse(JSON.stringify(S.config));orig=JSON.stringify(C);curMap=curMap&&C.maps[curMap]?curMap:C.mapOrder[0];
  buildNav();renderAll();
}
function buildNav(){$('#nav').innerHTML=TABS.map(([id,n])=>`<button data-t="${id}" class="${id===tab?'on':''}">${n}</button>`).join('');}
function show(id){tab=id;$$('section.tab').forEach(s=>s.classList.toggle('on',s.id==='t-'+id));buildNav();if(id==='dash')refreshLive();}
function dirty(){const d=JSON.stringify(C)!==orig;$('#dirty').textContent=d?'● unsaved changes':'';return d;}
function renderAll(){dashR();balR();mapsR();brandR();musicR();rawR();show(tab);dirty();}
/* ---------- path helpers ---------- */
const get=(o,p)=>p.split('.').reduce((a,k)=>a&&a[k],o);
function set(o,p,v){const k=p.split('.');const l=k.pop();const t=k.reduce((a,x)=>a[x],o);t[l]=v;}
const inp=(p,label,type='number',extra='')=>{const v=get(C,p);
  if(type==='bool')return`<label class="f">${label}<input type="checkbox" data-p="${p}" data-ty="bool" ${v?'checked':''}></label>`;
  if(type==='color')return`<label class="f">${label}<input type="color" data-p="${p}" data-ty="str" value="${esc(v||'#ffffff')}"></label>`;
  return`<label class="f ${extra}">${label}<input type="${type}" ${type==='number'?'step="any"':''} data-p="${p}" data-ty="${type==='number'?'num':'str'}" value="${esc(v)}"></label>`;};
const sel=(p,label,opts)=>`<label class="f">${label}<select data-p="${p}" data-ty="str">${opts.map(o=>`<option ${o===get(C,p)?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
document.addEventListener('input',e=>{
  const el=e.target;if(!el.dataset||!el.dataset.p)return;
  let v=el.dataset.ty==='bool'?el.checked:el.dataset.ty==='num'?(el.value===''?0:+el.value):el.value;
  set(C,el.dataset.p,v);dirty();
  if(el.dataset.p.startsWith('music.')&&tab==='music'&&el.type!=='text')musicR();
});
/* ---------- LIVE ---------- */
let liveTimer=0;
function dashR(){
  $('#t-dash').innerHTML=`${S.pinIsDefault?'<div class="warn"><b>Change the default PIN.</b> The server is running with PIN 8881. Set the <code>DEV_PIN</code> environment variable on your host to a longer secret before sharing the game publicly.</div>':''}
  <div class="card"><h3>Server</h3><div class="row"><span class="tag" id="d-on"></span><span class="tag" id="d-up"></span>
   <label class="row"><input type="checkbox" id="d-lock" ${S.locked?'checked':''}> Lock server (no new joins)</label></div></div>
  <div class="card"><h3>Announcements</h3><div class="row"><input id="d-msg" placeholder="Message to everyone in a match" style="flex:1;min-width:220px" maxlength="200"><button id="d-say">Broadcast now</button></div>
   <div class="row" style="margin-top:10px"><input id="d-ban" placeholder="Menu banner (shown on the main menu, empty to clear)" style="flex:1;min-width:220px" maxlength="200" value="${esc(S.banner)}"><button id="d-banbtn">Set banner</button></div></div>
  <div class="card"><h3>Rooms</h3><div id="d-rooms"></div></div>
  <div class="card"><h3>Banned IPs</h3><div id="d-bans"></div></div>`;
  liveFill();
}
function liveFill(){
  if(!$('#d-rooms'))return;
  $('#d-on').textContent=S.online+' online';$('#d-up').textContent='uptime '+Math.floor(S.uptime/3600)+'h '+Math.floor(S.uptime%3600/60)+'m';
  $('#d-rooms').innerHTML=S.rooms.length?S.rooms.map(r=>`<div class="item"><div class="hd"><b>${r.code}</b><span class="tag">${esc(r.mode)}</span><span class="tag">${esc(r.map)}</span><span class="tag">${r.phase}</span>${r.priv?'<span class="tag">private</span>':''}<span class="muted">${r.score?r.score.join(' - '):''} · ${r.tl}s left</span><span style="flex:1"></span>
    <select data-rm="${r.code}">${Object.keys(C.maps).map(m=>`<option ${m===r.map?'selected':''}>${m}</option>`).join('')}</select><button class="sm" data-act="restart" data-code="${r.code}">Restart</button><button class="sm" data-act="fill" data-code="${r.code}">Rebalance bots</button><button class="sm dan" data-act="closeRoom" data-code="${r.code}">Close</button></div>
    <table><tr><th>Player</th><th>Team</th><th>Class</th><th>K/D</th><th>IP</th><th></th></tr>${r.players.map(p=>`<tr><td>${esc(p.name)} ${p.bot?'<span class="tag">BOT</span>':''}${p.voice?' 🎤':''}</td><td>${p.team<0?'—':p.team===0?'A':'B'}</td><td>${esc(p.cls)}</td><td>${p.k}/${p.d}</td><td class="muted">${esc(p.ip)}</td><td>${p.bot?'':`<button class="sm" data-act="kick" data-id="${p.id}">Kick</button> <button class="sm dan" data-act="ban" data-id="${p.id}">Ban IP</button>`}</td></tr>`).join('')}</table></div>`).join(''):'<p class="muted">No active rooms. They appear when players join.</p>';
  $('#d-bans').innerHTML=S.bans.length?S.bans.map(ip=>`<div class="row">${esc(ip)} <button class="sm" data-act="unban" data-ip="${esc(ip)}">Unban</button></div>`).join(''):'<p class="muted">None.</p>';
}
async function refreshLive(){clearTimeout(liveTimer);if(tab!=='dash'||!token)return;try{const st=await api('state');S.rooms=st.rooms;S.online=st.online;S.bans=st.bans;S.uptime=st.uptime;S.locked=st.locked;if(!document.activeElement||document.activeElement.tagName!=='SELECT')liveFill();}catch(e){}liveTimer=setTimeout(refreshLive,2500);}
async function act(o){try{const j=await api('act','POST',o);S=Object.assign(S,j.state,{config:S.config});toast('Done');liveFill();}catch(e){toast(e.message,true);}}
/* ---------- BALANCE ---------- */
const WF=[['name','Name','text'],['damage','Damage'],['rpm','Rate (rpm)'],['mag','Magazine'],['reload','Reload (s)'],['spread','Spread (deg)'],['range','Range (px)'],['pellets','Pellets'],['moveSpeed','Move speed x'],['color','Colour','color']];
const CF=[['name','Name','text'],['hp','Health'],['speed','Speed x'],['cd','Ability cooldown (s)'],['dur','Ability duration (s)'],['radius','Scan radius'],['color','Colour','color']];
function balR(){
  const wp=Object.keys(C.weapons),cl=Object.keys(C.classes),md=Object.keys(C.modes);
  $('#t-bal').innerHTML=`
  <div class="card"><h3>Player</h3><div class="grid">${[['hp','Base health'],['armorMax','Max armour'],['speed','Move speed'],['radius','Hit radius'],['respawn','Respawn (s)'],['dashSpeed','Dash speed'],['vision','Vision range'],['hearing','Hearing / voice range'],['armorAbsorb','Armour absorb 0-1']].map(([k,l])=>inp('player.'+k,l)).join('')}</div></div>
  <div class="card"><h3>Match</h3><div class="grid">${[['countdown','Countdown (s)'],['endScreen','Results screen (s)'],['botSkill','Bot skill 0-1'],['botFill','Fill room to N players with bots'],['maxPlayers','Max humans per room'],['spawnProtect','Spawn protection (s)'],['pickupRespawn','Pickup respawn (s)'],['pickupHeal','Health pickup'],['pickupArmor','Armour pickup']].map(([k,l])=>inp('match.'+k,l)).join('')}</div></div>
  <div class="card"><h3>Weapons <button class="sm" data-add="weapon">+ New weapon</button></h3>${wp.map(id=>`<div class="item"><div class="hd"><b>${esc(id)}</b><label class="row muted"><input type="checkbox" data-p="weapons.${id}.auto" data-ty="bool" ${C.weapons[id].auto?'checked':''}> automatic</label><span style="flex:1"></span><button class="sm" data-clone="weapons.${id}">Clone</button><button class="sm dan" data-del="weapons.${id}">Delete</button></div><div class="grid">${WF.map(([k,l,t])=>inp(`weapons.${id}.${k}`,l,t||'number')).join('')}</div></div>`).join('')}</div>
  <div class="card"><h3>Classes <button class="sm" data-add="class">+ New class</button></h3>${cl.map(id=>`<div class="item"><div class="hd"><b>${esc(id)}</b><span style="flex:1"></span><button class="sm" data-clone="classes.${id}">Clone</button><button class="sm dan" data-del="classes.${id}">Delete</button></div><div class="grid">${CF.map(([k,l,t])=>inp(`classes.${id}.${k}`,l,t||'number')).join('')}${sel(`classes.${id}.ability`,'Ability',ABIL)}${sel(`classes.${id}.primary`,'Primary weapon',wp)}${inp(`classes.${id}.desc`,'Description','text','wide')}</div></div>`).join('')}</div>
  <div class="card"><h3>Game modes <button class="sm" data-add="mode">+ New mode</button></h3>${md.map(id=>`<div class="item"><div class="hd"><b>${esc(id)}</b><span style="flex:1"></span><button class="sm" data-clone="modes.${id}">Clone</button><button class="sm dan" data-del="modes.${id}">Delete</button></div><div class="grid">${inp(`modes.${id}.name`,'Name','text')}${sel(`modes.${id}.type`,'Rules',['tdm','ffa','zone'])}${inp(`modes.${id}.scoreLimit`,'Score limit')}${inp(`modes.${id}.timeLimit`,'Time limit (s)')}${inp(`modes.${id}.zoneRadius`,'Zone radius')}${inp(`modes.${id}.zoneMove`,'Zone moves every (s)')}${inp(`modes.${id}.desc`,'Description','text','wide')}</div></div>`).join('')}</div>`;
}
function uniq(base,obj){let i=2,id=base;while(obj[id])id=base+'_'+i++;return id;}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.t){show(b.dataset.t);return;}
  if(b.dataset.act){const o={a:b.dataset.act,code:b.dataset.code,id:+b.dataset.id||0,ip:b.dataset.ip};if(o.a==='restart'){const s=$(`select[data-rm="${o.code}"]`);o.map=s&&s.value;}
    if((o.a==='ban'||o.a==='closeRoom')&&!confirm('Are you sure?'))return;act(o);return;}
  if(b.dataset.clone){const [g,id]=b.dataset.clone.split('.'),nid=uniq(id+'_copy',C[g]);C[g][nid]=JSON.parse(JSON.stringify(C[g][id]));if(C[g][nid].name)C[g][nid].name+=' copy';balR();dirty();return;}
  if(b.dataset.del){const [g,id]=b.dataset.del.split('.');
    if(Object.keys(C[g]).length<2)return toast('Keep at least one',true);
    if(g==='weapons'&&Object.values(C.classes).some(c=>c.primary===id))return toast('A class uses this weapon as primary',true);
    if(!confirm('Delete '+id+'?'))return;delete C[g][id];balR();dirty();return;}
  if(b.dataset.add){const k=b.dataset.add;
    if(k==='weapon'){const id=uniq('new_weapon',C.weapons);C.weapons[id]={name:'New Weapon',damage:20,rpm:300,mag:15,reload:1.5,spread:2,range:700,pellets:1,auto:true,moveSpeed:1,color:'#ffffff'};}
    if(k==='class'){const id=uniq('new_class',C.classes);C.classes[id]={name:'New Class',desc:'Describe it.',hp:100,speed:1,primary:Object.keys(C.weapons)[0],ability:'dash',cd:8,dur:.2,color:'#ffffff'};}
    if(k==='mode'){const id=uniq('new_mode',C.modes);C.modes[id]={type:'tdm',name:'New Mode',desc:'Describe it.',team:true,scoreLimit:30,timeLimit:300};}
    balR();dirty();return;}
});
/* ---------- MAPS ---------- */
const CELL=16;
function mapsR(){
  const ids=C.mapOrder;
  $('#t-maps').innerHTML=`<div class="card"><h3>Maps &amp; rotation</h3><div class="row">${ids.map((id,i)=>`<button data-mp="${id}" class="${id===curMap?'pri':''}">${esc(C.maps[id].name)}</button>`).join('')}<button data-mact="new">+ Blank</button><button data-mact="gen">+ Generate</button></div>
  <p class="muted" style="margin:8px 0 0">Order above is the rotation. Maps rotate after each match. Edit a map, then press <b>Apply &amp; Publish</b>. Running matches switch on their next map.</p></div>
  <div class="card" id="mapcard"></div>`;
  mapEd();
}
function mapEd(){
  const m=C.maps[curMap];if(!m){$('#mapcard').innerHTML='';return;}
  const i=C.mapOrder.indexOf(curMap),w=m.rows[0].length,h=m.rows.length;
  $('#mapcard').innerHTML=`<div class="grid" style="margin-bottom:10px"><label class="f">Name<input data-mn="name" value="${esc(m.name)}" maxlength="40"></label><label class="f">Theme<select data-mn="theme">${THEMES.map(t=>`<option ${t===(m.theme||'neon')?'selected':''}>${t}</option>`).join('')}</select></label><label class="f wide">Description<input data-mn="desc" value="${esc(m.desc||'')}" maxlength="160"></label></div>
  <div class="row" style="margin-bottom:8px"><div class="pal">${TILES.map(([c,n,col])=>`<button data-tool="${c}" class="${c===tool?'on':''}"><i style="background:${col}"></i>${n}</button>`).join('')}</div></div>
  <div class="row" style="margin-bottom:8px"><label class="row"><input type="checkbox" id="mirror" ${mirror?'checked':''}> Mirror left ↔ right (keeps it fair)</label><button class="sm" data-mact="undo">Undo</button><button class="sm" data-mact="up">Move up in rotation</button><button class="sm" data-mact="down">Move down</button><button class="sm" data-mact="dup">Duplicate</button><button class="sm dan" data-mact="del">Delete map</button><span class="muted">${w}×${h} tiles</span></div>
  <div id="mapwrap"><canvas id="mapcv" width="${w*CELL}" height="${h*CELL}"></canvas></div>
  <p class="muted">Tips: border rows must stay solid. Spawn A (left team), B (right team), F (free-for-all). Put Zone points <b>Z</b> for Grid Control, and pickups wherever you want them. Containers and walls block sight; low cover blocks movement and bullets but not sight; water blocks movement only.</p>`;
  drawMap();
}
function drawMap(){
  const cv=$('#mapcv');if(!cv)return;const m=C.maps[curMap],x=cv.getContext('2d'),w=m.rows[0].length,h=m.rows.length,col=Object.fromEntries(TILES.map(t=>[t[0],t[2]]));
  x.fillStyle='#04070d';x.fillRect(0,0,cv.width,cv.height);
  for(let ty=0;ty<h;ty++)for(let tx=0;tx<w;tx++){const c=m.rows[ty][tx];x.fillStyle=col[c]||'#f0f';x.fillRect(tx*CELL,ty*CELL,CELL,CELL);
    if(c==='.'){x.strokeStyle='#0f1a2e';x.strokeRect(tx*CELL+.5,ty*CELL+.5,CELL-1,CELL-1);}
    else if('ABFZhawc'.includes(c)){x.fillStyle='#04101a';x.font='700 11px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(c,tx*CELL+CELL/2,ty*CELL+CELL/2+1);}}
  x.strokeStyle='#19e6ff55';x.beginPath();x.moveTo(w/2*CELL,0);x.lineTo(w/2*CELL,h*CELL);x.stroke();
}
function paint(ev){
  const cv=$('#mapcv'),r=cv.getBoundingClientRect(),m=C.maps[curMap],w=m.rows[0].length,h=m.rows.length;
  const tx=Math.floor((ev.clientX-r.left)/r.width*w),ty=Math.floor((ev.clientY-r.top)/r.height*h);
  if(tx<0||ty<0||tx>=w||ty>=h)return;
  const put=(x,y)=>{if(x<0||y<0||x>=w||y>=h)return;const row=m.rows[y];if(row[x]===tool)return;m.rows[y]=row.slice(0,x)+tool+row.slice(x+1);};
  put(tx,ty);if(mirror){const mx=w-1-tx,t0=tool;put(mx,ty);if(tool==='A'||tool==='B'){const t1=tool==='A'?'B':'A';const sv=tool;tool=t1;put(mx,ty);tool=sv;}}
  drawMap();dirty();
}
document.addEventListener('pointerdown',e=>{if(e.target.id==='mapcv'){undo.push(JSON.stringify(C.maps[curMap].rows));if(undo.length>40)undo.shift();painting=true;paint(e);e.target.setPointerCapture(e.pointerId);}});
document.addEventListener('pointermove',e=>{if(painting&&e.target.id==='mapcv')paint(e);});
document.addEventListener('pointerup',()=>painting=false);
document.addEventListener('change',e=>{
  if(e.target.id==='mirror'){mirror=e.target.checked;}
  if(e.target.dataset&&e.target.dataset.mn){C.maps[curMap][e.target.dataset.mn]=e.target.value;dirty();if(e.target.dataset.mn==='name')mapsR();}
  if(e.target.id==='d-lock')act({a:'lock',v:e.target.checked});
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.mp){curMap=b.dataset.mp;mapsR();}
  if(b.dataset.tool){tool=b.dataset.tool;$$('[data-tool]').forEach(x=>x.classList.toggle('on',x.dataset.tool===tool));}
  const a=b.dataset.mact;if(!a)return;const m=C.maps[curMap],i=C.mapOrder.indexOf(curMap);
  if(a==='undo'){const r=undo.pop();if(r){m.rows=JSON.parse(r);drawMap();dirty();}}
  if(a==='up'&&i>0){[C.mapOrder[i-1],C.mapOrder[i]]=[C.mapOrder[i],C.mapOrder[i-1]];mapsR();dirty();}
  if(a==='down'&&i<C.mapOrder.length-1){[C.mapOrder[i+1],C.mapOrder[i]]=[C.mapOrder[i],C.mapOrder[i+1]];mapsR();dirty();}
  if(a==='dup'){const id=uniq(curMap+'_copy',C.maps);C.maps[id]=JSON.parse(JSON.stringify(m));C.maps[id].id=id;C.maps[id].name+=' copy';C.mapOrder.push(id);curMap=id;mapsR();dirty();}
  if(a==='del'){if(C.mapOrder.length<2)return toast('Keep at least one map',true);if(!confirm('Delete this map?'))return;delete C.maps[curMap];C.mapOrder=C.mapOrder.filter(x=>x!==curMap);curMap=C.mapOrder[0];mapsR();dirty();}
  if(a==='new'||a==='gen'){
    let rows;
    if(a==='gen'){const seed=+prompt('Seed (any number)',String(1+(Math.random()*9999|0)));if(!seed)return;
      const water=+prompt('Water band thickness (0 for none)','0')||0;
      try{rows=(await api('genmap','POST',{seed,buildings:16,crates:20,water,tall:true,w:48,h:30})).rows;}catch(er){return toast(er.message,true);}}
    else{const w=48,h=30,pad=(c,n)=>c.repeat(n);rows=[];for(let y=0;y<h;y++){if(y===0||y===h-1){rows.push(pad('#',w));continue;}
        let r='#'+pad('.',w-2)+'#';if(y>=13&&y<=17)r=r.slice(0,2)+'A'+r.slice(3,w-3)+'B'+r.slice(w-2);rows.push(r);}}
    const id=uniq('map',C.maps);C.maps[id]={id,name:'New map',desc:'',theme:'neon',rows};C.mapOrder.push(id);curMap=id;mapsR();dirty();
  }
});
/* ---------- BRAND ---------- */
function brandR(){
  $('#t-brand').innerHTML=`<div class="card"><h3>Identity</h3><div class="grid">${inp('brand.title','Game title','text','wide')}${inp('brand.studio','Studio','text')}${inp('brand.accent','Accent A (team A / UI)','color')}${inp('brand.accent2','Accent B (team B)','color')}${inp('brand.teamA','Team A name','text')}${inp('brand.teamB','Team B name','text')}${inp('brand.tagline','Tagline','text','wide')}${inp('brand.motd','Message of the day (menu)','text','wide')}${inp('brand.rules','"How to play" intro text','text','wide')}</div></div>
  <div class="card"><h3>Danger zone</h3><div class="row"><button class="dan" id="rst-bal">Reset weapons / classes / modes to defaults</button><button class="dan" id="rst-maps">Reset maps to the three defaults</button></div><p class="muted">Resets apply immediately and live.</p></div>`;
}
document.addEventListener('click',async e=>{
  if(e.target.id==='rst-bal'||e.target.id==='rst-maps'){if(!confirm('Reset now? This publishes immediately.'))return;
    try{const j=await api('reset','POST',{what:e.target.id==='rst-maps'?'maps':'balance'});S.config=j.config;C=JSON.parse(JSON.stringify(j.config));orig=JSON.stringify(C);curMap=C.mapOrder[0];renderAll();toast('Reset');}catch(er){toast(er.message,true);}}
});
/* ---------- MUSIC ---------- */
function musicR(){
  const M=C.music;
  $('#t-music').innerHTML=`<div class="card"><h3>Background music</h3>
   <div class="row"><label class="row"><input type="checkbox" data-p="music.useSynth" data-ty="bool" ${M.useSynth?'checked':''}> Use the built-in generative synth soundtrack</label><span class="muted">(untick to play your uploaded tracks instead)</span></div>
   <label class="f" style="max-width:320px;margin-top:10px">Music volume<input type="range" min="0" max="1" step=".05" data-p="music.volume" data-ty="num" value="${M.volume}"></label></div>
  <div class="card"><h3>Playlist</h3>${M.tracks.length?M.tracks.map((t,i)=>`<div class="track"><b style="min-width:20px">${i+1}</b><input data-tn="${i}" value="${esc(t.name)}" style="width:200px"><select data-tw="${i}">${[['both','Menu + match'],['menu','Menu only'],['match','In match only']].map(([v,l])=>`<option value="${v}" ${t.where===v?'selected':''}>${l}</option>`).join('')}</select><audio controls preload="none" src="/music/${esc(t.file)}" style="height:34px"></audio><button class="sm" data-tm="up" data-i="${i}">↑</button><button class="sm" data-tm="down" data-i="${i}">↓</button><button class="sm dan" data-tm="del" data-i="${i}">Delete</button></div>`).join(''):'<p class="muted">No tracks uploaded. The synth soundtrack plays.</p>'}
   <div class="row" style="margin-top:12px"><input type="file" id="mfile" accept=".mp3,.ogg,.wav,.m4a,.webm,audio/*"><button class="pri" id="mup">Upload track</button><span class="muted">mp3 / ogg / wav / m4a, up to 25 MB. Uploads go live immediately.</span></div>
   <p class="muted">Only upload music you own or have a licence to use. Hosts with temporary disks lose uploads on redeploy: attach a persistent volume (see README).</p></div>`;
}
document.addEventListener('input',e=>{
  if(e.target.dataset&&e.target.dataset.tn!=null){C.music.tracks[+e.target.dataset.tn].name=e.target.value;dirty();}
  if(e.target.dataset&&e.target.dataset.tw!=null){C.music.tracks[+e.target.dataset.tw].where=e.target.value;dirty();}
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.id==='mup'){const f=$('#mfile').files[0];if(!f)return toast('Choose a file first',true);
    const ext=(f.name.split('.').pop()||'').toLowerCase();b.disabled=true;b.textContent='Uploading…';
    try{const buf=await f.arrayBuffer();const j=await api(`music?ext=${encodeURIComponent(ext)}&name=${encodeURIComponent(f.name.replace(/\.[^.]+$/,''))}`,'POST',buf,true);
      /* merge only the new track into the working copy so unsaved edits survive */
      const n=j.config.music.tracks.find(t=>!C.music.tracks.some(c=>c.id===t.id));if(n)C.music.tracks.push(n);S.config.music.tracks=j.config.music.tracks;orig=JSON.stringify(Object.assign(JSON.parse(orig),{music:j.config.music}));toast('Uploaded');musicR();dirty();}
    catch(er){toast(er.message,true);}b.disabled=false;b.textContent='Upload track';}
  if(b.dataset.tm){const i=+b.dataset.i,T=C.music.tracks;
    if(b.dataset.tm==='up'&&i>0)[T[i-1],T[i]]=[T[i],T[i-1]];
    if(b.dataset.tm==='down'&&i<T.length-1)[T[i+1],T[i]]=[T[i],T[i+1]];
    if(b.dataset.tm==='del'){if(!confirm('Delete this track from the server?'))return;try{const j=await api('music/'+T[i].id,'DELETE');T.splice(i,1);S.config.music=j.config.music;orig=JSON.stringify(Object.assign(JSON.parse(orig),{music:j.config.music}));toast('Deleted');}catch(er){return toast(er.message,true);}}
    musicR();dirty();}
});
/* ---------- RAW ---------- */
function rawR(){$('#t-raw').innerHTML=`<div class="card"><h3>Full configuration (advanced)</h3><p class="muted">Everything the game reads. Edit carefully; the server validates before applying. "Load into editor" pulls your edits back into the other tabs.</p><textarea id="raw" spellcheck="false">${esc(JSON.stringify(C,null,1))}</textarea><div class="row" style="margin-top:10px"><button id="rawload" class="pri">Load into editor</button><button id="rawfresh">Refresh from working copy</button></div></div>`;}
document.addEventListener('click',e=>{
  if(e.target.id==='rawload'){try{C=JSON.parse($('#raw').value);if(!C.maps[curMap])curMap=C.mapOrder[0];renderAll();toast('Loaded. Press Apply to publish.');}catch(er){toast('Invalid JSON: '+er.message,true);}}
  if(e.target.id==='rawfresh')rawR();
  if(e.target.id==='d-say'){const m=$('#d-msg').value.trim();if(m){act({a:'say',m});$('#d-msg').value='';}}
  if(e.target.id==='d-banbtn')act({a:'banner',m:$('#d-ban').value});
});
/* ---------- save ---------- */
async function save(){
  try{const j=await api('config','POST',{config:C});S.config=j.config;C=JSON.parse(JSON.stringify(j.config));orig=JSON.stringify(C);renderAll();toast('Published. Connected players got the update live.');}
  catch(er){toast(er.message,true);}
}
$('#go').onclick=login;$('#pin').onkeydown=e=>{if(e.key==='Enter')login();};
$('#save').onclick=save;$('#revert').onclick=()=>{C=JSON.parse(orig);curMap=C.maps[curMap]?curMap:C.mapOrder[0];renderAll();toast('Edits discarded');};$('#out').onclick=signOut;
addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'&&token){e.preventDefault();save();}});
addEventListener('beforeunload',e=>{if(token&&C&&JSON.stringify(C)!==orig){e.preventDefault();e.returnValue='';}});
if(token)boot();
})();
