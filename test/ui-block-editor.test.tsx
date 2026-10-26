// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BlockEditor } from '../src/client/BlockEditor';
import { todo } from './ui-fixtures';
afterEach(cleanup);
const edit = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value, selectionStart: value.length, selectionEnd: value.length } });
const setup = (initial = '') => { const changed = vi.fn(), mention = vi.fn(); const rendered = render(<BlockEditor initial={initial} issues={[todo({ id: '00000000-0000-4000-8000-000000000001' })]} onChange={changed} onMention={mention} />); return { ...rendered, changed, mention }; };
it.each([['# ', 'h1'], ['## ', 'h2'], ['### ', 'h3'], ['- ', 'bullet'], ['1. ', 'numbered'], ['[] ', 'todo'], ['> ', 'quote'], ['```', 'code'], ['---', 'divider']])('converts markdown shortcut %s to %s', (shortcut, type) => {
  const { container, changed } = setup(); const input = screen.getByRole('textbox'); fireEvent.focus(input); edit(input, shortcut);
  expect(container.querySelector(`[data-type="${type}"]`)).toBeTruthy(); expect(changed).toHaveBeenCalled();
});
it.each(['텍스트', '제목 1', '글머리 기호 목록', '번호 목록', '체크리스트', '인용', '코드', '구분선', '콜아웃', '표', '토글'])('creates %s from slash menu', label => {
  const { changed } = setup(); const input = screen.getByRole('textbox'); fireEvent.focus(input); edit(input, '/');
  const option = screen.getByRole('option', { name: new RegExp(`^${label}`) }); fireEvent.mouseEnter(option); fireEvent.mouseDown(option); fireEvent.click(option);
  expect(screen.queryByRole('listbox')).toBeNull(); expect(changed).toHaveBeenCalled();
});
it('mentions an issue through slash menu and renders a safe link after blur', () => {
  const { mention, changed } = setup(); const input = screen.getByRole('textbox'); fireEvent.focus(input); edit(input, '/mention'); fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: /Write tests/ })); expect(mention).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
  fireEvent.blur(screen.getByRole('textbox')); expect(screen.getByRole('link', { name: '@Write tests' }).getAttribute('href')).toBe('#issue-00000000-0000-4000-8000-000000000001'); expect(changed.mock.lastCall![0]).toContain('[@Write tests]');
});
it('filters menu, cycles keyboard options, closes on escape and reports no matches', () => {
  setup(); const input = screen.getByRole('textbox'); fireEvent.focus(input); edit(input, '/'); fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'ArrowUp' }); fireEvent.keyDown(input, { key: 'Escape' }); expect(screen.queryByRole('listbox')).toBeNull();
  edit(input, '/unknown'); expect(screen.getByText('일치하는 블록이 없습니다')).toBeTruthy(); edit(input, '@unknown'); expect(screen.getByText('일치하는 할 일이 없습니다')).toBeTruthy();
});
it('splits paragraphs at caret, merges backspace and moves between blocks', () => {
  const { changed, container } = setup(); let input = screen.getByRole('textbox') as HTMLTextAreaElement; fireEvent.focus(input); edit(input, 'HelloWorld'); input.setSelectionRange(5, 5); fireEvent.keyDown(input, { key: 'Enter' });
  expect(container.querySelectorAll('[data-row]').length).toBe(2); input = screen.getByRole('textbox') as HTMLTextAreaElement; expect(input.value).toBe('World'); input.setSelectionRange(0, 0); fireEvent.keyDown(input, { key: 'Backspace' }); expect(changed.mock.lastCall![0]).toBe('HelloWorld');
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true }); input = screen.getByRole('textbox') as HTMLTextAreaElement; fireEvent.keyDown(input, { key: 'ArrowUp' }); fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
});
it('continues lists, exits empty lists, resets non-paragraph backspace and leaves IME untouched', () => {
  const { container } = setup(); let input = screen.getByRole('textbox'); fireEvent.focus(input); edit(input, '- '); edit(screen.getByRole('textbox'), 'First'); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  expect(container.querySelectorAll('[data-type="bullet"]').length).toBe(2); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }); expect(container.querySelector('[data-type="p"]')).toBeTruthy();
  edit(screen.getByRole('textbox'), '# '); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Backspace' }); expect(container.querySelectorAll('[data-type="h1"]').length).toBe(0);
  const count = container.querySelectorAll('[data-row]').length; fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', keyCode: 229 }); expect(container.querySelectorAll('[data-row]').length).toBe(count);
});
it('pastes plain markdown as blocks and ignores rich clipboard data', () => {
  const { changed, container } = setup(); const input = screen.getByRole('textbox') as HTMLTextAreaElement; fireEvent.focus(input); edit(input, 'headtail'); input.setSelectionRange(4, 4);
  fireEvent.paste(input, { clipboardData: { getData: (type: string) => type === 'text/plain' ? '# Heading\n\n- list' : '<script>bad</script>' } });
  expect(container.querySelector('[data-type="h1"]')).toBeTruthy(); expect(changed.mock.lastCall![0]).toContain('head'); expect(changed.mock.lastCall![0]).toContain('tail'); expect(changed.mock.lastCall![0]).not.toContain('script');
});
it('renders inline markdown, safe external links and literal unsafe URLs', () => {
  setup('before **bold** `code` ~~old~~ *emphasis* [safe](https://example.test) [jump](#anchor) [bad](javascript:alert) after');
  expect(screen.getByText('bold').tagName).toBe('STRONG'); expect(screen.getByText('code').tagName).toBe('CODE'); expect(screen.getByText('old').tagName).toBe('S'); expect(screen.getByText('emphasis').tagName).toBe('EM'); expect(screen.getByRole('link', { name: 'safe' }).getAttribute('target')).toBe('_blank'); expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
});
it('checks a checklist, expands a toggle and edits tables with preview', () => {
  const { container, changed } = setup('- [ ] Task\n\n<details>\n<summary>More</summary>\n\nInside\n\n</details>\n\n| A | B |\n| --- | ---: |\n| one | two |');
  fireEvent.click(screen.getByLabelText('완료')); expect(changed.mock.lastCall![0]).toContain('- [x] Task');
  fireEvent.click(screen.getByLabelText('토글 펼치기')); expect(screen.getByText('Inside')).toBeTruthy(); fireEvent.click(screen.getByLabelText('토글 접기'));
  fireEvent.click(screen.getByText('one')); const input = screen.getByLabelText('table 블록'); expect(screen.getByLabelText('표 미리보기')).toBeTruthy(); edit(input, 'not a table'); expect(screen.getAllByText('not a table').length).toBeGreaterThan(0); fireEvent.keyDown(input, { key: 'ArrowDown' });
});
it('adds, reorders and deletes blocks through menus', () => {
  const { container, changed } = setup('One\n\nTwo');
  fireEvent.click(screen.getAllByLabelText('블록 이동 (끌기) · 메뉴')[0]); fireEvent.click(screen.getByRole('menuitem', { name: '아래로 이동' })); expect(changed.mock.lastCall![0]).toBe('Two\n\nOne');
  fireEvent.click(screen.getAllByLabelText('블록 이동 (끌기) · 메뉴')[1]); fireEvent.click(screen.getByRole('menuitem', { name: '위로 이동' })); expect(changed.mock.lastCall![0]).toBe('One\n\nTwo');
  fireEvent.click(screen.getAllByLabelText('아래에 블록 추가')[1]); expect(screen.getByRole('listbox')).toBeTruthy(); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  fireEvent.click(screen.getAllByLabelText('블록 이동 (끌기) · 메뉴')[2]); fireEvent.click(screen.getByRole('menuitem', { name: '삭제' })); expect(container.querySelectorAll('[data-row]').length).toBe(2);
});
