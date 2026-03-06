import { useState } from 'react';
import { BaseBoxShapeUtil, HTMLContainer, type TLBaseShape } from 'tldraw';

interface SkillShapeProps {
  w: number;
  h: number;
  skillId: string;
  name: string;
  description: string;
}

type SkillShape = TLBaseShape<'skill', SkillShapeProps>;

export class SkillShapeUtil extends BaseBoxShapeUtil<SkillShape> {
  static override type = 'skill' as const;

  override canEdit() {
    return false;
  }

  override getDefaultProps(): SkillShapeProps {
    return {
      w: 400,
      h: 520,
      skillId: 'wxvideo-download',
      name: 'wxvideo-download',
      description: '按账号名 + 关键词批量下载微信视频号视频，输出 .mp4 和元数据 JSON。',
    };
  }

  override component(shape: SkillShape) {
    const { skillId, name, description } = shape.props;
    return (
      <HTMLContainer style={{ pointerEvents: 'all' }}>
        <div style={{
          width: shape.props.w,
          height: shape.props.h,
          background: '#0f172a',
          borderRadius: 12,
          border: '1px solid #1e293b',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", monospace',
          color: '#e2e8f0',
        }}>
          <SkillRunner skillId={skillId} name={name} description={description} />
        </div>
      </HTMLContainer>
    );
  }

  override indicator(shape: SkillShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} ry={12} />;
  }
}

function SkillRunner({
  skillId,
  name,
  description,
}: {
  skillId: string;
  name: string;
  description: string;
}) {
  const [accountName, setAccountName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [days, setDays] = useState('');
  const [limit, setLimit] = useState('5');
  const [outDir, setOutDir] = useState('~/Desktop/视频下载');
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState('');

  async function handleRun(e: React.MouseEvent) {
    e.stopPropagation();
    if (!accountName || !keyword) return;
    setStatus('running');
    setResult('');
    try {
      const res = await fetch('/api/skill/wxvideo-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountName, keyword, days: days ? Number(days) : undefined, limit: Number(limit), outDir }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('done');
        setResult(`✅ 下载完成：${data.count} 条视频\n保存至：${outDir}`);
      } else {
        setStatus('error');
        setResult(`❌ 失败：${data.error}`);
      }
    } catch (e: any) {
      setStatus('error');
      setResult(`❌ 请求失败：${e.message}`);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 6,
    color: '#e2e8f0',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 4,
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          ⬇
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{name}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{description}</div>
        </div>
      </div>

      {/* Form */}
      <div
        style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1, pointerEvents: 'all' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div>
          <label style={labelStyle}>账号名称 *</label>
          <input
            style={inputStyle}
            placeholder="如：大湾区之声"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>标题关键词 *</label>
          <input
            style={inputStyle}
            placeholder="如：李家超"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>最近N天</label>
            <input
              style={inputStyle}
              type="number"
              min={1}
              placeholder="不限"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>下载数量</label>
            <input
              style={inputStyle}
              type="number"
              min={1}
              max={20}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label style={labelStyle}>保存目录</label>
          <input
            style={inputStyle}
            placeholder="~/Desktop/视频下载"
            value={outDir}
            onChange={(e) => setOutDir(e.target.value)}
          />
        </div>

        {/* Run Button */}
        <button
          onClick={handleRun}
          disabled={!accountName || !keyword || status === 'running'}
          style={{
            padding: '10px 0',
            background:
              status === 'running'
                ? '#334155'
                : !accountName || !keyword
                  ? '#1e293b'
                  : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border: 'none',
            borderRadius: 8,
            color: !accountName || !keyword ? '#475569' : '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: !accountName || !keyword || status === 'running' ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {status === 'running' ? '⏳ 下载中...' : '▶ 运行下载'}
        </button>

        {/* Result */}
        {result && (
          <div
            style={{
              padding: '10px 12px',
              background: status === 'done' ? '#0f2a1a' : '#2a0f0f',
              border: `1px solid ${status === 'done' ? '#166534' : '#991b1b'}`,
              borderRadius: 8,
              fontSize: 12,
              color: status === 'done' ? '#4ade80' : '#f87171',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {result}
          </div>
        )}
      </div>
    </div>
  );
}
