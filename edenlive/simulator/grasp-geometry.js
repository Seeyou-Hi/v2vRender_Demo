import {contactMeshes} from './contact-geometry.js';
import * as T from './vendor/three.module.js';
// Clip actual object triangles to the pad's Y/Z slab in the rotated tool frame.
// X is the jaw closing direction; values stay in scene units throughout.
function clip(poly,axis,limit,sign){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-limit)*sign,db=(b[axis]-limit)*sign;if(da>=0)out.push(a);if((da>=0)!==(db>=0))out.push(a.clone().lerp(b,da/(da-db)));}return out;}
function graspTriangles(a,item){
 a.root.updateWorldMatrix(true,true);item.mesh.updateWorldMatrix(true,true);
 const rotation=a.hand.getWorldQuaternion(new T.Quaternion()),origin=a.actual.clone(),frame=new T.Matrix4().compose(origin,rotation,new T.Vector3(1,1,1)).invert(),triangles=[];
 contactMeshes(item).forEach(mesh=>{
  if(mesh.userData.graspIgnore)return;
  const geometry=mesh.geometry,position=geometry.attributes.position;if(!position)return;
  const transform=frame.clone().multiply(mesh.matrixWorld),index=geometry.index,count=index?index.count:position.count;
  for(let i=0;i<count;i+=3){const triangle=[];for(let j=0;j<3;j++)triangle.push(new T.Vector3().fromBufferAttribute(position,index?index.getX(i+j):i+j).applyMatrix4(transform));triangles.push(triangle);}
 });
 return {triangles,origin,inverse:rotation.invert()};
}
function sampleGrasp(a,item,position=a.actual,regionOverride=null,compiled=graspTriangles(a,item)){
 const region=regionOverride||a.gripper.region||{minY:-.045*2.8/2,maxY:.045*2.8/2,minZ:-.115*2.8,maxZ:0};
 const shift=position.clone().sub(compiled.origin).applyQuaternion(compiled.inverse),bounds=new T.Box3();let points=0;
 for(const triangle of compiled.triangles){let polygon=triangle;
  for(const [axis,limit,sign] of [['y',region.minY+shift.y,1],['y',region.maxY+shift.y,-1],['z',region.minZ+shift.z,1],['z',region.maxZ+shift.z,-1]]){polygon=clip(polygon,axis,limit,sign);if(!polygon.length)break;}
  for(const p of polygon){bounds.expandByPoint(p);points++;}
 }
 if(points){bounds.min.sub(shift);bounds.max.sub(shift);}
 if(!points)return null;
 const width=bounds.max.x-bounds.min.x,center=(bounds.max.x+bounds.min.x)/2;
 // Assisted grasp: any lateral position inside the jaw envelope is valid.
 // Keep the payload pose; the nearer pad determines the stopping opening.
 if(width<.001)return null;
 const opening=2*Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))+.0006;
 return {opening,width,center,bounds,fits:opening<=a.gripper.maxOpening+.00001};
}
// Repository fingers move forward as they close. Evaluate contact at the
// actual future opening, not just the wide-open finger-tip slab.
function measureRaw(a,item){
 const compiled=graspTriangles(a,item);
 if(a.gripper.kind==='original')return sampleGrasp(a,item,a.actual,null,compiled);
 const max=a.gripper.maxOpening,min=Math.max(.001,a.gripper.minOpening||0);
 const sample=gap=>{const profile=a.gripper.contactAtOpening(gap),point=a.hand.localToWorld(new T.Vector3(0,0,profile.tipZ));return sampleGrasp(a,item,point,profile.region,compiled);};
 {
  let outside=max;
  for(let i=0;i<=10;i++){
   const gap=max+(min-max)*i/10,result=sample(gap);
   if(result&&result.opening>=gap-.00005){
    if(i===0&&result.opening>max+.0001)return result;
    let low=gap,high=outside,best=result;
    for(let k=0;k<10;k++){const middle=(low+high)/2,r=sample(middle);if(r&&r.opening>=middle){low=middle;best=r;}else high=middle;}
    const opening=Math.min(max,high+.0002),contact=sample(opening)||best;
    return {...contact,opening,fits:opening<=max+.00001};
   }
   outside=gap;
  }
  return null;
 }
}
export function bindGrasp(a,item,opening){
 const worldPosition=item.mesh.getWorldPosition(new T.Vector3()),worldRotation=item.mesh.getWorldQuaternion(new T.Quaternion());
 return {item,opening,position:a.hand.worldToLocal(worldPosition),quaternion:a.hand.getWorldQuaternion(new T.Quaternion()).invert().multiply(worldRotation)};
}

export function inspectGraspGeometry(a,item){
 const distance=item.mesh.getWorldPosition(new T.Vector3()).distanceTo(a.actual);
 if(distance>Math.max(.45,item.halfHeight+.25))return {status:'far',ready:false,item,grasp:null,message:'请靠近物品再抓取'};
 const grasp=measureRaw(a,item);
 if(!grasp)return {status:'outside',ready:false,item,grasp:null,message:'物品尚未进入两指有效夹持区，请调整高度或前后位置'};
 if(!grasp.fits)return {status:'too_wide',ready:false,item,grasp,message:'该截面超出夹爪开口，请调整夹持位置或方向'};
 return {status:'ready',ready:true,item,grasp,message:'已进入夹持区，可闭合夹爪'};
}
export function measureGrasp(a,item){return inspectGraspGeometry(a,item).grasp;}
