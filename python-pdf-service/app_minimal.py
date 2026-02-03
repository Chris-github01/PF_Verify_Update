"""
MINIMAL BOOTSTRAP APP - FOR DEPLOYMENT ON 512MB ONLY
This version has minimal memory footprint to pass initial deployment.
Once deployed and upgraded to Standard (2GB), switch back to app.py
"""
import os
from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        'service': 'PDF Parser Ensemble',
        'version': '1.0.0-minimal',
        'status': 'bootstrap_mode',
        'message': 'Service deployed successfully. Upgrade to Standard tier for full functionality.',
        'endpoints': {
            'health': '/health'
        }
    })

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'service': 'pdf-parser-ensemble',
        'version': '1.0.0-minimal',
        'mode': 'bootstrap',
        'parsers': {
            'pdfplumber': 'available_after_upgrade',
            'pymupdf': 'available_after_upgrade'
        }
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=False)
