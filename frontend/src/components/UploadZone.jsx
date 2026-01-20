import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2, Terminal, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function UploadZone({ onUploadComplete }) {
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState(null);
    const [statusMessages, setStatusMessages] = useState([]);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [statusMessages]);

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
        setStatusMessages([]);

        const formData = new FormData();
        formData.append('file', file);

        try {
            // Step 1: Upload File
            const uploadResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/upload`, {
                method: 'POST',
                body: formData,
            });

            if (!uploadResponse.ok) throw new Error('Upload failed');

            const { task_id } = await uploadResponse.json();

            // Step 2: Open WebSocket for Real-time Analysis
            const ws = new WebSocket(`${import.meta.env.VITE_API_URL.replace('https', 'wss')}/ws/analyze/${task_id}`);

            ws.onopen = () => {
                setStatusMessages(prev => [...prev, { step: 'CONNECT', message: 'Connected to VeriDoc Analysis Engine...' }]);
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.status === 'error') {
                    setError(data.message);
                    ws.close();
                    setIsUploading(false);
                } else if (data.status === 'complete') {
                    // Add a small delay so user can see the final success message
                    setTimeout(() => {
                        onUploadComplete(data.data);
                    }, 1000);
                } else {
                    // Update log
                    setStatusMessages(prev => [...prev, data]);
                }
            };

            ws.onerror = (e) => {
                setError("WebSocket connection failed");
                setIsUploading(false);
            };

            ws.onclose = () => {
                // Clean up if needed, mostly handled by complete/error
            };

        } catch (err) {
            setError(err.message);
            setIsUploading(false);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto">
            <motion.div
                layout
                className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer overflow-hidden ${isDragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'
                    }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isUploading && document.getElementById('fileInput').click()}
            >
                <input
                    id="fileInput"
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                    accept=".pdf,.jpg,.png,.jpeg"
                    disabled={isUploading}
                />

                <AnimatePresence mode='wait'>
                    {isUploading ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            key="uploading"
                            className="flex flex-col items-start w-full h-64"
                        >
                            <div className="flex items-center gap-3 w-full border-b border-slate-200 pb-4 mb-4">
                                <Loader2 className="w-5 h-5 text-brand-600 animate-spin" />
                                <span className="font-semibold text-brand-900">VeriDoc Agentic Core running...</span>
                            </div>

                            <div className="flex-1 w-full overflow-y-auto font-mono text-sm text-left space-y-2 pr-2 custom-scrollbar">
                                {statusMessages.map((msg, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex items-start gap-2"
                                    >
                                        <ArrowRight className="w-3 h-3 mt-1 flex-shrink-0 text-brand-500" />
                                        <span className={idx === statusMessages.length - 1 ? "text-slate-800 font-semibold" : "text-slate-500"}>
                                            {msg.message}
                                        </span>
                                    </motion.div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            key="idle"
                            className="flex flex-col items-center"
                        >
                            <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mb-4">
                                <Upload className="w-8 h-8 text-brand-600" />
                            </div>
                            <h3 className="text-xl font-semibold text-slate-900 mb-2">
                                Upload Document for Analysis
                            </h3>
                            <p className="text-slate-500 mb-6 max-w-sm">
                                Drag and drop your PDF or Image file here, or click to browse.
                            </p>
                            <div className="flex gap-4 text-xs text-slate-400 font-mono">
                                <span>.PDF</span>
                                <span>.JPG</span>
                                <span>.PNG</span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {error && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-3"
                >
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                </motion.div>
            )}
        </div>
    );
}
