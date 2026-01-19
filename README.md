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
* **Target:** Native PDFs (selectable text, structured binary data).
* **Methodology:** Deterministic Binary File Structure Parsing.

![Pipeline A Architecture](readme/pipe1.png)

#### Key Techniques:
1.  **Incremental Update Detection (Chronology):** We scan raw file bytes for multiple `%%EOF` markers. A count > 1 indicates post-creation editing, revealing that new content was appended to the file tail rather than overwriting the original.
2.  **XRef Table Forensics:** We parse the PDF Cross-Reference (XRef) table using low-level binary tools (e.g., pikepdf). The presence of a `Prev` entry in the trailer dictionary mathematically proves the file is a revision of a pre-existing document.
3.  **Orphaned Object Scanning:** We traverse the Object Tree (Root → Pages Content) and cross-reference it with the full object list. A high volume of "orphaned" IDs suggests manipulation by external tools where content was unlinked from the Page Tree.

<br>

### 👁️ Pipeline B: Visual Statistical Analysis
* **Target:** Scanned documents, JPEGs, Screenshots (Raster data).
* **Methodology:** Statistical Signal Processing & Computer Vision.

![Pipeline B Architecture](readme/pipe2.png)

#### Key Techniques:
1.  **DCT Quantization Analysis:** JPEG compression relies on 8x8 pixel grids. A "Comb Effect" (gaps in the histogram) rather than a smooth bell curve indicates "Double Quantization," proving the image was re-saved after editing.
2.  **ELA with Local Variance:** We re-compress the image at 95% quality and subtract it from the original. Unlike standard ELA, we calculate the Local Variance of the noise. Significant variance discrepancies (e.g., a logo vs. text box) confirm composite sourcing.
3.  **Deep Splicing Detection (Physics-Aware):** Utilizes a **SegFormer-B0** architecture fine-tuned on the DocTamper dataset.
    * **Stream 1:** Processes RGB visual content.
    * **Stream 2:** Utilizes Phase Spectrum Analysis and learnable DCT tables to capture phase discontinuities.
    * **Output:** A pixel-wise probability heatmap where high-confidence regions (p > 0.8) denote spliced pixels.

<br>

### 🧠 Universal Layer: Unified Forensic Reasoning
Executed only if Pipelines A and B find no technical anomalies, this layer serves as the final "Logical Gatekeeper". It uses **Vertex AI Agent Builder** to implement an **Agentic Verifier-Critique Loop**:

* **Auditor Agent:** Extracts line items and flags potential arithmetic errors (e.g., Transactions ≠ Total) or logic mismatches.
* **Verifier Agent:** Critiques the Auditor's findings (e.g., re-checking a blurry "8" that caused a math error) to filter hallucinations.

This iterative loop ensures flagged anomalies are genuine logical flaws rather than OCR misreads.

---

## ☁️ GCP Infrastructure & Deployment strategy

The architecture is built on a **Serverless First** principle using Google Cloud Platform to ensure high availability, strict privacy compliance, and specialized hardware access.

| Component | Service | Description |
| :--- | :--- | :--- |
| **Orchestration** | **Cloud Run Gen 2** | Containerized Python (FastAPI) orchestrator. Uses Gen 2 instances to access enhanced memory filesystems required for processing high-resolution ELA/DCT bitmaps in memory. |
| **Inference** | **Vertex AI Prediction** | Hosts the SegFormer-B0 model on **NVIDIA T4 GPUs**. This ensures complex frequency-domain analysis occurs in <800ms, meeting fintech SLA requirements. |
| **Reasoning** | **Vertex AI Agent Builder** | A managed service that handles the context window and tool retrieval for the Auditor/Verifier agents, replacing complex custom LangChain code. |
| **Secure Ingestion** | **Cloud Storage** | Documents are ingested via buckets with strict Object Lifecycle Management policies. Files are automatically purged immediately after the JSON verdict to ensure no PII retention (GDPR/CCPA compliant). |

---

## 📈 Expected Impact

![Impact Metrics](readme/impact.png)

* **Defensible Verification:** Moves analysis from subjective suspicion to mathematical proof (e.g., XRef evidence), creating legally defensible audit trails.
* **Explainable AI (XAI):** Provides granular "Reasoning Traces" (e.g., "Flagged due to Double Quantization") rather than black-box scores.
* **Operational Velocity:** Replaces 20+ minute manual reviews with an automated pipeline delivering verdicts in <3 seconds.
