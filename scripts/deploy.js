const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const SupplyChain = await hre.ethers.getContractFactory("SupplyChain");
  const contract = await SupplyChain.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("SupplyChain deployed to:", address);

  // Export address + ABI for the frontend
  const artifact = await hre.artifacts.readArtifact("SupplyChain");
  const out = { address, abi: artifact.abi };
  const target = path.join(__dirname, "..", "frontend", "contract.json");
  fs.writeFileSync(target, JSON.stringify(out, null, 2));
  console.log("Frontend config written to frontend/contract.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
