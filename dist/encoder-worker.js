import { GIFEncoder } from './vendor/gifenc.js';
import { sampleColors, buildPalette, createColorMapper } from './color-quality.js?v=12.0';
let encoder,histogram,palette,mapColors,transparent,colors,first;
self.onmessage = ({data}) => {
  try {
    if (data.type === 'init') {
      encoder=GIFEncoder();histogram=new Map();palette=null;mapColors=null;first=true;
      transparent=!!data.transparent;colors=data.colors||256;self.postMessage({type:'ready'});
    }
    if(data.type==='sample'){
      sampleColors(histogram,new Uint8Array(data.pixels),transparent);self.postMessage({type:'sampled'});
    }
    if(data.type==='palette'){
      const opaque=buildPalette(histogram,colors-(transparent?1:0));
      palette=transparent?[[0,0,0],...opaque]:opaque;mapColors=createColorMapper(opaque,transparent);
      histogram=null;self.postMessage({type:'palette',colors:palette.length});
    }
    if (data.type === 'frame') {
      const pixels = new Uint8Array(data.pixels);
      if(!mapColors)throw new Error('颜色调色板尚未就绪。');
      const indexed=mapColors(pixels,data.width,data.height);
      encoder.writeFrame(indexed,data.width,data.height,{palette:first?palette:null,delay:data.delay,repeat:data.loop?0:-1,transparent,transparentIndex:0,dispose:transparent?2:0});first=false;
      self.postMessage({type:'frame', size:encoder.bytesView().byteLength});
    }
    if (data.type === 'finish') { encoder.finish(); const bytes=encoder.bytes(); self.postMessage({type:'done',bytes},[bytes.buffer]); encoder=null; }
  } catch (err) { self.postMessage({type:'error',message:err.message}); }
};
