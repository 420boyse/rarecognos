import http from 'node:http';
import Database from 'better-sqlite3';
import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {verifyMessage,isAddress} from 'viem';
import sharp from 'sharp';
export const MAX_BYTES=5*1024*1024;
const hash=b=>createHash('sha256').update(b).digest('hex');
function cid(bytes){let bits=0,value=0,out='b';for(const b of Buffer.concat([Buffer.from([1,85,18,32]),createHash('sha256').update(bytes).digest()])){value=(value<<8)|b;bits+=8;while(bits>=5){out+='abcdefghijklmnopqrstuvwxyz234567'[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+='abcdefghijklmnopqrstuvwxyz234567'[(value<<(5-bits))&31];return out;}
export async function startUploadServer({port=8787,dir=process.env.UPLOAD_DATA_DIR||'.upload-data',demo=process.env.UPLOAD_DEMO==='true',origins=(process.env.UPLOAD_ALLOWED_ORIGINS||'').split(',').map(origin=>origin.trim()).filter(Boolean),jwt=process.env.PINATA_JWT,chainId=demo?31337:4441}={}) {
 mkdirSync(dir,{recursive:true});const db=new Database(resolve(dir,'uploads.sqlite'));db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS nonces (id TEXT PRIMARY KEY, wallet TEXT, origin TEXT, payload TEXT, message TEXT, expires INTEGER, used INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER, bytes INTEGER);
 CREATE TABLE IF NOT EXISTS prepared (id TEXT PRIMARY KEY, result TEXT);
 CREATE TABLE IF NOT EXISTS assets (cid TEXT PRIMARY KEY, mime TEXT);`);
 const limit=(key,max,bytes=0)=>{db.prepare('INSERT INTO limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1,bytes=bytes+excluded.bytes').run(key,bytes);const r=db.prepare('SELECT * FROM limits WHERE key=?').get(key);if(r.count>max||r.bytes>100*1024*1024)throw Object.assign(Error('Upload limit reached. Try again later.'),{status:429});};
 async function pin(bytes,mime,name){if(demo){const key=cid(bytes);writeFileSync(resolve(dir,key),bytes,{flag:'w'});db.prepare('INSERT OR IGNORE INTO assets VALUES (?,?)').run(key,mime);return 'ipfs://'+key;}const form=new FormData();form.set('file',new Blob([bytes],{type:mime}),name);form.set('pinataOptions',JSON.stringify({cidVersion:1}));const r=await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS',{method:'POST',headers:{Authorization:`Bearer ${jwt}`},body:form,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Permanent storage unavailable. Retry with a new signature.');const result=await r.json();if(!/^b[a-z2-7]{40,120}$/.test(result.IpfsHash))throw Error('Invalid storage response');return 'ipfs://'+result.IpfsHash;}
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin||'';
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
   const path=new URL(req.url,'http://localhost').pathname;
   if(path.startsWith('/ipfs/')&&demo&&req.method==='GET'){const key=path.slice(6);if(!/^b[a-z2-7]{40,120}$/.test(key))return json(404,{error:'Not found'});const row=db.prepare('SELECT mime FROM assets WHERE cid=?').get(key);if(!row)return json(404,{error:'Not found'});res.writeHead(200,{'Content-Type':row.mime,'Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=31536000, immutable'});res.end(readFileSync(resolve(dir,key)));return;}
   // Permit origin-less health checks; uploads still require an allowed origin.
   if(path==='/status'&&req.method==='GET'&&!origin)return json(200,{enabled:!!jwt||demo,mode:demo?'local-demo':'ipfs',maxBytes:MAX_BYTES,chainId});
   if(!origins.includes(origin))return json(403,{error:'Origin not allowed'});
   res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   if(path==='/status'&&req.method==='GET')return json(200,{enabled:!!jwt||demo,mode:demo?'local-demo':'ipfs',maxBytes:MAX_BYTES,chainId});
   if(!jwt&&!demo)return json(503,{error:'Permanent upload storage is not configured.'});
   if(req.method!=='POST')return json(405,{error:'Method not allowed'});
   limit('ip:'+req.socket.remoteAddress+':'+Math.floor(Date.now()/3600000),60);
   let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>MAX_BYTES*1.4+16384)throw Object.assign(Error('Maximum file size is 5 MB'),{status:413});chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(path==='/challenge'){
    const {wallet,digest,name,description,rights}=body;
    if(!isAddress(wallet)||!(/^[a-f0-9]{64}$/).test(digest)||typeof name!=='string'||!name.trim()||name.length>120||typeof description!=='string'||description.length>2000||rights!==true) return json(400,{error:'Check name, description, wallet and rights declaration.'});
    limit('challenge:'+wallet.toLowerCase()+':'+Math.floor(Date.now()/3600000),20);
    db.prepare('DELETE FROM nonces WHERE expires < ?').run(Date.now()-3600000);
    const id=randomBytes(24).toString('hex'),expires=Date.now()+300000;
    const payload=JSON.stringify({wallet:wallet.toLowerCase(),digest,name:name.trim(),description,rights,chainId});
    const message=`RareCognos upload authorization\nOrigin: ${origin}\nChain: ${chainId}\nWallet: ${wallet.toLowerCase()}\nPayload SHA-256: ${hash(payload)}\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\nI confirm I own or have rights to publish this artwork. This signature is not a transaction.`;
    db.prepare('INSERT INTO nonces (id,wallet,origin,payload,message,expires) VALUES (?,?,?,?,?,?)').run(id,wallet.toLowerCase(),origin,payload,message,expires);
    return json(200,{id,message,expires});
   }
   if(path==='/prepare'){
    const n=db.prepare('SELECT * FROM nonces WHERE id=?').get(body.id);if(!n||n.used||n.expires<Date.now()||n.origin!==origin)return json(401,{error:'Upload authorization expired or already used. Sign again.'});
    if(typeof body.signature!=='string'||!await verifyMessage({address:n.wallet,message:n.message,signature:body.signature}))return json(401,{error:'Invalid wallet signature'});
    const p=JSON.parse(n.payload);if(typeof body.file!=='string')return json(400,{error:'Missing image'});const bytes=Buffer.from(body.file,'base64');
    if(bytes.length>MAX_BYTES)return json(413,{error:'Maximum file size is 5 MB'});
    if(hash(bytes)!==p.digest)return json(400,{error:'Image does not match signed digest'});
    const info=await sharp(bytes,{limitInputPixels:25000000}).metadata();if(!['png','jpeg','webp'].includes(info.format)||info.pages>1)return json(415,{error:'Only single-frame PNG, JPEG and WebP images are supported'});
    // Decode and re-encode: signatures/extensions alone are not validation. Strip metadata.
    const image=await sharp(bytes,{limitInputPixels:25000000}).webp({quality:92}).toBuffer();
    if(image.length>MAX_BYTES)return json(413,{error:'Normalized image exceeds 5 MB. Use a smaller image.'});
    const claimed=db.prepare('UPDATE nonces SET used=1 WHERE id=? AND used=0 AND expires>=?').run(body.id,Date.now());if(claimed.changes!==1)return json(409,{error:'Authorization already used'});
    const key=hash(n.payload),existing=db.prepare('SELECT result FROM prepared WHERE id=?').get(key);if(existing)return json(200,JSON.parse(existing.result));
    limit('upload:'+n.wallet+':'+Math.floor(Date.now()/86400000),20,bytes.length);
    const imageURI=await pin(image,'image/webp',p.digest+'.webp');
    const metadata={name:p.name,description:p.description,image:imageURI,creator:n.wallet,attributes:[{trait_type:'Edition',value:'1/1'}],properties:{content_sha256:p.digest,rights_declared:true}};
    const uri=await pin(Buffer.from(JSON.stringify(metadata)),'application/json','metadata.json');
    const result={uri,image:imageURI,name:p.name,description:p.description,creator:n.wallet,chainId,contentHash:p.digest,mode:demo?'local-demo':'ipfs'};
    db.prepare('INSERT OR IGNORE INTO prepared VALUES (?,?)').run(key,JSON.stringify(result));return json(200,result);
   }
   return json(404,{error:'Not found'});
  } catch(e){json(e.status||400,{error:e.status?e.message:'Image validation or storage failed. Check the file and retry.'});}
 });
 await new Promise(r=>server.listen(port,demo?'127.0.0.1':process.env.UPLOAD_HOST||'127.0.0.1',r));
 return {server,db,port:server.address().port,close:()=>new Promise(r=>server.close(()=>{db.close();r();}))};
}
if(process.argv[1]===new URL(import.meta.url).pathname){const service=await startUploadServer();console.log(`Upload service on ${service.port}; ${process.env.UPLOAD_DEMO==='true'?'LOCAL DEMO':'IPFS'}`);}
