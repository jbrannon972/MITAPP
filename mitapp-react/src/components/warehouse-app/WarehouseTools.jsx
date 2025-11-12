import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';

const WarehouseTools = () => {
  const [tools, setTools] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [completedRequests, setCompletedRequests] = useState([]);
  const [selectedOffice, setSelectedOffice] = useState('Katy');
  const [inventoryMode, setInventoryMode] = useState(false);
  const [inventoryCounts, setInventoryCounts] = useState({});

  useEffect(() => {
    loadTools();
    loadRequests();
  }, []);

  const loadTools = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'hou_tools'));
      const toolList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTools(toolList);

      // Initialize inventory counts
      const counts = {};
      toolList.forEach(tool => {
        counts[tool.id] = {
          katy: tool.katyQty || 0,
          conroe: tool.conroeQty || 0
        };
      });
      setInventoryCounts(counts);
    } catch (error) {
      console.error('Error loading tools:', error);
    }
  };

  const loadRequests = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'hou_tool_requests'));
      const allRequests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setPendingRequests(allRequests.filter(r => r.status === 'Pending'));
      setCompletedRequests(allRequests.filter(r => r.status === 'Completed'));
    } catch (error) {
      console.error('Error loading requests:', error);
    }
  };

  const handleCompleteRequest = async (request) => {
    if (!selectedOffice) {
      alert('Please select an office');
      return;
    }

    try {
      // Find the tool
      const tool = tools.find(t => t.name === request.toolName);
      if (tool) {
        const qtyField = selectedOffice === 'Katy' ? 'katyQty' : 'conroeQty';
        const currentQty = tool[qtyField] || 0;

        if (currentQty <= 0) {
          if (!window.confirm('This tool is out of stock. Complete request anyway?')) {
            return;
          }
        } else {
          // Decrement inventory
          await updateDoc(doc(db, 'hou_tools', tool.id), {
            [qtyField]: increment(-1)
          });
        }
      }

      // Mark request as completed
      await updateDoc(doc(db, 'hou_tool_requests', request.id), {
        status: 'Completed',
        completedDate: new Date().toISOString(),
        completedOffice: selectedOffice
      });

      alert('Request completed successfully!');
      loadTools();
      loadRequests();
    } catch (error) {
      console.error('Error completing request:', error);
      alert('Failed to complete request');
    }
  };

  const handleSaveInventory = async () => {
    try {
      const promises = Object.keys(inventoryCounts).map(toolId => {
        return updateDoc(doc(db, 'hou_tools', toolId), {
          katyQty: inventoryCounts[toolId].katy,
          conroeQty: inventoryCounts[toolId].conroe
        });
      });

      await Promise.all(promises);
      alert('Inventory updated successfully!');
      setInventoryMode(false);
      loadTools();
    } catch (error) {
      console.error('Error updating inventory:', error);
      alert('Failed to update inventory');
    }
  };

  const updateInventoryCount = (toolId, office, value) => {
    setInventoryCounts({
      ...inventoryCounts,
      [toolId]: {
        ...inventoryCounts[toolId],
        [office.toLowerCase()]: parseInt(value) || 0
      }
    });
  };

  const getCompletedSummary = () => {
    const count = completedRequests.length;
    const totalCost = completedRequests.reduce((sum, req) => sum + (req.toolCost || 0), 0);
    return { count, totalCost };
  };

  const { count: completedCount, totalCost: completedCost } = getCompletedSummary();

  return (
    <div className="warehouse-tools-container">
      <h2>Tool Management</h2>

      <div className="tools-actions">
        <button
          className={`btn ${inventoryMode ? 'btn-success' : 'btn-secondary'}`}
          onClick={() => setInventoryMode(!inventoryMode)}
        >
          <i className="fas fa-clipboard-check"></i>
          {inventoryMode ? 'Exit Inventory Mode' : 'Run Inventory'}
        </button>
      </div>

      {inventoryMode ? (
        <div className="inventory-mode">
          <h3>Inventory Count</h3>
          <p>Update quantities for each tool at each office:</p>

          <div className="inventory-table">
            <div className="inventory-header">
              <div>Tool</div>
              <div>Katy</div>
              <div>Conroe</div>
            </div>
            {tools.map(tool => (
              <div key={tool.id} className="inventory-row">
                <div className="inventory-tool-name">{tool.name}</div>
                <div>
                  <input
                    type="number"
                    value={inventoryCounts[tool.id]?.katy || 0}
                    onChange={(e) => updateInventoryCount(tool.id, 'katy', e.target.value)}
                    className="inventory-input"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={inventoryCounts[tool.id]?.conroe || 0}
                    onChange={(e) => updateInventoryCount(tool.id, 'conroe', e.target.value)}
                    className="inventory-input"
                  />
                </div>
              </div>
            ))}
          </div>

          <button className="btn btn-primary" onClick={handleSaveInventory}>
            <i className="fas fa-save"></i> Save Inventory
          </button>
        </div>
      ) : (
        <>
          <div className="tools-section">
            <div className="section-header">
              <h3>Pending Tool Requests</h3>
              <div className="office-selector">
                <label>Complete from:</label>
                <select
                  value={selectedOffice}
                  onChange={(e) => setSelectedOffice(e.target.value)}
                >
                  <option value="Katy">Katy</option>
                  <option value="Conroe">Conroe</option>
                </select>
              </div>
            </div>

            {pendingRequests.length === 0 ? (
              <p>No pending requests</p>
            ) : (
              <div className="requests-list">
                {pendingRequests.map(request => (
                  <div key={request.id} className="request-card">
                    <div className="request-header">
                      <span className="request-tech">{request.technicianName}</span>
                      <span className="request-date">
                        {new Date(request.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="request-tool">{request.toolName}</div>
                    <div className="request-reason">Reason: {request.reason}</div>
                    <div className="request-urgency">
                      <span className={`urgency-badge urgency-${request.urgency?.toLowerCase()}`}>
                        {request.urgency}
                      </span>
                    </div>
                    {request.notes && (
                      <div className="request-notes">Notes: {request.notes}</div>
                    )}
                    <button
                      className="btn btn-success btn-small"
                      onClick={() => handleCompleteRequest(request)}
                    >
                      Complete ({selectedOffice})
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="tools-section">
            <div className="section-header">
              <h3>Completed Requests</h3>
              <div className="completed-summary">
                <span>{completedCount} requests</span>
                <span>${completedCost.toFixed(2)} total cost</span>
              </div>
            </div>

            {completedRequests.length === 0 ? (
              <p>No completed requests</p>
            ) : (
              <div className="requests-list">
                {completedRequests.slice(0, 10).map(request => (
                  <div key={request.id} className="request-card completed">
                    <div className="request-header">
                      <span className="request-tech">{request.technicianName}</span>
                      <span className="request-date">
                        {new Date(request.completedDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="request-tool">{request.toolName}</div>
                    <div className="request-office">Office: {request.completedOffice}</div>
                    {request.toolCost && (
                      <div className="request-cost">${request.toolCost.toFixed(2)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="tools-section">
            <h3>Tool Inventory</h3>
            <div className="inventory-list">
              {tools.map(tool => (
                <div key={tool.id} className="inventory-item">
                  <div className="inventory-item-name">{tool.name}</div>
                  <div className="inventory-item-qtys">
                    <span>Katy: {tool.katyQty || 0}</span>
                    <span>Conroe: {tool.conroeQty || 0}</span>
                  </div>
                  {tool.cost && (
                    <div className="inventory-item-cost">${tool.cost.toFixed(2)}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WarehouseTools;
