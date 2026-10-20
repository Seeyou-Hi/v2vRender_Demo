const keys=new Set(),events=[],actions=[];let sequence=0;
const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ext/arm/control`);
function send(){if(ws.readyState===1&&ws.bufferedAmount<8192)ws.send(JSON.stringify({sequence:++sequence,keys:[...keys],events:events.splice(0,32),actions:actions.splice(0,16)}));}
window.armRemoteEvent=e=>{events.push(e);send();};window.armRemoteKey=(key,down)=>{down?keys.add(key.toLowerCase()):keys.delete(key.toLowerCase());send();};window.armRemoteClear=()=>{keys.clear();send();};window.armRemoteReady=()=>{};
ws.onmessage=e=>{const s=JSON.parse(e.data),w=document.getElementById('arm').contentWindow;w.armRemoteState=s;w.armRemoteView?.applyState?.(s);if(s.ui)w.armRemoteView?.apply?.(s.ui);document.getElementById('state').textContent=`输入帧 ${s.frame} · 控制序号 ${s.input_sequence}`;};
ws.onclose=()=>document.getElementById('state').textContent='控制连接已断开';setInterval(send,200);window.addEventListener('blur',window.armRemoteClear);

document.getElementById('model').addEventListener('load',()=>{const d=document.getElementById('model').contentDocument;if(!d)return;const style=d.createElement('style');style.textContent='.wb,.wb-modal,.wb-endbar{display:none!important}body.wb-on .layout,body.wb-on:not(.wb-play) .layout,body.wb-play.wb-starting .layout{visibility:visible!important}main.layout{display:block!important;height:95vh!important}.panel:not(.model){display:none!important}.panel.model{height:100%!important}.model-stage{height:90%!important}#video{width:100%!important;height:100%!important;object-fit:contain!important}';d.head.append(style);});

let modelBusy=false;
async function modelCommand(path,body){
 if(modelBusy)return;modelBusy=true;document.getElementById('start-model').disabled=true;document.getElementById('stop-model').disabled=true;
 const status=document.getElementById('generation-status');
 try{
  status.textContent=path==='home'?'正在停止，等待当前 chunk 结束…':'正在开始新一轮…';
  if(path==='home'){keys.clear();events.length=0;actions.length=0;send();}
  if(path==='switch'){
   let ready=false;for(let i=0;i<120;i++){try{ready=document.getElementById('model').contentWindow.eval('typeof peer!=="undefined"&&peer&&peer.connectionState==="connected"');}catch(e){}if(ready)break;status.textContent='等待视频连接与后端就绪…';await new Promise(r=>setTimeout(r,500));}
   if(!ready)throw Error('视频连接尚未就绪，请稍后重试');await new Promise(r=>setTimeout(r,500));
  }
  if(path==='switch'){const mode=await fetch('/ext/arm/prompt-mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dynamic:document.getElementById('dynamic-prompt').checked})});if(!mode.ok)throw Error('动作提示词设置失败');}
  const r=await fetch('/ext/game2v/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
  if(!r.ok)throw Error(await r.text());
  if(path==='home'){
   let stopped=false;for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,500));const m=await(await fetch('/ext/game2v/metrics')).json();if(!m.model){stopped=true;break;}}
   status.textContent=stopped?'已停止生成；模型常驻，点击开始可重启':'仍在等待当前 chunk 结束，请稍候';
  }else status.textContent='已请求开始；等待生成画面';
 }catch(e){status.textContent='操作失败：'+e.message;}finally{modelBusy=false;document.getElementById('start-model').disabled=false;document.getElementById('stop-model').disabled=false;}
}
window.restartArmModel=()=>modelCommand('switch',{slug:document.getElementById('render-mode').value,restart:true});
window.stopArmModel=()=>modelCommand('home');

window.armLatencyHints=[];
setInterval(()=>{try{const w=document.getElementById('model').contentWindow;const receivers=w.eval('typeof peer!=="undefined"&&peer ? peer.getReceivers() : []');window.armLatencyHints=receivers.map(r=>{let hint='unsupported';if('jitterBufferTarget'in r){r.jitterBufferTarget=0;hint='jitterBufferTarget=0ms';}else if('playoutDelayHint'in r){r.playoutDelayHint=0;hint='playoutDelayHint=0s';}return hint;});}catch(e){}},1000);

setInterval(async()=>{if(modelBusy)return;try{const m=await(await fetch('/ext/game2v/metrics')).json();const el=document.getElementById('generation-status');if(m.model)el.textContent='生成中';}catch(e){}},2000);

setInterval(async()=>{try{const s=await(await fetch('/ext/arm/prompt-state')).json();const p=s.prompt;document.getElementById('prompt-state').textContent=p?`输入帧 ${p.first_frame}–${p.last_frame} · chunk ${p.ar_index} · 文本编码 ${(p.text_encode_s*1000).toFixed(1)} ms\n${p.active_prompt}`:'等待开始';}catch(e){}},1000);
