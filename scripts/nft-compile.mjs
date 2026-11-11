import fs from 'node:fs';
import solc from 'solc';
const input = { language:'Solidity', sources:{'RareCognos.sol':{content:fs.readFileSync('contracts/RareCognos.sol','utf8')},'RareCognosDrops.sol':{content:fs.readFileSync('contracts/RareCognosDrops.sol','utf8')}}, settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}} };
const out = JSON.parse(solc.compile(JSON.stringify(input), {import:p=>({contents:fs.readFileSync('node_modules/'+p,'utf8')})}));
if (out.errors?.some(e=>e.severity==='error')) throw Error(JSON.stringify(out.errors));
fs.mkdirSync('artifacts',{recursive:true});
fs.mkdirSync('public/contracts',{recursive:true});
for(const path of Object.keys(out.sources)) if(!input.sources[path]) input.sources[path]={content:fs.readFileSync('node_modules/'+path,'utf8')};
fs.writeFileSync('artifacts/compiler-input.json',JSON.stringify(input,null,2));
for (const source of ['RareCognos.sol','RareCognosDrops.sol']) for (const [name,c] of Object.entries(out.contracts[source])) {
 const artifact={abi:c.abi,bytecode:'0x'+c.evm.bytecode.object};
 fs.writeFileSync('artifacts/'+name+'.json',JSON.stringify(artifact,null,2));
 fs.writeFileSync('public/contracts/'+name+'.json',JSON.stringify(artifact));
 fs.writeFileSync('src/lib/nft/'+name+'.ts','export const abi = '+JSON.stringify(c.abi)+' as const;\n');
}
console.log(`Compiled Solidity ${solc.version()}, Shanghai, optimizer 200`);
