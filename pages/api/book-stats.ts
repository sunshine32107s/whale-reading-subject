import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET 요청이 아닐 경우 차단
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const notionToken = process.env.NOTION_TOKEN;
    const databaseId = process.env.NOTION_BOOK_DATABASE_ID;

    if (!notionToken || !databaseId) {
      return res.status(500).json({ error: '노션 환경 변수 세팅이 누락되었습니다.' });
    }

    let allPages: any[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;

    while (hasMore) {
      const notionResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2026-03-11',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start_cursor: startCursor,
          page_size: 100,
        }),
      });

      if (!notionResponse.ok) {
        const errorData = await notionResponse.json();
        return res.status(500).json({ error: '노션 데이터 조회 실패', details: errorData.message });
      }

      const data = await notionResponse.json();
      allPages = [...allPages, ...data.results];
      hasMore = data.has_more;
      startCursor = data.next_cursor ?? undefined;
    }

    const topicCounts: { [key: string]: number } = {};

    allPages.forEach((page) => {
      const subjectProperty = page.properties['주제'];
      if (!subjectProperty || !subjectProperty.rich_text) return;

      const fullText = subjectProperty.rich_text.map((t: any) => t.plain_text).join('');
      if (!fullText.trim()) return;

      const topics = fullText.split('/').map((topic: string) => topic.trim());

      topics.forEach((topic: string) => {
        if (topic) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      });
    });

    const sortedTopics = Object.entries(topicCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return res.status(200).json({ success: true, topTopics: sortedTopics });

  } catch (error: any) {
    return res.status(500).json({ error: '서버 에러 발생', details: error.message });
  }
}
