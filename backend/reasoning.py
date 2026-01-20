import vertexai
from vertexai.generative_models import GenerativeModel, Part, SafetySetting
import json
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize Vertex AI (Do this once in your app startup)
# You should set these environment variables or replace the strings below
PROJECT_ID = os.getenv("PROJECT_ID", "your-project-id")
REGION = os.getenv("REGION", "us-central1")

# Check if we can initialize immediately, otherwise wait for main to do it or env vars
try:
    vertexai.init(project=PROJECT_ID, location=REGION)
except Exception as e:
    print(f"Warning: vertexai.init failed (likely due to placeholder PROJECT_ID): {e}")

def run_semantic_reasoning(gcs_uri, mime_type="application/pdf"):
    """
    Sends a file from GCS directly to Gemini 1.5 Pro for forensic analysis.
    
    Args:
        gcs_uri: The path to the file (e.g., "gs://veridoc-bucket/uploads/file.pdf")
        mime_type: "application/pdf" or "image/jpeg"
    """
    
    try:
        # 1. Load the Model
        # (Model initialized later with system instructions) 

        # 2. Reference the file in the Bucket (Zero download latency!)
        document_part = Part.from_uri(
            uri=gcs_uri,
            mime_type=mime_type
        )

        # 3. Define the Prompt (The one above)
        prompt = """
        Analyze the attached document using the forensic guidelines provided.
        Return ONLY the JSON object. Do not add markdown formatting.
        """
        
        system_instruction = """
        You are VeriDoc-AI, an expert forensic document auditor. 
        Analyze the provided document for signs of forgery, manipulation, or inconsistencies.
        Output your findings in a structured JSON format with fields for:
        - authenticity_score (0-100)
        - flagged_issues (list of strings)
        - summary (concise, user-friendly explanation, max 2 sentences)
        - reasoning (detailed explanation for technical audiotrs)
        """
        # Note: The user mentioned "Paste the full SYSTEM_PROMPT string here" but didn't provide it in the snippet 
        # beyond the truncated version. I'm adding a reasonable placeholder.

        # 4. Generate Content
        # We set temperature to 0.0 for maximum factual consistency
        
        # Initialize model with system instructions
        model = GenerativeModel("gemini-2.5-flash", system_instruction=system_instruction)

        response = model.generate_content(
            [document_part, prompt],
            generation_config={"response_mime_type": "application/json", "temperature": 0.0}
        )

        # 5. Parse and Return
        return json.loads(response.text)

    except Exception as e:
        return {"error": f"Reasoning layer failed: {str(e)}"}
