import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useAuth } from '../contexts/AuthContext';
import firebaseService from '../services/firebaseService';

const SlackMentions = () => {
  const { currentUser } = useAuth();
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('my-todos');

  useEffect(() => {
    loadMentions();
  }, [currentUser]);

  const loadMentions = async () => {
    try {
      setLoading(true);
      // Load from Firebase slack mentions collection
      const data = await firebaseService.getDocument('hou_slack_mentions', 'mentions_data');

      if (data && data.mentions) {
        // Filter mentions for current user
        const userMentions = data.mentions.filter(m =>
          m.user === currentUser?.email || m.assignedTo === currentUser?.email
        );
        setMentions(userMentions || []);
      }
    } catch (error) {
      console.error('Error loading Slack mentions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const toggleTodoStatus = async (mentionId) => {
    try {
      // Update mention status in Firebase
      const updatedMentions = mentions.map(m =>
        m.id === mentionId ? { ...m, completed: !m.completed } : m
      );
      setMentions(updatedMentions);

      // Save to Firebase
      await firebaseService.updateDocument('hou_slack_mentions', 'mentions_data', {
        mentions: updatedMentions
      });
    } catch (error) {
      console.error('Error updating mention status:', error);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="tab-content active">
          <p>Loading Slack mentions...</p>
        </div>
      </Layout>
    );
  }

  const activeMentions = mentions.filter(m => !m.completed);
  const completedMentions = mentions.filter(m => m.completed);

  return (
    <Layout>
      <div className="tab-content active">
        <div className="tab-header">
          <h2>Slack Mentions</h2>
          <div className="tab-controls">
            <button className="btn btn-primary" disabled title="Coming soon">
              <i className="fas fa-sync"></i> Sync Mentions
            </button>
          </div>
        </div>

        <div className="tab-header">
          <div className="sub-nav">
            <button
              className={`sub-nav-btn ${activeView === 'my-todos' ? 'active' : ''}`}
              onClick={() => setActiveView('my-todos')}
            >
              <i className="fas fa-tasks"></i> My To-Dos
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'completed' ? 'active' : ''}`}
              onClick={() => setActiveView('completed')}
            >
              <i className="fas fa-check-circle"></i> Completed
            </button>
          </div>
        </div>

        {activeView === 'my-todos' && (
          <div className="card">
            <div className="card-header">
              <h3><i className="fas fa-tasks"></i> Active To-Dos ({activeMentions.length})</h3>
            </div>
            <div className="table-container">
              {activeMentions.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}></th>
                      <th>Message</th>
                      <th>From</th>
                      <th>Channel</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeMentions.map((mention, index) => (
                      <tr key={mention.id || index}>
                        <td>
                          <input
                            type="checkbox"
                            checked={mention.completed || false}
                            onChange={() => toggleTodoStatus(mention.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td>{mention.text || mention.message || 'N/A'}</td>
                        <td>{mention.from || mention.user || 'N/A'}</td>
                        <td>{mention.channel || 'N/A'}</td>
                        <td>{formatDate(mention.timestamp || mention.ts)}</td>
                        <td>
                          <button className="btn btn-secondary btn-small" disabled title="Coming soon">
                            <i className="fas fa-reply"></i> Reply
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ padding: '20px', textAlign: 'center' }}>
                  No active to-dos. Great job! 🎉
                </p>
              )}
            </div>
          </div>
        )}

        {activeView === 'completed' && (
          <div className="card">
            <div className="card-header">
              <h3><i className="fas fa-check-circle"></i> Completed To-Dos ({completedMentions.length})</h3>
            </div>
            <div className="table-container">
              {completedMentions.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}></th>
                      <th>Message</th>
                      <th>From</th>
                      <th>Channel</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedMentions.map((mention, index) => (
                      <tr key={mention.id || index} style={{ opacity: 0.6 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={true}
                            onChange={() => toggleTodoStatus(mention.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ textDecoration: 'line-through' }}>
                          {mention.text || mention.message || 'N/A'}
                        </td>
                        <td>{mention.from || mention.user || 'N/A'}</td>
                        <td>{mention.channel || 'N/A'}</td>
                        <td>{formatDate(mention.timestamp || mention.ts)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ padding: '20px', textAlign: 'center' }}>
                  No completed to-dos yet.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="card" style={{ marginTop: '24px', backgroundColor: '#fffbea', border: '1px solid #f59e0b' }}>
          <div className="card-header" style={{ backgroundColor: '#fef3c7' }}>
            <h3><i className="fas fa-info-circle"></i> About Slack Integration</h3>
          </div>
          <div style={{ padding: '20px' }}>
            <p>
              This page displays Slack mentions and to-dos synced from your workspace.
              The Sync feature requires Slack API configuration and will be available soon.
            </p>
            <p style={{ marginTop: '12px' }}>
              <strong>Note:</strong> Slack mentions are currently stored in Firebase and can be viewed here.
              Real-time Slack API integration coming soon.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SlackMentions;
