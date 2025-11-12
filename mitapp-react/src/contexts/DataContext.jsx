import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import firebaseService from '../services/firebaseService';

const DataContext = createContext({});

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

export const DataProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [staffingData, setStaffingData] = useState(null);
  const [wageSettings, setWageSettings] = useState(null);
  const [monthlyData, setMonthlyData] = useState({});
  const [unifiedTechnicianData, setUnifiedTechnicianData] = useState([]);
  const [currentYear] = useState(new Date().getFullYear());

  // Load all data on mount
  useEffect(() => {
    if (currentUser) {
      loadAllData();
    }
  }, [currentUser]);

  const loadAllData = async () => {
    try {
      setLoading(true);

      // Load all data in parallel
      const [staffing, wages, monthly] = await Promise.all([
        loadStaffingData(),
        loadWageSettings(),
        loadAllMonthlyData()
      ]);

      setStaffingData(staffing);
      setWageSettings(wages);
      setMonthlyData(monthly);

      // Build unified technician data
      const unified = await buildUnifiedTechnicianData(staffing);
      setUnifiedTechnicianData(unified);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStaffingData = async () => {
    try {
      let data = await firebaseService.loadStaffingData();
      if (!data || !data.zones) {
        data = getDefaultStaffingData();
      }
      return sanitizeStaffingData(data);
    } catch (error) {
      console.error('Error loading staffing data:', error);
      return sanitizeStaffingData(getDefaultStaffingData());
    }
  };

  const loadWageSettings = async () => {
    try {
      const data = await firebaseService.loadWageSettings();
      return data || getDefaultWageSettings();
    } catch (error) {
      console.error('Error loading wage settings:', error);
      return getDefaultWageSettings();
    }
  };

  const loadAllMonthlyData = async () => {
    try {
      const data = {};
      const monthlyDataFromDB = await firebaseService.loadMonthlyData(currentYear);

      for (let i = 0; i < 12; i++) {
        data[i] = monthlyDataFromDB?.[i] || getDefaultMonthlyData(i);
      }

      return data;
    } catch (error) {
      console.error('Error loading monthly data:', error);
      const data = {};
      for (let i = 0; i < 12; i++) {
        data[i] = getDefaultMonthlyData(i);
      }
      return data;
    }
  };

  const buildUnifiedTechnicianData = async (staffing) => {
    const unified = [];

    if (!staffing || !staffing.zones) {
      return unified;
    }

    // Get recurring rules for all technicians
    const recurringRules = await firebaseService.getAllRecurringRules();

    // Add zone leads and members
    staffing.zones.forEach(zone => {
      if (zone.lead) {
        const leadData = {
          ...zone.lead,
          zoneName: zone.name,
          isLead: true,
          recurringRules: recurringRules.filter(r => r.technicianId === zone.lead.id)
        };
        unified.push(leadData);
      }

      if (zone.members) {
        zone.members.forEach(member => {
          const memberData = {
            ...member,
            zoneName: zone.name,
            isLead: false,
            recurringRules: recurringRules.filter(r => r.technicianId === member.id)
          };
          unified.push(memberData);
        });
      }
    });

    return unified;
  };

  const sanitizeStaffingData = (data) => {
    if (data.zones) {
      data.zones.forEach(zone => {
        if (zone.lead && !zone.lead.id) {
          zone.lead.id = generatePersonId();
        }
        if (zone.members) {
          zone.members.forEach(member => {
            if (!member.id) {
              member.id = generatePersonId();
            }
          });
        }
      });
    }
    return data;
  };

  const generatePersonId = () => {
    return 'person_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  };

  const getDefaultStaffingData = () => {
    return {
      zones: [],
      management: [],
      warehouseStaff: [],
      secondShiftLead: null
    };
  };

  const getDefaultWageSettings = () => {
    return {
      avgHourlyBaseWage: 25,
      avgOTWage: 37.5,
      fieldSupervisorWage: 85000,
      foremanWage: 65000,
      assistantMitManagerWage: 75000,
      mitManagerWage: 95000,
      fieldSupervisorBonus: 500
    };
  };

  const getDefaultMonthlyData = (month) => {
    return {
      month,
      leadsTarget: 1000,
      leadsPercentGoal: 1.0,
      bookingRate: 0.45,
      wtrInsClosingRate: 0.25,
      wtrCashClosingRate: 0.15,
      mitAvgDaysOnsite: 3,
      hoursPerAppointment: 8,
      averageDriveTime: 1.5,
      otHoursPerTechPerDay: 1,
      teamMembersOffPerDay: 2,
      daysInMonth: new Date(new Date().getFullYear(), month + 1, 0).getDate(),
      currentStaffingLevel: 0,
      actualLeads: 0,
      salesOps: 0,
      projectedWTRJobs: 0,
      activeJobsPerDay: 0,
      hoursNeededPerDay: 0,
      techsForemenNeeded: 0,
      staffingNeed: 0,
      staffingDelta: 0,
      mitTechLaborCost: 0,
      fixedLaborCost: 0,
      totalLaborSpend: 0,
      costPerWTRJob: 0
    };
  };

  // Save functions
  const saveStaffingData = async (data) => {
    try {
      await firebaseService.saveStaffingData(data);
      setStaffingData(data);
    } catch (error) {
      console.error('Error saving staffing data:', error);
      throw error;
    }
  };

  const saveWageSettings = async (data) => {
    try {
      await firebaseService.saveWageSettings(data);
      setWageSettings(data);
    } catch (error) {
      console.error('Error saving wage settings:', error);
      throw error;
    }
  };

  const saveMonthlyData = async (month, data) => {
    try {
      const allData = { ...monthlyData, [month]: data };
      await firebaseService.saveMonthlyData(currentYear, allData);
      setMonthlyData(allData);
    } catch (error) {
      console.error('Error saving monthly data:', error);
      throw error;
    }
  };

  const value = {
    loading,
    staffingData,
    wageSettings,
    monthlyData,
    unifiedTechnicianData,
    currentYear,
    loadAllData,
    saveStaffingData,
    saveWageSettings,
    saveMonthlyData
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export default DataContext;
