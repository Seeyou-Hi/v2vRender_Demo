import * as T from './vendor/three.module.js';
// Rapier 0.21.0, Apache-2.0. Scene coordinates: 2.8 units = 1 metre.
export const physicsInfo={engine:'Rapier',version:'0.21.0',units_per_metre:2.8,fixed_step_s:1/120,grasp:'assisted_approach_and_relative_pose',release_clearance_s:.5,support_guard:'finite_static_surface_projection_and_compression_stop'};
let loading;
export async function loadPhysics(){
 if(!loading)loading=import('./vendor/rapier-0.21.0.js').then(async m=>{await m.default.init();return m.default;}).catch(error=>{loading=null;throw error;});
 return loading;
}
const groups=(member,filter)=>(member<<16)|filter;
const pose=mesh=>{mesh.updateWorldMatrix(true,false);const position=new T.Vector3(),quaternion=new T.Quaternion(),scale=new T.Vector3();mesh.matrixWorld.decompose(position,quaternion,scale);return {position,quaternion,scale};};
const masses={apples:.18,pens:.02,bottles:.5,cans:.35,blocks:.1};
export class PhysicsWorld{
 constructor(R,collision){this.R=R;this.collision=collision;this.enabled=true;this.rebuild();this.collision.arms.forEach(a=>a.preventTargetOvershoot=true);}
 dispose(){this.world?.free();this.queue?.free();this.world=null;this.queue=null;this.enabled=false;this.collision.arms.forEach(a=>a.preventTargetOvershoot=false);}
 rebuild(){
  this.world?.free();this.queue?.free();const R=this.R;
  this.world=new R.World({x:0,y:-9.81*2.8,z:0});this.world.timestep=physicsInfo.fixed_step_s;
  const p=this.world.integrationParameters;p.lengthUnit=2.8;p.numSolverIterations=12;p.maxCcdSubsteps=4;p.normalizedAllowedLinearError=.0004;p.normalizedPredictionDistance=.02;
  this.queue=new R.EventQueue(true);this.objects=new Map();this.parts=[];this.partsByMesh=new Map();this.contacts=new Map();this.accumulator=0;
  // Only horizontal, finite box surfaces participate. Objects can still fall off edges.
  this.surfaces=this.collision.static.flatMap(s=>{s.mesh.updateWorldMatrix(true,false);const b=new T.Box3().setFromObject(s.mesh),size=b.getSize(new T.Vector3()),up=new T.Vector3(0,1,0).applyQuaternion(s.mesh.getWorldQuaternion(new T.Quaternion()));return s.mesh.geometry.type==='BoxGeometry'&&Math.abs(up.y)>.99999&&size.y<Math.min(size.x,size.z)*.25?[{bounds:b,top:b.max.y,label:s.label}]:[];});
  this.collision.refresh();
  for(const s of this.collision.static){
   const transform=pose(s.mesh),body=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...transform.position.toArray()).setRotation(transform.quaternion));
   this.addShape(s.mesh,body,new T.Matrix4().makeScale(...transform.scale.toArray()),groups(1,2),{label:s.label});
  }
  for(const [arm,shapes] of this.collision.parts)for(const s of shapes){
   const transform=pose(s.mesh),body=this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...transform.position.toArray()).setRotation(transform.quaternion));
   this.addShape(s.mesh,body,new T.Matrix4().makeScale(...transform.scale.toArray()),groups(arm.index?8:4,2),{arm,part:s.label});
   const part={mesh:s.mesh,body,arm,scale:transform.scale};this.parts.push(part);this.partsByMesh.set(s.mesh,part);
  }
  for(const [item,s] of this.collision.objects){
   const transform=pose(item.mesh),body=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...transform.position.toArray()).setRotation(transform.quaternion).setCcdEnabled(true).setLinearDamping(.15).setAngularDamping(item.kind==='apples'?2.5:item.kind==='pens'?1.8:.8));
   const inverse=new T.Matrix4().compose(transform.position,transform.quaternion,new T.Vector3(1,1,1)).invert(),shapes=s.children.length?s.children:[s],colliders=[];
   for(const child of shapes){const matrix=new T.Matrix4().multiplyMatrices(inverse,child.mesh.matrixWorld),collider=this.addShape(child.mesh,body,matrix,groups(2,15),{item});colliders.push(collider);}
   const volume=colliders.reduce((sum,c)=>sum+c.volume(),0);colliders.forEach(c=>c.setMass((masses[item.kind]||.1)*c.volume()/volume));
   const supportPoints=[];for(const child of shapes){
    const matrix=new T.Matrix4().multiplyMatrices(inverse,child.mesh.matrixWorld),g=child.mesh.geometry,point=new T.Vector3();
    if(g.type==='BoxGeometry'){g.computeBoundingBox();const b=g.boundingBox;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])supportPoints.push(point.set(x,y,z).applyMatrix4(matrix).clone());}
    else{const vertices=g.attributes.position;for(let i=0;i<vertices.count;i++)supportPoints.push(point.fromBufferAttribute(vertices,i).applyMatrix4(matrix).clone());}
   }
   this.objects.set(item,{body,colliders,supportPoints,heldBy:null,filter:15});item.fallSpeed=0;
  }
  this.syncAttachments(true);
 }
 addShape(mesh,body,matrix,collisionGroups,metadata){
  const R=this.R,position=new T.Vector3(),quaternion=new T.Quaternion(),scale=new T.Vector3();matrix.decompose(position,quaternion,scale);
  let desc;const geometry=mesh.geometry;
  if(geometry.type==='BoxGeometry'){
   geometry.computeBoundingBox();const box=geometry.boundingBox,half=box.getSize(new T.Vector3()).multiply(scale).multiplyScalar(.5),center=box.getCenter(new T.Vector3()).multiply(scale).applyQuaternion(quaternion);position.add(center);
   desc=R.ColliderDesc.cuboid(Math.max(.0001,half.x),Math.max(.0001,half.y),Math.max(.0001,half.z));
  }else{
   // Each articulated mesh has its own convex collider: the gap between fingers stays empty.
   const values=geometry.attributes.position,points=new Float32Array(values.count*3);
   for(let i=0;i<values.count;i++){points[i*3]=values.getX(i)*scale.x;points[i*3+1]=values.getY(i)*scale.y;points[i*3+2]=values.getZ(i)*scale.z;}
   desc=R.ColliderDesc.convexHull(points);
   if(!desc)throw Error('无法建立物理碰撞形状');
  }
  desc.setTranslation(...position.toArray()).setRotation(quaternion).setContactSkin(metadata.arm?.00005:.0008).setFriction(.8).setRestitution(.01).setCollisionGroups(collisionGroups).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
  const collider=this.world.createCollider(desc,body);this.contacts.set(collider.handle,metadata);return collider;
 }
 bodyBounds(entry,target=new T.Box3()){
  const matrix=new T.Matrix4().compose(new T.Vector3().copy(entry.body.translation()),new T.Quaternion().copy(entry.body.rotation()).normalize(),new T.Vector3(1,1,1)),point=new T.Vector3();target.makeEmpty();for(const p of entry.supportPoints)target.expandByPoint(point.copy(p).applyMatrix4(matrix));return target;
 }
 insideSurface(bounds,surface){const b=surface.bounds;return bounds.min.x>=b.min.x&&bounds.max.x<=b.max.x&&bounds.min.z>=b.min.z&&bounds.max.z<=b.max.z;}
 blocksCompression(item,shape){
  const entry=this.objects.get(item),part=this.partsByMesh.get(shape.mesh);if(!entry?.supported||!part)return false;
  const current=shape.mesh.matrixWorld,old=new T.Matrix4().compose(new T.Vector3().copy(part.body.translation()),new T.Quaternion().copy(part.body.rotation()),part.scale),b=shape.mesh.geometry.boundingBox;
  const bottom=m=>{const e=m.elements;return e[13]+e[1]*(b.min.x+b.max.x)/2+e[5]*(b.min.y+b.max.y)/2+e[9]*(b.min.z+b.max.z)/2-Math.abs(e[1])*(b.max.x-b.min.x)/2-Math.abs(e[5])*(b.max.y-b.min.y)/2-Math.abs(e[9])*(b.max.z-b.min.z)/2;};
  return current.elements[13]<old.elements[13]-1e-7||bottom(current)<bottom(old)-1e-7;
 }
 resolveSurfaces(previous){
  for(const [item,entry] of this.objects){
   if(entry.heldBy||entry.frozen)continue;
   const before=previous.get(item),bounds=this.bodyBounds(entry);if(!before)continue;
   for(const surface of this.surfaces){
    // Use the last pose from this physics substep, never an old render-frame pose.
    // A table must not pull an object up from underneath, or support it beyond its edge.
    if(!this.insideSurface(bounds,surface)||!this.insideSurface(before,surface)||before.min.y<surface.top-.002||bounds.min.y>=surface.top+.0002)continue;
    const lift=surface.top+.0002-bounds.min.y,position=entry.body.translation(),velocity=entry.body.linvel();
    entry.body.setTranslation({x:position.x,y:position.y+lift,z:position.z},true);
    if(velocity.y<0)entry.body.setLinvel({x:velocity.x,y:0,z:velocity.z},true);
    bounds.min.y+=lift;bounds.max.y+=lift;
   }
  }
 }
 refreshSupports(){
  for(const entry of this.objects.values()){const b=this.bodyBounds(entry);entry.supported=this.surfaces.some(s=>this.insideSurface(b,s)&&b.min.y>=s.top-.002&&b.min.y<=s.top+.006);}
 }
 settle(seconds=2){
  for(let i=0;i<Math.ceil(seconds/physicsInfo.fixed_step_s);i++)this.step(physicsInfo.fixed_step_s);
  // Reset starts with resting objects. Contacts with a moving arm wake them normally.
  for(const entry of this.objects.values())if(!entry.heldBy){entry.body.setLinvel({x:0,y:0,z:0},false);entry.body.setAngvel({x:0,y:0,z:0},false);entry.body.sleep();}
 }
 syncAttachments(teleport=false){
  const R=this.R;
  for(const [item,entry] of this.objects){
   const arm=this.collision.arms.find(a=>a.held===item)||null,changed=arm!==entry.heldBy,frozen=!arm&&!!this.assistedApproach,freezeChanged=frozen!==!!entry.frozen;
   if(changed&&!arm&&entry.heldBy){
    entry.releaseArm=entry.heldBy;entry.releaseRemaining=physicsInfo.release_clearance_s;
    // Finger opening is instantaneous in the UI. Match that pose without inventing
    // an extreme opening velocity that kicks the released payload away.
    for(const part of this.parts)if(part.arm===entry.heldBy&&part.mesh.userData.robotLink===7){const t=pose(part.mesh);part.body.setTranslation(t.position,true);part.body.setRotation(t.quaternion,true);part.body.setNextKinematicTranslation(t.position);part.body.setNextKinematicRotation(t.quaternion);}
   }
   if(changed||freezeChanged){entry.body.setBodyType(arm||frozen?R.RigidBodyType.KinematicPositionBased:R.RigidBodyType.Dynamic,true);entry.heldBy=arm;entry.frozen=frozen;}
   if(arm){entry.releaseArm=null;entry.releaseRemaining=0;}
   const filter=arm?(arm.index?7:11):this.assistedApproach?3:entry.releaseRemaining>0?(entry.releaseArm.index?7:11):15;
   if(entry.filter!==filter){entry.colliders.forEach(c=>c.setCollisionGroups(groups(2,filter)));entry.filter=filter;}
   if(arm||frozen||changed||freezeChanged||teleport){
    const transform=pose(item.mesh);entry.body.setTranslation(transform.position,true);entry.body.setRotation(transform.quaternion,true);
    entry.body.setLinvel({x:0,y:0,z:0},true);entry.body.setAngvel({x:0,y:0,z:0},true);
    if(arm||frozen){entry.body.setNextKinematicTranslation(transform.position);entry.body.setNextKinematicRotation(transform.quaternion);}
   }
  }
 }
 step(dt,onContact=()=>{}){
  if(!this.enabled||dt<=0)return;
  this.collision.advanceGrasps(dt,onContact);
  for(const entry of this.objects.values())entry.releaseRemaining=Math.max(0,(entry.releaseRemaining||0)-dt);
  this.syncAttachments();this.accumulator=Math.min(this.accumulator+dt,.1);
  // Interpolate robot poses over the physics substeps, rather than teleporting each collider.
  const count=Math.floor((this.accumulator+1e-10)/physicsInfo.fixed_step_s);
  const moving=this.parts.map(part=>({...part,from:part.body.translation(),rotation:part.body.rotation(),to:pose(part.mesh)}));
  for(let sub=0;sub<count;sub++){
   const t=(sub+1)/count;
   for(const part of moving){part.body.setNextKinematicTranslation(new T.Vector3().copy(part.from).lerp(part.to.position,t));part.body.setNextKinematicRotation(new T.Quaternion().copy(part.rotation).slerp(part.to.quaternion,t));}
   const previous=new Map();for(const [item,entry] of this.objects)if(!entry.heldBy&&!entry.frozen)previous.set(item,this.bodyBounds(entry));
   this.world.step(this.queue);this.resolveSurfaces(previous);this.accumulator-=physicsInfo.fixed_step_s;
   this.queue.drainCollisionEvents((one,two,started)=>{
    if(!started)return;const a=this.contacts.get(one),b=this.contacts.get(two),robot=a?.arm?a:b?.arm?b:null,item=a?.item?a.item:b?.item;
    if(robot&&item&&!this.collision.arms.some(arm=>arm.held===item))onContact(robot.arm,{label:item.label,part:robot.part,kind:'object'});
   });
  }
  this.refreshSupports();
  for(const [item,entry] of this.objects)if(!entry.heldBy&&!entry.frozen){
   const position=new T.Vector3().copy(entry.body.translation()),quaternion=new T.Quaternion().copy(entry.body.rotation()).normalize();
   if(item.mesh.parent){item.mesh.parent.updateWorldMatrix(true,false);item.mesh.parent.worldToLocal(position);quaternion.premultiply(item.mesh.parent.getWorldQuaternion(new T.Quaternion()).invert());}
   item.mesh.position.copy(position);item.mesh.quaternion.copy(quaternion);item.mesh.updateWorldMatrix(true,true);item.fallSpeed=0;
  }
 }
}
