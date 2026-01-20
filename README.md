# Veridoc: Conditional Forgery Detection System

![Veridoc Header](readme/header.png)

> **A Dual-Modality Forensic Engine on Google Cloud Platform**

## 📖 Overview

The rapid democratization of advanced digital editing tools has rendered traditional document verification obsolete. Organizations now face invisible threats where metadata manipulation, pixel-perfect splicing, and deep-fake technologies bypass standard visual checks.

**Veridoc** addresses this critical need for a dual-modality forensic engine capable of interrogating both the "binary DNA" of a file and its "visual physics" to mathematically prove authenticity rather than relying on subjective human review.

---

## 🏗 System Architecture

The system operates on a **Conditional Logic Model**, utilizing a Python (FastAPI) orchestrator to route files to specific analysis pipelines based on their format. This prevents redundant processing and maximizes detection accuracy.

### 🕵️‍♂️ Pipeline A: Digital Structural Analysis
*   **Target:** Native PDFs (digitally generated documents).
*   **Methodology:** Deterministic Binary File Structure Parsing.
*   **Libraries Used:** `pypdf`, `pdfminer.six`

![Pipeline A Architecture](readme/pipe1.png)

#### Key Techniques Implemented:
1.  **Incremental Update Detection:** We scan raw file bytes for multiple `%%EOF` markers. A count > 1 indicates that the file has been "incrementally updated" (edited) after its initial creation, rather than being a pristine original.
2.  **Metadata Forensics:** extraction of file metadata to identify suspicious producers (e.g., "Phantom", "GPL Ghostscript") often used in document manipulation tools vs. standard office software.

<br>

### 👁️ Pipeline B: Visual Statistical Analysis
*   **Target:** Scanned documents, JPEGs, Screenshots (Raster data).
*   **Methodology:** Statistical Signal Processing & Computer Vision.
*   **Libraries Used:** `opencv-python`, `numpy`, `scikit-image`

![Pipeline B Architecture](readme/pipe2.png)

#### Key Techniques Implemented:
1.  **Error Level Analysis (ELA):** We perform ELA by re-saving the image at a known quality (90%) and computing the absolute difference from the original. High mean difference scores (>15) indicate potential manipulation or resaving artifacts.
2.  **Histogram / Quantization Analysis:** A simplified check for "Double Quantization" by analyzing the pixel intensity histogram. We detect "gaps" (zero-bins) in the histogram, which often occur when a JPEG is decompressed and re-compressed.
3.  **Semantic Segmentation (Planned):** Integration of a **SegFormer-B0** model (fine-tuned on DocTamper) is currently in development/pending to provide pixel-level splice detection.

<br>

### 🔐 Pipeline C: Cryptographic Verification
*   **Target:** Digitally Signed PDFs (Contracts, Certificates).
*   **Methodology:** Mathematical verification of Chain of Trust.
*   **Libraries Used:** `pyhanko`, `cryptography`

#### Key Techniques Implemented:
1.  **Signature Integrity:** Validates that the document hash has not been altered since signing.
2.  **Trust Verification:** Checks if the certificate root is trusted or if it is a self-signed (untrusted) certificate.
3.  **Revocation Status:** Checks if the certificate has been actively revoked.

<br>

### 🧠 Universal Layer: Unified Forensic Reasoning
Executed if pipelines find ambiguous results, this layer serves as the final "Logical Gatekeeper".

*   **Technology:** **Google Vertex AI (Gemini 2.5 Flash)**.
*   **Methodology:** Single-Shot Forensic Analysis.
*   **Process:** The system sends the document (via secure GCS URI) to the Gemini 2.5 Flash model with a specialized system prompt acting as an "Expert Forensic Auditor". The model analyzes the content for logical inconsistencies (dates, totals, visual anomalies) and returns a structured JSON verdict.
*   **Libraries Used:** `google-cloud-aiplatform`, `vertexai`.

---

## 💻 Technical Specifications & Libraries

VeriDoc leverages a robust Python ecosystem for deterministic analysis and API orchestration.

| Component | Library / Tool | Purpose |
| :--- | :--- | :--- |
| **Orchestration** | `fastapi`, `uvicorn` | High-performance async API for handling concurrent analysis requests. |
| **Structural** | `pypdf` | Parsing PDF internal structure and detecting incremental updates. |
| **Visual** | `opencv-python`, `numpy` | High-speed matrix operations for ELA and histogram analysis. |
| **Cryptographic** | `pyhanko`, `cryptography` | ASN.1 parsing and X.509 certificate validation. |
| **AI Inference** | `google-cloud-aiplatform` | Interface for Vertex AI and Gemini models. |
| **Storage** | `google-cloud-storage` | Secure file staging for AI analysis. |

---

## ☁️ GCP Infrastructure & Deployment strategy

The architecture is built on a **Serverless First** principle using Google Cloud Platform to ensure high availability and security.

### 1.  **Local Ingestion:** Fast, local checks (Pipelines A/B/C) run on the application server (Cloud Run) to filter obvious fakes without incurring AI costs.
2.  **Secure Staging:** Files are uploaded to **Google Cloud Storage (GCS)** buckets with strict lifecycle policies.
3.  **AI Analysis:** Vertex AI accesses the file directly from GCS (`gs://...` URI), ensuring data never leaves the secure cloud perimeter during analysis.

---

## 📈 Expected Impact

![Impact Metrics](readme/impact.png)

*   **Defensible Verification:** Moves analysis from subjective suspicion to mathematical proof (e.g., EOF markers, Signature validation).
*   **Explainable AI (XAI):** Provides detailed reasoning via Gemini's analysis, rather than just "black box" confidence scores.
*   **Operational Velocity:** Automates the initial forensic pass, reducing manual review time significantly.
