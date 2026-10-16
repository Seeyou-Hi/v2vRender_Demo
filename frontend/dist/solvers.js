import * as T from './vendor/three.module.js';
import {inverse} from './vendor/solvers/ur/ur-kinematics.js';
import {Solver,Joint,Link,Goal,DOF} from './vendor/solvers/closed-chain-ik.js';
export const solverTypes={current:{name:'当前求解器',note:'解析位置控制 · 夹爪朝下'},ur:{name:'UR ur_kinematics',note:'UR仓库解析算法 · 保持当前朝向'},closed:{name:'closed-chain-ik-js',note:'仓库迭代算法 · 保持当前朝向'}};
const TWO_PI=Math.PI*2;
const toolFromUr=new T.Matrix4().set(0,0,1,0,-1,0,0,0,0,-1,0,0,0,0,0,1);
const urFromTool=toolFromUr.clone().invert();
const origins=[[0,0,.089159,0,0,0],[0,0,0,Math.PI/2,0,0],[-.425,0,0,0,0,0],[-.39225,0,.10915,0,0,0],[0,-.09465,0,Math.PI/2,0,0],[0,.0823,0,Math.PI/2,Math.PI,Math.PI]];
function localGoal(a){
 const position=a.root.worldToLocal(a.target.clone());
 const quaternion=a.root.getWorldQuaternion(new T.Quaternion()).invert().multiply(a.positionOrientation);
 return {position,quaternion};
}
function nearest(values,seed){
 const q=values.map((v,i)=>v+TWO_PI*Math.round((seed[i]-v)/TWO_PI));
 return q.every(v=>Number.isFinite(v)&&Math.abs(v)<=TWO_PI+1e-6)?q:null;
}
function chain(a){
 const root=new Link();root.setQuaternion(0,0,1,0);const joints=[];let parent=root;
 for(const [x,y,z,r,p,w] of origins){
  const joint=new Joint(),link=new Link(),q=new T.Quaternion().setFromEuler(new T.Euler(r,p,w,'ZYX'));
  joint.setPosition(x,y,z);joint.setQuaternion(...q.toArray());joint.setDoF(DOF.EZ);joint.setMinLimits(-TWO_PI);joint.setMaxLimits(TWO_PI);
  parent.addChild(joint);joint.addChild(link);joints.push(joint);parent=link;
 }
 // Fixed flange/tool transform from the same URDF visual tree used by the app.
 const q=new T.Quaternion().setFromEuler(new T.Euler(0,-Math.PI/2,-Math.PI/2,'ZYX')).multiply(new T.Quaternion().setFromEuler(new T.Euler(Math.PI/2,0,Math.PI/2,'ZYX')));
 const end=new Joint(),tcp=new Link();end.setQuaternion(...q.toArray());parent.addChild(end);end.addChild(tcp);
 const tip=new Joint(),contact=new Link();tip.setPosition(0,0,a.toolOffset);tcp.addChild(tip);tip.addChild(contact);
 const goal=new Goal();goal.makeClosure(contact);
 const solver=new Solver(root);solver.useSVD=true;solver.maxIterations=30;solver.translationConvergeThreshold=1e-6;solver.rotationConvergeThreshold=1e-6;solver.stallThreshold=1e-8;solver.dampingFactor=1e-4;
 return {root,joints,tip,contact,goal,solver};
}
export function repositoryPose(a,kind=a.solverKind){
 const {position,quaternion}=localGoal(a);
 if(kind==='ur'){
  const flangePosition=position.clone().addScaledVector(new T.Vector3(0,0,1).applyQuaternion(quaternion),-a.toolOffset);
  const matrix=new T.Matrix4().compose(flangePosition,quaternion,new T.Vector3(1,1,1)).multiply(urFromTool).transpose();
  const choices=inverse(matrix.elements,a.angles[5]).map(q=>nearest(q,a.angles)).filter(Boolean);
  choices.sort((x,y)=>x.reduce((s,v,i)=>s+(v-a.angles[i])**2,0)-y.reduce((s,v,i)=>s+(v-a.angles[i])**2,0));
  a.solverResult={kind:'ur',solutions:choices.length,converged:!!choices.length};
  return choices[0]||null;
 }
 const c=a.repositoryChain??=chain(a);
 c.tip.setPosition(0,0,a.toolOffset);c.joints.forEach((joint,i)=>joint.setDoFValues(a.angles[i]));
 c.goal.setPosition(...position.toArray());c.goal.setQuaternion(...quaternion.toArray());
 const status=c.solver.solve();const q=nearest(c.joints.map(j=>j.dofValues[DOF.EZ]),a.angles);
 const point=[0,0,0],rotation=[0,0,0,1];c.contact.getWorldPosition(point);c.contact.getWorldQuaternion(rotation);
 const error=new T.Vector3(...point).distanceTo(position),angle=new T.Quaternion(...rotation).normalize().angleTo(quaternion);
 const valid=q&&error<.00003&&angle<.0001;
 a.solverResult={kind:'closed',status:Array.from(status),error,angle,converged:!!valid};
 return valid?q:null;
}
export function selectSolver(a,kind){
 if(!solverTypes[kind])return;
 a.needsAlignment=kind==='current'&&!a.orientationHold&&a.controlMode==='position';a.solverKind=kind;if(a.controlMode==='align')a.controlMode='joint';if(a.controlMode==='joint')a.jointTarget=[...a.angles];a.target.copy(a.actual);a.positionOrientation=a.tcp.getWorldQuaternion(new T.Quaternion());
 a.velocity.fill(0);a.cartesianVelocity?.set(0,0,0);a.solverResult=null;
}