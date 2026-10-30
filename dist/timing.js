// GIF stores frame delays in hundredths of a second. Both preview and export
// use this timeline, sampling the whole source across the chosen output duration.
export function createTimeline(sourceDuration,outputDuration,fps){
  if(!Number.isFinite(sourceDuration)||sourceDuration<=0)throw new Error('文件时长无效。');
  if(!Number.isFinite(outputDuration)||outputDuration<.01)throw new Error('持续时间需至少为 0.01 秒。');
  if(!Number.isInteger(fps)||fps<1||fps>24)throw new Error('视频帧率需为 1–24 FPS。');
  const ticks=Math.max(1,Math.round(outputDuration*100));
  const duration=ticks/100,count=Math.max(1,Math.ceil(duration*fps-1e-9));
  if(!Number.isSafeInteger(count))throw new Error('持续时间过长，请减小数值。');
  return {start:0,end:sourceDuration,sourceDuration,duration,count,fps:count/duration,
    sampleTime:index=>index*sourceDuration/count,
    delay:index=>(Math.round((index+1)*ticks/count)-Math.round(index*ticks/count))*10};
}
