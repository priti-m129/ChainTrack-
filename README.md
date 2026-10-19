# ChainTrack – Decentralized Supply Chain Tracker (DApp)

BT Mini Project 2026-27. A blockchain DApp that tracks a product from **Manufacturer → many middlemen → Retailer → Sold**,
including **international shipments (e.g. USA → India)** with customs clearance and distance tracking.
History is immutable, transparent and publicly auditable – no central authority.

**Stack:** Solidity 0.8.24 · Hardhat · ethers.js v6 · MetaMask · HTML/CSS/JS

## What's new in this version (long-distance / many middlemen)
The original 3 steps are kept, but **Step 2 (Transfer) can repeat any number of times**:

```
Manufacturer (USA) → Distributor → Shipper → Customs (India) → Warehouse → Retailer → Sold
```

- New roles: **Shipper, Warehouse, Customs** (plus Manufacturer, Distributor, Retailer)
- Every hop stores **location, country and distance (km)** from the previous checkpoint
- Product keeps a running **total distance** (shown in the table and tracker)
- **Customs rule:** imported goods can't reach a store until a Customs officer calls *Clear Customs*;
  Customs can't pass the goods on before clearing them
- Domestic goods (same country) skip customs automatically
- Tracker shows route, chips (total km, checkpoints, customs status) and who handled it at each point

## Prerequisites
- [Node.js](https://nodejs.org) 18, 20 or 22 LTS
- [VS Code](https://code.visualstudio.com) (optional)
- [MetaMask](https://metamask.io) browser extension (Chrome / Edge / Brave / Firefox)

## Run it (3 terminals in VS Code: Terminal → New Terminal)

**Step 0 – install (once)**
```bash
npm install
```

**Terminal 1 – start the local blockchain** (keep it running)
```bash
npm run node
```
It prints 20 test accounts with private keys.

**Terminal 2 – deploy + seed demo users (+ optional automatic demo)**
```bash
npm run deploy
npm run seed
npm run demo      # optional: runs a full USA -> India journey (product #1)
```
`deploy` writes the contract address/ABI to `frontend/contract.json`.
> Every time you restart `npm run node`, run `deploy` and `seed` again, and in MetaMask use
> *Settings → Advanced → Clear activity tab data* to reset nonces.

**Terminal 3 – start the website**
```bash
npm run frontend
```
Opens http://localhost:3000

## MetaMask setup
The app auto-adds the **Hardhat Local** network (RPC `http://127.0.0.1:8545`, chain ID `31337`, symbol ETH).
Import accounts via *Import account → private key* using the keys printed by `npm run node`:

| Hardhat account | Role in demo |
|---|---|
| #0 | Admin |
| #1 | Manufacturer – Acme Factory (USA) |
| #2 | Distributor – FastMove Logistics |
| #3 | Retailer – City Mart (India) |
| #4 | Shipper – OceanLine Shipping |
| #5 | Customs – India Customs |
| #6 | Warehouse – Mumbai Warehouse |

(These keys are public test keys – never use them on a real network.)

## Demo flow A – instant
1. `npm run demo`
2. Open the site, connect with any account, **Track** product `1` – you see 8 checkpoints and 19,990 km.

## Demo flow B – manual, with MetaMask (switch account before each step)
| # | Account | Action | Values |
|---|---|---|---|
| 1 | #1 Manufacturer | Create Product | Laptop · Los Angeles Plant · USA |
| 2 | #1 | Transfer → #2 address | Chicago Hub · USA · 3000 km |
| 3 | #2 Distributor | Transfer → #4 address | Los Angeles Port · USA · 2800 km |
| 4 | #4 Shipper | Transfer → #5 address | Mumbai Port · India · 14000 km |
| 5 | #5 Customs | Clear Customs | Duty paid |
| 6 | #5 | Transfer → #6 address | Bhiwandi Warehouse · India · 40 km |
| 7 | #6 Warehouse | Transfer → #3 address | Pune Store · India · 150 km |
| 8 | #3 Retailer | Mark Sold | Sold to customer |
| 9 | anyone | Track `1` | full timeline + total distance |

**Try the safety rules (these must fail):** skip step 5 and send to the retailer
→ *Customs clearance required for imported goods*; Customs moving goods on before clearing
→ *Clear customs before moving the product on*; Manufacturer sending straight to the retailer
→ *Manufacturer must send to a Distributor, Shipper or Warehouse*.

## Tests
```bash
npm test
```
15 tests: roles, 3-step domestic lifecycle, USA→India with 8 checkpoints, customs gates, distance totals, guard rails.

## Project structure
```
contracts/SupplyChain.sol    smart contract
test/SupplyChain.test.js     unit tests (15)
scripts/deploy.js            deploys + exports ABI to frontend
scripts/seed.js              registers 6 demo participants
scripts/demo.js              runs a full USA -> India journey
frontend/                    index.html, app.js, style.css
hardhat.config.js            Hardhat config (localhost:8545, viaIR enabled)
```

## Smart-contract summary
| Function | Who | Purpose |
|---|---|---|
| `registerParticipant` | Admin | Approve an address with a role |
| `createProduct(name, origin, country)` | Manufacturer | Step 1 |
| `transferProduct(id, to, location, country, distanceKm, note)` | Current holder | Step 2 (repeatable) |
| `clearCustoms(id, note)` | Customs holder | Approve import |
| `markSold(id, note)` | Retailer holder | Step 3 |
| `getProduct / getHistory / getAllProducts` | Anyone | Verify |

## Limitations (good to mention in viva)
- Location and distance are **entered by the sender**; the blockchain proves who entered it and when, but not that it is true.
  Real systems add GPS/IoT sensors or oracles.
- Everything is public on-chain (no privacy for business data).
- Participants are approved by the admin off-chain (KYC would be needed in real life).
- One-step transfer: the sender chooses the receiver. A two-step "sender offers, receiver accepts" flow would be safer.

## Deploying to a public testnet (optional)
Add a `sepolia` network with your RPC URL and a private key (from a `.env` file) to `hardhat.config.js`, then
`npx hardhat run scripts/deploy.js --network sepolia`. Add Sepolia in MetaMask and update `HARDHAT_CHAIN_ID` in `frontend/app.js`.

## How it maps to the DApp guidelines
| Guideline concept | In this project |
|---|---|
| Decentralization | Logic + data live on the blockchain, no central server |
| Smart contracts | `SupplyChain.sol` enforces roles, workflow and customs rules |
| Immutability & auditability | Append-only history per product + events |
| Open source | All code in this repo |
| Front-end + web3 | HTML/JS with ethers.js via MetaMask |
| Testing & deployment | Hardhat tests, local deploy/seed/demo scripts |
