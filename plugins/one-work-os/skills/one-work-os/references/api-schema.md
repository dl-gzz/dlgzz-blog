# OneWork Knowledge API

Read this reference when configuring access, debugging a query, or adapting the Skill to another agent platform.

## Contents

- [Configuration](#configuration)
- [Article source metadata](#article-source-metadata)
- [Request](#request)
- [Success response](#success-response)
- [Errors](#errors)
- [Media handling](#media-handling)

## Configuration

- `ONEWORK_API_KEY`: required bearer key. Never commit or print it.
- `ONEWORK_DEVICE_ID`: stable device binding written by every managed installer. Pre-0.2 unbound API keys may omit it only during migration; newly issued device-bound keys require it. Never invent or copy it between customers.
- `ONEWORK_KNOWLEDGE_URL`: optional full endpoint. Defaults to `/api/knowledge/query` on the OneWorkOS origin.
- `ONEWORK_API_URL`: optional OneWorkOS URL. The script uses its origin, so an existing full knowledge URL remains compatible.
- Default pack: `onework-workbuddy-v1`.

## Article source metadata

Use these optional frontmatter fields when one knowledge article has a primary official or self-media source:

```yaml
source_url: https://example.com/workbuddy-article
source_kind: self_media
platform: official_site
publisher: 独立工作者
published_at: 2026-08-02
```

Use a media asset linked to the relevant chunk when an article contains additional videos or more than one related URL.

## Request

```http
POST /api/knowledge/query
Authorization: Bearer <key>
X-OneWork-Device-ID: <bound-device-id>
Content-Type: application/json
```

```json
{
  "query": "我想让 WorkBuddy 每天早上整理行业资讯",
  "packId": "onework-workbuddy-v1",
  "limit": 6,
  "includeAssets": true,
  "includeResources": true
}
```

Keep `limit` between 4 and 8 for normal guidance. Form the query from the user's goal and current state instead of copying the whole conversation.

## Success response

```json
{
  "success": true,
  "packId": "onework-workbuddy-v1",
  "query": "...",
  "results": [
    {
      "title": "...",
      "source": "independent_worker_workbuddy_course",
      "sourceUrl": "https://example.com/workbuddy-permission-mode",
      "category": "WorkBuddy",
      "heading": "...",
      "content": "...",
      "score": 0.82,
      "assets": [
        {
          "type": "image",
          "url": "https://img.dlgzz.com/knowledge/workbuddy/example.png",
          "mimeType": "image/png",
          "width": 1288,
          "height": 446,
          "alt": "WorkBuddy 默认权限菜单",
          "caption": "在输入框下方打开权限菜单",
          "role": "ui_step"
        }
      ],
      "resources": [
        {
          "type": "video",
          "url": "https://example.com/workbuddy-demo",
          "mimeType": "text/html",
          "title": "独立工作者的 WorkBuddy 实战演示",
          "platform": "video_channel",
          "thumbnailUrl": "https://img.dlgzz.com/knowledge/workbuddy/demo-cover.jpg",
          "durationSeconds": 420,
          "publishedAt": "2026-08-02T00:00:00.000Z",
          "official": true,
          "publisher": "独立工作者",
          "sourceType": "self_media_video",
          "role": "video_demo"
        },
        {
          "type": "link",
          "url": "https://example.com/workbuddy-notes",
          "mimeType": "text/html",
          "title": "独立工作者的补充文章",
          "platform": "official_site",
          "official": true,
          "publisher": "独立工作者",
          "sourceType": "self_media_article",
          "role": "official_source"
        }
      ],
      "metadata": {
        "product": "WorkBuddy",
        "knowledgeType": "workbuddy_guidance",
        "visibility": "private",
        "persona": "独立工作者",
        "authority": "independent_worker",
        "contentRole": "guidance",
        "factsVerified": "2026-08-01",
        "updated": "2026-08-01"
      }
    }
  ]
}
```

Use returned content as evidence. For facts, prefer `authority: official`; use methodology and independent-worker guidance for decisions and sequencing; use examples only as illustrations. The host model remains responsible for interpreting the current user state and for respecting system permissions.

When `sourceUrl` is present and the result materially supports the answer, render a clickable citation at the bottom:

```markdown
出处：[文章标题](https://example.com/workbuddy-permission-mode)
```

Deduplicate repeated chunks from the same article and cite no more than three actually used sources. When `sourceUrl` is absent, render the article or source title as plain text with `暂无公开链接`; never manufacture a URL.

## Errors

- `MISSING` or `INVALID` (`401`): configure a valid key.
- `REVOKED` (`403`): request a replacement key.
- `DEVICE_ID_REQUIRED` or `DEVICE_NOT_BOUND` (`401`/`403`): rerun the managed installation on this computer.
- `DEVICE_MISMATCH` or `DEVICE_REVOKED` (`403`): generate a fresh installation authorization for this computer.
- `PACK_NOT_LICENSED` (`403`): the key lacks access to the requested pack.
- `QUOTA_EXCEEDED` (`429`): stop retrying and report the quota condition.
- `QUERY_FAILED` (`500`): retry once only if the request is safe, then report the failure.

## Media handling

Do not send raw user images to this text retrieval endpoint. Let the host multimodal model extract task-relevant facts, then query with those facts. This keeps image-model cost on the user's model account and reduces privacy exposure.

`assets` contains already-screened tutorial images associated with the matched chunk. `resources` contains associated official videos or links. Keep these arrays structured through orchestration; a Markdown string containing an image URL is not equivalent to a rendered image. The ingestion model is not fixed: any vision-capable model may have produced stored image captions, OCR, and structured facts. The query response intentionally omits OCR, transcripts, and internal analysis metadata to keep tokens low.

Render no more than one directly relevant tutorial image and one relevant official resource in normal guidance. Prefer the host's native image/media message part. Use Markdown only in clients known to fetch remote images. Whenever Markdown carries a remote image, immediately include a clickable URL fallback; the Markdown line itself is not evidence that rendering succeeded. When a relevant returned resource is a video, the answer is incomplete without its exact URL as a named link; also make the returned thumbnail clickable when one exists. Never claim inline playback unless the client actually supports a trusted player, and never emit a raw iframe from `embedUrl`.

Set both `includeAssets` and `includeResources` to `false` for text-only responses. For backward compatibility, omitting `includeResources` makes it follow `includeAssets`.

Videos are not searched by their binary bytes. Put the video's title, summary, key points, and optionally transcript-derived text into the linked knowledge chunk; retrieval finds that text and then returns the video resource.
