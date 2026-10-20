window.MG4_REMOTE=new URLSearchParams(location.search).has('remote');
import {installRemoteScene} from './remote-scene.js';
window.MG4_MANUAL=true;
import {installNativeCapture} from './native-capture.js';
import {installReferenceFrame} from './reference-frame.js';
import {installStreamCapture} from './stream-capture.js';
import * as T from './vendor/three.module.js';
import {makeCaptureCamera,installDataCapture} from './data-capture.js';
import {createRoboTwinTable,loadRoboTwinTableTexture} from './robotwin-table.js';
import {loadTableAssets} from './table-assets.js';
import {installVideoRecording} from './video.js';
import {toggleGripper} from './grasp-actions.js';
import {loadPhysics,PhysicsWorld,physicsInfo} from './physics.js';
import {planPickup} from './grasp-planner.js';
import {DemoController} from './demo.js';
import {loadRobotGeometry,createRobot,solveRobot,initialAngles,applyAngles,setRobotGripper,updateGripper,setJointTarget,resumePosition} from './robot-model.js';
import {CollisionWorld,followHeld} from './collision.js';
import {createTableItems,disposeTableItem,itemSets} from './table-items.js';
import {loadGripperAssets,gripperTypes} from './grippers.js';
import {solverTypes,selectSolver} from './solvers.js';
const $=s=>document.querySelector(s), viewport=$('#viewport');
let renderer;
try{renderer=new T.WebGLRenderer({antialias:true});}catch(e){$('#loading').textContent='无法启动 WebGL，请启用浏览器硬件加速后刷新。';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;viewport.appendChild(renderer.domElement);$('#loading').textContent='正在加载 UR5 工业六轴模型…';
const scene=new T.Scene();scene.background=new T.Color('#292d33');scene.fog=new T.Fog('#292d33',13,28);const camera=new T.PerspectiveCamera(38,1,.1,60);
scene.add(new T.HemisphereLight(0xc9daec,0x41404a,2.3));const sun=new T.DirectionalLight(0xffe4cb,4);sun.position.set(1,8,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-6});sun.shadow.bias=-.001;scene.add(sun);const fill=new T.DirectionalLight(0xadcfff,2);fill.position.set(-5,3,-3);scene.add(fill);
const mat=(color,metalness=.1,roughness=.55)=>new T.MeshStandardMaterial({color,metalness,roughness});const orange=mat('#dca174',.55,.34),blue=mat('#90b3c9',.55,.35),dark=mat('#2a3038',.65,.32),metal=mat('#a8afb5',.8,.32),white=mat('#d5d5cd',.1,.7);
function mesh(g,m,parent=scene,pos=[0,0,0]){const o=new T.Mesh(g,m);o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
const solidMeshes=[];let captureStatic=true;
function box(w,h,d,m,parent=scene,pos){const object=mesh(new T.BoxGeometry(w,h,d),m,parent,pos);if(captureStatic&&parent===scene)solidMeshes.push(object);return object;}
function cylinder(r,h,m,parent=scene,pos){return mesh(new T.CylinderGeometry(r,r,h,48),m,parent,pos);}
const tableAsset=createRoboTwinTable(await loadRoboTwinTableTexture(renderer));scene.add(tableAsset.root);solidMeshes.push(...tableAsset.parts);const table=tableAsset.tabletop;
const floor=box(100,.1,100,mat('#292d33'),scene,[0,tableAsset.floorTop-.05,0]);
captureStatic=false;
const grid=new T.GridHelper(6.4,32,0x9b9d97,0xb7b9b2);grid.position.y=.003;grid.scale.z=4.6/6.4;grid.material.transparent=true;grid.material.opacity=.36;scene.add(grid);
const worldGrid=new T.GridHelper(40,40,0x41474f,0x343941);worldGrid.position.y=tableAsset.floorTop+.004;scene.add(worldGrid);
function line(points,color,parent=scene){const o=new T.Line(new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(...p))),new T.LineBasicMaterial({color,transparent:true,opacity:.7}));parent.add(o);return o;}
line([[-3.2,.007,0],[3.2,.007,0]],0xbe7f79);line([[0,.008,-2.3],[0,.008,2.3]],0x7490af);
const zones=[{x:1.65,z:-.85,color:0xd69766},{x:-1.65,z:-.85,color:0x85abc6}];for(const zone of zones){const pad=box(.75,.018,.75,mat(zone.color),scene,[zone.x,.015,zone.z]);pad.material.transparent=true;pad.material.opacity=.2;line([[zone.x-.39,.032,zone.z-.39],[zone.x+.39,.032,zone.z-.39],[zone.x+.39,.032,zone.z+.39],[zone.x-.39,.032,zone.z+.39],[zone.x-.39,.032,zone.z-.39]],zone.color);}
function label(text,x,z,color){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.font='500 36px monospace';ctx.textAlign='center';ctx.fillText(text,256,76);const tex=new T.CanvasTexture(c);const o=new T.Mesh(new T.PlaneGeometry(1.25,.31),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));o.rotation.x=-Math.PI/2;o.position.set(x,.035,z);o.userData.demoDecoration=true;scene.add(o);}
label('DROP / R',1.65,-1.45,'#956c4e');label('DROP / L',-1.65,-1.45,'#607f94');label('ARMATURE LAB',0,1.93,'#777c7c');
const arms=[];
let robotGeometry,defaultGripper;
try { [robotGeometry,defaultGripper]=await Promise.all([loadRobotGeometry(),loadGripperAssets('robotiq'),loadTableAssets('drinks')]); } catch(error) { $('#loading').textContent='机械臂模型加载失败，请通过本地服务打开项目并刷新。'; throw error; }
for(const [base,index] of [[2.5,0],[-2.5,1]]) {
  const a=createRobot(base,index,robotGeometry);scene.add(a.root);
  a.trail=line([],index?0x88aeca:0xdca174);a.history=[];
  a.ring=new T.Mesh(new T.RingGeometry(.13,.15,40),new T.MeshBasicMaterial({color:index?0x88aeca:0xdca174,side:T.DoubleSide,transparent:true,opacity:.6}));
  a.ring.rotation.x=-Math.PI/2;scene.add(a.ring);setRobotGripper(a,'robotiq',defaultGripper);solveRobot(a,120);selectSolver(a,'ur');arms.push(a);
}
$('#loading').remove();
const blocks=createTableItems('drinks','robotwin');blocks.forEach(b=>{b.mesh.quaternion.copy(arms[b.zone].hand.getWorldQuaternion(new T.Quaternion())).multiply(b.holdRotation);scene.add(b.mesh);});
const collisionWorld=new CollisionWorld(arms,blocks,solidMeshes);
let physics=null;
let offlineRendering=false;
let mainView='perspective',active=0,speed=1,stopped=false;const keys=new Set();let azimuth=.4,elevation=.66,distance=10.8;let dragging=null,last=performance.now(),frameCount=0,fpsTime=last;const look=new T.Vector3(0,.55,0);let toastTimer;
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600);}
function contact(a,event){
  let detail=event.detail||(physics?.enabled&&event.kind==='object'?'物理接触 · 物品参与动力学':'已停止靠近');
  if(event.kind==='object'&&!a.closed){
    if(!a.graspContactHintAt||performance.now()-a.graspContactHintAt>250||a.graspContactLabel!==event.label){
      const item=blocks.find(b=>b.label===event.label),status=item?collisionWorld.inspectGrasp(a,item):null;
      a.graspContactHint=status?.message||'请将物品移入两指有效夹持区';a.graspContactHintAt=performance.now();a.graspContactLabel=event.label;
    }detail=a.graspContactHint;
  }
  const message=(a.index?'左臂':'右臂')+' · '+event.part+'触碰 '+event.label+' · '+detail;
  a.contactUntil=performance.now()+1200;a.contactText=message;
  a.ring.material.color.set(0xe76d62);
  if(a.lastContact!==message||performance.now()-(a.lastContactAt||0)>1800){toast(message);a.lastContact=message;a.lastContactAt=performance.now();}
}
function solve(a,dt){if((a.contactUntil||0)<performance.now())a.ring.material.color.set(a.index?0x88aeca:0xdca174);solveRobot(a,12,dt,arm=>collisionWorld.check(arm));if(a.collisionReport)contact(a,a.collisionReport);a.ring.position.set(a.actual.x,.035,a.actual.z);followHeld(a);}
function scoreQuiet(){const n=blocks.filter(b=>{const z=zones[b.zone];return !arms.some(a=>a.held===b)&&Math.hypot(b.mesh.position.x-z.x,b.mesh.position.z-z.z)<.3&&b.mesh.position.y<b.halfHeight+.04}).length;$('#score').textContent=n+' / 2';$('#progress').style.width=n*50+'%';}
function score(){const n=blocks.filter(b=>{const z=zones[b.zone];return !arms.some(a=>a.held===b)&&Math.hypot(b.mesh.position.x-z.x,b.mesh.position.z-z.z)<.3&&b.mesh.position.y<b.halfHeight+.04}).length;$('#score').textContent=n+' / 2';$('#progress').style.width=n*50+'%';if(n===2)toast('任务完成！两件物品都已放入目标区。');}
function grip(index){
 nextGraspUI=0;
 const a=arms[index],result=toggleGripper(a,blocks,collisionWorld);
 if(!result.ok){if(result.event)contact(a,result.event);else toast(result.reason);updatePanel();return result;}
 if(result.opening){score();if(!demo?.active)toast('夹爪开启 · 物品落下');}
 else if(result.item){if(!demo?.active)toast((index?'左臂':'右臂')+'正在闭合夹爪 · '+result.item.label);}
 else if(!demo?.active)toast('夹爪已闭合 · 对齐物品后重新抓取');
 updatePanel();return result;
}
let nextGraspUI=0,lastGraspArm=-1;
function updateGraspUI(){
 const now=performance.now();if(now<nextGraspUI&&lastGraspArm===active)return;nextGraspUI=now+250;lastGraspArm=active;
 const a=arms[active],el=$('#grasp-status');if(a.held){el.textContent=a.grasp?.centeringBlocked?'夹指推动受阻 · 已停止闭合，可松开调整':a.grasp?.closing?'夹爪正在闭合 · 接触后将物品推向两指中央':'双指辅助夹持 · 保持物品当前姿态';el.classList.toggle('grasp-ready',!a.grasp?.centeringBlocked);return;}
 const item=blocks.filter(b=>!arms.some(other=>other.held===b)).sort((x,y)=>x.mesh.position.distanceToSquared(a.actual)-y.mesh.position.distanceToSquared(a.actual))[0];
 if(!item){el.textContent='抓取与碰撞共用接触网格 · 请靠近物品';el.classList.remove('grasp-ready');return;}
 const status=collisionWorld.inspectGrasp(a,item);el.textContent=item.label+' · '+status.message;el.classList.toggle('grasp-ready',status.ready);
}
function updatePanel(){updateGraspUI();const a=arms[active];['x','y','z'].forEach(k=>$('#c'+k).textContent=a.actual[k].toFixed(2));a.angles.forEach((v,i)=>{const row=document.querySelectorAll('.joint')[i];row.querySelector('b').textContent=Math.round(v*180/Math.PI)+'°';const input=row.querySelector('input');if(document.activeElement!==input||a.collisionReport)input.value=v*180/Math.PI;});$('#grip span').textContent=a.closed?'夹爪闭合':'夹爪开启';$('#contact-status').textContent=a.contactUntil>performance.now()?a.contactText:'碰撞保护已启用';$('#contact-status').classList.toggle('contact-warning',a.contactUntil>performance.now());$('#control-note').textContent=a.controlMode==='joint'?'关节控制 · 当前朝向自由':a.controlMode==='align'?'正在平滑恢复朝下姿态…':a.orientationHold?'位置控制 · 保持当前朝向':'位置控制 · 拖动角度可切换关节控制';$('#position-control').disabled=a.controlMode==='position';$('#solver-note').textContent=(a.solverKind==='current'&&a.orientationHold?'朝向保持 · 使用 UR 解析姿态求解':solverTypes[a.solverKind].note)+(a.solverResult?.converged===false?' · 目标不可达，已停止':'');$('#held').textContent=a.held?'正在抓取 '+a.held.label:'当前未抓取物体';}
$('#joints').innerHTML=['J1 基座','J2 肩部','J3 肘部','J4 腕部','J5 腕部','J6 法兰'].map(s=>`<div class="joint"><span>${s}</span><input type="range" min="-360" max="360" step="0.1" value="0" aria-label="${s} 角度" data-joint="${['J1 基座','J2 肩部','J3 肘部','J4 腕部','J5 腕部','J6 法兰'].indexOf(s)}"><b>0°</b></div>`).join('');
document.querySelectorAll('[data-joint]').forEach(input=>input.addEventListener('input',()=>{keys.clear();if(+input.dataset.joint>=3)arms[active].orientationHold=$('#hold-orientation').checked;setJointTarget(arms[active],+input.dataset.joint,+input.value*Math.PI/180);}));
$('#position-control').onclick=()=>{keys.clear();resumePosition(arms[active]);updatePanel();};
$('#solver-kind').onchange=e=>{keys.clear();arms.forEach(a=>selectSolver(a,e.target.value));toast('已切换为'+solverTypes[e.target.value].name+' · 保留当前姿态');updatePanel();};
function select(i){active=i;document.querySelectorAll('[data-arm]').forEach(b=>b.classList.toggle('active',+b.dataset.arm===i));updatePanel();}document.querySelectorAll('[data-arm]').forEach(b=>b.onclick=()=>select(+b.dataset.arm));$('#grip').onclick=()=>grip(active);
function view(v){mainView=v;camera.aspect=viewport.clientWidth/viewport.clientHeight;if(v==='top'){azimuth=0;elevation=1.55;distance=11;}else if(v==='front'){azimuth=0;elevation=.22;distance=11;}else{azimuth=.4;elevation=.66;distance=10.8;}document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$('#view-name').textContent={top:'顶视图',front:'正视图',perspective:'自由视角',wrist:'wrist · 腕部朝下',ext1:'ext1 · 固定正面'}[v];}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
function reset(){keys.clear();arms.forEach(a=>{a.target.set(a.index?-.95:.95,.8,.75);a.closed=false;a.held=null;a.grasp=null;a.contactUntil=0;a.lastContact=null;a.history=[];a.ring.material.color.set(a.index?0x88aeca:0xdca174);a.trail.geometry.dispose();a.trail.geometry=new T.BufferGeometry();a.angles=[...initialAngles];a.controlMode='position';a.orientationHold=false;a.needsAlignment=false;a.solverResult=null;a.positionOrientation=null;a.repositoryChain=null;solveRobot(a,120);});blocks.forEach(b=>{b.mesh.position.set(...b.start);b.mesh.quaternion.copy(arms[b.zone].hand.getWorldQuaternion(new T.Quaternion())).multiply(b.holdRotation);b.fallSpeed=0;});if(physics){physics.assistedApproach=false;physics.rebuild();physics.settle();}score();updatePanel();toast('场景已重置');}$('#reset').onclick=reset;
let currentItems='drinks',currentStyle='robotwin',assetsBusy=false;
async function switchItems(kind,style=$('#item-style').value){
  if(assetsBusy)return;
  assetsBusy=true;keys.clear();stopped=true;
  document.querySelectorAll('#item-kind,#item-style,#gripper-kind,#demo-mode,#physics-enabled').forEach(el=>el.disabled=true);
  try{if(style==='robotwin'){toast('正在加载 RoboTwin 物体资产…');await loadTableAssets(kind);}
  applyItems(kind,style);currentItems=kind;currentStyle=style;
  $('#asset-note').textContent=style==='robotwin'?(kind==='blocks'||kind==='pens'?'该物品使用原始模型':kind==='mixed'?'RoboTwin 苹果 · 原始钢笔':'RoboTwin 官方物体资产'):'原始几何模型';
  }catch(error){$('#item-kind').value=currentItems;$('#item-style').value=currentStyle;toast('物体资产加载失败，请重试');console.error(error);}
  finally{assetsBusy=false;stopped=false;document.querySelectorAll('#item-kind,#item-style,#gripper-kind,#demo-mode,#physics-enabled').forEach(el=>el.disabled=false);}
}
function applyItems(kind,style){
  if(!itemSets[kind])return;
  keys.clear();arms.forEach(a=>{a.held=null;a.grasp=null;a.closed=false;});
  blocks.forEach(b=>{scene.remove(b.mesh);disposeTableItem(b);});
  blocks.splice(0,blocks.length,...createTableItems(kind,style));
  blocks.forEach(b=>{b.mesh.quaternion.copy(arms[b.zone].hand.getWorldQuaternion(new T.Quaternion())).multiply(b.holdRotation);scene.add(b.mesh);});collisionWorld.replaceObjects();
  reset();$('#item-note').textContent=blocks.map(b=>b.label).join(' · ');
  toast('已切换为'+itemSets[kind].name+' · 实验重新开始');
}
$('#item-kind').onchange=e=>switchItems(e.target.value);
$('#item-style').onchange=e=>switchItems($('#item-kind').value,e.target.value);
let currentGripper='robotiq';
async function switchGripper(kind){
 if(!gripperTypes[kind]||kind===currentGripper)return;
 keys.clear();stopped=true;document.querySelectorAll('#gripper-kind,#item-kind,#item-style,#demo-mode,#physics-enabled').forEach(el=>el.disabled=true);toast('正在加载'+gripperTypes[kind].name+'…');
 try{
  const assets=await loadGripperAssets(kind);
  arms.forEach(a=>setRobotGripper(a,kind,assets));
  currentGripper=kind;collisionWorld.rebuildParts();reset();
  $('#gripper-note').textContent=kind==='original'?'自建几何体 · 两臂同步切换':'公开仓库模型 · 联动夹指';
  toast('已切换为'+gripperTypes[kind].name+' · 实验重新开始');
 }catch(error){$('#gripper-kind').value=currentGripper;toast('夹爪模型加载失败，请刷新后重试');console.error(error);}
 finally{stopped=false;document.querySelectorAll('#gripper-kind,#item-kind,#item-style,#demo-mode,#physics-enabled').forEach(el=>el.disabled=false);}
}
$('#gripper-kind').onchange=e=>switchGripper(e.target.value);
$('#physics-enabled').onchange=async e=>{
 const enabled=e.target.checked;keys.clear();stopped=true;
 const controls=Array.from(document.querySelectorAll('button,input,select')).map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);
 $('#physics-status').textContent=enabled?'正在加载物理引擎…':'正在切换…';
 try{
  if(enabled){const R=await loadPhysics();physics=new PhysicsWorld(R,collisionWorld);collisionWorld.physics=physics;}
  else{physics?.dispose();physics=null;collisionWorld.physics=null;}
  reset();$('#physics-status').textContent=enabled?'已开启 · Rapier · 重力 / 摩擦 / 刚体碰撞':'已关闭 · 使用原有碰撞与下落逻辑';
  toast(enabled?'物理引擎已开启 · 场景已重置':'物理引擎已关闭 · 场景已重置');
 }catch(error){physics?.dispose();physics=null;collisionWorld.physics=null;e.target.checked=false;$('#physics-status').textContent='加载失败 · 已恢复原有模式，可重试';toast('物理引擎加载失败，继续使用原有模式');console.error(error);}
 finally{stopped=false;last=performance.now();controls.forEach(([el,disabled])=>el.disabled=disabled);}
};
$('#physics-enabled').disabled=false;
$('#speed').oninput=e=>{speed=+e.target.value;$('#speed-value').textContent=speed.toFixed(1)+'×';};function setGrid(v){grid.visible=worldGrid.visible=v;$('#grid-toggle').checked=v;}$('#grid-toggle').onchange=e=>setGrid(e.target.checked);$('#trail-toggle').onchange=e=>arms.forEach(a=>a.trail.visible=e.target.checked);
$('#help').onclick=()=>{keys.clear();$('#guide').showModal();};$('#close-help').onclick=()=>$('#guide').close();
const orientationKeys=new Set(['arrowup','arrowdown','arrowleft','arrowright','z','x']);
$('#downward').onclick=()=>{keys.clear();const a=arms[active];a.orientationHold=false;if(a.solverKind==='current'){a.controlMode='joint';resumePosition(a);}else{a.orientationHold=false;const kind=a.solverKind;a.solverKind='current';a.controlMode='joint';resumePosition(a);a.solverKind=kind;}updatePanel();};
$('#hold-orientation').onchange=e=>{arms.forEach(a=>{if(e.target.checked){if(a.controlMode==='joint')a.orientationHold=true;}else{a.orientationHold=false;if(a.solverKind==='current'&&a.controlMode==='position'){a.controlMode='joint';resumePosition(a);}}});};
const supported=new Set([...('wasdqefijkluohr123'.split('')),...orientationKeys]);window.addEventListener('keydown',e=>{if(demo.active||stopped||$('#guide').open||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;const k=e.key.toLowerCase();if(k==='tab'&&e.target===viewport){e.preventDefault();select(1-active);return;}if(!supported.has(k)&&k!=='shift')return;e.preventDefault();if(!e.repeat){if(orientationKeys.has(k)){const a=arms[active];a.orientationHold=$('#hold-orientation').checked;}if(k==='f')grip(1);if(k==='h')grip(0);if(k==='r')reset();if('123'.includes(k))view(['perspective','wrist','front'][+k-1]);}keys.add(k);document.querySelectorAll('kbd').forEach(el=>el.classList.toggle('pressed',keys.has(el.textContent.toLowerCase())));});window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());document.querySelectorAll('kbd').forEach(el=>el.classList.toggle('pressed',keys.has(el.textContent.toLowerCase())));});window.addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>keys.clear());
viewport.addEventListener('pointerdown',e=>{if(stopped||(mainView==='wrist'||mainView==='ext1')||e.target!==renderer.domElement)return;viewport.focus();dragging={x:e.clientX,y:e.clientY};viewport.setPointerCapture(e.pointerId);});viewport.addEventListener('pointermove',e=>{if(!dragging)return;azimuth-=(e.clientX-dragging.x)*.008;elevation=T.MathUtils.clamp(elevation+(e.clientY-dragging.y)*.006,.12,1.55);dragging={x:e.clientX,y:e.clientY};});viewport.addEventListener('pointerup',()=>dragging=null);viewport.addEventListener('pointercancel',()=>dragging=null);viewport.addEventListener('wheel',e=>{e.preventDefault();if(stopped||mainView==='wrist'||mainView==='ext1')return;distance=T.MathUtils.clamp(distance+e.deltaY*.006,5,19);},{passive:false});
if(!window.MG4_MANUAL||window.MG4_REMOTE)new ResizeObserver(()=>{renderer.setSize(viewport.clientWidth,viewport.clientHeight);camera.aspect=viewport.clientWidth/viewport.clientHeight;camera.updateProjectionMatrix();}).observe(viewport);
function animate(now){if(!window.MG4_MANUAL)requestAnimationFrame(animate);if(offlineRendering){last=now;return;}const dt=stopped||streamRender.isBackpressured()||demo.active&&!demo.playing?0:Math.min((now-last)/1000,.04);last=now;let moved=false;arms.forEach((a,i)=>{if(i===active&&!demo.active&&dt){const step=dt*.75*speed*(keys.has('shift')?.25:1);const directions=[(+keys.has('arrowup')-+keys.has('arrowdown')),(+keys.has('arrowright')-+keys.has('arrowleft')),(+keys.has('x')-+keys.has('z'))];directions.forEach((value,j)=>{if(value)setJointTarget(a,j+3,(a.controlMode==='joint'?a.jointTarget[j+3]:a.angles[j+3])+value*step);});}
const map=i?['w','s','a','d','q','e']:['i','k','j','l','u','o'];const step=dt*.75*speed*(keys.has('shift')?.25:1);const v=new T.Vector3((+keys.has(map[3])-+keys.has(map[2]))*step,(+keys.has(map[4])-+keys.has(map[5]))*step,(+keys.has(map[1])-+keys.has(map[0]))*step);if(!demo.active&&v.lengthSq()&&a.controlMode==='joint')resumePosition(a);if(!demo.active&&v.lengthSq()&&a.controlMode==='position'){a.target.add(v);a.target.y=T.MathUtils.clamp(a.target.y,.005,1.65);a.target.x=T.MathUtils.clamp(a.target.x,-3,3);a.target.z=T.MathUtils.clamp(a.target.z,-2,2);moved=true;}if(!demo.active||demo.playing)solve(a,dt);if(!demo.active&&v.lengthSq()&&(!a.history.length||a.history.at(-1).distanceTo(a.actual)>.025)){a.history.push(a.actual.clone());if(a.history.length>180)a.history.shift();a.trail.geometry.dispose();a.trail.geometry=new T.BufferGeometry().setFromPoints(a.history);} });if(physics?.enabled)physics.step(dt,contact);else collisionWorld.advanceObjects(dt,contact);scoreQuiet();demo.tick(dt);const wristView=mainView==='wrist',ext1View=mainView==='ext1';if(wristView||ext1View){const mounted=makeCaptureCamera(ext1View?'ext1':'wrist',ext1View?640:camera.aspect,ext1View?384:1,arms,Number($('#wrist-arm').value));camera.aspect=mounted.aspect;camera.position.copy(mounted.position);camera.quaternion.copy(mounted.quaternion);camera.fov=mounted.fov;camera.near=mounted.near;camera.far=mounted.far;camera.updateProjectionMatrix();if(demo.active)updateDemoUI();}else {const fitDistance=distance*Math.max(1,1.25/camera.aspect);camera.position.set(fitDistance*Math.sin(azimuth)*Math.cos(elevation),fitDistance*Math.sin(elevation),fitDistance*Math.cos(azimuth)*Math.cos(elevation));}if(!wristView&&!ext1View){camera.fov=38;camera.near=.1;camera.up.set(0,1,0);camera.updateProjectionMatrix();camera.lookAt(look);}if(demo.active)updateDemoUI();if(!window.MG4_MANUAL)if(ext1View){const size=renderer.getSize(new T.Vector2()),w=Math.min(size.x,size.y*640/384),h=w*384/640;renderer.setViewport(0,0,size.x,size.y);renderer.setScissorTest(false);renderer.clear();renderer.setViewport((size.x-w)/2,(size.y-h)/2,w,h);renderer.setScissor((size.x-w)/2,(size.y-h)/2,w,h);renderer.setScissorTest(true);renderer.render(scene,camera);renderer.setScissorTest(false);renderer.setViewport(0,0,size.x,size.y);}else renderer.render(scene,camera);recordFrame();streamRender.tick(now);updatePanel();$('#action').textContent=arms.some(a=>a.contactUntil>now)?arms.find(a=>a.contactUntil>now).contactText:arms.some(a=>a.atBoundary)?'已到达运动范围边界':moved?'机械臂移动中':arms.some(a=>a.controlMode!=='position'&&a.jointTarget?.some((q,i)=>Math.abs(q-a.angles[i])>1e-5))?'关节转动中':arms.some(a=>a.held)?'物品已抓取':'等待操作';if(++frameCount&&now-fpsTime>1000){$('#fps').textContent=Math.round(frameCount*1000/(now-fpsTime))+' FPS';frameCount=0;fpsTime=now;}}
let demoControlsState=null;
const demo=new DemoController({arms,items:blocks,zones,grip,reset,physicsMode:()=>!!physics?.enabled,planPickup:(a,b)=>planPickup(a,b,collisionWorld),onChange:updateDemoUI,onFinish:()=>{if(!demo.loop){recordFrame.stop();streamRender.stop();}}});
function demoMeta(){return {completed:demo.completed,progress:demo.progress,caption:demo.state==='done'?'任务完成 · 两件物品均已放置':demo.state==='paused'?'已暂停 · '+demo.title:demo.phase===8&&demo.completed===2?'任务完成 · 两件物品均已放置':demo.title};}
function updateDemoUI(){
 if(physics)physics.assistedApproach=demo.playing&&demo.phase<=2;
 const meta=demoMeta();$('#demo-caption').textContent=meta.caption;$('#demo-count').textContent=meta.completed+' / 2';$('#demo-progress').style.width=meta.progress*100+'%';
 $('#demo-status').textContent=meta.caption;$('#demo-play').textContent=demo.playing?'暂停':demo.state==='paused'?'继续':'播放';
 $('#demo-record').textContent=recordFrame?.isRecording()?'停止并生成':'从头执行并录制';
}
const demoLockedSelectors='#physics-enabled,[data-joint],#solver-kind,#gripper-kind,#item-kind,#item-style,#hold-orientation,#downward,#grip,#position-control,#reset';
function enterDemo(){
 if(!demo.active){
  keys.clear();dragging=null;
  demoControlsState=Array.from(document.querySelectorAll(demoLockedSelectors)).map(el=>[el,el.disabled]);
  demoControlsState.forEach(([el])=>el.disabled=true);
  $('#demo-controls').hidden=false;$('#demo-mode').disabled=true;
 }
 demo.loop=$('#demo-loop').checked;demo.start();updateDemoUI();
}
function leaveDemo(){
 recordFrame.stop();demo.stop();keys.clear();
 $('#demo-controls').hidden=true;$('#demo-mode').disabled=false;
 demoControlsState?.forEach(([el,disabled])=>el.disabled=disabled);demoControlsState=null;updatePanel();
}
$('#demo-mode').onclick=enterDemo;
$('#demo-play').onclick=()=>{if(demo.playing){demo.pause();recordFrame.pause();}else if(demo.state==='paused'){demo.resume();recordFrame.resume();}else enterDemo();};
$('#demo-replay').onclick=()=>{recordFrame.stop();enterDemo();};
$('#demo-exit').onclick=leaveDemo;
$('#demo-loop').onchange=e=>demo.loop=e.target.checked;
$('#demo-record').onclick=()=>{if(recordFrame.isRecording())recordFrame.stop();else{if(!recordFrame.supported){toast('当前浏览器不支持录制');return;}enterDemo();requestAnimationFrame(()=>{if(demo.playing)recordFrame.start();});}updateDemoUI();};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&demo.playing){demo.pause();recordFrame.pause();}});
const recordFrame=window.MG4_REMOTE?Object.assign(()=>{},{supported:false,pause(){},resume(){},stop(){},isRecording:()=>false,isProcessing:()=>false,backend:null}):installVideoRecording({beginOffline:()=>{const oldStopped=stopped,oldPointerEvents=viewport.style.pointerEvents;viewport.style.pointerEvents='none';stopped=true;offlineRendering=true;keys.clear();const locked=Array.from(document.querySelectorAll('button,input,select')).map(el=>[el,el.disabled]);locked.forEach(([el])=>{if(el.id!=='cancel-render')el.disabled=true;});$('#cancel-render').disabled=false;return ()=>{offlineRendering=false;viewport.style.pointerEvents=oldPointerEvents;stopped=oldStopped;last=performance.now();locked.forEach(([el,disabled])=>el.disabled=disabled);updatePanel();};},getSimulationInfo:()=>({mode:physics?.enabled?'rapier':'legacy',...(physics?.enabled?physicsInfo:{})}),getCaptureCamera:()=>camera,renderer,scene,arms,items:blocks,viewport,toast,isDemoPaused:()=>demo.active&&!demo.playing});
$('#demo-record').disabled=!recordFrame.supported;
function prepareReferenceStart(){if(demo.active)leaveDemo();keys.clear();dragging=null;reset();view('ext1');$('#record-view').value='ext1';}
const streamRender=window.MG4_REMOTE?{isBackpressured:()=>false,tick(){}}:installStreamCapture({prepareReferenceStart,backend:recordFrame.backend,canStart:()=>!assetsBusy&&!recordFrame.isRecording()&&!recordFrame.isProcessing(),renderer,scene,arms,items:blocks,getCaptureCamera:()=>camera,viewport,toast});
if(!window.MG4_REMOTE)installReferenceFrame({renderer,scene,arms,items:blocks,backend:recordFrame.backend,canStart:()=>!assetsBusy&&!recordFrame.isRecording()&&!recordFrame.isProcessing(),prepareReferenceStart,beginSnapshot:()=>{const oldStopped=stopped;stopped=true;keys.clear();const controls=Array.from(document.querySelectorAll('button,input,select,textarea')).map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);return ()=>{stopped=oldStopped;last=performance.now();controls.forEach(([el,disabled])=>el.disabled=disabled);};}});
let captureWasStopped=false;if(!window.MG4_REMOTE)installDataCapture({renderer,scene,arms,items:blocks,toast,before:()=>{captureWasStopped=stopped;stopped=true;keys.clear();},after:()=>{stopped=captureWasStopped;last=performance.now();}});
window.MG4_MANUAL=true;window.armature={arms,blocks,grip,reset,view,scene,renderer,model:'Universal Robots UR5',collisionWorld,get physics(){return physics;},switchItems,switchGripper,demo,enterDemo,leaveDemo};

if(window.MG4_REMOTE){installRemoteScene(window.armature,{draw(now){const wristView=mainView==='wrist',ext1View=mainView==='ext1';if(wristView||ext1View){const mounted=makeCaptureCamera(ext1View?'ext1':'wrist',ext1View?640:camera.aspect,ext1View?384:1,arms,Number($('#wrist-arm').value));camera.aspect=mounted.aspect;camera.position.copy(mounted.position);camera.quaternion.copy(mounted.quaternion);camera.fov=mounted.fov;camera.near=mounted.near;camera.far=mounted.far;camera.updateProjectionMatrix();if(demo.active)updateDemoUI();}else {const fitDistance=distance*Math.max(1,1.25/camera.aspect);camera.position.set(fitDistance*Math.sin(azimuth)*Math.cos(elevation),fitDistance*Math.sin(elevation),fitDistance*Math.cos(azimuth)*Math.cos(elevation));}if(!wristView&&!ext1View){camera.fov=38;camera.near=.1;camera.up.set(0,1,0);camera.updateProjectionMatrix();camera.lookAt(look);}if(demo.active)updateDemoUI();if(ext1View){const size=renderer.getSize(new T.Vector2()),w=Math.min(size.x,size.y*640/384),h=w*384/640;renderer.setViewport(0,0,size.x,size.y);renderer.setScissorTest(false);renderer.clear();renderer.setViewport((size.x-w)/2,(size.y-h)/2,w,h);renderer.setScissor((size.x-w)/2,(size.y-h)/2,w,h);renderer.setScissorTest(true);renderer.render(scene,camera);renderer.setScissorTest(false);renderer.setViewport(0,0,size.x,size.y);}else renderer.render(scene,camera);},camera});}else installNativeCapture(window.armature,{step:(now)=>animate(now),keys,select,view,camera,active:()=>active});
