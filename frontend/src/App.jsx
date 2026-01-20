import React, { useState } from 'react';
import { UploadZone } from './components/UploadZone.jsx';
import { ReportDashboard } from './components/ReportDashboard.jsx';

function App() {
    const [analysisData, setAnalysisData] = useState(null);

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
                <header className="mb-12 text-center">
                    <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl mb-2">
                        Veri<span className="text-brand-600">Doc</span>
                    </h1>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                        Forensic-grade document verification powered by conditional AI analysis.
                    </p>
                </header>

                <main>
                    {!analysisData ? (
                        <UploadZone onUploadComplete={setAnalysisData} />
                    ) : (
                        <ReportDashboard data={analysisData} onReset={() => setAnalysisData(null)} />
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;
