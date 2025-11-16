import React from 'react';

/**
 * StormModeFilter - Filter jobs and staff by category during Storm Mode
 * Updated: 2025-01-16 - Added to Manual and Kanban routing views
 *
 * @param {string} activeFilter - Current active filter
 * @param {Function} onFilterChange - Callback when filter changes
 * @param {boolean} stormMode - Whether Storm Mode is active
 */
const StormModeFilter = ({ activeFilter, onFilterChange, stormMode }) => {
  if (!stormMode) return null;

  const filters = [
    { id: 'all', label: 'All Staff & Jobs', icon: 'fa-th' },
    { id: 'subCrewsAndDemos', label: 'Sub Crews & Demos', icon: 'fa-people-group' },
    { id: 'checkServices', label: 'Check Services', icon: 'fa-clipboard-check' },
    { id: 'installs', label: 'Installs', icon: 'fa-tools' },
    { id: 'pulls', label: 'Pulls', icon: 'fa-arrow-down' },
    { id: 'regularOnly', label: 'Regular Techs Only', icon: 'fa-user-hard-hat' }
  ];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginLeft: '12px'
    }}>
      <label style={{
        fontSize: '13px',
        fontWeight: '500',
        color: 'var(--text-secondary)',
        whiteSpace: 'nowrap'
      }}>
        Filter:
      </label>
      <select
        value={activeFilter}
        onChange={(e) => onFilterChange(e.target.value)}
        style={{
          padding: '6px 32px 6px 10px',
          fontSize: '13px',
          border: '1px solid var(--surface-secondary)',
          borderRadius: '4px',
          backgroundColor: 'var(--surface-primary)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          fontWeight: '500',
          minWidth: '200px'
        }}
      >
        {filters.map(filter => (
          <option key={filter.id} value={filter.id}>
            {filter.label}
          </option>
        ))}
      </select>
    </div>
  );
};

/**
 * Filter jobs based on active filter
 * @param {Array} jobs - All jobs
 * @param {string} filter - Active filter ID
 * @returns {Array} Filtered jobs
 */
export const filterJobs = (jobs, filter) => {
  if (!filter || filter === 'all') return jobs;

  return jobs.filter(job => {
    const jobType = job.jobType?.toLowerCase() || '';

    switch (filter) {
      case 'subCrewsAndDemos':
        return jobType === 'demo' || jobType === 'demo prep' || jobType === 'demo-prep';

      case 'checkServices':
        return jobType === 'check' || jobType === 'service' || jobType === 'fs visit' || jobType === 'fs-visit';

      case 'installs':
        return jobType === 'install';

      case 'pulls':
        return jobType === 'pull';

      case 'regularOnly':
        return true; // Show all jobs for regular techs

      default:
        return true;
    }
  });
};

/**
 * Filter staff based on active filter
 * @param {Object} stormModeData - Storm Mode staff data
 * @param {Array} regularTechs - Regular technician array
 * @param {string} filter - Active filter ID
 * @returns {Object} Filtered staff by category
 */
export const filterStaff = (stormModeData, regularTechs, filter) => {
  const result = {
    regularTechs: [],
    projectManagers: [],
    ehqLeaders: [],
    ehqCSStaff: [],
    subContractors: []
  };

  // Always include regular techs except when explicitly hiding them
  if (filter !== 'subCrewsAndDemos') {
    result.regularTechs = regularTechs || [];
  }

  // If regular only or no storm mode data, return early
  if (filter === 'regularOnly' || !stormModeData) {
    return result;
  }

  if (filter === 'all') {
    // Show all Storm Mode staff
    result.projectManagers = stormModeData.projectManagers || [];
    result.ehqLeaders = stormModeData.ehqLeaders || [];
    result.ehqCSStaff = stormModeData.ehqCSStaff || [];
    result.subContractors = stormModeData.subContractors || [];
    return result;
  }

  // Filter by capability
  const filterByCapability = (staff, capability) => {
    return staff.filter(s => s.capabilities && s.capabilities[capability]);
  };

  switch (filter) {
    case 'subCrewsAndDemos':
      // Show PMs, EHQ Leaders with install/sub capability, and all sub contractors
      result.projectManagers = filterByCapability(stormModeData.projectManagers || [], 'install');
      result.ehqLeaders = filterByCapability(stormModeData.ehqLeaders || [], 'install');
      result.subContractors = stormModeData.subContractors || [];
      result.regularTechs = []; // Hide regular techs for sub crew routing
      break;

    case 'checkServices':
      // Show staff with CS capability
      result.projectManagers = filterByCapability(stormModeData.projectManagers || [], 'cs');
      result.ehqLeaders = filterByCapability(stormModeData.ehqLeaders || [], 'cs');
      result.ehqCSStaff = stormModeData.ehqCSStaff || []; // Always show CS staff
      break;

    case 'installs':
      // Show staff with install capability
      result.projectManagers = filterByCapability(stormModeData.projectManagers || [], 'install');
      result.ehqLeaders = filterByCapability(stormModeData.ehqLeaders || [], 'install');
      result.ehqCSStaff = filterByCapability(stormModeData.ehqCSStaff || [], 'install');
      break;

    case 'pulls':
      // Show staff with pull capability
      result.projectManagers = filterByCapability(stormModeData.projectManagers || [], 'pull');
      result.ehqLeaders = filterByCapability(stormModeData.ehqLeaders || [], 'pull');
      result.ehqCSStaff = filterByCapability(stormModeData.ehqCSStaff || [], 'pull');
      break;

    default:
      break;
  }

  return result;
};

export default StormModeFilter;
