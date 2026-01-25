import React, { useState, useEffect, useRef } from 'react';
import {
    ShieldCheck, ShieldAlert, FileSearch, Activity, Lock,
    ChevronRight, AlertCircle, GitBranch, Terminal, Layers,
    Check, X, BarChart3, Fingerprint, FileType, Search, Eye,
    ZoomIn, ZoomOut, Maximize, ScanEye, MousePointer2, AlertTriangle,
    Share2, Download, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// --- Sub-Components ---

function ScoreRing({ score, isSuspicious }) {
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const springValue = useSpring(0, { stiffness: 60, damping: 15 });
    const displayValue = useTransform(springValue, (latest) => Math.round(latest));

    useEffect(() => {
        springValue.set(score);
    }, [score, springValue]);

    const strokeDashoffset = useTransform(springValue, (latest) => {
        return circumference - (latest / 100) * circumference;
    });

    return (
        <div className="relative flex items-center justify-center w-40 h-40">
            {/* Background Circle */}
            <svg className="absolute w-full h-full transform -rotate-90">
                <circle
                    cx="80" cy="80" r={radius}
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-zinc-100 dark:text-zinc-800"
                />
                <motion.circle
                    cx="80" cy="80" r={radius}
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={circumference}
                    style={{ strokeDashoffset }}
                    strokeLinecap="round"
                    className={isSuspicious ? 'text-red-500' : 'text-emerald-500'}
                />
            </svg>
            <div className="flex flex-col items-center">
                <motion.span className={`text-4xl font-black tabular-nums ${isSuspicious ? 'text-red-600 dark:text-red-400' : 'text-zinc-800 dark:text-white'}`}>
                    {displayValue}
                </motion.span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400">Trust Score</span>
            </div>
        </div>
    );
}

function MetricCard({ title, icon: Icon, children, className = "", noPadding = false }) {
    return (
        <div className={`rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex flex-col overflow-hidden ${className}`}>
            <div className="flex items-center gap-2 px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50">
                <Icon className="w-4 h-4 text-zinc-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">{title}</span>
            </div>
            <div className={`flex-1 ${noPadding ? '' : 'p-6'}`}>
                {children}
            </div>
        </div>
    );
}

// --- Lightbox Component ---
const Lightbox = ({ isOpen, onClose, data, activeLayer, setActiveLayer }) => {
    if (!isOpen || !data) return null;

    const { currentFilename, currentDetails, boundingBoxes } = data;
    const [zoom, setZoom] = useState(1);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 sm:p-8 backdrop-blur-sm"
                onClick={onClose}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-white transition-colors z-50 border border-zinc-700"
                >
                    <X className="w-6 h-6" />
                </button>

                {/* Lightbox Zoom Controls */}
                <div className="absolute top-6 left-6 flex flex-col gap-2 z-50 bg-zinc-800/80 backdrop-blur rounded-lg p-1 border border-zinc-700">
                    <button onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(z + 0.5, 5)) }} className="p-2 hover:bg-zinc-700 rounded text-zinc-300"><ZoomIn className="w-5 h-5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); setZoom(1) }} className="p-2 hover:bg-zinc-700 rounded text-zinc-300"><RefreshCw className="w-5 h-5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(z - 0.5, 0.5)) }} className="p-2 hover:bg-zinc-700 rounded text-zinc-300"><ZoomOut className="w-5 h-5" /></button>
                </div>

                <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="flex-1 w-full flex items-center justify-center overflow-hidden">
                        <motion.div
                            drag
                            dragConstraints={{ left: -500, right: 500, top: -500, bottom: 500 }}
                            className="relative inline-block shadow-2xl"
                            animate={{ scale: zoom }}
                            transition={{ type: 'spring', damping: 20 }}
                        >
                            <img
                                src={`http://localhost:8000/static/uploads/${currentFilename}`}
                                alt="Document Fullscreen"
                                className="block max-h-[75vh] w-auto object-contain rounded-lg"
                            />
                            {/* Overlays */}
                            {activeLayer === 'heatmap' && currentDetails?.semantic_segmentation?.heatmap_image && (
                                <img src={currentDetails.semantic_segmentation.heatmap_image} className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10" />
                            )}
                            {activeLayer === 'trufor' && currentDetails?.trufor?.heatmap_path && (
                                <img src={`http://localhost:8000/static/uploads/${currentDetails.trufor.heatmap_path}`} className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-90 z-10" />
                            )}
                            {activeLayer === 'ela' && currentDetails?.ela?.ela_image_path && (
                                <img src={`http://localhost:8000/static/uploads/${currentDetails.ela.ela_image_path}`} className="absolute inset-0 w-full h-full object-contain pointer-events-none mix-blend-screen opacity-90 z-10" />
                            )}
                            {activeLayer === 'noise' && currentDetails?.noise_analysis?.noise_map_path && (
                                <img src={`http://localhost:8000/static/uploads/${currentDetails.noise_analysis.noise_map_path}`} className="absolute inset-0 w-full h-full object-contain pointer-events-none mix-blend-screen opacity-90 z-10" />
                            )}
                            {activeLayer === 'ai_analysis' && boundingBoxes.map((box, idx) => {
                                const [ymin, xmin, ymax, xmax] = box.box_2d;
                                return (
                                    <div key={idx} className="absolute border-2 border-red-500 bg-red-500/10 z-20" style={{ top: `${ymin / 10}%`, left: `${xmin / 10}%`, height: `${(ymax - ymin) / 10}%`, width: `${(xmax - xmin) / 10}%` }}></div>
                                );
                            })}
                        </motion.div>
                    </div>

                    <div className="h-24 w-full flex flex-col items-center justify-center gap-3 z-50 pointer-events-auto">
                        <div className="text-zinc-400 text-sm font-medium">
                            {activeLayer === 'original' && "Original Source"}
                            {activeLayer === 'heatmap' && "SegFormer Analysis"}
                            {activeLayer === 'trufor' && "TruFor Sensor Noise"}
                            {activeLayer === 'ela' && "Error Level Analysis"}
                            {activeLayer === 'noise' && "Noise Variance"}
                            {activeLayer === 'ai_analysis' && "Vision Intelligence"}
                        </div>
                        <div className="bg-zinc-800 p-1.5 rounded-2xl flex gap-1 shadow-xl border border-zinc-700 overflow-x-auto max-w-full">
                            {['original', 'heatmap', 'trufor', 'ela', 'noise', 'ai_analysis'].map(layer => (
                                <button
                                    key={layer}
                                    onClick={(e) => { e.stopPropagation(); setActiveLayer(layer); }}
                                    className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${activeLayer === layer ? 'bg-white text-black shadow-lg scale-105' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/10'}`}
                                >
                                    {layer === 'heatmap' ? 'SegFormer' : layer === 'ai_analysis' ? 'Vision AI' : layer.charAt(0).toUpperCase() + layer.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export function ReportDashboard({ data, onReset }) {
    if (!data) return null;

    const { report, pipeline_used, reasoning } = data;
    const aiScore = reasoning?.authenticity_score ?? 0;
    const aiIssues = reasoning?.flagged_issues || [];
    const aiDetail = reasoning?.reasoning;
    const modelName = reasoning?.model_name || "Gemini AI";

    const isSuspicious = aiScore < 70;

    // --- Visual Lab State ---
    const [activeLayer, setActiveLayer] = useState('heatmap');
    const [zoomLevel, setZoomLevel] = useState(1);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const containerRef = useRef(null);
    const [isExporting, setIsExporting] = useState(false);

    // Lightbox State
    const [showLightbox, setShowLightbox] = useState(false);

    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.5, 4));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.5, 1));
    const handleMaximize = () => setShowLightbox(true);

    // Prepare Visual Data
    let currentDetails = report.details;
    let currentFilename = data.filename;
    const embeddedImages = report.details?.analyzed_images || [];
    const hasEmbedded = embeddedImages.length > 0;

    if (hasEmbedded) {
        const selected = embeddedImages[selectedImageIndex] || embeddedImages[0];
        currentDetails = selected.visual_report.details;
        currentFilename = selected.filename;
    }

    const boundingBoxes = reasoning?.bounding_boxes || [];

    // --- Conditional Layer Logic ---
    const availableLayers = ['original'];
    if (currentDetails?.semantic_segmentation?.heatmap_image) availableLayers.push('heatmap');
    if (currentDetails?.trufor?.heatmap_path) availableLayers.push('trufor');
    if (currentDetails?.ela?.ela_image_path) availableLayers.push('ela');
    if (currentDetails?.noise_analysis?.noise_map_path) availableLayers.push('noise');
    if (boundingBoxes.length > 0) availableLayers.push('ai_analysis');

    // --- Smart Box Logic ---
    // 1. Visual Lab Condition: Checks if any visual layers OR signatures exist (we'll just use layers for visuals)
    const hasVisuals = availableLayers.length > 1 || hasEmbedded;

    // 2. Signature Condition: Checks if the signature pipeline ran (key exists)
    const hasSignatures = report.details?.signatures && report.details.signatures.length !== undefined;

    // --- Dynamic Layout Spans ---
    const verdictSpan = hasVisuals ? "col-span-12 lg:col-span-4" : "col-span-12 lg:col-span-12";
    const keyFindingsSpan = hasSignatures ? "col-span-12 lg:col-span-6" : "col-span-12 lg:col-span-12";


    // Bundle data for Lightbox
    const visualData = {
        currentFilename,
        currentDetails,
        boundingBoxes,
        modelName,
        availableLayers
    };

    // --- PDF Export Logic ---
    const handleExportPDF = async () => {
        setIsExporting(true);
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // --- Header ---
        doc.setFontSize(22);
        doc.setTextColor(isSuspicious ? 220 : 40, isSuspicious ? 50 : 40, 50);
        doc.text(isSuspicious ? "SUSPICIOUS DOCUMENT REPORT" : "VERIFIED DOCUMENT REPORT", pageWidth / 2, 20, { align: 'center' });

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 15, 10, { align: 'right' });
        doc.text(`File: ${currentFilename}`, 15, 30);
        doc.text(`Trust Score: ${aiScore}/100`, 15, 36);

        // --- Executive Summary ---
        doc.setLineWidth(0.5);
        doc.line(15, 42, pageWidth - 15, 42);

        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("Executive Summary", 15, 52);

        doc.setFontSize(10);
        const splitDetail = doc.splitTextToSize(aiDetail || "No detailed reasoning provided.", pageWidth - 30);
        doc.text(splitDetail, 15, 60);

        let cursorY = 60 + (splitDetail.length * 5);

        // --- Key Findings ---
        if (aiIssues.length > 0) {
            cursorY += 10;
            doc.setFontSize(12);
            doc.text("Risk Indicators", 15, cursorY);
            cursorY += 6;
            doc.setFontSize(10);
            doc.setTextColor(200, 50, 50);
            aiIssues.forEach(issue => {
                doc.text(`• ${issue}`, 20, cursorY);
                cursorY += 5;
            });
            doc.setTextColor(0);
        }

        // --- Digital Signatures (AutoTable) ---
        if (hasSignatures) {
            cursorY += 10;
            doc.setFontSize(12);
            doc.text("Digital Signatures", 15, cursorY);

            const sigBody = report.details.signatures.map(sig => [
                sig.signer_name || sig.field,
                sig.valid ? "Valid" : "Invalid",
                sig.trusted ? "Trusted" : "Untrusted",
                sig.issuer || "Unknown",
                sig.signing_time
            ]);

            doc.autoTable({
                head: [['Signer', 'Integrity', 'Trust', 'Issuer', 'Timestamp']],
                body: sigBody,
                startY: cursorY + 4,
                theme: 'striped',
                headStyles: { fillColor: [40, 40, 50] }
            });
            cursorY = doc.lastAutoTable.finalY + 10;
        }

        // --- Visual Evidence ---
        if (hasVisuals) {
            doc.addPage();
            doc.setFontSize(16);
            doc.text("Visual Forensic Evidence", pageWidth / 2, 20, { align: 'center' });
            cursorY = 40;

            const loadImage = (src) => new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.src = src;
                img.onload = () => resolve(img);
                img.onerror = reject;
            });

            const drawLayer = async (name, url, desc) => {
                if (cursorY > 200) { doc.addPage(); cursorY = 20; }

                doc.setFontSize(12);
                doc.text(name, 15, cursorY);

                try {
                    // Fetch image via proxy or ensure CORS is handled
                    const img = await loadImage(`http://localhost:8000/static/uploads/${url}`);
                    const ratio = img.height / img.width;
                    const targetW = 120;
                    const targetH = targetW * ratio;

                    doc.addImage(img, 'JPEG', 15, cursorY + 5, targetW, targetH);

                    doc.setFontSize(9);
                    doc.setTextColor(100);
                    const splitDesc = doc.splitTextToSize(desc, pageWidth - 150);
                    doc.text(splitDesc, 140, cursorY + 10);

                    cursorY += targetH + 20;
                } catch (e) {
                    doc.text("(Image Loading Failed - Check Server CORS)", 15, cursorY + 10);
                    console.error(e);
                    cursorY += 30;
                }
                doc.setTextColor(0);
            };

            await drawLayer("Original Document", currentFilename, "The unprocessed input file.");

            if (currentDetails?.semantic_segmentation?.heatmap_image)
                await drawLayer("Splice Detection (SegFormer)",
                    currentDetails.semantic_segmentation.heatmap_image.split('/').pop(), // Extract filename
                    "Red areas indicate regions with high probability of digital manipulation such as splicing or copy-move.");

            if (currentDetails?.trufor?.heatmap_path)
                await drawLayer("Sensor Noise Analysis (TruFor)",
                    currentDetails.trufor.heatmap_path,
                    "Highlights inconsistencies in camera sensor noise patterns. Alien content often disrupts the uniform noise field.");

            if (currentDetails?.ela?.ela_image_path)
                await drawLayer("Error Level Analysis (ELA)",
                    currentDetails.ela.ela_image_path,
                    "Visualizes compression artifacts. Bright white noise often suggests the image was recently resaved or edited.");
        }

        doc.save(`${currentFilename}_forensic_report.pdf`);
        setIsExporting(false);
    };

    // --- Share Logic ---
    const [isCopied, setIsCopied] = useState(false);

    const handleShare = async () => {
        // Generate a useful text summary for email/Slack/Teams
        const shareText = `
VeriDoc Forensic Report
-----------------------
File: ${currentFilename}
Trust Score: ${aiScore}/100 (${isSuspicious ? 'Suspicious' : 'Authentic'})
Date: ${new Date().toLocaleString()}

Risk Indicators:
${aiIssues.length > 0 ? aiIssues.map(i => `- ${i}`).join('\n') : '- No critical anomalies detected.'}

Digital Signatures:
${hasSignatures ? report.details.signatures.map(s => `- ${s.signer_name || s.field}: ${s.valid ? 'VALID' : 'INVALID'} (${s.trusted ? 'Trusted' : 'Untrusted'})`).join('\n') : '- None found.'}

Visual Analysis Layers:
- SegFormer: ${currentDetails?.semantic_segmentation?.heatmap_image ? 'Tampering Detected' : 'Clean'}
- TruFor: ${currentDetails?.trufor?.heatmap_path ? 'Anomalies Found' : 'Clean'}
`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'VeriDoc Report',
                    text: shareText,
                });
            } catch (err) {
                // User cancelled or failed
            }
        } else {
            // Desktop Fallback: Copy formatting text to clipboard
            try {
                await navigator.clipboard.writeText(shareText.trim());
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
            } catch (err) {
                console.error("Failed to copy", err);
            }
        }
    };


    // --- Metrics Restoration ---
    // 1. Histogram Data
    const histData = currentDetails?.quantization?.histogram_values?.map((val, idx) => ({ bin: idx, count: val })) || [];

    // 2. ELA & Variance Scores
    const elaScore = Math.max(0, 100 - (currentDetails?.ela?.max_difference || 0));
    const varScore = Math.max(0, 100 - ((currentDetails?.variance?.average_diff || 0) * 10));

    // 3. Flags (Merge AI + Report)
    const localFlags = new Set(report.flags || []);
    const uniqueAiIssues = aiIssues.filter(issue => !localFlags.has(issue));
    const allFlags = [...Array.from(localFlags), ...uniqueAiIssues];


    // Animation Variants
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };
    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0 }
    };

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8"
        >
            <Lightbox
                isOpen={showLightbox}
                onClose={() => setShowLightbox(false)}
                data={visualData}
                activeLayer={activeLayer}
                setActiveLayer={setActiveLayer}
            />

            <div className="grid grid-cols-12 gap-6">

                {/* --- ROW 1: Verdict & Visual Lab --- */}

                {/* 1. Verdict Card */}
                <motion.div variants={itemVariants} className={`${verdictSpan} flex flex-col gap-6`}>
                    <div className={`flex-1 rounded-3xl p-8 border shadow-lg relative overflow-hidden flex flex-col items-center justify-center text-center ${isSuspicious ? 'bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}>
                        {/* Status Badge */}
                        <div className={`absolute top-6 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${isSuspicious ? 'bg-white text-red-600 border-red-200' : 'bg-zinc-50 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 border-zinc-200 dark:border-zinc-700'}`}>
                            {isSuspicious ? "Tampering Detected" : "Integrity Verified"}
                        </div>

                        <ScoreRing score={aiScore} isSuspicious={isSuspicious} />

                        <div className="mt-6 space-y-2">
                            <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">
                                {isSuspicious ? "Document Altered" : "Authentic Document"}
                            </h2>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto">
                                Analysis by <span className="font-semibold text-zinc-700 dark:text-zinc-300 capitalize">{modelName.replace(/-/g, ' ')}</span> completed with {isSuspicious ? 'critical' : 'no'} findings.
                            </p>
                        </div>

                        {/* Quick Actions */}
                        <div className="mt-8 grid grid-cols-2 gap-3 w-full max-w-sm">
                            <button onClick={handleShare} className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors">
                                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
                                {isCopied ? 'Copied Summary!' : 'Share Report'}
                            </button>
                            <button onClick={handleExportPDF} disabled={isExporting} className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50">
                                {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                {isExporting ? 'Generating...' : 'Export PDF'}
                            </button>
                        </div>
                    </div>
                </motion.div>

                {/* 2. Visual Lab (Conditional) */}
                {hasVisuals && (
                    <motion.div variants={itemVariants} className="col-span-12 lg:col-span-8 h-[650px] rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 shadow-inner overflow-hidden flex flex-col relative group">
                        {/* Header Overlay */}
                        <div className="absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-start pointer-events-none">
                            <div className="flex flex-col gap-2 pointer-events-auto">
                                <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/20 shadow-sm flex items-center gap-2 w-fit">
                                    <ScanEye className="w-4 h-4 text-zinc-500" />
                                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">Visual Lab v2.0</span>
                                </div>
                                {/* Image Selector */}
                                {hasEmbedded && embeddedImages.length > 1 && (
                                    <div className="flex gap-1 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-1 rounded-lg border border-white/20 shadow-sm">
                                        {embeddedImages.map((img, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setSelectedImageIndex(idx)}
                                                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${selectedImageIndex === idx ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                                            >
                                                Img {idx + 1}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Zoom Controls Overlay */}
                            <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-1 rounded-lg border border-white/20 shadow-sm flex flex-col gap-1 pointer-events-auto">
                                <button onClick={handleZoomIn} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-500"><ZoomIn className="w-4 h-4" /></button>
                                <button onClick={handleMaximize} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" title="Pop-Out / Fullscreen"><Maximize className="w-4 h-4" /></button>
                                <button onClick={handleZoomOut} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-500"><ZoomOut className="w-4 h-4" /></button>
                            </div>
                        </div>

                        {/* Draggable Image Area (Flex Grow) */}
                        <div className="flex-1 w-full flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden p-6 bg-zinc-100/50 dark:bg-black/20">
                            <motion.div
                                drag={zoomLevel > 1}
                                dragConstraints={containerRef}
                                className="relative shadow-2xl inline-block"
                                animate={{ scale: zoomLevel }}
                                transition={{ type: 'spring', damping: 20 }}
                            >
                                <img
                                    src={`http://localhost:8000/static/uploads/${currentFilename}`}
                                    alt="Document"
                                    className="block max-h-[420px] w-auto object-contain pointer-events-none rounded-lg"
                                />
                                {/* Overlays */}
                                {activeLayer === 'heatmap' && currentDetails?.semantic_segmentation?.heatmap_image && (
                                    <img src={currentDetails.semantic_segmentation.heatmap_image} className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10" />
                                )}
                                {activeLayer === 'trufor' && currentDetails?.trufor?.heatmap_path && (
                                    <img src={`http://localhost:8000/static/uploads/${currentDetails.trufor.heatmap_path}`} className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-90 z-10" />
                                )}
                                {activeLayer === 'ela' && currentDetails?.ela?.ela_image_path && (
                                    <img src={`http://localhost:8000/static/uploads/${currentDetails.ela.ela_image_path}`} className="absolute inset-0 w-full h-full object-contain pointer-events-none mix-blend-screen opacity-90 z-10" />
                                )}
                                {activeLayer === 'noise' && currentDetails?.noise_analysis?.noise_map_path && (
                                    <img src={`http://localhost:8000/static/uploads/${currentDetails.noise_analysis.noise_map_path}`} className="absolute inset-0 w-full h-full object-contain pointer-events-none mix-blend-screen opacity-90 z-10" />
                                )}
                                {activeLayer === 'ai_analysis' && boundingBoxes.map((box, idx) => {
                                    const [ymin, xmin, ymax, xmax] = box.box_2d;
                                    return (
                                        <div key={idx} className="absolute border-2 border-red-500 bg-red-500/10 z-20" style={{ top: `${ymin / 10}%`, left: `${xmin / 10}%`, height: `${(ymax - ymin) / 10}%`, width: `${(xmax - xmin) / 10}%` }}></div>
                                    );
                                })}
                            </motion.div>
                        </div>

                        {/* Footer Controls (Static) */}
                        <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-3 z-30">
                            {/* Context Text */}
                            <div className="text-zinc-500 dark:text-zinc-400 text-xs font-medium text-center h-4">
                                {activeLayer === 'original' && "Original Source Document"}
                                {activeLayer === 'heatmap' && "SegFormer: Red indicates manipulated regions (Splice/Copy-Move)."}
                                {activeLayer === 'trufor' && "TruFor: Sensor Noise analysis. Violet/Red indicates alien content."}
                                {activeLayer === 'ela' && "Error Level Analysis: irregular white noise suggests resaving."}
                                {activeLayer === 'noise' && "Noise Variance: inconsistent grain patterns reveal anomalies."}
                                {activeLayer === 'ai_analysis' && `${modelName.replace(/-/g, ' ')} Vision: AI detected bounding boxes.`}
                            </div>

                            {/* Switcher */}
                            <div className="bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl flex gap-1">
                                {['original', 'heatmap', 'trufor', 'ela', 'noise', 'ai_analysis'].map(layer => (
                                    <button
                                        key={layer}
                                        onClick={() => setActiveLayer(layer)}
                                        className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeLayer === layer ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                                    >
                                        {layer === 'heatmap' ? 'SegFormer' : layer === 'ai_analysis' ? 'Vision AI' : layer.charAt(0).toUpperCase() + layer.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* --- ROW 2: Key Findings & Signatures --- */}

                {/* 3. Key Findings (Expands if Signatures Missing) */}
                <motion.div variants={itemVariants} className={`${keyFindingsSpan} h-full`}>
                    <MetricCard title="Key Findings" icon={FileSearch} className="h-full">
                        <div className="flex flex-col h-full gap-4">
                            {/* Key Findings List */}
                            <div className="flex-1">
                                {aiIssues.length > 0 ? (
                                    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                                        <ul className="space-y-2">
                                            {aiIssues.map((issue, idx) => (
                                                <li key={idx} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                                                    <span className="mt-1.5 w-1 h-1 rounded-full bg-red-500 shrink-0" />
                                                    {issue}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-24 text-zinc-400 text-sm">
                                        <Check className="w-5 h-5 mb-2 text-emerald-500" />
                                        <span>No critical anomalies flagged.</span>
                                    </div>
                                )}
                            </div>

                            {/* View Detailed Analysis Toggle */}
                            <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                <details className="group">
                                    <summary className="flex items-center gap-2 text-xs font-bold text-zinc-500 cursor-pointer hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors list-none">
                                        <Activity className="w-3 h-3" />
                                        <span>VIEW DETAILED ANALYSIS</span>
                                        <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                                    </summary>
                                    <div className="mt-3 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed border border-zinc-100 dark:border-zinc-800">
                                        {aiDetail || "Analysis logic initialized. No specific anomalies flagged by the primary reasoning engine."}
                                    </div>
                                </details>
                            </div>
                        </div>
                    </MetricCard>
                </motion.div>

                {/* 4. Signature Vault (Conditional) */}
                {hasSignatures && (
                    <motion.div variants={itemVariants} className="col-span-12 lg:col-span-6 h-full">
                        <MetricCard title="Digital Signatures" icon={Fingerprint} className="h-full" noPadding>
                            {report.details?.signatures?.length > 0 ? (
                                <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[300px] overflow-y-auto">
                                    {report.details.signatures.map((sig, idx) => (
                                        <div key={idx} className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex flex-col gap-3">
                                            {/* Top Row: Icon + Name + Status */}
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2.5 rounded-full ${sig.valid && sig.trusted ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
                                                        {sig.valid && sig.trusted ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-sm text-zinc-800 dark:text-zinc-100">{sig.signer_name || sig.field}</div>
                                                        <div className="text-xs text-zinc-500 font-mono">{sig.fingerprint || sig.field}</div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1.5">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${sig.valid ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                                        {sig.valid ? "Valid" : "Invalid"}
                                                    </span>
                                                    <span className="text-[10px] text-zinc-400">{sig.signing_time?.split('.')[0]}</span>
                                                </div>
                                            </div>

                                            {/* Middle Row: Technical Details Grid */}
                                            <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-50 dark:bg-black/20 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                                <div className="flex flex-col">
                                                    <span className="text-zinc-400 uppercase text-[9px] font-bold">Integrity</span>
                                                    <span className={`font-semibold ${sig.intact ? 'text-zinc-700 dark:text-zinc-300' : 'text-red-600'}`}>
                                                        {sig.intact ? "Document Unmodified" : "Tampered"}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-zinc-400 uppercase text-[9px] font-bold">Trust Chain</span>
                                                    <span className={`font-semibold ${sig.trusted ? 'text-emerald-600' : 'text-orange-500'}`}>
                                                        {sig.trusted ? "Root Trusted" : "Self-Signed / Unknown"}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-zinc-400 uppercase text-[9px] font-bold">Algorithm</span>
                                                    <span className="text-zinc-600 dark:text-zinc-400 font-mono">{sig.md_algorithm?.toUpperCase() || "SHA256"}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-zinc-400 uppercase text-[9px] font-bold">Issuer</span>
                                                    <span className="text-zinc-600 dark:text-zinc-400 truncate" title={sig.issuer}>{sig.issuer || "Unknown CA"}</span>
                                                </div>
                                            </div>

                                            {/* Coverage Badge */}
                                            {sig.coverage && (
                                                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                                                    <Layers className="w-3 h-3" />
                                                    <span>Scope: {sig.coverage}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full p-12 text-zinc-400">
                                    <Lock className="w-8 h-8 mb-2 opacity-50" />
                                    <span className="text-sm">No Digital Signatures Found</span>
                                </div>
                            )}
                        </MetricCard>
                    </motion.div>
                )}

                {/* --- ROW 3: Signal Data & Manifest --- */}

                {/* 5. Signal Analysis (Span 6) */}
                <motion.div variants={itemVariants} className="col-span-12 lg:col-span-6 h-full">
                    <MetricCard title="Signal Analysis" icon={BarChart3} className="h-full">
                        <div className="space-y-6">
                            {/* ELA & Variance Bars */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                        <span>Compression (ELA)</span>
                                        <span>{Math.round(elaScore)}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${elaScore > 70 ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{ width: `${elaScore}%` }} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                        <span>Noise Variance</span>
                                        <span>{varScore.toFixed(0)}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${varScore > 70 ? 'bg-indigo-500' : 'bg-orange-500'}`} style={{ width: `${varScore}%` }} />
                                    </div>
                                </div>
                            </div>

                            {/* Histograms */}
                            {histData.length > 0 && (
                                <div className="h-32 w-full mt-4 bg-zinc-50 dark:bg-black/20 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800/50 p-2 relative">
                                    <span className="absolute top-2 left-2 text-[10px] text-zinc-400 uppercase tracking-widest">Discrete Cosine Transform</span>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={histData}>
                                            <Bar dataKey="count" fill="#71717a" radius={[2, 2, 0, 0]} opacity={0.6} />
                                            <RechartsTooltip cursor={{ opacity: 0.1 }} contentStyle={{ borderRadius: '8px', border: 'none', background: '#333', color: '#fff', fontSize: '10px' }} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </MetricCard>
                </motion.div>

                {/* 6. Technical Manifest (Span 6) */}
                <motion.div variants={itemVariants} className="col-span-12 lg:col-span-6 h-full">
                    <MetricCard title="Technical Manifest" icon={FileType} className="h-full">
                        <div className="flex flex-col gap-4">
                            {/* File Specs Grid */}
                            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                                <div>
                                    <div className="text-[10px] text-zinc-400 uppercase">MIME Type</div>
                                    <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">application/pdf</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-zinc-400 uppercase">Size</div>
                                    <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">2.4 MB</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-zinc-400 uppercase">Markers</div>
                                    <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{report.details?.eof_count || 1} EOF</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-zinc-400 uppercase">Metadata</div>
                                    <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{report.details?.metadata ? 'Extracted' : 'Missing'}</div>
                                </div>
                            </div>

                            {/* Anomaly Tags */}
                            <div>
                                <div className="text-[10px] text-zinc-400 uppercase mb-2">Forensic Flags</div>
                                <div className="flex flex-wrap gap-2">
                                    {allFlags.length > 0 ? allFlags.map((flag, i) => (
                                        <span key={i} className="px-2.5 py-1 rounded-md text-xs font-medium border bg-red-50 border-red-100 text-red-700 dark:bg-red-900/20 dark:border-red-900 dark:text-red-400">
                                            {flag}
                                        </span>
                                    )) : (
                                        <span className="px-2.5 py-1 rounded-md text-xs font-medium border bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-900 dark:text-emerald-400">
                                            No Explicit Anomalies
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </MetricCard>
                </motion.div>


                {/* --- Footer Action --- */}
                <motion.div variants={itemVariants} className="col-span-12 flex justify-center py-12">
                    <button
                        onClick={onReset}
                        className="group flex items-center gap-3 px-8 py-4 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-full font-bold shadow-xl hover:scale-105 hover:shadow-2xl transition-all"
                    >
                        <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                        <span>Analyze Another Document</span>
                    </button>
                </motion.div>

            </div>
        </motion.div>
    );
}
