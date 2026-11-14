import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Grid2X2, Wallet, X } from "lucide-react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useEffect, useState } from "react";
import { EyeMark, Wordmark } from "./wordmark";
import { chain } from "@/lib/nft/config";
import { addLiteForge, faucetUrl } from "@/lib/nft/network";
import { transactionError } from "@/lib/nft/transaction";
import { signInGmail, useGmail, writeGmail, GOOGLE_CLIENT_ID } from "@/lib/member";
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.87z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.46 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.26v3.09A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.29V6.62H1.26A12 12 0 0 0 0 12c0 1.94.46 3.77 1.26 5.38l4.01-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.45-3.45C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.26 6.62l4.01 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}
export function MarketHeader({ view }: { view: string }) {
  const account = useAccount(),
    connect = useConnect(),
    disconnect = useDisconnect(),
    network = useSwitchChain();
  const [error, setError] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
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
  useEffect(() => {
    const open = () => setLoginOpen(true);
    window.addEventListener("rarecognos-login", open);
    return () => window.removeEventListener("rarecognos-login", open);
  }, []);
  return (
    <header className="market-header">
      <div className="market-header-inner">
        <a href="/" className="market-logo" aria-label="RareCognos home">
          <EyeMark className="logo-eye" />
          <Wordmark />
        </a>
        <nav aria-label="Primary" className="market-nav">
          <a href="/explore" aria-current={view === "Explore" ? "page" : undefined}>
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
        </nav>
        <div className="market-wallet">
          <span className="network-indicator">
            <span aria-hidden="true" />
            {chain.id === 4441 ? "LiteForge Testnet" : "Local Testnet"}
          </span>
          <button
            type="button"
            className="network-link"
            onClick={() => {
              setError("");
              void (async () => {
                const provider = account.connector ? await account.connector.getProvider() : null;
                await addLiteForge(provider);
              })().catch((e) => setError(transactionError(e)));
            }}
          >
            Add LiteForge
          </button>
          <a className="network-link" href={faucetUrl} target="_blank" rel="noreferrer">
            Get zkLTC
          </a>
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
                aria-label={`Account ${address}`}
              >
                <span>{address}</span>
                <ChevronDown size={14} />
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content className="wallet-menu" align="end" sideOffset={12}>
                  <Dropdown.Label className="wallet-menu-label">
                    Wallet<span>{address}</span>
                  </Dropdown.Label>
                  {gmail && (
                    <Dropdown.Label className="wallet-menu-label">
                      Gmail<span>{gmail.email}</span>
                    </Dropdown.Label>
                  )}
                  <Dropdown.Item asChild>
                    <a href="/#my-nfts">
                      <Grid2X2 size={16} />
                      My NFTs
                    </a>
                  </Dropdown.Item>
                  {!gmail && GOOGLE_CLIENT_ID && (
                    <Dropdown.Item
                      onSelect={() => {
                        setError("");
                        void signInGmail().catch((e) => setError(transactionError(e)));
                      }}
                    >
                      <GoogleMark />
                      Continue with Gmail
                    </Dropdown.Item>
                  )}
                  {gmail && (
                    <Dropdown.Item onSelect={() => writeGmail(null)}>
                      <LogOut size={16} />
                      Sign out of Gmail
                    </Dropdown.Item>
                  )}
                  <Dropdown.Separator className="wallet-menu-divider" />
                  <Dropdown.Item onSelect={() => disconnect.disconnect()}>
                    <LogOut size={16} />
                    Disconnect wallet
                  </Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          ) : (
            <Dropdown.Root open={loginOpen} onOpenChange={setLoginOpen}>
              <Dropdown.Trigger className="wallet-button" disabled={connecting}>
                {gmail ? gmail.email.split("@")[0] : connecting ? "Logging in..." : "Log in"}
                <ChevronDown size={14} />
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content className="wallet-menu login-menu" align="end" sideOffset={12}>
                  <Dropdown.Label className="wallet-menu-label">Log in</Dropdown.Label>
                  {gmail ? (
                    <Dropdown.Item onSelect={() => writeGmail(null)}>
                      <LogOut size={16} />
                      Sign out of Gmail
                    </Dropdown.Item>
                  ) : GOOGLE_CLIENT_ID ? (
                    <Dropdown.Item
                      onSelect={() => {
                        setError("");
                        void signInGmail().catch((e) => setError(transactionError(e)));
                      }}
                    >
                      <GoogleMark />
                      Continue with Gmail
                    </Dropdown.Item>
                  ) : null}
                  <Dropdown.Separator className="wallet-menu-divider" />
                  {connect.connectors.length ? (
                    connect.connectors.map((c) => (
                      <Dropdown.Item key={c.uid} onSelect={() => void connectWallet(c)}>
                        <Wallet size={16} />
                        {c.name}
                      </Dropdown.Item>
                    ))
                  ) : (
                    <Dropdown.Item onSelect={() => setError("Install a browser wallet to connect.")}>
                      <Wallet size={16} />
                      Connect wallet
                    </Dropdown.Item>
                  )}
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
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
