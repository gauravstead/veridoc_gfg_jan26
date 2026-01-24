import React, { useState } from 'react';
import {
    ShieldCheck, ShieldAlert, FileSearch, Activity, Lock,
    ChevronRight, AlertCircle, GitBranch, Terminal, Layers,
    Check, X, BarChart3, Fingerprint, FileType, Search, Eye
} from 'lucide-react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';

export function ReportDashboard({ data, onReset }) {
    if (!data) return null;

    const { report, pipeline_used, reasoning } = data;

    // Use AI Reasoner output if available for the high-level verdict
    // Default to hybrid score if available, else original AI score
    const aiScore = reasoning?.authenticity_score ?? 0;
    const aiIssues = reasoning?.flagged_issues || [];
    const aiSummary = reasoning?.summary;
    const aiDetail = reasoning?.reasoning;
    const modelName = reasoning?.model_name || "Gemini AI"; // Dynamic Model Name

    const [showFullReasoning, setShowFullReasoning] = useState(false);
    const [activeLayer, setActiveLayer] = useState('heatmap'); // 'original', 'heatmap', 'ela', 'noise', 'ai_analysis'

    // Determine what text to show primarily
    let primaryText = "No details provided.";
    if (reasoning?.error) {
        primaryText = `Analysis Error: ${reasoning.error}`;
    } else if (aiSummary) {
        primaryText = aiSummary;
    } else if (aiDetail) {
        primaryText = aiDetail;
    }

    // Determine status based on AI Score
    const isSuspicious = aiScore < 70;
    const displayScore = aiScore;

    // Merge flags from local pipeline and AI
    // Merge flags from local pipeline and AI
    // Deduplicate: If an AI flag is very similar to a local flag, ignore the AI one (since local source is primary)
    const localFlags = new Set(report.flags || []);
    const uniqueAiIssues = aiIssues.filter(issue => {
        // Simple fuzzy match check: cancel if issue contains "SegFormer" and we already have a SegFormer flag
        if (issue.includes("SegFormer") && Array.from(localFlags).some(f => f.includes("SegFormer"))) return false;
        if (issue.includes("ELA") && Array.from(localFlags).some(f => f.includes("ELA"))) return false;
        return !localFlags.has(issue);
    });

    const allFlags = [
        ...Array.from(localFlags),
        ...uniqueAiIssues
    ];

    // Parse Bounding Boxes
    const boundingBoxes = reasoning?.bounding_boxes || [];

    // Copy the getMethods helper here to ensure it's in scope if not already
    const getMethods = (pipeline) => {
        const p = pipeline?.toLowerCase() || '';
        if (p.includes('structural')) {
            return [
                { name: 'Incremental Updates', desc: 'Scans for multiple EOF markers' },
                { name: 'Metadata Analysis', desc: 'Checks Producer/Creator consistency' },
                { name: 'Syntax Parsing', desc: 'Validates internal PDF structure' }
            ];
        } else if (p.includes('visual')) {
            return [
                { name: 'Error Level Analysis', desc: 'Detects compression anomalies' },
                { name: 'Quantization Check', desc: 'Analyzes DCT coefficient histograms' },
                { name: 'Variance Stats', desc: 'Measures pixel intensity deviation' }
            ];
        }
        return [];
    };

    const methods = getMethods(pipeline_used);

    // --- Visualization Helpers ---

    const renderVisualMetrics = (details) => {
        // Normalize ELA difference (0-255) to a score (0-100 where 100 is best/lowest diff)
        const elaScore = Math.max(0, 100 - (details.ela?.max_difference || 0));
        const varScore = Math.max(0, 100 - ((details.variance?.average_diff || 0) * 10));

        // Prepare Histogram Data
        const histData = details.quantization?.histogram_values?.map((val, idx) => ({
            bin: idx,
            count: val
        })) || [];

        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-slate-700">Compression Consistency</span>
                            <span className="text-xs font-mono text-slate-500">{Math.round(elaScore)}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${elaScore}%` }}
                                className={`h-2 rounded-full ${elaScore > 70 ? 'bg-emerald-500' : 'bg-orange-500'}`}
                            />
                        </div>
                        <p className="text-xs text-slate-400 mt-2">Error Level Analysis (ELA) score</p>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-slate-700">Image Variance</span>
                            <span className="text-xs font-mono text-slate-500">
                                {details.variance?.average_diff ? details.variance.average_diff.toFixed(2) : '0.00'}
                            </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${varScore}%` }}
                                className={`h-2 rounded-full ${varScore > 70 ? 'bg-indigo-500' : 'bg-orange-500'}`}
                            />
                        </div>
                        <p className="text-xs text-slate-400 mt-2">Noise layout distribution</p>
                    </div>
                </div>

                {/* Histogram Chart */}
                {histData.length > 0 && (
                    <div className="bg-white p-4 rounded-lg border border-slate-200 h-64">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Pixel Value Distribution (Quantization Analysis)</h4>
                        <p className="text-xs text-slate-400 mb-2"> periodic gaps (combing) suggest double compression/editing.</p>
                        <ResponsiveContainer width="100%" height="80%">
                            <BarChart data={histData}>
                                <XAxis dataKey="bin" hide />
                                <YAxis hide />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
                                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                />
                                <Bar dataKey="count" fill="#6366f1" radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        );
    };

    const renderStructuralMetrics = (details) => {
        const hasMetadata = details.metadata && Object.keys(details.metadata).length > 0;
        const eofCount = details.eof_count || 1;

        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex flex-col items-center text-center">
                    <Fingerprint className="w-8 h-8 text-indigo-500 mb-2" />
                    <span className="text-sm font-semibold text-slate-700">Metadata</span>
                    <span className={`text-xs px-2 py-1 rounded-full mt-1 ${hasMetadata ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {hasMetadata ? "Present" : "Missing"}
                    </span>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex flex-col items-center text-center">
                    <FileType className="w-8 h-8 text-indigo-500 mb-2" />
                    <span className="text-sm font-semibold text-slate-700">Structure</span>
                    <span className={`text-xs px-2 py-1 rounded-full mt-1 ${eofCount === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                        {eofCount === 1 ? "Standard EOF" : `${eofCount} EOF Markers`}
                    </span>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex flex-col items-center text-center">
                    <Search className="w-8 h-8 text-indigo-500 mb-2" />
                    <span className="text-sm font-semibold text-slate-700">Content</span>
                    <span className="text-xs text-slate-500 mt-1">Parsable</span>
                </div>
            </div>
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-7xl mx-auto"
        >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Main Content Area */}
                <div className="lg:col-span-8 space-y-6">



                    {/* Header Card */}
                    <div className={`relative rounded-xl shadow-lg border p-8 overflow-hidden ${isSuspicious ? 'bg-red-50 border-red-100' : 'bg-white border-slate-200'}`}>
                        {/* Background Decoration */}
                        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-gradient-to-br from-transparent to-current opacity-5 rounded-full pointer-events-none text-brand-500" />

                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                            <div className="flex items-center gap-5">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className={`p-4 rounded-full shadow-md ${isSuspicious ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}
                                >
                                    {isSuspicious ? <ShieldAlert className="w-10 h-10" /> : <ShieldCheck className="w-10 h-10" />}
                                </motion.div>
                                <div>
                                    <h2 className={`text-3xl font-bold tracking-tight ${isSuspicious ? 'text-red-900' : 'text-slate-900'}`}>
                                        {isSuspicious ? "Tampering Detected" : "Verified Authentic"}
                                    </h2>
                                    <div className="flex items-center gap-2 text-sm font-medium mt-1">
                                        <div className={`w-2 h-2 rounded-full ${isSuspicious ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                        <span className="text-slate-500 capitalize">{modelName.replace(/-/g, ' ')} Forensic Verdict</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                <div className="text-right">
                                    <div className={`text-5xl font-black tabular-nums tracking-tight ${isSuspicious ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {displayScore}
                                    </div>
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">Trust Score</div>

                                    {/* Score Breakdown Tooltip/Mini-display */}
                                    {reasoning?.score_breakdown && (
                                        <div className="mt-2 text-[10px] text-slate-500 text-right opacity-80">
                                            {Object.entries(reasoning.score_breakdown).map(([key, val]) => (
                                                <div key={key}>{key}: <span className="font-mono font-semibold">{val}</span></div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Verified Seal Animation */}
                                {!isSuspicious && (
                                    <motion.div
                                        initial={{ opacity: 0, rotate: -20 }}
                                        animate={{ opacity: 1, rotate: 0 }}
                                        transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                                        className="hidden md:flex flex-col items-center justify-center w-20 h-20 rounded-full border-4 border-emerald-100 text-emerald-600 bg-emerald-50"
                                    >
                                        <Check className="w-8 h-8 stroke-[3]" />
                                        <span className="text-[0.6rem] font-bold uppercase tracking-widest mt-1">Safe</span>
                                    </motion.div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* AI Reasoning Section */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden group hover:shadow-md transition-shadow">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Activity className="w-5 h-5 text-indigo-600" />
                                <h3 className="font-semibold text-slate-800">Agentic Reasoning Details</h3>
                            </div>
                        </div>
                        <div className="p-6">
                            <div className="prose prose-slate max-w-none">
                                <p className="leading-relaxed text-slate-700 text-lg">{primaryText}</p>
                            </div>

                            {/* Toggle Details */}
                            {aiSummary && aiDetail && (
                                <div className="mt-6 pt-4 border-t border-slate-100">
                                    <button
                                        onClick={() => setShowFullReasoning(!showFullReasoning)}
                                        className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-2 group-hover:underline"
                                    >
                                        {showFullReasoning ? "Hide Technical Analysis" : "Inspect Full Logic"}
                                        <ChevronRight className={`w-4 h-4 transition-transform ${showFullReasoning ? 'rotate-90' : ''}`} />
                                    </button>

                                    {showFullReasoning && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            className="mt-4 p-5 bg-slate-900 rounded-xl text-sm text-slate-300 font-mono whitespace-pre-line shadow-inner"
                                        >
                                            {aiDetail}
                                        </motion.div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Technical Observations (Flags) - Moved Here */}
                    {allFlags.length > 0 && (
                        <div className={`rounded-xl border overflow-hidden ${isSuspicious ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="px-6 py-4 flex items-center gap-2">
                                <AlertCircle className={`w-5 h-5 ${isSuspicious ? 'text-red-600' : 'text-slate-500'}`} />
                                <h3 className={`font-semibold ${isSuspicious ? 'text-red-900' : 'text-slate-700'}`}>
                                    {isSuspicious ? "Critical Anomalies Detected" : "Technical Observations"}
                                </h3>
                            </div>

                            {!isSuspicious && (
                                <div className="px-6 py-2 bg-slate-100/50 text-xs text-slate-500 border-t border-b border-slate-200/50">
                                    Non-critical findings typically found in benign documents.
                                </div>
                            )}

                            <div className="p-2">
                                {allFlags.map((flag, idx) => (
                                    <div key={idx} className={`mx-2 my-1 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-3 ${isSuspicious ? 'bg-white text-red-800 shadow-sm' : 'bg-white text-slate-600 border border-slate-100'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${isSuspicious ? 'bg-red-500' : 'bg-indigo-400'}`} />
                                        {flag}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* NEW: Visual Evidence Layer (Heatmap/ELA) - ONLY FOR VISUAL PIPELINE */}
                    {pipeline_used === 'visual' && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
                                <div className="flex items-center gap-2">
                                    <Eye className="w-5 h-5 text-brand-400" />
                                    <h3 className="font-semibold">Visual Forensics Lab</h3>
                                </div>
                                {/* Layer Switcher */}
                                <div className="flex bg-slate-800 rounded-lg p-1 gap-1 flex-wrap">
                                    {['original', 'heatmap', 'ela', 'noise', 'ai_analysis'].map(layer => {
                                        let label = 'Original';
                                        if (layer === 'heatmap') label = 'SegFormer Forgery Map'; // Renamed
                                        if (layer === 'ela') label = 'ELA Mode';
                                        if (layer === 'noise') label = 'Noise Map';
                                        if (layer === 'ai_analysis') label = modelName.replace(/-/g, ' '); // Dynamic Label

                                        return (
                                            <button
                                                key={layer}
                                                onClick={() => setActiveLayer(layer)}
                                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${activeLayer === layer ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="p-6 bg-slate-50 flex flex-col items-center">
                                <div className="w-full mb-4">
                                    {activeLayer === 'heatmap' && (
                                        <p className="text-slate-600 text-sm">
                                            <span className="inline-block w-3 h-3 bg-red-500 rounded-full mx-1"></span> <span className="font-semibold text-slate-800">SegFormer Analysis</span>: Red areas indicate high probability of digital tampering (Splice/Copy-Move).
                                        </p>
                                    )}
                                    {activeLayer === 'ela' && (
                                        <p className="text-slate-600 text-sm">
                                            Highlights compression artifacts. White noise should be uniform. Bright clusters indicate resaved regions.
                                        </p>
                                    )}
                                    {activeLayer === 'noise' && (
                                        <p className="text-slate-600 text-sm">
                                            <span className="font-semibold text-orange-600">High Frequency Noise Map</span>: Analyzes local variance. Inconsistencies in grain/noise often reveal spliced content.
                                        </p>
                                    )}
                                    {activeLayer === 'ai_analysis' && (
                                        <p className="text-slate-600 text-sm">
                                            <span className="font-semibold text-indigo-600 capitalize">{modelName.replace(/-/g, ' ')} Vision</span>: AI-detected anomalies. Red boxes indicate specific regions flagged by the model.
                                        </p>
                                    )}
                                </div>

                                <div className="relative rounded-lg overflow-hidden border border-slate-300 shadow-xl max-w-full inline-block">
                                    {/* Base Image */}
                                    <img
                                        src={`http://localhost:8000/static/uploads/${data.filename}`}
                                        alt="Document"
                                        className="block w-auto h-auto object-contain"
                                        style={{ maxHeight: '600px', maxWidth: '100%' }}
                                    />

                                    {/* Layers */}
                                    {activeLayer === 'heatmap' && report.details?.semantic_segmentation?.heatmap_image && (
                                        <img
                                            src={report.details.semantic_segmentation.heatmap_image}
                                            alt="Forgery Heatmap"
                                            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                                            style={{ zIndex: 10 }}
                                        />
                                    )}

                                    {activeLayer === 'ela' && report.details?.ela?.ela_image_path && (
                                        <img
                                            src={`http://localhost:8000/static/uploads/${report.details.ela.ela_image_path}`}
                                            alt="ELA Analysis"
                                            className="absolute inset-0 w-full h-full object-contain pointer-events-none mix-blend-screen opacity-90"
                                            style={{ zIndex: 10 }}
                                        />
                                    )}

                                    {activeLayer === 'noise' && report.details?.noise_analysis?.noise_map_path && (
                                        <img
                                            src={`http://localhost:8000/static/uploads/${report.details.noise_analysis.noise_map_path}`}
                                            alt="Noise Analysis"
                                            className="absolute inset-0 w-full h-full object-contain pointer-events-none mix-blend-screen opacity-90"
                                            style={{ zIndex: 10 }}
                                        />
                                    )}

                                    {/* Bounding Boxes (AI) - ONLY Show in AI Analysis Layer */}
                                    {activeLayer === 'ai_analysis' && boundingBoxes.map((box, idx) => {
                                        // box.box_2d is [ymin, xmin, ymax, xmax] normalized 0-1000
                                        const [ymin, xmin, ymax, xmax] = box.box_2d;
                                        return (
                                            <div
                                                key={idx}
                                                className="absolute border-2 border-red-500 bg-red-500/10 z-20 group"
                                                style={{
                                                    top: `${ymin / 10}%`,
                                                    left: `${xmin / 10}%`,
                                                    height: `${(ymax - ymin) / 10}%`,
                                                    width: `${(xmax - xmin) / 10}%`
                                                }}
                                            >
                                                {/* Tooltip on hover */}
                                                <div className="hidden group-hover:block absolute -top-8 left-0 bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-30">
                                                    {box.label || "Anomaly"}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Visual Data Section (Replaces Raw JSON) */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-slate-500" />
                            <h3 className="font-semibold text-slate-800">ForensicMetrics Breakdown</h3>
                        </div>
                        <div className="p-6">
                            {pipeline_used === 'visual' ? renderVisualMetrics(report.details) : renderStructuralMetrics(report.details)}
                        </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                        <button
                            onClick={onReset}
                            className="px-8 py-3 bg-slate-900 text-white rounded-xl shadow-lg hover:bg-slate-800 hover:shadow-xl hover:-translate-y-0.5 transition-all font-semibold flex items-center gap-2"
                        >
                            <FileSearch className="w-4 h-4" />
                            Scan Another Document
                        </button>
                    </div>
                </div>

                {/* Streamlined Sidebar */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-6">
                        <h3 className="font-semibold text-slate-900 mb-6 flex items-center gap-2">
                            <Layers className="w-5 h-5 text-indigo-600" />
                            Analysis Vector
                        </h3>

                        <div className="space-y-6 relative">
                            {/* Connector Line */}
                            <div className="absolute left-[15px] top-8 bottom-8 w-0.5 bg-slate-100" />

                            <div className="flex gap-4 relative">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 z-10 border-4 border-white">
                                    <GitBranch className="w-4 h-4 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pipeline</p>
                                    <p className="font-semibold text-slate-800 capitalize">{pipeline_used || 'Standard'} Mode</p>
                                </div>
                            </div>

                            <div className="flex gap-4 relative">
                                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 z-10 border-4 border-white">
                                    <Activity className="w-4 h-4 text-emerald-600" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Engine</p>
                                    <p className="font-semibold text-slate-800 capitalize">{modelName.replace(/-/g, ' ')}</p>
                                </div>
                            </div>

                            <div className="flex gap-4 relative">
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 z-10 border-4 border-white">
                                    <Lock className="w-4 h-4 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Storage</p>
                                    <p className="font-semibold text-slate-800">Google Cloud Secure</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                            <p className="text-xs text-slate-400">VeriDoc Integrity System v2.0</p>
                        </div>
                    </div>
                </div>

            </div>
        </motion.div>
    );
}
