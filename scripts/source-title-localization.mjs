const VIETNAMESE_MARKS = /[ĂÂĐÊÔƠƯÀÁẢÃẠẦẤẨẪẬẰẮẲẴẶÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴăâđêôơưàáảãạầấẩẫậằắẳẵặèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/;
const NON_LATIN_SCRIPT = /[\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/u;

function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function comparable(value = '') {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function englishPrefix(value = '') {
  const original = clean(value);
  if (!original || !/[A-Za-z]/.test(original)) return '';
  const scriptIndex = original.search(NON_LATIN_SCRIPT);
  const candidate = clean(scriptIndex > 0 ? original.slice(0, scriptIndex) : original)
    .replace(/[\s\-–—:|]+$/g, '')
    .trim();
  return /[A-Za-z]/.test(candidate) ? candidate : '';
}

/**
 * Separates provider titles without changing the canonical name or slug.
 * Missing languages stay empty so a trusted metadata source can enrich them.
 */
export function resolveSourceTitleFields(title = '', originName = '') {
  const sourceTitle = clean(title);
  let sourceOriginal = clean(originName);
  let titleVi = VIETNAMESE_MARKS.test(sourceTitle) ? sourceTitle : '';
  let titleEn = !titleVi ? englishPrefix(sourceTitle) : '';
  if (!sourceOriginal && titleEn) sourceOriginal = sourceTitle;

  const combined = sourceTitle.match(/^(.+?)\s+(?:-|–|—|\|)\s+(.+?)(?:\s+\((?:19|20)\d{2}\))?$/u);
  if (combined && VIETNAMESE_MARKS.test(combined[1]) && /[A-Za-z]/.test(combined[2])) {
    titleVi = clean(combined[1]);
    sourceOriginal = sourceOriginal && comparable(sourceOriginal) !== comparable(sourceTitle)
      ? sourceOriginal
      : clean(combined[2]);
    titleEn = englishPrefix(sourceOriginal) || titleEn;
  } else if (sourceOriginal && comparable(sourceOriginal) !== comparable(sourceTitle)) {
    titleEn = englishPrefix(sourceOriginal) || titleEn;
  }

  return { titleVi, titleEn, titleOriginal: sourceOriginal };
}
