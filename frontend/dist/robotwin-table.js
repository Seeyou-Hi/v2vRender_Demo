import * as T from './vendor/three.module.js';
// Port of RoboTwin create_table, MIT, ea8b21121ebb3cd201ff5b3fe361944ac94eda3f.
// The official table is procedural; the real upstream texture is included locally.
export const tableConfig={length:6.4,width:4.6,height:.74*2.8,thickness:.05*2.8,legSpacing:.1*2.8,topY:-.01};
export async function loadRoboTwinTableTexture(renderer){const map=await new T.TextureLoader().loadAsync(new URL('./models/robotwin-table/tabletop-61.jpg',import.meta.url).href);map.colorSpace=T.SRGBColorSpace;map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return map;}
export function createRoboTwinTable(texture=null,config=tableConfig){
 const {length,width,height,thickness,legSpacing,topY}=config,root=new T.Group();root.name='RoboTwin-table';root.userData.assetSource='RoboTwin create_table + background_texture/seen/61.png';
 const topMaterial=new T.MeshStandardMaterial({color:0xffffff,map:texture,metalness:.1,roughness:.3}),legMaterial=new T.MeshStandardMaterial({color:0xe3e5e3,metalness:0,roughness:.6}),parts=[];
 const add=(size,pos,label,material)=>{const m=new T.Mesh(new T.BoxGeometry(...size),material);m.position.set(...pos);m.castShadow=m.receiveShadow=true;m.userData.collisionLabel=label;root.add(m);parts.push(m);return m;};
 const tabletop=add([length,thickness,width],[0,topY-thickness/2,0],'RoboTwin 桌面',topMaterial),epsilon=.002*2.8;
 for(const i of [-1,1])for(const j of [-1,1])add([thickness,height-epsilon*2,thickness],[i*(length/2-legSpacing/2),topY-height/2-epsilon,j*(width/2-legSpacing/2)],'RoboTwin 桌腿',legMaterial);
 root.updateMatrixWorld(true);return {root,tabletop,parts,floorTop:topY-height,config};
}
