// Runs a complete USA -> India journey automatically (8 checkpoints).
// Run AFTER `npm run deploy` and `npm run seed`. Then open the website and track the printed product ID.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const cfgPath = path.join(__dirname, "..", "frontend", "contract.json");
  const { address, abi } = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const [, maker, dist, retail, shipper, customs, warehouse] = await hre.ethers.getSigners();
  const sc = (s) => new hre.ethers.Contract(address, abi, s);

  const wait = async (p) => (await p).wait();

  await wait(sc(maker).createProduct("Laptop", "Los Angeles Plant", "USA"));
  const id = await sc(maker).productCount();
  console.log("Created product #" + id);

  await wait(sc(maker).transferProduct(id, dist.address, "Chicago Hub", "USA", 3000, "By truck"));
  await wait(sc(dist).transferProduct(id, shipper.address, "Los Angeles Port", "USA", 2800, "Loaded on cargo ship"));
  await wait(sc(shipper).transferProduct(id, customs.address, "Mumbai Port", "India", 14000, "Arrived by sea"));
  console.log("At Indian customs...");
  await wait(sc(customs).clearCustoms(id, "Import duty paid"));
  await wait(sc(customs).transferProduct(id, warehouse.address, "Bhiwandi Warehouse", "India", 40, "Cleared goods"));
  await wait(sc(warehouse).transferProduct(id, retail.address, "Pune Store", "India", 150, "Last-mile delivery"));
  await wait(sc(retail).markSold(id, "Sold to customer"));

  const p = await sc(maker).getProduct(id);
  console.log("Status: Sold | total distance:", p.totalDistanceKm.toString(), "km");
  console.log("Open the website and track product #" + id);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
