import React from 'react';

function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-transparent">
      {children}
    </div>
  );
}

export default AuthLayout;
