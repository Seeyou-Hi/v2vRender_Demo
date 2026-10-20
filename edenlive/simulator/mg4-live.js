import * as T from './vendor/three.module.js';
import {getMG4Proxy} from './mg4-proxy.js';
import {makeCaptureCamera} from './data-capture.js';
export function installMG4Live(a){
 for(const id of ['backend-enabled','stream-start','reference-stream-start']){const el=document.getElementById(id);if(el){el.checked=false;el.disabled=true;el.title='此独立页面用于 MG4 输入采集；模型服务尚未连接';}}
 const panel=document.createElement('section');panel.style.cssText='position:fixed;right:12px;bottom:12px;width:360px;z-index:20;background:#171b21;color:#eee;padding:10px;border:1px solid #627887;border-radius:8px';panel.innerHTML='<label><input type="checkbox" id="mg4-live-enabled" checked> MG4 三维代理预览</label><small style="display:block">当前为输入预览；尚未连接 MG4 生成服务</small><a href="/experiments/prompt.txt" target="_blank" style="color:#a8d4ef">查看固定渲染提示词</a><div id="mg4-canvas"></div><small id="mg4-status"></small>';document.body.append(panel);
 const r=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:false});r.setPixelRatio(1);r.setSize(864,480);r.domElement.style.cssText='width:100%;height:auto;display:block';panel.querySelector('#mg4-canvas').append(r.domElement);
 const proxy=getMG4Proxy(a.scene,a.arms,a.blocks),camera=makeCaptureCamera('ext1',864,480,a.arms);let seq=0,last=0;
 const api={canvas:r.domElement,format:proxy.format,sequence:0,timestamp_ms:0,renderNow(){proxy.render(r,camera);api.sequence=++seq;api.timestamp_ms=performance.now();return {sequence:seq,timestamp_ms:api.timestamp_ms,objects:a.blocks.map(b=>({label:b.label,position:b.mesh.position.toArray(),quaternion:b.mesh.quaternion.toArray(),held_by:a.arms.findIndex(x=>x.held===b)}))};},captureStream(fps=30){if(!Number.isFinite(fps)||fps<=0||fps>60)throw Error('fps must be 1..60');return r.domElement.captureStream(fps);},sample(){const stamp=api.renderNow();return proxy.capture(r,camera,864,480).then(rgb=>({...stamp,rgb,width:864,height:480}));}};
 window.armatureMG4=api;
 function tick(now){requestAnimationFrame(tick);if(!panel.querySelector('input').checked||document.hidden||now-last<1000/30)return;last=now;api.renderNow();panel.querySelector('#mg4-status').textContent='864 × 480 · 输入帧 '+seq+' · 目标 30 FPS（实际取决于设备）';}requestAnimationFrame(tick);return api;
}
