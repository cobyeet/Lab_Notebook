#!/usr/bin/env python3
"""Portable notebook CLI and loopback API. Standard-library Python 3.9+."""
import argparse
import base64
import contextlib
import csv
import datetime as dt
import hashlib
import io
import json
import math
import mimetypes
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 200 * 1024 * 1024
STATUSES = {'observation', 'in-progress', 'verified', 'unverified'}
KINDS = {'entry','experiment','analysis','meeting','literature','question','recording','method','figure','board'}
RELATIONS = {'references','reanalyzes','uses-protocol','supports','challenges','follows-up','supersedes','resolves'}

def blank():
    return dict(schema=1, title='Lab Notebook', subtitle='An ongoing record of research', author='', entries=[], draft=None)

def text(value, limit, label):
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError('Invalid ' + label)
    return value

def reference(value):
    if not re.fullmatch(r'[A-Za-z0-9_-]+', text(value,100,'reference ID')):
        raise ValueError('Invalid reference ID')

def collection(value, limit, label):
    if not isinstance(value,list) or len(value)>limit:
        raise ValueError('Invalid '+label)
    return value

def validate_knowledge(e):
    if 'kind' in e and (not isinstance(e['kind'],str) or e['kind'] not in KINDS):
        raise ValueError('Invalid page kind')
    for key in ('tags','aliases'):
        if key in e:
            for item in collection(e[key],100,key):text(item,200,key)
    if 'properties' in e:
        if not isinstance(e['properties'],dict) or len(e['properties'])>50:
            raise ValueError('Invalid properties')
        for key,value in e['properties'].items():
            text(key,100,'property name')
            if not key.strip() or key in {'__proto__','constructor','prototype'}:
                raise ValueError('Invalid property name')
            if isinstance(value,str):text(value,2000,'property value')
            elif not isinstance(value,(bool,int,float)) or (isinstance(value,float) and not math.isfinite(value)):
                raise ValueError('Invalid property value')
    for key in ('links','tasks'):
        seen=set()
        for item in collection(e.get(key,[]),200,key):
            if not isinstance(item,dict):raise ValueError('Invalid '+key)
            reference(item.get('id'))
            if item['id'] in seen:raise ValueError('Duplicate '+key+' ID')
            seen.add(item['id'])
            if key=='links':
                reference(item.get('target'))
                if not isinstance(item.get('type'),str) or item['type'] not in RELATIONS:raise ValueError('Invalid relationship type')
            else:
                text(item.get('text'),2000,'task text')
                if not isinstance(item.get('state'),str) or item['state'] not in {'open','completed','revised','abandoned'}:raise ValueError('Invalid task state')
                if item.get('outcome'):reference(item['outcome'])
            text(item.get('reason',''),2000,'reason')
    if 'board' in e:
        board=e['board']
        if not isinstance(board,dict):raise ValueError('Invalid board')
        cards=set()
        for card in collection(board.get('cards'),200,'board cards'):
            if not isinstance(card,dict):raise ValueError('Invalid board card')
            reference(card.get('id'));reference(card.get('target'))
            if card['id'] in cards:raise ValueError('Duplicate board card')
            cards.add(card['id'])
            if card.get('attachment'):reference(card['attachment'])
            for key in ('x','y'):
                value=card.get(key)
                if isinstance(value,bool) or not isinstance(value,(int,float)) or not -100000<=value<=100000:raise ValueError('Invalid board position')
        connections=set()
        for line in collection(board.get('connections'),400,'board connections'):
            if not isinstance(line,dict):raise ValueError('Invalid board connection')
            reference(line.get('id'))
            reference(line.get('from'));reference(line.get('to'))
            if line['id'] in connections:raise ValueError('Duplicate board connection')
            connections.add(line['id'])
            if line.get('from') not in cards or line.get('to') not in cards:raise ValueError('Invalid board connection')
            text(line.get('label',''),200,'board label')

def validate_workspace(w):
    if not isinstance(w,dict):raise ValueError('Invalid workspace')
    for ident in collection(w.get('bookmarks',[]),10000,'bookmarks'):reference(ident)
    seen=set()
    for view in collection(w.get('views',[]),100,'saved views'):
        if not isinstance(view,dict):raise ValueError('Invalid saved view')
        reference(view.get('id'));text(view.get('name'),100,'view name')
        if view['id'] in seen:raise ValueError('Duplicate saved view')
        seen.add(view['id'])
        if not isinstance(view.get('filters'),dict):raise ValueError('Invalid view filters')
        for key,value in view['filters'].items():
            if key not in {'query','project','kind','status','tag','recording','from','to','relationship'}:raise ValueError('Invalid view filter')
            text(value,300,'view filter')

def validate_entry(e):
    if not isinstance(e, dict):
        raise ValueError('Entry must be an object')
    validate_knowledge(e)
    ident = text(e.get('id'), 100, 'entry ID')
    if not re.fullmatch(r'[A-Za-z0-9_-]+', ident):
        raise ValueError('Entry ID must contain letters, digits, underscores, or hyphens')
    date = text(e.get('date'), 10, 'date')
    if dt.date.fromisoformat(date).isoformat() != date:
        raise ValueError('Use an ISO date: YYYY-MM-DD')
    for key, limit in [('title', 300), ('project', 100), ('body', 1000000), ('created', 100), ('sources', 20000), ('next', 20000)]:
        text(e.get(key) if key in {'title','project','body','created'} else e.get(key,''), limit, key)
    if not e['title'].strip() or not e['project'].strip():
        raise ValueError('Title and project are required')
    if e.get('status') not in STATUSES or not isinstance(e.get('significant'), bool):
        raise ValueError('Invalid evidence status or milestone flag')
    attachments = e.get('attachments')
    if not isinstance(attachments, list) or len(attachments) > 100:
        raise ValueError('Invalid attachment list')
    for a in attachments:
        for key, limit in [('id', 100), ('name', 250), ('data', 30000000)]:
            text(a.get(key), limit, 'attachment ' + key)
        if a.get('kind') not in {'image', 'table', 'file'}:
            raise ValueError('Invalid attachment kind')
        match = re.fullmatch(r'data:([a-zA-Z0-9.+/-]*);base64,([A-Za-z0-9+/=]*)', a['data'])
        if not match:
            raise ValueError('Invalid attachment data URL')
        raw = base64.b64decode(match[2], validate=True)
        if a.get('sha256') and a['sha256'] != hashlib.sha256(raw).hexdigest():
            raise ValueError('Attachment checksum does not match')
        a['sha256'] = hashlib.sha256(raw).hexdigest()
        if a['kind'] == 'image' and match[1] not in {'image/png','image/jpeg','image/gif','image/webp'}:
            raise ValueError('Unsupported image MIME type')
        if a['kind'] == 'table':
            rows = list(csv.reader(io.StringIO(raw.decode('utf-8-sig')), strict=True))
            rows = [row for row in rows if any(cell.strip() for cell in row)]
            if len(rows) < 2 or len(rows[0]) > 100 or len(rows) > 20001 or any(len(row) != len(rows[0]) for row in rows):
                raise ValueError('CSV needs uniform rows, a header, and up to 20000 data rows / 100 columns')
            a['table'] = dict(headers=rows[0], rows=rows[1:])
    return e

def validate(n):
    if not isinstance(n, dict) or n.get('schema') != 1 or not isinstance(n.get('entries'), list) or len(n['entries']) > 10000:
        raise ValueError('Unsupported notebook schema')
    for key, limit in [('title',200),('subtitle',500),('author',200)]:
        text(n.get(key,''),limit,key)
    for key in ("brandName","brandSubtitle"):
        if key in n:text(n[key],100,key)
    if 'workspace' in n:validate_workspace(n['workspace'])
    seen = set()
    for entry in n['entries']:
        validate_entry(entry)
        if entry['id'] in seen:
            raise ValueError('Duplicate entry ID')
        seen.add(entry['id'])
    if n.get('draft') is not None:
        # Drafts can have incomplete titles/projects but retain the entry shape.
        draft = dict(n['draft'])
        draft['title'] = draft.get('title') or 'Draft'
        draft['project'] = draft.get('project') or 'Unassigned'
        validate_entry(draft)
    return n

def read(path):
    if not path.exists():
        return blank()
    if path.stat().st_size > MAX_BYTES:
        raise ValueError('Notebook exceeds 200 MB')
    return validate(json.loads(path.read_text(encoding='utf-8')))

def revision(n):
    return '"' + hashlib.sha256(json.dumps(n,sort_keys=True,ensure_ascii=False).encode()).hexdigest() + '"'

@contextlib.contextmanager
def locked(path):
    path.parent.mkdir(parents=True,exist_ok=True)
    lock = path.with_suffix(path.suffix + '.lock')
    deadline = time.monotonic() + 5
    while True:
        try:
            lock.mkdir()
            break
        except FileExistsError:
            if time.monotonic() >= deadline:
                raise ValueError('Notebook is locked by another writer. If its process crashed, remove the .lock directory after verifying no writer is running.')
            time.sleep(.05)
    try:
        yield
    finally:
        lock.rmdir()

def write(path, n):
    validate(n)
    encoded = json.dumps(n, ensure_ascii=False, indent=2).encode('utf-8')
    if len(encoded) > MAX_BYTES:
        raise ValueError('Notebook exceeds 200 MB')
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.notebook-', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp,path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

def attach(path):
    raw = path.read_bytes()
    if len(raw) > 20 * 1024 * 1024:
        raise ValueError('Attachment exceeds 20 MB')
    ext = path.suffix.lower()
    if ext not in {'.png','.jpg','.jpeg','.gif','.webp','.csv','.fig','.mat','.pdf','.svg','.npz'}:
        raise ValueError('Unsupported attachment: ' + path.name)
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    kind = 'table' if ext == '.csv' else 'image' if ext in {'.png','.jpg','.jpeg','.gif','.webp'} else 'file'
    digest = hashlib.sha256(raw).hexdigest()
    return dict(id=digest[:24],name=path.name,kind=kind,data=f'data:{mime};base64,'+base64.b64encode(raw).decode(),sha256=digest)

def contribute(path, payload, replace=False, attachment_paths=()):
    entry = dict(payload)
    entry.setdefault('created',dt.datetime.now(dt.timezone.utc).isoformat())
    entry.setdefault('status','unverified')
    entry.setdefault('significant',False)
    entry.setdefault('sources','')
    entry.setdefault('next','')
    entry.setdefault('attachments',[])
    entry['attachments'] += [attach(Path(p)) for p in attachment_paths]
    validate_entry(entry)
    with locked(path):
        n = read(path)
        index = next((i for i,e in enumerate(n['entries']) if e['id'] == entry['id']),None)
        if index is not None:
            old = n['entries'][index]
            comparable = lambda e: {k:v for k,v in e.items() if k not in {'created','updated','revisions'}}
            if comparable(old) == comparable(entry):
                return dict(action='unchanged',entry_id=entry['id'],revision=revision(n))
            if not replace:
                raise ValueError('Entry ID already exists with different content; use a new ID or explicitly pass --replace')
            entry['created'] = old['created']
            entry['updated'] = dt.datetime.now(dt.timezone.utc).isoformat()
            entry['revisions'] = old.get('revisions',[]) + [{k:v for k,v in old.items() if k != 'revisions'}]
            n['entries'][index] = entry
        else:
            n['entries'].append(entry)
        write(path,n)
        return dict(action='replaced' if index is not None else 'created',entry_id=entry['id'],revision=revision(n))

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(args[2].static_root),**kwargs)
    def safe_host(self):
        return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Cache-Control','no-store')
        super().end_headers()
    def send_json(self,code,value,tag=None):
        raw=json.dumps(value,ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(raw)))
        if tag:self.send_header('ETag',tag)
        self.end_headers()
        self.wfile.write(raw)
    def do_GET(self):
        if not self.safe_host():
            self.send_error(403,'Loopback host required')
            return
        if self.path.split('?')[0] == '/api/notebook':
            try:
                n=read(self.server.notebook_path)
                self.send_json(200,n,revision(n))
            except (ValueError,OSError) as e:
                self.send_json(500,dict(error=str(e)))
            return
        if self.path.split('?')[0] == '/api/health':
            self.send_json(200,dict(status='ok',schema=1,storage='local-file'))
            return
        # Only the compiled public web root is served. Never serve data or source.
        super().do_GET()
    def do_PUT(self):
        if not self.safe_host():
            self.send_error(403)
            return
        origin=self.headers.get('Origin')
        expected={f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'}
        if origin and origin not in expected:
            self.send_error(403,'Same-origin requests required')
            return
        if self.path != '/api/notebook' or self.headers.get('Content-Type') != 'application/json':
            self.send_error(400)
            return
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length <= 0 or length > MAX_BYTES:
                raise ValueError('Invalid request size')
            incoming=validate(json.loads(self.rfile.read(length)))
            with locked(self.server.notebook_path):
                existing=read(self.server.notebook_path)
                if self.headers.get('If-Match') != revision(existing):
                    self.send_json(412,dict(error='Notebook changed; reload before saving'))
                    return
                write(self.server.notebook_path,incoming)
            self.send_json(200,dict(saved=True),revision(incoming))
        except (ValueError,OSError) as e:
            self.send_json(400,dict(error=str(e)))
    def log_message(self,format,*args):
        # Request paths only; notebook content is never logged.
        sys.stderr.write('%s %s\n' % (self.log_date_time_string(), format % args))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--notebook',type=Path,default=Path('private-data/notebook.json'),help='Canonical private notebook JSON (default: ./private-data/notebook.json)')
    commands=parser.add_subparsers(dest='command',required=True)
    commands.add_parser('init',help='Create a private empty notebook if absent')
    commands.add_parser('read',help='Emit full notebook JSON on stdout')
    c=commands.add_parser('contribute',help='Add an entry, idempotently, from JSON')
    c.add_argument('--input',default='-',help='JSON file or - for stdin')
    c.add_argument('--attach',action='append',default=[],help='Attachment path; repeatable')
    c.add_argument('--replace',action='store_true',help='Explicitly revise an existing ID, preserving history')
    c.add_argument('--dry-run',action='store_true',help='Validate without saving')
    v=commands.add_parser('validate',help='Validate a notebook backup')
    v.add_argument('file',type=Path)
    s=commands.add_parser('serve',help='Serve the built website and local API on loopback only')
    s.add_argument('--port',type=int,default=8787)
    s.add_argument('--static',type=Path,default=ROOT/'dist')
    args=parser.parse_args()
    try:
        if args.command=='init':
            with locked(args.notebook):
                if not args.notebook.exists():write(args.notebook,blank())
            result=dict(action='ready',entries=len(read(args.notebook)['entries']))
        elif args.command=='read':result=read(args.notebook)
        elif args.command=='validate':
            if not args.file.is_file():raise ValueError('Backup file does not exist')
            result=dict(valid=True,entries=len(read(args.file)['entries']))
        elif args.command=='contribute':
            payload=json.loads(sys.stdin.read() if args.input=='-' else Path(args.input).read_text(encoding='utf-8'))
            if args.dry_run:
                with tempfile.TemporaryDirectory() as temp:
                    target=Path(temp)/'notebook.json'
                    write(target,read(args.notebook))
                    result=contribute(target,payload,args.replace,args.attach)
                    result['action']='validated'
            else:result=contribute(args.notebook,payload,args.replace,args.attach)
        elif args.command=='serve':
            static=args.static.resolve()
            data=args.notebook.resolve()
            if static==data.parent or static in data.parents:
                raise ValueError('Notebook data must be outside the public static directory')
            if not (static/'index.html').is_file():
                raise ValueError('Build the website first: npm ci && npm run build')
            with locked(data):
                if not data.exists():write(data,blank())
            server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
            server.notebook_path=data
            server.static_root=static
            print(f'Lab Notebook: http://127.0.0.1:{args.port}',flush=True)
            try:server.serve_forever()
            except KeyboardInterrupt:pass
            finally:server.server_close()
            return
        print(json.dumps(result,ensure_ascii=False,indent=2))
    except (ValueError,OSError) as e:
        print(json.dumps(dict(error=str(e))),file=sys.stderr)
        raise SystemExit(1)

if __name__=='__main__':main()
