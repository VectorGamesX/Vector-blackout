/* UI: menus, HUD, scoreboard, chat, touch + keyboard/mouse input, main loop, boot. */
const UI=(()=>{
  const U={};
  let SEL={name:'',cls:'',mode:'',map:''};try{Object.assign(SEL,JSON.parse(localStorage.getItem('vb_sel')||'{}'));}catch(e){}
  if(!SEL.name)SEL.name='Op'+(100+(Math.random()*899|0));
  const saveSel=()=>{try{localStorage.setItem('vb_sel',JSON.stringify(SEL));}catch(e){}};
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cache={};const setT=(id,v)=>{if(cache[id]!==v){cache[id]=v;const el=$('#'+id);if(el)el.textContent=v;}};
  const show=(id,on)=>{const el=$('#'+id);if(el)el.hidden=!on;};
  const nm=id=>{const r=G.roster.get(id);return r?r.n:'?';};
  /* ---------- theme / menu ---------- */
  U.theme=()=>{const b=G.cfg.brand,r=document.documentElement.style;r.setProperty('--a',b.accent);r.setProperty('--b',b.accent2);
    $('#mTitle').textContent=b.title;$('#mStudio').textContent=b.studio.toUpperCase();$('#mTag').textContent=b.tagline;$('#mMotd').textContent=b.motd;document.title=b.title;
    $('#nmA').textContent=b.teamA;$('#nmB').textContent=b.teamB;$('#howRules').textContent=b.rules;};
  U.conn=ok=>{const st=$('#sstat');if(st)st.textContent=ok?'Connected to server':'Cannot reach the game server yet… retrying. (This game needs its Node server running; see README.)';$('#mDot').classList.toggle('on',ok);if(!ok)setT('mOnline','reconnecting…');};
  U.menuUpdate=()=>{
    const c=G.cfg;if(!c)return;
    const cl=Object.keys(c.classes),md=Object.keys(c.modes),mp=c.mapList;
    if(!c.classes[SEL.cls])SEL.cls=cl[0];if(!c.modes[SEL.mode])SEL.mode=md[0];if(SEL.map&&!mp.some(m=>m.id===SEL.map))SEL.map='';
    $('#mName').value=$('#mName').value||SEL.name;
    const cards=$('#mClasses');cards.innerHTML=cl.map(id=>{const k=c.classes[id];return`<div class="card${id===SEL.cls?' sel':''}" data-c="${esc(id)}" style="--c:${esc(k.color||'#19e6ff')};color:${esc(k.color||'#19e6ff')}"><i></i><div class="nm" style="color:#fff">${esc(k.name)}</div><div class="ab">${esc((k.ability||'').toUpperCase())}</div></div>`;}).join('')+`<div class="cdesc" style="grid-column:1/-1" id="cdesc"></div>`;
    $('#cdesc').textContent=(c.classes[SEL.cls]||{}).desc||'';
    $('#mModes').innerHTML=md.map(id=>`<div class="pill${id===SEL.mode?' sel':''}" data-m="${esc(id)}" title="${esc(c.modes[id].desc||'')}">${esc(c.modes[id].name.toUpperCase())}</div>`).join('');
    $('#mMaps').innerHTML=`<div class="pill${!SEL.map?' sel':''}" data-p="">ANY</div>`+mp.map(m=>`<div class="pill${m.id===SEL.map?' sel':''}" data-p="${esc(m.id)}" title="${esc(m.desc)}">${esc(m.name.toUpperCase())}</div>`).join('');
    setT('mOnline',G.online+' operator'+(G.online===1?'':'s')+' online');
    const b=$('#mBanner');b.hidden=!G.banner;b.textContent=G.banner;
    $('#mMotd').hidden=!G.cfg.brand.motd;
    pauseClasses();
  };
  function pauseClasses(){
    const c=G.cfg;if(!c)return;const html=Object.keys(c.classes).map(id=>`<div class="pill${id===SEL.cls?' sel':''}" data-pc="${esc(id)}" style="${id===SEL.cls?'':'color:'+esc(c.classes[id].color||'#fff')}">${esc(c.classes[id].name.toUpperCase())}</div>`).join('');
    $('#pauseCls').innerHTML=html;$('#dCls').innerHTML=html;
  }
  U.toast=m=>{const d=document.createElement('div');d.id='toastG';d.textContent=m;document.body.appendChild(d);setTimeout(()=>d.remove(),2800);};
  U.busy=b=>{$$('#bQuick,#bCreate,#bJoin').forEach(x=>x.disabled=b);};
  U.typing=()=>document.activeElement===$('#chatIn');
  U.banner=(t,s)=>{const c=$('#centerMsg');c.innerHTML=`<div class="cmsg">${esc(t)}${s?`<small>${esc(s)}</small>`:''}</div>`;};
  /* ---------- flow ---------- */
  U.enterGame=()=>{
    G.state='play';document.body.classList.add('playing');
    $('#splash').classList.remove('on');$('#menu').classList.remove('on');$('#hud').classList.add('on');
    show('pause',false);show('settings',false);show('how',false);show('endScreen',false);show('dead',false);show('board',false);
    $('#killfeed').innerHTML='';$('#chatLog').innerHTML='';U.busy(false);AUD.setMode('match');R.resize();
    $('#hRoom').textContent=G.priv?'ROOM '+G.room:'';
    const mo=G.cfg.modes[G.modeId];$('#hMode').textContent=(mo?mo.name:'').toUpperCase();
    const ffa=!G.modeIsTeam();$('#hudTop').classList.toggle('ffa',ffa);$('#nmA').textContent=ffa?'YOU':G.cfg.brand.teamA;$('#nmB').textContent=ffa?'LEADER':G.cfg.brand.teamB;
    U.sysMsg('You are in '+(G.map.name)+(G.priv?' · room code '+G.room:''));
    if(G.modeIsTeam())U.sysMsg('You are on team '+(G.team===0?G.cfg.brand.teamA:G.cfg.brand.teamB));
    lastCount=-1;
  };
  U.toMenu=(msg)=>{
    if(G.state==='play')send({t:'leave'});VOICE.disable();VOICE.leaveRoom();
    G.state='menu';document.body.classList.remove('playing');$('#hud').classList.remove('on');$('#menu').classList.add('on');
    ['pause','settings','how'].forEach(i=>show(i,false));U.busy(false);AUD.setMode('menu');U.menuUpdate();if(msg)U.toast(msg);
  };
  function join(extra){
    if(!G.ws||G.ws.readyState!==1){U.toast('Connecting to server…');connect();return;}
    SEL.name=$('#mName').value.trim()||SEL.name;saveSel();U.busy(true);AUD.play('click');
    send({t:'join',name:SEL.name,cls:SEL.cls,mode:SEL.mode,map:SEL.map||undefined,...extra});
    setTimeout(()=>U.busy(false),4000);
  }
  /* ---------- chat / feed ---------- */
  U.chatMsg=m=>{const d=document.createElement('div');d.className='cm';d.innerHTML=`<b style="color:${esc(teamCol(m.tm))}">${m.team?'[TEAM] ':''}${esc(m.n)}</b>${esc(m.m)}`;$('#chatLog').appendChild(d);trim('#chatLog',7);AUD.play('ping');};
  U.sysMsg=(t,big)=>{const d=document.createElement('div');d.className='cm sys'+(big?' big':'');d.textContent=t;$('#chatLog').appendChild(d);trim('#chatLog',7);if(big){U.banner('ANNOUNCEMENT',t);}};
  function trim(sel,n){const e=$(sel);while(e.children.length>n)e.firstChild.remove();setTimeout(()=>{try{if(e.contains(e.firstChild)&&e.children.length>0&&e.firstChild.className.indexOf('cm')>=0&&getComputedStyle(e.firstChild).opacity==='0')e.firstChild.remove();}catch(x){}},13000);}
  U.killFeed=e=>{
    const k=document.createElement('div'),a=G.roster.get(e.a),v=G.roster.get(e.v),w=G.cfg.weapons[e.w];
    k.className='kf'+(e.a===G.you?' me':'');
    k.innerHTML=`<span style="color:${a?teamCol(a.t):'#fff'}">${a?esc(a.n):'—'}</span><em>${w?esc(w.name):''}</em><span style="color:${v?teamCol(v.t):'#fff'}">${v?esc(v.n):'?'}</span>`;
    $('#killfeed').appendChild(k);trim('#killfeed',5);setTimeout(()=>k.remove(),6000);
    if(e.a===G.you&&e.v!==G.you)U.banner('ELIMINATED',v?v.n:'');
  };
  U.died=e=>{G.diedBy=e.a;show('dead',true);const a=G.roster.get(e.a);$('#dBy').textContent=e.a===G.you?'Self-inflicted':'Taken out by '+(a?a.n:'unknown')+(G.cfg.weapons[e.w]?' · '+G.cfg.weapons[e.w].name:'');};
  U.rosterChanged=()=>{if(!$('#board').hidden)board();voiceList();};
  U.matchEnd=e=>{
    const cfg=G.cfg,B=cfg.brand,team=G.modeIsTeam();let head,col='#fff';
    if(team){if(e.win===-1){head='DRAW';}else{head=(e.win===0?B.teamA:B.teamB)+' WINS';col=teamCol(e.win);AUD.play(e.win===G.team?'win':'lose');}}
    else{const w=G.roster.get(e.win);head=(e.win===G.you?'YOU WIN':(w?w.n:'?')+' WINS');col='#ffd166';AUD.play(e.win===G.you?'win':'lose');}
    const rows=e.rows.map((r,i)=>`<tr class="${r.i===G.you?'me':''}"><td>${i+1}</td><td style="color:${team?teamCol(r.t):'#fff'}">${esc(r.n)}${r.b?' <small style="color:#667">BOT</small>':''}</td><td class="n">${r.k}</td><td class="n">${r.d}</td></tr>`).join('');
    const sc=team?`<div style="font:800 28px var(--fd);margin-bottom:8px"><span style="color:${B.accent}">${e.score[0]}</span> <span style="color:#667">—</span> <span style="color:${B.accent2}">${e.score[1]}</span></div>`:'';
    const nm=(cfg.mapList.find(m=>m.id===e.next)||{}).name||'';
    $('#endScreen').innerHTML=`<div class="winner" style="color:${col}">${esc(head)}</div>${sc}<div class="tbl"><table><tr><th>#</th><th>OPERATOR</th><th class="n">K</th><th class="n">D</th></tr>${rows}</table></div><div class="nextmap">NEXT MAP · ${esc(nm.toUpperCase())}</div>`;
    show('endScreen',true);show('dead',false);
  };
  function board(){
    const team=G.modeIsTeam(),list=[...G.roster.values()].sort((a,b)=>b.k-a.k||a.d-b.d),B=G.cfg.brand;
    const tbl=(title,col,ps)=>`<div class="tbl" style="margin-bottom:8px"><h3 style="color:${col}">${esc(title)}</h3><table><tr><th>OPERATOR</th><th class="n">K</th><th class="n">D</th></tr>${ps.map(p=>`<tr class="${p.i===G.you?'me':''}"><td>${esc(p.n)}${p.b?' <small style="color:#667">BOT</small>':''}${p.v?' 🎤':''} <small style="color:${esc((G.cfg.classes[p.c]||{}).color||'#889')}">${esc(((G.cfg.classes[p.c]||{}).name||'').toUpperCase())}</small></td><td class="n">${p.k}</td><td class="n">${p.d}</td></tr>`).join('')}</table></div>`;
    $('#board').innerHTML=team?tbl(B.teamA,B.accent,list.filter(p=>p.t===0))+tbl(B.teamB,B.accent2,list.filter(p=>p.t===1)):tbl('FREE FOR ALL','#fff',list);
  }
  U.board=on=>{if(on)board();show('board',on&&G.state==='play');};
  function voiceList(){
    const sp=[...VOICE.speaking].map(id=>`<div class="vl">🎤 ${esc(nm(id))}</div>`).join('');
    $('#voiceList').innerHTML=(VOICE.talking&&VOICE.on?`<div class="vl" style="border-color:var(--a)">🎤 You</div>`:'')+sp;
    const mb=$('#bMic');mb.classList.toggle('on',VOICE.on);mb.classList.toggle('talk',VOICE.on&&VOICE.talking);mb.title=VOICE.on?'Leave voice chat':'Join voice chat';
    $('#sVoiceBtn').textContent=VOICE.on?'LEAVE VOICE':'JOIN VOICE';$('#vStatus').textContent=VOICE.err||(VOICE.on?(VOICE.micOK?'Voice connected. Teammates always audible, enemies only up close.':'Listening only.'):'Voice is off.');
  }
  VOICE.listeners.push(voiceList);
  /* ---------- HUD per frame ---------- */
  let lastCount=-1;
  function hud(){
    const me=G.me,cfg=G.cfg,cl=cfg.classes[me.cls]||{},w=cfg.weapons[me.wid]||{reload:1,mag:1,name:''},maxHp=cl.hp||100;
    const hf=$('#hpF');hf.style.transform='scaleX('+Math.max(0,Math.min(1,me.hp/maxHp))+')';setT('hpT',Math.max(0,me.hp));
    $('#arF').style.transform='scaleX('+Math.max(0,Math.min(1,me.ar/cfg.player.armorMax))+')';setT('arT',me.ar);
    setT('hCls',(cl.name||'').toUpperCase());setT('wName',w.name);setT('wAm',me.rl>0?'···':me.am);setT('wMag','/ '+w.mag);$('#wAm').classList.toggle('low',me.am<=Math.ceil(w.mag*.25));
    $('#rlF').style.width=me.rl>0?(100-me.rl/w.reload*100)+'%':'0';
    const ab=$('#abil'),act=me.at>0,fr=act?me.at/(cl.dur||1):1-(me.abCD/(cl.cd||1));
    $('#abArc').style.strokeDashoffset=(119.4*(act?1-fr:1-Math.max(0,Math.min(1,fr)))).toFixed(1);ab.classList.toggle('ready',!act&&me.abCD<=0);ab.classList.toggle('active',act);setT('abName',(cl.ability||'').toUpperCase());
    const t=Math.max(0,G.tl|0);setT('hTime',G.phase==='countdown'?'—':Math.floor(t/60)+':'+String(t%60).padStart(2,'0'));
    if(G.modeIsTeam()){setT('scA',G.sc[0]);setT('scB',G.sc[1]);}
    else{let lead=0;for(const p of G.roster.values())lead=Math.max(lead,p.k);setT('scA',me.k);setT('scB',lead);}
    setT('pingTag',G.ping?G.ping+' ms':'');
    show('dead',!me.al&&G.phase!=='end'&&G.phase!=='countdown_');
    if(!me.al&&G.phase!=='end')setT('dCount',Math.ceil(Math.max(0,me.rs))||'…');
    if(G.phase==='countdown'){const n=Math.ceil(G.pt);if(n!==lastCount&&n>0){lastCount=n;U.banner(String(n),'GET READY');AUD.play('beep',false);}}
  }
  /* ---------- input ---------- */
  const keys={},touch={mx:0,my:0,ax:0,ay:0,aim:false,fire:false};
  function readInput(){
    const typing=U.typing()||!$('#pause').hidden||!$('#settings').hidden||!$('#how').hidden;
    let mx=0,my=0;
    if(!typing){mx=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);my=(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0);}
    if(touch.mx||touch.my){mx=touch.mx;my=touch.my;}
    INP.mx=mx;INP.my=my;
    if(touch.aim){INP.a=touch.aa;INP.fire=touch.fire?1:0;}
    else if(INP.sx!=null){const p=R.screenToWorld(INP.sx,INP.sy);INP.a=Math.atan2(p.y-G.me.y,p.x-G.me.x);INP.fire=(INP.mouse&&!typing)?1:0;}
    if(typing&&!touch.aim)INP.fire=0;
  }
  function setupInput(){
    const isTouch=matchMedia('(pointer:coarse)').matches||'ontouchstart' in window;if(isTouch)document.body.classList.add('touch');
    addEventListener('keydown',e=>{
      if(G.state!=='play')return;
      if(U.typing()){if(e.key==='Enter'){const v=$('#chatIn').value.trim();if(v)send({t:'chat',m:v});$('#chatIn').value='';$('#chatIn').hidden=true;$('#chatIn').blur();e.preventDefault();}
        else if(e.key==='Escape'){$('#chatIn').value='';$('#chatIn').hidden=true;$('#chatIn').blur();}return;}
      if(e.target&&e.target.tagName==='INPUT')return;
      if(e.code==='Tab'){e.preventDefault();U.board(true);return;}
      if(e.code==='Escape'){togglePause();return;}
      if(e.code==='Enter'){const c=$('#chatIn');c.hidden=false;c.focus();e.preventDefault();return;}
      if(e.repeat)return;keys[e.code]=true;
      if(e.code==='Space'||e.code==='ShiftLeft'||e.code==='KeyE'){INP.ab=true;e.preventDefault();}
      else if(e.code==='KeyR')INP.rl=true;else if(e.code==='KeyV')VOICE.ptt(true);
    });
    addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='Tab'){U.board(false);e.preventDefault();}if(e.code==='KeyV')VOICE.ptt(false);});
    addEventListener('blur',()=>{for(const k in keys)keys[k]=false;INP.mouse=false;VOICE.ptt(false);});
    const cv=$('#game');
    cv.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;INP.sx=e.clientX;INP.sy=e.clientY;});
    cv.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;INP.sx=e.clientX;INP.sy=e.clientY;if(e.button===0)INP.mouse=true;if(e.button===2)INP.ab=true;AUD.unlock();});
    addEventListener('pointerup',e=>{if(e.button===0)INP.mouse=false;});
    cv.addEventListener('contextmenu',e=>e.preventDefault());
    /* sticks */
    const stick=(el,cb)=>{let id=null;const knob=$('i',el),R0=56;
      const move=e=>{const r=el.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),l=Math.hypot(dx,dy),k=Math.min(1,l/R0);
        knob.style.transform=`translate(${dx/(l||1)*Math.min(l,R0)}px,${dy/(l||1)*Math.min(l,R0)}px)`;cb(dx/(l||1)*k,dy/(l||1)*k,k,Math.atan2(dy,dx));};
      el.addEventListener('pointerdown',e=>{id=e.pointerId;el.setPointerCapture(id);move(e);AUD.unlock();e.preventDefault();});
      el.addEventListener('pointermove',e=>{if(e.pointerId===id)move(e);});
      const end=e=>{if(e.pointerId!==id)return;id=null;knob.style.transform='';cb(0,0,0,0,true);};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);};
    stick($('#stL'),(x,y)=>{touch.mx=x;touch.my=y;});
    stick($('#stR'),(x,y,k,a,end)=>{if(end){touch.fire=false;return;}touch.aim=true;touch.aa=a;touch.fire=k>.45;});
    const tap=(id,fn,up)=>{const b=$(id);b.addEventListener('pointerdown',e=>{fn();e.preventDefault();});if(up)['pointerup','pointercancel','pointerleave'].forEach(ev=>b.addEventListener(ev,up));};
    tap('#tAb',()=>INP.ab=true);tap('#tRl',()=>INP.rl=true);tap('#tSb',()=>U.board(true),()=>U.board(false));tap('#tMic',()=>VOICE.ptt(true),()=>VOICE.ptt(false));
  }
  function togglePause(){const p=$('#pause');if(!p.hidden){p.hidden=true;return;}p.hidden=false;}
  /* ---------- wiring ---------- */
  function wire(){
    $('#enter').onclick=()=>{AUD.unlock();AUD.play('shine');AUD.setMode('menu');$('#splash').classList.remove('on');$('#menu').classList.add('on');G.state='menu';};
    $('#mClasses').onclick=e=>{const c=e.target.closest('[data-c]');if(!c)return;SEL.cls=c.dataset.c;saveSel();AUD.play('click');U.menuUpdate();};
    $('#mModes').onclick=e=>{const c=e.target.closest('[data-m]');if(!c)return;SEL.mode=c.dataset.m;saveSel();AUD.play('click');U.menuUpdate();};
    $('#mMaps').onclick=e=>{const c=e.target.closest('[data-p]');if(!c)return;SEL.map=c.dataset.p;saveSel();AUD.play('click');U.menuUpdate();};
    const pickCls=e=>{const c=e.target.closest('[data-pc]');if(!c)return;SEL.cls=c.dataset.pc;saveSel();send({t:'cls',c:SEL.cls});pauseClasses();AUD.play('click');U.toast('Class applies on respawn');};
    $('#pauseCls').onclick=pickCls;$('#dCls').onclick=pickCls;
    $('#bQuick').onclick=()=>join({});$('#bCreate').onclick=()=>join({create:true});
    $('#bJoin').onclick=()=>{const c=$('#mCode').value.trim();if(c.length<4)return U.toast('Enter the 4-letter room code');join({room:c});};
    $('#mCode').oninput=e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z]/g,'');};
    $('#mCode').onkeydown=e=>{if(e.key==='Enter')$('#bJoin').click();};
    $('#bSet').onclick=()=>{show('settings',true);syncSettings();};$('#bHow').onclick=()=>show('how',true);$('#hClose').onclick=()=>show('how',false);
    $('#bPause').onclick=togglePause;$('#pResume').onclick=()=>show('pause',false);$('#pSet').onclick=()=>{show('settings',true);syncSettings();};$('#pLeave').onclick=()=>U.toMenu();
    $('#sClose').onclick=()=>show('settings',false);
    $('#sMusic').oninput=e=>AUD.vol('music',+e.target.value);$('#sSfx').oninput=e=>{AUD.vol('sfx',+e.target.value);AUD.play('click');};$('#sVoice').oninput=e=>VOICE.setVol(+e.target.value);
    $('#sOpen').onchange=e=>VOICE.setOpen(e.target.checked);
    const vt=()=>{if(G.state!=='play'){U.toast('Join a match first, then enable voice');return;}VOICE.on?VOICE.disable():VOICE.enable();};
    $('#sVoiceBtn').onclick=vt;$('#bMic').onclick=vt;
    $('#mName').oninput=e=>{SEL.name=e.target.value;saveSel();};
    $('#board').addEventListener('pointerdown',()=>U.board(false));
  }
  function syncSettings(){$('#sMusic').value=AUD.S.music;$('#sSfx').value=AUD.S.sfx;$('#sVoice').value=VOICE.vol;$('#sOpen').checked=VOICE.open;voiceList();}
  /* ---------- loop + boot ---------- */
  let last=performance.now(),bg=null;
  function loop(t){
    requestAnimationFrame(loop);const dt=Math.min(.1,(t-last)/1000);last=t;
    if(G.state==='play'){readInput();inputTick(dt);R.frame(dt,t);hud();}
    else{if(!bg)return;const w=innerWidth,h=innerHeight;if(bg.width!==w||bg.height!==h){bg.width=w;bg.height=h;}R.menuBg(bg,w,h,t);}
  }
  U.boot=()=>{
    const bt=$('#boot');if(bt)bt.remove();bg=$('#bg');R.init();if(location.protocol==='file:')$('#sstat').textContent='You opened this as a file. Open the game from its server address instead.';wire();setupInput();
    G.cfg={brand:{title:'VECTOR: BLACKOUT',studio:'VectorGamex',tagline:'',motd:'',accent:'#19e6ff',accent2:'#ff9d1a',teamA:'MAINLAND',teamB:'ISLAND',rules:''},weapons:{},classes:{},modes:{},player:{},music:{},mapList:[]};
    document.body.addEventListener('pointerdown',()=>AUD.unlock(),{once:true});
    connect();requestAnimationFrame(loop);
    $('#mName').value=SEL.name;
  };
  return U;
})();
UI.boot();
