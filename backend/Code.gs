/** Strommarkt: bound Google Apps Script; one Sheet per independent game deployment. */
const TABLES = {
  Sitzungen: ['code','adminHash','status','round','deadline','duration','created'],
  Teilnehmende: ['code','playerHash','number','role','value','joined'],
  Gebote: ['code','round','playerHash','role','bid','submitted','tie'],
  Runden: ['code','round','price','quantity','submitted','surplus','potential','cleared'],
  Ergebnisse: ['code','round','playerHash','number','role','value','bid','matched','price','points','cumulative','cleared']
};
let bookCache=null, tableCache={};
function resetCache(){bookCache=null;tableCache={};}
function book() {
  if(bookCache)return bookCache;
  const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if(!id)throw Error('SPREADSHEET_ID ist in den Skripteigenschaften nicht gesetzt.');
  bookCache=SpreadsheetApp.openById(id);return bookCache;
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
  if(tableCache[name])return tableCache[name];
  const sh=book().getSheetByName(name);if(!sh)throw Error('Die Tabelle ist noch nicht initialisiert.');
  const data=sh.getDataRange().getValues();
  tableCache[name]=data.slice(1).map((r,i)=>{const x={_row:i+2};TABLES[name].forEach((k,j)=>x[k]=r[j]);return x;}).filter(x=>String(x[TABLES[name][0]])!=='');
  return tableCache[name];
}
function append(name,obj){book().getSheetByName(name).appendRow(TABLES[name].map(k=>obj[k]===undefined?'':obj[k]));delete tableCache[name];}
function appendMany(name,items){if(!items.length)return;const sh=book().getSheetByName(name);sh.getRange(sh.getLastRow()+1,1,items.length,TABLES[name].length).setValues(items.map(obj=>TABLES[name].map(k=>obj[k]===undefined?'':obj[k])));delete tableCache[name];}
function update(name,obj){book().getSheetByName(name).getRange(obj._row,1,1,TABLES[name].length).setValues([TABLES[name].map(k=>obj[k]===undefined?'':obj[k])]);delete tableCache[name];}
function hash(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8).map(x=>('0'+(x&255).toString(16)).slice(-2)).join('');}
function requireToken(t){if(!/^[a-f0-9]{48}$/.test(String(t||'')))throw Error('Ungültiger Zugang.');return hash(t);}
function requireCode(c){c=String(c||'').toUpperCase();if(!/^[A-Z2-9]{6}$/.test(c))throw Error('Ungültiger Sitzungscode.');return c;}
function sessionFor(code){const s=rows('Sitzungen').find(x=>x.code===requireCode(code));if(!s)throw Error('Sitzung nicht gefunden.');return s;}
function adminFor(s,token){if(requireToken(token)!==String(s.adminHash))throw Error('Leitungszugang ungültig.');}
function playerFor(s,token){const h=requireToken(token),p=rows('Teilnehmende').find(x=>x.code===s.code&&x.playerHash===h);if(!p||p.role==='ausgeschlossen')throw Error('Bitte dieser Sitzung erneut beitreten.');return p;}
function allPlayers(s){return rows('Teilnehmende').filter(x=>x.code===s.code&&x.role!=='ausgeschlossen');}
function newCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';for(let tries=0;tries<100;tries++){let x='';for(let i=0;i<6;i++)x+=alphabet[Math.floor(Math.random()*alphabet.length)];if(!rows('Sitzungen').some(s=>s.code===x))return x;}throw Error('Kein Sitzungscode verfügbar.');}
function initializeRoles(s){
  const players=allPlayers(s);if(players.length<2)throw Error('Mindestens zwei Personen müssen beitreten.');
  if(players.some(p=>p.role!=='Kauf'&&p.role!=='Verkauf'))throw Error('Alle Teilnehmenden müssen zuerst ihre Rolle wählen.');
  const assigned={};players.forEach(p=>{assigned[p.playerHash]=p.role==='Kauf'?95+Math.floor(Math.random()*61):45+Math.floor(Math.random()*61);});
  const sh=book().getSheetByName('Teilnehmende'),count=sh.getLastRow()-1,width=TABLES.Teilnehmende.length;
  const values=sh.getRange(2,1,count,width).getValues();values.forEach(row=>{if(row[0]===s.code&&Object.prototype.hasOwnProperty.call(assigned,row[1]))row[4]=assigned[row[1]];});
  sh.getRange(2,1,count,width).setValues(values);delete tableCache.Teilnehmende;
}
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
  const results=rows('Ergebnisse'),pending=[];
  players.forEach(p=>{
    if(results.some(r=>r.code===s.code&&Number(r.round)===Number(s.round)&&r.playerHash===p.playerHash))return;
    const o=orders.find(q=>q.playerHash===p.playerHash),matched=out.winning.includes(p.playerHash),points=matched?(p.role==='Kauf'?Number(p.value)-out.price:out.price-Number(p.value)):0;
    const previous=results.filter(r=>r.code===s.code&&r.playerHash===p.playerHash).reduce((a,r)=>a+Number(r.points),0);
    pending.push({code:s.code,round:s.round,playerHash:p.playerHash,number:p.number,role:p.role,value:p.value,bid:o?o.bid:'',matched:matched?'ja':'nein',price:matched?out.price:'',points:points,cumulative:previous+points,cleared:time});
  });
  appendMany('Ergebnisse',pending);
  s.status=Number(s.round)>=5?'finished':'review';s.deadline='';update('Sitzungen',s);
}
function state(s,viewer){
  const players=allPlayers(s),summary=s.status==='lobby'?[]:rows('Runden').filter(x=>x.code===s.code).map(x=>({round:Number(x.round),price:x.price===''?null:Number(x.price),quantity:Number(x.quantity),submitted:Number(x.submitted)}));
  const base={code:s.code,status:s.status,round:Number(s.round),deadline:s.deadline?Number(s.deadline):null,duration:Number(s.duration),players:players.length,submitted:s.status==='open'?ordersFor(s).length:0,history:summary};
  if(viewer==='admin'){
    base.roles={buyers:players.filter(p=>p.role==='Kauf').length,sellers:players.filter(p=>p.role==='Verkauf').length,unselected:players.filter(p=>p.role!=='Kauf'&&p.role!=='Verkauf').length};
  }else{
    const p=viewer, order=s.status==='open'?ordersFor(s).find(x=>x.playerHash===p.playerHash):null;
    const mine=s.status==='lobby'||(s.status==='open'&&Number(s.round)===1)?[]:rows('Ergebnisse').filter(x=>x.code===s.code&&x.playerHash===p.playerHash).sort((a,b)=>Number(a.round)-Number(b.round));
    base.me={number:p.number,role:p.role||null,value:p.value===''?null:Number(p.value),bid:order?Number(order.bid):null,results:mine.map(x=>({round:Number(x.round),bid:x.bid===''?null:Number(x.bid),matched:x.matched==='ja',price:x.price===''?null:Number(x.price),points:Number(x.points),cumulative:Number(x.cumulative)}))};
  }
  if(s.status==='finished'){
    base.reveal=players.map(p=>({role:p.role,value:Number(p.value)}));
    base.bids=rows('Gebote').filter(x=>x.code===s.code).map(x=>({round:Number(x.round),role:x.role,bid:Number(x.bid)}));
  }
  return base;
}
function dispatch(action,p,deferState){
  const respond=(s,viewer)=>deferState?{session:s,viewer:viewer}:state(s,viewer);
  if(action==='publicRooms'||action==='adminRooms'){
    if(action==='adminRooms'&&p.instructorPassword!=='EVWL2026')throw Error('Leitungszugang ungültig.');
    if(!book().getSheetByName('Sitzungen')||!book().getSheetByName('Teilnehmende'))return [];
    const active=['lobby','open','review'];
    return rows('Sitzungen').filter(s=>action==='publicRooms'?s.status==='lobby':active.includes(s.status))
      .map(s=>({code:s.code,status:s.status,round:Number(s.round),players:allPlayers(s).length}));
  }
  if(action==='create'){
    if(p.instructorPassword!=='EVWL2026')throw Error('Leitungszugang ungültig.');
    const adminHash=requireToken(p.token),duration=0;
    const existing=rows('Sitzungen').find(x=>x.adminHash===adminHash);if(existing)return respond(existing,'admin');
    const s={code:newCode(),adminHash:adminHash,status:'lobby',round:0,deadline:'',duration:duration,created:new Date().toISOString()};append('Sitzungen',s);return respond(s,'admin');
  }
  let s=sessionFor(p.code);
  if(action==='endSession'){
    if(p.instructorPassword!=='EVWL2026')throw Error('Leitungszugang ungültig.');
    if(s.status!=='closed'&&s.status!=='finished'){
      s.status='closed';s.deadline='';update('Sitzungen',s);
    }
    return respond(s,'admin');
  }
  if(action==='join'){
    if(s.status==='closed')throw Error('Diese Sitzung wurde geschlossen.');
    const playerHash=requireToken(p.token),list=allPlayers(s);let player=rows('Teilnehmende').find(x=>x.code===s.code&&x.playerHash===playerHash);
    if(!player||player.role==='ausgeschlossen'){
      if(s.status!=='lobby')throw Error('Diese Sitzung hat bereits begonnen.');if(list.length>=60)throw Error('Diese Sitzung ist mit 60 Teilnehmenden voll.');
      if(player){player.role='';player.value='';update('Teilnehmende',player);}
      else{player={code:s.code,playerHash:playerHash,number:rows('Teilnehmende').filter(x=>x.code===s.code).length+1,role:'',value:'',joined:new Date().toISOString()};append('Teilnehmende',player);}
    }
    return respond(s,player);
  }
  if(action==='chooseRole'){
    const player=playerFor(s,p.token);if(s.status!=='lobby')throw Error('Die Rollenwahl ist abgeschlossen.');
    if(p.role!=='Kauf'&&p.role!=='Verkauf')throw Error('Bitte eine Rolle wählen.');
    if(player.role===p.role)return respond(s,player);
    if(player.role)throw Error('Deine Rolle wurde bereits gewählt.');
    player.role=p.role;update('Teilnehmende',player);return respond(s,player);
  }
  if(action==='removeWaiting'){
    adminFor(s,p.token);if(s.status!=='lobby')throw Error('Die Rollenwahl ist abgeschlossen.');
    const sh=book().getSheetByName('Teilnehmende'),count=sh.getLastRow()-1,width=TABLES.Teilnehmende.length;
    if(count>0){const values=sh.getRange(2,1,count,width).getValues();values.forEach(row=>{if(row[0]===s.code&&row[3]==='')row[3]='ausgeschlossen';});sh.getRange(2,1,count,width).setValues(values);delete tableCache.Teilnehmende;}
    return respond(s,'admin');
  }
  if(action==='adminState'){adminFor(s,p.token);return respond(s,'admin');}
  if(action==='playerState'){return respond(s,playerFor(s,p.token));}
  if(action==='start'){
    adminFor(s,p.token);
    if(Number.isInteger(p.previousRound)){if(s.status==='open'&&Number(s.round)===p.previousRound+1)return respond(s,'admin');if(Number(s.round)!==p.previousRound)throw Error('Die Runde hat sich geändert.');}
    if(s.status==='lobby'){initializeRoles(s);s.round=1;}
    else if(s.status==='review'&&Number(s.round)<5)s.round=Number(s.round)+1;
    else throw Error('Die nächste Runde kann noch nicht gestartet werden.');
    s.status='open';s.deadline='';update('Sitzungen',s);return respond(s,'admin');
  }
  if(action==='close'){adminFor(s,p.token);if(Number.isInteger(p.round)&&Number(s.round)!==p.round)throw Error('Die Runde hat sich geändert.');if(s.status!=='open'){if(Number.isInteger(p.round)&&(s.status==='review'||s.status==='finished'))return respond(s,'admin');throw Error('Es läuft gerade keine Runde.');}closeRound(s);return respond(s,'admin');}
  if(action==='bid'){
    const player=playerFor(s,p.token);if(s.status!=='open')throw Error('Die Gebotsrunde ist geschlossen.');
    if(Number(p.round)!==Number(s.round))throw Error('Die Runde hat sich geändert.');
    const bid=Number(p.bid);if(typeof p.bid!=='number'||!Number.isInteger(bid)||bid<0||bid>500)throw Error('Bitte einen ganzen Betrag zwischen 0 und 500 €/MWh eingeben.');
    let order=ordersFor(s).find(o=>o.playerHash===player.playerHash);
    if(order){order.bid=bid;order.submitted=new Date().toISOString();update('Gebote',order);}
    else append('Gebote',{code:s.code,round:s.round,playerHash:player.playerHash,role:player.role,bid:bid,submitted:new Date().toISOString(),tie:hash(s.code+'|'+s.round+'|'+player.playerHash)});
    return respond(s,player);
  }
  throw Error('Unbekannte Aktion.');
}
function flushAndRelease(lock){try{SpreadsheetApp.flush();}finally{lock.releaseLock();}}
function doGet(e){
  const args=(e&&e.parameter)||{},cb=String(args.callback||'');
  if(cb&&!/^[a-zA-Z_$][0-9a-zA-Z_$]{0,70}$/.test(cb))return ContentService.createTextOutput('Ungültiger Callback.');
  let response,locked=false;const lock=LockService.getScriptLock();resetCache();
  try{
    let p={};try{p=JSON.parse(args.payload||'{}');}catch(_){throw Error('Ungültige Anfrage.');}
    const action=String(args.action||''),readOnly=['adminState','playerState','phase','publicRooms','adminRooms'].includes(action);
    if(action==='phase'){
      const key='phase:'+requireCode(p.code);let phase=null;
      try{phase=CacheService.getScriptCache().get(key);}catch(_){}
      response={ok:true,data:phase||null};
    }else{
    if(!readOnly){
      try{lock.waitLock(20000);}catch(_){throw Error('SERVER_BELEGT');}locked=true;resetCache();
      if(action==='create')ensureTables();
    }
    const result=dispatch(action,p,!readOnly);
    if(locked){
      SpreadsheetApp.flush();
      if(action==='create'||action==='start'||action==='close'||action==='endSession'){
        try{CacheService.getScriptCache().put('phase:'+result.session.code,result.session.status+':'+Number(result.session.round),21600);}catch(_){}
      }
      lock.releaseLock();locked=false;resetCache();
    }
    if(readOnly)response={ok:true,data:result};
    else {const s=sessionFor(result.session.code),viewer=result.viewer==='admin'?'admin':playerFor(s,p.token);response={ok:true,data:state(s,viewer)};}
    }

  }catch(err){const message=String(err.message||err);response={ok:false,error:/Zeitüberschreitung bei Anforderung der Exklusivbearbeitung|Service invoked too many times|Service using too much computer time|Lock timeout/i.test(message)?'SERVER_BELEGT':message};}
  finally{if(locked)try{flushAndRelease(lock);}catch(_){}}
  const json=JSON.stringify(response).replace(/</g,'\\u003c');
  return ContentService.createTextOutput(cb?cb+'('+json+');':json).setMimeType(cb?ContentService.MimeType.JAVASCRIPT:ContentService.MimeType.JSON);
}
