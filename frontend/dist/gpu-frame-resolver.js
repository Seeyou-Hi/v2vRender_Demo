import * as T from './vendor/three.module.js';
// Resolve the same four rays as the CPU reference. Raw depth and IDs select
// the same majority surface; ties preserve top-left first ordering.
const fragment=`precision highp float;
precision highp int;
uniform sampler2D rgbTex,depthTex,surfaceTex,lookupTex;
uniform bool hasDepth,hasSurface;
uniform int mode;
out vec4 result;
vec3 srgb(vec3 x){return mix(12.92*x,1.055*pow(max(x,vec3(0.0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),x));}
void main(){
 ivec2 base=ivec2(gl_FragCoord.xy)*2;
 // WebGL starts at bottom-left; export tie order starts at top-left.
 ivec2 offsets[4]=ivec2[4](ivec2(0,1),ivec2(1,1),ivec2(0,0),ivec2(1,0));
 int ids[4];vec4 depths[4];vec3 rgb=vec3(0);float gray=0.;int cr=0,cl=0;
 for(int k=0;k<4;k++){
  ivec2 p=base+offsets[k];rgb+=texelFetch(rgbTex,p,0).rgb;
  vec4 s=hasSurface?floor(texelFetch(surfaceTex,p,0)*255.+.5):vec4(0);
  ids[k]=int(s.r)*256+int(s.g);
  depths[k]=hasDepth?floor(texelFetch(depthTex,p,0)*255.+.5):vec4(0);
  float d=dot(depths[k].rgb,vec3(65536.,256.,1.))/10000.;
  gray+=d>0.?255.*(1.-min(d/5.,1.)):0.;
  int arm=int(floor(texelFetch(lookupTex,ivec2(ids[k]%256,ids[k]/256),0).r*255.+.5));
  if(arm==1)cr++;if(arm==2)cl++;
 }
 int best=0,bestCount=0;
 for(int k=0;k<4;k++){int n=0;for(int j=0;j<4;j++){if(ids[k]==ids[j])n++;}if(n>bestCount){best=k;bestCount=n;}}
 vec4 info=floor(texelFetch(lookupTex,ivec2(ids[best]%256,ids[best]/256),0)*255.+.5);
 if(mode==0)result=vec4(floor(clamp(srgb(rgb/4.),0.,1.)*255.+.5)/255.,1.);
 else if(mode==1)result=vec4(depths[best].rgb/255.,1.);
 else if(mode==2)result=vec4(info.rgb,float(best))/255.;
 else if(mode==3)result=vec4(float(cr),float(cl),floor(gray/4.+.5),255.)/255.;
 else result=vec4(floor((vec3(236.,145.,95.)*float(cr)+vec3(102.,176.,216.)*float(cl))/4.+.5)/255.,1.);
}`;
export function flipRows(data,width,height){const result=new Uint8Array(data.length),stride=width*4;for(let y=0;y<height;y++)result.set(data.subarray((height-1-y)*stride,(height-y)*stride),y*stride);return result;}
// Only unpacking/array serialization stays on CPU; no sampling, palette or
// majority-surface computation is repeated here.
export function unpackResolved(buffers,width,height,saveDepth,saveMask){
 const n=width*height,rgb=buffers.rgb,depthM=saveDepth?new Float32Array(n):null,depthMM=saveDepth?new Uint16Array(n):null,depthPreview=saveDepth?new Uint8Array(n*4):null,mask=saveMask?new Uint8Array(n):null,links=saveMask?new Uint16Array(n):null,coverageRight=saveMask?new Float32Array(n):null,coverageLeft=saveMask?new Float32Array(n):null,sampleIndex=new Uint8Array(n);
 for(let p=0;p<n;p++){const q=p*4;if(buffers.ids)sampleIndex[p]=buffers.ids[q+3];if(saveDepth){const d=(buffers.depth[q]*65536+buffers.depth[q+1]*256+buffers.depth[q+2])/10000;depthM[p]=d;depthMM[p]=Math.min(65535,Math.round(d*1000));depthPreview[q]=depthPreview[q+1]=depthPreview[q+2]=buffers.aux[q+2];depthPreview[q+3]=255;}if(saveMask){mask[p]=buffers.ids[q];links[p]=buffers.ids[q+1]*256+buffers.ids[q+2];coverageRight[p]=buffers.aux[q]/4;coverageLeft[p]=buffers.aux[q+1]/4;}}
 return {rgb,depthM,depthMM,depthPreview,mask,links,coverageRight,coverageLeft,sampleIndex,maskPreview:saveMask?buffers.mask:null};
}
export class GPUFrameResolver{
 constructor(width,height){
  this.width=width;this.height=height;this.lookup=new T.DataTexture(new Uint8Array(256*256*4),256,256);this.lookup.minFilter=this.lookup.magFilter=T.NearestFilter;this.lookup.generateMipmaps=false;
  const uniforms={rgbTex:{value:null},depthTex:{value:null},surfaceTex:{value:null},lookupTex:{value:this.lookup},hasDepth:{value:true},hasSurface:{value:true},mode:{value:0}};
  this.material=new T.RawShaderMaterial({glslVersion:T.GLSL3,uniforms,vertexShader:'precision highp float; in vec3 position; void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:fragment,depthTest:false,depthWrite:false,toneMapped:false});
  this.geometry=new T.PlaneGeometry(2,2);this.scene=new T.Scene();this.scene.add(new T.Mesh(this.geometry,this.material));this.camera=new T.Camera();this.targets=new Map();
 }
 setSurfaceInfo(info){const bytes=this.lookup.image.data;bytes.fill(0);info.forEach((v,i)=>{if(v){bytes[i*4]=v.arm;bytes[i*4+1]=v.link>>>8;bytes[i*4+2]=v.link&255;}});this.lookup.needsUpdate=true;}
 queue(renderer,rgbTarget,depthTarget,surfaceTarget,saveDepth,saveMask){
  const u=this.material.uniforms;u.rgbTex.value=rgbTarget.texture;u.depthTex.value=depthTarget.texture;u.surfaceTex.value=surfaceTarget.texture;u.hasDepth.value=saveDepth;u.hasSurface.value=saveDepth||saveMask;
  const modes=[['rgb',0],...(saveDepth?[['depth',1]]:[]),...(saveDepth||saveMask?[['ids',2],['aux',3]]:[]),...(saveMask?[['mask',4]]:[])],pending=[];
  for(const [key,mode] of modes){let target=this.targets.get(key);if(!target){target=new T.WebGLRenderTarget(this.width,this.height,{depthBuffer:false,stencilBuffer:false,minFilter:T.NearestFilter,magFilter:T.NearestFilter});this.targets.set(key,target);}u.mode.value=mode;renderer.setRenderTarget(target);renderer.render(this.scene,this.camera);const bytes=new Uint8Array(this.width*this.height*4);pending.push(renderer.readRenderTargetPixelsAsync(target,0,0,this.width,this.height,bytes).then(()=>[key,flipRows(bytes,this.width,this.height)]));}
  return Promise.all(pending).then(values=>unpackResolved(Object.fromEntries(values),this.width,this.height,saveDepth,saveMask));
 }
 dispose(){this.targets.forEach(t=>t.dispose());this.material.dispose();this.geometry.dispose();this.lookup.dispose();}
}

const streamFragment = `precision highp float;
precision highp int;
uniform sampler2D rgbTex,depthTex;
uniform int mode;
out vec4 result;
vec3 srgb(vec3 x){return mix(12.92*x,1.055*pow(max(x,vec3(0.0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),x));}
void main(){
 ivec2 base=ivec2(gl_FragCoord.xy)*2;
 ivec2 offsets[4]=ivec2[4](ivec2(0,1),ivec2(1,1),ivec2(0,0),ivec2(1,0));
 vec3 rgb=vec3(0);float gray=0.;
 for(int k=0;k<4;k++){
  if(mode==0)rgb+=texelFetch(rgbTex,base+offsets[k],0).rgb;
  else {vec3 depthBytes=floor(texelFetch(depthTex,base+offsets[k],0).rgb*255.+.5);
   float d=dot(depthBytes,vec3(65536.,256.,1.))/10000.;
   gray+=d>0.?255.*(1.-min(d/5.,1.)):0.;}
 }
 result=mode==0?vec4(floor(clamp(srgb(rgb/4.),0.,1.)*255.+.5)/255.,1.):vec4(vec3(floor(gray/4.+.5)/255.),1.);
}`;

// Two readbacks for depth streams, one for Canny. Export resolver stays unchanged.
export class GPUStreamResolver {
 constructor(width,height){
  this.width=width;this.height=height;
  this.material=new T.RawShaderMaterial({glslVersion:T.GLSL3,
   uniforms:{rgbTex:{value:null},depthTex:{value:null},mode:{value:0}},
   vertexShader:'precision highp float; in vec3 position; void main(){gl_Position=vec4(position.xy,0.,1.);}',
   fragmentShader:streamFragment,depthTest:false,depthWrite:false,toneMapped:false});
  this.geometry=new T.PlaneGeometry(2,2);this.scene=new T.Scene();this.scene.add(new T.Mesh(this.geometry,this.material));this.camera=new T.Camera();this.targets=new Map();
 }
 queue(renderer,rgbTarget,depthTarget,saveDepth){
  const u=this.material.uniforms;u.rgbTex.value=rgbTarget.texture;u.depthTex.value=depthTarget.texture;
  const modes=[['rgb',0],...(saveDepth?[['depthPreview',1]]:[])];
  const pending=modes.map(([key,mode])=>{
   if(!this.targets.has(key))this.targets.set(key,new T.WebGLRenderTarget(this.width,this.height,{depthBuffer:false,stencilBuffer:false,minFilter:T.NearestFilter,magFilter:T.NearestFilter}));
   const target=this.targets.get(key);u.mode.value=mode;renderer.setRenderTarget(target);renderer.render(this.scene,this.camera);
   const bytes=new Uint8Array(this.width*this.height*4);
   return renderer.readRenderTargetPixelsAsync(target,0,0,this.width,this.height,bytes).then(()=>[key,flipRows(bytes,this.width,this.height)]);
  });
  return Promise.all(pending).then(values=>Object.fromEntries(values));
 }
 dispose(){this.targets.forEach(t=>t.dispose());this.material.dispose();this.geometry.dispose();}
}
