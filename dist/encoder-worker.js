import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.js';
let encoder;
self.onmessage = ({data}) => {
  try {
    if (data.type === 'init') { encoder = GIFEncoder(); self.postMessage({type:'ready'}); }
    if (data.type === 'frame') {
      const pixels = new Uint8Array(data.pixels);
      const palette = quantize(pixels, data.colors, {format:'rgb565'});
      const indexed = applyPalette(pixels, palette, 'rgb565');
      encoder.writeFrame(indexed, data.width, data.height, {palette, delay:data.delay, repeat:data.loop ? 0 : -1});
      self.postMessage({type:'frame', size:encoder.bytesView().byteLength});
    }
    if (data.type === 'finish') { encoder.finish(); const bytes=encoder.bytes(); self.postMessage({type:'done',bytes},[bytes.buffer]); encoder=null; }
  } catch (err) { self.postMessage({type:'error',message:err.message}); }
};
