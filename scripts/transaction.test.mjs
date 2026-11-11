import {test} from 'node:test';
import assert from 'node:assert/strict';
import {followReceipt,resumeTransaction,sameTransaction} from '../src/lib/nft/transaction.ts';
const hash='0x'+'1'.repeat(64),hash2='0x'+'2'.repeat(64),wallet='0x'+'1'.repeat(40),contract='0x'+'2'.repeat(40);
const record=()=>({id:hash,hash,chainId:31337,wallet,contract,kind:'buy',data:'0xabcd',value:'10',block:'5',nonce:1,status:'pending'});
const tx={hash:hash2,from:wallet,to:contract,input:'0xabcd',value:10n,nonce:1};
test('repricing updates hash; cancellation and replacement never report success',async()=>{
 const r=record();const receipt={status:'success',transactionHash:hash2};const c={waitForTransactionReceipt:async o=>{o.onReplaced({reason:'repriced',transaction:tx});return receipt;}};
 assert.equal((await followReceipt(c,r,()=>{})).transactionHash,hash2);assert.equal(r.hash,hash2);assert.equal(r.status,'confirmed');
 for(const reason of ['cancelled','replaced']){const cancelled=record();await assert.rejects(()=>followReceipt({waitForTransactionReceipt:async o=>{o.onReplaced({reason,transaction:{...tx,input:'0x'}});return receipt;}},cancelled,()=>{}),/cancelled or replaced/);assert.equal(cancelled.status,'replaced');}
});
test('reload: recover original receipt, recover replacement by nonce, reject changed action',async()=>{
 const c={chain:{id:31337},getTransactionReceipt:async()=>{throw Error('pending');},getTransactionCount:async()=>2,getBlockNumber:async()=>6n,getBlock:async()=>({transactions:[tx]}),waitForTransactionReceipt:async()=>({status:'success',transactionHash:hash2})};
 const r=record();await resumeTransaction(c,r,()=>{});assert.equal(r.hash,hash2);assert.equal(r.status,'confirmed');
 const changed=record();await assert.rejects(()=>resumeTransaction({...c,getBlock:async()=>({transactions:[{...tx,value:9n}]})},changed,()=>{}),/cancelled or replaced/);
 const mined=record();await resumeTransaction({...c,getTransactionReceipt:async()=>({status:'reverted'})},mined,()=>{});assert.equal(mined.status,'failed');
 assert.equal(sameTransaction(record(),{...tx,to:wallet}),false);
});
