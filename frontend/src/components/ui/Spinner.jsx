function Spinner({ className = '' }) {
  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"></div>
    </div>
  );
}

export default Spinner;
