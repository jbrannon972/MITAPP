import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useData } from '../contexts/DataContext';
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  getDefaultMonthlyData,
  getDefaultWageSettings,
  calculateMonth
} from '../utils/forecastingCalculations';
import AnnualView from '../components/forecasting/AnnualView';
import MonthlyView from '../components/forecasting/MonthlyView';
import InputsView from '../components/forecasting/InputsView';

const Forecasting = () => {
  const { staffingData } = useData();
  const [activeView, setActiveView] = useState('annual');
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [monthlyData, setMonthlyData] = useState([]);
  const [wageSettings, setWageSettings] = useState(null);
  const [calculatedData, setCalculatedData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Generate year options (current year +/- 2 years)
  const yearOptions = [];
  for (let i = -2; i <= 2; i++) {
    yearOptions.push(new Date().getFullYear() + i);
  }

  // Load monthly data and wage settings
  useEffect(() => {
    loadAllData();
  }, [currentYear]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadMonthlyData(),
        loadWageSettings()
      ]);
    } catch (error) {
      console.error('Error loading forecasting data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMonthlyData = async () => {
    try {
      const dataArray = [];
      for (let month = 0; month < 12; month++) {
        const docRef = doc(db, 'forecasting', `${currentYear}`, 'months', `${month + 1}`);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          dataArray[month] = docSnap.data();
        } else {
          dataArray[month] = getDefaultMonthlyData(month);
        }
      }
      setMonthlyData(dataArray);
    } catch (error) {
      console.error('Error loading monthly data:', error);
      // Use defaults on error
      const defaults = [];
      for (let i = 0; i < 12; i++) {
        defaults[i] = getDefaultMonthlyData(i);
      }
      setMonthlyData(defaults);
    }
  };

  const loadWageSettings = async () => {
    try {
      const docRef = doc(db, 'forecasting', 'wageSettings');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setWageSettings(docSnap.data());
      } else {
        setWageSettings(getDefaultWageSettings());
      }
    } catch (error) {
      console.error('Error loading wage settings:', error);
      setWageSettings(getDefaultWageSettings());
    }
  };

  // Calculate all months when data changes
  useEffect(() => {
    if (monthlyData.length > 0 && wageSettings && staffingData) {
      calculateAllMonths();
    }
  }, [monthlyData, wageSettings, staffingData, currentYear]);

  const calculateAllMonths = () => {
    const calculated = [];
    for (let month = 0; month < 12; month++) {
      calculated[month] = calculateMonth(
        monthlyData[month],
        staffingData,
        wageSettings,
        month,
        currentYear
      );
    }
    setCalculatedData(calculated);
  };

  const saveMonthlyData = async (month, data) => {
    try {
      const docRef = doc(db, 'forecasting', `${currentYear}`, 'months', `${month + 1}`);
      await setDoc(docRef, data);

      // Update local state
      const updated = [...monthlyData];
      updated[month] = data;
      setMonthlyData(updated);
    } catch (error) {
      console.error('Error saving monthly data:', error);
      throw error;
    }
  };

  const saveWageSettings = async (settings) => {
    try {
      const docRef = doc(db, 'forecasting', 'wageSettings');
      await setDoc(docRef, settings);
      setWageSettings(settings);
    } catch (error) {
      console.error('Error saving wage settings:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '40px', textAlign: 'center' }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize: '48px', color: 'var(--primary-color)' }}></i>
        <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Loading forecasting data...</p>
      </div>
    );
  }

  return (
    <Layout>
      <div className="container" style={{ maxWidth: '100%', padding: '20px' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h1 style={{ margin: 0 }}>
            <i className="fas fa-chart-line"></i> Labor Forecasting
          </h1>

          <select
            className="form-control"
            style={{ width: '120px' }}
            value={currentYear}
            onChange={(e) => setCurrentYear(parseInt(e.target.value))}
          >
            {yearOptions.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>

        {/* Sub Navigation */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          borderBottom: '2px solid #e5e7eb',
          paddingBottom: '8px'
        }}>
          <button
            className={`btn ${activeView === 'annual' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveView('annual')}
            style={{ fontSize: '14px' }}
          >
            <i className="fas fa-calendar-check"></i> Annual
          </button>
          <button
            className={`btn ${activeView === 'monthly' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveView('monthly')}
            style={{ fontSize: '14px' }}
          >
            <i className="fas fa-calendar-day"></i> Monthly
          </button>
          <button
            className={`btn ${activeView === 'inputs' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveView('inputs')}
            style={{ fontSize: '14px' }}
          >
            <i className="fas fa-keyboard"></i> Inputs
          </button>
        </div>

        {/* Views */}
        {activeView === 'annual' && (
          <AnnualView
            calculatedData={calculatedData}
            currentYear={currentYear}
          />
        )}

        {activeView === 'monthly' && (
          <MonthlyView
            calculatedData={calculatedData}
            monthlyData={monthlyData}
            currentYear={currentYear}
          />
        )}

        {activeView === 'inputs' && (
          <InputsView
            monthlyData={monthlyData}
            wageSettings={wageSettings}
            currentYear={currentYear}
            onSaveMonthlyData={saveMonthlyData}
            onSaveWageSettings={saveWageSettings}
          />
        )}
      </div>
    </Layout>
  );
};

export default Forecasting;
