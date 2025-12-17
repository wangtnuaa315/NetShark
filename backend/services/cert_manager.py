"""
CA Certificate Manager
For generating, storing and installing CA certificates required by MITM proxy
"""
import os
from pathlib import Path
import shutil

# Use print instead of logger to avoid conflict with mitmproxy logging
def _log(msg):
    print(f"[CertManager] {msg}")

# Certificate storage directory (in project directory)
CERT_DIR = Path(__file__).parent.parent.parent / "certs"
CERT_DIR.mkdir(exist_ok=True)

# Certificate file paths
CA_CERT_PEM = CERT_DIR / "mitmproxy-ca-cert.pem"
CA_CERT_CER = CERT_DIR / "mitmproxy-ca-cert.cer"
CA_KEY_PEM = CERT_DIR / "mitmproxy-ca.pem"

# mitmproxy default certificate directory
MITMPROXY_DIR = Path.home() / ".mitmproxy"


def ensure_certificates() -> dict:
    """
    Ensure certificates exist
    """
    result = {
        "exists": False,
        "cert_path": None,
        "cer_path": None,
        "need_generate": False,
        "need_install": True
    }
    
    # Check if certificates exist in project directory
    if CA_CERT_PEM.exists() and CA_CERT_CER.exists():
        result["exists"] = True
        result["cert_path"] = str(CA_CERT_PEM)
        result["cer_path"] = str(CA_CERT_CER)
        _log(f"Certificates found in project: {CERT_DIR}")
        return result
    
    # Try to copy from mitmproxy default directory
    mitm_pem = MITMPROXY_DIR / "mitmproxy-ca-cert.pem"
    mitm_cer = MITMPROXY_DIR / "mitmproxy-ca-cert.cer"
    mitm_key = MITMPROXY_DIR / "mitmproxy-ca.pem"
    
    if mitm_pem.exists():
        try:
            shutil.copy(mitm_pem, CA_CERT_PEM)
            if mitm_cer.exists():
                shutil.copy(mitm_cer, CA_CERT_CER)
            else:
                shutil.copy(mitm_pem, CA_CERT_CER)
            if mitm_key.exists():
                shutil.copy(mitm_key, CA_KEY_PEM)
            
            result["exists"] = True
            result["cert_path"] = str(CA_CERT_PEM)
            result["cer_path"] = str(CA_CERT_CER)
            _log(f"Certificates copied from mitmproxy to: {CERT_DIR}")
            return result
        except Exception as e:
            _log(f"Failed to copy certificates: {e}")
    
    result["need_generate"] = True
    _log("No certificates found. Need to generate.")
    return result


def generate_certificates() -> dict:
    """
    Generate new CA certificate
    """
    try:
        from OpenSSL import crypto
        
        CERT_DIR.mkdir(exist_ok=True)
        
        key = crypto.PKey()
        key.generate_key(crypto.TYPE_RSA, 2048)
        
        cert = crypto.X509()
        cert.get_subject().CN = "NetShark MITM CA"
        cert.get_subject().O = "NetShark"
        cert.set_serial_number(1)
        cert.gmtime_adj_notBefore(0)
        cert.gmtime_adj_notAfter(10 * 365 * 24 * 60 * 60)
        cert.set_issuer(cert.get_subject())
        cert.set_pubkey(key)
        
        cert.add_extensions([
            crypto.X509Extension(b"basicConstraints", True, b"CA:TRUE"),
            crypto.X509Extension(b"keyUsage", True, b"keyCertSign, cRLSign"),
            crypto.X509Extension(b"subjectKeyIdentifier", False, b"hash", subject=cert),
        ])
        
        cert.sign(key, "sha256")
        
        with open(CA_CERT_PEM, "wb") as f:
            f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
        
        with open(CA_CERT_CER, "wb") as f:
            f.write(crypto.dump_certificate(crypto.FILETYPE_ASN1, cert))
        
        with open(CA_KEY_PEM, "wb") as f:
            f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, key))
            f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
        
        MITMPROXY_DIR.mkdir(exist_ok=True)
        shutil.copy(CA_CERT_PEM, MITMPROXY_DIR / "mitmproxy-ca-cert.pem")
        shutil.copy(CA_CERT_CER, MITMPROXY_DIR / "mitmproxy-ca-cert.cer")
        shutil.copy(CA_KEY_PEM, MITMPROXY_DIR / "mitmproxy-ca.pem")
        
        _log(f"Certificates generated at: {CERT_DIR}")
        
        return {
            "success": True,
            "cert_path": str(CA_CERT_PEM),
            "cer_path": str(CA_CERT_CER)
        }
        
    except Exception as e:
        _log(f"Failed to generate certificates: {e}")
        return {
            "success": False,
            "error": str(e)
        }


def install_certificate() -> dict:
    """
    Install CA certificate to Windows system trust store
    Requires administrator privileges
    """
    import subprocess
    
    if not CA_CERT_CER.exists():
        return {"success": False, "error": "Certificate file not found"}
    
    try:
        result = subprocess.run(
            ["certutil", "-addstore", "Root", str(CA_CERT_CER)],
            capture_output=True,
            shell=True
        )
        
        if result.returncode == 0:
            _log("Certificate installed successfully")
            return {"success": True, "message": "Certificate installed successfully"}
        else:
            error_msg = ""
            for encoding in ['gbk', 'utf-8', 'cp936']:
                try:
                    error_msg = result.stderr.decode(encoding) or result.stdout.decode(encoding)
                    break
                except:
                    continue
            _log(f"Failed to install certificate: {error_msg}")
            return {"success": False, "error": error_msg or "Unknown error"}
            
    except Exception as e:
        _log(f"Error installing certificate: {e}")
        return {"success": False, "error": str(e)}


def check_certificate_installed() -> bool:
    """
    Check if certificate is installed in system
    """
    import subprocess
    
    try:
        result = subprocess.run(
            ["certutil", "-store", "Root"],
            capture_output=True,
            shell=True
        )
        
        output = ""
        for encoding in ['gbk', 'utf-8', 'cp936', 'latin-1']:
            try:
                output = result.stdout.decode(encoding, errors='ignore').lower()
                break
            except:
                continue
        
        if "mitmproxy" in output or "netshark" in output:
            _log("Certificate found in system store")
            return True
        
        _log("Certificate not found in system store")
        return False
        
    except Exception as e:
        _log(f"Error checking certificate: {e}")
        return False


def get_certificate_info() -> dict:
    """
    Get certificate information
    """
    cert_status = ensure_certificates()
    installed = check_certificate_installed() if cert_status["exists"] else False
    
    return {
        "exists": cert_status["exists"],
        "installed": installed,
        "cert_path": str(CA_CERT_PEM) if CA_CERT_PEM.exists() else None,
        "cer_path": str(CA_CERT_CER) if CA_CERT_CER.exists() else None,
        "cert_dir": str(CERT_DIR),
        "need_generate": cert_status.get("need_generate", False)
    }
