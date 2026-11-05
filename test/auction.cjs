const assert=require('node:assert/strict'),{createFake}=require('./fake-google.cjs');
const {context:c,sheets}=createFake();c.install();
const order=(role,bid,tie)=>({role,bid,tie,playerHash:role+tie});
let a=c.clearAuction([order('Kauf',120,'a'),order('Kauf',100,'b'),order('Kauf',75,'c'),order('Verkauf',50,'d'),order('Verkauf',80,'e'),order('Verkauf',110,'f')]);assert.equal(a.quantity,2);assert.equal(a.price,90);
a=c.clearAuction([order('Kauf',100,'a'),order('Kauf',99,'b'),order('Verkauf',0,'c'),order('Verkauf',101,'d')]);assert.equal(a.quantity,1);assert.equal(a.price,99);
assert.equal(c.clearAuction([order('Kauf',50,'a'),order('Verkauf',51,'b')]).price,null);
for(let trial=0;trial<2000;trial++){
 const orders=[];for(let i=0;i<2+Math.floor(Math.random()*18);i++)orders.push(order(i%2?'Kauf':'Verkauf',Math.floor(Math.random()*201),String(i).padStart(3,'0')));
 const result=c.clearAuction(orders),winners=orders.filter(o=>result.winning.includes(o.playerHash)),losers=orders.filter(o=>!result.winning.includes(o.playerHash));
 assert.equal(winners.filter(o=>o.role==='Kauf').length,result.quantity);assert.equal(winners.filter(o=>o.role==='Verkauf').length,result.quantity);
 if(result.quantity){assert(winners.every(o=>o.role==='Kauf'?o.bid>=result.price:o.bid<=result.price));assert(losers.every(o=>o.role==='Kauf'?o.bid<=result.price:o.bid>=result.price));}
}
const host='a'.repeat(48),tokens=['b','c','d','e'].map(x=>x.repeat(48));let s=c.dispatch('create',{token:host,instructorKey:'f'.repeat(48)}),code=s.code;assert.match(code,/^[A-Z2-9]{6}$/);
for(const token of tokens)c.dispatch('join',{code,token});assert.equal(c.dispatch('adminState',{code,token:host}).players,4);assert.throws(()=>c.dispatch('start',{code,token:tokens[0]}));assert.throws(()=>c.dispatch('start',{code,token:host}),/Rolle wählen/);for(let i=0;i<tokens.length;i++)c.dispatch('chooseRole',{code,token:tokens[i],role:i%2?'Verkauf':'Kauf'});assert.throws(()=>c.dispatch('chooseRole',{code,token:tokens[0],role:'Verkauf'}),/bereits gewählt/);assert.equal(c.dispatch('playerState',{code,token:tokens[0]}).me.value,null);
s=c.dispatch('start',{code,token:host});assert.equal(s.round,1);assert.equal(s.roles.buyers,2);assert.equal(s.roles.sellers,2);assert.equal(s.roles.unselected,0);assert.throws(()=>c.dispatch('chooseRole',{code,token:tokens[0],role:'Kauf'}),/abgeschlossen/);
const players=tokens.map(token=>({token,state:c.dispatch('playerState',{code,token})}));assert(players.every(p=>p.state.me.value>0));assert(!('reveal' in players[0].state));assert(!('adminHash' in players[0].state));
for(let round=1;round<=5;round++){
 for(const p of players){const bid=p.state.me.role==='Kauf'?150:50;let res=c.dispatch('bid',{code,token:p.token,round,bid});assert.equal(res.me.bid,bid);}
 s=c.dispatch('close',{code,token:host});assert.equal(s.history.at(-1).quantity,2);assert.equal(s.history.at(-1).price,100);
 for(const p of players){p.state=c.dispatch('playerState',{code,token:p.token});const r=p.state.me.results.at(-1);assert.equal(r.round,round);assert.equal(r.points,p.state.me.role==='Kauf'?p.state.me.value-100:100-p.state.me.value);assert.equal(r.cumulative,r.points*round);}
 if(round<5){assert.equal(s.status,'review');s=c.dispatch('start',{code,token:host});}else assert.equal(s.status,'finished');
}
assert.equal(s.reveal.length,4);assert.equal(sheets.get('Ergebnisse').data.length,21);assert.throws(()=>c.dispatch('bid',{code,token:tokens[0],round:5,bid:100}));
const response=c.doGet({parameter:{action:'adminState',callback:'test_1',payload:JSON.stringify({code,token:host})}}).body;assert(response.startsWith('test_1('));
console.log('Auction properties, access, persistence and five rounds passed.');
const t=createFake();t.context.install();const h='8'.repeat(48),u='9'.repeat(48),v='7'.repeat(48);assert.throws(()=>t.context.dispatch('create',{token:h}),/Leitungszugang|Ungültiger Zugang/);const created=t.context.dispatch('create',{token:h,instructorKey:'f'.repeat(48)});const k=created.code;t.context.dispatch('join',{code:k,token:u});t.context.dispatch('join',{code:k,token:v});t.context.dispatch('chooseRole',{code:k,token:u,role:'Kauf'});t.context.dispatch('chooseRole',{code:k,token:v,role:'Verkauf'});t.context.dispatch('start',{code:k,token:h});const expired=t.context.sessionFor(k);expired.deadline=1;t.context.update('Sitzungen',expired);const raw=t.context.doGet({parameter:{action:'playerState',payload:JSON.stringify({code:k,token:u})}}).body;const parsed=JSON.parse(raw);assert.equal(parsed.ok,true);assert.equal(parsed.data.status,'open');assert.throws(()=>t.context.dispatch('close',{code:k,token:u}),/Leitungszugang/);const after=t.context.dispatch('close',{code:k,token:h});assert.equal(after.status,'review');assert.equal(after.history[0].price,null);assert.equal(after.history[0].quantity,0);console.log('Instructor access, manual closing and no-bid round passed.');
