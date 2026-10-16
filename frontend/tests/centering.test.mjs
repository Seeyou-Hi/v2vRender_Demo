import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {STLLoader} from '../dist/vendor/STLLoader.js';
import {createRobot,setRobotGripper,solveRobot} from '../dist/robot-model.js';
import {CollisionWorld,followHeld} from '../dist/collision.js';
import {createTableItems} from '../dist/table-items.js';
import {toggleGripper} from '../dist/grasp-actions.js';
import {planPickup} from '../dist/grasp-planner.js';
import {measureGrasp} from '../dist/grasp-geometry.js';
import {loadPhysics,PhysicsWorld} from '../dist/physics.js';
import {loadTestAssets} from './robotwin-loader.mjs';
await loadTestAssets();
const R=await loadPhysics();
function assets(kind){if(kind==='original')return null;const dir='dist/models/grippers/'+kind+'/',data=JSON.parse(readFileSync(dir+'assembly.json')),parts={},loader=new STLLoader();for(const link of data.links){const b=readFileSync(dir+link.mesh+'.stl');parts[link.name]={geometry:loader.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))};parts[link.name].geometry.computeBoundingBox();}return {data,parts};}
for(const physical of [false,true])for(const kind of ['original','robotiq','xarm'])for(const sign of [-1,1]){
 const arm=createRobot(2.5,0,Array.from({length:7},()=>new T.Group()));setRobotGripper(arm,kind,assets(kind));arm.solverKind='ur';solveRobot(arm,120);
 const items=createTableItems('cans','robotwin'),item=items[0],table=new T.Mesh(new T.BoxGeometry(6.4,.14,4.6));table.position.y=-.08;
 const world=new CollisionWorld([arm],items,[table]);arm.target.set(...planPickup(arm,item,world));solveRobot(arm,120);
 const axis=new T.Vector3(1,0,0).applyQuaternion(arm.hand.getWorldQuaternion(new T.Quaternion()));item.mesh.position.addScaledVector(axis,.018*sign);
 const before=item.mesh.position.clone(),rotation=item.mesh.quaternion.clone(),measured=measureGrasp(arm,item);assert.ok(measured?.fits);assert.ok(Math.abs(measured.center)>.012);
 const physics=physical?new PhysicsWorld(R,world):null;if(physics)world.physics=physics;
 assert.equal(toggleGripper(arm,items,world).item,item);assert.ok(item.mesh.position.distanceTo(before)<1e-9,'closure starts without teleport');
 let gap=arm.gripper.opening,previous=before.clone(),pushed=false;
 for(let i=0;i<120&&arm.grasp.closing;i++){
  if(physics)physics.step(1/120);else world.advanceObjects(1/120);
  assert.ok(arm.gripper.opening<=gap+1e-9,'jaw closes monotonically');gap=arm.gripper.opening;
  assert.ok(item.mesh.position.distanceTo(previous)<.004,'pushing is continuous');
  assert.ok(item.mesh.quaternion.angleTo(rotation)<1e-7,'pushing preserves orientation');
  assert.equal(arm.grasp.centeringBlocked,undefined,'unobstructed centering finishes');
  pushed ||= item.mesh.position.distanceTo(before)>.001;previous.copy(item.mesh.position);
 }
 assert.equal(arm.grasp.closing,null);assert.ok(pushed,'near pad pushes offset can');
 const shift=item.mesh.position.clone().sub(before);assert.ok(Math.abs(shift.dot(axis)+measured.center)<.0005,'contact section centered');
 assert.ok(shift.clone().addScaledVector(axis,-shift.dot(axis)).length()<1e-7,'only closes along jaw axis');
 assert.equal(world.check(arm),null,'final pose collision free');
 const relative=arm.grasp.position.clone();arm.root.position.y+=.2;arm.root.updateWorldMatrix(true,true);followHeld(arm);assert.ok(item.mesh.position.distanceTo(arm.hand.localToWorld(relative))<1e-7,'centered payload follows lift');
 physics?.dispose();
 console.log('PASS',physical?'Rapier':'kinematic',kind,sign);
}
// A blocked incremental push must retain the last safe object and finger pose.
{
 const arm=createRobot(2.5,0,Array.from({length:7},()=>new T.Group())),item=createTableItems('cans','robotwin')[0];arm.solverKind='ur';solveRobot(arm,120);const world=new CollisionWorld([arm],[item],[]);arm.target.set(...planPickup(arm,item,world));solveRobot(arm,120);const q=arm.hand.getWorldQuaternion(new T.Quaternion());item.mesh.position.add(new T.Vector3(.018,0,0).applyQuaternion(q));
 assert.ok(toggleGripper(arm,[item],world).item===item);
 const realCheck=world.check.bind(world),start=item.mesh.position.clone();world.check=a=>item.mesh.position.distanceTo(start)>.005?{label:'障碍物',part:'物品',kind:'payload'}:realCheck(a);
 let contact=null;for(let i=0;i<120&&arm.grasp.closing;i++)world.advanceGrasps(1/120,(_,event)=>contact=event);
 assert.ok(contact);assert.equal(arm.grasp.centeringBlocked,true);assert.ok(item.mesh.position.distanceTo(start)<=.005+1e-8,'last safe step restored');
 assert.ok(toggleGripper(arm,[item],world).ok,'can release after blocked push');
}
console.log('Incremental contact-driven centering, physics parity, lift and obstruction rollback PASS');
