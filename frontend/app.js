// ChainTrack frontend – talks to the SupplyChain contract through MetaMask + ethers v6
const STATUS = ["Manufactured", "In Transit", "In Store", "Sold", "At Customs", "Customs Cleared"];
const ROLE = ["None", "Manufacturer", "Distributor", "Retailer", "Shipper", "Customs", "Warehouse"];
const HARDHAT_CHAIN_ID = "0x7a69"; // 31337

const R = { MAKER: 1, DIST: 2, RETAIL: 3, SHIP: 4, CUSTOMS: 5, WARE: 6 };

let provider, signer, contract, account, role = 0, isAdmin = false;
const people = {}; // address(lowercase) -> { name, role }

const $ = (id) => document.getElementById(id);
const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const nameOf = (a) => (people[a.toLowerCase()] ? people[a.toLowerCase()].name : short(a));
const km = (n) => Number(n).toLocaleString() + " km";

function notify(msg, type = "info") {
  const n = $("notice");
  n.textContent = msg;
  n.className = "notice " + type;
}

function clearNotice() { $("notice").className = "notice hidden"; }

function errMsg(e) {
  return e?.reason || e?.shortMessage || e?.info?.error?.message || e?.message || String(e);
}

async function loadConfig() {
  const res = await fetch("contract.json", { cache: "no-store" });
  if (!res.ok) throw new Error("contract.json not found. Run: npm run deploy");
  return res.json();
}

async function ensureNetwork() {
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId === HARDHAT_CHAIN_ID) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HARDHAT_CHAIN_ID }],
    });
  } catch (e) {
    if (e.code === 4902 || e.code === -32603) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: HARDHAT_CHAIN_ID,
          chainName: "Hardhat Local",
          rpcUrls: ["http://127.0.0.1:8545"],
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        }],
      });
    } else throw e;
  }
}

async function connect() {
  if (!window.ethereum) {
    notify("MetaMask not found. Install the MetaMask browser extension first.", "err");
    return;
  }
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    await ensureNetwork();

    const cfg = await loadConfig();
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    account = await signer.getAddress();

    const code = await provider.getCode(cfg.address);
    if (code === "0x") {
      throw new Error("No contract at this address. Restart the node? Run `npm run deploy` again.");
    }
    contract = new ethers.Contract(cfg.address, cfg.abi, signer);

    $("account").textContent = short(account);
    $("connectBtn").textContent = "Connected";
    await loadParticipants();
    await refreshRole();
    await loadProducts();
    clearNotice();
  } catch (e) {
    notify(errMsg(e), "err");
  }
}

async function refreshRole() {
  const admin = await contract.admin();
  isAdmin = admin.toLowerCase() === account.toLowerCase();
  const p = await contract.participants(account);
  role = p.active ? Number(p.role) : 0;

  const badge = $("roleBadge");
  badge.classList.remove("hidden");
  badge.textContent = isAdmin ? "Admin" : role ? ROLE[role] : "Viewer";

  const canTransfer = [R.MAKER, R.DIST, R.SHIP, R.CUSTOMS, R.WARE].includes(role);
  $("adminCard").classList.toggle("hidden", !isAdmin);
  $("makerCard").classList.toggle("hidden", role !== R.MAKER);
  $("transferCard").classList.toggle("hidden", !canTransfer);
  $("customsCard").classList.toggle("hidden", role !== R.CUSTOMS);
  $("soldCard").classList.toggle("hidden", role !== R.RETAIL);
}

async function loadParticipants() {
  const events = await contract.queryFilter(contract.filters.ParticipantRegistered(), 0);
  const addrs = [...new Set(events.map((e) => e.args.account))];
  Object.keys(people).forEach((k) => delete people[k]);
  const rows = $("partRows");
  const list = $("partList");
  rows.innerHTML = "";
  list.innerHTML = "";

  for (const a of addrs) {
    const p = await contract.participants(a);
    if (!p.active) continue;
    people[a.toLowerCase()] = { name: p.name, role: Number(p.role) };

    const tr = document.createElement("tr");
    tr.innerHTML = `<td></td><td></td><td class="mono"></td><td><button class="small secondary">Use</button></td>`;
    tr.children[0].textContent = p.name;
    tr.children[1].textContent = ROLE[Number(p.role)];
    tr.children[2].textContent = a;
    tr.querySelector("button").onclick = () => { $("tTo").value = a; $("tTo").focus(); };
    rows.appendChild(tr);

    const opt = document.createElement("option");
    opt.value = a;
    opt.label = `${p.name} (${ROLE[Number(p.role)]})`;
    list.appendChild(opt);
  }
  if (!rows.children.length) {
    rows.innerHTML = `<tr><td colspan="4" class="mono">No participants registered yet.</td></tr>`;
  }
}

async function tx(btn, fn, okMsg) {
  if (!contract) return notify("Connect your wallet first.", "err");
  btn.disabled = true;
  notify("Waiting for MetaMask confirmation…", "info");
  try {
    const t = await fn();
    notify("Transaction sent, waiting to be mined…", "info");
    await t.wait();
    notify(okMsg, "ok");
    await loadParticipants();
    await loadProducts();
  } catch (e) {
    notify(errMsg(e), "err");
  } finally {
    btn.disabled = false;
  }
}

async function loadProducts() {
  if (!contract) return;
  const list = await contract.getAllProducts();
  const rows = $("productRows");
  rows.innerHTML = "";
  if (list.length === 0) {
    rows.innerHTML = `<tr><td colspan="6" class="mono">No products yet.</td></tr>`;
    return;
  }
  [...list].reverse().forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${p.id}</td>
      <td></td>
      <td></td>
      <td><span class="status s${Number(p.status)}">${STATUS[Number(p.status)]}</span></td>
      <td>${km(p.totalDistanceKm)}</td>
      <td></td>`;
    tr.children[1].textContent = p.name;   // textContent avoids HTML injection
    tr.children[2].textContent = `${p.origin}, ${p.originCountry}`;
    tr.children[5].innerHTML = `<span class="mono"></span>`;
    tr.children[5].firstChild.textContent = `${nameOf(p.currentHolder)} (${short(p.currentHolder)})`;
    rows.appendChild(tr);
  });
}

async function trackProduct() {
  if (!contract) return notify("Connect your wallet first.", "err");
  const id = $("trackId").value;
  const out = $("trackResult");
  out.innerHTML = "";
  if (!id) return;
  try {
    const p = await contract.getProduct(id);
    const history = await contract.getHistory(id);

    const head = document.createElement("div");
    head.style.marginTop = "14px";
    head.innerHTML = `<strong></strong> <span class="status s${Number(p.status)}">${STATUS[Number(p.status)]}</span>
      <div class="route"></div>
      <div class="mono">Manufacturer: ${p.manufacturer}<br/>Current holder: ${p.currentHolder}</div>`;
    head.querySelector("strong").textContent = `#${p.id} ${p.name}`;

    // summary chips: total distance, checkpoints, customs
    const route = head.querySelector(".route");
    const chips = [
      [`Total distance: ${km(p.totalDistanceKm)}`, ""],
      [`${history.length} checkpoints`, ""],
      [`Origin: ${p.originCountry}`, ""],
      [p.customsCleared ? "Customs cleared ✔" : "No customs clearance", p.customsCleared ? "good" : "warn"],
    ];
    chips.forEach(([t, c]) => {
      const s = document.createElement("span");
      s.className = "chip " + c;
      s.textContent = t;
      route.appendChild(s);
    });
    // route line:  Los Angeles → Chicago → …
    const line = document.createElement("div");
    line.style.marginTop = "8px";
    line.textContent = "Route: " + history
      .filter((h, i) => i === 0 || Number(h.status) !== 5 && Number(h.status) !== 3)
      .map((h) => h.location).join("  →  ");
    route.appendChild(line);
    out.appendChild(head);

    const tl = document.createElement("div");
    tl.className = "timeline";
    history.forEach((h) => {
      const item = document.createElement("div");
      item.className = "tl-item";
      const title = document.createElement("div");
      title.textContent = `${STATUS[Number(h.status)]} — ${h.location}, ${h.country}`;
      const who = document.createElement("small");
      who.textContent = `${nameOf(h.holder)} (${ROLE[Number(h.role)]}) · ${new Date(Number(h.timestamp) * 1000).toLocaleString()}${h.note ? " · " + h.note : ""}`;
      item.append(title, who);
      if (Number(h.distanceKm) > 0) {
        const d = document.createElement("small");
        d.className = "km";
        d.textContent = `+ ${km(h.distanceKm)} from previous checkpoint`;
        item.appendChild(d);
      }
      tl.appendChild(item);
    });
    out.appendChild(tl);
  } catch (e) {
    out.innerHTML = `<div class="notice err" style="margin-top:12px">${"Product not found."}</div>`;
  }
}

// ------------------------------------------------------------ event wiring
$("connectBtn").onclick = connect;
$("refreshBtn").onclick = loadProducts;
$("trackBtn").onclick = trackProduct;

$("registerBtn").onclick = () =>
  tx($("registerBtn"),
    () => contract.registerParticipant($("pAddress").value.trim(), $("pName").value.trim(), $("pRole").value),
    "Participant registered.");

$("createBtn").onclick = () =>
  tx($("createBtn"),
    () => contract.createProduct($("prodName").value.trim(), $("prodOrigin").value.trim(), $("prodCountry").value.trim()),
    "Product created on-chain.");

$("transferBtn").onclick = () =>
  tx($("transferBtn"),
    () => contract.transferProduct(
      $("tId").value, $("tTo").value.trim(), $("tLoc").value.trim(),
      $("tCountry").value.trim(), $("tKm").value || 0, $("tNote").value.trim()),
    "Product transferred.");

$("clearBtn").onclick = () =>
  tx($("clearBtn"),
    () => contract.clearCustoms($("cId").value, $("cNote").value.trim()),
    "Customs cleared.");

$("soldBtn").onclick = () =>
  tx($("soldBtn"),
    () => contract.markSold($("sId").value, $("sNote").value.trim()),
    "Product marked as sold.");

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}
