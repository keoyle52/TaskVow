// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentRegistry
 * @dev Registry contract to manage AI Agent profiles and completed job counts.
 */
contract AgentRegistry {
    struct Agent {
        string metadataURI;
        uint256 jobsCompleted;
        bool active;
    }

    mapping(address => Agent) private _agents;
    address public owner;
    address public escrowContract;

    event AgentRegistered(address indexed agent, string metadataURI);
    event AgentDeactivated(address indexed agent);
    event EscrowContractUpdated(address indexed newEscrow);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call");
        _;
    }

    modifier onlyEscrow() {
        require(msg.sender == escrowContract, "Only escrow contract can call");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Registers the caller as a new active AI agent.
     * @param metadataURI The off-chain metadata (e.g. IPFS hash) describing the agent's capabilities.
     */
    function registerAgent(string calldata metadataURI) external {
        require(bytes(metadataURI).length > 0, "Metadata URI cannot be empty");
        
        Agent storage agent = _agents[msg.sender];
        agent.metadataURI = metadataURI;
        agent.active = true;
        // jobsCompleted stays at its previous value if the agent was previously registered
        
        emit AgentRegistered(msg.sender, metadataURI);
    }

    /**
     * @dev Deactivates the caller from the agent registry.
     */
    function deactivateAgent() external {
        require(_agents[msg.sender].active, "Agent is not active");
        _agents[msg.sender].active = false;
        emit AgentDeactivated(msg.sender);
    }

    /**
     * @dev Returns the details of a registered agent.
     * @param agentAddress The wallet address of the agent.
     */
    function agents(address agentAddress) external view returns (
        string memory metadataURI,
        uint256 jobsCompleted,
        bool active
    ) {
        Agent memory agent = _agents[agentAddress];
        return (agent.metadataURI, agent.jobsCompleted, agent.active);
    }

    /**
     * @dev Sets the allowed JobEscrow contract address.
     * @param _escrowContract The address of the deployed JobEscrow contract.
     */
    function setEscrowContract(address _escrowContract) external onlyOwner {
        require(_escrowContract != address(0), "Invalid escrow address");
        escrowContract = _escrowContract;
        emit EscrowContractUpdated(_escrowContract);
    }

    /**
     * @dev Increments the completed job count of an agent. Can only be called by the escrow contract.
     * @param agentAddress The wallet address of the agent.
     */
    function incrementJobsCompleted(address agentAddress) external onlyEscrow {
        if (_agents[agentAddress].active) {
            _agents[agentAddress].jobsCompleted += 1;
        }
    }
}
