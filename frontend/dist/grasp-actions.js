import {updateGripper,applyAngles} from './robot-model.js';
import {followHeld} from './collision.js';
import {measureGrasp,bindGrasp} from './grasp-geometry.js';
export function toggleGripper(a,items,world){
 const opening=a.closed;
 const inspected=opening?[]:items.filter(b=>!world.arms.some(other=>other.held===b)).sort((x,y)=>x.mesh.position.distanceToSquared(a.actual)-y.mesh.position.distanceToSquared(a.actual)).map(item=>world.inspectGrasp?world.inspectGrasp(a,item):{item,grasp:measureGrasp(a,item),ready:true});
 const measured=inspected.filter(v=>v.grasp&&v.ready).sort((x,y)=>Math.abs(x.grasp.center)-Math.abs(y.grasp.center));
 const chosen=measured.find(v=>v.grasp.fits)||measured[0],candidate=chosen?.item||null;
 if(!opening&&!candidate){const rejected=inspected.find(v=>!v.ready&&v.status!=='far');if(rejected)return {ok:false,reason:rejected.message};}
 if(chosen&&!chosen.grasp.fits)return {ok:false,reason:'当前朝向下物品宽度超出夹爪开口，请调整夹爪方向'};
 const saved={angles:[...a.angles],target:a.target.clone(),closed:a.closed,held:a.held,grasp:a.grasp};
 const oldObject=candidate?{position:candidate.mesh.position.clone(),quaternion:candidate.mesh.quaternion.clone()}:null;
 const initialOpening=a.gripper.opening;
 a.closed=!opening;a.held=opening?null:candidate;a.grasp=candidate?{item:candidate,opening:chosen.grasp.opening}:null;
 // Closing changes the fingers/TCP only. Never solve a new arm pose or move
 // the payload to a preset centre just to make a grasp succeed.
 updateGripper(a);applyAngles(a);a.target.copy(a.actual);
  if(candidate){
  a.grasp=bindGrasp(a,candidate,initialOpening);
  const scale=a.hand.getWorldScale(a.hand.position.clone()).x;
  a.grasp.closing={start:a.grasp.position.clone(),center:chosen.grasp.center,scale,contactOpening:chosen.grasp.opening,targetOpening:Math.max(a.gripper.minOpening||.001,chosen.grasp.width+.0006)};
  updateGripper(a);applyAngles(a);a.target.copy(a.actual);
 }
 followHeld(a);
 const hit=world.check(a);
 if(hit){
  a.closed=saved.closed;a.held=saved.held;a.grasp=saved.grasp;a.angles=saved.angles;a.target.copy(saved.target);a.velocity.fill(0);a.cartesianVelocity?.set(0,0,0);updateGripper(a);applyAngles(a);
  if(candidate){candidate.mesh.position.copy(oldObject.position);candidate.mesh.quaternion.copy(oldObject.quaternion);}
  followHeld(a);return {ok:false,event:hit};
 }
 a.contactUntil=0;a.lastContact=null;
 if(opening&&saved.held)saved.held.fallSpeed=0;
 if(candidate)candidate.fallSpeed=0;
 return {ok:true,opening,item:candidate,released:saved.held};
}
