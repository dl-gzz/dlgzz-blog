'use client';

import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { downloadBlob } from '../core/export';
import type { BoardShape } from '../core/types';
import {
  LEGACY_TOOLS_STORAGE_KEY,
  MAX_TOOLS_BYTES,
  TOOLS_STORAGE_KEY,
  type ToolTemplate,
  type ToolsLibrary,
  addTool,
  canSaveTool,
  createToolTemplate,
  emptyToolsLibrary,
  instantiateTool,
  loadToolsLibrary,
  mergeToolsLibrary,
  parseToolsLibrary,
  recoverLegacyTools,
  removeTool,
  renameTool,
  saveToolsLibrary,
  serializeToolsLibrary,
  toolTypeLabel,
} from './templates';

export type ToolsDockProps = {
  selectedShape: BoardShape | null;
  onInsert: (shape: BoardShape) => void;
  notify: (message: string) => void;
  className?: string;
  dockActions?: Array<{
    id: string;
    label: string;
    icon: string;
    onClick: () => void;
    active?: boolean;
  }>;
  drawingToolsOpen?: boolean;
};

const TOOL_ICONS: Record<string, string> = {
  preview_html: '🌐',
  ai_result: '📄',
  blog_post: '📝',
  skill: '⚡️',
  text: '🔤',
  note: '🗒️',
};

export default function ToolsDock({
  selectedShape,
  onInsert,
  notify,
  className = '',
  dockActions = [],
  drawingToolsOpen = false,
}: ToolsDockProps) {
  const [library, setLibrary] = useState<ToolsLibrary>(emptyToolsLibrary);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const [tooltip, setTooltip] = useState<{ label: string; x: number } | null>(
    null
  );
  const [hasLegacy, setHasLegacy] = useState(false);
  const [rename, setRename] = useState<{ id: string; name: string } | null>(
    null
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const managementRef = useRef<HTMLElement>(null);
  const managementButton = useRef<HTMLButtonElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const managementId = useId();
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    const refresh = () => {
      try {
        setLibrary(loadToolsLibrary(localStorage));
        setHasLegacy(!!localStorage.getItem(LEGACY_TOOLS_STORAGE_KEY));
        setFailed(false);
      } catch (error) {
        setFailed(true);
        notifyRef.current(
          error instanceof Error
            ? error.message
            : '工具库无法读取，未覆盖原记录。'
        );
      } finally {
        setReady(true);
      }
    };
    refresh();
    const changed = (event: StorageEvent) => {
      if (
        event.key === TOOLS_STORAGE_KEY ||
        event.key === LEGACY_TOOLS_STORAGE_KEY ||
        event.key === null
      )
        refresh();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);

  useEffect(() => {
    if (!managementOpen) return;
    managementRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !dockRef.current?.contains(event.target)
      ) {
        setManagementOpen(false);
        setRename(null);
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [managementOpen]);

  useEffect(() => {
    if (!rename?.id) return;
    renameInput.current?.focus();
    renameInput.current?.select();
  }, [rename?.id]);

  function mutate(change: (current: ToolsLibrary) => ToolsLibrary): boolean {
    if (!ready || failed) return false;
    try {
      const next = change(loadToolsLibrary(localStorage));
      saveToolsLibrary(next, localStorage);
      setLibrary(next);
      return true;
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : '保存工具失败，请检查浏览器存储空间。'
      );
      return false;
    }
  }

  function saveSelected() {
    if (!selectedShape) return;
    let added = false;
    if (
      mutate((current) => {
        const next = addTool(current, createToolTemplate(selectedShape));
        added = next !== current;
        return next;
      })
    )
      notify(
        added ? '已保存到 Dock，可点击图标重复使用。' : '这个工具已在 Dock 中。'
      );
  }

  async function importFile(file: File) {
    if (file.size > MAX_TOOLS_BYTES) {
      notify('工具库备份不能超过 2 MiB。');
      return;
    }
    try {
      const incoming = parseToolsLibrary(await file.text());
      let added = 0;
      if (
        mutate((current) => {
          const result = mergeToolsLibrary(current, incoming);
          added = result.added;
          return result.library;
        })
      ) {
        setManagementOpen(true);
        notify(`已导入 ${added} 个工具，重复项已跳过。`);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '导入工具失败。');
    }
  }

  function useTool(item: ToolTemplate) {
    try {
      setTooltip(null);
      onInsert(instantiateTool(item));
      setManagementOpen(false);
      setRename(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : '工具实例化失败。');
    }
  }

  function restoreLegacy() {
    let added = 0;
    let skipped = 0;
    if (
      mutate((current) => {
        const result = recoverLegacyTools(
          current,
          localStorage.getItem(LEGACY_TOOLS_STORAGE_KEY)
        );
        added = result.added;
        skipped = result.skipped;
        return result.library;
      })
    )
      notify(
        `已恢复 ${added} 个旧工具，跳过 ${skipped} 个重复或不兼容项。旧记录保持不变。`
      );
  }

  function backup() {
    try {
      downloadBlob(
        new Blob([serializeToolsLibrary(loadToolsLibrary(localStorage))], {
          type: 'application/json',
        }),
        '我的工具备份.json'
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : '备份失败。');
    }
  }

  function showTooltip(button: HTMLButtonElement, label: string) {
    const dock = dockRef.current?.getBoundingClientRect();
    if (!dock) return;
    const bounds = button.getBoundingClientRect();
    setTooltip({
      label,
      x: Math.max(
        56,
        Math.min(dock.width - 56, bounds.left + bounds.width / 2 - dock.left)
      ),
    });
  }

  function navigateDock(event: KeyboardEvent<HTMLElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)'
      )
    );
    const currentIndex = buttons.indexOf(event.target as HTMLButtonElement);
    if (currentIndex < 0 || !buttons.length) return;
    event.preventDefault();
    event.stopPropagation();
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (currentIndex +
              (event.key === 'ArrowRight' ? 1 : -1) +
              buttons.length) %
            buttons.length;
    buttons[index].focus();
    buttons[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function closeManagement() {
    setManagementOpen(false);
    setRename(null);
    managementButton.current?.focus();
  }

  const disabled = !ready || failed;
  const canSave = canSaveTool(selectedShape);
  return (
    <section
      ref={dockRef}
      className={`owb-tools-dock ${className}`}
      aria-label="工作台 Dock"
      data-board-interactive
      onKeyDown={(event) => {
        if (event.key === 'Escape' && managementOpen) {
          event.preventDefault();
          event.stopPropagation();
          closeManagement();
        }
      }}
    >
      {canSave && !drawingToolsOpen && !managementOpen && !tooltip && (
        <button
          type="button"
          className="owb-dock-save"
          disabled={disabled}
          onClick={saveSelected}
          aria-label="保存选中卡片到 Dock"
          title="保存选中卡片到 Dock"
        >
          📌 保存到 Dock
        </button>
      )}
      {tooltip && !managementOpen && (
        <div
          className="owb-dock-tooltip"
          style={{ left: tooltip.x }}
          aria-hidden="true"
        >
          {tooltip.label}
        </div>
      )}
      <nav
        className="owb-dock-scroll"
        aria-label="应用与工具"
        onKeyDown={navigateDock}
        onScroll={() => setTooltip(null)}
      >
        <div className="owb-dock-items">
          {dockActions.map((action) => (
            <div className="owb-dock-item" key={action.id}>
              <button
                type="button"
                className={`owb-dock-icon ${action.active ? 'is-dock-active' : ''}`}
                aria-label={action.label}
                title={action.label}
                aria-pressed={Boolean(action.active)}
                onClick={() => {
                  setTooltip(null);
                  setManagementOpen(false);
                  setRename(null);
                  action.onClick();
                }}
                onMouseEnter={(event) =>
                  showTooltip(event.currentTarget, action.label)
                }
                onMouseLeave={() => setTooltip(null)}
                onFocus={(event) =>
                  showTooltip(event.currentTarget, action.label)
                }
                onBlur={() => setTooltip(null)}
              >
                <span aria-hidden="true">{action.icon}</span>
              </button>
              {action.active && (
                <span className="owb-dock-active-dot" aria-hidden="true" />
              )}
            </div>
          ))}
          {library.items.length > 0 && dockActions.length > 0 && (
            <div className="owb-dock-separator" aria-hidden="true" />
          )}
          {library.items.map((item) => (
            <div className="owb-dock-item" key={item.id}>
              <button
                type="button"
                className="owb-dock-icon"
                aria-label={`使用工具：${item.name}`}
                title={`使用工具：${item.name}`}
                onClick={() => useTool(item)}
                onMouseEnter={(event) =>
                  showTooltip(event.currentTarget, item.name)
                }
                onMouseLeave={() => setTooltip(null)}
                onFocus={(event) => showTooltip(event.currentTarget, item.name)}
                onBlur={() => setTooltip(null)}
              >
                <span aria-hidden="true">{TOOL_ICONS[item.type] || '📌'}</span>
              </button>
            </div>
          ))}
          <div className="owb-dock-manage-item">
            <button
              ref={managementButton}
              type="button"
              className="owb-dock-manage"
              aria-label="管理我的工具"
              title="管理我的工具（重命名、移除、导入和备份）"
              aria-expanded={managementOpen}
              aria-controls={managementId}
              onClick={() => {
                setTooltip(null);
                setManagementOpen(!managementOpen);
              }}
              onMouseEnter={(event) =>
                showTooltip(event.currentTarget, '管理我的工具')
              }
              onMouseLeave={() => setTooltip(null)}
              onFocus={(event) =>
                showTooltip(event.currentTarget, '管理我的工具')
              }
              onBlur={() => setTooltip(null)}
            >
              <span aria-hidden="true">⋯</span>
            </button>
          </div>
        </div>
      </nav>
      {managementOpen && (
        <section
          ref={managementRef}
          id={managementId}
          className="owb-dock-management"
          aria-label="Dock 工具管理"
        >
          <header className="owb-dock-management-header">
            <div>
              <strong>我的工具</strong>
              <span>{library.items.length} 个 · 仅存当前浏览器</span>
            </div>
            <button
              type="button"
              aria-label="关闭 Dock 管理"
              title="关闭 Dock 管理"
              onClick={closeManagement}
            >
              ×
            </button>
          </header>
          <button
            type="button"
            className="owb-dock-management-save"
            disabled={disabled || !canSave}
            onClick={saveSelected}
            title={
              canSave
                ? '保存选中卡片到 Dock'
                : '先选中 HTML、文字、便签、文章或 Skill 卡片'
            }
          >
            📌 保存选中卡片到 Dock
          </button>
          {failed ? (
            <p className="owb-dock-empty" role="alert">
              工具库无法读取，未覆盖原记录。请检查浏览器存储权限或先备份现有数据。
            </p>
          ) : library.items.length === 0 ? (
            <p className="owb-dock-empty">
              把常用的 HTML、文字、文章和 Skill 卡片保存到
              Dock，下次点击图标即可复用。
            </p>
          ) : (
            <ul className="owb-dock-library">
              {library.items.map((item) => (
                <li key={item.id}>
                  <span className="owb-dock-library-icon" aria-hidden="true">
                    {TOOL_ICONS[item.type] || '📌'}
                  </span>
                  <div className="owb-dock-library-name">
                    <strong title={item.name}>{item.name}</strong>
                    <small>{toolTypeLabel(item.type)}</small>
                  </div>
                  <button
                    type="button"
                    aria-label={`重命名工具：${item.name}`}
                    title={`重命名工具：${item.name}`}
                    onClick={() => setRename({ id: item.id, name: item.name })}
                  >
                    改名
                  </button>
                  <button
                    type="button"
                    className="owb-dock-remove"
                    aria-label={`移除工具：${item.name}`}
                    title={`仅从 Dock 移除“${item.name}”，保留白板卡片`}
                    onClick={() => {
                      if (mutate((current) => removeTool(current, item.id))) {
                        if (rename?.id === item.id) setRename(null);
                        notify(
                          `已从 Dock 移除“${item.name}”，白板上的卡片不受影响。`
                        );
                      }
                    }}
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
          )}
          {rename && (
            <form
              className="owb-dock-rename"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  mutate((current) =>
                    renameTool(current, rename.id, rename.name)
                  )
                )
                  setRename(null);
              }}
            >
              <input
                ref={renameInput}
                aria-label="工具名称"
                maxLength={60}
                value={rename.name}
                onChange={(event) =>
                  setRename({ ...rename, name: event.target.value })
                }
              />
              <button type="submit">保存名称</button>
              <button type="button" onClick={() => setRename(null)}>
                取消
              </button>
            </form>
          )}
          <footer className="owb-dock-management-actions">
            <div>
              {hasLegacy && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={restoreLegacy}
                  title="恢复旧白板保存的工具，保留原始数据并跳过重复项"
                >
                  恢复旧工具
                </button>
              )}
              <button
                type="button"
                disabled={disabled}
                title="导入工具库 JSON，合并并跳过重复项"
                onClick={() => fileInput.current?.click()}
              >
                导入
              </button>
              <button
                type="button"
                disabled={disabled || !library.items.length}
                title="导出我的工具 JSON 备份"
                onClick={backup}
              >
                备份
              </button>
            </div>
          </footer>
        </section>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        aria-label="导入工具库备份"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void importFile(file);
        }}
      />
    </section>
  );
}
