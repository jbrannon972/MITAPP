import { useState } from 'react';

const RouteQualityTooltip = ({ routeQuality, size = '10px', onDotClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!routeQuality) return null;

  const { rating, score, reasons, details } = routeQuality;

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={onDotClick}
    >
      {/* Colored Dot Indicator */}
      <span
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: rating === 'green' ? '#10b981' :
                         rating === 'yellow' ? '#f59e0b' : '#ef4444',
          display: 'inline-block',
          flexShrink: 0,
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          cursor: 'help'
        }}
      />

      {/* Tooltip Popup */}
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '8px',
            backgroundColor: '#1f2937',
            color: 'white',
            padding: '12px 14px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 10000,
            minWidth: '320px',
            maxWidth: '400px',
            fontSize: '12px',
            lineHeight: '1.5',
            whiteSpace: 'pre-wrap',
            pointerEvents: 'none',
            fontFamily: 'monospace'
          }}
        >
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid #1f2937'
            }}
          />

          {/* Header */}
          <div style={{ fontWeight: '700', marginBottom: '8px', fontSize: '13px', textAlign: 'center' }}>
            🚗 ROUTE QUALITY: {rating.toUpperCase()} ({score}/100)
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
      )}
    </div>
  );
};

export default RouteQualityTooltip;
