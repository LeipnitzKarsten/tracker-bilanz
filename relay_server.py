"""
Tracker Bilanz – Cloud Relay Server v1

iPhone schickt POST /sync → Daten werden in der Queue gespeichert.
Mac ruft GET /pull ab → Queue geleert, sync_server.py verarbeitet sie in Excel.

Deployment: Railway.app (Repo verbinden → Deploy → URL in index.html + sync_server.py eintragen)
  1. railway.app → New Project → Deploy from GitHub Repo
  2. Umgebungsvariable setzen: SYNC_SECRET=tb-sync-2026
  3. URL aus dem Dashboard kopieren (z.B. https://tracker-sync.up.railway.app)
  4. URL in index.html (CLOUD_RELAY_URL) und sync_server.py (CLOUD_RELAY_URL) eintragen
"""

import os, json, time
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins='*')

SECRET = os.environ.get('SYNC_SECRET', 'tb-sync-2026')
_queue = []   # In-Memory – übersteht alle Requests, wird bei Neustart geleert


@app.route('/sync', methods=['POST', 'OPTIONS'])
def enqueue():
    if request.method == 'OPTIONS':
        return '', 204

    data = request.get_json(silent=True) or {}
    if data.get('secret') != SECRET:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 403

    item = {
        'user':   data.get('user'),
        'month':  data.get('month'),
        'totals': data.get('totals', {}),
        'ts':     time.time()
    }
    _queue.append(item)
    print(f"[RELAY] +queue  {item['user']} {item['month']}  →  {len(_queue)} pending")
    return jsonify({'ok': True, 'queued': len(_queue)})


@app.route('/pull', methods=['GET', 'POST'])
def pull():
    secret = request.args.get('secret') or (request.get_json(silent=True) or {}).get('secret')
    if secret != SECRET:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 403

    items = list(_queue)
    _queue.clear()
    print(f"[RELAY] pull    {len(items)} item(s) delivered & cleared")
    return jsonify({'ok': True, 'items': items})


@app.route('/health')
def health():
    return jsonify({'ok': True, 'pending': len(_queue), 'version': 1})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5002))
    print("=" * 50)
    print("  Tracker Bilanz – Cloud Relay v1")
    print("=" * 50)
    print(f"  Port  : {port}")
    print(f"  Secret: {SECRET[:4]}***")
    print(f"  Queue : leer")
    print("=" * 50)
    app.run(host='0.0.0.0', port=port, debug=False)
