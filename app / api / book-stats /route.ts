import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const notionToken = process.env.NOTION_TOKEN;
    // 1단계에서 버셀에 새로 등록한 독서 DB ID를 불러옵니다.
    const databaseId = process.env.NOTION_BOOK_DATABASE_ID; 

    if (!notionToken || !databaseId) {
      return NextResponse.json({ error: '노션 환경 변수 세팅이 누락되었습니다.' }, { status: 500 });
    }

    let allPages: any[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;

    // 노션 API는 한 번에 100개씩만 주므로 전체 데이터를 다 가져올 때까지 반복합니다.
    while (hasMore) {
      const notionResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2026-03-11', // 검증된 노션 최신 API 버전
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start_cursor: startCursor,
          page_size: 100,
        }),
      });

      if (!notionResponse.ok) {
        const errorData = await notionResponse.json();
        return NextResponse.json({ error: '노션 데이터 조회 실패', details: errorData.message }, { status: 500 });
      }

      const data = await notionResponse.json();
      allPages = [...allPages, ...data.results];
      hasMore = data.has_more;
      startCursor = data.next_cursor ?? undefined;
    }

    // 주제 데이터 추출 및 슬래시(/) 기준 쪼개기 통계
    const topicCounts: { [key: string]: number } = {};

    allPages.forEach((page) => {
      const subjectProperty = page.properties['주제'];
      if (!subjectProperty || !subjectProperty.rich_text) return;

      const fullText = subjectProperty.rich_text.map((t: any) => t.plain_text).join('');
      if (!fullText.trim()) return;

      // "/" 기호 앞뒤 공백을 없애며 쪼갭니다.
      const topics = fullText.split('/').map((topic: string) => topic.trim());

      topics.forEach((topic: string) => {
        if (topic) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      });
    });

    // 많이 읽은 순으로 정렬 후 상위 10개만 컷!
    const sortedTopics = Object.entries(topicCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({ success: true, topTopics: sortedTopics });

  } catch (error: any) {
    console.error('통계 에러 발생:', error);
    return NextResponse.json({ error: '서버 에러 발생', details: error.message }, { status: 500 });
  }
}
