import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../dist/color-quality.js',import.meta.url));
const {sampleColors,buildPalette,createColorMapper}=await import('data:text/javascript;base64,'+source.toString('base64'));

test('transparent RGB does not consume palette colors; neighboring 8-bit colors stay distinct',()=>{
  const input=new Uint8Array([100,100,100,255,101,101,101,255,110,111,112,128,255,0,255,0,0,255,0,127]);
  const histogram=new Map();sampleColors(histogram,input,true);
  const palette=buildPalette(histogram,255),indexed=createColorMapper(palette,true)(input,5,1);
  assert.equal(palette.length,3);
  for(let i=0;i<3;i++)assert.deepEqual(palette[indexed[i]-1],Array.from(input.slice(i*4,i*4+3)));
  assert.equal(indexed[3],0);assert.equal(indexed[4],0);
  assert(!histogram.has(0xff00ff));assert(!histogram.has(0x00ff00));
});

test('error diffusion reproduces intermediate shades with the available palette',()=>{
  const width=128,height=64,input=new Uint8Array(width*height*4);
  for(let i=0;i<input.length;i+=4)input.set([128,128,128,255],i);
  const before=input.slice(),mapper=createColorMapper([[0,0,0],[255,255,255]],false);
  const indexed=mapper(input,width,height);
  const mean=indexed.reduce((sum,index)=>sum+index*255,0)/indexed.length;
  assert(Math.abs(mean-128)<2,`mean ${mean} should approximate 128`);
  assert(indexed.includes(0)&&indexed.includes(1));
  assert.deepEqual(input,before);assert.deepEqual(indexed,mapper(input,width,height));
});

test('diffusion never crosses transparent pixels and maintains the exact alpha mask',()=>{
  const width=9,height=3,input=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)input.set([125,125,125,x===4?0:255],(y*width+x)*4);
  const palette=[[0,0,0],[255,255,255]],indexed=createColorMapper(palette,true)(input,width,height);
  for(let i=0;i<indexed.length;i++)assert.equal(indexed[i]===0,input[i*4+3]===0);
  const changed=input.slice();for(let y=0;y<height;y++)for(let x=0;x<4;x++)changed[(y*width+x)*4]=255;
  const other=createColorMapper(palette,true)(changed,width,height);
  for(let y=0;y<height;y++)for(let x=5;x<width;x++)assert.equal(indexed[y*width+x],other[y*width+x]);
});

test('shared palette includes colors from multiple samples and respects color budgets',()=>{
  const histogram=new Map();
  sampleColors(histogram,new Uint8Array([12,34,56,255,12,34,56,255]),true);
  sampleColors(histogram,new Uint8Array([234,123,45,255]),true);
  const palette=buildPalette(histogram,31);
  assert(palette.some(c=>String(c)==='12,34,56'));assert(palette.some(c=>String(c)==='234,123,45'));
  const dense=new Map(Array.from({length:1024},(_,i)=>[(i*16411)&0xffffff,i%7+1]));
  for(const budget of [1,31,63,127,255]){
    const generated=buildPalette(dense,budget);assert(generated.length<=budget&&generated.length>0);
    for(const color of generated)for(const c of color)assert(Number.isInteger(c)&&c>=0&&c<=255);
  }
});

test('fully transparent samples remain encodable without inventing visible pixels',()=>{
  const input=new Uint8Array(16*16*4),histogram=new Map();sampleColors(histogram,input,true);
  const indexed=createColorMapper(buildPalette(histogram,255),true)(input,16,16);
  assert(indexed.every(i=>i===0));
});
