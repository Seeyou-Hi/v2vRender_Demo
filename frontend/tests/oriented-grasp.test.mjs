import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {createRobot,applyAngles,updateGripper} from '../dist/robot-model.js';
import {createTableItems} from '../dist/table-items.js';
import {measureGrasp} from '../dist/grasp-geometry.js';
import {toggleGripper} from '../dist/grasp-actions.js';
import {followHeld} from '../dist/collision.js';
const near=(a,b,msg)=>assert.ok(a.distanceTo(b)<1e-7,msg);
function setup(q=new T.Quaternion().setFromEuler(new T.Euler(0,Math.PI/2,0))){const a=createRobot(0,0,Array.from({length:7},()=>new T.Group()));const current=a.hand.getWorldQuaternion(new T.Quaternion());a.root.quaternion.premultiply(q.clone().multiply(current.invert()));applyAngles(a);const b=createTableItems('cans')[0];b.mesh.quaternion.identity();b.mesh.position.copy(a.actual).add(new T.Vector3(0,0,-.15).applyQuaternion(q));b.mesh.updateMatrixWorld(true);const world={arms:[a],check:()=>null};return {a,b,q,world};}
// Sideways approach with upright can: acquire across its width, keep it upright.
for(const q of [new T.Quaternion().setFromEuler(new T.Euler(0,Math.PI/2,0)),new T.Quaternion().setFromEuler(new T.Euler(Math.PI/2,0,0)),new T.Quaternion().setFromEuler(new T.Euler(.4,1.2,.3))]){
 const {a,b,world}=setup(q),position=b.mesh.position.clone(),rotation=b.mesh.quaternion.clone();const measured=measureGrasp(a,b);assert.ok(measured?.fits,'oriented contact fits');const r=toggleGripper(a,[b],world);assert.ok(r.ok&&r.item===b);near(position,b.mesh.position,'no position snap on closure');assert.ok(b.mesh.quaternion.angleTo(rotation)<1e-7,'no forced top-to-tool rotation');
 const relative=a.hand.worldToLocal(position.clone()),delta=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.3);a.root.position.add(new T.Vector3(.3,.4,-.1));a.root.quaternion.premultiply(delta);applyAngles(a);followHeld(a);near(b.mesh.position,a.hand.localToWorld(relative),'rigid attachment translation');assert.ok(b.mesh.quaternion.angleTo(delta.clone().multiply(rotation))<1e-7,'rigid attachment rotation');
 const releasedPosition=b.mesh.position.clone(),releasedRotation=b.mesh.quaternion.clone();assert.ok(toggleGripper(a,[b],world).ok);near(b.mesh.position,releasedPosition,'release preserves position');assert.ok(b.mesh.quaternion.angleTo(releasedRotation)<1e-7,'release preserves orientation');assert.equal(a.grasp,null);
}
{
 const {a,b,q,world}=setup();b.mesh.position.add(new T.Vector3(.06,0,0).applyQuaternion(q));const before=b.mesh.position.clone();assert.ok(measureGrasp(a,b)?.fits,'off-centre can inside jaws is accepted');assert.equal(toggleGripper(a,[b],world).item,b);near(b.mesh.position,before,'offset grasp preserves position');
}
{
 const {a,b,q}=setup();b.mesh.position.copy(a.actual).add(new T.Vector3(0,0,.5).applyQuaternion(q));assert.equal(measureGrasp(a,b),null,'in front of fingertips is not in pad contact');
}
{
 const {a,b,world}=setup();const oldPosition=b.mesh.position.clone(),oldRotation=b.mesh.quaternion.clone();world.check=()=>({label:'obstacle'});assert.equal(toggleGripper(a,[b],world).ok,false);assert.equal(a.held,null);assert.equal(a.grasp,null);assert.equal(a.closed,false);near(b.mesh.position,oldPosition,'rollback position');assert.ok(b.mesh.quaternion.angleTo(oldRotation)<1e-7,'rollback rotation');
}
{
 // Rotating the closing axis onto the can's long axis exceeds its jaw opening.
 const {a,b}=setup(new T.Quaternion().setFromEuler(new T.Euler(0,Math.PI/2,Math.PI/2)));b.mesh.scale.y=2;b.mesh.updateMatrixWorld(true);const r=measureGrasp(a,b);assert.ok(r&&!r.fits,'orientation-dependent width rejected');
}
console.log('Side / downward / tilted grasps preserve pose; rotated width, off-centre assisted grasp, release and collision rollback PASS');
import {readFileSync} from 'node:fs';
import {STLLoader} from '../dist/vendor/STLLoader.js';
import {setRobotGripper} from '../dist/robot-model.js';
import {loadTestAssets} from './robotwin-loader.mjs';
await loadTestAssets();
for(const kind of ['robotiq','xarm']){
 const dir='dist/models/grippers/'+kind+'/',data=JSON.parse(readFileSync(dir+'assembly.json')),parts={},loader=new STLLoader();
 for(const link of data.links){const bytes=readFileSync(dir+link.mesh+'.stl'),geometry=loader.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));geometry.computeBoundingBox();parts[link.name]={geometry};}
 for(const type of ['bottles','cans']){
  const a=createRobot(0,0,Array.from({length:7},()=>new T.Group()));setRobotGripper(a,kind,{data,parts});
  const q=new T.Quaternion().setFromEuler(new T.Euler(0,Math.PI/2,0)),current=a.hand.getWorldQuaternion(new T.Quaternion());a.root.quaternion.premultiply(q.clone().multiply(current.invert()));applyAngles(a);
  const b=createTableItems(type,'robotwin')[0];b.mesh.quaternion.identity();b.mesh.position.copy(a.actual).add(new T.Vector3(0,0,(a.gripper.region.minZ+a.gripper.region.maxZ)/2).applyQuaternion(q));b.mesh.updateMatrixWorld(true);
  const pos=b.mesh.position.clone(),rot=b.mesh.quaternion.clone(),world={arms:[a],check:()=>null};assert.ok(measureGrasp(a,b)?.fits,kind+' '+type+' body fits sideways');assert.ok(toggleGripper(a,[b],world).item===b);near(pos,b.mesh.position,'real asset no snap');assert.ok(b.mesh.quaternion.angleTo(rot)<1e-7,'real asset upright preserved');
 }
}
console.log('Real Robotiq / xArm sideways RoboTwin bottle and can grasps PASS');
