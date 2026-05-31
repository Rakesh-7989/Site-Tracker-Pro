// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title  SiteTrack Pro — daily audit-log Merkle-root anchor.
/// @author Mohan Boyapati / Site-Tracker-Pro contributors
/// @notice One call per day. Writes a 32-byte digest representing the merkle
///         root of every audit_log_v2 row from the prior day. Emits an event
///         carrying the root + block timestamp so off-chain indexers can
///         verify "this row existed by this block" without re-reading state.
///
/// Why this contract is intentionally tiny:
///   - The whole compliance value is "digest written at known time"; we don't
///     need on-chain storage of every root (events are cheaper and indexed).
///   - Every byte of state costs gas forever; minimal surface = minimal cost.
///   - The off-chain code (src/lib/blockchainAnchor.js) verifies via event
///     filter + tx receipt, not by reading state.
///
/// Function-selector contract (matches lib/blockchainAnchor.js):
///   keccak256("anchor(bytes32)") = 0xeecdf927...
///   The lib hard-codes `0xeecdf927` as `OPTS.selector`. If you rename the
///   function, regenerate the selector and update both sides.
///
/// Deploy targets:
///   - Mumbai testnet first (gas: free via faucet)
///   - Polygon mainnet for production (gas: ~₹0.01 / tx)
contract AuditAnchor {
    /// @notice Emitted on every anchor write. `root` is the 32-byte SHA-256
    ///         merkle root of the day's audit_log_v2 rows.
    /// @dev    Both args are indexed so off-chain queries can filter by either.
    event Anchored(bytes32 indexed root, uint256 indexed ts, address indexed by);

    /// @notice Owner is the only address allowed to anchor. We don't use
    ///         OpenZeppelin Ownable to keep the contract zero-dep.
    address public owner;

    /// @notice Anchor count — useful for indexers + a cheap "is contract live?"
    ///         signal without parsing event logs.
    uint256 public anchorCount;

    /// @notice Last root anchored (convenience getter; events are the source of truth).
    bytes32 public lastRoot;

    constructor() {
        owner = msg.sender;
    }

    /// @notice Transfer anchor authority. Used to rotate the signer key.
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "AuditAnchor: not owner");
        require(newOwner != address(0), "AuditAnchor: zero owner");
        owner = newOwner;
    }

    /// @notice Write a daily root. Emits Anchored.
    /// @param  root SHA-256 merkle root of yesterday's audit_log_v2 rows.
    function anchor(bytes32 root) external {
        require(msg.sender == owner, "AuditAnchor: not owner");
        require(root != bytes32(0), "AuditAnchor: empty root");
        anchorCount += 1;
        lastRoot = root;
        emit Anchored(root, block.timestamp, msg.sender);
    }
}
