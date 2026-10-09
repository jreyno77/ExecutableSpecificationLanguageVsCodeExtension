import { expect, it } from 'vitest';
import { svgBrowser, svgTextLabels } from '../../driver/svg-labels.js';

it('reads actual text and tspan labels with decoded XML entities', async () => {
  const context = await (await svgBrowser()).newContext();
  try {
    const page = await context.newPage();
    const labels = await svgTextLabels(page,
      '<svg xmlns="http://www.w3.org/2000/svg"><text>Library</text><text><tspan>Book &amp; Shelf</tspan></text></svg>');
    // The parent text and its nested tspan each expose their actual textContent.
    expect(labels).toEqual(['Library', 'Book & Shelf', 'Book & Shelf']);
  } finally { await context.close(); }
});

it('does not observe an authored label that appears only outside text nodes', async () => {
  const context = await (await svgBrowser()).newContext();
  try {
    const page = await context.newPage();
    const labels = await svgTextLabels(page,
      '<svg xmlns="http://www.w3.org/2000/svg" data-title="title()"><metadata>title()</metadata><text>count()</text></svg>');
    expect(labels).toEqual(['count()']);
    expect(labels).not.toContain('title()');
  } finally { await context.close(); }
});

it('rejects malformed saved SVG rather than returning label evidence', async () => {
  const context = await (await svgBrowser()).newContext();
  try {
    const page = await context.newPage();
    await expect(svgTextLabels(page,
      '<svg xmlns="http://www.w3.org/2000/svg"><text>Library</svg>')).rejects.toThrow();
  } finally { await context.close(); }
});