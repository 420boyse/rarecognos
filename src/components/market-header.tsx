import * as Dropdown from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, LogOut, Grid2X2, QrCode, Wallet, Search, X } from "lucide-react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useEffect, useState } from "react";
import { EyeMark, Wordmark } from "./wordmark";
import { useWalletXp } from "@/lib/nft/use-wallet-xp";
import { chain } from "@/lib/nft/config";
import { addLiteForge, faucetUrl } from "@/lib/nft/network";
import { transactionError } from "@/lib/nft/transaction";
import { signInGmail, useGmail, writeGmail, GOOGLE_CLIENT_ID } from "@/lib/member";
function WalletMark({ name }: { name: string }) {
  const normalized = name.toLowerCase();
  const icon = normalized.includes("metamask") ? "metamask" : normalized.includes("trust") ? "trust" : normalized.includes("okx") || normalized.includes("okex") ? "okx" : normalized.includes("coinbase") || normalized.includes("base account") ? "coinbase" : null;
  return icon ? <img className="wallet-brand-icon" src={`/brand/wallets/${icon}.svg`} alt="" aria-hidden="true" /> : <Wallet size={24} aria-hidden="true" />;
}
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
const walletAppLinks = () => {
  const url = new URL(window.location.href);
  const href = url.href;
  return [
    { name: "MetaMask", href: `https://metamask.app.link/dapp/${url.host}${url.pathname}${url.search}${url.hash}` },
    { name: "Trust Wallet", href: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(href)}` },
    { name: "OKX Wallet", href: `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(href)}` },
  ];
};
export function MarketHeader({ view }: { view: string }) {
  const account = useAccount(),
    connect = useConnect(),
    disconnect = useDisconnect(),
    network = useSwitchChain();
  const [error, setError] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [linkStatus, setLinkStatus] = useState("");
  const [walletApps, setWalletApps] = useState<{ name: string; href: string }[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [available, setAvailable] = useState<typeof connect.connectors | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const gmail = useGmail();
  const [menuOpen, setMenuOpen] = useState(false);
  const progress = useWalletXp(account.address, menuOpen);
  const wrong = account.isConnected && account.chainId !== chain.id;
  const address = account.address
    ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
    : "";
  const connecting = connect.isPending || account.status === "reconnecting";
  const connectWallet = async (connector: (typeof connect.connectors)[number]) => {
    setConnectionError("");
    const isWalletConnect = connector.id === "walletConnect";
    if (isWalletConnect) setLoginOpen(false);
    try {
      if (connector.type === "injected" && !await connector.getProvider()) {
        throw Error("This wallet is unavailable. Open RareCognos in your wallet app or try a different wallet.");
      }
      await connect.connectAsync({ connector, ...(isWalletConnect ? { chainId: chain.id } : {}) });
      setLoginOpen(false);
    } catch (e) {
      setConnectionError(transactionError(e));
      setLoginOpen(true);
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
    const open = () => { if (!account.isConnected && !connecting) setLoginOpen(true); };
    window.addEventListener("rarecognos-login", open);
    return () => window.removeEventListener("rarecognos-login", open);
  }, [account.isConnected, connecting]);
  useEffect(() => {
    setLinkStatus("");
    if (loginOpen && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      setIsMobile(true);
      setWalletApps(walletAppLinks());
    }
  }, [loginOpen]);
  useEffect(() => {
    if (!loginOpen) return;
    let cancel = false;
    void (async () => {
      setAvailable(null);
      const detected = await Promise.all(connect.connectors.map(async (connector) => {
        if (connector.type !== "injected") return { connector };
        try {
          const provider = await connector.getProvider();
          if (provider && (provider as { isPhantom?: boolean }).isPhantom) return null;
          return provider ? { connector, provider } : null;
        } catch {
          return null;
        }
      }));
      const list: (typeof connect.connectors)[number][] = [];
      const providers = new Set<unknown>();
      // Prefer branded connectors when the same provider also appears as Browser wallet.
      for (const entry of [...detected.filter((item) => item?.connector.id !== "injected"), ...detected.filter((item) => item?.connector.id === "injected")]) {
        if (!entry || (entry.provider && providers.has(entry.provider))) continue;
        if (entry.provider) providers.add(entry.provider);
        list.push(entry.connector);
      }
      if (!cancel) setAvailable(list);
    })();
    return () => {
      cancel = true;
    };
  }, [connect.connectors, loginOpen]);
  const qrConnector = connect.connectors.find((connector) => connector.id === "walletConnect");
  const browserWallets = available?.filter((connector) => connector.id !== "walletConnect" && connector.type !== "coinbaseWallet" && !connector.name.toLowerCase().includes("phantom"));
  const coinbaseConnector = available?.find((connector) => connector.type === "coinbaseWallet");
  const hasCoinbase = browserWallets?.some((connector) => /coinbase/i.test(connector.name));
  const shownWalletApps = walletApps.filter((app) => !browserWallets?.some((connector) => connector.name.toLowerCase().includes(app.name.toLowerCase().replace(" wallet", ""))));
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
          <a href="/quest" aria-current={view === "Quest" ? "page" : undefined}>
            Quest
          </a>
        </nav>
        <form className="market-global-search" method="get" action="/explore" role="search">
          <Search size={17} aria-hidden="true" />
          <input type="search" name="q" maxLength={120} placeholder="Search NFTs, collections, or creators" aria-label="Search NFTs, collections, or creators" />
        </form>
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
            <Dropdown.Root onOpenChange={setMenuOpen}>
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
                  <Dropdown.Item asChild>
                    <a href="/quest">
                      Total XP<span>{progress.data?.xp ?? "—"}</span>
                    </a>
                  </Dropdown.Item>
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
            <Dialog.Root open={loginOpen} onOpenChange={(open) => {
              setLoginOpen(open);
              if (open) setConnectionError("");
            }}>
              <Dialog.Trigger className="wallet-button" disabled={connecting}>
                {gmail ? gmail.email.split("@")[0] : connecting ? "Connecting…" : "Connect wallet"}
                <ChevronDown size={14} />
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="wallet-dialog-overlay" />
                <Dialog.Content className="wallet-dialog">
                  <div className="wallet-dialog-header">
                    <div>
                      <Dialog.Title>Connect a wallet</Dialog.Title>
                      <Dialog.Description>Use a wallet that supports custom EVM networks to connect to RareCognos on LiteForge testnet.</Dialog.Description>
                    </div>
                    <Dialog.Close className="wallet-dialog-close" aria-label="Close wallet options">
                      <X size={18} aria-hidden="true" />
                    </Dialog.Close>
                  </div>
                  {connectionError && <p className="wallet-dialog-error" role="alert">{connectionError}</p>}
                  <div className="wallet-dialog-options">
                    {browserWallets?.map((connector) => (
                      <button type="button" key={connector.uid} disabled={connecting} onClick={() => void connectWallet(connector)}>
                        <WalletMark name={connector.name} />
                        <span>{connector.name === "Injected" ? "Browser wallet" : connector.name.replace(/\(injected\)/i, "").trim()}<small>Connect in this browser</small></span>
                      </button>
                    ))}
                    {qrConnector && (
                      <button type="button" disabled={connecting} onClick={() => void connectWallet(qrConnector)}>
                        <QrCode size={18} aria-hidden="true" />
                        <span>WalletConnect<small>Scan a QR code or open a wallet app</small></span>
                      </button>
                    )}
                    {!available && <p role="status">Checking for browser wallets…</p>}
                    {shownWalletApps.map((app) => (
                      <a key={app.name} href={app.href}>
                        <WalletMark name={app.name} />
                        <span>{app.name}<small>Open this page in the wallet app</small></span>
                      </a>
                    ))}
                    {isMobile && coinbaseConnector && !hasCoinbase && (
                      <button type="button" disabled={connecting} onClick={() => void connectWallet(coinbaseConnector)}>
                        <WalletMark name="Coinbase" />
                        <span>Coinbase Wallet<small>Connect with the wallet app</small></span>
                      </button>
                    )}
                    {!isMobile && available && !hasCoinbase && (
                      <a href="https://www.coinbase.com/wallet" target="_blank" rel="noreferrer">
                        <WalletMark name="Coinbase" />
                        <span>Coinbase Wallet<small>Get the browser wallet</small></span>
                      </a>
                    )}
                    {walletApps.length > 0 && (
                      <p>Using another wallet? Open RareCognos in its built-in browser, then connect there.</p>
                    )}
                    {available && !browserWallets?.length && !qrConnector && !walletApps.length && (
                      <p>No browser wallet detected. Install a browser wallet or open this page inside your wallet app on your phone.</p>
                    )}
                  </div>
                  <div className="wallet-dialog-footer">
                    <button type="button" className="nft-button" onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(window.location.href);
                        setLinkStatus("Link copied. Open it in your wallet browser.");
                      } catch {
                        setLinkStatus(window.location.href);
                      }
                    }}>Copy page link</button>
                    {linkStatus && <span role="status">{linkStatus}</span>}
                    <a href="/how">Connection help</a>
                    <a href={faucetUrl} target="_blank" rel="noreferrer">Get test zkLTC</a>
                    {gmail ? (
                      <button type="button" onClick={() => writeGmail(null)}>Sign out of Gmail</button>
                    ) : GOOGLE_CLIENT_ID ? (
                      <button type="button" onClick={() => {
                        setConnectionError("");
                        void signInGmail().catch((e) => setConnectionError(transactionError(e)));
                      }}><GoogleMark /> Continue with Gmail</button>
                    ) : null}
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
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
