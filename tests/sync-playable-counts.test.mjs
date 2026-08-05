import test from 'node:test';
import assert from 'node:assert/strict';
import { countPlayableEpisodes, maxPlayableEpisodeNumber, shouldIncludeMovieForBlvietsubSync, shouldPublishMovieFromSync } from '../scripts/blvietsub-sync-utils.mjs';

test('counts only episodes with an actual playable link', () => {
  const episodes = [
    { episode_number: 1, link_embed: 'https://example.com/stream-1', link_m3u8: '' },
    { episode_number: 2, link_embed: '', link_m3u8: '' },
    { episode_number: 3, link_embed: 'https://example.com/stream-3', link_m3u8: '' },
  ];

  assert.equal(countPlayableEpisodes(episodes), 2);
  assert.equal(maxPlayableEpisodeNumber(episodes), 3);
});

test('ignores watch-page links and empty links', () => {
  const episodes = [
    { episode_number: 1, link_embed: 'https://blvietsub.com/xem-phim/demo/tap-01-sv-1', link_m3u8: '' },
    { episode_number: 2, link_embed: '', link_m3u8: '' },
    { episode_number: 3, link_embed: 'https://example.com/stream-3', link_m3u8: '' },
  ];

  assert.equal(countPlayableEpisodes(episodes), 1);
  assert.equal(maxPlayableEpisodeNumber(episodes), 3);
});

test('publishes only after both a playable link and usable artwork exist', () => {
  assert.equal(shouldPublishMovieFromSync({ insertedRows: 1, hasPlayableEpisode: false, hasUsableImage: true }), false);
  assert.equal(shouldPublishMovieFromSync({ hasPlayableEpisode: true, hasUsableImage: false }), false);
  assert.equal(shouldPublishMovieFromSync({ updatedMetadata: true, hasPlayableEpisode: false, hasUsableImage: true }), false);
  assert.equal(shouldPublishMovieFromSync({ hasPlayableEpisode: true, hasUsableImage: true }), true);
});

test('keeps BLVietsub and admin-queer movies eligible for repair even when they are unpublished', () => {
  assert.equal(shouldIncludeMovieForBlvietsubSync({ source_site: 'blvietsub', is_published: false }), true);
  assert.equal(shouldIncludeMovieForBlvietsubSync({ source_site: 'admin-queer', is_published: false }), true);
  assert.equal(shouldIncludeMovieForBlvietsubSync({ source_site: 'other', is_published: false }), false);
});
