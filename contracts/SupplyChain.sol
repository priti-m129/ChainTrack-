// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SupplyChain
 * @notice Transparent, tamper-proof product tracking from manufacturer to retailer,
 *         including cross-border shipments (e.g. USA -> India) with any number of
 *         middlemen (distributors, shippers, warehouses, customs) in between.
 *         Every hop stores location, country and distance travelled.
 */
contract SupplyChain {
    // ---------------------------------------------------------------- types
    // NOTE: first four values keep the original numbering (1,2,3) on purpose.
    enum Role { None, Manufacturer, Distributor, Retailer, Shipper, Customs, Warehouse }
    enum Status { Manufactured, InTransit, InStore, Sold, AtCustoms, CustomsCleared }

    struct Participant {
        string name;
        Role role;
        bool active;
    }

    struct Product {
        uint256 id;
        string name;
        string origin;
        string originCountry;
        address manufacturer;
        address currentHolder;
        Status status;
        bool customsCleared;
        uint256 totalDistanceKm;
        uint256 createdAt;
        bool exists;
    }

    struct HistoryEntry {
        address holder;
        Role role;
        Status status;
        string location;
        string country;
        uint32 distanceKm;   // distance from the previous checkpoint
        string note;
        uint256 timestamp;
    }

    // -------------------------------------------------------------- storage
    address public admin;
    uint256 public productCount;

    mapping(address => Participant) public participants;
    mapping(uint256 => Product) private products;
    mapping(uint256 => HistoryEntry[]) private histories;

    // --------------------------------------------------------------- events
    event ParticipantRegistered(address indexed account, string name, Role role);
    event ParticipantRemoved(address indexed account);
    event ProductCreated(uint256 indexed id, string name, address indexed manufacturer);
    event ProductTransferred(
        uint256 indexed id,
        address indexed from,
        address indexed to,
        Status status,
        string location
    );
    event CustomsClearedEvent(uint256 indexed id, address indexed officer);
    event ProductSold(uint256 indexed id, address indexed retailer);

    // ------------------------------------------------------------ modifiers
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyRole(Role r) {
        require(
            participants[msg.sender].active && participants[msg.sender].role == r,
            "Caller does not have the required role"
        );
        _;
    }

    modifier productExists(uint256 id) {
        require(products[id].exists, "Product does not exist");
        _;
    }

    modifier onlyHolder(uint256 id) {
        require(products[id].currentHolder == msg.sender, "You are not the current holder");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ----------------------------------------------------------- admin area
    function registerParticipant(address account, string calldata name, Role role)
        external
        onlyAdmin
    {
        require(account != address(0), "Invalid address");
        require(role != Role.None, "Invalid role");
        require(bytes(name).length > 0, "Name required");
        participants[account] = Participant(name, role, true);
        emit ParticipantRegistered(account, name, role);
    }

    function removeParticipant(address account) external onlyAdmin {
        require(participants[account].active, "Not a participant");
        participants[account].active = false;
        emit ParticipantRemoved(account);
    }

    // ------------------------------------------------------- product logic
    /// @notice STEP 1 - A manufacturer registers a brand-new product.
    function createProduct(
        string calldata name,
        string calldata origin,
        string calldata country
    ) external onlyRole(Role.Manufacturer) returns (uint256 id) {
        require(bytes(name).length > 0, "Name required");
        require(bytes(country).length > 0, "Country required");
        id = ++productCount;

        Product storage p = products[id];
        p.id = id;
        p.name = name;
        p.origin = origin;
        p.originCountry = country;
        p.manufacturer = msg.sender;
        p.currentHolder = msg.sender;
        p.status = Status.Manufactured;
        p.createdAt = block.timestamp;
        p.exists = true;

        histories[id].push(
            HistoryEntry(msg.sender, Role.Manufacturer, Status.Manufactured, origin, country, 0, "Product created", block.timestamp)
        );

        emit ProductCreated(id, name, msg.sender);
    }

    /// @notice STEP 2 - Hand the product to the next participant. Repeat as many times
    ///         as needed: Manufacturer -> Distributor/Shipper/Warehouse -> ... -> Customs -> ... -> Retailer.
    /// @param location   where the product is being delivered to (e.g. "Mumbai Port")
    /// @param country    country of that location (e.g. "India")
    /// @param distanceKm distance travelled from the previous checkpoint
    function transferProduct(
        uint256 id,
        address to,
        string calldata location,
        string calldata country,
        uint32 distanceKm,
        string calldata note
    ) external productExists(id) onlyHolder(id) {
        Product storage p = products[id];
        require(p.status != Status.Sold, "Product already sold");
        require(bytes(country).length > 0, "Country required");

        Role newRole = _checkRoute(p, to, country);
        Status newStatus = newRole == Role.Customs
            ? Status.AtCustoms
            : (newRole == Role.Retailer ? Status.InStore : Status.InTransit);

        address from = p.currentHolder;
        p.currentHolder = to;
        p.status = newStatus;
        p.totalDistanceKm += distanceKm;
        histories[id].push(
            HistoryEntry(to, newRole, newStatus, location, country, distanceKm, note, block.timestamp)
        );

        emit ProductTransferred(id, from, to, newStatus, location);
    }

    /// @dev Validates who may send to whom. Returns the receiver's role.
    function _checkRoute(Product storage p, address to, string calldata country)
        internal
        view
        returns (Role)
    {
        Participant memory sender = participants[msg.sender];
        Participant memory receiver = participants[to];

        require(sender.active, "Sender is not a registered participant");
        require(receiver.active, "Receiver is not a registered participant");
        require(to != msg.sender, "Cannot transfer to yourself");
        require(sender.role != Role.Retailer, "Retailers cannot transfer products");
        require(receiver.role != Role.Manufacturer, "Cannot transfer to a Manufacturer");

        if (sender.role == Role.Manufacturer) {
            require(
                receiver.role == Role.Distributor ||
                    receiver.role == Role.Shipper ||
                    receiver.role == Role.Warehouse,
                "Manufacturer must send to a Distributor, Shipper or Warehouse"
            );
        }

        // Customs officer must clear the goods before they can move on
        if (sender.role == Role.Customs) {
            require(p.customsCleared, "Clear customs before moving the product on");
        }

        // Imported goods cannot reach a store without customs clearance
        if (receiver.role == Role.Retailer && !p.customsCleared) {
            require(
                keccak256(bytes(country)) == keccak256(bytes(p.originCountry)),
                "Customs clearance required for imported goods"
            );
        }
        return receiver.role;
    }

    /// @notice A customs officer who holds the product approves it for import.
    function clearCustoms(uint256 id, string calldata note)
        external
        productExists(id)
        onlyHolder(id)
        onlyRole(Role.Customs)
    {
        Product storage p = products[id];
        require(p.status == Status.AtCustoms, "Product is not at customs");
        p.customsCleared = true;
        p.status = Status.CustomsCleared;

        HistoryEntry storage last = histories[id][histories[id].length - 1];
        histories[id].push(
            HistoryEntry(msg.sender, Role.Customs, Status.CustomsCleared, last.location, last.country, 0, note, block.timestamp)
        );
        emit CustomsClearedEvent(id, msg.sender);
    }

    /// @notice STEP 3 - Retailer marks the product as sold to a consumer.
    function markSold(uint256 id, string calldata note)
        external
        productExists(id)
        onlyHolder(id)
        onlyRole(Role.Retailer)
    {
        Product storage p = products[id];
        require(p.status == Status.InStore, "Product is not in store");
        p.status = Status.Sold;

        HistoryEntry storage last = histories[id][histories[id].length - 1];
        histories[id].push(
            HistoryEntry(msg.sender, Role.Retailer, Status.Sold, last.location, last.country, 0, note, block.timestamp)
        );
        emit ProductSold(id, msg.sender);
    }

    // ------------------------------------------------------------- readers
    function getProduct(uint256 id)
        external
        view
        productExists(id)
        returns (Product memory)
    {
        return products[id];
    }

    function getHistory(uint256 id)
        external
        view
        productExists(id)
        returns (HistoryEntry[] memory)
    {
        return histories[id];
    }

    function getAllProducts() external view returns (Product[] memory list) {
        list = new Product[](productCount);
        for (uint256 i = 1; i <= productCount; i++) {
            list[i - 1] = products[i];
        }
    }
}
