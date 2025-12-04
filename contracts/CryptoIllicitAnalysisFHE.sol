// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract CryptoIllicitAnalysisFHE is SepoliaConfig {
    struct EncryptedTransaction {
        euint32 amount;          // Encrypted transaction amount
        euint32 frequency;       // Encrypted transaction frequency
        euint32 counterpartyRisk; // Encrypted risk score
        uint256 timestamp;
    }
    
    struct ClusterCenter {
        euint32 centroidAmount;
        euint32 centroidFrequency;
        euint32 centroidRisk;
        euint32 memberCount;
    }
    
    // Contract state
    uint256 public transactionCount;
    mapping(uint256 => EncryptedTransaction) public encryptedTransactions;
    mapping(uint256 => ClusterCenter) public clusterCenters;
    uint256 public clusterCount;
    
    // Mapping for decryption requests
    mapping(uint256 => uint256) private requestToClusterId;
    
    // Events
    event TransactionProcessed(uint256 indexed id, uint256 timestamp);
    event ClusterUpdated(uint256 indexed clusterId);
    event DecryptionRequested(uint256 indexed clusterId);
    event ClusterDecrypted(uint256 indexed clusterId);
    
    // Initialize with predefined clusters
    constructor() {
        // Initialize cluster centers (values should be encrypted off-chain)
        clusterCenters[0] = ClusterCenter({
            centroidAmount: FHE.asEuint32(0),
            centroidFrequency: FHE.asEuint32(0),
            centroidRisk: FHE.asEuint32(0),
            memberCount: FHE.asEuint32(0)
        });
        
        clusterCenters[1] = ClusterCenter({
            centroidAmount: FHE.asEuint32(0),
            centroidFrequency: FHE.asEuint32(0),
            centroidRisk: FHE.asEuint32(0),
            memberCount: FHE.asEuint32(0)
        });
        
        clusterCount = 2;
    }
    
    /// @notice Process encrypted transaction and assign to cluster
    function processEncryptedTransaction(
        euint32 amount,
        euint32 frequency,
        euint32 counterpartyRisk
    ) public {
        uint256 newId = ++transactionCount;
        encryptedTransactions[newId] = EncryptedTransaction({
            amount: amount,
            frequency: frequency,
            counterpartyRisk: counterpartyRisk,
            timestamp: block.timestamp
        });
        
        // Find closest cluster in encrypted space
        euint32 minDistance = FHE.asEuint32(type(uint32).max);
        uint256 closestCluster = 0;
        
        for (uint256 i = 0; i < clusterCount; i++) {
            euint32 distance = calculateDistance(
                amount, frequency, counterpartyRisk,
                clusterCenters[i].centroidAmount,
                clusterCenters[i].centroidFrequency,
                clusterCenters[i].centroidRisk
            );
            
            // Compare distances using FHE
            ebool isCloser = FHE.lt(distance, minDistance);
            minDistance = FHE.cmux(isCloser, distance, minDistance);
            closestCluster = FHE.cmux(isCloser, i, closestCluster);
        }
        
        // Update cluster center with new transaction
        updateClusterCenter(closestCluster, amount, frequency, counterpartyRisk);
        emit TransactionProcessed(newId, block.timestamp);
    }
    
    /// @notice Calculate Euclidean distance in encrypted space
    function calculateDistance(
        euint32 amount1,
        euint32 freq1,
        euint32 risk1,
        euint32 amount2,
        euint32 freq2,
        euint32 risk2
    ) private pure returns (euint32) {
        euint32 diffAmount = FHE.sub(amount1, amount2);
        euint32 diffFreq = FHE.sub(freq1, freq2);
        euint32 diffRisk = FHE.sub(risk1, risk2);
        
        euint32 sqrAmount = FHE.mul(diffAmount, diffAmount);
        euint32 sqrFreq = FHE.mul(diffFreq, diffFreq);
        euint32 sqrRisk = FHE.mul(diffRisk, diffRisk);
        
        return FHE.add(FHE.add(sqrAmount, sqrFreq), sqrRisk);
    }
    
    /// @notice Update cluster center with new transaction
    function updateClusterCenter(
        uint256 clusterId,
        euint32 amount,
        euint32 frequency,
        euint32 risk
    ) private {
        ClusterCenter storage center = clusterCenters[clusterId];
        
        // Update centroid using weighted average
        euint32 currentWeight = center.memberCount;
        euint32 newWeight = FHE.add(currentWeight, FHE.asEuint32(1));
        
        center.centroidAmount = FHE.div(
            FHE.add(FHE.mul(center.centroidAmount, currentWeight), amount),
            newWeight
        );
        
        center.centroidFrequency = FHE.div(
            FHE.add(FHE.mul(center.centroidFrequency, currentWeight), frequency),
            newWeight
        );
        
        center.centroidRisk = FHE.div(
            FHE.add(FHE.mul(center.centroidRisk, currentWeight), risk),
            newWeight
        );
        
        center.memberCount = newWeight;
        emit ClusterUpdated(clusterId);
    }
    
    /// @notice Request decryption of cluster characteristics
    function requestClusterDecryption(uint256 clusterId) public {
        ClusterCenter storage center = clusterCenters[clusterId];
        
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(center.centroidAmount);
        ciphertexts[1] = FHE.toBytes32(center.centroidFrequency);
        ciphertexts[2] = FHE.toBytes32(center.centroidRisk);
        ciphertexts[3] = FHE.toBytes32(center.memberCount);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptCluster.selector);
        requestToClusterId[reqId] = clusterId;
        
        emit DecryptionRequested(clusterId);
    }
    
    /// @notice Callback for decrypted cluster data
    function decryptCluster(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 clusterId = requestToClusterId[requestId];
        require(clusterId < clusterCount, "Invalid cluster");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32[] memory decryptedValues = abi.decode(cleartexts, (uint32[]));
        
        emit ClusterDecrypted(clusterId);
    }
    
    /// @notice Add new cluster type
    function addNewCluster(
        euint32 initialAmount,
        euint32 initialFrequency,
        euint32 initialRisk
    ) public {
        uint256 newClusterId = clusterCount++;
        clusterCenters[newClusterId] = ClusterCenter({
            centroidAmount: initialAmount,
            centroidFrequency: initialFrequency,
            centroidRisk: initialRisk,
            memberCount: FHE.asEuint32(0)
        });
    }
}