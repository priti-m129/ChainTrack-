const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SupplyChain", function () {
  let sc, admin, maker, dist, retail, shipper, customs, warehouse, stranger;
  const Role = { None: 0, Manufacturer: 1, Distributor: 2, Retailer: 3, Shipper: 4, Customs: 5, Warehouse: 6 };
  const Status = { Manufactured: 0, InTransit: 1, InStore: 2, Sold: 3, AtCustoms: 4, CustomsCleared: 5 };

  beforeEach(async () => {
    [admin, maker, dist, retail, shipper, customs, warehouse, stranger] = await ethers.getSigners();
    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    sc = await SupplyChain.deploy();
    await sc.waitForDeployment();

    await sc.registerParticipant(maker.address, "Acme Factory USA", Role.Manufacturer);
    await sc.registerParticipant(dist.address, "FastMove Logistics", Role.Distributor);
    await sc.registerParticipant(retail.address, "City Mart India", Role.Retailer);
    await sc.registerParticipant(shipper.address, "OceanLine Shipping", Role.Shipper);
    await sc.registerParticipant(customs.address, "India Customs", Role.Customs);
    await sc.registerParticipant(warehouse.address, "Mumbai Warehouse", Role.Warehouse);
  });

  // ---------------------------------------------------------------- basics
  it("sets the deployer as admin", async () => {
    expect(await sc.admin()).to.equal(admin.address);
  });

  it("only admin can register participants", async () => {
    await expect(
      sc.connect(stranger).registerParticipant(stranger.address, "X", Role.Retailer)
    ).to.be.revertedWith("Only admin");
  });

  it("lets a manufacturer create a product", async () => {
    await expect(sc.connect(maker).createProduct("Laptop", "Los Angeles Plant", "USA"))
      .to.emit(sc, "ProductCreated")
      .withArgs(1, "Laptop", maker.address);

    const p = await sc.getProduct(1);
    expect(p.name).to.equal("Laptop");
    expect(p.originCountry).to.equal("USA");
    expect(p.currentHolder).to.equal(maker.address);
    expect(p.status).to.equal(Status.Manufactured);
  });

  it("blocks non-manufacturers from creating products", async () => {
    await expect(sc.connect(dist).createProduct("Laptop", "X", "USA")).to.be.revertedWith(
      "Caller does not have the required role"
    );
  });

  it("returns all products", async () => {
    await sc.connect(maker).createProduct("A", "X", "USA");
    await sc.connect(maker).createProduct("B", "Y", "USA");
    expect((await sc.getAllProducts()).length).to.equal(2);
    expect(await sc.productCount()).to.equal(2);
  });

  // ------------------------------------------------ simple domestic journey
  it("runs the simple 3-step lifecycle: manufacture -> transfer -> sold (domestic)", async () => {
    await sc.connect(maker).createProduct("Laptop", "Pune Plant", "India");
    await sc.connect(maker).transferProduct(1, dist.address, "Warehouse A", "India", 150, "Shipped");
    await sc.connect(dist).transferProduct(1, retail.address, "Mumbai Store", "India", 20, "Delivered");
    await sc.connect(retail).markSold(1, "Sold to customer");

    const p = await sc.getProduct(1);
    expect(p.status).to.equal(Status.Sold);
    expect(p.totalDistanceKm).to.equal(170);
    const history = await sc.getHistory(1);
    expect(history.length).to.equal(4);
    expect(history[3].status).to.equal(Status.Sold);
  });

  // ------------------------------------------- international, many middlemen
  async function fullJourneyUntilCustoms() {
    await sc.connect(maker).createProduct("Laptop", "Los Angeles Plant", "USA");
    await sc.connect(maker).transferProduct(1, dist.address, "Chicago Hub", "USA", 3000, "Truck");
    await sc.connect(dist).transferProduct(1, shipper.address, "Los Angeles Port", "USA", 2800, "Loaded on ship");
    await sc.connect(shipper).transferProduct(1, customs.address, "Mumbai Port", "India", 14000, "Arrived by sea");
  }

  it("supports many middlemen and accumulates distance (USA -> India)", async () => {
    await fullJourneyUntilCustoms();
    await sc.connect(customs).clearCustoms(1, "Duty paid");
    await sc.connect(customs).transferProduct(1, warehouse.address, "Bhiwandi Warehouse", "India", 40, "Cleared goods");
    await sc.connect(warehouse).transferProduct(1, retail.address, "Pune Store", "India", 150, "Last mile");
    await sc.connect(retail).markSold(1, "Sold");

    const p = await sc.getProduct(1);
    expect(p.status).to.equal(Status.Sold);
    expect(p.customsCleared).to.equal(true);
    expect(p.totalDistanceKm).to.equal(3000n + 2800n + 14000n + 40n + 150n);

    const h = await sc.getHistory(1);
    // created, dist, shipper, customs, cleared, warehouse, retailer, sold
    expect(h.length).to.equal(8);
    expect(h[3].status).to.equal(Status.AtCustoms);
    expect(h[4].status).to.equal(Status.CustomsCleared);
    expect(h[7].status).to.equal(Status.Sold);
  });

  it("blocks imported goods from reaching a store without customs clearance", async () => {
    await sc.connect(maker).createProduct("Laptop", "Los Angeles Plant", "USA");
    await sc.connect(maker).transferProduct(1, warehouse.address, "Mumbai Warehouse", "India", 15000, "Direct");
    await expect(
      sc.connect(warehouse).transferProduct(1, retail.address, "Pune Store", "India", 150, "Skip customs")
    ).to.be.revertedWith("Customs clearance required for imported goods");
  });

  it("customs must clear goods before moving them on", async () => {
    await fullJourneyUntilCustoms();
    await expect(
      sc.connect(customs).transferProduct(1, warehouse.address, "Bhiwandi", "India", 40, "")
    ).to.be.revertedWith("Clear customs before moving the product on");
  });

  it("only a customs officer holding the product can clear it", async () => {
    await fullJourneyUntilCustoms();
    await expect(sc.connect(shipper).clearCustoms(1, "x")).to.be.revertedWith(
      "You are not the current holder"
    );
    await expect(sc.connect(admin).clearCustoms(1, "x")).to.be.revertedWith(
      "You are not the current holder"
    );
  });

  // ------------------------------------------------------------- guard rails
  it("rejects transfers by someone who is not the holder", async () => {
    await sc.connect(maker).createProduct("Laptop", "Pune", "India");
    await expect(
      sc.connect(dist).transferProduct(1, retail.address, "X", "India", 1, "Y")
    ).to.be.revertedWith("You are not the current holder");
  });

  it("manufacturer cannot skip straight to a retailer", async () => {
    await sc.connect(maker).createProduct("Laptop", "Pune", "India");
    await expect(
      sc.connect(maker).transferProduct(1, retail.address, "X", "India", 1, "Y")
    ).to.be.revertedWith("Manufacturer must send to a Distributor, Shipper or Warehouse");
  });

  it("rejects transfers to unregistered addresses", async () => {
    await sc.connect(maker).createProduct("Laptop", "Pune", "India");
    await expect(
      sc.connect(maker).transferProduct(1, stranger.address, "X", "India", 1, "Y")
    ).to.be.revertedWith("Receiver is not a registered participant");
  });

  it("prevents marking sold before it reaches the store", async () => {
    await sc.connect(maker).createProduct("Laptop", "Pune", "India");
    await expect(sc.connect(retail).markSold(1, "x")).to.be.revertedWith(
      "You are not the current holder"
    );
  });

  it("sold products cannot move again", async () => {
    await sc.connect(maker).createProduct("Laptop", "Pune", "India");
    await sc.connect(maker).transferProduct(1, dist.address, "A", "India", 1, "");
    await sc.connect(dist).transferProduct(1, retail.address, "B", "India", 1, "");
    await sc.connect(retail).markSold(1, "");
    await expect(
      sc.connect(retail).transferProduct(1, dist.address, "C", "India", 1, "")
    ).to.be.revertedWith("Product already sold");
  });
});
