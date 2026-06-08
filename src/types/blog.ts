export interface BlogPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  image: string;
  category: string;
  tags: string[];
  author: string;
  authorAvatar: string;
  publishedAt: string;
  updatedAt: string;
  readTime: number;
  views: number;
  movieSlug?: string;
}

export interface BlogCategory {
  name: string;
  slug: string;
  count: number;
}