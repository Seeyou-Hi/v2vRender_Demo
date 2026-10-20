import {getMG4Proxy} from './mg4-proxy.js';
import * as T from './vendor/three.module.js';
import {makeViewportCaptureCamera} from './viewport-camera.js';
import {alignmentInfo} from './aligned-capture.js';
import {GPUFrameResolver} from './gpu-frame-resolver.js';
import {grayPNG,npy,zipFiles} from './data-formats.js';
export const unitsPerMeter=2.8;
export const captureViews={ext1:[0,4.1,8.8],ext2:[5.8,5.4,7.5],wrist:null};
export function makeCaptureCamera(name,width,height,arms=[],wristArm=0){
 const camera=new T.PerspectiveCamera(name==='wrist'?78:38,width/height,name==='wrist'?.0084:.03,60);
 if(name==='wrist'){
  const arm=arms[wristArm];if(!arm?.hand)throw Error('Wrist camera requires the selected robot wrist');
  arm.root.updateMatrixWorld(true);const mount=new T.Vector3(0,.09,-.04);
  camera.position.copy(arm.hand.localToWorld(mount.clone()));
  camera.quaternion.copy(arm.hand.getWorldQuaternion(new T.Quaternion())).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI));
  camera.userData.mount={type:'wrist',arm_id:arm.index+1,side:arm.index?'left':'right',parent:'hand_flange',position_in_parent_m:mount.toArray(),optical_axis_in_parent:[0,0,1],description:'Rigid wrist mount, downward in the default tool pose; follows wrist rotation'};
 }else{if(!captureViews[name])throw Error('Unknown camera '+name);camera.position.set(...captureViews[name]);camera.lookAt(0,.38,.15);}
 camera.updateMatrixWorld(true);return camera;
}
export function cameraMetadata(camera,width,height,rect={x:0,y:0,width,height}){
 const c2w=camera.matrixWorld.clone().multiply(new T.Matrix4().makeScale(1,-1,-1));c2w.elements[12]/=unitsPerMeter;c2w.elements[13]/=unitsPerMeter;c2w.elements[14]/=unitsPerMeter;
 const p=camera.projectionMatrix.elements;
 return {width,height,mount:camera.userData.mount||{type:'fixed_external'},axes:'OpenCV: x right, y down, z forward',content_rect_px:{x:rect.x,y:height-rect.y-rect.height,width:rect.width,height:rect.height},padding_depth:0,K:[[p[0]*rect.width/2,0,rect.x+(1-p[8])*rect.width/2],[0,p[5]*rect.height/2,height-rect.y-rect.height+(1+p[9])*rect.height/2],[0,0,1]],camera_to_world:rows(c2w),world_to_camera:rows(c2w.clone().invert()),near_m:camera.near/unitsPerMeter,far_m:camera.far/unitsPerMeter};
}
function rows(matrix){return Array.from({length:4},(_,r)=>Array.from({length:4},(_,c)=>matrix.elements[c*4+r]));}
function visibleMaterial(mesh){const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];return materials.some(m=>m?.visible);}
export async function rgbPNG(rgba,width,height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba),width,height),0,0);return new Uint8Array(await (await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG encoding failed')),'image/png'))).arrayBuffer());}
const vertex=`varying float cameraDepth; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);cameraDepth=-p.z;gl_Position=projectionMatrix*p;}`;
// 0.1 mm axial camera depth packed losslessly into an RGBA8 render target.
const fragment=`precision highp float; varying float cameraDepth; void main(){float n=floor(cameraDepth/2.8*10000.0+0.5);float r=floor(n/65536.0);float g=floor(mod(n,65536.0)/256.0);float b=mod(n,256.0);gl_FragColor=vec4(r,g,b,255.0)/255.0;}`;
export async function captureScene({renderer,scene,arms,items,width=640,height=480,raw=false,resources=null,saveDepth=true,saveMask=true,saveMG4=false,wristArm=0,views=Object.keys(captureViews),getCaptureCamera=null}){
 views=[...new Set(views)];if(!views.length||views.some(name=>name!=='viewport'&&!Object.hasOwn(captureViews,name)))throw Error('请选择有效的录制视角');
 const viewportSnapshot=views.includes('viewport')?makeViewportCaptureCamera(getCaptureCamera?.(),width,height):null;
 const meshes=[],hidden=[],membership=new Map(),owned=[];
 arms.forEach(a=>a.root.traverse(node=>{if(node.isMesh)membership.set(node,{arm:a.index+1,link:(a.index+1)*100+(node.userData.robotLink??7)+1});}));
 scene.traverse(node=>{if(node.isLine||node.isPoints||node.isSprite||node.userData.demoDecoration||arms.some(a=>node===a.ring)){hidden.push([node,node.visible]);node.visible=false;}if(node.isMesh&&visibleMaterial(node))meshes.push([node,node.material]);});
 const state={target:renderer.getRenderTarget(),toneMapping:renderer.toneMapping,outputColorSpace:renderer.outputColorSpace,background:scene.background,fog:scene.fog,shadow:renderer.shadowMap.enabled,clear:renderer.getClearColor(new T.Color()),alpha:renderer.getClearAlpha()};
 const sampleWidth=width*2,sampleHeight=height*2;
 const target=resources?.target||new T.WebGLRenderTarget(width*2,height*2,{depthBuffer:true,stencilBuffer:false}),rgbTarget=resources?.rgbTarget||new T.WebGLRenderTarget(width*2,height*2,{depthBuffer:true,stencilBuffer:false});rgbTarget.texture.colorSpace=T.SRGBColorSpace;const surfaceTarget=resources?.surfaceTarget||new T.WebGLRenderTarget(sampleWidth,sampleHeight,{depthBuffer:true,stencilBuffer:false}),resolver=resources?.resolver||new GPUFrameResolver(width,height),pending=[],captured=[],linkIds={},surfaceInfo=[null],surfaceMap=new Map(),rgbMaterials=[];
 for(const [node,material] of meshes){const member=membership.get(node),id=surfaceInfo.length;if(id>65535)throw Error('Too many capture surfaces');surfaceMap.set(node,id);surfaceInfo.push({arm:member?.arm||0,link:member?.link||0});const clone=m=>{const v=m.clone();v.transparent=false;v.opacity=1;v.depthWrite=true;v.depthTest=true;v.polygonOffset=false;v.alphaTest=0;v.side=T.DoubleSide;rgbMaterials.push(v);return v;};node.userData.captureMaterial=Array.isArray(material)?material.map(clone):clone(material);}
 owned.push(...rgbMaterials);
 const depth=resources?.depth||new T.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,side:T.DoubleSide,toneMapped:false});owned.push(depth);
 function idMaterial(id){const material=new T.MeshBasicMaterial({color:new T.Color().setRGB((id>>>8)/255,(id&255)/255,0),side:T.DoubleSide,fog:false,toneMapped:false,dithering:false});owned.push(material);return material;}
 const materials=resources?.materials||new Map();const idMat=id=>{if(!materials.has(id))materials.set(id,idMaterial(id));return materials.get(id);};
 let renderRect={x:0,y:0,width,height};
 const render=(camera,output=target)=>{output.viewport.set(renderRect.x*2,renderRect.y*2,renderRect.width*2,renderRect.height*2);output.scissor.copy(output.viewport);output.scissorTest=false;renderer.setRenderTarget(output);renderer.setClearColor(0,1);renderer.clear();output.scissorTest=true;renderer.setRenderTarget(output);renderer.render(scene,camera);output.scissorTest=false;return output;};
 try{
  resolver.setSurfaceInfo(surfaceInfo);scene.updateMatrixWorld(true);const timestamp=new Date().toISOString();
  const metadata={version:2,alignment:alignmentInfo,processing:{resolve:"GPU WebGL2 shaders",readback:"asynchronous PBO/fence",array_unpack:"CPU typed arrays"},timestamp,mg4_proxy:saveMG4?{channel:'RGB sRGB',style:'outlined flat low-poly 3D',geometry:'12-sided semantic object approximations; root pose and dimensions from simulator',model_resolution:[864,480]}:null,unit:'meter',scene_units_per_meter:unitsPerMeter,depth:'axial camera Z; 0 means no surface; float32 NPY in meters and 16-bit PNG in millimeters; precision 0.1 mm',mask_palette_rgb:{0:[0,0,0],1:[236,145,95],2:[102,176,216]},mask_id:{0:'background, table or objects',1:'right arm including gripper',2:'left arm including gripper'},link_id:linkIds,mask_visibility:'Visible surfaces with depth occlusion; all channels use opaque double-sided surfaces',matrix_layout:'row-major',world_axes:'x horizontal, y up, z toward front',cameras:{},arms:arms.map(a=>({id:a.index+1,side:a.index?'left':'right',gripper:a.gripper.kind,solver:a.solverKind,joints_rad:[...a.angles],tcp_position_m:a.actual.toArray().map(v=>v/unitsPerMeter),tcp_quaternion_xyzw:a.tcp.getWorldQuaternion(new T.Quaternion()).toArray()})),objects:items.map(item=>({label:item.label,position_m:item.mesh.position.toArray().map(v=>v/unitsPerMeter),quaternion_xyzw:item.mesh.quaternion.toArray(),asset:item.assetStyle||'original'}))};
  for(const [node] of meshes){const member=membership.get(node);if(member)linkIds[member.link]={arm_id:member.arm,link_index:member.link%100-1,label:node.userData.collisionLabel||'gripper'};}
  renderer.shadowMap.enabled=false;
  // Queue every scene/resolve/readback command before yielding. Restore materials
  // before awaiting fences so animation cannot observe temporary capture materials.
  for(const name of views){
   const camera=name==='viewport'?viewportSnapshot.camera:makeCaptureCamera(name,width,height,arms,wristArm);renderRect=name==='viewport'?viewportSnapshot.rect:{x:0,y:0,width,height};metadata.cameras[name]=cameraMetadata(camera,width,height,renderRect);
   renderer.shadowMap.enabled=state.shadow;renderer.toneMapping=state.toneMapping;renderer.outputColorSpace=T.SRGBColorSpace;scene.background=state.background;scene.fog=state.fog;meshes.forEach(([node,material])=>node.material=node.userData.captureMaterial);render(camera,rgbTarget);
   renderer.shadowMap.enabled=false;renderer.toneMapping=T.NoToneMapping;renderer.outputColorSpace=T.LinearSRGBColorSpace;scene.background=null;scene.fog=null;renderer.setClearColor(0,1);meshes.forEach(([node])=>node.material=depth);if(saveDepth)render(camera);
   meshes.forEach(([node])=>node.material=idMat(surfaceMap.get(node)));if(saveMask||saveDepth)render(camera,surfaceTarget);
   renderer.toneMapping=T.NoToneMapping;renderer.outputColorSpace=T.LinearSRGBColorSpace;
   // Both queues are submitted before yielding; the proxy pass restores depth/ID materials.
   const base=resolver.queue(renderer,rgbTarget,target,surfaceTarget,saveDepth,saveMask);
   const proxy=saveMG4?getMG4Proxy(scene,arms,items).capture(renderer,camera,width,height,renderRect):Promise.resolve(null);
   pending.push(Promise.all([base,proxy]).then(([resolved,mg4RGB])=>({name,...resolved,mg4RGB})));
  }
  meshes.forEach(([node,material])=>node.material=material);hidden.forEach(([node,visible])=>node.visible=visible);scene.background=state.background;scene.fog=state.fog;renderer.toneMapping=state.toneMapping;renderer.outputColorSpace=state.outputColorSpace;renderer.shadowMap.enabled=state.shadow;renderer.setClearColor(state.clear,state.alpha);renderer.setRenderTarget(state.target);
  captured.push(...await Promise.all(pending));
  if(saveMask)showMaskPreview(captured,width,height);
  if(raw)return {frames:captured,metadata};
  const files=[];for(const frame of captured){const add=(name,data)=>files.push({name:frame.name+'/'+name,data});add('rgb.png',await rgbPNG(frame.rgb,width,height));if(frame.mg4RGB)add('mg4_proxy.png',await rgbPNG(frame.mg4RGB,width,height));add('depth_m.npy',npy(frame.depthM,width,height));add('depth_mm.png',grayPNG(frame.depthMM,width,height,16));add('mask_id.png',await rgbPNG(maskRGBA(frame.mask),width,height));add('mask_preview.png',await rgbPNG(frame.maskPreview,width,height));add('depth_preview.png',await rgbPNG(frame.depthPreview,width,height));add('mask_coverage_right.npy',npy(frame.coverageRight,width,height));add('mask_coverage_left.npy',npy(frame.coverageLeft,width,height));add('sample_index.npy',npy(frame.sampleIndex,width,height));add('mask_id_raw.png',grayPNG(frame.mask,width,height));add('mask_id.npy',npy(frame.mask,width,height));add('link_id.png',grayPNG(frame.links,width,height,16));}
  files.push({name:'metadata.json',data:new TextEncoder().encode(JSON.stringify(metadata,null,2))});
  files.push({name:'README.txt',data:new TextEncoder().encode('Three synchronized views: ext1, ext2, wrist. Wrist is rigidly mounted on the selected hand flange; frame metadata provides its changing extrinsics.\nAll channels share 2x2 supersampling. Smooth mask/depth preview PNGs use identical footprint as RGB; raw IDs/depth use one recorded representative sample per pixel. See metadata alignment and coverage arrays. RGB: PNG, sRGB. Depth: axial camera Z, meters in NPY; millimeters in uint16 PNG. Invalid depth=0.\nmask_id.png: RGB color preview, orange=right, blue=left. mask_id_raw.png and mask_id.npy: uint8, 0=other/background, 1=right robot+gripper, 2=left robot+gripper.\nlink_id: uint16, 101..108=right robot links 0..7, 201..208=left robot links 0..7. See metadata.json.\nCamera matrices are row-major, camera uses OpenCV coordinates, world uses Y-up.\nAll GPU passes share the exact scene state; this is rendered geometric depth, not measured sensor data.\nPython: np.load("ext1/depth_m.npy"); np.array(PIL.Image.open("ext1/mask_id_raw.png"));\n')});
  return {blob:new Blob([zipFiles(files)],{type:'application/zip'}),metadata};
 }finally{
  meshes.forEach(([node,material])=>node.material=material);hidden.forEach(([node,visible])=>node.visible=visible);scene.background=state.background;scene.fog=state.fog;renderer.toneMapping=state.toneMapping;renderer.outputColorSpace=state.outputColorSpace;renderer.shadowMap.enabled=state.shadow;renderer.setClearColor(state.clear,state.alpha);renderer.setRenderTarget(state.target);rgbMaterials.forEach(m=>m.dispose());meshes.forEach(([node])=>delete node.userData.captureMaterial);await Promise.allSettled(pending);if(!resources){target.dispose();rgbTarget.dispose();surfaceTarget.dispose();resolver.dispose();owned.filter(m=>!rgbMaterials.includes(m)).forEach(m=>m.dispose());}
 }
}
export function installDataCapture({renderer,scene,arms,items,toast,before=()=>{},after=()=>{}}){
 const button=document.querySelector('#capture-data'),status=document.querySelector('#capture-status'),link=document.querySelector('#capture-download');let url=null;
 button.onclick=async()=>{const controls=Array.from(document.querySelectorAll('button,input,select')).map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);status.textContent='正在生成三个视角的数据…';before();try{const [width,height]=document.querySelector('#capture-size').value.split('x').map(Number);const result=await captureScene({renderer,scene,arms,items,width,height,saveMG4:!!document.querySelector('#record-mg4')?.checked,wristArm:Number(document.querySelector('#wrist-arm').value)});if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(result.blob);link.href=url;link.download='armature-'+result.metadata.timestamp.replace(/[:.]/g,'-')+'.zip';link.hidden=false;link.textContent='下载单帧数据包';status.textContent='三视角数据已就绪 · RGB / 深度 / ID';link.click();toast('三视角数据包已生成');}catch(error){console.error(error);status.textContent='导出失败，请重试';toast('数据导出失败');}finally{after();controls.forEach(([el,disabled])=>el.disabled=disabled);}};
}

export function maskRGBA(ids){const palette=[[0,0,0],[236,145,95],[102,176,216]],rgba=new Uint8Array(ids.length*4);for(let i=0;i<ids.length;i++){rgba.set(palette[ids[i]]||palette[0],i*4);rgba[i*4+3]=255;}return rgba;}

export function createCaptureResources(width,height){
 const target=new T.WebGLRenderTarget(width*2,height*2,{depthBuffer:true,stencilBuffer:false}),rgbTarget=new T.WebGLRenderTarget(width*2,height*2,{depthBuffer:true,stencilBuffer:false});rgbTarget.texture.colorSpace=T.SRGBColorSpace;
 const depth=new T.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,side:T.DoubleSide,toneMapped:false}),materials=new Map();
 const surfaceTarget=new T.WebGLRenderTarget(width*2,height*2,{depthBuffer:true,stencilBuffer:false}),resolver=new GPUFrameResolver(width,height);
 return {target,rgbTarget,surfaceTarget,resolver,depth,materials,dispose(){target.dispose();rgbTarget.dispose();surfaceTarget.dispose();resolver.dispose();depth.dispose();materials.forEach(m=>m.dispose());materials.clear();}};
}

function showMaskPreview(frames,width,height){
 const parent=document.querySelector('#mask-preview');if(!parent)return;parent.hidden=false;
 if(Array.from(parent.querySelectorAll('canvas')).map(c=>c.dataset.view).join()!==frames.map(f=>f.name).join()){parent.replaceChildren();for(const frame of frames){const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.dataset.view=frame.name;caption.textContent={ext1:'ext1 · 正面',ext2:'ext2 · 斜侧',wrist:'wrist · 腕部',viewport:'当前网页视角'}[frame.name];figure.append(canvas,caption);parent.append(figure);}}
 for(const frame of frames){const canvas=parent.querySelector('canvas[data-view="'+frame.name+'"]');if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(frame.maskPreview||maskRGBA(frame.mask)),width,height),0,0);}
}
