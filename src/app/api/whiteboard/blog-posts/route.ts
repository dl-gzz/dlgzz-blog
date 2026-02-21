import { type NextRequest, NextResponse } from 'next/server';
import { blogSource, categorySource } from '@/lib/source';

export async function GET(request: NextRequest) {
  try {
    const locale =
      request.nextUrl.searchParams.get('locale') || 'zh';

    const localePosts = blogSource.getPages(locale);
    const publishedPosts = localePosts
      .filter((post) => post.data.published)
      .sort(
        (a, b) =>
          new Date(b.data.date).getTime() -
          new Date(a.data.date).getTime()
      );

    const allCategories = categorySource.getPages(locale);

    const posts = publishedPosts.map((post) => {
      const categoryNames = post.data.categories.map((catSlug) => {
        const found = allCategories.find(
          (c) => c.slugs[0] === catSlug
        );
        return found ? found.data.name : catSlug;
      });

      return {
        title: post.data.title,
        description: post.data.description || '',
        image: post.data.image || '',
        date: post.data.date,
        categories: categoryNames,
        url: post.url,
        slugs: post.slugs,
      };
    });

    return NextResponse.json({ success: true, posts });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch blog posts' },
      { status: 500 }
    );
  }
}
