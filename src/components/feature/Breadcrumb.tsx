import { Link } from 'react-router-dom';
import { memo } from 'react';

interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

const Breadcrumb = memo(function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  const schemaData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      ...(item.to ? { item: `https://khophim.org${item.to}` } : {}),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
      />
      <nav
        className={`flex items-center gap-1.5 flex-wrap text-xs ${className}`}
        aria-label="breadcrumb"
        itemScope
        itemType="https://schema.org/BreadcrumbList"
      >
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5" itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
            {i > 0 && (
              <i className="ri-arrow-right-s-line text-white/20 text-xs flex-shrink-0" />
            )}
            {item.to ? (
              <Link
                to={item.to}
                className="text-white/40 hover:text-red-400 transition-colors truncate max-w-[180px] sm:max-w-xs"
                itemProp="item"
              >
                <span itemProp="name">{item.label}</span>
              </Link>
            ) : (
              <span className="text-white/60 truncate max-w-[180px] sm:max-w-xs" itemProp="name">
                {item.label}
              </span>
            )}
            <meta itemProp="position" content={String(i + 1)} />
          </span>
        ))}
      </nav>
    </>
  );
});

export default Breadcrumb;