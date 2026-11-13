import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Grid2X2, Wallet, X } from "lucide-react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useState } from "react";
import { EyeMark, Wordmark } from "./wordmark";
import { chain } from "@/lib/nft/config";
import { transactionError } from "@/lib/nft/transaction";
import { signInGmail, useGmail, writeGmail } from "@/lib/member";
export function MarketHeader({ view }: { view: string }) {
  const account = useAccount(),
    connect = useConnect(),
    disconnect = useDisconnect(),
    network = useSwitchChain();
  const [error, setError] = useState("");
  const gmail = useGmail();
  const member = Boolean(account.address || gmail);
  const wrong = account.isConnected && account.chainId !== chain.id;
  const address = account.address
    ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
    : "";
  const connecting = connect.isPending || account.status === "reconnecting";
  const connectWallet = async (connector: (typeof connect.connectors)[number]) => {
    setError("");
    try {
      if(connector.type==='injected'&&!await connector.getProvider())throw Error('No browser wallet found. Open this page in a wallet browser. QR connection requires the mobile wallet service setting.');
      await connect.connectAsync({ connector });
    } catch (e) {
      setError(transactionError(e));
    }
  };
  const switchNetwork = async () => {
    setError("");
    try {
      await network.switchChainAsync({ chainId: chain.id });
    } catch (e) {
      setError(transactionError(e));
    }
  };
  return (
    <header className="market-header">
      <div className="market-header-inner">
        <a href="/" className="market-logo" aria-label="RareCognos home">
          <EyeMark className="logo-eye" />
          <Wordmark />
        </a>
        <nav aria-label="Primary" className="market-nav">
          <a href="/#explore" aria-current={view === "Explore" ? "page" : undefined}>
            Explore
          </a>
          <a href="/create" aria-current={view === "Create" ? "page" : undefined}>
            Create
          </a>
          {member && (
            <a href="/quest" aria-current={view === "Quest" ? "page" : undefined}>
              Quest
            </a>
          )}
          <a href="/referral" aria-current={view === "Referral" ? "page" : undefined}>
            Referral
          </a>
        </nav>
        <div className="market-wallet">
          {gmail ? (
            <button className="wallet-button" onClick={() => writeGmail(null)} title={gmail.email}>
              {gmail.email.split("@")[0]}
            </button>
          ) : (
            <button
              className="wallet-button"
              onClick={() => {
                setError("");
                void signInGmail().catch((e) => setError(transactionError(e)));
              }}
            >
              Gmail
            </button>
          )}
          <span className="network-indicator">
            <span aria-hidden="true" />
            {chain.id === 4441 ? "LiteForge Testnet" : "Local Testnet"}
          </span>
          {wrong && (
            <button
              className="wallet-button switch-button"
              disabled={network.isPending}
              onClick={() => void switchNetwork()}
            >
              {network.isPending ? "Switching..." : "Switch to LiteForge"}
            </button>
          )}
          {account.isConnected ? (
            <Dropdown.Root>
              <Dropdown.Trigger
                className={"wallet-button " + (wrong ? "wallet-address-compact" : "")}
                aria-label={`Wallet ${address}`}
              >
                <span>{address}</span>
                <ChevronDown size={14} />
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content className="wallet-menu" align="end" sideOffset={12}>
                  <Dropdown.Label className="wallet-menu-label">
                    Connected wallet<span>{address}</span>
                  </Dropdown.Label>
                  <Dropdown.Item asChild>
                    <a href="/#my-nfts">
                      <Grid2X2 size={16} />
                      My NFTs
                    </a>
                  </Dropdown.Item>
                  <Dropdown.Separator className="wallet-menu-divider" />
                  <Dropdown.Item onSelect={() => disconnect.disconnect()}>
                    <LogOut size={16} />
                    Disconnect
                  </Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          ) : connect.connectors.length > 1 ? (
            <Dropdown.Root>
              <Dropdown.Trigger className="wallet-button" disabled={connecting}>
                <Wallet size={16} />
                {connecting ? "Connecting..." : "Connect wallet"}
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content className="wallet-menu" align="end" sideOffset={12}>
                  {connect.connectors.map((c) => (
                    <Dropdown.Item key={c.uid} onSelect={() => void connectWallet(c)}>
                      {c.name}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          ) : (
            <button
              className="wallet-button"
              disabled={connecting}
              onClick={() => {
                const c = connect.connectors[0];
                if (c) void connectWallet(c);
                else setError("Install an injected browser wallet to connect.");
              }}
            >
              <Wallet size={16} />
              {connecting ? "Connecting..." : "Connect wallet"}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="wallet-error" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss wallet error" onClick={() => setError("")}>
            <X size={18} />
          </button>
        </div>
      )}
    </header>
  );
}
