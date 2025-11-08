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
        padding: '12px 14px',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        zIndex: 999999,
        minWidth: '320px',
        maxWidth: '400px',
        fontSize: '12px',
        lineHeight: '1.5',
        whiteSpace: 'normal',
        pointerEvents: 'none',
        fontFamily: 'monospace',
        border: '1px solid #374151'
      }}
    >
      {/* Arrow */}
      <div style={arrowStyle} />

      {/* Header */}
      <div style={{ fontWeight: '700', marginBottom: '8px', fontSize: '13px', textAlign: 'center' }}>
        🚗 ROUTE QUALITY: {rating === 'red' ? 'ORANGE' : rating.toUpperCase()} ({score}/100)
      </div>

      {/* Reasons */}
      {reasons && reasons.length > 0 && (
        <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #4b5563' }}>
          {reasons.map((reason, idx) => (
            <div key={idx} style={{ marginBottom: '4px' }}>
              • {reason}
            </div>
          ))}
        </div>
      )}

      {/* Detailed Breakdown */}
      <div style={{ fontSize: '11px' }}>
        <div style={{ fontWeight: '600', marginBottom: '6px', textAlign: 'center', color: '#9ca3af' }}>
          ━━━ DETAILED BREAKDOWN ━━━
        </div>

        {/* Drive Time Efficiency */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontWeight: '600', color: '#60a5fa', marginBottom: '3px' }}>
            📊 Drive Time Efficiency:
          </div>
          <div style={{ paddingLeft: '12px' }}>
            <div>• Drive time: {details.totalDriveMinutes} min ({details.driveTimeRatio}% of work)</div>
            <div>• Route efficiency: {details.efficiency}%</div>
            <div style={{ color: '#9ca3af', fontSize: '10px' }}>
              (&lt;10% = Green, 10-25% = Yellow, &gt;25% = Red)
            </div>
          </div>
        </div>

        {/* Timeframe Compliance */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontWeight: '600', color: '#fbbf24', marginBottom: '3px' }}>
            ⏰ Timeframe Compliance:
          </div>
          <div style={{ paddingLeft: '12px' }}>
            <div>• Violations: {details.violations}</div>
            <div>• Penalty: {details.violations * 20} points</div>
          </div>
        </div>

        {/* Route Optimization */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontWeight: '600', color: '#a78bfa', marginBottom: '3px' }}>
            🔄 Route Optimization:
          </div>
          <div style={{ paddingLeft: '12px' }}>
            <div>• Backtracking issues: {details.backtracking}</div>
            <div>• Penalty: {details.backtracking * 10} points</div>
          </div>
        </div>

        {/* Workload Utilization */}
        <div>
          <div style={{ fontWeight: '600', color: '#34d399', marginBottom: '3px' }}>
            💼 Workload Utilization:
          </div>
          <div style={{ paddingLeft: '12px' }}>
            <div>• Total work hours: {details.totalWorkHours}h</div>
            <div style={{ color: details.totalWorkHours >= 4 ? '#34d399' : '#f87171' }}>
              • Status: {details.totalWorkHours >= 4 ? 'Good' : 'Underutilized (<4h)'}
            </div>
          </div>
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
                         rating === 'yellow' ? '#f59e0b' : '#fb923c',
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
