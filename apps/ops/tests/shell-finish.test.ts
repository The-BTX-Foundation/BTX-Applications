// The four small shell screens: "not built yet", the 404, and the error card (renders without the error text, calls
// reset). Rendered to static markup in the node test environment; no browser needed.
import { describe, expect, it, vi } from 'vitest';
import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotBuilt } from '@/components/not-built';
import { ErrorCard } from '@/components/error-card';
import NotFound from '@/app/not-found';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement('a', { href, className }, children),
}));

// Walks a React element tree and returns the first element of the given tag.
function find(node: ReactNode, tag: string): { props: Record<string, unknown> } | null {
  if (!isValidElement(node)) return null;
  const el = node as unknown as { type: unknown; props: { children?: ReactNode } & Record<string, unknown> };
  if (el.type === tag) return el;
  const kids = Array.isArray(el.props.children) ? el.props.children : [el.props.children];
  for (const k of kids) {
    const hit = find(k as ReactNode, tag);
    if (hit) return hit;
  }
  return null;
}

describe('NotBuilt', () => {
  const html = renderToStaticMarkup(createElement(NotBuilt, { title: 'Scoring' }));
  it('shows the page name as the one h1 and the calm message', () => {
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html).toContain('>Scoring</h1>');
    expect(html).toContain('This page isn’t built yet');
  });
  it('links back to Today', () => {
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Back to Today<\/a>/);
  });
});

describe('NotFound', () => {
  const html = renderToStaticMarkup(createElement(NotFound));
  it('says the page does not exist, with the BTX mark and a link to Today', () => {
    expect(html).toContain('That page doesn’t exist');
    expect(html).toContain('alt="The BTX Foundation"');
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Back to Today<\/a>/);
    expect(html.match(/<h1/g)?.length).toBe(1);
  });
});

describe('ErrorCard', () => {
  it('draws Something went wrong with no error text or stack', () => {
    const html = renderToStaticMarkup(createElement(ErrorCard, { onRetry: () => {} }));
    expect(html).toContain('Something went wrong');
    expect(html).toContain('Try again');
    expect(html).not.toMatch(/Error:|at \w+ \(|digest/i);
  });
  it('calls reset when Try again is pressed', () => {
    const reset = vi.fn();
    const button = find(ErrorCard({ onRetry: reset }), 'button');
    expect(button).not.toBeNull();
    (button!.props.onClick as () => void)();
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
