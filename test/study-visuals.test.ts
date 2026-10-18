import { expect, it } from 'vitest';
import { studyVisuals, visualForHash, stepAtFrame, frameForStep, FRAMES_PER_STEP } from '../src/client/study-visuals.js';

it('maps scene boundaries and clamped manual navigation to the same learning step', () => {
 const rag=studyVisuals[0];
 expect(rag.id).toBe('rag');expect(rag.steps).toHaveLength(4);
 for(let i=0;i<rag.steps.length;i++){
  expect(stepAtFrame(i*FRAMES_PER_STEP,rag)).toBe(i);
  expect(stepAtFrame((i+1)*FRAMES_PER_STEP-1,rag)).toBe(i);
  expect(stepAtFrame(frameForStep(i,rag),rag)).toBe(i);
 }
 expect(stepAtFrame(-100,rag)).toBe(0);expect(stepAtFrame(100000,rag)).toBe(3);
 expect(frameForStep(-1,rag)).toBe(frameForStep(0,rag));
 expect(frameForStep(99,rag)).toBe(frameForStep(3,rag));
});
it('supports direct visual links without treating unknown input as a lesson',()=>{
 expect(studyVisuals.map(v=>v.id)).toEqual(['rag','word2vec','cosine']);
 expect(visualForHash('#/documents/visuals/rag')?.id).toBe('rag');
 expect(visualForHash('#/documents/visuals/cosine')?.id).toBe('cosine');
 expect(visualForHash('#/documents/visuals/unknown')).toBeUndefined();
 expect(visualForHash('#/documents')).toBeUndefined();
});
