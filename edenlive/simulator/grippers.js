import * as T from './vendor/three.module.js';
import {STLLoader} from './vendor/STLLoader.js';
import {ColladaLoader} from './vendor/ColladaLoader.js';
export const gripperTypes={original:{name:'原始演示夹爪'},robotiq:{name:'Robotiq 2F-85'},xarm:{name:'UFACTORY xArm'}};
const cache=new Map(),contactProfiles=new Map(),SCALE=2.8;
export async function loadGripperAssets(kind){
 if(kind==='original')return null;
 if(!cache.has(kind))cache.set(kind,(async()=>{
  const root='./models/grippers/'+kind+'/',data=await (await fetch(root+'assembly.json')).json();
  const stl=new STLLoader(),dae=new ColladaLoader(),parts={};
  await Promise.all(data.links.map(async link=>{
   const geometry=await stl.loadAsync(root+link.mesh+'.stl');geometry.computeBoundingBox();
   let visual=null;
   if(kind==='robotiq'){visual=(await dae.loadAsync(root+link.mesh+'.dae')).scene;visual.rotation.set(0,0,0);}
   parts[link.name]={geometry,visual};
  }));
  return {data,parts};
 })());
 try{return await cache.get(kind);}catch(e){cache.delete(kind);throw e;}
}
export function createGripper(kind,index,assets=null){
 const root=new T.Group();root.name=kind+'-gripper';
 const metal=new T.MeshStandardMaterial({color:0xa6afb7,metalness:.75,roughness:.34});
 const dark=new T.MeshStandardMaterial({color:0x303944,metalness:.35,roughness:.4});
 const accent=new T.MeshStandardMaterial({color:index?0x80aac4:0xdc925c,metalness:.35,roughness:.4});
 const mark=m=>{m.userData.robotLink=7;m.userData.collisionLabel='夹爪';m.userData.collisionPrecise=true;m.castShadow=m.receiveShadow=true;return m;};
 function addMount(baseZ,radius){
  const start=-.0125,end=baseZ+.0005,height=end-start;
  const mount=mark(new T.Mesh(new T.CylinderGeometry(radius,radius,height,48),metal));mount.rotation.x=Math.PI/2;mount.position.z=(start+end)/2;mount.userData.robotLink=6;mount.userData.collisionLabel='夹爪安装座';root.add(mount);
  return {start,end,radius};
 }
 if(kind==='original'){
  addMount(0,.036);
  const palm=mark(new T.Mesh(new T.BoxGeometry(.165,.07,.06),accent));palm.position.z=.03;root.add(palm);
  const fingers=[-1,1].map(side=>{const f=mark(new T.Mesh(new T.BoxGeometry(.016,.045,.115),metal));f.userData.contactRole='pad';f.position.set(side*.075,0,.116);root.add(f);return f;});
  return {kind,root,fingers,tipZ:.174,maxOpening:.3752,opening:.3752,region:{minY:-.0225*SCALE,maxY:.0225*SCALE,minZ:(.0585-.174)*SCALE,maxZ:(.1735-.174)*SCALE},
   setOpening(gap){const half=gap/SCALE/2+.008;fingers.forEach((f,i)=>f.position.x=(i?1:-1)*half);this.opening=gap;},
   graspHeight:item=>item.graspHeight,
   fits:item=>(item.maxHalfWidth??item.gripHalfWidth)*2+.0006<=.3752};
 }
 if(!assets)throw Error('Gripper assets are required');
 const {data,parts}=assets,model=new T.Group();model.rotation.z=data.rotateZ;root.add(model);
 const mount=addMount(Math.max(0,parts[data.base].geometry.boundingBox.min.z),kind==='robotiq'?.036:.034);
 const links=new Map(),pads=[],joints=[];
 for(const link of data.links){
  const group=new T.Group();links.set(link.name,group);
  const part=parts[link.name];
  if(part.visual){const visual=part.visual.clone(true);visual.traverse(m=>{if(m.isMesh){mark(m);m.userData.collisionSkip=true;}});group.add(visual);}
  const mesh=mark(new T.Mesh(part.geometry,part.visual?new T.MeshBasicMaterial({visible:false}):(link.mesh==='base_link'?accent:metal)));
  mesh.name=link.name;mesh.userData.contactRole=data.pads.includes(link.name)?'pad':'body';mesh.userData.collisionLabel=data.pads.includes(link.name)?'夹爪指垫':link.name===data.base?'夹爪主体':'夹爪连杆';
  mesh.userData.assetShared=true;group.add(mesh);
  if(data.pads.includes(link.name))pads.push(mesh);
 }
 model.add(links.get(data.base));
 for(const joint of data.joints){
  const origin=new T.Group();origin.position.set(...joint.xyz);origin.rotation.set(...joint.rpy,'ZYX');links.get(joint.parent).add(origin);
  const pivot=new T.Group();origin.add(pivot);pivot.add(links.get(joint.child));joints.push({pivot,axis:new T.Vector3(...joint.axis).normalize(),multiplier:joint.multiplier});
 }
 function atAngle(angle){
  joints.forEach(j=>j.pivot.quaternion.setFromAxisAngle(j.axis,angle*j.multiplier));
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert(),points=pads.map(mesh=>{
   const transform=inverse.clone().multiply(mesh.matrixWorld),values=mesh.geometry.attributes.position,result=[];
   for(let i=0;i<values.count;i++)result.push(new T.Vector3().fromBufferAttribute(values,i).applyMatrix4(transform));
   return result;
  });
  const tipZ=Math.max(...points.flat().map(p=>p.z));
  const boxes=points.map(values=>new T.Box3().setFromPoints(values.filter(p=>p.z>tipZ-.025)));
  boxes.sort((a,b)=>a.getCenter(new T.Vector3()).x-b.getCenter(new T.Vector3()).x);
  const gap=Math.max(0,boxes[1].min.x-boxes[0].max.x)*SCALE;
  const minY=Math.min(...boxes.map(b=>b.min.y))*SCALE,maxY=Math.max(...boxes.map(b=>b.max.y))*SCALE;
  return {gap,tipZ,angle,region:{minY,maxY,minZ:-.025*SCALE,maxZ:0},graspHeight:(tipZ-Math.min(...boxes.map(b=>b.min.z)))*SCALE/2};
 }
 const open=atAngle(0),closed=atAngle(data.angleMax);
 if(!contactProfiles.has(kind))contactProfiles.set(kind,Array.from({length:65},(_,i)=>atAngle(data.angleMax*i/64)));
 const profiles=contactProfiles.get(kind);
 const contactAtOpening=gap=>{let i=0;while(i<profiles.length-2&&profiles[i+1].gap>gap)i++;const a=profiles[i],b=profiles[i+1],t=T.MathUtils.clamp((a.gap-gap)/(a.gap-b.gap||1),0,1),lerp=(x,y)=>x+(y-x)*t;return {tipZ:lerp(a.tipZ,b.tipZ),angle:lerp(a.angle,b.angle),region:Object.fromEntries(Object.keys(a.region).map(key=>[key,lerp(a.region[key],b.region[key])]))};};
 const result={kind,root,pads,joints,mount,contactAtOpening,tipZ:open.tipZ,maxOpening:open.gap,minOpening:closed.gap,opening:open.gap,angle:0,region:open.region,
  setOpening(requested){
   if(this.requested!==undefined&&Math.abs(this.requested-requested)<1e-9)return;this.requested=requested;
   const target=T.MathUtils.clamp(requested,closed.gap,open.gap);
   let low=0,high=data.angleMax,state=open;
   for(let i=0;i<16;i++){const middle=(low+high)/2;state=atAngle(middle);if(state.gap>target)low=middle;else high=middle;}
   state=atAngle((low+high)/2);this.angle=(low+high)/2;this.opening=state.gap;this.tipZ=state.tipZ;this.contactHeight=state.graspHeight;this.region=state.region;
  },
  graspHeight(item){return Math.min(.035,.085-item.halfHeight);},
  fits:item=>(item.maxHalfWidth??item.gripHalfWidth)*2+.0006<=open.gap
 };
 result.setOpening(open.gap);return result;
}
export function disposeGripper(gripper){
 gripper.root.parent?.remove(gripper.root);
 gripper.root.traverse(m=>{if(m.geometry&&(gripper.kind==='original'||!m.userData.assetShared&&!m.userData.collisionSkip))m.geometry.dispose();if(m.material&&!m.userData.collisionSkip)(Array.isArray(m.material)?m.material:[m.material]).forEach(mat=>mat.dispose());});
 // Shared repository geometry and materials stay cached for subsequent switches.
}
