"""Line-safe byte transport for Slurm's line-buffered stdio; no frame awareness."""
import os,sys,subprocess,threading,base64
mode=sys.argv[1];assert mode in ('client','server')
ready=threading.Event()
if mode=='server':
 if os.isatty(0):
  import tty
  tty.setraw(0)
 os.write(1,b'EDEN_READY\n')
 ready.set()
assert sys.argv[2]=='--'
p=subprocess.Popen(sys.argv[3:],stdin=subprocess.PIPE,stdout=subprocess.PIPE,bufsize=0)
def encoded(src,dst):
 ready.wait()
 try:
  while True:
   data=os.read(src,16384)
   if not data:break
   data=b'EDNB64:'+base64.b64encode(data)+b'\n'
   while data:
    n=os.write(dst,data);data=data[n:]
 except (BrokenPipeError,OSError):pass
 finally:
  try:os.close(dst)
  except OSError:pass
def decoded(src,dst):
 try:
  with os.fdopen(os.dup(src),'rb',buffering=65536) as f:
   while True:
    line=f.readline(32769)
    if not line:break
    if len(line)>32768:raise ValueError('Oversized transport line')
    if line.strip()==b'EDEN_READY':ready.set();continue
    if not line.startswith(b'EDNB64:'):
     os.write(2,b'PLATFORM: '+line);continue
    data=base64.b64decode(line[7:].strip(),validate=True)
    while data:
     n=os.write(dst,data);data=data[n:]
 except (BrokenPipeError,OSError):pass
 finally:
  try:os.close(dst)
  except OSError:pass
a,b=(encoded,decoded) if mode=='client' else (decoded,encoded)
threading.Thread(target=a,args=(0,p.stdin.fileno()),daemon=True).start()
threading.Thread(target=b,args=(p.stdout.fileno(),1),daemon=True).start()
try:sys.exit(p.wait())
finally:
 if p.poll() is None:p.terminate()
