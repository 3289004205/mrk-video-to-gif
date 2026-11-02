import { OptimizedGif } from './optimized-gif.js?v=13.0';
import { sampleColors, buildPalette, createColorMapper } from './color-quality.js?v=13.0';
let encoder,histogram,palette,mapColors,transparent,colors,compression;
self.onmessage = ({data}) => {
  try {
    if (data.type === 'init') {
      encoder=null;histogram=new Map();palette=null;mapColors=null;
      transparent=!!data.transparent;colors=data.colors||256;compression=data.compression||'balanced';self.postMessage({type:'ready'});
    }
    if(data.type==='sample'){
      sampleColors(histogram,new Uint8Array(data.pixels),transparent);self.postMessage({type:'sampled'});
    }
    if(data.type==='palette'){
      const opaque=buildPalette(histogram,colors-1);
      palette=[[0,0,0],...opaque];mapColors=createColorMapper(opaque,transparent,{mode:compression==='quality'?'diffusion':compression==='small'?'none':'ordered',reserveTransparent:true});
      histogram=null;self.postMessage({type:'palette',colors:palette.length});
    }
    if (data.type === 'frame') {
      const pixels = new Uint8Array(data.pixels);
      if(!mapColors)throw new Error('颜色调色板尚未就绪。');
      const indexed=mapColors(pixels,data.width,data.height);
      if(!encoder)encoder=new OptimizedGif(data.width,data.height,palette,data.loop);
      encoder.addFrame(indexed,data.delay);
      self.postMessage({type:'frame', size:encoder.size});
    }
    if (data.type === 'finish') { const bytes=encoder.finish(); self.postMessage({type:'done',bytes,count:encoder.count,headerBytes:encoder.headerBytes},[bytes.buffer]); encoder=null; }
  } catch (err) { self.postMessage({type:'error',message:err.message}); }
};
