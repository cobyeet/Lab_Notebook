import importlib.util
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import threading
import unittest
import urllib.error
import urllib.request
spec=importlib.util.spec_from_file_location('notebook',Path(__file__).parents[1]/'scripts/notebook.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def entry():
    return dict(id='20260123-test-a',date='2026-01-23',project='TEST',title='Daily entry',body='An observation',status='unverified',significant=False,sources='Test evidence',next='',attachments=[])

class NotebookTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.path=self.root/'private'/'notebook.json'
    def tearDown(self):self.temp.cleanup()
    def test_idempotency_and_revision(self):
        self.assertEqual(m.contribute(self.path,entry())['action'],'created')
        self.assertEqual(m.contribute(self.path,entry())['action'],'unchanged')
        revised=entry();revised['body']='Revised';original=self.path.read_bytes()
        with self.assertRaises(ValueError):m.contribute(self.path,revised)
        self.assertEqual(original,self.path.read_bytes())
        self.assertEqual(m.contribute(self.path,revised,replace=True)['action'],'replaced')
        n=m.read(self.path);self.assertEqual(len(n['entries']),1);self.assertEqual(n['entries'][0]['revisions'][0]['body'],'An observation')
    def test_attachments_are_portable_and_checked(self):
        csv=self.root/'table.csv';csv.write_text('label,value\ncontrol,1\ntest,2\n')
        m.contribute(self.path,entry(),attachment_paths=[csv]);n=m.read(self.path);a=n['entries'][0]['attachments'][0]
        self.assertEqual(a['table']['rows'][1],['test','2']);self.assertNotIn(str(self.root),json.dumps(n))
        a['sha256']='wrong'
        with self.assertRaises(ValueError):m.validate(n)
    def test_invalid_entry_does_not_mutate(self):
        m.contribute(self.path,entry());before=self.path.read_bytes()
        e=entry();e['date']='2026-02-30'
        with self.assertRaises(ValueError):m.contribute(self.path,e)
        self.assertEqual(before,self.path.read_bytes())
    def test_research_metadata_round_trip_revisions_and_invalid_changes(self):
        e=entry();e.update(kind='analysis',tags=['timing'],aliases=['Timing analysis'],properties={'recordingId':'R-001','count':2,'reviewed':False},
            links=[dict(id='link-1',target='question',type='supports',reason='Author interpretation')],
            tasks=[dict(id='task-1',text='Control artifacts',state='open',outcome='',reason='')])
        m.contribute(self.path,e)
        self.assertEqual(m.read(self.path)['entries'][0]['properties'],e['properties'])
        self.assertEqual(m.contribute(self.path,e)['action'],'unchanged')
        revised=json.loads(json.dumps(e));revised['tasks'][0].update(state='completed',outcome='follow-up')
        m.contribute(self.path,revised,replace=True)
        saved=m.read(self.path);self.assertEqual(saved['entries'][0]['revisions'][0]['tasks'][0]['state'],'open')
        saved['workspace']={'bookmarks':[e['id']],'views':[dict(id='saved-view',name='Timing',filters={'tag':'timing'})]}
        m.write(self.path,saved);self.assertEqual(m.read(self.path)['workspace'],saved['workspace'])
        before=self.path.read_bytes()
        for fields in [dict(kind={}),dict(properties={'invalid':[]}),dict(links=[dict(id='l',target='../private',type='supports')]),dict(tasks=[dict(id='t',text='step',state='maybe')]),dict(board={'cards':[dict(id='c',target='question',x=float('inf'),y=0)],'connections':[]})]:
            invalid={**revised,**fields}
            with self.assertRaises(ValueError):m.contribute(self.path,invalid,replace=True)
            self.assertEqual(before,self.path.read_bytes())
    def test_board_metadata_is_retained_and_connections_are_validated(self):
        e=entry();e.update(kind='board',board=dict(cards=[dict(id='c1',target='recording',x=10,y=20),dict(id='c2',target='analysis',x=300,y=20)],connections=[dict(id='line',**{'from':'c1','to':'c2'},label='reanalyzes')]))
        m.contribute(self.path,e);self.assertEqual(m.read(self.path)['entries'][0]['board'],e['board'])
        e['board']['connections'][0]['to']='missing'
        with self.assertRaises(ValueError):m.contribute(self.path,e,replace=True)
    def test_concurrent_contributions(self):
        errors=[]
        def add(i):
            try:
                e=entry();e['id']=f'entry-{i}';m.contribute(self.path,e)
            except Exception as error:errors.append(error)
        threads=[threading.Thread(target=add,args=(i,)) for i in range(10)]
        for t in threads:t.start()
        for t in threads:t.join()
        self.assertFalse(errors);self.assertEqual(len(m.read(self.path)['entries']),10)
    def test_cli_stdin_dry_run_and_idempotency(self):
        script=Path(__file__).parents[1]/'scripts/notebook.py'
        cmd=[sys.executable,str(script),'--notebook',str(self.path),'contribute','--input','-']
        first=subprocess.run(cmd+['--dry-run'],input=json.dumps(entry()),text=True,capture_output=True)
        self.assertEqual(first.returncode,0,first.stderr);self.assertFalse(self.path.exists())
        created=subprocess.run(cmd,input=json.dumps(entry()),text=True,capture_output=True)
        self.assertEqual(json.loads(created.stdout)['action'],'created')
        retry=subprocess.run(cmd,input=json.dumps(entry()),text=True,capture_output=True)
        self.assertEqual(json.loads(retry.stdout)['action'],'unchanged')
    def test_preservation_gate_checks_records_attachments_history_and_settings(self):
        csv=self.root/'table.csv';csv.write_text('label,value\ncontrol,1\ntest,2\n')
        m.contribute(self.path,entry(),attachment_paths=[csv])
        revised=m.read(self.path)['entries'][0];revised['body']='Revised observation'
        m.contribute(self.path,revised,replace=True)
        before=m.read(self.path)
        before['workspace']=dict(bookmarks=[revised['id']],views=[])
        before['draft']={**entry(),'id':'draft','created':revised['created'],'body':'Private draft'}
        baseline=self.root/'before.json';m.write(baseline,before);baseline_bytes=baseline.read_bytes()
        script=Path(__file__).parents[1]/'scripts/notebook.py'
        cmd=[sys.executable,str(script),'--notebook',str(self.path),'verify-preservation',str(baseline)]
        self.path.write_text(json.dumps(before,sort_keys=True))
        result=subprocess.run(cmd,text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(json.loads(result.stdout),dict(preserved=True,entries=1,attachments=1,revisions=1,new_entries=0))
        extra={**entry(),'id':'new-entry','created':revised['created']}
        added=json.loads(json.dumps(before));added['entries'].append(extra);m.write(self.path,added)
        result=subprocess.run(cmd,text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(json.loads(result.stdout)['new_entries'],1)
        for change in ['missing entry','replaced ID','changed body','missing attachment','changed attachment bytes','missing history','changed draft','missing settings','bad checksum']:
            candidate=json.loads(json.dumps(before))
            if change=='missing entry':candidate['entries']=[]
            elif change=='replaced ID':candidate['entries'][0]['id']='replacement'
            elif change=='changed body':candidate['entries'][0]['body']='Different observation'
            elif change=='missing attachment':candidate['entries'][0]['attachments']=[]
            elif change=='changed attachment bytes':
                other=self.root/'other.csv';other.write_text('label,value\ncontrol,99\n')
                candidate['entries'][0]['attachments']=[m.attach(other)]
            elif change=='missing history':candidate['entries'][0]['revisions']=[]
            elif change=='changed draft':candidate['draft']=None
            elif change=='missing settings':del candidate['workspace']
            elif change=='bad checksum':candidate['entries'][0]['attachments'][0]['sha256']='invalid'
            with self.subTest(change=change):
                self.path.write_text(json.dumps(candidate));after_bytes=self.path.read_bytes()
                result=subprocess.run(cmd,text=True,capture_output=True)
                self.assertEqual(result.returncode,1,result.stdout)
                self.assertIn('error',json.loads(result.stderr))
                self.assertEqual(self.path.read_bytes(),after_bytes)
                self.assertEqual(baseline.read_bytes(),baseline_bytes)
    def test_preservation_gate_rejects_empty_missing_and_same_file_baselines(self):
        script=Path(__file__).parents[1]/'scripts/notebook.py'
        baseline=self.root/'before.json'
        cmd=[sys.executable,str(script),'--notebook',str(self.path),'verify-preservation',str(baseline)]
        result=subprocess.run(cmd,text=True,capture_output=True)
        self.assertEqual(result.returncode,1);self.assertFalse(self.path.exists());self.assertFalse(baseline.exists())
        m.write(baseline,m.blank());m.write(self.path,m.blank())
        result=subprocess.run(cmd,text=True,capture_output=True)
        self.assertEqual(result.returncode,1);self.assertIn('baseline is empty',json.loads(result.stderr)['error'])
        m.contribute(self.path,entry())
        result=subprocess.run(cmd[:-1]+[str(self.path)],text=True,capture_output=True)
        self.assertEqual(result.returncode,1);self.assertIn('separate',json.loads(result.stderr)['error'])
    def test_api_conflicts_origin_and_static_isolation(self):
        static=self.root/'dist';static.mkdir();(static/'index.html').write_text('Notebook')
        m.contribute(self.path,entry())
        server=m.ThreadingHTTPServer(('127.0.0.1',0),m.Handler);server.static_root=static;server.notebook_path=self.path
        t=threading.Thread(target=server.serve_forever);t.start()
        try:
            url=f'http://127.0.0.1:{server.server_port}'
            r=urllib.request.urlopen(url+'/api/notebook');tag=r.headers['ETag'];data=json.load(r)
            revised=entry();revised['id']='entry-b';m.contribute(self.path,revised)
            request=urllib.request.Request(url+'/api/notebook',json.dumps(data).encode(),method='PUT',headers={'Content-Type':'application/json','If-Match':tag})
            with self.assertRaises(urllib.error.HTTPError) as ctx:urllib.request.urlopen(request)
            self.assertEqual(ctx.exception.code,412)
            request.add_header('Origin','https://foreign.example')
            with self.assertRaises(urllib.error.HTTPError) as ctx:urllib.request.urlopen(request)
            self.assertEqual(ctx.exception.code,403)
            with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(url+'/private/notebook.json')
            self.assertEqual(len(m.read(self.path)['entries']),2)
        finally:server.shutdown();server.server_close();t.join()

if __name__=='__main__':unittest.main()
