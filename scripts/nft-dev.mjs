import {spawn} from 'node:child_process';
import {localSetup} from './nft-local.mjs';
import {startUploadServer} from '../upload-service/server.mjs';
const port=process.env.NFT_DEV_PORT||'8086';
const s=await localSetup(8545);
const upload=await startUploadServer({demo:true,port:8787,origins:[`http://127.0.0.1:${port}`,`http://localhost:${port}`]});
console.log('Local chain 31337 + upload demo. Test wallets can be funded using local evm_setAccountBalance.');
const app=spawn(process.platform==='win32'?'npm.cmd':'npm',['run','dev','--','--host','127.0.0.1','--port',port],{stdio:'inherit',shell:process.platform==='win32',env:{...process.env,VITE_NFT_LOCAL:'true',VITE_NFT_COLLECTION:s.nft.address,VITE_NFT_MARKET:s.market.address,VITE_DROP_FACTORY:s.factory.address,VITE_UPLOAD_API_URL:'http://127.0.0.1:8787',VITE_IPFS_GATEWAY:'http://127.0.0.1:8787/ipfs/'}});
async function stop(){app.kill();await upload.close();await s.server.close();process.exit();}process.on('SIGINT',stop);process.on('SIGTERM',stop);
