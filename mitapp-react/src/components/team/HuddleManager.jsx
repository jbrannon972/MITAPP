import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { format, addDays, startOfDay } from 'date-fns';
import firebaseService from '../../services/firebaseService';

const HuddleManager = () => {
  const { currentUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [huddleContent, setHuddleContent] = useState({
    announcements: { content: '', visible: true },
    reminders: { content: '', visible: true },
    trainingTopic: { content: '', visible: true },
    safetyTopic: { content: '', visible: true },
    huddleTopic: { content: '', visible: true },
    weekendStaffing: { content: '', visible: true }
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  // Load huddle content when date changes
  useEffect(() => {
    loadHuddleContent();
  }, [dateStr]);

  const loadHuddleContent = async () => {
    setLoading(true);
    try {
      const content = await firebaseService.getDocument('hou_huddle_content', dateStr);

      if (content && content.categories) {
        setHuddleContent(content.categories);
      } else {
        // Reset to default empty content
        setHuddleContent({
          announcements: { content: '', visible: true },
          reminders: { content: '', visible: true },
          trainingTopic: { content: '', visible: true },
          safetyTopic: { content: '', visible: true },
          huddleTopic: { content: '', visible: true },
          weekendStaffing: { content: '', visible: true }
        });
      }
    } catch (error) {
      console.error('Error loading huddle content:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateContent = (category, value) => {
    setHuddleContent(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        content: value
      }
    }));
  };

  const toggleVisibility = (category) => {
    setHuddleContent(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        visible: !prev[category].visible
      }
    }));
  };

  const saveHuddleContent = async () => {
    setSaving(true);
    try {
      const huddleData = {
        date: dateStr,
        categories: huddleContent,
        createdBy: currentUser.userId,
        createdByName: currentUser.username,
        updatedAt: new Date().toISOString()
      };

      await firebaseService.saveDocument('hou_huddle_content', dateStr, huddleData);
      setLastSaved(new Date());
      alert('Huddle content saved successfully!');
    } catch (error) {
      console.error('Error saving huddle content:', error);
      alert('Error saving huddle content. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const copyFromPreviousDay = async () => {
    const previousDate = addDays(selectedDate, -1);
    const previousDateStr = format(previousDate, 'yyyy-MM-dd');

    setLoading(true);
    try {
      const previousContent = await firebaseService.getDocument('hou_huddle_content', previousDateStr);

      if (previousContent && previousContent.categories) {
        setHuddleContent(previousContent.categories);
        alert(`Content copied from ${format(previousDate, 'MMMM d, yyyy')}`);
      } else {
        alert('No content found for the previous day.');
      }
    } catch (error) {
      console.error('Error copying from previous day:', error);
      alert('Error copying content from previous day.');
    } finally {
      setLoading(false);
    }
  };

  const clearAllContent = () => {
    if (confirm('Are you sure you want to clear all content? This will not be saved until you click Save.')) {
      setHuddleContent({
        announcements: { content: '', visible: true },
        reminders: { content: '', visible: true },
        trainingTopic: { content: '', visible: true },
        safetyTopic: { content: '', visible: true },
        huddleTopic: { content: '', visible: true },
        weekendStaffing: { content: '', visible: true }
      });
    }
  };

  const categories = [
    { key: 'announcements', label: 'Announcements', icon: '📢' },
    { key: 'reminders', label: 'Reminders', icon: '🔔' },
    { key: 'trainingTopic', label: 'Training Topic', icon: '📚' },
    { key: 'safetyTopic', label: 'Safety Topic', icon: '⚠️' },
    { key: 'huddleTopic', label: 'Huddle Topic', icon: '💬' },
    { key: 'weekendStaffing', label: 'Weekend Staffing', icon: '📅' }
  ];

  return (
    <div className="huddle-manager">
      <div className="huddle-manager-header">
        <div className="header-left">
          <h2>Manage Huddle Information</h2>
          <p className="subtitle">
            Pre-fill huddle content for supervisors. Only visible categories with content will be shown.
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={copyFromPreviousDay}
            disabled={loading}
          >
            Copy from Previous Day
          </button>
          <button
            className="btn btn-secondary"
            onClick={clearAllContent}
            disabled={loading}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Date Picker */}
      <div className="date-picker-section">
        <label htmlFor="huddle-date">Select Date:</label>
        <input
          id="huddle-date"
          type="date"
          value={dateStr}
          onChange={(e) => setSelectedDate(new Date(e.target.value + 'T00:00:00'))}
          className="date-input"
        />
        <span className="selected-date-display">
          {format(selectedDate, 'EEEE, MMMM d, yyyy')}
        </span>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          {/* Categories */}
          <div className="huddle-categories">
            {categories.map(({ key, label, icon }) => (
              <div key={key} className="huddle-category-editor">
                <div className="category-header">
                  <div className="category-title">
                    <span className="category-icon">{icon}</span>
                    <h3>{label}</h3>
                  </div>
                  <label className="visibility-toggle">
                    <input
                      type="checkbox"
                      checked={huddleContent[key]?.visible ?? true}
                      onChange={() => toggleVisibility(key)}
                    />
                    <span>Visible to Supervisors</span>
                  </label>
                </div>
                <textarea
                  value={huddleContent[key]?.content ?? ''}
                  onChange={(e) => updateContent(key, e.target.value)}
                  placeholder={`Enter ${label.toLowerCase()}...`}
                  className="category-textarea"
                  rows="4"
                />
              </div>
            ))}
          </div>

          {/* Save Section */}
          <div className="save-section">
            {lastSaved && (
              <span className="last-saved">
                Last saved: {format(lastSaved, 'h:mm a')}
              </span>
            )}
            <button
              className="btn btn-primary btn-lg"
              onClick={saveHuddleContent}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Huddle Content'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default HuddleManager;
