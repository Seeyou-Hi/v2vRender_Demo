// All channels resolve the same four rays and use the same box filter.
export const alignmentInfo={version:1,supersample_scale:2,samples_per_pixel:4,filter:'2x2 box, same sample positions in RGB/depth/IDs',sample_offsets_pixels:[[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]],raw_sample_rule:'majority visible mesh surface; ties choose first in top-left, top-right, bottom-left, bottom-right order; depth, mask and link use this exact same sample',visual_depth:'average of per-sample 0..5m grayscale, not metric depth',visual_mask:'coverage-weighted palette; fractional colors are visualization, not IDs',rgb_materials:'opaque, double-sided geometry for all capture passes, matching depth and IDs',exact_alignment:'Use lossless per-frame PNG/NPY and coverage arrays. MP4/WebM videos are lossy previews and may have compression edge artifacts.'};
const palette=[[0,0,0],[236,145,95],[102,176,216]];
const linear=Float32Array.from({length:256},(_,v)=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
const srgb=v=>Math.round(255*(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055));
export function resolveAlignedFrame({rgb:highRGB,depth:packed,surfaces,surfaceInfo,width,height}){
 const count=width*height,highWidth=width*2,rgb=new Uint8Array(count*4),depthM=packed?new Float32Array(count):null,depthMM=packed?new Uint16Array(count):null,depthPreview=packed?new Uint8Array(count*4):null,mask=surfaces?new Uint8Array(count):null,links=surfaces?new Uint16Array(count):null,maskPreview=surfaces?new Uint8Array(count*4):null,coverageRight=surfaces?new Float32Array(count):null,coverageLeft=surfaces?new Float32Array(count):null,sampleIndex=new Uint8Array(count),indices=new Int32Array(4),ids=new Uint16Array(4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=y*width+x,o=p*4,start=(y*2*highWidth+x*2)*4;indices[0]=start;indices[1]=start+4;indices[2]=start+highWidth*4;indices[3]=start+(highWidth+1)*4;
  let best=0,bestCount=0,gray=0,cr=0,cl=0,r=0,g=0,b=0;
  for(let k=0;k<4;k++){const q=indices[k];ids[k]=surfaces?surfaces[q]*256+surfaces[q+1]:0;r+=linear[highRGB[q]];g+=linear[highRGB[q+1]];b+=linear[highRGB[q+2]];if(packed){const d=(packed[q]*65536+packed[q+1]*256+packed[q+2])/10000;gray+=d>0?255*(1-Math.min(d/5,1)):0;}if(surfaces){const arm=surfaceInfo[ids[k]]?.arm||0;if(arm===1)cr++;if(arm===2)cl++;}}
  if(surfaces)for(let k=0;k<4;k++){let n=0;for(let j=0;j<4;j++)n+=ids[j]===ids[k]?1:0;if(n>bestCount){best=k;bestCount=n;}}
  sampleIndex[p]=best;rgb[o]=srgb(r/4);rgb[o+1]=srgb(g/4);rgb[o+2]=srgb(b/4);rgb[o+3]=255;
  if(packed){const q=indices[best],d=(packed[q]*65536+packed[q+1]*256+packed[q+2])/10000;depthM[p]=d;depthMM[p]=Math.min(65535,Math.round(d*1000));depthPreview[o]=depthPreview[o+1]=depthPreview[o+2]=Math.round(gray/4);depthPreview[o+3]=255;}
  if(surfaces){const info=surfaceInfo[ids[best]];mask[p]=info?.arm||0;links[p]=info?.link||0;coverageRight[p]=cr/4;coverageLeft[p]=cl/4;for(let c=0;c<3;c++)maskPreview[o+c]=Math.round((palette[1][c]*cr+palette[2][c]*cl)/4);maskPreview[o+3]=255;}
 }
 return {rgb,depthM,depthMM,mask,links,depthPreview,maskPreview,coverageRight,coverageLeft,sampleIndex};
}
