# Local OKX deployment UI verification

- 2026-11-11: focused Playwright verification passed with a mock EIP-6963 wallet and mocked RPC only; no real wallet, signature or transaction was used.
- Connection, chain 4441, wrong-network blocking and mock switch, mock balance display, collection and market simulations: PASS.
- Empty, malformed and zero treasury blocked; displayed 0.25% and treasury match encoded market constructor: PASS.
- Wallet rejection and a mock reverted receipt did not deploy or advance to marketplace: PASS.
- Fixed missing wallet balance in the local deployment panel. The 0.1 zkLTC balance and fee estimates in screenshots are mock values, not current Zeeve values.
- Screenshots: `okx-wrong-network.png`, `okx-collection-simulation.png`, `okx-market-simulation.png`.
- Real OKX extension connection, live gas/balance, signing and deployment remain unverified; collection and marketplace require separate user approvals.