import {privateKeyToAccount} from 'viem/accounts';
import ganache from 'ganache';
import fs from 'node:fs';
import {createPublicClient,createWalletClient,http,defineChain,encodeDeployData} from 'viem';
export async function localSetup(port=0){
 const server=ganache.server({chain:{chainId:31337,hardfork:'shanghai'},wallet:{totalAccounts:3},logging:{quiet:true}});
 await server.listen(port,'127.0.0.1');
 const rpc=`http://127.0.0.1:${server.address().port}`;
 const chain=defineChain({id:31337,name:'Local',nativeCurrency:{name:'zkLTC',symbol:'zkLTC',decimals:18},rpcUrls:{default:{http:[rpc]}}});
 const client=createPublicClient({chain,transport:http(rpc)});
 const addresses=await client.request({method:'eth_accounts'});
 const wallets=addresses.map(account=>createWalletClient({account:privateKeyToAccount(server.provider.getInitialAccounts()[account].secretKey),chain,transport:http(rpc)}));
 const nft=JSON.parse(fs.readFileSync('artifacts/RareCognos.json'));
 const market=JSON.parse(fs.readFileSync('artifacts/RareCognosMarket.json'));
 async function deploy(artifact,args){
  const data=encodeDeployData({...artifact,args});
  await client.call({account:addresses[0],data});
  const h=await wallets[0].deployContract({...artifact,args});
  const receipt=await client.waitForTransactionReceipt({hash:h});
  if(receipt.status!=='success') throw Error('Deploy failed');
  return receipt.contractAddress;
 }
 const collection=await deploy(nft,[]);
 const marketplace=await deploy(market,[collection,addresses[2]]);
 const factoryArtifact=JSON.parse(fs.readFileSync('artifacts/RareCognosDropFactory.json'));
 const dropFactory=await deploy(factoryArtifact,[addresses[2]]);
 return {server,client,wallets,addresses,nft:{address:collection,abi:nft.abi},market:{address:marketplace,abi:market.abi},factory:{address:dropFactory,abi:factoryArtifact.abi}};
}
