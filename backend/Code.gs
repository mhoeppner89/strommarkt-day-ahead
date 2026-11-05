/** Strommarkt: bound Google Apps Script; one Sheet per independent game deployment. */
const TABLES = {
  Sitzungen: ['code','adminHash','status','round','deadline','duration','created'],
  Teilnehmende: ['code','playerHash','number','role','value','joined'],
  Gebote: ['code','round','playerHash','role','bid','submitted','tie'],
  Runden: ['code','round','price','quantity','submitted','surplus','potential','cleared'],
  Ergebnisse: ['code','round','playerHash','number','role','value','bid','matched','price','points','cumulative','cleared']
};
function book() {
  const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if(!id)throw Error('SPREADSHEET_ID ist in den Skripteigenschaften nicht gesetzt.');
  return SpreadsheetApp.openById(id);
}
function install() { ensureTables(); }
function ensureTables() {
  const spreadsheet=book();
  Object.keys(TABLES).forEach(name=>{
    let sheet=spreadsheet.getSheetByName(name); if(!sheet) sheet=spreadsheet.insertSheet(name);
    if(sheet.getLastRow()===0){sheet.appendRow(TABLES[name]);sheet.setFrozenRows(1);}
    const actual=sheet.getRange(1,1,1,TABLES[name].length).getValues()[0];
    if(actual.join('|')!==TABLES[name].join('|')) throw Error('Tabellenkopf stimmt nicht: '+name);
  });
}
function rows(name) {
  const sh=book().getSheetByName(name), data=sh.getDataRange().getValues();
  return data.slice(1).map((r,i)=>{const x={_row:i+2};TABLES[name].forEach((k,j)=>x[k]=r[j]);return x;}).filter(x=>String(x[TABLES[name][0]])!=='');
}
function append(name,obj){book().getSheetByName(name).appendRow(TABLES[name].map(k=>obj[k]===undefined?'':obj[k]));}
function update(name,obj){book().getSheetByName(name).getRange(obj._row,1,1,TABLES[name].length).setValues([TABLES[name].map(k=>obj[k]===undefined?'':obj[k])]);}
function hash(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8).map(x=>('0'+(x&255).toString(16)).slice(-2)).join('');}
function requireToken(t){if(!/^[a-f0-9]{48}$/.test(String(t||'')))throw Error('Ungültiger Zugang.');return hash(t);}
function requireCode(c){c=String(c||'').toUpperCase();if(!/^[A-Z2-9]{6}$/.test(c))throw Error('Ungültiger Sitzungscode.');return c;}
function sessionFor(code){const s=rows('Sitzungen').find(x=>x.code===requireCode(code));if(!s)throw Error('Sitzung nicht gefunden.');return s;}
function adminFor(s,token){if(requireToken(token)!==String(s.adminHash))throw Error('Leitungszugang ungültig.');}
function playerFor(s,token){const h=requireToken(token),p=rows('Teilnehmende').find(x=>x.code===s.code&&x.playerHash===h);if(!p)throw Error('Bitte dieser Sitzung erneut beitreten.');return p;}
function allPlayers(s){return rows('Teilnehmende').filter(x=>x.code===s.code);}
function newCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';for(let tries=0;tries<100;tries++){let x='';for(let i=0;i<6;i++)x+=alphabet[Math.floor(Math.random()*alphabet.length)];if(!rows('Sitzungen').some(s=>s.code===x))return x;}throw Error('Kein Sitzungscode verfügbar.');}
function shuffled(xs){xs=xs.slice();for(let i=xs.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[xs[i],xs[j]]=[xs[j],xs[i]];}return xs;}
function initializeRoles(s){const players=shuffled(allPlayers(s));if(players.length<2)throw Error('Mindestens zwei Personen müssen beitreten.');players.forEach((p,i)=>{p.role=i%2===0?'Kauf':'Verkauf';p.value=p.role==='Kauf'?95+Math.floor(Math.random()*61):45+Math.floor(Math.random()*61);update('Teilnehmende',p);});}
function ordersFor(s){return rows('Gebote').filter(o=>o.code===s.code&&Number(o.round)===Number(s.round));}
function resultFor(s,r){return rows('Runden').find(x=>x.code===s.code&&Number(x.round)===Number(r));}
// Sorted double auction. The chosen price lies inside all accepted limits and all rejected limits.
function clearAuction(orders){
  const sortTie=(a,b)=>String(a.tie).localeCompare(String(b.tie));
  const buyers=orders.filter(o=>o.role==='Kauf').sort((a,b)=>Number(b.bid)-Number(a.bid)||sortTie(a,b));
  const sellers=orders.filter(o=>o.role==='Verkauf').sort((a,b)=>Number(a.bid)-Number(b.bid)||sortTie(a,b));
  let k=0;while(k<buyers.length&&k<sellers.length&&Number(buyers[k].bid)>=Number(sellers[k].bid))k++;
  if(!k)return {price:null,quantity:0,winning:[]};
  let lower=Number(sellers[k-1].bid),upper=Number(buyers[k-1].bid);
  if(k<buyers.length)lower=Math.max(lower,Number(buyers[k].bid));
  if(k<sellers.length)upper=Math.min(upper,Number(sellers[k].bid));
  if(lower>upper)throw Error('Ungültiges Preisintervall.');
  return {price:Math.floor((lower+upper)/2),quantity:k,winning:buyers.slice(0,k).concat(sellers.slice(0,k)).map(o=>o.playerHash)};
}
function closeRound(s){
  if(s.status!=='open')return;
  const orders=ordersFor(s),out=clearAuction(orders),existing=resultFor(s,s.round),time=new Date().toISOString(),players=allPlayers(s);
  const winners=players.filter(p=>out.winning.includes(p.playerHash));
  const surplus=winners.reduce((sum,p)=>sum+(p.role==='Kauf'?Number(p.value):-Number(p.value)),0);
  const values=players.filter(p=>p.role==='Kauf').map(p=>Number(p.value)).sort((a,b)=>b-a),costs=players.filter(p=>p.role==='Verkauf').map(p=>Number(p.value)).sort((a,b)=>a-b);
  let potential=0;for(let i=0;i<Math.min(values.length,costs.length)&&values[i]>costs[i];i++)potential+=values[i]-costs[i];
  if(!existing)append('Runden',{code:s.code,round:s.round,price:out.price===null?'':out.price,quantity:out.quantity,submitted:orders.length,surplus,potential,cleared:time});
  const results=rows('Ergebnisse');
  players.forEach(p=>{
    if(results.some(r=>r.code===s.code&&Number(r.round)===Number(s.round)&&r.playerHash===p.playerHash))return;
    const o=orders.find(q=>q.playerHash===p.playerHash),matched=out.winning.includes(p.playerHash),points=matched?(p.role==='Kauf'?Number(p.value)-out.price:out.price-Number(p.value)):0;
    const previous=results.filter(r=>r.code===s.code&&r.playerHash===p.playerHash).reduce((a,r)=>a+Number(r.points),0);
    append('Ergebnisse',{code:s.code,round:s.round,playerHash:p.playerHash,number:p.number,role:p.role,value:p.value,bid:o?o.bid:'',matched:matched?'ja':'nein',price:matched?out.price:'',points:points,cumulative:previous+points,cleared:time});
  });
  s.status=Number(s.round)>=5?'finished':'review';s.deadline='';update('Sitzungen',s);
}
function tick(s){if(s.status==='open'&&Number(s.deadline)<=Date.now())closeRound(s);return s;}
function state(s,viewer){
  tick(s);const players=allPlayers(s),summary=rows('Runden').filter(x=>x.code===s.code).map(x=>({round:Number(x.round),price:x.price===''?null:Number(x.price),quantity:Number(x.quantity),submitted:Number(x.submitted)}));
  const base={code:s.code,status:s.status,round:Number(s.round),deadline:s.deadline?Number(s.deadline):null,duration:Number(s.duration),players:players.length,submitted:s.status==='open'?ordersFor(s).length:0,history:summary};
  if(viewer==='admin'){
    base.roles={buyers:players.filter(p=>p.role==='Kauf').length,sellers:players.filter(p=>p.role==='Verkauf').length};
  }else{
    const p=viewer, order=s.status==='open'?ordersFor(s).find(x=>x.playerHash===p.playerHash):null;
    const mine=rows('Ergebnisse').filter(x=>x.code===s.code&&x.playerHash===p.playerHash).sort((a,b)=>Number(a.round)-Number(b.round));
    base.me={number:p.number,role:p.role||null,value:p.value===''?null:Number(p.value),bid:order?Number(order.bid):null,results:mine.map(x=>({round:Number(x.round),bid:x.bid===''?null:Number(x.bid),matched:x.matched==='ja',price:x.price===''?null:Number(x.price),points:Number(x.points),cumulative:Number(x.cumulative)}))};
  }
  if(s.status==='finished'){
    base.reveal=players.map(p=>({role:p.role,value:Number(p.value)}));
    base.bids=rows('Gebote').filter(x=>x.code===s.code).map(x=>({round:Number(x.round),role:x.role,bid:Number(x.bid)}));
  }
  return base;
}
function dispatch(action,p){
  if(action==='create'){
    const adminHash=requireToken(p.token),duration=Number(p.duration);
    if(!Number.isInteger(duration)||duration<30||duration>600)throw Error('Rundendauer muss zwischen 30 und 600 Sekunden liegen.');
    const s={code:newCode(),adminHash:adminHash,status:'lobby',round:0,deadline:'',duration:duration,created:new Date().toISOString()};append('Sitzungen',s);return state(s,'admin');
  }
  let s=tick(sessionFor(p.code));
  if(action==='join'){
    const playerHash=requireToken(p.token),list=allPlayers(s);let player=list.find(x=>x.playerHash===playerHash);
    if(!player){if(s.status!=='lobby')throw Error('Diese Sitzung hat bereits begonnen.');if(list.length>=60)throw Error('Diese Sitzung ist mit 60 Teilnehmenden voll.');player={code:s.code,playerHash:playerHash,number:list.length+1,role:'',value:'',joined:new Date().toISOString()};append('Teilnehmende',player);}
    return state(s,player);
  }
  if(action==='adminState'){adminFor(s,p.token);return state(s,'admin');}
  if(action==='playerState'){return state(s,playerFor(s,p.token));}
  if(action==='start'){
    adminFor(s,p.token);if(s.status==='lobby'){initializeRoles(s);s.round=1;}
    else if(s.status==='review'&&Number(s.round)<5)s.round=Number(s.round)+1;
    else throw Error('Die nächste Runde kann noch nicht gestartet werden.');
    s.status='open';s.deadline=Date.now()+Number(s.duration)*1000;update('Sitzungen',s);return state(s,'admin');
  }
  if(action==='close'){adminFor(s,p.token);if(s.status!=='open')throw Error('Es läuft gerade keine Runde.');closeRound(s);return state(s,'admin');}
  if(action==='bid'){
    const player=playerFor(s,p.token);if(s.status!=='open')throw Error('Die Gebotsrunde ist geschlossen.');
    if(Number(p.round)!==Number(s.round))throw Error('Die Runde hat sich geändert.');
    const bid=Number(p.bid);if(typeof p.bid!=='number'||!Number.isInteger(bid)||bid<0||bid>500)throw Error('Bitte einen ganzen Betrag zwischen 0 und 500 €/MWh eingeben.');
    let order=ordersFor(s).find(o=>o.playerHash===player.playerHash);
    if(order){order.bid=bid;order.submitted=new Date().toISOString();update('Gebote',order);}
    else append('Gebote',{code:s.code,round:s.round,playerHash:player.playerHash,role:player.role,bid:bid,submitted:new Date().toISOString(),tie:hash(s.code+'|'+s.round+'|'+player.playerHash)});
    return state(s,player);
  }
  throw Error('Unbekannte Aktion.');
}
function doGet(e){
  const args=(e&&e.parameter)||{},cb=String(args.callback||'');
  if(cb&&!/^[a-zA-Z_$][0-9a-zA-Z_$]{0,70}$/.test(cb))return ContentService.createTextOutput('Ungültiger Callback.');
  let response;const lock=LockService.getScriptLock();
  try{lock.waitLock(20000);if(String(args.action||'')==='create')ensureTables();let p={};try{p=JSON.parse(args.payload||'{}');}catch(_){throw Error('Ungültige Anfrage.');}response={ok:true,data:dispatch(String(args.action||''),p)};}
  catch(err){response={ok:false,error:String(err.message||err)};}
  finally{try{lock.releaseLock();}catch(_){}}
  const json=JSON.stringify(response).replace(/</g,'\\u003c');
  return ContentService.createTextOutput(cb?cb+'('+json+');':json).setMimeType(cb?ContentService.MimeType.JAVASCRIPT:ContentService.MimeType.JSON);
}
