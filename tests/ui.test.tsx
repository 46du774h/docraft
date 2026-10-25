// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Popup } from '../src/popup/Popup';
import { Workspace } from '../src/workspace/Workspace';

const created: Blob[] = [];
beforeEach(() => {
  cleanup();
  created.length = 0;
  (URL as any).createObjectURL = vi.fn((b: Blob) => (created.push(b), 'blob:test'));
  (URL as any).revokeObjectURL = vi.fn();
  (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  HTMLAnchorElement.prototype.click = vi.fn();
});

const MD = '# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |';
const type = (v: string) => fireEvent.change(screen.getByLabelText('Response text'), { target: { value: v } });

describe('popup', () => {
  it('shows validation for empty input and does not download', async () => {
    render(<Popup />);
    fireEvent.click(await screen.findByRole('button', { name: /Markdown/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Paste a response/i);
    expect(created).toHaveLength(0);
  });

  it('counts words and exports Markdown and Word as real files', async () => {
    render(<Popup />);
    type(MD);
    expect(screen.getByText(/words?, .* characters?/).textContent).toContain('13 words');
    fireEvent.click(screen.getByRole('button', { name: /Markdown/ }));
    await waitFor(() => expect(created).toHaveLength(1));
    expect(await created[0].text()).toBe(MD + '\n');
    await screen.findByText(/Markdown file saved as Title\.md/);
    fireEvent.click(screen.getByRole('button', { name: /Word/ }));
    await waitFor(() => expect(created).toHaveLength(2), { timeout: 15000 });
    expect(created[1].size).toBeGreaterThan(1000);
    expect((await screen.findByRole('status', {}, { timeout: 5000 })).textContent).toMatch(/Title\.docx/);
  });

  it('asks for confirmation before clearing substantial text', async () => {
    render(<Popup />);
    type('x'.repeat(500));
    fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));
    expect(screen.getByRole('button', { name: /Click again/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Click again/ }));
    await waitFor(() => expect((screen.getByLabelText('Response text') as HTMLTextAreaElement).value).toBe(''));
  });

  it('never renders pasted markup as HTML', async () => {
    const { container } = render(<Workspace />);
    type('<img src=x onerror="window.__pwn=1"> <script>window.__pwn=1</script>\n\n[x](javascript:window.__pwn=1)');
    await waitFor(() => expect(container.querySelector('[aria-label="Document preview"] p')).toBeTruthy());
    expect(container.querySelector('[aria-label="Document preview"] img, [aria-label="Document preview"] script')).toBeNull();
    expect(container.querySelector('[aria-label="Document preview"] a[href^="javascript"]')).toBeNull();
    expect((window as any).__pwn).toBeUndefined();
  });
});

describe('workspace', () => {
  it('renders a real table in the live preview and updates with settings', async () => {
    const { container } = render(<Workspace />);
    type(MD);
    await waitFor(() => expect(container.querySelector('table')).toBeTruthy());
    await waitFor(() => expect(container.querySelectorAll('table tr')).toHaveLength(2));
    fireEvent.click(screen.getByRole('radio', { name: 'Academic' }));
    expect((screen.getByLabelText('Font') as HTMLSelectElement).value).toBe('Times New Roman');
  });
});
