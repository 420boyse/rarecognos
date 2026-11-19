import { useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient, useSwitchChain } from "wagmi";
import { concatHex, getCreate2Address, type Hash, type Address } from "viem";
import { chain, explorer } from "@/lib/nft/config";
import { transactionError } from "@/lib/nft/transaction";

export function OpenRelease({ release, artifact, title, explanation, action, ready, refresh }: {
  release: { owner: string; proxy: string; salt: string; address: string };
  artifact: string; title: string; explanation: string; action: string; ready: boolean; refresh: () => void;
}) {
  const target = release.address as Address;
  const account = useAccount(), client = usePublicClient({ chainId: chain.id }), wallet = useWalletClient(), switcher = useSwitchChain();
  const [notice, setNotice] = useState(""), [hash, setHash] = useState<Hash>(), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const owner = account.address?.toLowerCase() === release.owner.toLowerCase();
  async function launch() {
    if (lock.current || !ready || !owner || !wallet.data || !client || account.chainId !== 4441) return;
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/contracts/${artifact}.json`);
      if (!response.ok) throw Error("Deployment file unavailable.");
      const { initCode } = await response.json() as { initCode: Hash };
      const to = release.proxy as Address, salt = release.salt as Hash;
      if (getCreate2Address({ from: to, salt, bytecode: initCode }) !== target) throw Error("Deployment file mismatch.");
      if (await client.getCode({ address: target })) { refresh(); return; }
      const data = concatHex([salt, initCode]);
      const request = { account: wallet.data.account, to, data, value: 0n };
      const simulated = await client.call(request);
      if (simulated.data?.toLowerCase() !== target.toLowerCase()) throw Error("Deployment simulation mismatch.");
      setNotice("Confirm deployment in your wallet.");
      const submitted = await wallet.data.sendTransaction({ ...request, chain });
      setHash(submitted);
      setNotice("Waiting for deployment confirmation…");
      const receipt = await client.waitForTransactionReceipt({ hash: submitted });
      if (receipt.status !== "success") throw Error("Deployment reverted.");
      setNotice("Deployment confirmed.");
      refresh();
    } catch (e) { setNotice(transactionError(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="market-notice"><h2>{title}</h2>
    <p>{explanation} Creator wallet: {release.owner}.</p>
    {!account.isConnected ? <button className="nft-button" onClick={() => window.dispatchEvent(new Event("rarecognos-login"))}>Connect creator wallet</button>
      : !owner ? <p>Connect the creator wallet shown above.</p>
      : account.chainId !== 4441 ? <button className="nft-button" onClick={() => switcher.switchChain({chainId:4441})}>Switch to LiteForge</button>
      : <button className="primary-action" disabled={busy || !ready || !!hash} onClick={() => void launch()}>{action}</button>}
    {notice && <p role="status">{notice}</p>}{hash && <a href={`${explorer}/tx/${hash}`}>View deployment</a>}
  </section>;
}
