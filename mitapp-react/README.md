# MIT App - React Version

A modern React-based labor management tool for HOU Mitigation, converted from vanilla JavaScript to provide better stability, maintainability, and developer experience.

## Overview

This is a comprehensive labor management and forecasting tool with the following features:

- **Dashboard**: Real-time overview of job stats, staffing info, and key metrics
- **Labor Forecasting**: Plan and forecast labor needs
- **Team Management**: Manage teams, zones, and personnel
- **Calendar**: Schedule and track technician availability
- **Fleet Management**: Track and manage vehicle fleet
- **Equipment Management**: Manage equipment inventory and work orders
- **Tools Management**: Track tool inventory and assignments
- **Analyzer**: Analyze performance metrics and trends
- **Damages**: Track and manage damage reports
- **Install DPT**: Manage installation department tasks
- **Slack Integration**: View and manage Slack mentions

## Technology Stack

- **Frontend**: React 18 with Vite
- **Routing**: React Router v6
- **Backend**: Firebase (Authentication & Firestore)
- **Charts**: Chart.js with react-chartjs-2
- **Styling**: CSS with custom theme (Montserrat & Oswald fonts)
- **Icons**: Font Awesome 6

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- Firebase project with Authentication and Firestore enabled

### Installation

1. Clone the repository:
   ```bash
   cd MITAPP/mitapp-react
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Firebase:
   - The Firebase configuration is already set in `src/config/firebase.js`
   - Ensure your Firebase project has the correct security rules set up

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Deploying

To deploy to Firebase Hosting:

```bash
npm run build
firebase deploy --only hosting
```

## Project Structure

```
mitapp-react/
├── src/
│   ├── components/
│   │   ├── common/          # Shared components (Layout, Navigation, etc.)
│   │   ├── dashboard/       # Dashboard-specific components
│   │   ├── team/            # Team management components
│   │   ├── calendar/        # Calendar components
│   │   ├── fleet/           # Fleet management components
│   │   ├── equipment/       # Equipment management components
│   │   └── ...              # Other feature-specific components
│   ├── contexts/
│   │   └── AuthContext.jsx  # Authentication context
│   ├── pages/               # Page components for routes
│   ├── services/
│   │   └── firebaseService.js  # Firebase service layer
│   ├── config/
│   │   └── firebase.js      # Firebase configuration
│   ├── styles/
│   │   └── styles.css       # Global styles
│   ├── App.jsx              # Main app with routing
│   └── main.jsx             # Entry point
├── public/                  # Static assets
└── index.html              # HTML template
```

## Key Features & Improvements

### Compared to Original Vanilla JS Version

✅ **Better Performance**: React's virtual DOM and efficient rendering
✅ **Component Reusability**: Modular, reusable components
✅ **Better State Management**: React hooks and context for clean state management
✅ **Type Safety Potential**: Easy to add TypeScript later
✅ **Developer Experience**: Hot module replacement, better debugging
✅ **Maintainability**: Clear component structure and separation of concerns
✅ **Modern Build Tools**: Vite for fast builds and development
✅ **Same Theming**: Preserved all original colors, fonts, and design

## Authentication

The app uses Firebase Authentication with role-based access control:

- **Manager**: Full access to all features
- **Supervisor**: Access to most features except forecasting
- **MIT Lead**: Similar to Supervisor
- **Fleet**: Limited to team and warehouse features
- **Fleet Safety**: Limited to team/leaderboard features
- **Auditor**: Read-only access to most features

## Development

### Adding New Features

1. Create components in the appropriate `components/` subdirectory
2. Add pages in `src/pages/`
3. Update routing in `src/App.jsx`
4. Add any new Firebase operations to `src/services/firebaseService.js`

### Styling

- Global styles are in `src/styles/styles.css`
- Uses CSS custom properties for theming
- Mobile-first responsive design
- Maintains original Entrusted branding (Orange #f87b4d)

## Firebase Collections

The app uses the following Firestore collections:

- `hou_settings`: App settings, staffing data, wage settings
- `hou_calendar`: Calendar events and technician schedules
- `hou_fleet`: Fleet vehicle data and work orders
- `hou_equipment`: Equipment inventory and work orders
- `hou_evaluations`: Technician evaluations
- `hou_leaderboard`: Leaderboard data
- `hou_damages`: Damage reports
- `hou_slack_mentions`: Slack mention tracking

## Support

For issues or questions, please create an issue in the repository or contact the development team.

## License

Internal use only - Entrusted Solutions
