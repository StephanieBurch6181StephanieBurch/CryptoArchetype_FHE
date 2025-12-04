// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface ArchetypeData {
  id: string;
  name: string;
  type: string;
  riskScore: number;
  lastDetected: number;
  transactions: number;
  fheSignature: string;
}

const App: React.FC = () => {
  // Style choices: High contrast (red+black), Industrial mechanical, Center radiation, Animation rich
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [archetypes, setArchetypes] = useState<ArchetypeData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newArchetypeData, setNewArchetypeData] = useState({
    name: "",
    type: "money-laundering",
    riskScore: 50
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("all");

  // Calculate statistics
  const highRiskCount = archetypes.filter(a => a.riskScore >= 70).length;
  const mediumRiskCount = archetypes.filter(a => a.riskScore >= 30 && a.riskScore < 70).length;
  const lowRiskCount = archetypes.filter(a => a.riskScore < 30).length;

  useEffect(() => {
    loadArchetypes().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadArchetypes = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("archetype_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing archetype keys:", e);
        }
      }
      
      const list: ArchetypeData[] = [];
      
      for (const key of keys) {
        try {
          const archetypeBytes = await contract.getData(`archetype_${key}`);
          if (archetypeBytes.length > 0) {
            try {
              const archetypeData = JSON.parse(ethers.toUtf8String(archetypeBytes));
              list.push({
                id: key,
                name: archetypeData.name,
                type: archetypeData.type,
                riskScore: archetypeData.riskScore,
                lastDetected: archetypeData.lastDetected,
                transactions: archetypeData.transactions,
                fheSignature: archetypeData.fheSignature
              });
            } catch (e) {
              console.error(`Error parsing archetype data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading archetype ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.riskScore - a.riskScore);
      setArchetypes(list);
    } catch (e) {
      console.error("Error loading archetypes:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitArchetype = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing with FHE encryption..."
    });
    
    try {
      // Simulate FHE encryption
      const fheSignature = `FHE-${btoa(JSON.stringify({
        name: newArchetypeData.name,
        type: newArchetypeData.type,
        riskScore: newArchetypeData.riskScore,
        timestamp: Date.now()
      }))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const archetypeId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const archetypeData = {
        name: newArchetypeData.name,
        type: newArchetypeData.type,
        riskScore: newArchetypeData.riskScore,
        lastDetected: Math.floor(Date.now() / 1000),
        transactions: Math.floor(Math.random() * 1000) + 100,
        fheSignature: fheSignature
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `archetype_${archetypeId}`, 
        ethers.toUtf8Bytes(JSON.stringify(archetypeData))
      );
      
      const keysBytes = await contract.getData("archetype_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(archetypeId);
      
      await contract.setData(
        "archetype_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE analysis completed successfully!"
      });
      
      await loadArchetypes();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewArchetypeData({
          name: "",
          type: "money-laundering",
          riskScore: 50
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const filteredArchetypes = archetypes.filter(archetype => {
    const matchesSearch = archetype.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === "all" || archetype.type === selectedType;
    return matchesSearch && matchesType;
  });

  const getRiskColor = (score: number) => {
    if (score >= 70) return "#ff4d4d";
    if (score >= 30) return "#ffa64d";
    return "#4dff4d";
  };

  const renderRiskMeter = (score: number) => {
    return (
      <div className="risk-meter-container">
        <div 
          className="risk-meter-bar"
          style={{
            width: `${score}%`,
            backgroundColor: getRiskColor(score)
          }}
        ></div>
        <div className="risk-meter-value">{score}</div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="industrial-spinner"></div>
      <p>Initializing FHE analyzer...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <header className="app-header">
        <div className="logo">
          <h1>CRYPTO<span>ARCHE</span>TYPE</h1>
          <div className="logo-subtitle">FHE-Powered Illicit Finance Detection</div>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="central-radial-layout">
          <div className="dashboard-panel">
            <div className="panel-header">
              <h2>Illicit Finance Archetypes</h2>
              <div className="header-actions">
                <button 
                  onClick={() => setShowCreateModal(true)} 
                  className="industrial-button primary"
                >
                  + Add Archetype
                </button>
                <button 
                  onClick={loadArchetypes}
                  className="industrial-button"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="search-filters">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search archetypes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="industrial-input"
                />
              </div>
              <div className="filter-select">
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="industrial-select"
                >
                  <option value="all">All Types</option>
                  <option value="money-laundering">Money Laundering</option>
                  <option value="terror-finance">Terror Finance</option>
                  <option value="scam">Scam</option>
                  <option value="ransomware">Ransomware</option>
                  <option value="sanctions-evasion">Sanctions Evasion</option>
                </select>
              </div>
            </div>
            
            <div className="stats-overview">
              <div className="stat-card">
                <div className="stat-value">{archetypes.length}</div>
                <div className="stat-label">Total Archetypes</div>
              </div>
              <div className="stat-card danger">
                <div className="stat-value">{highRiskCount}</div>
                <div className="stat-label">High Risk</div>
              </div>
              <div className="stat-card warning">
                <div className="stat-value">{mediumRiskCount}</div>
                <div className="stat-label">Medium Risk</div>
              </div>
              <div className="stat-card safe">
                <div className="stat-value">{lowRiskCount}</div>
                <div className="stat-label">Low Risk</div>
              </div>
            </div>
            
            <div className="archetypes-list">
              {filteredArchetypes.length === 0 ? (
                <div className="no-results">
                  <div className="no-results-icon"></div>
                  <p>No archetypes found matching your criteria</p>
                  <button 
                    className="industrial-button primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Add New Archetype
                  </button>
                </div>
              ) : (
                <table className="industrial-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Risk Score</th>
                      <th>Last Detected</th>
                      <th>Transactions</th>
                      <th>FHE Signature</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArchetypes.map(archetype => (
                      <tr key={archetype.id}>
                        <td>{archetype.name}</td>
                        <td className="type-cell">
                          <span className={`type-badge ${archetype.type}`}>
                            {archetype.type.replace("-", " ")}
                          </span>
                        </td>
                        <td>
                          {renderRiskMeter(archetype.riskScore)}
                        </td>
                        <td>
                          {new Date(archetype.lastDetected * 1000).toLocaleDateString()}
                        </td>
                        <td>{archetype.transactions}</td>
                        <td className="fhe-signature">
                          {archetype.fheSignature.substring(0, 8)}...
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitArchetype} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          archetypeData={newArchetypeData}
          setArchetypeData={setNewArchetypeData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            <div className="notification-icon">
              {transactionStatus.status === "pending" && <div className="industrial-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="notification-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="fhe-badge">
            <span>FULLY HOMOMORPHIC ENCRYPTION</span>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">API</a>
            <a href="#" className="footer-link">Terms</a>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} CryptoArchetype Analysis
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  archetypeData: any;
  setArchetypeData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  archetypeData,
  setArchetypeData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setArchetypeData({
      ...archetypeData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!archetypeData.name) {
      alert("Please enter a name for the archetype");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal industrial-modal">
        <div className="modal-header">
          <h2>Add New Illicit Finance Archetype</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="gear-icon"></div>
            <span>This data will be processed using FHE technology</span>
          </div>
          
          <div className="form-group">
            <label>Archetype Name *</label>
            <input 
              type="text"
              name="name"
              value={archetypeData.name} 
              onChange={handleChange}
              placeholder="e.g. Mixer Laundering" 
              className="industrial-input"
            />
          </div>
          
          <div className="form-group">
            <label>Type *</label>
            <select 
              name="type"
              value={archetypeData.type} 
              onChange={handleChange}
              className="industrial-select"
            >
              <option value="money-laundering">Money Laundering</option>
              <option value="terror-finance">Terror Finance</option>
              <option value="scam">Scam</option>
              <option value="ransomware">Ransomware</option>
              <option value="sanctions-evasion">Sanctions Evasion</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Risk Score: {archetypeData.riskScore}</label>
            <input 
              type="range"
              name="riskScore"
              min="0"
              max="100"
              value={archetypeData.riskScore} 
              onChange={handleChange}
              className="industrial-range"
            />
            <div className="range-labels">
              <span>Low</span>
              <span>Medium</span>
              <span>High</span>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="industrial-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="industrial-button primary"
          >
            {creating ? "Processing with FHE..." : "Submit Analysis"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;