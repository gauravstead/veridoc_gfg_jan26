import sys
import os
import json
import asyncio

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.pipeline_orchestrator import determine_pipeline, analyze_cryptographic, PipelineType

async def run_debug():
    file_path = os.path.abspath("tests/sample_signed.pdf")
    print(f"DEBUG: Testing with file: {file_path}")
    
    # 1. Pipeline Determination
    pipeline = determine_pipeline(file_path, "application/pdf")
    print(f"DEBUG: Pipeline Selected: {pipeline}")
    
    if pipeline != PipelineType.CRYPTOGRAPHIC:
        print("FAIL: Did not select Cryptographic pipeline.")
        return

    # 2. Run Analysis
    print("DEBUG: Running analyze_cryptographic...")
    report = await analyze_cryptographic(file_path)
    
    # 3. Print Details Structure
    print("\n--- REPORT DETAILS ---")
    print(json.dumps(report.get('details', {}), indent=2))
    
    signatures = report.get('details', {}).get('signatures')
    if signatures:
        print(f"\nSUCCESS: Found {len(signatures)} signatures.")
        print("Sample Signature 0:", signatures[0])
    else:
        print("\nFAIL: 'signatures' key missing or empty in details.")

if __name__ == "__main__":
    asyncio.run(run_debug())
