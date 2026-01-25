import React, { useState } from 'react';
import { UploadZone } from './components/UploadZone.jsx';
import { ReportDashboard } from './components/ReportDashboard.jsx';

import { ThemeProvider } from './context/ThemeContext';
import { ThemeToggle } from './components/ThemeToggle';

function AppContent() {
    const [analysisData, setAnalysisData] = useState(null);

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 transition-colors duration-300 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto relative">
                <div className="absolute top-0 right-0 z-50">
                    <ThemeToggle />
                </div>

                <header className="mb-12 text-center">
                    <h1 className="text-4xl font-extrabold text-zinc-800 dark:text-white tracking-tight sm:text-5xl mb-2">
                        Veri<span className="text-zinc-500 dark:text-zinc-400">Doc</span>
                    </h1>
                    <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
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

function App() {
    return (
        <ThemeProvider>
            <AppContent />
        </ThemeProvider>
    );
}

export default App;
