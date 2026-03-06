import { useRef, useState } from 'react';
import { BaseBoxShapeUtil, HTMLContainer, type TLBaseShape } from 'tldraw';

interface VideoPlayerShapeProps {
  w: number;
  h: number;
  videoUrl: string;
  fileName: string;
}

type VideoPlayerShape = TLBaseShape<'video_player', VideoPlayerShapeProps>;

const DRAG_BAR_HEIGHT = 36;

export class VideoPlayerShapeUtil extends BaseBoxShapeUtil<VideoPlayerShape> {
  static override type = 'video_player' as const;

  override canEdit() {
    return false;
  }

  override getDefaultProps(): VideoPlayerShapeProps {
    return {
      w: 640,
      h: 380 + DRAG_BAR_HEIGHT,
      videoUrl: '',
      fileName: '',
    };
  }

  override component(shape: VideoPlayerShape) {
    const { videoUrl, fileName, w, h } = shape.props;
    return <VideoPlayerComponent videoUrl={videoUrl} fileName={fileName} w={w} h={h} />;
  }

  override indicator(shape: VideoPlayerShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} />;
  }
}

function VideoPlayerComponent({
  videoUrl,
  fileName,
  w,
  h,
}: {
  videoUrl: string;
  fileName: string;
  w: number;
  h: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);

  return (
    <HTMLContainer style={{ pointerEvents: 'all' }}>
      <div
        style={{
          width: w,
          height: h,
          background: '#1a1a1a',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── 拖动条：不阻止冒泡，tldraw 从这里识别拖动 ── */}
        <div
          style={{
            height: DRAG_BAR_HEIGHT,
            minHeight: DRAG_BAR_HEIGHT,
            background: '#2a2a2a',
            borderBottom: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: 8,
            cursor: 'move',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          {/* macOS 风格圆点 */}
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
          </div>
          {/* 文件名 */}
          <span
            style={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: 12,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
            }}
          >
            🎬 {fileName || '视频播放器'}
          </span>
        </div>

        {/* ── 视频区域：阻止冒泡，播放控件正常响应 ── */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{ flex: 1, background: '#000', overflow: 'hidden' }}
        >
          {videoUrl && !error ? (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
              onError={() => setError(true)}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.4)',
                gap: 12,
                userSelect: 'none',
              }}
            >
              <div style={{ fontSize: 48 }}>🎬</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {error ? '视频加载失败' : '拖拽视频文件到画布'}
              </div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>支持 MP4 · WebM · MOV · OGG</div>
            </div>
          )}
        </div>
      </div>
    </HTMLContainer>
  );
}
