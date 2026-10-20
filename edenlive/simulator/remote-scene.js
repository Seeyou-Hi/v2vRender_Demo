import * as T from './vendor/three.module.js';
import {applyAngles} from './robot-model.js';
// A display replica only: no client IK, collision, physics or control prediction.
// Poses arrive through the native MG4 frame telemetry on the existing control WS.
export function installRemoteScene(a,ctx){
 let switching=false,kind='drinks',style='robotwin',gripper='robotiq',lastFrame=-1,lastUI=null;
 async function assets(ui){if(!ui||switching)return;const v=ui.values;switching=true;try{
  if(v['gripper-kind'].value!==gripper){await a.switchGripper(v['gripper-kind'].value);gripper=v['gripper-kind'].value;}
  if(v['item-kind'].value!==kind||v['item-style'].value!==style){await a.switchItems(v['item-kind'].value,v['item-style'].value);kind=v['item-kind'].value;style=v['item-style'].value;}
 }finally{switching=false;}}
 function draw(now){requestAnimationFrame(draw);const s=window.armRemoteState;
  if(s?.ui)lastUI=s.ui;if(s?.ui)void assets(s.ui);
  if(s&&!switching){
   a.arms.forEach((arm,i)=>{const pose=s.arms[i];arm.angles=[...pose.angles];arm.closed=pose.closed;arm.controlMode=pose.controlMode;arm.solverKind=pose.solver;arm.gripper.setOpening(pose.opening);arm.tcp.position.z=arm.gripper.tipZ;applyAngles(arm);arm.actual.fromArray(pose.tcp);arm.ring.position.set(arm.actual.x,.035,arm.actual.z);arm.ring.material.color.set(pose.contact?0xe76d62:i?0x88aeca:0xdca174);
    if(s.frame!==lastFrame&&(!arm.history.length||arm.history.at(-1).distanceTo(arm.actual)>.025)){arm.history.push(arm.actual.clone());if(arm.history.length>180)arm.history.shift();arm.trail.geometry.dispose();arm.trail.geometry=new T.BufferGeometry().setFromPoints(arm.history);}
    arm.trail.visible=lastUI?.values['trail-toggle'].checked??true;
   });
   s.objects.forEach((o,i)=>{const obj=a.blocks[i];if(!obj)return;obj.mesh.position.fromArray(o.position);obj.mesh.quaternion.fromArray(o.quaternion);});
   a.arms.forEach((arm,i)=>arm.held=a.blocks[s.objects.findIndex(o=>o.held_by===i)]||null);
   a.scene.traverse(n=>{if(n.type==='GridHelper')n.visible=lastUI?.values['grid-toggle'].checked??true;});lastFrame=s.frame;
  }
  ctx.draw(now);
 }
 window.remoteScene={a};draw(performance.now());
}
