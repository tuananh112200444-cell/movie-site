import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveSourceTitleFields } from '../scripts/source-title-localization.mjs';

test('separates a combined Vietnamese, English and Thai provider title', () => {
  assert.deepEqual(
    resolveSourceTitleFields('Nhân Duyên Tiền Định - Love Destiny บุพเพสันนิวาส (2026)', ''),
    {
      titleVi: 'Nhân Duyên Tiền Định',
      titleEn: 'Love Destiny',
      titleOriginal: 'Love Destiny บุพเพสันนิวาส',
    },
  );
});

test('uses a distinct source original as the English title', () => {
  assert.deepEqual(
    resolveSourceTitleFields('Nhiệm Vụ: Tình Yêu hay Dối Lừa', 'Mission: Love or Lies the Series'),
    {
      titleVi: 'Nhiệm Vụ: Tình Yêu hay Dối Lừa',
      titleEn: 'Mission: Love or Lies the Series',
      titleOriginal: 'Mission: Love or Lies the Series',
    },
  );
});

test('does not label an English-only source title as Vietnamese', () => {
  assert.deepEqual(resolveSourceTitleFields('Unlock Your Love', 'Unlock Your Love'), {
    titleVi: '',
    titleEn: 'Unlock Your Love',
    titleOriginal: 'Unlock Your Love',
  });
});

test('keeps an English display title when the original title uses another script', () => {
  assert.deepEqual(resolveSourceTitleFields('A Boss and a Babe', 'ชอกะเชร์คู่กันต์'), {
    titleVi: '',
    titleEn: 'A Boss and a Babe',
    titleOriginal: 'ชอกะเชร์คู่กันต์',
  });
});

test('BLVietsub and GLVietsub sync paths use the shared title fields', async () => {
  const [localBl, edgeBl, edgeGl] = await Promise.all([
    readFile(new URL('../scripts/blvietsub-sync-core.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/sync-blvietsub-feed/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/sync-glvietsub-feed/index.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(localBl, /title_en:\s*localizedTitles\.titleEn/);
  assert.match(edgeBl, /entry\.titleEn = sourceTitles\.titleEn \|\| localized\.titleEn/);
  assert.match(edgeGl, /title_vi:\s*entry\.titleVi \|\| ''/);
});
