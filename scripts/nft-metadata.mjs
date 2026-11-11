import fs from 'node:fs';
const origin=process.argv[2];
if(!origin || !/^https:\/\//.test(origin)) throw Error('Usage: node scripts/nft-metadata.mjs https://YOUR_PUBLIC_ORIGIN');
const ids=['nocturne','blue-index','red-aperture','second-sight'];
const titles=['Nocturne','Blue Index','Red Aperture','Second Sight'];
fs.mkdirSync('public/metadata',{recursive:true});
ids.forEach((id,i)=>fs.writeFileSync(`public/metadata/${i}.json`,JSON.stringify({name:titles[i],description:'RareCognos testnet collection. Repeatable studio edition.',image:new URL(`/art/${id}.jpg`,origin).href,attributes:[{trait_type:'Artwork',value:id}]},null,2)));
console.log('Wrote 4 metadata JSON files. Publish /metadata and /art before testnet deployment.');
