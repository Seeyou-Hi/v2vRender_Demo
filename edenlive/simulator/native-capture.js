import * as T from './vendor/three.module.js';
import {getMG4Proxy} from './mg4-proxy.js';
import {makeCaptureCamera} from './data-capture.js';
import {flipRows} from './gpu-frame-resolver.js';
export function installNativeCapture(a,ctx){
 document.body.style.display='none';
 const W=1280,H=704,renderer=a.renderer,viewport=document.querySelector('#viewport');
 Object.assign(viewport.style,{width:W+'px',height:H+'px',minHeight:H+'px',flex:'none'});
 renderer.setPixelRatio(1);renderer.setSize(W,H);renderer.shadowMap.enabled=false;
 const semantic=new URLSearchParams(location.search).get('proxy')==='semantic',proxy=semantic?getMG4Proxy(a.scene,a.arms,a.blocks):null;
 const camera=makeCaptureCamera('ext1',W,H,a.arms),gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
 const name=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
 // Match the offline first frame: original 1280x720 camera, center-cropped to704.
 camera.fov=2*Math.atan(Math.tan(38*Math.PI/360)*704/720)*180/Math.PI;camera.updateProjectionMatrix();
 ctx.view('ext1');let simNow=performance.now(),previous=new Set(),accumulator=0;
 renderer.domElement.setPointerCapture=()=>{};
 const textIds=['view-name','action','score','cx','cy','cz','control-note','grasp-status','contact-status','solver-note','held','gripper-note','physics-status','asset-note','item-note','speed-value','toast','demo-status','demo-caption','demo-count','demo-play'];
 const valueIds=['solver-kind','gripper-kind','item-kind','item-style','physics-enabled','hold-orientation','speed','trail-toggle','grid-toggle','demo-loop','wrist-arm'];
 function snapshot(){return {disabled:Object.fromEntries(['reset','demo-mode','demo-play','demo-replay','demo-exit','grip','position-control','downward'].map(id=>[id,document.getElementById(id).disabled])),jointDisabled:[...document.querySelectorAll('[data-joint]')].map(el=>el.disabled),text:Object.fromEntries(textIds.map(id=>{const el=document.getElementById(id);return[id,{text:el.textContent,className:el.className}];})),values:Object.fromEntries(valueIds.map(id=>{const el=document.getElementById(id);return[id,{value:el.value,checked:el.checked,disabled:el.disabled}];})),angles:a.arms.map(x=>x.angles.map(v=>v*180/Math.PI)),active:ctx.active(),grip:document.querySelector('#grip span').textContent,positionDisabled:document.querySelector('#position-control').disabled,guide:document.querySelector('#guide').open,demo:!document.querySelector('#demo-controls').hidden,progress:document.querySelector('#progress').style.width,demoProgress:document.querySelector('#demo-progress').style.width,view:document.querySelector('[data-view].active')?.dataset.view};}
 function event(e){
  if(e.type.startsWith('pointer')||e.type==='wheel'){
   const el=renderer.domElement,r=el.getBoundingClientRect(),init={bubbles:true,cancelable:true,clientX:r.left+e.x*r.width,clientY:r.top+e.y*r.height,pointerId:1,button:0,buttons:e.buttons||0,deltaY:e.delta||0};
   el.dispatchEvent(e.type==='wheel'?new WheelEvent(e.type,init):new PointerEvent(e.type,init));return;
  }
  const el=e.arm!==undefined?document.querySelector(`[data-arm="${e.arm}"]`):e.view?document.querySelector(`[data-view="${e.view}"]`):e.joint!==undefined?document.querySelector(`[data-joint="${e.joint}"]`):document.getElementById(e.id);
  if(!el||el.disabled)return;
  if(e.value!==undefined)el.value=e.value;if(e.checked!==undefined)el.checked=e.checked;
  if(e.type==='click')el.click();else el.dispatchEvent(new Event(e.type,{bubbles:true}));
 }
 const captureTarget=new T.WebGLRenderTarget(W,H);captureTarget.texture.colorSpace=T.SRGBColorSpace;const capturePixels=new Uint8Array(W*H*4);
 const ws=new WebSocket(`ws://${location.host}/capture`);ws.binaryType='arraybuffer';
 ws.onopen=()=>ws.send(JSON.stringify({type:'hello',proxy:semantic?'semantic':'rgb',renderer:name,width:W,height:H,hardware:!/swiftshader|llvmpipe|softpipe|software/i.test(name)}));
 ws.onmessage=async message=>{try{
  const msg=JSON.parse(message.data);if(msg.type!=='frame')return;
  const started=performance.now(),c=msg.controls||{},held=new Set(c.keys||[]);
  for(const key of previous)if(!held.has(key))viewport.dispatchEvent(new KeyboardEvent('keyup',{key,bubbles:true}));
  for(const key of held)if(!previous.has(key))viewport.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));previous=held;
  if(c.arm!==undefined)ctx.select(c.arm);
  for(const e of c.events||[])event(e);
  for(const action of c.actions||[]){if(action==='grip')a.grip(c.arm??ctx.active());if(action==='reset'){if(a.demo.active)a.leaveDemo();a.reset();}if(action==='downward')document.querySelector('#downward').click();if(action==='demo')a.enterDemo();if(action==='manual')a.leaveDemo();}
  // Original solver/physics at fixed 60 Hz, independent of model throughput.
  accumulator+=1000/msg.fps;while(accumulator+1e-5>=1000/60){simNow+=1000/60;ctx.step(simNow);accumulator-=1000/60;}
  const stamp={demo:{state:a.demo.state,phase:a.demo.phase,title:a.demo.title,completed:a.demo.completed},proxy:semantic?'semantic':'rgb',renderer:name,hardware:!/swiftshader|llvmpipe|softpipe|software/i.test(name),simulation_ms:performance.now()-started,frame:msg.frame,simulation_time:(msg.frame+1)/msg.fps,input_sequence:c.sequence||0,
   objects:a.blocks.map(b=>({label:b.label,support_height:b.halfHeight,position:b.mesh.position.toArray(),quaternion:b.mesh.quaternion.toArray(),held_by:a.arms.findIndex(x=>x.held===b)})),arms:a.arms.map(x=>({tcp:x.actual.toArray(),closed:x.closed,opening:x.gripper.opening,contact:x.contactUntil>performance.now(),angles:x.angles,controlMode:x.controlMode,solver:x.solverKind})),...(true?{ui:snapshot()}:{})};
  const old=renderer.getRenderTarget();if(semantic){proxy.render(renderer,camera,captureTarget);}else{renderer.setRenderTarget(captureTarget);renderer.render(a.scene,camera);}renderer.readRenderTargetPixels(captureTarget,0,0,W,H,capturePixels);renderer.setRenderTarget(old);const pair=flipRows(capturePixels,W,H);
  stamp.capture_ms=performance.now()-started;ws.send(JSON.stringify(stamp));ws.send(pair.buffer);
 }catch(e){ws.send(JSON.stringify({type:'error',error:String(e),stack:e.stack}));}};
 window.nativeArm={a,renderer:name,ctx};
}
