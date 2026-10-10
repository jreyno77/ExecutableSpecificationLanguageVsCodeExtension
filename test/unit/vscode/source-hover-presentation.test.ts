import { expect, it } from 'vitest';
import { SourceHoverConversion } from '../../driver/source-hover-conversion.js';

it('keeps authored backticks inside a longer expec code fence', () => {
  const hover = new SourceHoverConversion('function echo(text: Text = "```") returns Text');
  hover.request(0, 10);
  expect(hover.markdown(1)).toBe('````expec\nfunction echo(text: Text = "```") returns Text\n````');
  expect(hover.name(1)).toBe('echo');
});

it('preserves authored entity spelling and Markdown markers as literal description text', () => {
  const hover = new SourceHoverConversion('function echo() { promises "&lt;b&gt; *stars*" }');
  hover.request(0, 10);
  expect(hover.markdown(1)).toBe('```expec\nfunction echo()\n```\n\n&amp;lt;b&amp;gt; \\*stars\\*');
});

it('keeps authored strikethrough markers as literal description text', () => {
  const hover = new SourceHoverConversion('function echo() { promises "~~raw~~" }');
  hover.request(0, 10);
  expect(hover.markdown(1)).toBe('```expec\nfunction echo()\n```\n\n\\~\\~raw\\~\\~');
});

it('keeps a decoded newline and heading underline as literal description text', () => {
  const hover = new SourceHoverConversion('function echo() { promises "raw\\n===" }');
  hover.request(0, 10);
  expect(hover.markdown(1)).toBe('```expec\nfunction echo()\n```\n\nraw\n\\=\\=\\=');
});
