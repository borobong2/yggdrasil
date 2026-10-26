// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudyVisuals from '../src/client/StudyVisuals';
import { VisualDiagram } from '../src/client/StudyVisualScene';
import { studyVisuals } from '../src/client/study-visuals';
beforeEach(() => {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
  HTMLMediaElement.prototype.load = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('lists lessons and reports an unknown lesson without breaking navigation', async () => {
  history.replaceState(null, '', '#/documents/visuals/unknown'); render(<StudyVisuals />);
  expect(screen.getByText(/이 항목은 없습니다/)).toBeTruthy(); expect(screen.getAllByRole('link')).toHaveLength(studyVisuals.length);
  fireEvent.click(screen.getByText('문서로')); await waitFor(() => expect(location.hash).toBe('#/documents'));
});
it.each(studyVisuals)('steps through $id with the actual Remotion player', async visual => {
  history.replaceState(null, '', `#/documents/visuals/${visual.id}`); render(<StudyVisuals />);
  expect(screen.getByText(visual.steps[0].explanation)).toBeTruthy(); expect((screen.getByLabelText('이전 단계') as HTMLButtonElement).disabled).toBe(true);
  for (let i = 1; i < visual.steps.length; i++) { fireEvent.click(screen.getByLabelText('다음 단계')); expect(screen.getByText(visual.steps[i].explanation)).toBeTruthy(); }
  expect((screen.getByLabelText('다음 단계') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('이전 단계')); fireEvent.click(screen.getByLabelText('전체 재생')); await screen.findByLabelText('멈춤'); fireEvent.click(screen.getByLabelText('멈춤'));
  fireEvent.click(screen.getByText('모음으로')); await screen.findByText('작게 보는 개념');
});
it('diagrams communicate all concept steps with accessible image labels', () => {
  for (const visual of studyVisuals) for (let step = 0; step < visual.steps.length; step++) {
    const { unmount } = render(<VisualDiagram id={visual.id} step={step} progress={0.5} />); expect(screen.getByRole('img').getAttribute('aria-label')).toBeTruthy(); unmount();
  }
});
