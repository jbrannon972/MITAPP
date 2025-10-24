// Utility functions for exporting data

export const exportToCSV = (data, filename) => {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  // Get headers from first object
  const headers = Object.keys(data[0]);

  // Create CSV content
  let csvContent = headers.join(',') + '\n';

  // Add data rows
  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header];
      // Handle values with commas, quotes, or newlines
      if (value === null || value === undefined) {
        return '';
      }
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return '"' + stringValue.replace(/"/g, '""') + '"';
      }
      return stringValue;
    });
    csvContent += values.join(',') + '\n';
  });

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const prepareFleetDataForExport = (vehicles) => {
  return vehicles.map(vehicle => ({
    'Truck Number': vehicle.truckNumber || 'N/A',
    'Type': vehicle.type || 'N/A',
    'Assigned To': vehicle.assignedTo || 'Unassigned',
    'Status': vehicle.status || 'Unknown',
    'Make': vehicle.make || 'N/A',
    'Model': vehicle.model || 'N/A',
    'Year': vehicle.year || 'N/A'
  }));
};

export const prepareEquipmentDataForExport = (equipment) => {
  return equipment.map(item => ({
    'Item Number': item.itemNumber || 'N/A',
    'Name': item.name || 'N/A',
    'Category': item.category || 'N/A',
    'Assigned To': item.assignedTo || 'Unassigned',
    'Status': item.status || 'Unknown',
    'Location': item.location || 'N/A'
  }));
};

export const prepareToolsDataForExport = (tools) => {
  return tools.map(tool => ({
    'Tool ID': tool.toolId || tool.id || 'N/A',
    'Name': tool.name || 'N/A',
    'Category': tool.category || 'N/A',
    'Assigned To': tool.assignedTo || 'Unassigned',
    'Status': tool.status || 'Unknown',
    'Location': tool.location || 'N/A'
  }));
};

export const prepareDamagesDataForExport = (damages) => {
  return damages.map(damage => ({
    'Date': damage.date || 'N/A',
    'Technician': damage.technician || 'N/A',
    'Vehicle': damage.vehicle || 'N/A',
    'Equipment': damage.equipment || 'N/A',
    'Description': damage.description || 'No description',
    'Status': damage.status || 'Pending',
    'Cost': damage.cost ? `$${parseFloat(damage.cost).toFixed(2)}` : 'TBD'
  }));
};

export const prepareTeamDataForExport = (staffingData) => {
  const teamData = [];

  // Add management
  if (staffingData.management) {
    staffingData.management.forEach(member => {
      teamData.push({
        'Name': member.name,
        'Role': member.role,
        'Zone': 'Management',
        'Position': 'Leadership'
      });
    });
  }

  // Add zones
  if (staffingData.zones) {
    staffingData.zones.forEach(zone => {
      // Add zone lead
      if (zone.lead) {
        teamData.push({
          'Name': zone.lead.name,
          'Role': zone.lead.role,
          'Zone': zone.name,
          'Position': 'Lead'
        });
      }

      // Add zone members
      zone.members.forEach(member => {
        teamData.push({
          'Name': member.name,
          'Role': member.role,
          'Zone': zone.name,
          'Position': 'Member'
        });
      });
    });
  }

  return teamData;
};
