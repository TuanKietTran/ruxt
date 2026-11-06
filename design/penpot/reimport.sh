#!/usr/bin/env bash
# Re-import ruxt-design-system.penpot into a local Penpot project.
# Credentials are read at runtime from the .credentials file only;
# they are never hardcoded, printed, or stored anywhere else.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PENPOT_FILE="${PENPOT_FILE:-$SCRIPT_DIR/ruxt-design-system.penpot}"
PROJECT_NAME="${PENPOT_PROJECT_NAME:-Ruxt}"
CREDS_FILE="${PENPOT_CREDS_FILE:-/Users/handlerone/Downloads/ruxt-lab/tmp/penpot/.credentials}"
IDS_FILE="${PENPOT_IDS_FILE:-/Users/handlerone/Downloads/penpot-client-lab/notes/ruxt-ds-ids.txt}"
BASE_URL="${PENPOT_URL:-http://localhost:9001}"

[ -f "$PENPOT_FILE" ] || { echo "ERROR: export not found: $PENPOT_FILE" >&2; exit 1; }
[ -f "$CREDS_FILE" ] || { echo "ERROR: credentials file not found: $CREDS_FILE" >&2; exit 1; }

PENPOT_FILE="$PENPOT_FILE" PROJECT_NAME="$PROJECT_NAME" CREDS_FILE="$CREDS_FILE" \
IDS_FILE="$IDS_FILE" BASE_URL="$BASE_URL" python3 - <<'PY'
import os, re, sys, json, uuid, urllib.request, urllib.error, http.cookiejar, pathlib

creds = {}
for line in pathlib.Path(os.environ['CREDS_FILE']).read_text().splitlines():
    if '=' in line:
        k, v = line.split('=', 1)
        creds[k.strip()] = v.strip().strip('"').strip("'")
base = (os.environ.get('BASE_URL') or creds.get('url') or 'http://localhost:9001').rstrip('/')
email, password = creds.get('email'), creds.get('password')
if not email or not password:
    sys.exit('ERROR: email/password missing in credentials file')
project_name = os.environ['PROJECT_NAME']
penpot_file = pathlib.Path(os.environ['PENPOT_FILE'])

cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def rpc(name, payload):
    req = urllib.request.Request(base + '/api/rpc/command/' + name,
        data=json.dumps(payload).encode(), method='POST',
        headers={'Content-Type': 'application/json', 'Accept': 'application/transit+json'})
    try:
        with op.open(req, timeout=60) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')

def first_uuid(text):
    m = re.search(r'~u([0-9a-f-]{36})', text)
    return m.group(1) if m else None

st, body = rpc('login-with-password', {'email': email, 'password': password})
if st != 200 or not any(c.name == 'auth-token' for c in cj):
    sys.exit(f'ERROR: login failed status={st} body={body[:300]}')
print('login OK')

ids = {}
ids_path = pathlib.Path(os.environ['IDS_FILE'])
if ids_path.is_file():
    for line in ids_path.read_text().splitlines():
        if '=' in line:
            k, v = line.split('=', 1)
            ids[k.strip()] = v.strip()

team_id = ids.get('team_id')
if not team_id:
    st, body = rpc('get-teams', {})
    if st != 200:
        sys.exit(f'ERROR: get-teams failed status={st} body={body[:300]}')
    team_id = first_uuid(body)
if not team_id:
    sys.exit('ERROR: could not resolve team id')

def create_project(name):
    st, body = rpc('create-project', {'name': name, 'team-id': team_id})
    if st != 200:
        sys.exit(f'ERROR: create-project failed status={st} body={body[:300]}')
    pid = first_uuid(body)
    if not pid:
        sys.exit('ERROR: create-project returned no project id')
    print(f'project created: {name} {pid}')
    return pid

project_id = os.environ.get('PENPOT_PROJECT_ID') or ''
if not project_id and project_name == 'Ruxt' and ids.get('project_id'):
    project_id = ids['project_id']
if not project_id:
    project_id = create_project(project_name)

def import_file(pid):
    boundary = '----penpot-' + uuid.uuid4().hex
    data = penpot_file.read_bytes()
    import_name = (os.environ.get('PENPOT_IMPORT_NAME') or 'Ruxt Design System reimport')[:250]
    parts = []
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="project-id"\r\n\r\n{pid}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n{import_name}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{penpot_file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode())
    parts.append(data)
    parts.append(f'\r\n--{boundary}--\r\n'.encode())
    payload = b''.join(parts)
    req = urllib.request.Request(base + '/api/rpc/command/import-binfile',
        data=payload, method='POST',
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    try:
        with op.open(req, timeout=300) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')

st, body = import_file(project_id)
if st == 404 and 'object-not-found' in body:
    print('recorded project not found; creating it and retrying once')
    project_id = create_project(project_name)
    st, body = import_file(project_id)
if st < 200 or st >= 300:
    sys.exit(f'ERROR: import-binfile failed status={st} body={body[:500]}')
# import-binfile answers HTTP 200 with an SSE progress stream even on
# failure; the stream, not the status, carries the verdict.
if 'event: error' in body or '~:server-error' in body or '~:assertion' in body:
    sys.exit(f'ERROR: import-binfile SSE error stream body={body[-500:]}')
if 'event: end' not in body:
    sys.exit(f'ERROR: import-binfile stream did not end with event: end body={body[-500:]}')
print(f'IMPORT_OK status={st} sse=event:end project={project_name} project_id={project_id} file={penpot_file.name}')
PY
