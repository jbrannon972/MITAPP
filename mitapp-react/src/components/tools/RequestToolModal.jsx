import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import firebaseService from '../../services/firebaseService';

const RequestToolModal = ({ isOpen, onClose, onSuccess, tools }) => {
  const { user } = useAuth();
  const [toolRows, setToolRows] = useState([{ id: Date.now(), selectedTool: '', otherToolName: '' }]);
  const [reason, setReason] = useState('');
  const [urgency, setUrgency] = useState('Low - Within the week');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setToolRows([{ id: Date.now(), selectedTool: '', otherToolName: '' }]);
      setReason('');
      setUrgency('Low - Within the week');
      setNotes('');
    }
  }, [isOpen]);

  const addToolRow = () => {
    setToolRows([...toolRows, { id: Date.now(), selectedTool: '', otherToolName: '' }]);
  };

  const removeToolRow = (id) => {
    if (toolRows.length > 1) {
      setToolRows(toolRows.filter(row => row.id !== id));
    }
  };

  const updateToolRow = (id, field, value) => {
    setToolRows(toolRows.map(row =>
      row.id === id ? { ...row, [field]: value } : row
    ));
  };

  const checkForDuplicates = async (requests) => {
    try {
      // Check for recent requests (last 7 days) from same technician
      const allRequests = await firebaseService.getAllToolRequests();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const duplicates = [];

      for (const newRequest of requests) {
        const recentSimilar = allRequests.filter(req => {
          const reqDate = req.createdAt?.toDate ? req.createdAt.toDate() : new Date(req.createdAt);
          return (
            req.technicianId === newRequest.technicianId &&
            req.toolName === newRequest.toolName &&
            reqDate >= sevenDaysAgo
          );
        });

        if (recentSimilar.length > 0) {
          duplicates.push({
            tool: newRequest.toolName,
            count: recentSimilar.length,
            mostRecent: recentSimilar[0]
          });
        }
      }

      return duplicates;
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return [];
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (toolRows.length === 0) {
      alert('Please add at least one tool to your request.');
      return;
    }

    if (!reason.trim()) {
      alert('Please provide a reason for the request.');
      return;
    }

    // Validate each tool row
    for (const row of toolRows) {
      if (!row.selectedTool) {
        alert('Please select a tool for each row.');
        return;
      }
      if (row.selectedTool === 'Other' && !row.otherToolName.trim()) {
        alert('Please specify the tool name for the "Other" option.');
        return;
      }
    }

    try {
      setSubmitting(true);

      // Build requests array
      const requests = toolRows.map(row => {
        const toolName = row.selectedTool === 'Other' ? row.otherToolName : row.selectedTool;
        const selectedTool = tools.find(t => t.name === toolName);

        return {
          toolName: toolName,
          toolCost: selectedTool?.cost || 0,
          reason: reason,
          urgency: urgency,
          notes: notes,
          technicianId: user?.userId || 'unknown',
          technicianName: user?.username || 'Unknown User',
          status: 'Pending'
        };
      });

      // Check for duplicates
      const duplicates = await checkForDuplicates(requests);

      if (duplicates.length > 0) {
        const duplicateMessages = duplicates.map(dup => {
          const date = dup.mostRecent.createdAt?.toDate ?
            dup.mostRecent.createdAt.toDate().toLocaleDateString() :
            'recently';
          return `• ${dup.tool} (requested ${date}, status: ${dup.mostRecent.status})`;
        }).join('\n');

        const confirmMsg = `⚠️ POSSIBLE DUPLICATE REQUEST DETECTED:\n\n${duplicateMessages}\n\nYou recently requested ${duplicates.length === 1 ? 'this tool' : 'these tools'} within the last 7 days.\n\nAre you sure you want to submit this request again?`;

        if (!window.confirm(confirmMsg)) {
          setSubmitting(false);
          return;
        }
      }

      await firebaseService.createBatchToolRequests(requests);
      alert('Tool request(s) submitted successfully!');

      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error('Error submitting tool request:', error);
      alert('There was an error submitting your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-plus-circle"></i> Request a New Tool
          </h3>
          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Tool Rows */}
          <div style={{ marginBottom: '20px' }}>
            {toolRows.map((row, index) => (
              <ToolRow
                key={row.id}
                row={row}
                index={index}
                tools={tools}
                onUpdate={(field, value) => updateToolRow(row.id, field, value)}
                onRemove={() => removeToolRow(row.id)}
                canRemove={toolRows.length > 1}
              />
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={addToolRow}
              style={{ marginTop: '12px' }}
            >
              <i className="fas fa-plus"></i> Add Another Tool
            </button>
          </div>

          {/* Common Fields */}
          <div className="form-group">
            <label htmlFor="tool-reason">
              Reason for Request <span style={{ color: 'var(--danger-color)' }}>*</span>
            </label>
            <textarea
              id="tool-reason"
              className="form-control"
              rows="3"
              placeholder="e.g., Lost, broken, new technician, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="tool-urgency">Urgency</label>
            <select
              id="tool-urgency"
              className="form-control"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
            >
              <option value="Low - Within the week">Low - Within the week</option>
              <option value="Medium - Within a few days">Medium - Within a few days</option>
              <option value="High - ASAP">High - ASAP</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="tool-notes">Additional Notes</label>
            <textarea
              id="tool-notes"
              className="form-control"
              rows="3"
              placeholder="Any other details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <i className="fas fa-spinner fa-spin"></i> Submitting...
              </>
            ) : (
              <>
                <i className="fas fa-paper-plane"></i> Submit Request
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const ToolRow = ({ row, index, tools, onUpdate, onRemove, canRemove }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const allOptions = [...tools.map(t => t.name), 'Other'];
  const filteredOptions = allOptions.filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectOption = (option) => {
    onUpdate('selectedTool', option);
    setSearchTerm(option);
    setShowDropdown(false);
    if (option !== 'Other') {
      onUpdate('otherToolName', '');
    }
  };

  return (
    <div
      style={{
        background: 'var(--surface-secondary)',
        padding: '16px',
        borderRadius: 'var(--radius-md)',
        marginBottom: '12px',
        border: '1px solid var(--border-color)',
        position: 'relative'
      }}
    >
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'none',
            border: 'none',
            color: 'var(--danger-color)',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '4px 8px'
          }}
          title="Remove this tool"
        >
          <i className="fas fa-times"></i>
        </button>
      )}

      <div className="form-group" style={{ marginBottom: row.selectedTool === 'Other' ? '12px' : '0' }}>
        <label htmlFor={`tool-search-${row.id}`}>
          Tool {index + 1} <span style={{ color: 'var(--danger-color)' }}>*</span>
        </label>
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <input
            type="text"
            id={`tool-search-${row.id}`}
            className="form-control"
            placeholder="Search or select a tool..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            autoComplete="off"
          />
          {showDropdown && filteredOptions.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: 'var(--surface-color)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                maxHeight: '200px',
                overflowY: 'auto',
                zIndex: 1000,
                marginTop: '4px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
              }}
            >
              {filteredOptions.map((option) => (
                <div
                  key={option}
                  onClick={() => selectOption(option)}
                  style={{
                    padding: '12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-color)',
                    backgroundColor: row.selectedTool === option ? 'var(--primary-color)' : 'transparent',
                    color: row.selectedTool === option ? 'white' : 'var(--text-color)'
                  }}
                  onMouseEnter={(e) => {
                    if (row.selectedTool !== option) {
                      e.currentTarget.style.backgroundColor = 'var(--surface-tertiary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (row.selectedTool !== option) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  {option}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {row.selectedTool === 'Other' && (
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor={`other-tool-name-${row.id}`}>
            Please specify the tool you need <span style={{ color: 'var(--danger-color)' }}>*</span>
          </label>
          <input
            type="text"
            id={`other-tool-name-${row.id}`}
            className="form-control"
            placeholder="Enter tool name..."
            value={row.otherToolName}
            onChange={(e) => onUpdate('otherToolName', e.target.value)}
            required
          />
        </div>
      )}
    </div>
  );
};

export default RequestToolModal;
