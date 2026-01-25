import vertexai
from datetime import datetime

from vertexai.generative_models import GenerativeModel, Part
import json
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize Vertex AI (Do this once in your app startup)
# You should set these environment variables or replace the strings below
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", os.getenv("PROJECT_ID", "your-project-id"))
REGION = os.getenv("REGION", "asia-south1")

# Check if we can initialize immediately, otherwise wait for main to do it or env vars
try:
    vertexai.init(project=PROJECT_ID, location=REGION)
except Exception as e:
    print(f"Warning: vertexai.init failed (likely due to placeholder PROJECT_ID): {e}")

def run_semantic_reasoning(gcs_uri, mime_type="application/pdf", local_report=None):
    """
    Sends a file from GCS directly to Gemini 1.5 Pro for forensic analysis.
    
    Args:
        gcs_uri: The path to the file (e.g., "gs://veridoc-bucket/uploads/file.pdf")
        mime_type: "application/pdf" or "image/jpeg"
        local_report: (Optional) Dictionary containing local analysis findings (ELA, SegFormer, etc.)
    """
    
    try:
        # 1. Load the Model
        # (Model initialized later with system instructions) 

        # 2. Reference the file in the Bucket (Zero download latency!)
        document_part = Part.from_uri(
            uri=gcs_uri,
            mime_type=mime_type
        )
        
        # Prepare Context String from Local Report
        local_context = "No prior local analysis available."
        if local_report:
            # SANITIZATION: Remove heavy Base64 strings to prevent Token Limit Error
            def sanitize_data(data):
                if isinstance(data, dict):
                    return {k: sanitize_data(v) for k, v in data.items() if k not in ['heatmap_image', 'ela_image', 'noise_map']}
                elif isinstance(data, list):
                    # Truncate long lists (e.g., histogram values)
                    if len(data) > 50 and all(isinstance(x, (int, float)) for x in data):
                        return data[:10] + [f"... {len(data)-10} more items ..."]
                    return [sanitize_data(item) for item in data]
                elif isinstance(data, str):
                    # Safety check: if a string looks like a base64 image (starts with data:image), drop it
                    if len(data) > 1000 and "data:image" in data[:50]:
                        return "<Base64 Image Data Omitted>"
                    if len(data) > 5000: # General truncation for massive logs
                        return data[:1000] + "... (truncated)"
                return data

            # We want to provide the FULL details to the AI so it can explain everything
            # serialized in a readable format.
            clean_report = sanitize_data(local_report) # Create deep-ish copy via recursion
            
            details = clean_report.get('details', {})
            flags = clean_report.get('flags', [])
            score = clean_report.get('score', 0)
            
            # Create a clean summary object
            context_data = {
                "local_risk_score": score,
                "technical_flags": flags,
                "detailed_metrics": details
            }
            
            local_context = f"""
            FULL LOCAL FORENSIC ANALYSIS DATA:
            {json.dumps(context_data, indent=2)}
            
            INSTRUCTIONS FOR USING THIS DATA:
            1. This data comes from specialized code-based forensic tools (ELA, SegFormer, Metadata Analysis, Digital Signature Verification).
            2. Trust these metrics. If SegFormer says "Tampered", it is highly likely.
            3. **CRITICAL**: Check for "signatures" in the details. If a signature is INVALID, UNTRUSTED, or REVOKED, you MUST flag this as a severe authenticity issue.
            4. Your job is to SYNTHESIZE these technical findings with your own Visual/Semantic analysis.
            """

        # 3. Define the Prompt (The one above)
        prompt = """
        Analyze the attached document using the provided forensic context.
        """
        
        system_instruction = f"""
        You are VeriDoc-AI, an expert forensic document auditor. 
        Current Date: {datetime.now().strftime('%Y-%m-%d')}
        
        CONTEXT:
        {local_context}
        
        OBJECTIVE:
        Provide a "Unified Forensic Narrative" that explains the document's authenticity. 
        You must correlate the "Local Forensic Analysis Data" with your own visual observations.
        
        OUTPUT FORMAT (JSON):
        {{
            "authenticity_score": (0-100) - Your confidence in the document's legitimacy.
            "flagged_issues": [List of strings] - Focus on SEMANTIC inconsistencies (dates, logic) or VISUAL anomalies you see. *Do not* merely repeat the technical flags unless you add new context.
            "summary": (String) - High-level executive summary (max 2 sentences).
            "reasoning": (String) - THE MASTER EXPLANATION. This should be a detailed paragraph.
                - EXPLICITLY REFERENCE the technical metrics (e.g., "The high ELA variance confirms editing...")
                - Connect them to your visual findings (e.g., "...aligning with the visual mismatch in the font at the top right.").
                - Explain what the Segment/Noise maps likely show based on their presence.
                - This field MUST cover "Everything" - technical signals + semantic reasoning.
            "bounding_boxes": [ {{ "box_2d": [ymin, xmin, ymax, xmax], "label": "description" }} ]
        }}
        
        BOUNDING BOXES:
        If you find specific visual anomalies, provide bounding boxes.
        Format: [ymin, xmin, ymax, xmax] normalized to 0-1000.
        """
        # 4. Generate Content
        # We set temperature to 0.0 for maximum factual consistency
        
        # Initialize model with system instructions
        model_name = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")
        model = GenerativeModel(model_name, system_instruction=system_instruction)

        response = model.generate_content(
            [document_part, prompt],
            generation_config={"response_mime_type": "application/json", "temperature": 0.0}
        )

        # 5. Parse and Return
        result = json.loads(response.text)
        result['model_name'] = model_name
        return result

    except Exception as e:
        return {"error": f"Reasoning layer failed: {str(e)}"}
