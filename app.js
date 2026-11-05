(()=>{'use strict';
const $=id=>document.getElementById(id), query=new URLSearchParams(location.search), isAdmin=query.has('leitung'), STORAGE='strommarkt-dayahead-v1', endpoint=window.STROMMARKT_ENDPOINT||'';
const fresh=()=>({players:{},admins:{},activePlayer:'',activeAdmin:'',instructorKey:''});
let stored;try{stored={...fresh(),...JSON.parse(localStorage.getItem(STORAGE)||'{}')};}catch(_){stored=fresh();}
const fragment=new URLSearchParams(location.hash.slice(1)),incomingKey=fragment.get('key')||'';
if(isAdmin&&/^[a-f0-9]{48}$/.test(incomingKey)){stored.instructorKey=incomingKey;localStorage.setItem(STORAGE,JSON.stringify(stored));}
const room=(query.get('raum')||'').toUpperCase();
let code=isAdmin?stored.activeAdmin:stored.activePlayer,token=code?(isAdmin?stored.admins[code]:stored.players[code]):'',state=null,busy=false,lastNotice='',lastRound=null;
const persist=()=>localStorage.setItem(STORAGE,JSON.stringify(stored));
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
const visible=(id,yes)=>$(id).classList.toggle('hidden',!yes);
const money=x=>x===null||x===undefined?'–':`${x} €/MWh`;
function notice(message){lastNotice=message||'';$('notice').textContent=lastNotice;visible('notice',Boolean(lastNotice));}
let serial=0;
function api(action,payload){return new Promise((resolve,reject)=>{
 if(!endpoint){reject(new Error('Die Verbindung zum Spielserver ist noch nicht eingerichtet.'));return;}
 const callback=`strommarkt_${Date.now()}_${++serial}`,script=document.createElement('script'),url=new URL(endpoint),timer=setTimeout(()=>finish(false,'Der Spielserver antwortet nicht. Bitte erneut versuchen.'),40000);let done=false;
 function finish(ok,value){if(done)return;done=true;clearTimeout(timer);script.remove();delete window[callback];ok?resolve(value):reject(new Error(value||'Verbindung fehlgeschlagen.'));}
 window[callback]=r=>r&&r.ok?finish(true,r.data):finish(false,r&&r.error);
 url.searchParams.set('callback',callback);url.searchParams.set('action',action);url.searchParams.set('payload',JSON.stringify(payload));script.src=url.toString();script.onerror=()=>finish(false,'Der Spielserver ist nicht erreichbar.');document.head.append(script);
});}
async function action(name,extra={}){
 if(busy)return null;busy=true;document.querySelectorAll('button[type=submit],#start-round,#close-round').forEach(b=>b.disabled=true);
 try{const result=await api(name,{code,token,...extra});state=result;notice('');render();return result;}
 catch(e){notice(e.message);return null;}
 finally{busy=false;document.querySelectorAll('button[type=submit],#start-round,#close-round').forEach(b=>b.disabled=false);if(state)render();}
}
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;}
function addRow(parent,cells){const tr=el('tr');cells.forEach(v=>tr.appendChild(el('td','',String(v))));parent.appendChild(tr);}
function renderHistory(s){const hist=$('history');hist.replaceChildren();const mine=s.me?s.me.results:[];
 s.history.forEach(h=>{const own=mine.find(r=>r.round===h.round);let personal=isAdmin?`${h.submitted} Gebote`:own?(own.matched?`${own.points>=0?'+':''}${own.points} Punkte`:'Kein Handel'):'–';addRow(hist,[h.round,h.price===null?'Kein Handel':money(h.price),`${h.quantity} MWh`,personal]);});
 $('personal-heading').textContent=isAdmin?'Abgaben':'Dein Ergebnis';visible('history-panel',s.history.length>0);
}
function drawChart(data,mode){const holder=$('chart');holder.replaceChildren();const buyers=data.filter(x=>x.role==='Kauf').map(x=>x.value).sort((a,b)=>b-a),sellers=data.filter(x=>x.role==='Verkauf').map(x=>x.value).sort((a,b)=>a-b), xmax=Math.max(buyers.length,sellers.length,1),ymax=Math.ceil(Math.max(160,...buyers,...sellers)/20)*20;
 const NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 640 320');svg.setAttribute('aria-hidden','true');
 const l=54,r=605,t=18,b=264,x=n=>l+(r-l)*n/xmax,y=v=>b-(b-t)*v/ymax;
 function element(name,attrs,text){const e=document.createElementNS(NS,name);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text!==undefined)e.textContent=text;svg.appendChild(e);return e;}
 for(let v=0;v<=ymax;v+=40){element('line',{x1:l,y1:y(v),x2:r,y2:y(v),stroke:'#e5eeee'});element('text',{x:l-9,y:y(v)+4,'text-anchor':'end',fill:'#6d8283','font-size':12},String(v));}
 element('line',{x1:l,y1:b,x2:r,y2:b,stroke:'#597477','stroke-width':1.2});element('line',{x1:l,y1:b,x2:l,y2:t,stroke:'#597477','stroke-width':1.2});
 function steps(vals,color){if(!vals.length)return;let pts=`${x(0)},${y(vals[0])}`;vals.forEach((v,i)=>{pts+=` ${x(i+1)},${y(v)}`;if(i+1<vals.length)pts+=` ${x(i+1)},${y(vals[i+1])}`;});element('polyline',{points:pts,fill:'none',stroke:color,'stroke-width':3,'stroke-linejoin':'round'});}
 steps(buyers,'#007f96');steps(sellers,'#d07742');
 const ticks=Math.min(5,xmax);for(let i=0;i<=ticks;i++){const v=Math.round(i*xmax/ticks);element('text',{x:x(v),y:b+19,'text-anchor':'middle',fill:'#6d8283','font-size':12},String(v));}
 element('text',{x:(l+r)/2,y:310,'text-anchor':'middle',fill:'#526c6e','font-size':13},'Menge (MWh)');element('text',{x:l,y:12,fill:'#526c6e','font-size':12},'€/MWh');holder.appendChild(svg);
 let k=0;while(k<buyers.length&&k<sellers.length&&buyers[k]>=sellers[k])k++;
 if(mode!=='values'){const h=state.history.find(x=>x.round===Number(mode));$('benchmark').textContent=h&&h.price!==null?`Runde ${mode}: ${h.quantity} MWh zu ${h.price} €/MWh.`:`Runde ${mode}: kein Handel.`;return;}
 if(k){const lower=Math.max(sellers[k-1],k<buyers.length?buyers[k]:-Infinity),upper=Math.min(buyers[k-1],k<sellers.length?sellers[k]:Infinity);$('benchmark').textContent=`Theoretisch vorteilhafte Handelsmenge: ${k} MWh · Preisintervall: ${lower}–${upper} €/MWh.`;}
 else $('benchmark').textContent='Bei diesen privaten Werten gibt es keinen beidseitig vorteilhaften Handel.';
}
function render(){
 visible('join',!code&&!isAdmin);visible('admin-create',!code&&isAdmin);visible('game',Boolean(code&&state));if(!state||!code)return;
 const s=state;$('session-code').textContent=s.code;visible('share',isAdmin&&s.status==='lobby');
 if(isAdmin){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('raum',s.code);$('room-link').href=url.href;$('room-link').textContent=url.href;}
 $('round-caption').textContent=s.round?`Runde ${s.round} von 5`:'Markt';
 let title;if(s.status==='lobby')title=isAdmin?'Warten auf Teilnehmende':'Du bist dabei';
 else if(s.status==='open')title=isAdmin?'Auktion läuft':'Dein Gebot für 1 MWh';
 else if(s.status==='review')title=`Runde ${s.round} ausgewertet`;
 else title='Spiel beendet';
 $('stage-title').textContent=title;
 visible('admin-controls',isAdmin);visible('start-round',isAdmin&&(s.status==='lobby'||s.status==='review'));$('start-round').textContent=s.status==='lobby'?'Runde 1 starten':`Runde ${s.round+1} starten`;
 $('start-round').disabled=busy||(s.status==='lobby'&&s.players<2);visible('close-round',isAdmin&&s.status==='open');visible('new-session',isAdmin&&s.status==='finished');
 visible('admin-card',isAdmin);visible('private-card',!isAdmin&&Boolean(s.me&&s.me.role));
 if(isAdmin){$('player-count').textContent=s.players;$('bid-count').textContent=s.submitted;$('roles').textContent=s.roles&&s.roles.buyers?`${s.roles.buyers} Kauf · ${s.roles.sellers} Verkauf`:s.status==='lobby'?'Mindestens zwei Teilnehmende.':'';}
 else if(s.me&&s.me.role){const buying=s.me.role==='Kauf';$('role-label').textContent=buying?'Du kaufst Strom':'Du verkaufst Strom';$('value-label').textContent=buying?'Nutzen':'Kosten';$('private-value').textContent=s.me.value;$('private-explainer').textContent=buying?'Punkte = Nutzen − Preis':'Punkte = Preis − Kosten';const last=s.me.results.at(-1);$('score').textContent=last?last.cumulative:0;
 $('bid-label').textContent=buying?'Dein höchster Kaufpreis':'Dein niedrigster Verkaufspreis';$('bid-button').textContent=s.me.bid===null?'Gebot abgeben':'Gebot ändern';
 if(lastRound!==s.round){$('bid').value=s.me.bid===null?'':s.me.bid;lastRound=s.round;}else if(document.activeElement!==$('bid')&&s.me.bid!==null){$('bid').value=s.me.bid;}}
 visible('bid-form',!isAdmin&&s.status==='open'&&Boolean(s.me&&s.me.role));
 const latest=!isAdmin&&s.me?s.me.results.find(r=>r.round===s.round):null;visible('result',Boolean(latest&&s.status!=='open'));if(latest){const r=$('result');r.replaceChildren();r.append(el('strong','',latest.matched?'Handel abgeschlossen':'Kein Handel'));r.append(el('div','',latest.matched?`Marktpreis ${money(latest.price)} · ${latest.points>=0?'+':''}${latest.points} Punkte`:'Für diese Runde erhältst du 0 Punkte.'));if(latest.bid===null)r.append(el('div','hint','Kein Gebot abgegeben.'));}
 renderHistory(s);visible('reveal',s.status==='finished'&&Array.isArray(s.reveal));if(s.status==='finished'&&s.reveal)renderChart();
}
function renderChart(){if(!state||!state.reveal)return;const mode=$('curve-select').value;const values=mode==='values'?state.reveal:(state.bids||[]).filter(x=>x.round===Number(mode)).map(x=>({role:x.role,value:x.bid}));$('demand-legend').textContent=mode==='values'?'Zahlungsbereitschaft':'Kaufgebote';$('supply-legend').textContent=mode==='values'?'Kosten':'Verkaufsangebote';drawChart(values,mode);}
$('curve-select').addEventListener('change',renderChart);
async function joinRoom(c){c=c.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(c)){notice('Bitte einen gültigen sechsstelligen Sitzungscode eingeben.');return;}code=c;token=stored.players[c]||secret();const result=await action('join');if(result){stored.players[c]=token;stored.activePlayer=c;persist();render();}else{code='';token='';render();}}
$('join-form').addEventListener('submit',e=>{e.preventDefault();joinRoom($('join-code').value);});
$('copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('room-link').href);$('copy-status').textContent='Link kopiert';}catch(_){$('copy-status').textContent='Link unten auswählen und kopieren';}});
$('create-form').addEventListener('submit',async e=>{e.preventDefault();code='';token=secret();const result=await action('create',{instructorKey:stored.instructorKey});if(result){code=result.code;stored.admins[code]=token;stored.activeAdmin=code;persist();render();}else token='';});
$('resume-form').addEventListener('submit',async e=>{e.preventDefault();const c=$('resume-code').value.trim().toUpperCase();if(!stored.admins[c]){notice('Für diesen Sitzungscode ist auf diesem Gerät kein Leitungszugang gespeichert.');return;}code=c;token=stored.admins[c];const result=await action('adminState');if(result){stored.activeAdmin=c;persist();render();}else{code='';token='';render();}});
$('start-round').addEventListener('click',()=>action('start'));$('close-round').addEventListener('click',()=>action('close'));
$('bid-form').addEventListener('submit',async e=>{e.preventDefault();const bid=Number($('bid').value);if(!Number.isInteger(bid)||bid<0||bid>500){notice('Bitte einen ganzen Betrag zwischen 0 und 500 eingeben.');return;}const wouldLose=state.me.role==='Kauf'?bid>state.me.value:bid<state.me.value;if(wouldLose&&!window.confirm('Dieses Gebot kann bei einem Abschluss zu einem Verlust führen. Möchtest du es trotzdem abgeben?'))return;await action('bid',{round:state.round,bid});});
$('leave').addEventListener('click',()=>{if(!window.confirm('Sitzung auf diesem Gerät verlassen? Du kannst mit demselben Sitzungscode zurückkehren.'))return;if(isAdmin)stored.activeAdmin='';else stored.activePlayer='';persist();state=null;code='';token='';notice('');render();});
$('new-session').addEventListener('click',()=>{stored.activeAdmin='';persist();code='';token='';state=null;render();});
async function poll(){if(!code||!token||busy)return;try{const r=await api(isAdmin?'adminState':'playerState',{code,token});state=r;if(lastNotice)notice('');render();}catch(e){notice(e.message);}}
setInterval(poll,10000+Math.floor(Math.random()*4000));if(!isAdmin&&room){code='';token='';render();joinRoom(room);}else{render();if(code&&token)poll();}
})();
