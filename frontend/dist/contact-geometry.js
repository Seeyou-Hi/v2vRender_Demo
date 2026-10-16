import * as T from './vendor/three.module.js';
// One authored surface list supplies collision, jaw sampling and Rapier pieces.
const cache=new WeakMap();
export function contactMeshes(item){
 const root=item.mesh||item;if(cache.has(root))return cache.get(root);
 const list=[];root.traverse(mesh=>{if(mesh===root||!mesh.isMesh||mesh.userData.collisionSkip)return;const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];if(mesh.userData.contactSurface||mesh.visible&&materials.some(m=>m?.visible))list.push(mesh);});cache.set(root,list);return list;
}
function hull2(points){
 const unique=new Map();points.forEach(p=>unique.set(p.x.toFixed(6)+','+p.z.toFixed(6),[p.x,p.z]));const list=[...unique.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(list.length<3)return [];
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),lower=[],upper=[];
 for(const p of list){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=1e-10)lower.pop();lower.push(p);}
 for(const p of list.slice().reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=1e-10)upper.pop();upper.push(p);}lower.pop();upper.pop();return lower.concat(upper);
}
function outline(points,count=32){
 const lines=Array.from({length:count},(_,i)=>{const angle=i*Math.PI*2/count,x=Math.cos(angle),z=Math.sin(angle);return {x,z,h:Math.max(...points.map(p=>p[0]*x+p[1]*z))};}),result=[];
 for(let i=0;i<count;i++){const a=lines[i],b=lines[(i+1)%count],d=a.x*b.z-b.x*a.z,p=[(a.h*b.z-b.h*a.z)/d,(a.x*b.h-b.x*a.h)/d];if(!result.length||Math.hypot(p[0]-result.at(-1)[0],p[1]-result.at(-1)[1])>1e-7)result.push(p);}
 if(result.length>1&&Math.hypot(result[0][0]-result.at(-1)[0],result[0][1]-result.at(-1)[1])<1e-7)result.pop();return result;
}
export function layeredContactGeometry(points,bounds,layers=24){
 const dy=(bounds.max.y-bounds.min.y)/layers,result=[];
 for(let i=0;i<layers;i++){
  const lo=bounds.min.y+i*dy,hi=lo+dy,hull=hull2(points.filter(p=>p.y>=lo-dy/2&&p.y<=hi+dy/2));if(hull.length<3)continue;const polygon=outline(hull);
  const positions=[],tri=(a,b,c)=>positions.push(...a,...b,...c),bottom=polygon.map(([x,z])=>[x,lo,z]),top=polygon.map(([x,z])=>[x,hi,z]);
  for(let j=0;j<polygon.length;j++){const k=(j+1)%polygon.length;tri(bottom[j],top[j],top[k]);tri(bottom[j],top[k],bottom[k]);}
  for(let j=1;j<polygon.length-1;j++){tri(bottom[0],bottom[j],bottom[j+1]);tri(top[0],top[j+1],top[j]);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.userData.contactPrism={polygon,lo,hi};result.push(geometry);
 }
 return result;
}
