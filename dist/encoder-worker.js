import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.js';
let encoder;
self.onmessage = ({data}) => {
  try {
    if (data.type === 'init') { encoder = GIFEncoder(); self.postMessage({type:'ready'}); }
    if (data.type === 'frame') {
      const pixels = new Uint8Array(data.pixels);
      let hasAlpha=false;if(data.transparent){for(let i=3;i<pixels.length;i+=4){if(pixels[i]<128){hasAlpha=true;break}}}
      const format=hasAlpha?'rgba4444':'rgb565';
      const palette = quantize(pixels, data.colors, {format,oneBitAlpha:true});
      const indexed = applyPalette(pixels, palette, format);
      const transparentIndex=data.transparent?palette.findIndex(color=>color[3]===0):-1;
      encoder.writeFrame(indexed, data.width, data.height, {palette:palette.map(color=>color.slice(0,3)), delay:data.delay, repeat:data.loop ? 0 : -1,transparent:transparentIndex>=0,transparentIndex,dispose:data.transparent?2:0});
      self.postMessage({type:'frame', size:encoder.bytesView().byteLength});
    }
    if (data.type === 'finish') { encoder.finish(); const bytes=encoder.bytes(); self.postMessage({type:'done',bytes},[bytes.buffer]); encoder=null; }
  } catch (err) { self.postMessage({type:'error',message:err.message}); }
};
