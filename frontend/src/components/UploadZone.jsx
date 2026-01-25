import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2, Terminal, ArrowRight, Activity, Lock, BrainCircuit } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function UploadZone({ onUploadComplete }) {
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState(null);

    // Loader State
    const [steps, setSteps] = useState([
        { id: 'ingest', label: 'Document Ingestion', status: 'pending', icon: FileText },
        { id: 'pipeline', label: 'Forensic Pipeline', status: 'pending', icon: Activity },
        { id: 'cloud', label: 'Secure Cloud Storage', status: 'pending', icon: Lock },
        { id: 'reasoning', label: 'Agentic Reasoning', status: 'pending', icon: BrainCircuit }, // Custom icon below
    ]);
    const [currentLog, setCurrentLog] = useState("Initializing secure environment...");
    const [queue, setQueue] = useState([]);
    const [isProcessingQueue, setIsProcessingQueue] = useState(false);

    // We use a Ref to track if we're currently showing a message to enforce duration
    const processingRef = useRef(false);

    // Process Queue with Minimum Duration
    useEffect(() => {
        const processNextKey = async () => {
            if (queue.length === 0 || processingRef.current) return;

            processingRef.current = true;
            const nextMsg = queue[0];

            // 1. Update UI with new message
            setCurrentLog(nextMsg.message);
            updateStepStatus(nextMsg);

            // 2. Wait minimum duration (highlight effect)
            // Fast steps get 1000ms (1s), Slow/Important ones could theoretically get more
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 3. Remove from queue and unlock
            setQueue(prev => prev.slice(1));
            processingRef.current = false;
        };

        processNextKey();
    }, [queue]);

    // Map backend messages to UI steps
    const updateStepStatus = (msg) => {
        setSteps(prev => prev.map(step => {
            let newStatus = step.status;

            // Mark previous steps as complete
            if (step.id === 'ingest' && (msg.step === 'PIPELINE_SELECTION' || msg.step === 'ANALYSIS_RUNNING')) newStatus = 'complete';
            if (step.id === 'pipeline' && msg.step === 'GCS_UPLOAD') newStatus = 'complete';
            if (step.id === 'cloud' && msg.step === 'REASONING_START') newStatus = 'complete';

            // Mark current step as active
            if (msg.step === 'INIT' || msg.step === 'TEXT_EXTRACTION') {
                if (step.id === 'ingest') newStatus = 'active';
            }
            if (msg.step === 'PIPELINE_SELECTED' || msg.step === 'ANALYSIS_RUNNING' || msg.step === 'ANALYSIS_SUBSTEP') {
                if (step.id === 'pipeline') newStatus = 'active';
            }
            if (msg.step === 'GCS_UPLOAD') {
                if (step.id === 'cloud') newStatus = 'active';
            }
            if (msg.step === 'REASONING_START') {
                if (step.id === 'reasoning') newStatus = 'active';
            }

            return { ...step, status: newStatus };
        }));
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const handleFile = async (file) => {
        setIsUploading(true);
        setError(null);
        setSteps(prev => prev.map(s => ({ ...s, status: 'pending' })));
        setQueue([]);

        const formData = new FormData();
        formData.append('file', file);

        try {
            // Upload
            const uploadResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/upload`, {
                method: 'POST',
                body: formData,
            });

            if (!uploadResponse.ok) throw new Error('Upload failed');
            const { task_id } = await uploadResponse.json();

            // WebSocket
            const ws = new WebSocket(`${import.meta.env.VITE_API_URL.replace('https', 'wss')}/ws/analyze/${task_id}`);

            ws.onopen = () => {
                setQueue(prev => [...prev, { step: 'CONNECT', message: 'Connected to VeriDoc Analysis Engine...' }]);
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.status === 'error') {
                    setError(data.message);
                    ws.close();
                    setIsUploading(false);
                } else if (data.status === 'complete') {
                    // Force complete all steps
                    setSteps(prev => prev.map(s => ({ ...s, status: 'complete' })));
                    setQueue(prev => [...prev, { step: 'COMPLETE', message: 'Analysis Verified. finalize()' }]);

                    // Allow the final queue items to drain before finishing
                    setTimeout(() => {
                        onUploadComplete(data.data);
                    }, 2500); // Give time for the queue to drain visibly
                } else {
                    // Push to Queue
                    setQueue(prev => [...prev, data]);
                }
            };

            ws.onerror = () => {
                setError("WebSocket connection failed");
                setIsUploading(false);
            };

        } catch (err) {
            setError(err.message);
            setIsUploading(false);
        }
    };



    return (
        <div className="w-full max-w-5xl mx-auto">
            <motion.div
                layout
                className={`relative border border-dashed rounded-2xl p-16 text-center transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-sm ${isDragging ? 'border-zinc-400 dark:border-zinc-100 bg-zinc-50/80 dark:bg-zinc-800/80 shadow-2xl' : 'border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-white dark:hover:bg-zinc-900 hover:shadow-xl'}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isUploading && document.getElementById('fileInput').click()}
            >
                <input id="fileInput" type="file" className="hidden" onChange={handleFileSelect} accept=".pdf,.jpg,.png,.jpeg" disabled={isUploading} />

                <AnimatePresence mode='wait'>
                    {isUploading ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            key="uploading"
                            className="w-full flex flex-col items-center"
                        >
                            {/* NEW: Step Tracker (Large & Minimal) */}
                            <div className="w-full grid grid-cols-4 gap-8 mb-12">
                                {steps.map((step, idx) => (
                                    <div key={idx} className="flex flex-col items-center gap-4 relative">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 z-10 shadow-sm ${step.status === 'complete' ? 'bg-zinc-700 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-zinc-200 dark:shadow-zinc-900' :
                                                step.status === 'active' ? 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-100 ring-2 ring-zinc-500 dark:ring-zinc-100 scale-110 shadow-lg' :
                                                    'bg-zinc-50 dark:bg-zinc-900 text-zinc-300 dark:text-zinc-700 border border-zinc-100 dark:border-zinc-800'
                                            }`}>
                                            {step.status === 'complete' ? <CheckCircle className="w-6 h-6" /> :
                                                step.status === 'active' ? <step.icon className="w-6 h-6 animate-pulse" /> :
                                                    <step.icon className="w-6 h-6" />}
                                        </div>
                                        <span className={`text-xs font-bold uppercase tracking-widest text-center transition-colors duration-300 ${step.status === 'active' ? 'text-zinc-700 dark:text-zinc-100' :
                                                step.status === 'complete' ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-300 dark:text-zinc-700'
                                            }`}>
                                            {step.label}
                                        </span>
                                        {/* Connector Line */}
                                        {idx < steps.length - 1 && (
                                            <div className="absolute top-7 left-1/2 w-full h-[2px] bg-zinc-100 dark:bg-zinc-800 -z-0">
                                                <div className={`h-full bg-zinc-300 dark:bg-zinc-100 transition-all duration-700 ease-out ${step.status === 'complete' ? 'w-full' : 'w-0'}`} />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Active Log Terminal (Clean) */}
                            <div className="w-full max-w-2xl bg-zinc-700 dark:bg-black rounded-xl p-6 font-mono text-sm shadow-2xl text-left relative overflow-hidden h-40 flex flex-col justify-end border border-zinc-600 dark:border-zinc-800">
                                <div className="absolute top-0 right-0 p-4 opacity-10"><Terminal className="w-16 h-16 text-white" /></div>
                                <div className="text-zinc-400 text-xs mb-3 flex items-center gap-2 uppercase tracking-wider">
                                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                    VeriDoc//Engine_Thread_01
                                </div>
                                <div className="flex-1 flex flex-col justify-end gap-1">
                                    <motion.div
                                        key={currentLog}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="text-zinc-100 font-medium truncate text-base"
                                    >
                                        <span className="text-zinc-500 mr-2">$</span>
                                        {currentLog}
                                    </motion.div>
                                    <div className="text-zinc-500 text-xs mt-2 flex justify-between">
                                        <span>{(queue.length > 0) ? `>> QUEUE_DEPTH: ${queue.length}` : ">> SYNC_IDLE"}</span>
                                        <span>MEM: 48MB</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            key="idle"
                            className="flex flex-col items-center py-12"
                        >
                            <div className="w-24 h-24 bg-zinc-50 dark:bg-zinc-900 rounded-3xl flex items-center justify-center mb-8 group-hover:scale-105 transition-transform duration-500 border border-zinc-100 dark:border-zinc-800 shadow-inner">
                                <Upload className="w-10 h-10 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-100 transition-colors" />
                            </div>
                            <h3 className="text-3xl font-bold text-zinc-700 dark:text-zinc-50 mb-3 tracking-tight">
                                Forensic Upload
                            </h3>
                            <p className="text-zinc-500 dark:text-zinc-400 mb-10 max-w-md text-lg leading-relaxed">
                                Drop your document for cryptographic & visual integrity analysis.
                            </p>
                            <button className="px-8 py-4 bg-zinc-700 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-black rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 text-sm tracking-wide">
                                SELECT SOURCE FILE
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {error && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 p-4 bg-red-50 dark:bg-red-900/10 text-red-900 dark:text-red-400 rounded-xl flex items-center gap-3 border border-red-100 dark:border-red-900/20 shadow-sm"
                >
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600 dark:text-red-400" />
                    <span className="font-medium">{error}</span>
                </motion.div>
            )}
        </div>
    );
}
