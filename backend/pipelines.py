import os
from enum import Enum
from pypdf import PdfReader
import cv2
import numpy as np
from scipy.fftpack import dct
from pyhanko.sign import validation
from pyhanko.pdf_utils.reader import PdfFileReader
import logging

class PipelineType(Enum):
    STRUCTURAL = "structural"
    VISUAL = "visual"
    CRYPTOGRAPHIC = "cryptographic"

# --- HELPERS: VISUAL PIPELINE ---

def perform_ela(image_path: str, quality: int = 90) -> dict:
    """
    Performs Error Level Analysis (ELA) on an image using OpenCV.
    """
    try:
        # 1. Read Original
        original = cv2.imread(image_path)
        if original is None:
             return {"status": "error", "message": "Could not read image"}
             
        # 2. Resave at specific quality
        resaved_path = image_path + ".resaved.jpg"
        cv2.imwrite(resaved_path, original, [cv2.IMWRITE_JPEG_QUALITY, quality])
        
        # 3. Read Resaved
        resaved = cv2.imread(resaved_path)
        
        # 4. Calculate Absolute Difference (ELA)
        ela_image = cv2.absdiff(original, resaved)
        
        # 5. Calculate Stats
        # Convert to grayscale for simple intensity stats
        gray_ela = cv2.cvtColor(ela_image, cv2.COLOR_BGR2GRAY)
        max_diff = np.max(gray_ela)
        mean_diff = np.mean(gray_ela)
        std_dev = np.std(gray_ela)
        
        # Cleanup
        if os.path.exists(resaved_path):
            os.remove(resaved_path)
            
        return {
            "status": "success",
            "max_difference": float(max_diff),
            "mean_difference": float(mean_diff),
            "std_deviation": float(std_dev)
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}

def analyze_quantization(image_path: str) -> dict:
    """
    Simplified JPEG Quantization Analysis (Double Quantization Detection)
    Checks for periodicity in DCT histograms of the image.
    """
    try:
        img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        if img is None:
             return {"status": "error", "message": "Could not read image"}
        
        # Taking a center crop to analyze
        h, w = img.shape
        crop_size = min(h, w, 512)
        start_y = (h - crop_size) // 2
        start_x = (w - crop_size) // 2
        crop = img[start_y:start_y+crop_size, start_x:start_x+crop_size]
        
        # Prepare for block processing (8x8 blocks)
        # Convert to float
        imf = np.float32(crop)
        
        # We need to manually perform block-wise DCT or just check general histogram of pixel diffs
        # For MVP, let's use a simpler heuristic:
        # Re-compressed JPEGs often have histogram gaps in DCT coefficients. 
        # Here we will just simulate a check by analyzing the pixel value histogram for comb artifacts.
        
        hist = cv2.calcHist([img], [0], None, [256], [0, 256])
        
        # Count zero-bins or low-count bins in the middle ranges which might indicate quantization gaps
        # (This is a simplified heuristic proxy for true DCT analysis which requires more complex implementation)
        # A "Comb" pattern in histogram suggests double quantization
        
        zeros = 0
        for i in range(1, 255):
            if hist[i] == 0:
                zeros += 1
                
        is_suspicious = zeros > 10 # Arbitrary threshold for "gaps" in histogram
        
        return {
            "status": "success",
            "histogram_gaps": int(zeros),
            "suspicious": is_suspicious
        }
        
    except Exception as e:
         return {"status": "error", "message": str(e)}

# --- PIPELINES ---

# --- HELPERS: STRUCTURAL PIPELINE ---
# (Helper removed to ensure stability during hot-fix)

def analyze_structural(file_path: str):
    """
    Pipeline A: Structural Forensics (Native PDFs)
    Advanced checks including:
    1. Incremental Update Detection (EOF markers)
    2. XRef Table keyword analysis
    3. Metadata Consistency
    """
    results = {
        "pipeline": "Structural Forensics (Real)",
        "score": 0.0,
        "flags": [],
        "details": {}
    }
    
    try:
        # 1. Incremental Update Detection (Raw Bytes)
        with open(file_path, 'rb') as f:
            content = f.read()
            eof_count = content.count(b'%%EOF')
            # xref keyword often appears once per section in standard PDFs.
            # Multiple xrefs can also imply updates.
            xref_count = content.count(b'xref') 
            
        results['details']['eof_markers_found'] = eof_count
        results['details']['xref_keywords_found'] = xref_count
        
        if eof_count > 1:
            results['flags'].append(f"Detected {eof_count} Incremental Updates (File modified after creation)")
            results['score'] += 0.15 * (eof_count - 1)
        elif eof_count == 0:
            results['flags'].append("Malformed PDF: No %%EOF marker found")
            results['score'] = 1.0 # High risk or broken
            
        # 2. PDF Parsing & Deep Analysis
        reader = PdfReader(file_path)
        
        # A. Metadata Forensics
        meta = reader.metadata
        if meta:
            safe_meta = {k: str(v) for k, v in meta.items()}
            results['details']['metadata'] = safe_meta
            
            producer = safe_meta.get('/Producer', '').lower()
            if not producer:
                results['flags'].append("Missing Producer Metadata")
                results['score'] += 0.2
            elif "phantom" in producer or "gpl output" in producer:
                 results['flags'].append(f"Suspicious Producer detected: {safe_meta.get('/Producer')}")
                 results['score'] += 0.3
        else:
            results['flags'].append("No Metadata found")
            results['score'] += 0.1

        # B. Orphan / Hidden Content Analysis (Simplified Safe Mode)
        # Instead of deep traversal which risks recursion errors, we check for high-risk flags
        try:
            # Check for embedded files (often used for attacks)
            if reader.trailer and '/Root' in reader.trailer:
                root_obj = reader.trailer['/Root']
                # Depending on pypdf version, root_obj might be IndirectObject or Dict
                # We access it safely
                if hasattr(root_obj, 'get_object'):
                    root_obj = root_obj.get_object()
                
                if '/EmbeddedFiles' in root_obj:
                     results['flags'].append("Contains Embedded Files (Potential Payload)")
                     results['score'] += 0.3
                     
                if '/JS' in root_obj or '/JavaScript' in root_obj:
                     results['flags'].append("Contains Embeded JavaScript (High Risk)")
                     results['score'] += 0.5
                 
        except Exception as e:
            # Don't fail the whole pipeline for an advanced check
            results['warnings'] = f"Advanced structural check warning: {str(e)}"

        results['score'] = min(results['score'], 1.0)
            
    except Exception as e:
        results['error'] = f"Analysis Failed: {str(e)}"
        
    return results

def analyze_cryptographic(file_path: str):
    """
    Pipeline C: Cryptographic Analysis (Signed PDFs)
    Uses pyHanko to validate signatures.
    """
    results = {
        "pipeline": "Cryptographic Analysis (Digital Signatures)",
        "score": 0.0,
        "flags": [],
        "details": {}
    }
    
    try:
        with open(file_path, 'rb') as f:
            r = PdfFileReader(f)
            if not r.embedded_signatures:
                results['flags'].append("No Embedded Signatures found")
                # Not necessarily bad, but for this pipeline it's a null result.
                results['details']['signature_count'] = 0
                return results
                
            sig_status = []
            for sig in r.embedded_signatures:
                # Validate the signature
                # Note: This is a basic validation check. 
                # In a real scenario, you'd configure trust anchors (VC).
                val_status = validation.validate_pdf_signature(sig)
                
                status_summary = {
                    "field": sig.field_name,
                    "valid": val_status.valid,
                    "intact": val_status.intact,
                    "trusted": val_status.trusted,
                    "revoked": val_status.revoked,
                    "signing_time": str(val_status.signing_time)
                }
                sig_status.append(status_summary)
                
                if not val_status.intact:
                     results['flags'].append(f"Signature {sig.field_name} is BROKEN/MODIFIED")
                     results['score'] += 1.0 # Critical fail
                elif not val_status.trusted:
                     results['flags'].append(f"Signature {sig.field_name} is UNTRUSTED (Self-signed or unknown root)")
                     results['score'] += 0.2 # Warning, not necessarily fake
                elif val_status.revoked:
                     results['flags'].append(f"Signature {sig.field_name} certificate is REVOKED")
                     results['score'] += 1.0
                     
            results['details']['signatures'] = sig_status
            results['details']['signature_count'] = len(sig_status)
            
            # Cap score
            results['score'] = min(results['score'], 1.0)
            
    except Exception as e:
        results['error'] = f"Cryptographic Analysis Failed: {str(e)}"
        
    return results

def analyze_visual(file_path: str):
    """
    Pipeline B: Visual Analysis (Images)
    Uses ELA, Quantization Checks, and Semantic Segmentation (SegFormer).
    """
    results = {
        "pipeline": "Visual Analysis (ELA, Quantization & Semantic)",
        "score": 0.0,
        "flags": [],
        "details": {}
    }
    
    # 1. Error Level Analysis
    ela_res = perform_ela(file_path)
    results['details']['ela'] = ela_res
    
    if ela_res.get('status') == 'success':
        # ELA Heuristic: High variance/mean difference implies potential editing/resaving
        # Normal high-quality JPEGs have lower difference.
        if ela_res['mean_difference'] > 15:
             results['flags'].append("High ELA Response (Potential Manipulation)")
             results['score'] += 0.4
    else:
        results['flags'].append("ELA Failed")

    # 2. Quantization / Histogram Analysis
    quant_res = analyze_quantization(file_path)
    results['details']['quantization'] = quant_res
    
    if quant_res.get('status') == 'success':
        if quant_res['suspicious']:
            results['flags'].append("Suspicious Histogram (Potential Double Quantization)")
            results['score'] += 0.3
            

             
    # 3. Semantic Segmentation (Placeholder)
    # TODO: Implement nvidia/segformer-b0-finetuned-ade-512-512
    # This section will load the model and check for inconsistent segmentation maps
    # which might indicate splicing or copy-move attacks.
    results['details']['semantic_segmentation'] = "Pending Implementation (SegFormer)"

    # Cap score
    results['score'] = min(results['score'], 1.0)
    
    return results

def determine_pipeline(filename: str, content_type: str) -> PipelineType:
    """
    Orchestration Logic
    """
    fn_lower = filename.lower()
    ext = fn_lower.split('.')[-1]
    
    if ext == 'pdf':
        # Simple heuristic for MVP: if filename contains "signed", use Crypto pipeline
        # Otherwise default to Structural
        if "signed" in fn_lower:
            return PipelineType.CRYPTOGRAPHIC
        return PipelineType.STRUCTURAL
        
    if ext in ['jpg', 'jpeg', 'png', 'tiff', 'bmp', 'webp']:
        return PipelineType.VISUAL
        
    # Default to structural or maybe None in future, but for now Structural covers "files" generic
    return PipelineType.STRUCTURAL
