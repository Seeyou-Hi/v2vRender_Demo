const enc=new TextEncoder();
export function concat(chunks){const bytes=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes;}
const table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let n=0;n<8;n++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function be(value){const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,value);return b;}
function chunk(name,data){const type=enc.encode(name);return concat([be(data.length),type,data,be(crc32(concat([type,data])))]);}
function zlibStored(data){let a=1,b=0;for(const x of data){a=(a+x)%65521;b=(b+a)%65521;}const blocks=[new Uint8Array([0x78,0x01])];for(let o=0;o<data.length;o+=65535){const n=Math.min(65535,data.length-o);blocks.push(new Uint8Array([o+n===data.length?1:0,n&255,n>>>8,(~n)&255,((~n)>>>8)&255]),data.subarray(o,o+n));}blocks.push(be(((b<<16)|a)>>>0));return concat(blocks);}
export function grayPNG(values,width,height,bitDepth=8){
 if(values.length!==width*height)throw Error('Image size mismatch');
 const byteWidth=bitDepth/8,raw=new Uint8Array(height*(width*byteWidth+1));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const o=y*(width*byteWidth+1)+1+x*byteWidth,v=values[y*width+x];if(bitDepth===16){raw[o]=v>>>8;raw[o+1]=v&255;}else raw[o]=v;}
 const ihdr=concat([be(width),be(height),new Uint8Array([bitDepth,0,0,0,0])]);
 return concat([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlibStored(raw)),chunk('IEND',new Uint8Array())]);
}
export function npy(array,width,height){
 const type=array instanceof Float32Array?'<f4':array instanceof Uint16Array?'<u2':'|u1';
 let header=`{'descr': '${type}', 'fortran_order': False, 'shape': (${height}, ${width}), }`;
 header+=' '.repeat((64-(10+header.length+1)%64)%64)+'\n';const h=enc.encode(header),prefix=new Uint8Array([147,78,85,77,80,89,1,0,h.length&255,h.length>>>8]);
 return concat([prefix,h,new Uint8Array(array.buffer,array.byteOffset,array.byteLength)]);
}
export function zipFiles(files){
 const locals=[],directories=[];let offset=0;
 for(const {name,data,crc=crc32(data),size=data.length,method=0} of files){const filename=enc.encode(name);const local=new Uint8Array(30),view=new DataView(local.buffer);view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(12,0x21,true);view.setUint32(14,crc,true);view.setUint32(18,data.length,true);view.setUint32(22,size,true);view.setUint16(8,method,true);view.setUint16(26,filename.length,true);
  locals.push(local,filename,data);
  const central=new Uint8Array(46),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,0x21,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,size,true);c.setUint16(10,method,true);c.setUint16(28,filename.length,true);c.setUint32(42,offset,true);directories.push(central,filename);offset+=local.length+filename.length+data.length;
 }
 const directory=concat(directories),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,directory.length,true);e.setUint32(16,offset,true);return concat([...locals,directory,end]);
}


export async function compressFile(name,data){
 const crc=crc32(data),size=data.length;
 if(typeof CompressionStream==='undefined')return {name,data,crc,size,method:0};
 const stream=new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
 const wrapped=new Uint8Array(await new Response(stream).arrayBuffer());
 return {name,data:wrapped.slice(2,-4),crc,size,method:8};
}
