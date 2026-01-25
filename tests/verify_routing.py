import sys
import os
import shutil

# Add backend to path to import services
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.pipeline_orchestrator import determine_pipeline, PipelineType

def verify():
    # 1. Setup
    signed_path = "tests/sample_signed.pdf"
    if not os.path.exists(signed_path):
        print("Error: sample_signed.pdf not found. Run generate_signed_samples.py first.")
        return

    # Create a copy with a generic name
    generic_path = "tests/generic_contract.pdf"
    shutil.copy(signed_path, generic_path)
    
    # Create a dummy unsigned pdf
    unsigned_path = "tests/plain.pdf"
    with open(unsigned_path, "wb") as f:
        f.write(b"%PDF-1.4\n%EOF") # Minimal PDF structure

    print(f"Testing Routing on {signed_path}...")
    type_1 = determine_pipeline(signed_path, "application/pdf")
    print(f"Result: {type_1}")
    
    print(f"Testing Routing on {generic_path} (Renamed)...")
    type_2 = determine_pipeline(generic_path, "application/pdf")
    print(f"Result: {type_2}")
    
    print(f"Testing Routing on {unsigned_path} (Unsigned)...")
    type_3 = determine_pipeline(unsigned_path, "application/pdf")
    print(f"Result: {type_3}")

    # Assertions
    if type_1 == PipelineType.CRYPTOGRAPHIC and type_2 == PipelineType.CRYPTOGRAPHIC:
        print("\nSUCCESS: Signed PDFs correctly identified as CRYPTOGRAPHIC regardless of filename.")
    else:
        print("\nFAILURE: Detection logic failed.")
        
    if type_3 == PipelineType.STRUCTURAL:
         print("SUCCESS: Unsigned PDF correctly identified as STRUCTURAL.")
    else:
         print(f"FAILURE: Unsigned PDF identifed as {type_3}")
         
    # Cleanup
    if os.path.exists(generic_path): os.remove(generic_path)
    if os.path.exists(unsigned_path): os.remove(unsigned_path)

if __name__ == "__main__":
    verify()
