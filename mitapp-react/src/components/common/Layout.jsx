import { useState } from 'react';
import Navigation from './Navigation';

const Layout = ({ children }) => {
  return (
    <div className="app-container">
      <header className="header" id="nav-placeholder">
        <Navigation />
      </header>
      <main className="main-content">
        <div className="container">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
