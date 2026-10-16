import * as T from './vendor/three.module.js';
import {CollisionWorld} from './collision.js';
import {measureGrasp} from './grasp-geometry.js';
import {toggleGripper} from './grasp-actions.js';
// A separate tool copy plans only gripper/object/table clearance. Runtime IK
// and full-arm collision protection still validate every actual approach step.
export function planPickup(a,item,world){
 if(!['apples','pens'].includes(item.kind))return [item.mesh.position.x,Math.max(.05,item.mesh.position.y-a.gripper.graspHeight(item)+.065),item.mesh.position.z];
 const root=new T.Group(),tool=a.gripper.root.clone(true),original=[],copied=[];a.gripper.root.traverse(n=>original.push(n));tool.traverse(n=>copied.push(n));const lookup=new Map(original.map((n,i)=>[n,copied[i]]));root.add(tool);
 const gripper={...a.gripper,root:tool,joints:a.gripper.joints?.map(j=>({...j,pivot:lookup.get(j.pivot)})),fingers:a.gripper.fingers?.map(f=>lookup.get(f))};
 gripper.setOpening=function(gap){
  if(this.kind==='original'){this.fingers.forEach((f,i)=>f.position.x=(i?1:-1)*(gap/2.8/2+.008));this.opening=gap;return;}
  const p=this.contactAtOpening(gap);this.joints.forEach(j=>j.pivot.quaternion.setFromAxisAngle(j.axis,p.angle*j.multiplier));this.tipZ=p.tipZ;this.region=p.region;this.angle=p.angle;this.opening=gap;
 };
 const tcp=new T.Object3D();root.add(tcp);root.quaternion.copy(a.hand.getWorldQuaternion(new T.Quaternion()));root.scale.copy(a.hand.getWorldScale(new T.Vector3()));
 const ghost={root,hand:root,tcp,gripper,index:a.index,angles:[],joints:[],velocity:[],actual:new T.Vector3(),target:new T.Vector3(),closed:false,held:null,grasp:null,controlMode:'joint'};
 const scene=new CollisionWorld([ghost],world.blocks,world.static.map(s=>s.mesh)),bounds=new T.Box3().setFromObject(item.mesh),center=item.mesh.getWorldPosition(new T.Vector3()),savedPosition=item.mesh.position.clone(),savedRotation=item.mesh.quaternion.clone(),savedFall=item.fallSpeed;
 // Physics may tilt the object. The wrapper origin (including the apple stem)
 // is no longer the centre of the material that the fingers should contact.
 if(world.physics?.enabled){
 const visibleBounds=new T.Box3(),point=new T.Vector3();item.mesh.updateWorldMatrix(true,true);
 item.mesh.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible||mesh.userData.graspIgnore||!(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m.visible))return;const vertices=mesh.geometry.attributes.position;for(let i=0;i<vertices.count;i++)visibleBounds.expandByPoint(point.fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld));});
 if(!visibleBounds.isEmpty()){bounds.copy(visibleBounds);bounds.getCenter(center);}
 }
 const maxY=bounds.max.y+.16,minY=bounds.min.y-.01;let best=null,bestScore=-Infinity;
 try{
  for(const lateral of [0,-.006,.006]){
   for(let i=0;i<=48;i++){
    ghost.held=null;ghost.grasp=null;ghost.closed=false;gripper.setOpening(gripper.maxOpening);tcp.position.z=gripper.tipZ;
    const target=new T.Vector3(center.x,maxY+(minY-maxY)*i/48,center.z).add(new T.Vector3(lateral,0,0).applyQuaternion(root.quaternion));
    root.position.copy(target).sub(new T.Vector3(0,0,gripper.tipZ).multiply(root.scale).applyQuaternion(root.quaternion));root.updateMatrixWorld(true);tcp.getWorldPosition(ghost.actual);
    if(scene.check(ghost))break; // Lower poses cannot be reached through an open-tool collision.
    const grasp=measureGrasp(ghost,item);if(!grasp?.fits)continue;
    const result=toggleGripper(ghost,[item],scene);if(!result.ok||ghost.held!==item)continue;
    const score=grasp.width-Math.abs(target.y-center.y)*.08-Math.abs(lateral)*2;
    if(score>bestScore){bestScore=score;best=target.toArray();}
    ghost.held=null;ghost.grasp=null;item.mesh.position.copy(savedPosition);item.mesh.quaternion.copy(savedRotation);item.mesh.updateMatrixWorld(true);
   }
   if(best)break;
  }
  return best;
 }finally{item.mesh.position.copy(savedPosition);item.mesh.quaternion.copy(savedRotation);item.mesh.updateMatrixWorld(true);item.fallSpeed=savedFall;}
}
