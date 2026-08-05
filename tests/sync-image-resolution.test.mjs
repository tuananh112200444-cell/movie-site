import test from 'node:test';
import assert from 'node:assert/strict';
import { extractImageFromHtml } from '../scripts/image-source-utils.mjs';

test('resolves a root-relative social image to an absolute URL', () => {
  const html = '<meta property="og:image" content="/wp-content/uploads/2025/05/poster.jpg">';
  assert.equal(
    extractImageFromHtml(html, 'https://blvietsub.com/phim/test/'),
    'https://blvietsub.com/wp-content/uploads/2025/05/poster.jpg',
  );
});

test('prefers social image tags over generic image tags and ignores unsafe values', () => {
  const html = `
    <img src="/images/ignored.jpg" />
    <meta property="twitter:image" content="https://cdn.example.com/poster.jpg" />
    <meta property="og:image" content="javascript:alert(1)" />
  `;
  assert.equal(extractImageFromHtml(html, 'https://example.com/movie'), 'https://cdn.example.com/poster.jpg');
});
