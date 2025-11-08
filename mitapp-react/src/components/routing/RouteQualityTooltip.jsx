import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const RouteQualityTooltip = ({ routeQuality, size = '10px', onDotClick, direction = 'right' }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const dotRef = useRef(null);

  useEffect(() => {
    if (showTooltip && dotRef.current) {
      const rect = dotRef.current.getBoundingClientRect();
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const scrollX = window.scrollX || document.documentElement.scrollLeft;

      // Calculate position based on direction
      let newCoords = { top: 0, left: 0 };

      if (direction === 'bottom') {
        // Position below the dot, centered horizontally
        newCoords = {
          top: rect.bottom + scrollY + 8,
          left: rect.left + scrollX + (rect.width / 2)
        };
      } else if (direction === 'left') {
        // Position to the left of the dot, centered vertically
        newCoords = {
          top: rect.top + scrollY + (rect.height / 2),
          left: rect.left + scrollX - 8
        };
      } else {
        // Default: position to the right of the dot, centered vertically
        newCoords = {
          top: rect.top + scrollY + (rect.height / 2),
          left: rect.right + scrollX + 8
        };
      }

      setCoords(newCoords);
    }
  }, [showTooltip, direction]);

  if (!routeQuality) return null;

  const { rating, score, reasons, details } = routeQuality;

  // Determine transform and arrow based on direction
  let transform = '';
  let arrowStyle = {};

  if (direction === 'bottom') {
    transform = 'translateX(-50%)';
    // Arrow pointing up
    arrowStyle = {
      position: 'absolute',
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 0,
      height: 0,
      borderLeft: '6px solid transparent',
      borderRight: '6px solid transparent',
      borderBottom: '6px solid #1f2937'
    };
  } else if (direction === 'left') {
    transform = 'translate(-100%, -50%)';
    // Arrow pointing right
    arrowStyle = {
      position: 'absolute',
      top: '50%',
      left: '100%',
      transform: 'translateY(-50%)',
      width: 0,
      height: 0,
      borderTop: '6px solid transparent',
      borderBottom: '6px solid transparent',
      borderLeft: '6px solid #1f2937'
    };
  } else {
    transform = 'translateY(-50%)';
    // Arrow pointing left
    arrowStyle = {
      position: 'absolute',
      top: '50%',
      right: '100%',
      transform: 'translateY(-50%)',
      width: 0,
      height: 0,
      borderTop: '6px solid transparent',
      borderBottom: '6px solid transparent',
      borderRight: '6px solid #1f2937'
    };
  }

  const tooltipContent = showTooltip && (
    <div
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        transform: transform,
        backgroundColor: '#1f2937',
        color: 'white',
        padding: '8px 10px',
        borderRadius: '6px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        zIndex: 999999,
        minWidth: '280px',
        maxWidth: '320px',
        fontSize: '11px',
        lineHeight: '1.4',
        whiteSpace: 'normal',
        pointerEvents: 'none',
        fontFamily: 'monospace',
        border: '1px solid #374151'
      }}
    >
      {/* Arrow */}
      <div style={arrowStyle} />

      {/* Header */}
      <div style={{ fontWeight: '700', marginBottom: '6px', fontSize: '12px', textAlign: 'center' }}>
        {rating === 'red' ? '🟠' : rating === 'yellow' ? '🟡' : '🟢'} {score}/100
      </div>

      {/* Reasons */}
      {reasons && reasons.length > 0 && (
        <div style={{ marginBottom: '6px', paddingBottom: '6px', borderBottom: '1px solid #4b5563', fontSize: '10px' }}>
          {reasons.map((reason, idx) => (
            <div key={idx} style={{ marginBottom: '2px' }}>
              • {reason}
            </div>
          ))}
        </div>
      )}

      {/* Compact Breakdown */}
      <div style={{ fontSize: '10px', lineHeight: '1.3' }}>
        {/* Drive Time */}
        <div style={{ marginBottom: '4px' }}>
          <span style={{ color: '#60a5fa' }}>🚗 Drive:</span> {details.totalDriveMinutes}min ({details.driveTimeRatio}%) = -{details.driveTimeRatio}pts
        </div>

        {/* Violations */}
        {details.violations > 0 && (
          <div style={{ marginBottom: '4px' }}>
            <span style={{ color: '#fbbf24' }}>⏰ Violations:</span> {details.violations} = -{details.violations * 20}pts
          </div>
        )}

        {/* Backtracking */}
        {details.backtracking > 0 && (
          <div style={{ marginBottom: '4px' }}>
            <span style={{ color: '#a78bfa' }}>🔄 Backtrack:</span> {details.backtracking} = -{details.backtracking * 10}pts
          </div>
        )}

        {/* Workload */}
        <div style={{ marginBottom: '4px' }}>
          <span style={{ color: '#34d399' }}>💼 Work:</span> {details.totalWorkHours}h
          {details.totalWorkHours < 4 && <span style={{ color: '#f87171' }}> (under, -10pts)</span>}
          {details.totalWorkHours > 8 && <span style={{ color: '#fb923c' }}> (over, -{Math.ceil(details.totalWorkHours - 8) * 10}pts)</span>}
        </div>

        {/* Thresholds */}
        <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #4b5563', fontSize: '9px', color: '#9ca3af' }}>
          75+ 🟢 | 60-74 🟡 | &lt;60 🟠
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Colored Dot Indicator */}
      <span
        ref={dotRef}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: rating === 'green' ? '#10b981' :
                         rating === 'yellow' ? '#eab308' : '#fb923c',
          display: 'inline-block',
          flexShrink: 0,
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          cursor: 'help'
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={onDotClick}
      />

      {/* Render tooltip at document body level using Portal */}
      {showTooltip && createPortal(tooltipContent, document.body)}
    </>
  );
};

export default RouteQualityTooltip;
