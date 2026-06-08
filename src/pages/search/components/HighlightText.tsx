import { memo } from 'react';

interface Props {
  text: string;
  query: string;
  className?: string;
}

function HighlightText({ text, query, className = '' }: Props) {
  if (!query.trim() || !text) return <span className={className}>{text}</span>;

  const escapedQuery = escapeRegExp(query.trim());
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        // Use case-insensitive comparison to avoid regex.test stateful bug with /g flag
        const isMatch = part.toLowerCase() === query.trim().toLowerCase();
        return isMatch ? (
          <mark
            key={i}
            className="bg-red-500/25 text-white font-semibold rounded-sm px-0.5"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </span>
  );
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default memo(HighlightText);