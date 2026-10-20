import * as T from './vendor/three.module.js';
import {ColladaLoader} from './vendor/ColladaLoader.js';
import {createGripper,disposeGripper} from './grippers.js';
import {repositoryPose} from './solvers.js';

// UR5 geometry and fixed frames from ROS-Industrial universal_robot.
const origins = [[0,0,.089159,0,0,0],[0,0,0,Math.PI/2,0,0],[-.425,0,0,0,0,0],[-.39225,0,.10915,0,0,0],[0,-.09465,0,Math.PI/2,0,0],[0,.0823,0,Math.PI/2,Math.PI,Math.PI]];
const visuals = [[0,0,0,0,0,Math.PI],[0,0,0,0,0,Math.PI],[0,0,.13585,Math.PI/2,0,-Math.PI/2],[0,0,.0165,Math.PI/2,0,-Math.PI/2],[0,0,-.093,Math.PI/2,0,0],[0,0,-.095,0,0,0],[0,0,-.0818,Math.PI/2,0,0]];
export const initialAngles = [0,-1,1.8,-2.4,-Math.PI/2,0];
export const motionLimits = {speed:1.8,acceleration:6,cartesianSpeed:.75,cartesianAcceleration:3};
const L1=.425,L2=.39225,SIDE=.10915,WRIST=.09465,SCALE=2.8;

const MIN_REACH=.085,MAX_REACH=L1+L2-.012;
const TWO_PI=2*Math.PI;

export async function loadRobotGeometry() {
  const loader=new ColladaLoader();
  return Promise.all(['base','shoulder','upperarm','forearm','wrist1','wrist2','wrist3'].map(async name=>{
    const {scene}=await loader.loadAsync('./models/ur5/'+name+'.dae');
    scene.rotation.set(0,0,0);
    scene.traverse(node=>{if(node.isMesh)node.castShadow=node.receiveShadow=true;});
    return scene;
  }));
}

export function createRobot(base,index,geometry) {
  const root=new T.Group();root.position.set(base,.015,.25);root.rotation.x=-Math.PI/2;root.scale.setScalar(SCALE);
  const trim=new T.MeshStandardMaterial({color:index?0x80aac4:0xdc925c,metalness:.4,roughness:.4});
  const metal=new T.MeshStandardMaterial({color:0x939da5,metalness:.75,roughness:.3});
  const addMesh=(g,m,parent)=>{const mesh=new T.Mesh(g,m);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  const inertia=new T.Group();inertia.rotation.z=Math.PI;root.add(inertia);
  const addVisual=(i,parent)=>{const [x,y,z,r,p,w]=visuals[i];const visual=new T.Group();visual.position.set(x,y,z);visual.rotation.set(r,p,w,'ZYX');const model=geometry[i].clone(true);model.traverse(m=>{if(m.isMesh){m.userData.robotLink=i;m.userData.collisionLabel='J'+i+' 连杆';}});visual.add(model);parent.add(visual);};
  addVisual(0,inertia);
  const joints=[];let parent=inertia;
  origins.forEach(([x,y,z,r,p,w],i)=>{const origin=new T.Group();origin.position.set(x,y,z);origin.rotation.set(r,p,w,'ZYX');parent.add(origin);const pivot=new T.Group();origin.add(pivot);addVisual(i+1,pivot);joints.push(pivot);parent=pivot;});
  const flange=new T.Group();flange.rotation.set(0,-Math.PI/2,-Math.PI/2,'ZYX');parent.add(flange);
  const tool=new T.Group();tool.rotation.set(Math.PI/2,0,Math.PI/2,'ZYX');flange.add(tool);
  const hand=new T.Group();hand.position.z=.012;tool.add(hand);
  const gripper=createGripper('original',index);hand.add(gripper.root);
  const tcp=new T.Object3D();tcp.position.z=gripper.tipZ;hand.add(tcp);
  const fingers=gripper.fingers;
  const arm={root,joints,hand,fingers,tcp,gripper,toolOffset:.186,base,index,angles:[...initialAngles],velocity:Array(6).fill(0),closed:false,held:null,grasp:null,target:new T.Vector3(index?-.95:.95,.8,.75),actual:new T.Vector3(),ikError:0,atBoundary:false,solverKind:'current',controlMode:'position',jointTarget:null};
  applyAngles(arm);return arm;
}
export function applyAngles(a){a.joints.forEach((j,i)=>j.rotation.z=a.angles[i]);a.root.updateWorldMatrix(true,true);a.tcp.getWorldPosition(a.actual);}

// Choose the equivalent yaw nearest the last pose: never jump at +/- pi.
function continuousYaw(angle,previous){
  angle+=TWO_PI*Math.round((previous-angle)/TWO_PI);
  return T.MathUtils.clamp(angle,-TWO_PI,TWO_PI);
}
function downwardPose(a) {
  a.root.updateWorldMatrix(true,false);
  const HEIGHT=.089159-.0823-a.toolOffset;
  const local=a.root.worldToLocal(a.target.clone());
  const rho=Math.hypot(local.x,local.y);
  // The lateral wrist offset leaves an inner cylinder without downward poses.
  const radius=Math.max(rho,SIDE+.014);
  let radial=Math.sqrt(radius*radius-SIDE*SIDE);
  // Project onto the reachable horizontal slice, preserving commanded height.
  const y=T.MathUtils.clamp(HEIGHT-local.z,-MAX_REACH+.025,MAX_REACH-.025);
  const maximumX=Math.sqrt(MAX_REACH*MAX_REACH-y*y);
  const minimumX=Math.abs(y)<MIN_REACH?Math.sqrt(MIN_REACH*MIN_REACH-y*y):-WRIST+.014;
  const x=T.MathUtils.clamp(radial-WRIST,minimumX,maximumX);
  radial=x+WRIST;
  const azimuth=rho>1e-8?Math.atan2(local.y,local.x):a.angles[0]+Math.atan2(SIDE,radial);
  const yaw=continuousYaw(azimuth-Math.atan2(SIDE,radial),a.angles[0]);
  const elbow=Math.acos(T.MathUtils.clamp((x*x+y*y-L1*L1-L2*L2)/(2*L1*L2),-1,1));
  const shoulder=Math.atan2(y,x)-Math.atan2(L2*Math.sin(elbow),L1+L2*Math.cos(elbow));
  const pose=[yaw,shoulder,elbow,-Math.PI/2-shoulder-elbow,-Math.PI/2,0];
  const accepted=new T.Vector3(radial*Math.cos(yaw)-SIDE*Math.sin(yaw),radial*Math.sin(yaw)+SIDE*Math.cos(yaw),HEIGHT-y);
  a.root.localToWorld(accepted);
  a.atBoundary=accepted.distanceTo(a.target)>.003;
  // Drop unreachable input instead of storing it for later recovery.
  a.target.copy(accepted);
  return pose;
}

function selectedPose(a){
 if(a.solverKind==='current'&&!a.orientationHold||!a.positionOrientation){a.solverResult=null;return downwardPose(a);}
 const q=repositoryPose(a,a.solverKind==='current'?'ur':a.solverKind);
 if(!q){a.atBoundary=true;a.target.copy(a.actual);return [...a.angles];}
 a.atBoundary=false;return q;
}
export function setJointTarget(a,index,value){
 if(a.controlMode!=='joint'){a.jointTarget=[...a.angles];a.velocity.fill(0);a.cartesianVelocity?.set(0,0,0);}
 a.solverResult=null;a.controlMode='joint';a.jointTarget[index]=T.MathUtils.clamp(value,-TWO_PI,TWO_PI);a.target.copy(a.actual);
}
export function resumePosition(a){
 if(a.controlMode==='position')return;
 a.target.copy(a.actual);a.velocity.fill(0);a.cartesianVelocity?.set(0,0,0);
 a.positionOrientation=a.tcp.getWorldQuaternion(new T.Quaternion());
 if(a.solverKind==='current'&&!a.orientationHold){
  a.jointTarget=downwardPose(a);a.controlMode='align';
 }else a.controlMode='position';
}
function solveJoints(a,dt,guard){
 a.collisionReport=null;dt=T.MathUtils.clamp(dt,0,.04);
 const steps=Math.max(1,Math.ceil(dt/(1/360))),step=dt/steps;
 for(let sub=0;sub<steps;sub++){
  const previous=[...a.angles];
  for(let i=0;i<6;i++){
   const d=a.jointTarget[i]-a.angles[i];
   const braking=Math.sqrt(2*motionLimits.acceleration*Math.abs(d));
   const desired=Math.sign(d)*Math.min(motionLimits.speed,braking,Math.abs(d)*12);
   a.velocity[i]+=T.MathUtils.clamp(desired-a.velocity[i],-motionLimits.acceleration*step,motionLimits.acceleration*step);
   const delta=a.velocity[i]*step;
   if(Math.abs(d)<1e-8||delta*d>0&&Math.abs(delta)>Math.abs(d)){a.angles[i]=a.jointTarget[i];a.velocity[i]=0;}
   else a.angles[i]+=delta;
  }
  applyAngles(a);const hit=guard?.(a);
  if(hit){a.angles=previous;a.jointTarget=[...previous];a.velocity.fill(0);applyAngles(a);a.collisionReport=hit;if(a.controlMode==='align')a.controlMode='joint';break;}
 }
 a.target.copy(a.actual);a.ikError=0;a.atBoundary=false;
 if(a.controlMode==='align'&&a.angles.every((q,i)=>Math.abs(q-a.jointTarget[i])<1e-6)){
  a.controlMode='position';a.positionOrientation=a.tcp.getWorldQuaternion(new T.Quaternion());a.velocity.fill(0);a.cartesianVelocity?.set(0,0,0);
 }
 return a.actual;
}
// Snap only at initialization/reset. Runtime movement is bounded by real dt.
export function solveRobot(a,iterations=12,dt=1/60,guard=null) {
  updateGripper(a);
  if(iterations<=24&&a.needsAlignment){a.needsAlignment=false;a.controlMode='joint';resumePosition(a);}
  if(iterations<=24&&a.controlMode!=='position')return solveJoints(a,dt,guard);
  const pose=selectedPose(a);a.collisionReport=null;
  if(a.solverKind!=='current'&&a.solverResult?.converged===false){a.velocity.fill(0);a.cartesianVelocity?.set(0,0,0);applyAngles(a);a.ikError=0;return a.actual;}
  if(iterations>24){a.angles=pose;a.velocity.fill(0);a.cartesianVelocity=new T.Vector3();applyAngles(a);a.positionOrientation=a.tcp.getWorldQuaternion(new T.Quaternion());}
  else {
    dt=T.MathUtils.clamp(dt,0,.04);
    const command=a.target.clone(),boundary=a.atBoundary;
    const steps=Math.max(1,Math.ceil(dt/(1/360))),step=dt/steps;
    a.cartesianVelocity??=new T.Vector3();
    for(let sub=0;sub<steps;sub++){
      applyAngles(a);
      const previous=[...a.angles],position=a.actual.clone();
      const difference=command.clone().sub(position);
      const desired=difference.clone().multiplyScalar(12).clampLength(0,motionLimits.cartesianSpeed);
      const change=desired.sub(a.cartesianVelocity).clampLength(0,motionLimits.cartesianAcceleration*step);
      a.cartesianVelocity.add(change);
      // Bound joint acceleration in Cartesian space, so independent joint easing
      // cannot lift the TCP away from a horizontal command.
      const axes=['x','y','z'].filter(axis=>Math.abs(difference[axis])>1e-8||Math.abs(a.cartesianVelocity[axis])>1e-8);
      const derivative=Array.from({length:6},()=>new T.Vector3());
      const epsilon=a.solverKind==='closed'?1e-3:1e-5;
      for(const axis of axes){
        a.target.copy(position);a.target[axis]+=epsilon;
        const shifted=selectedPose(a);
        for(let j=0;j<6;j++)derivative[j][axis]=(shifted[j]-previous[j])/epsilon;
      }
      for(let pass=0;pass<16;pass++)for(let j=0;j<4;j++){
        const row=derivative[j],norm=row.lengthSq();if(norm<1e-12)continue;
        const value=row.dot(a.cartesianVelocity);
        if(j===2&&a.solverKind==='current'&&!a.orientationHold){
          const minimum=Math.acos((MAX_REACH*MAX_REACH-L1*L1-L2*L2)/(2*L1*L2));
          const maximum=Math.acos((MIN_REACH*MIN_REACH-L1*L1-L2*L2)/(2*L1*L2));
          const brake=motionLimits.acceleration*.28;
          const slow=T.MathUtils.clamp(value,-Math.sqrt(2*brake*Math.max(0,previous[2]-minimum)),Math.sqrt(2*brake*Math.max(0,maximum-previous[2])));
          a.cartesianVelocity.addScaledVector(row,(slow-value)/norm);
        }
        const lower=Math.max(-motionLimits.speed,a.velocity[j]-motionLimits.acceleration*step*.8);
        const upper=Math.min(motionLimits.speed,a.velocity[j]+motionLimits.acceleration*step*.8);
        const accepted=T.MathUtils.clamp(row.dot(a.cartesianVelocity),lower,upper);
        a.cartesianVelocity.addScaledVector(row,(accepted-row.dot(a.cartesianVelocity))/norm);
      }
      const displacement=a.cartesianVelocity.clone().multiplyScalar(step);
      // An axis at its target stays there; reversing X/Z cannot create vertical drift.
      for(const axis of ['x','y','z']){
        if(Math.abs(difference[axis])<1e-9&&Math.abs(a.cartesianVelocity[axis])<1e-7){
          displacement[axis]=difference[axis];a.cartesianVelocity[axis]=0;
        }else if(a.preventTargetOvershoot&&displacement[axis]*difference[axis]>0&&Math.abs(displacement[axis])>=Math.abs(difference[axis])){
          displacement[axis]=difference[axis];a.cartesianVelocity[axis]=0;
        }
      }
      const sample=fraction=>{
        a.target.copy(position).addScaledVector(displacement,fraction);
        return selectedPose(a);
      };
      let next=sample(1),fraction=1;
      const fits=q=>q.every((value,i)=>Math.abs(value-previous[i])<=motionLimits.speed*step+1e-12);
      if(!fits(next)){
        let lo=0,hi=1;
        for(let n=0;n<18;n++){const mid=(lo+hi)/2;if(fits(sample(mid)))lo=mid;else hi=mid;}
        fraction=lo;next=sample(fraction);
        a.cartesianVelocity.multiplyScalar(fraction);
      }
      a.angles=next;
      a.velocity=next.map((q,i)=>step?(q-previous[i])/step:0);
      applyAngles(a);
      if(guard){
        const collision=guard(a);
        if(collision){
          a.angles=previous;a.velocity.fill(0);a.cartesianVelocity.set(0,0,0);applyAngles(a);
          command.copy(a.actual);a.collisionReport=collision;break;
        }
      }
    }
    a.target.copy(command);a.atBoundary=boundary;
  }
  applyAngles(a);
  a.ikError=a.actual.distanceTo(a.target);return a.actual;
}

export function updateGripper(a){
  const width=a.closed?(a.held?(a.grasp?.item===a.held?a.grasp.opening:a.held.gripHalfWidth*2+.0006):.012):a.gripper.maxOpening;
  a.gripper.setOpening(width);a.tcp.position.z=a.gripper.tipZ;a.toolOffset=a.hand.position.z+a.gripper.tipZ;
}
export function setRobotGripper(a,kind,assets){
  disposeGripper(a.gripper);a.gripper=createGripper(kind,a.index,assets);a.hand.add(a.gripper.root);
  a.fingers=a.gripper.fingers||[];a.closed=false;a.held=null;a.grasp=null;updateGripper(a);
}
