import * as T from './vendor/three.module.js';
import {createAssetModel} from './table-assets.js';
const material=(color,metalness=0,roughness=.45)=>new T.MeshStandardMaterial({color,metalness,roughness});
function add(parent,geometry,mat,position=[0,0,0]){
  const mesh=new T.Mesh(geometry,mat);mesh.position.set(...position);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.collisionPrecise=true;parent.add(mesh);return mesh;
}
function apple(index){
  const model=new T.Group();
  const geometry=new T.SphereGeometry(.107,36,24),positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    const angle=Math.atan2(z,x),height=y/.107;
    const lobe=1+.045*Math.cos(angle*5)*(Math.abs(height)*.6+.4);
    const dip=.014*Math.exp(-(x*x+z*z)/.0012);
    positions.setXYZ(i,x*lobe,y*(.96)+(height>0?-dip:dip*.35),z*lobe);
  }
  positions.needsUpdate=true;geometry.computeVertexNormals();
  add(model,geometry,material(index?'#80ab46':'#c64335',.05,.32));
  const stem=add(model,new T.CylinderGeometry(.008,.01,.042,12),material('#61402b'),[0,.12,0]);stem.rotation.z=-.22;stem.userData.graspIgnore=true;
  const leaf=add(model,new T.SphereGeometry(1,16,10),material('#4a7639'),[.032,.13,.006]);leaf.scale.set(.041,.007,.018);leaf.rotation.z=.38;leaf.userData.graspIgnore=true;
  return model;
}
function pen(index){
  const model=new T.Group(),barrel=material(index?'#244558':'#20252e',.4,.25),trim=material(index?'#bcc3c9':'#d3ae64',.85,.25);
  const body=add(model,new T.CylinderGeometry(.025,.025,.36,24),barrel);body.rotation.x=Math.PI/2;
  const cap=add(model,new T.CylinderGeometry(.028,.028,.15,24),barrel,[0,0,-.245]);cap.rotation.x=Math.PI/2;
  for(const z of [-.172,.18]){const ring=add(model,new T.CylinderGeometry(.029,.029,.018,24),trim,[0,0,z]);ring.rotation.x=Math.PI/2;}
  const nib=add(model,new T.ConeGeometry(.025,.1,24),trim,[0,0,.23]);nib.rotation.x=Math.PI/2;
  add(model,new T.BoxGeometry(.009,.012,.115),trim,[0,.031,-.225]);
  return model;
}
function bottle(index){
 const model=new T.Group(),plastic=material('#b8d9e4',.05,.22);plastic.transparent=true;plastic.opacity=.55;plastic.depthWrite=false;
 const water=material('#75bbd5',.05,.18);water.transparent=true;water.opacity=.65;
 add(model,new T.CylinderGeometry(.062,.058,.338,40),plastic,[0,-.021,0]);
 add(model,new T.CylinderGeometry(.026,.062,.012,40),plastic,[0,.154,0]);
 add(model,new T.CylinderGeometry(.026,.026,.012,32),plastic,[0,.166,0]);
 add(model,new T.CylinderGeometry(.030,.030,.017,32),material(index?'#d8e5ed':'#326eae',.1,.34),[0,.1805,0]);
 add(model,new T.CylinderGeometry(.056,.052,.28,36),water,[0,-.025,0]);
 add(model,new T.CylinderGeometry(.0622,.0622,.065,40),material(index?'#b4d9d3':'#a8c9e2',.02,.65),[0,-.03,0]);
 add(model,new T.CylinderGeometry(.058,.058,.01,40),plastic,[0,-.195,0]);
 for(const y of [-.14,-.105,.07,.10]){const ring=add(model,new T.TorusGeometry(.061,.0009,6,40),plastic,[0,y,0]);ring.rotation.x=Math.PI/2;}
 return model;
}
function can(index){
 const model=new T.Group(),body=material(index?'#8ba1b4':'#d69d55',.55,.3),rim=material('#bac2c8',.85,.25);
 add(model,new T.CylinderGeometry(.056,.056,.19,40),body);
 for(const y of [-.096,.096])add(model,new T.CylinderGeometry(.056,.056,.006,40),rim,[0,y,0]);
 const tab=add(model,new T.TorusGeometry(.013,.003,8,24),rim,[0,.102,0]);tab.rotation.x=Math.PI/2;tab.scale.x=.65;
 add(model,new T.CylinderGeometry(.056,.056,.065,40),material(index?'#c9d5dc':'#ead8b1',.1,.65),[0,-.015,0]);
 return model;
}
export const itemSets={
  blocks:{name:'彩色物块',labels:['橙色物块','蓝色物块']},
  apples:{name:'苹果',labels:['红苹果','青苹果']},
  pens:{name:'钢笔',labels:['黑金钢笔','蓝银钢笔']},
  mixed:{name:'苹果与钢笔',labels:['红苹果','蓝银钢笔'],types:['apples','pens']},
  bottles:{name:'水瓶',labels:['蓝盖水瓶','白盖水瓶']},
  cans:{name:'易拉罐',labels:['橙色易拉罐','银色易拉罐']},
  drinks:{name:'水瓶与易拉罐',labels:['蓝盖水瓶','银色易拉罐'],types:['bottles','cans']}
};
export function createTableItems(kind='blocks',style='original'){
  if(!itemSets[kind])kind='blocks';
  return [0,1].map(index=>{
    const type=itemSets[kind].types?.[index]||kind;
    let model=style==='robotwin'?createAssetModel(type,index):null;
    const imported=!!model;
    if(!model){
    if(type==='apples')model=apple(index);
    else if(type==='pens')model=pen(index);
    else if(type==='bottles')model=bottle(index);
    else if(type==='cans')model=can(index);
    else {model=new T.Group();add(model,new T.BoxGeometry(.14,.14,.14),material(index?'#80aac4':'#dc925c',.2));}
    }
    if(!imported&&type==='bottles')model.scale.setScalar(1.65);
    if(!imported&&type==='cans')model.scale.setScalar(1.7);
    model.updateWorldMatrix(true,true);
    const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
    model.position.sub(center);
    // Hidden parent mesh provides a conservative local collision volume.
    const mesh=new T.Mesh(new T.BoxGeometry(size.x,size.y,size.z),new T.MeshBasicMaterial({visible:false}));
    mesh.add(model);const x=index?-.85:.85,start=[x,size.y/2,.8];mesh.position.set(...start);
    return {mesh,start,zone:index,label:imported?({apples:'苹果',bottles:'水瓶',cans:'易拉罐'}[type]+' '+(index+1)):itemSets[kind].labels[index],kind:type,assetStyle:imported?'robotwin':'original',halfHeight:size.y/2,
      graspHeight:Math.min(.11,.31-size.y/2,Math.max(size.y/2,.09)),gripHalfWidth:imported?size.x/2:type==='pens'?.025:type==='bottles'?.0622*1.65:type==='cans'?.056*1.7:size.x/2,maxHalfWidth:size.x/2,
      holdRotation:new T.Quaternion().setFromEuler(new T.Euler(-Math.PI/2,0,0)),fallSpeed:0};
  });
}
export function disposeTableItem(item){
  const geometries=new Set(),materials=new Set();
  item.mesh.traverse(node=>{if(node.userData.assetShared)return;if(node.geometry)geometries.add(node.geometry);if(node.material)(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>materials.add(m));});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
