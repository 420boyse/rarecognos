import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {startUploadServer,MAX_BYTES} from '../upload-service/server.mjs';
test('signed uploads: contents, nonce, quota, CORS, retry, public metadata',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'rare-upload-'));const s=await startUploadServer({port:0,dir,demo:true,origins:['http://localhost:8086']});const origin='http://localhost:8086',api=`http://127.0.0.1:${s.port}`,wallet=privateKeyToAccount(generatePrivateKey());
 const image=readFileSync('public/art/nocturne.jpg'),digest=b=>createHash('sha256').update(b).digest('hex');
 const post=async(path,data,o=origin)=>{const r=await fetch(api+path,{method:'POST',headers:{Origin:o,'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
 const challenge=async(bytes=image)=>{const r=await post('/challenge',{wallet:wallet.address,digest:digest(bytes),name:'Artist test',description:'An original upload',rights:true});assert.equal(r.status,200);return r.body;};
 const prepare=async(c,bytes=image,signature)=>post('/prepare',{id:c.id,signature:signature||await wallet.signMessage({message:c.message}),file:bytes.toString('base64')});
 try{
 const health=await fetch(api+'/status');assert.equal(health.status,200);assert.equal((await health.json()).enabled,true);
 assert.equal((await fetch(api+'/status',{headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await fetch(api+'/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);

 assert.equal((await post('/challenge',{},'https://evil.example')).status,403);
 const c=await challenge();const bad=await privateKeyToAccount(generatePrivateKey()).signMessage({message:c.message});assert.equal((await prepare(c,image,bad)).status,401);
 const ok=await prepare(c);assert.equal(ok.status,200);assert.match(ok.body.uri,/^ipfs:\/\/b/);assert.equal(ok.body.creator,wallet.address.toLowerCase());assert.equal((await prepare(c)).status,401);
 const retry=await prepare(await challenge());assert.equal(retry.body.uri,ok.body.uri);
 const metadata=await fetch(api+'/ipfs/'+ok.body.uri.slice(7)).then(r=>r.json());assert.equal(metadata.creator,wallet.address.toLowerCase());assert.equal(metadata.attributes[0].value,'1/1');
 const asset=await fetch(api+'/ipfs/'+metadata.image.slice(7));assert.equal(asset.headers.get('content-type'),'image/webp');assert(asset.ok);
 const expired=await challenge();s.db.prepare('UPDATE nonces SET expires=0 WHERE id=?').run(expired.id);assert.equal((await prepare(expired)).status,401);
 const tampered=await challenge();assert.equal((await prepare(tampered,Buffer.from('not same image'))).status,400);
 const malformed=Buffer.from('<svg onload="alert(1)"></svg>');assert.equal((await prepare(await challenge(malformed),malformed)).status,400);
 const huge=Buffer.alloc(MAX_BYTES+1);const hc=await challenge(huge);assert.equal((await prepare(hc,huge)).status,413);
 const race=await challenge();const replies=await Promise.all([prepare(race),prepare(race)]);assert.equal(replies.filter(r=>r.status===200).length,1);
 s.db.prepare('INSERT OR REPLACE INTO limits VALUES (?,20,0)').run('challenge:'+wallet.address.toLowerCase()+':'+Math.floor(Date.now()/3600000));assert.equal((await post('/challenge',{wallet:wallet.address,digest:digest(image),name:'Test',description:'',rights:true})).status,429);
 }finally{await s.close();rmSync(dir,{recursive:true,force:true});}
});
