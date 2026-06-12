import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  hasNext?: boolean;
  accentClass?: string;
  onPageChange?: (page: number) => void;
}

function pageHref(basePath: string, page: number): string {
  return page > 1 ? `${basePath}?page=${page}` : basePath;
}

export default function Pagination({
  currentPage,
  totalPages,
  basePath,
  hasNext,
  accentClass = 'bg-red-500',
  onPageChange,
}: PaginationProps) {
  const navigate = useNavigate();
  const safeTotal = Math.max(1, Math.floor(totalPages || 1));
  const page = Math.min(Math.max(1, Math.floor(currentPage || 1)), safeTotal);
  const canGoNext = hasNext ?? page < safeTotal;

  const pageButtons = useMemo<(number | '...')[]>(() => {
    const total = Math.min(safeTotal, 999);
    if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1);

    const range: (number | '...')[] = [1];
    if (page > 4) range.push('...');
    for (let i = Math.max(2, page - 2); i <= Math.min(total - 1, page + 2); i += 1) {
      range.push(i);
    }
    if (page < total - 3) range.push('...');
    range.push(total);
    return range;
  }, [page, safeTotal]);

  const goToPage = (target: number) => {
    const nextPage = Math.min(Math.max(1, target), safeTotal);
    onPageChange?.(nextPage);
    navigate({
      pathname: basePath,
      search: nextPage > 1 ? `?page=${nextPage}` : '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mt-10 flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-xs font-medium text-white/42">
        Trang <span className="font-semibold text-white/85">{page}</span>
        <span>/</span>
        <span>{safeTotal.toLocaleString('vi')}</span>
      </div>

      <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-white/[0.035] p-1">
        <PageIconButton
          icon="ri-skip-left-line"
          disabled={page === 1}
          href={pageHref(basePath, 1)}
          label="Trang đầu"
          onClick={() => goToPage(1)}
        />
        <PageIconButton
          icon="ri-arrow-left-s-line"
          disabled={page === 1}
          href={pageHref(basePath, page - 1)}
          label="Trang trước"
          onClick={() => goToPage(page - 1)}
        />

        {pageButtons.map((item, index) =>
          item === '...' ? (
            <span key={`ellipsis-${index}`} className="flex h-9 min-w-8 flex-shrink-0 items-center justify-center px-1 text-sm text-white/25 select-none">
              ...
            </span>
          ) : (
            <a
              key={item}
              href={pageHref(basePath, item)}
              onClick={(event) => {
                event.preventDefault();
                goToPage(item);
              }}
              className={`flex h-9 min-w-9 flex-shrink-0 items-center justify-center rounded-lg px-3 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                page === item ? `${accentClass} text-white` : 'text-white/55 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              {item}
            </a>
          ),
        )}

        <PageIconButton
          icon="ri-arrow-right-s-line"
          disabled={!canGoNext}
          href={pageHref(basePath, page + 1)}
          label="Trang sau"
          onClick={() => goToPage(page + 1)}
        />
        <PageIconButton
          icon="ri-skip-right-line"
          disabled={!canGoNext}
          href={pageHref(basePath, safeTotal)}
          label="Trang cuối"
          onClick={() => goToPage(safeTotal)}
        />
      </div>
    </div>
  );
}

function PageIconButton({
  icon,
  disabled,
  href,
  label,
  onClick,
}: {
  icon: string;
  disabled: boolean;
  href: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <a
      href={disabled ? undefined : href}
      onClick={(event) => {
        event.preventDefault();
        if (!disabled) onClick();
      }}
      aria-disabled={disabled}
      title={label}
      className={`flex h-9 min-w-9 flex-shrink-0 items-center justify-center rounded-lg text-white/55 transition-colors cursor-pointer ${
        disabled ? 'opacity-30 pointer-events-none' : 'hover:bg-white/[0.08] hover:text-white'
      }`}
    >
      <i className={`${icon} text-base`} />
      <span className="sr-only">{label}</span>
    </a>
  );
}
