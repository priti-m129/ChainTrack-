// Registers demo participants using Hardhat's built-in test accounts.
// Run AFTER `npm run deploy`.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const cfgPath = path.join(__dirname, "..", "frontend", "contract.json");
  const { address, abi } = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

  const [admin, maker, dist, retail, shipper, customs, warehouse] = await hre.ethers.getSigners();
  const sc = new hre.ethers.Contract(address, abi, admin);

  // Role numbers: 1 Manufacturer, 2 Distributor, 3 Retailer, 4 Shipper, 5 Customs, 6 Warehouse
  await (await sc.registerParticipant(maker.address, "Acme Factory (USA)", 1)).wait();
  await (await sc.registerParticipant(dist.address, "FastMove Logistics", 2)).wait();
  await (await sc.registerParticipant(retail.address, "City Mart (India)", 3)).wait();
  await (await sc.registerParticipant(shipper.address, "OceanLine Shipping", 4)).wait();
  await (await sc.registerParticipant(customs.address, "India Customs", 5)).wait();
  await (await sc.registerParticipant(warehouse.address, "Mumbai Warehouse", 6)).wait();

  console.log("Seeded participants:");
  console.log("  Admin        :", admin.address, "(Account #0)");
  console.log("  Manufacturer :", maker.address, "(Account #1)");
  console.log("  Distributor  :", dist.address, "(Account #2)");
  console.log("  Retailer     :", retail.address, "(Account #3)");
  console.log("  Shipper      :", shipper.address, "(Account #4)");
  console.log("  Customs      :", customs.address, "(Account #5)");
  console.log("  Warehouse    :", warehouse.address, "(Account #6)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
