import os
from datetime import datetime
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from cryptography import x509
from pyhanko.sign import signers, fields
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pypdf import PdfWriter  # Use pypdf for creation

def create_simple_pdf(filename):
    w = PdfWriter()
    w.add_blank_page(width=595, height=842)
    with open(filename, 'wb') as f:
        w.write(f)

def generate_self_signed(filename: str):
    # Ensure output is in tests/ directory if not already
    if not filename.startswith("tests/"):
        filename = os.path.join("tests", filename)
        
    # 1. Generate Key
    key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    # 2. Generate Certificate
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, u"US"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, u"California"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, u"San Francisco"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, u"VeriDoc Test"),
        x509.NameAttribute(NameOID.COMMON_NAME, u"VeriDoc Test Root"),
    ])
    cert = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        issuer
    ).public_key(
        key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.utcnow()
    ).not_valid_after(
        datetime.utcnow()
    ).add_extension(
        x509.BasicConstraints(ca=True, path_length=None), critical=True,
    ).sign(key, hashes.SHA256())

    # 3. Create PDF
    pdf_path = "tests/test_unsigned.pdf"
    create_simple_pdf(pdf_path)

    # Write key and cert to temporary files for SimpleSigner.load
    key_pem = key.private_bytes(encoding=serialization.Encoding.PEM, format=serialization.PrivateFormat.PKCS8, encryption_algorithm=serialization.NoEncryption())
    cert_pem = cert.public_bytes(encoding=serialization.Encoding.PEM)
    
    key_file = os.path.join("tests", "temp_key.pem")
    cert_file = os.path.join("tests", "temp_cert.pem")
    
    with open(key_file, "wb") as f:
        f.write(key_pem)
    with open(cert_file, "wb") as f:
        f.write(cert_pem)

    # 4. Sign PDF
    signer = signers.SimpleSigner.load(
        key_file,
        cert_file,
        key_passphrase=None
    )
    print(f"DEBUG: Signer created: {signer}")
    
    # Cleanup temp key files
    if os.path.exists(key_file): os.remove(key_file)
    if os.path.exists(cert_file): os.remove(cert_file)

    with open(pdf_path, 'rb') as inf:
        w = IncrementalPdfFileWriter(inf)
        fields.append_signature_field(
            w, sig_field_spec=fields.SigFieldSpec(
                sig_field_name='Signature1'
            )
        )
        
        with open(filename, 'wb') as outf:
            signers.sign_pdf(
                w, signers.PdfSignatureMetadata(field_name='Signature1'),
                signer=signer, output=outf,
            )
            
    # Cleanup
    if os.path.exists(pdf_path):
        os.remove(pdf_path)
    
    print(f"Generated Signed PDF: {filename}")

if __name__ == "__main__":
    generate_self_signed("sample_signed.pdf")
