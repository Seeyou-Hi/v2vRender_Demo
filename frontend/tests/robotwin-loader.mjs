import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {loadTableAssets} from '../dist/table-assets.js';
export async function loadTestAssets(){
 const parser=new GLTFLoader();
 const loader={async loadAsync(url){
  const raw=readFileSync(fileURLToPath(url)),length=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+length));
  for(const m of doc.meshes)for(const p of m.primitives)delete p.material;
  delete doc.images;delete doc.textures;delete doc.materials;
  const json=Buffer.from(JSON.stringify(doc));const padding=(4-json.length%4)%4;const binary=raw.subarray(20+length);const output=Buffer.alloc(20+json.length+padding+binary.length);
  raw.copy(output,0,0,12);output.writeUInt32LE(output.length,8);output.writeUInt32LE(json.length+padding,12);output.write('JSON',16);json.copy(output,20);output.fill(32,20+json.length,20+json.length+padding);binary.copy(output,20+json.length+padding);
  return parser.parseAsync(output.buffer.slice(output.byteOffset,output.byteOffset+output.byteLength),'');
 }};
 for(const kind of ['apples','bottles','cans'])await loadTableAssets(kind,loader);
}
